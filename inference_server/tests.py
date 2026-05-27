from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

import numpy as np

from inference_server import app as inference_app


class InferenceServerTests(IsolatedAsyncioTestCase):
    async def test_health_reports_degraded_when_yolo_is_missing(self):
        with patch.object(inference_app, "YOLO", None):
            response = await inference_app.health()

        assert response.status_code == 503
        assert response.body.decode("utf-8").find('"status":"degraded"') != -1

    async def test_predict_returns_503_when_yolo_is_missing(self):
        with patch.object(inference_app, "YOLO", None):
            response = await inference_app.predict(object())

        assert response.status_code == 503
        assert response.body.decode("utf-8").find('"success":false') != -1

    def test_overlay_draws_boxes_and_polygons(self):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        annotated = inference_app._overlay_mask_and_detections(
            frame,
            None,
            [
                {
                    "bbox": [8, 8, 40, 40],
                    "mask": {"polygon": [[10, 10], [30, 10], [30, 30], [10, 30]]},
                }
            ],
        )

        assert annotated.shape == frame.shape
        assert np.any(annotated != frame)

    def test_encode_annotated_image_returns_base64(self):
        frame = np.zeros((16, 16, 3), dtype=np.uint8)

        encoded = inference_app._encode_annotated_image(frame)

        assert isinstance(encoded, str)
        assert encoded