from io import BytesIO
from datetime import date

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from PIL import Image

from core.config import AppConfig
from core.models import ActiveConfiguration, AIModel, ComponentType, InferenceLog, RetrainingQueue
from core.serializers import InferenceLogSerializer
from core.views import InferenceLogViewSet, operator_preset


class AppConfigSmokeTests(SimpleTestCase):
    def test_inference_defaults_are_configured(self):
        self.assertEqual(AppConfig.YOLO26_EMSD_CONFIG["confidence_threshold"], 0.5)
        self.assertEqual(AppConfig.YOLO26_EMSD_CONFIG["iou_threshold"], 0.45)
        self.assertEqual(AppConfig.RETRY_BACKOFF_SCHEDULE, (0.5, 1.0, 1.5))
        self.assertGreater(AppConfig.YOLO26_EMSD_CONFIG["timeout_seconds"], 0)


def _build_test_image(name: str = "snapshot.png"):
    buffer = BytesIO()
    Image.new("RGB", (32, 32), color=(255, 255, 255)).save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


class InferenceLogApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="operator-1", password="pass12345")
        self.model = AIModel.objects.create(
            name="yolo26_emsd_v1",
            version="1.0.0",
            created_by=self.user,
        )
        self.component = ComponentType.objects.create(name="Widget A")
        self.active_config = ActiveConfiguration.objects.create(
            operator=self.user,
            product=self.component,
            model=self.model,
            threshold=0.75,
            config_version=1,
            config_hash="a" * 64,
            created_by=self.user,
        )

    def _create_log(self, confidence: float = 0.8):
        return InferenceLog.objects.create(
            operator=self.user,
            model_used=self.model,
            component=self.component,
            image_snapshot=_build_test_image(),
            detection_results={"detections": []},
            latency_ms=12.5,
            confidence_score=confidence,
            system_decision="PASS",
            final_decision="PASS",
            status="PENDING",
        )

    def test_serializer_returns_relative_snapshot_url(self):
        log = self._create_log()
        data = InferenceLogSerializer(log).data

        self.assertTrue(data["image_snapshot_url"].startswith("/media/"))

    def test_operator_preset_returns_active_configuration(self):
        request = self.factory.get("/api/operator/preset/")
        force_authenticate(request, user=self.user)

        response = operator_preset(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["config_hash"], self.active_config.config_hash)
        self.assertEqual(response.data["threshold"], 0.75)

    def test_auto_approve_marks_log_as_approved_when_confident(self):
        log = self._create_log(confidence=0.92)
        request = self.factory.post(f"/api/inference-logs/{log.pk}/auto_approve/")
        force_authenticate(request, user=self.user)

        response = InferenceLogViewSet.as_view({"post": "auto_approve"})(request, pk=log.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "auto_approved")

        log.refresh_from_db()
        self.assertEqual(log.status, "APPROVED")
        self.assertFalse(log.operator_override)
        self.assertIn("Auto-approved by system", log.operator_comment)

    def test_auto_approve_requests_manual_review_when_below_threshold(self):
        log = self._create_log(confidence=0.41)
        request = self.factory.post(f"/api/inference-logs/{log.pk}/auto_approve/")
        force_authenticate(request, user=self.user)

        response = InferenceLogViewSet.as_view({"post": "auto_approve"})(request, pk=log.pk)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "requires_manual_review")

        log.refresh_from_db()
        self.assertTrue(log.is_confidence_below_threshold)
        self.assertEqual(log.status, "PENDING")

    def test_batch_number_defaults_to_one_when_zero_is_saved(self):
        log = InferenceLog.objects.create(
            operator=self.user,
            model_used=self.model,
            component=self.component,
            image_snapshot=_build_test_image(),
            detection_results={"detections": []},
            latency_ms=9.5,
            confidence_score=0.9,
            system_decision="PASS",
            final_decision="PASS",
            status="PENDING",
            batch_number=0,
        )

        self.assertEqual(log.batch_number, 1)

    def test_batch_key_is_generated_from_date_and_number(self):
        today = date.today()
        log = InferenceLog.objects.create(
            operator=self.user,
            model_used=self.model,
            component=self.component,
            image_snapshot=_build_test_image(),
            detection_results={"detections": []},
            latency_ms=9.5,
            confidence_score=0.9,
            system_decision="PASS",
            final_decision="PASS",
            status="PENDING",
            batch_number=2,
            batch_date=today,
        )

        self.assertEqual(log.batch_key, f"{today.isoformat()}-2")

    def test_batch_filter_treats_zero_as_first_batch(self):
        first_batch = self._create_log()
        second_batch = self._create_log()
        second_batch.batch_number = 2
        second_batch.save()

        request = self.factory.get("/api/inference-logs/", {"batch_number": 0})
        force_authenticate(request, user=self.user)

        response = InferenceLogViewSet.as_view({"get": "list"})(request)

        self.assertEqual(response.status_code, 200)
        returned_batches = {item["batch_number"] for item in response.data}
        self.assertEqual(returned_batches, {1})
        self.assertIn(first_batch.id, [item["id"] for item in response.data])

    def test_review_reject_queues_retraining(self):
        log = self._create_log(confidence=0.41)
        request = self.factory.post(
            f"/api/inference-logs/{log.pk}/review/",
            {
                "action": "REJECT",
                "description": "Missed defect on left edge",
                "rejection_reason": "MISSED_DEFECT",
                "final_decision": "FAIL",
            },
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = InferenceLogViewSet.as_view({"post": "review"})(request, pk=log.pk)

        self.assertEqual(response.status_code, 200)
        log.refresh_from_db()
        self.assertEqual(log.status, "REJECTED")
        self.assertEqual(log.final_decision, "FAIL")
        self.assertTrue(log.operator_override)
        self.assertTrue(RetrainingQueue.objects.filter(log_entry=log).exists())
