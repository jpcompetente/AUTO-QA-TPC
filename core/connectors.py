import logging
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)


class InferenceConnectorError(Exception):
    """Raised when the remote inference service cannot complete a request."""


class InferenceServerClient:
    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 10.0,
        backoff_seconds: tuple[float, ...] = (0.5, 1.0, 1.5),
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.backoff_seconds = backoff_seconds
        self.session = requests.Session()
        self.session.trust_env = False
<<<<<<< HEAD
        self._is_healthy = True
        self._health_check_attempted = False
=======
>>>>>>> a7bb7a8f8efcf2c1d50f204e2c8eefcd951825de

    def health_check(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/health",
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def predict(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        model_name: str,
        confidence: float,
        iou: float,
    ) -> dict[str, Any]:
        files = {
            "image": (filename or "frame.png", image_bytes, "image/png"),
        }
        data = {
            "model_name": model_name,
            "confidence": str(confidence),
            "iou": str(iou),
        }

        for attempt_index, delay in enumerate((0.0, *self.backoff_seconds), start=1):
            if delay:
                time.sleep(delay)

            try:
                response = self.session.post(
                    f"{self.base_url}/predict",
                    data=data,
                    files=files,
                    timeout=self.timeout_seconds,
                )

                if response.status_code == 503:
                    logger.warning(
                        "Inference server returned 503 on attempt %s for %s",
                        attempt_index,
                        model_name,
                    )
                    continue

                response.raise_for_status()
                return response.json()
            except (requests.Timeout, requests.ConnectionError) as exc:
                logger.warning(
                    "Inference request attempt %s failed for %s: %s",
                    attempt_index,
                    model_name,
                    exc,
                )
                continue
            except requests.RequestException as exc:
                raise InferenceConnectorError(str(exc)) from exc

        raise InferenceConnectorError("Inference service unavailable after retries")
