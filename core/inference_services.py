import hashlib
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from typing import Any

from django.conf import settings

from .connectors import InferenceConnectorError, InferenceServerClient

logger = logging.getLogger(__name__)


@dataclass
class InferenceMetrics:
    cache_hits: int = 0
    successful_inferences: int = 0
    total_latency_ms: float = 0.0


@dataclass
class InferenceResult:
    success: bool
    system_decision: str = "PASS"
    confidence: float = 0.0
    detections: list[dict[str, Any]] = field(default_factory=list)
    latency_ms: float = 0.0
    num_detections: int = 0
    cache_hit: bool = False
    model_name: str = ""
    image_hash: str = ""
    error: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)
    auto_capture_path: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ResultCache:
    def __init__(self, max_entries: int = 256) -> None:
        self.max_entries = max_entries
        self._cache: OrderedDict[str, InferenceResult] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> InferenceResult | None:
        with self._lock:
            value = self._cache.get(key)
            if value is None:
                return None
            self._cache.move_to_end(key)
            return value

    def set(self, key: str, value: InferenceResult) -> None:
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            while len(self._cache) > self.max_entries:
                self._cache.popitem(last=False)


class RemoteInferenceService:
    def __init__(self, model_name: str, endpoint_url: str) -> None:
        self.model_name = model_name
        self.client = InferenceServerClient(
            endpoint_url,
            timeout_seconds=getattr(settings, "INFERENCE_TIMEOUT_SECONDS", 10.0),
        )

    def health_check(self) -> dict[str, Any]:
        return self.client.health_check()

    def predict(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        confidence: float,
        iou: float,
        image_hash: str,
    ) -> InferenceResult:
        payload = self.client.predict(
            image_bytes=image_bytes,
            filename=filename,
            model_name=self.model_name,
            confidence=confidence,
            iou=iou,
        )

        detections = payload.get("detections", [])
        scratch_detected = any(
            detection.get("label") == "SCRATCH" for detection in detections
        )
        avg_confidence = payload.get("confidence")
        if avg_confidence is None:
            scores = [float(item.get("confidence", 0.0)) for item in detections]
            avg_confidence = sum(scores) / len(scores) if scores else 0.0

        return InferenceResult(
            success=True,
            system_decision="FAIL" if scratch_detected else "PASS",
            confidence=round(float(avg_confidence), 4),
            detections=detections,
            latency_ms=round(float(payload.get("latency_ms", 0.0)), 2),
            num_detections=len(detections),
            model_name=self.model_name,
            image_hash=image_hash,
        )


class InferenceFactory:
    _instances: dict[str, RemoteInferenceService] = {}
    _lock = threading.Lock()

    @classmethod
    def get_service(cls, model_name: str) -> RemoteInferenceService:
        endpoints = getattr(settings, "INFERENCE_MODEL_ENDPOINTS", {})
        endpoint_url = endpoints.get(
            model_name,
            getattr(settings, "INFERENCE_SERVER_URL", "http://127.0.0.1:8091"),
        )
        cache_key = f"{model_name}:{endpoint_url}"

        with cls._lock:
            if cache_key not in cls._instances:
                cls._instances[cache_key] = RemoteInferenceService(model_name, endpoint_url)
            return cls._instances[cache_key]


class InferenceOrchestrator:
    def __init__(self) -> None:
        self.cache = ResultCache(getattr(settings, "INFERENCE_CACHE_MAX_ENTRIES", 256))
        self.metrics = InferenceMetrics()
        self._metrics_lock = threading.Lock()

    def _cache_key(
        self,
        *,
        image_hash: str,
        model_name: str,
        confidence: float,
        iou: float,
    ) -> str:
        return f"{model_name}:{image_hash}:conf={confidence:.4f}:iou={iou:.4f}"

    def infer(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        model_name: str,
        confidence: float,
        iou: float,
    ) -> InferenceResult:
        start_time = time.perf_counter()
        image_hash = hashlib.md5(image_bytes).hexdigest()
        cache_key = self._cache_key(
            image_hash=image_hash,
            model_name=model_name,
            confidence=confidence,
            iou=iou,
        )

        cached = self.cache.get(cache_key)
        if cached is not None:
            latency_ms = (time.perf_counter() - start_time) * 1000
            with self._metrics_lock:
                self.metrics.cache_hits += 1
                self.metrics.successful_inferences += 1
                self.metrics.total_latency_ms += latency_ms
            result = InferenceResult(**cached.to_dict())
            result.cache_hit = True
            result.latency_ms = round(latency_ms, 2)
            result.metrics = self.snapshot_metrics()
            return result

        try:
            service = InferenceFactory.get_service(model_name)
            result = service.predict(
                image_bytes=image_bytes,
                filename=filename,
                confidence=confidence,
                iou=iou,
                image_hash=image_hash,
            )
        except InferenceConnectorError as exc:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error("Inference service unavailable: %s", exc)
            return InferenceResult(
                success=False,
                system_decision="PASS",
                latency_ms=round(latency_ms, 2),
                model_name=model_name,
                image_hash=image_hash,
                error="Service Unavailable",
                metrics=self.snapshot_metrics(),
            )

        total_latency_ms = (time.perf_counter() - start_time) * 1000
        result.latency_ms = round(total_latency_ms, 2)
        self.cache.set(cache_key, result)

        with self._metrics_lock:
            self.metrics.successful_inferences += 1
            self.metrics.total_latency_ms += total_latency_ms
        result.metrics = self.snapshot_metrics()
        return result

    def snapshot_metrics(self) -> dict[str, Any]:
        with self._metrics_lock:
            successful = self.metrics.successful_inferences
            return {
                "cache_hits": self.metrics.cache_hits,
                "successful_inferences": successful,
                "total_latency_ms": round(self.metrics.total_latency_ms, 2),
                "avg_latency_ms": round(
                    self.metrics.total_latency_ms / successful,
                    2,
                )
                if successful
                else 0.0,
            }


orchestrator = InferenceOrchestrator()
