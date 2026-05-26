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

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ai_ins_sys.settings")
django.setup()

from django.conf import settings  # noqa: E402
from core.models import AIModel  # noqa: E402

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - lets /health report dependency state.
    YOLO = None

logger = logging.getLogger(__name__)
app = Flask(__name__)


class EMSDWrapper:
    def __init__(self, weights_path: str) -> None:
        if YOLO is None:
            raise RuntimeError("ultralytics is not installed")
        self.weights_path = weights_path
        self.model = YOLO(weights_path)
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
        # Enable segmentation with task='segment' to get instance masks
        results = self.model.predict(frame, conf=confidence, iou=iou, task='segment', verbose=False)
        latency_ms = (time.perf_counter() - start_time) * 1000

        detections: list[dict[str, Any]] = []
        scores: list[float] = []

        for result in results:
            masks = result.masks.data.cpu().numpy() if result.masks is not None else []
            boxes = result.boxes if result.boxes is not None else []
            
            # Log mask availability for debugging
            logger.info(f"Inference result: {len(boxes)} boxes detected, masks available: {result.masks is not None}, mask count: {len(masks)}")

            for index, box in enumerate(boxes):
                class_id = int(box.cls.item())
                score = float(box.conf.item())
                xyxy = [float(value) for value in box.xyxy.cpu().numpy()[0].tolist()]
                mask_polygon = []
                if index < len(masks):
                    mask_polygon = self._mask_polygon(masks[index], width, height)
                    logger.info(f"  Detection {index}: {self.names.get(class_id)} - mask polygon points: {len(mask_polygon)}")
                else:
                    logger.warning(f"  Detection {index}: {self.names.get(class_id)} - NO MASK DATA (index {index} >= mask count {len(masks)})")

                scores.append(score)
                
                # Fallback: if no mask polygon, create one from bbox for visualization
                if not mask_polygon:
                    x1, y1, x2, y2 = xyxy
                    mask_polygon = [
                        [int(x1), int(y1)],
                        [int(x2), int(y1)],
                        [int(x2), int(y2)],
                        [int(x1), int(y2)],
                    ]
                
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
def health() -> tuple[Any, int]:
    return jsonify(
        {
            "status": "ok" if YOLO is not None else "degraded",
            "service": "emsd-yolo26-inference",
            "loaded_models": list(registry._models.keys()),
            "ultralytics_available": YOLO is not None,
        }
    ), 200 if YOLO is not None else 503


@app.post("/predict")
def predict() -> tuple[Any, int]:
    if YOLO is None:
        return jsonify({"success": False, "error": "ultralytics unavailable"}), 503

    image_file = request.files.get("image")
    if image_file is None:
        return jsonify({"success": False, "error": "image file is required"}), 400

    model_name = request.form.get("model_name") or "yolo26_emsd_v1"
    confidence = float(request.form.get("confidence", 0.5))
    iou = float(request.form.get("iou", 0.45))

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
        return jsonify({"success": False, "error": str(exc)}), 503
    except Exception as exc:
        logger.exception("Prediction failed")
        return jsonify({"success": False, "error": str(exc)}), 500


if __name__ == "__main__":
    host = os.getenv("INFERENCE_SERVER_HOST", "127.0.0.1")
    port = int(os.getenv("INFERENCE_SERVER_PORT", "8091"))
    app.run(host=host, port=port)
