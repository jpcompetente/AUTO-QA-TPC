"""
Centralized application configuration for the AUTO-QA-TPC inference system.
Consolidates settings from Django settings.py and provides unified config object.
"""
from typing import Dict, Any
from django.conf import settings


class AppConfig:
    """Unified application configuration matching reference architecture."""

    # ═══════════════════════════════════════════════════════════════════════════
    # INFERENCE PIPELINE CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════

    # Flask Inference Server (backend processor)
    INFERENCE_SERVER_URL = getattr(
        settings, "INFERENCE_SERVER_URL", "http://127.0.0.1:8091"
    )
    INFERENCE_TIMEOUT_SECONDS = float(
        getattr(settings, "INFERENCE_TIMEOUT_SECONDS", 10.0)
    )

    # Model defaults
    INFERENCE_DEFAULT_MODEL_NAME = getattr(
        settings, "INFERENCE_DEFAULT_MODEL_NAME", "yolo26_emsd_v1"
    )
    INFERENCE_DEFAULT_WEIGHTS = getattr(
        settings,
        "INFERENCE_DEFAULT_WEIGHTS",
        "models/weights/tpcyolov26nv21gs_emsd.pt",
    )

    # YOLO26 EMSD inference thresholds
    YOLO26_EMSD_CONFIG = {
        "confidence_threshold": float(
            getattr(settings, "INFERENCE_CONFIDENCE_THRESHOLD", 0.5)
        ),
        "iou_threshold": float(
            getattr(settings, "INFERENCE_IOU_THRESHOLD", 0.45)
        ),
        "cache_enabled": getattr(settings, "INFERENCE_CACHE_ENABLED", True),
        "cache_max_entries": int(
            getattr(settings, "INFERENCE_CACHE_MAX_ENTRIES", 256)
        ),
        "timeout_seconds": INFERENCE_TIMEOUT_SECONDS,
        "max_retries": 3,
    }

    # Model endpoints mapping
    INFERENCE_MODEL_ENDPOINTS = getattr(
        settings,
        "INFERENCE_MODEL_ENDPOINTS",
        {INFERENCE_DEFAULT_MODEL_NAME: INFERENCE_SERVER_URL},
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ANNOTATION OVERLAY CONFIGURATION (matches reference app styling)
    # ═══════════════════════════════════════════════════════════════════════════

    # Mask overlay styling (OpenCV BGR format)
    OVERLAY_COLOR = (35, 185, 255)  # Orange/yellow (BGR)
    MASK_ALPHA = 0.30  # Semi-transparent (30% opacity)

    # Contour styling (OpenCV BGR format)
    CONTOUR_COLOR = (30, 110, 255)  # Blue (BGR)
    CONTOUR_THICKNESS = 2

    # Bounding box styling (OpenCV BGR format)
    BBOX_COLOR = (35, 185, 255)  # Orange (BGR)
    BBOX_THICKNESS = 2

    # Text label styling
    TEXT_FONT = "HERSHEY_SIMPLEX"
    TEXT_FONT_SCALE = 0.52
    TEXT_COLOR = (35, 185, 255)  # Orange (BGR)
    TEXT_THICKNESS = 2
    TEXT_MARGIN = 8  # Pixels above bbox

    # Detection label colors (for live display)
    LABEL_SCRATCH_COLOR = (0, 0, 255)  # Red (BGR)
    LABEL_INTACT_COLOR = (0, 255, 0)  # Green (BGR)

    # ═══════════════════════════════════════════════════════════════════════════
    # MOTION DETECTION & LIVE INFERENCE CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════

    # Motion detection sensitivity
    MOTION_THRESHOLD = 9  # For auto-capture stable frame detection (sensitive)
    LIVE_MOTION_THRESHOLD = 20  # For live inference (filters compression noise)

    # Sampling intervals (milliseconds)
    MOTION_SAMPLE_INTERVAL_MS = 250  # Check motion every 250ms
    LIVE_INFERENCE_INTERVAL_MS = 1500  # Send live inference every 1500ms
    STABLE_CAPTURE_DELAY_MS = 2000  # Wait 2s for stable frame before capture

    # ═══════════════════════════════════════════════════════════════════════════
    # CACHING & PERFORMANCE
    # ═══════════════════════════════════════════════════════════════════════════

    INFERENCE_CACHE_ENABLED = YOLO26_EMSD_CONFIG["cache_enabled"]
    INFERENCE_CACHE_MAX_ENTRIES = YOLO26_EMSD_CONFIG["cache_max_entries"]

    # Django database connection pooling
    DB_CONN_MAX_AGE = int(
        getattr(settings, "DB_CONN_MAX_AGE", 600)
    )  # 10 minutes

    # ═══════════════════════════════════════════════════════════════════════════
    # RETRY & RESILIENCE CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════

    # Exponential backoff for HTTP retries
    RETRY_BACKOFF_SCHEDULE = (0.5, 1.0, 1.5)  # Delays: 500ms, 1s, 1.5s
    RETRY_MAX_ATTEMPTS = 3

    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary for logging/debugging."""
        return {
            "inference_server_url": cls.INFERENCE_SERVER_URL,
            "default_model": cls.INFERENCE_DEFAULT_MODEL_NAME,
            "confidence_threshold": cls.YOLO26_EMSD_CONFIG["confidence_threshold"],
            "iou_threshold": cls.YOLO26_EMSD_CONFIG["iou_threshold"],
            "cache_enabled": cls.INFERENCE_CACHE_ENABLED,
            "cache_max_entries": cls.INFERENCE_CACHE_MAX_ENTRIES,
            "motion_threshold": cls.MOTION_THRESHOLD,
            "live_motion_threshold": cls.LIVE_MOTION_THRESHOLD,
        }
