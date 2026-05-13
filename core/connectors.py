import logging
import time
from typing import Any

import requests

from .config import AppConfig

logger = logging.getLogger(__name__)


class InferenceConnectorError(Exception):
    """Raised when the remote inference service cannot complete a request."""


class InferenceServerClient:
    """
    REST API client for Flask inference server.
    Implements health checks, exponential backoff retry, and request pooling.
    Matches reference architecture pattern.
    """

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float | None = None,
        backoff_seconds: tuple[float, ...] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds or AppConfig.INFERENCE_TIMEOUT_SECONDS
        self.backoff_seconds = backoff_seconds or AppConfig.RETRY_BACKOFF_SCHEDULE
        self.session = requests.Session()
        self.session.trust_env = False
        self._is_healthy = True
        self._health_check_attempted = False

    def health_check(self) -> dict[str, Any]:
        """Check if inference server is responsive."""
        try:
            response = self.session.get(
                f"{self.base_url}/health",
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            self._is_healthy = True
            self._health_check_attempted = True
            return response.json()
        except Exception as exc:
            logger.warning("Health check failed for %s: %s", self.base_url, exc)
            self._is_healthy = False
            self._health_check_attempted = True
            return {"status": "unavailable", "error": str(exc)}

    def predict(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        model_name: str,
        confidence: float,
        iou: float,
    ) -> dict[str, Any]:
        """
        POST image to inference server with exponential backoff retry.
        
        Implements:
        - Health check before first attempt
        - Retry logic with exponential backoff (0.5s, 1s, 1.5s)
        - Timeout protection
        - Detailed error logging
        """
        # Ensure health check has been attempted
        if not self._health_check_attempted:
            self.health_check()

        if not self._is_healthy:
            raise InferenceConnectorError(
                f"Inference server at {self.base_url} is unavailable (health check failed)"
            )

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
                logger.debug(
                    "Inference retry attempt %s after %.2fs delay",
                    attempt_index,
                    delay,
                )
                time.sleep(delay)

            try:
                response = self.session.post(
                    f"{self.base_url}/predict",
                    data=data,
                    files=files,
                    timeout=self.timeout_seconds,
                )

                # Service temporarily unavailable - retry
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
                    "Inference request attempt %s failed (timeout/connection) for %s: %s",
                    attempt_index,
                    model_name,
                    exc,
                )
                if attempt_index >= len(self.backoff_seconds) + 1:
                    raise InferenceConnectorError(
                        f"Inference service unavailable after {attempt_index} attempts"
                    ) from exc
                continue

            except requests.RequestException as exc:
                logger.error(
                    "Inference request attempt %s failed (HTTP error) for %s: %s",
                    attempt_index,
                    model_name,
                    exc,
                )
                raise InferenceConnectorError(str(exc)) from exc

        raise InferenceConnectorError(
            f"Inference service unavailable after {len(self.backoff_seconds) + 1} attempts"
        )
