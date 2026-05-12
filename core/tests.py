from django.test import SimpleTestCase

from core.config import AppConfig


class AppConfigSmokeTests(SimpleTestCase):
    def test_inference_defaults_are_configured(self):
        self.assertEqual(AppConfig.YOLO26_EMSD_CONFIG["confidence_threshold"], 0.5)
        self.assertEqual(AppConfig.YOLO26_EMSD_CONFIG["iou_threshold"], 0.45)
        self.assertEqual(AppConfig.RETRY_BACKOFF_SCHEDULE, (0.5, 1.0, 1.5))
        self.assertGreater(AppConfig.YOLO26_EMSD_CONFIG["timeout_seconds"], 0)
