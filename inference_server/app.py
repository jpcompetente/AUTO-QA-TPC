import asyncio
import base64
import io
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import django
import numpy as np
from asgiref.sync import sync_to_async
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.concurrency import run_in_threadpool

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ai_ins_sys.settings")
django.setup()

from django.conf import settings  # noqa: E402
from core.config import AppConfig  # noqa: E402
from core.models import AIModel  # noqa: E402

try:
    from ultralytics import YOLO
    from ultralytics.nn.modules import block as ultralytics_block
    from ultralytics.nn.modules import head as ultralytics_head
except Exception:  # pragma: no cover - lets /health report dependency state.
    YOLO = None
    ultralytics_block = None
    ultralytics_head = None

logger = logging.getLogger(__name__)
app = FastAPI(title="EMSD YOLO26 Inference", version="1.0.0")

REQUEST_TIMEOUT_SECONDS = float(os.getenv("INFERENCE_REQUEST_TIMEOUT_SECONDS", "30"))
MODEL_CACHE_SIZE = int(os.getenv("INFERENCE_MODEL_CACHE_SIZE", "2"))


@app.middleware("http")
async def request_timeout_middleware(request, call_next):
    if REQUEST_TIMEOUT_SECONDS <= 0:
        return await call_next(request)

    try:
        return await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=504,
            content={
                "success": False,
                "error": f"Request exceeded {REQUEST_TIMEOUT_SECONDS:.1f}s timeout",
            },
        )


def _install_ultralytics_legacy_aliases() -> None:
    """Provide class aliases for older custom checkpoints (for example Segment26)."""
    if ultralytics_block is not None:
        if not hasattr(ultralytics_block, "Proto26") and hasattr(ultralytics_block, "Proto"):
            ultralytics_block.Proto26 = ultralytics_block.Proto
            logger.info("Registered ultralytics compatibility alias: Proto26 -> Proto")

    if ultralytics_head is None:
        return
    if not hasattr(ultralytics_head, "Segment26") and hasattr(ultralytics_head, "Segment"):
        ultralytics_head.Segment26 = ultralytics_head.Segment
        logger.info("Registered ultralytics compatibility alias: Segment26 -> Segment")


def _overlay_mask_and_detections(
    rgb: np.ndarray,
    mask: np.ndarray | None,
    detections: list,
) -> np.ndarray:
    """Render detection masks and bounding boxes on an RGB image."""
    output = rgb.copy()

    if mask is not None and np.count_nonzero(mask) > 0:
        overlay = np.zeros_like(output)
        overlay[:, :] = AppConfig.OVERLAY_COLOR
        mask_3ch = np.stack([mask] * 3, axis=-1) > 0
        alpha = AppConfig.MASK_ALPHA
        output[mask_3ch] = (
            output[mask_3ch] * (1 - alpha) + overlay[mask_3ch] * alpha
        ).astype(np.uint8)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(
            output,
            contours,
            -1,
            AppConfig.CONTOUR_COLOR,
            AppConfig.CONTOUR_THICKNESS,
        )

    for det in detections:
        bbox = det.get("bbox", [])
        if len(bbox) != 4:
            continue

        x1, y1, x2, y2 = [int(v) for v in bbox]
        label = det.get("label", "SCRATCH")
        conf = float(det.get("confidence", 0.0))

        cv2.rectangle(output, (x1, y1), (x2, y2), AppConfig.BBOX_COLOR, AppConfig.BBOX_THICKNESS)

        text = f"{label} {conf * 100:.1f}%"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = AppConfig.TEXT_FONT_SCALE
        thickness = AppConfig.TEXT_THICKNESS
        text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
        text_x = x1
        text_y = max(20, y1 - AppConfig.TEXT_MARGIN)

        cv2.rectangle(
            output,
            (text_x, text_y - text_size[1] - 4),
            (text_x + text_size[0] + 4, text_y + 4),
            AppConfig.BBOX_COLOR,
            -1,
        )

        cv2.putText(
            output,
            text,
            (text_x + 2, text_y - 2),
            font,
            font_scale,
            (255, 255, 255),
            thickness,
        )

    return output


def _load_image(image_bytes: bytes) -> Image.Image:
    with Image.open(io.BytesIO(image_bytes)) as image:
        return image.convert("RGB")


def _encode_annotated_image(image_array: np.ndarray) -> str:
    annotated_pil = Image.fromarray(image_array)
    png_bytes = io.BytesIO()
    annotated_pil.save(png_bytes, format="PNG")
    png_bytes.seek(0)
    return base64.b64encode(png_bytes.getvalue()).decode("utf-8").replace("\n", "").replace("\r", "")


class EMSDWrapper:
    def __init__(self, weights_path: str) -> None:
        if YOLO is None:
            raise RuntimeError("ultralytics is not installed")
        self.weights_path = weights_path
        _install_ultralytics_legacy_aliases()
        try:
            self.model = YOLO(weights_path)
        except AttributeError as exc:
            if "Segment26" in str(exc) or "Proto26" in str(exc):
                raise RuntimeError(
                    "Model checkpoint requires legacy YOLO26 modules that are unavailable in this ultralytics build"
                ) from exc
            raise
        self.names = self.model.names or {}

    def _label_for(self, class_id: int) -> str:
        class_name = str(self.names.get(class_id, class_id)).lower()
        if any(token in class_name for token in ("intact", "ok", "good", "pass")):
            return "INTACT"
        if any(token in class_name for token in ("scratch", "defect", "damage", "fail")):
            return "SCRATCH"
        return "SCRATCH"

    def _mask_polygon(self, mask: np.ndarray, width: int, height: int) -> list[list[int]]:
        resized = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
        binary = (resized > 0.5).astype(np.uint8) * 255
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []
        contour = max(contours, key=cv2.contourArea)
        epsilon = 0.002 * cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, epsilon, True)
        return polygon.reshape(-1, 2).astype(int).tolist()

    def predict(self, image: Image.Image, confidence: float, iou: float) -> dict[str, Any]:
        width, height = image.size
        frame = np.array(image.convert("RGB"))
        start_time = time.perf_counter()
        results = self.model.predict(frame, conf=confidence, iou=iou, task="segment", verbose=False)
        latency_ms = (time.perf_counter() - start_time) * 1000

        detections: list[dict[str, Any]] = []
        scores: list[float] = []

        for result in results:
            masks = result.masks.data.cpu().numpy() if result.masks is not None else []
            boxes = result.boxes if result.boxes is not None else []

            logger.info(
                "Inference result: %s boxes detected, masks available: %s, mask count: %s",
                len(boxes),
                result.masks is not None,
                len(masks),
            )

            for index, box in enumerate(boxes):
                class_id = int(box.cls.item())
                score = float(box.conf.item())
                xyxy = [float(value) for value in box.xyxy.cpu().numpy()[0].tolist()]
                mask_polygon = []

                if index < len(masks):
                    mask_polygon = self._mask_polygon(masks[index], width, height)
                    logger.info(
                        "  Detection %s: %s - mask polygon points: %s",
                        index,
                        self.names.get(class_id),
                        len(mask_polygon),
                    )
                else:
                    logger.warning(
                        "  Detection %s: %s - NO MASK DATA (index %s >= mask count %s)",
                        index,
                        self.names.get(class_id),
                        index,
                        len(masks),
                    )

                scores.append(score)

                if not mask_polygon:
                    x1, y1, x2, y2 = xyxy
                    x1 = max(0, min(int(round(x1)), width - 1))
                    y1 = max(0, min(int(round(y1)), height - 1))
                    x2 = max(0, min(int(round(x2)), width - 1))
                    y2 = max(0, min(int(round(y2)), height - 1))
                    mask_polygon = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

                detections.append(
                    {
                        "bbox": xyxy,
                        "confidence": round(score, 4),
                        "class_id": class_id,
                        "class_name": str(self.names.get(class_id, class_id)),
                        "label": self._label_for(class_id),
                        "mask": {
                            "polygon": mask_polygon,
                            "width": width,
                            "height": height,
                        },
                    }
                )

        return {
            "success": True,
            "detections": detections,
            "confidence": round(sum(scores) / len(scores), 4) if scores else 0.0,
            "latency_ms": round(latency_ms, 2),
            "image_size": {"width": width, "height": height},
        }


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, EMSDWrapper] = {}
        self._model_order: list[str] = []

    async def _weights_for(self, model_name: str) -> str:
        # Use sync_to_async to safely query the database from async context
        @sync_to_async
        def get_model_weights():
            model = AIModel.objects.filter(name=model_name).order_by("-is_active", "-created_at").first()
            if model:
                file_field = model.file_path_pt or model.file_path_onnx or model.file_path_engine
                if file_field:
                    storage_path = Path(settings.MEDIA_ROOT) / file_field.name
                    if storage_path.exists():
                        return str(storage_path)

                    repo_weights_path = Path(settings.BASE_DIR) / "models" / "weights" / Path(file_field.name).name
                    if repo_weights_path.exists():
                        return str(repo_weights_path)

            default_path = getattr(settings, "INFERENCE_DEFAULT_WEIGHTS", "")
            if default_path:
                return str(default_path)
            return str(Path(settings.BASE_DIR) / "models" / "weights" / "tpcyolov26nv21gs_emsd.pt")

        return await get_model_weights()

    async def get(self, model_name: str) -> EMSDWrapper:
        if model_name in self._models:
            if model_name in self._model_order:
                self._model_order.remove(model_name)
            self._model_order.append(model_name)
            return self._models[model_name]

        weights_path = await self._weights_for(model_name)
        if not os.path.exists(weights_path):
            raise FileNotFoundError(f"Model weights not found: {weights_path}")

        if len(self._models) >= MODEL_CACHE_SIZE and self._model_order:
            evicted_model = self._model_order.pop(0)
            self._models.pop(evicted_model, None)
            logger.info("Evicted cached model: %s", evicted_model)

        self._models[model_name] = EMSDWrapper(weights_path)
        self._model_order.append(model_name)
        return self._models[model_name]


registry = ModelRegistry()


@app.get("/health")
async def health() -> JSONResponse:
    payload = {
        "status": "ok" if YOLO is not None else "degraded",
        "service": "emsd-yolo26-inference",
        "loaded_models": list(registry._models.keys()),
        "ultralytics_available": YOLO is not None,
    }
    return JSONResponse(payload, status_code=200 if YOLO is not None else 503)


@app.post("/predict")
async def predict(
    image: UploadFile | None = File(default=None),
    model_name: str = Form(default="yolo26_emsd_v1"),
    confidence: float = Form(default=0.5),
    iou: float = Form(default=0.45),
) -> JSONResponse:
    if YOLO is None:
        return JSONResponse({"success": False, "error": "ultralytics unavailable"}, status_code=503)

    if image is None:
        raise HTTPException(status_code=400, detail="image file is required")

    image_bytes = await image.read()

    try:
        pil_image = await run_in_threadpool(_load_image, image_bytes)
        model_wrapper = await registry.get(model_name)
        result = await run_in_threadpool(model_wrapper.predict, pil_image, confidence, iou)

        if result.get("success"):
            frame_rgb = np.array(pil_image)
            annotated_frame = await run_in_threadpool(
                _overlay_mask_and_detections,
                frame_rgb,
                None,
                result.get("detections", []),
            )
            annotated_b64 = await run_in_threadpool(_encode_annotated_image, annotated_frame)
            result["annotated_image_b64"] = annotated_b64
            logger.info(
                "Rendered annotations for %s detections, base64 size: %s",
                len(result.get("detections", [])),
                len(annotated_b64),
            )

        return JSONResponse(result, status_code=200)
    except FileNotFoundError as exc:
        logger.exception("Model weights unavailable")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=503)
    except RuntimeError as exc:
        logger.exception("Model initialization failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=503)
    except Exception as exc:
        logger.exception("Prediction failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("INFERENCE_SERVER_HOST", "127.0.0.1")
    port = int(os.getenv("INFERENCE_SERVER_PORT", "8091"))
    uvicorn.run("inference_server.app:app", host=host, port=port, reload=False)
