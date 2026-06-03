"""
WebSocket consumers for real-time monitoring and streaming
"""

import base64
import io
import json
import logging
import threading
import time
from unittest import result
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken
from PIL import Image, ImageDraw, ImageFont

from .inference_services import orchestrator
from .models import (
    AIModel,
    ActiveConfiguration,
    ComponentType,
    InferenceLog,
    TrainingJob,
    UserProfile,
)

logger = logging.getLogger(__name__)


def _render_annotated_png_b64(image_bytes, detections):
    try:
        with Image.open(io.BytesIO(image_bytes)) as source_image:
            base_image = source_image.convert("RGBA")
    except Exception:
        return ""

    overlay = Image.new("RGBA", base_image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    draw = ImageDraw.Draw(base_image)

    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    for detection in detections or []:
        if not isinstance(detection, dict):
            continue

        label = str(detection.get("label") or detection.get("class_name") or "DETECTION").upper()
        confidence = float(detection.get("confidence") or 0.0)
        bbox = detection.get("bbox") or []
        mask = detection.get("mask") if isinstance(detection.get("mask"), dict) else {}
        polygon = mask.get("polygon") if isinstance(mask, dict) else None

        is_defect = label in ("SCRATCH", "DEFECT")
        stroke = (239, 68, 68, 255) if is_defect else (34, 197, 94, 255)
        fill = (239, 68, 68, 72) if is_defect else (34, 197, 94, 64)

        if polygon and len(polygon) > 2:
            points = []
            for point in polygon:
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    try:
                        points.append((float(point[0]), float(point[1])))
                    except (TypeError, ValueError):
                        continue

            if len(points) > 2:
                overlay_draw.polygon(points, fill=fill, outline=stroke)
                overlay_draw.line(points + [points[0]], fill=stroke, width=2)

        if len(bbox) == 4:
            try:
                x1, y1, x2, y2 = [int(round(float(value))) for value in bbox]
            except (TypeError, ValueError):
                continue

            draw.rectangle([x1, y1, x2, y2], outline=stroke, width=3)
            text = f"{label} {confidence * 100:.1f}%"
            text_bbox = draw.textbbox((x1, y1), text, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            text_left = x1
            text_top = max(0, y1 - text_height - 8)
            draw.rectangle(
                [text_left, text_top, text_left + text_width + 8, text_top + text_height + 6],
                fill=(0, 0, 0, 170),
            )
            draw.text((text_left + 4, text_top + 2), text, fill=(255, 255, 255, 255), font=font)

    annotated = Image.alpha_composite(base_image, overlay).convert("RGB")
    buffer = io.BytesIO()
    annotated.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _role_for_user(user):
    try:
        return UserProfile.normalize_role(user.profile.role)
    except Exception:
        if getattr(user, "is_superuser", False):
            return UserProfile.ROLE_ADMIN
        if getattr(user, "is_staff", False):
            return UserProfile.ROLE_ADMIN
        return UserProfile.ROLE_USER


class LiveViewConsumer(AsyncWebsocketConsumer):
    """
    Streams real-time inference metadata from Operator's session to Super Admin's Live View
    Requirement 1.1: Real-Time Inference & Monitoring
    """
    
    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'live_view_{self.session_id}'
        
        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        
        logger.info(f"Live View Consumer connected for session: {self.session_id}")
    
    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logger.info(f"Live View Consumer disconnected for session: {self.session_id}")
    
    async def receive(self, text_data):
        """Receive inference metadata from Operator"""
        try:
            data = json.loads(text_data)
            
            # Extract inference metadata
            inference_data = {
                'type': 'inference_update',
                'bounding_boxes': data.get('bounding_boxes', []),
                'confidence': data.get('confidence', 0.0),
                'latency_ms': data.get('latency_ms', 0.0),
                'system_decision': data.get('system_decision', ''),
                'timestamp': data.get('timestamp', ''),
                'operator_id': data.get('operator_id'),
            }
            
            # Broadcast to all Super Admins in this session group
            await self.channel_layer.group_send(
                self.room_group_name,
                inference_data
            )
            
        except json.JSONDecodeError:
            logger.error("Invalid JSON received in LiveViewConsumer")
    
    async def inference_update(self, event):
        """Send inference update to WebSocket"""
        await self.send(text_data=json.dumps(event))


class InferenceStreamConsumer(AsyncWebsocketConsumer):
    """
    Accepts operator camera frames over WebSocket, performs server-side inference,
    and returns live annotated overlay payloads.
    """

    _rate_limit_lock = threading.Lock()
    _last_frame_by_key = {}

    async def connect(self):
        self.user = await self._authenticate_user()
        if not self.user or not getattr(self.user, "is_authenticated", False):
            await self.close(code=4401)
            return

        role = await self._user_role()
        if role not in (UserProfile.ROLE_USER, UserProfile.ROLE_ADMIN):
            await self.close(code=4403)
            return

        await self.accept()
        await self.send(
            text_data=json.dumps(
                {
                    "type": "connection_ack",
                    "message": "inference stream connected",
                    "user_id": self.user.id,
                    "role": role,
                }
            )
        )

    async def disconnect(self, close_code):
        return

    async def receive(self, text_data):
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self._send_error("Invalid JSON payload", code="invalid_json")
            return

        message_type = payload.get("type", "frame")
        if message_type != "frame":
            await self._send_error("Unsupported message type", code="invalid_type")
            return

        session_id = str(payload.get("session_id") or "").strip()
        if self._is_rate_limited(session_id):
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "inference_throttled",
                        "code": "frame_rate_limited",
                        "message": "Frame skipped due to stream rate limit",
                    }
                )
            )
            return

        result_payload, error_status = await self._process_frame_payload(payload)
        if error_status:
            await self.send(text_data=json.dumps(result_payload))
            return

        await self.send(
            text_data=json.dumps(
                {
                    "type": "inference_result",
                    "data": result_payload,
                }
            )
        )

        if session_id:
            await self.channel_layer.group_send(
                f"live_view_{session_id}",
                {
                    "type": "inference_update",
                    "bounding_boxes": result_payload.get("detections", []),
                    "confidence": result_payload.get("confidence", 0.0),
                    "latency_ms": result_payload.get("latency_ms", 0.0),
                    "system_decision": result_payload.get("system_decision", ""),
                    "timestamp": timezone.now().isoformat(),
                    "operator_id": self.user.id,
                    "session_id": session_id,
                },
            )

    async def _send_error(self, message, code="stream_error"):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "inference_error",
                    "code": code,
                    "error": message,
                }
            )
        )

    @database_sync_to_async
    def _authenticate_user(self):
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        token = parse_qs(query_string).get("token", [""])[0]
        if not token:
            for protocol in self.scope.get("subprotocols", []) or []:
                if isinstance(protocol, str) and protocol.startswith("jwt."):
                    token = protocol[4:]
                    break
        if not token:
            return None

        try:
            access = AccessToken(token)
            user_id = access.get("user_id")
            if not user_id:
                return None
            return User.objects.filter(id=user_id, is_active=True).first()
        except Exception:
            logger.warning("WebSocket auth failed: invalid JWT token")
            return None

    @database_sync_to_async
    def _user_role(self):
        return _role_for_user(self.user)

    @database_sync_to_async
    def _process_frame_payload(self, payload):
        try:
            role_val = _role_for_user(self.user)
            operator_config = None

            if role_val == UserProfile.ROLE_USER:
                operator_config = (
                    ActiveConfiguration.objects.filter(operator=self.user, is_active=True)
                    .select_related("product", "model", "operator")
                    .order_by("-config_version", "-id")
                    .first()
                )
                if not operator_config:
                    return {
                        "type": "inference_error",
                        "code": "no_active_preset",
                        "error": "No active inspection preset assigned to this operator",
                    }, 403

                payload_config_id = payload.get("config_id") or payload.get("preset_id")
                payload_config_version = payload.get("config_version")
                payload_config_hash = payload.get("config_hash")

                if str(operator_config.id) != str(payload_config_id):
                    return {
                        "type": "inference_error",
                        "code": "preset_mismatch",
                        "error": "Preset mismatch",
                    }, 403
                if str(operator_config.config_version) != str(payload_config_version):
                    return {
                        "type": "inference_error",
                        "code": "preset_version_mismatch",
                        "error": "Preset version mismatch",
                    }, 409
                if not payload_config_hash:
                    return {
                        "type": "inference_error",
                        "code": "missing_preset_hash",
                        "error": "Preset hash is required",
                    }, 400
                if payload_config_hash != operator_config.config_hash:
                    return {
                        "type": "inference_error",
                        "code": "preset_hash_mismatch",
                        "error": "Preset hash mismatch",
                    }, 403

            image_data = payload.get("image") or ""
            if not image_data:
                return {
                    "type": "inference_error",
                    "code": "missing_image",
                    "error": "No image received",
                }, 400

            try:
                image_bytes = base64.b64decode(
                    image_data.split(",", 1)[1] if "," in image_data else image_data
                )
            except Exception:
                return {
                    "type": "inference_error",
                    "code": "invalid_image",
                    "error": "Invalid image encoding",
                }, 400

            if not image_bytes:
                return {
                    "type": "inference_error",
                    "code": "empty_image",
                    "error": "Empty image received",
                }, 400

            filename = str(payload.get("filename") or f"frame-{timezone.now().timestamp()}.png")

            active_preset = operator_config if role_val == UserProfile.ROLE_USER else None
            model = active_preset.model if active_preset else None
            model_id = payload.get("model") or payload.get("model_id")
            if model is None and model_id:
                model = AIModel.objects.filter(id=model_id).first()
            if model is None:
                model = AIModel.objects.filter(is_active=True).first()
            if model is None:
                model, _ = AIModel.objects.get_or_create(
                    name=getattr(settings, "INFERENCE_DEFAULT_MODEL_NAME", "yolo26_emsd_v1"),
                    version="v1",
                    defaults={
                        "description": "Default EMSD YOLOv26 model variant",
                        "is_active": True,
                        "is_deployment_ready": True,
                    },
                )

            component = active_preset.product if active_preset else None
            component_id = payload.get("component") or payload.get("component_id") or payload.get("product_id")
            if component is None and component_id:
                component = ComponentType.objects.filter(id=component_id).first()

            confidence = float(
                payload.get(
                    "confidence",
                    active_preset.threshold
                    if active_preset
                    else getattr(settings, "INFERENCE_CONFIDENCE_THRESHOLD", 0.5),
                )
            )
            iou = float(payload.get("iou", getattr(settings, "INFERENCE_IOU_THRESHOLD", 0.45)))

            result = orchestrator.infer(
                image_bytes=image_bytes,
                filename=filename,
                model_name=model.name,
                confidence=confidence,
                iou=iou,
            )

            # Only generate server-side annotation if there are actual detections
            # For live stream, let frontend draw on canvas instead for better responsiveness
            if result.detections and len(result.detections) > 0:
                result.annotated_image_b64 = _render_annotated_png_b64(
                image_bytes,
                result.detections,
            )

            if not result.success:
                return {
                    "type": "inference_error",
                    "code": "inference_unavailable",
                    "error": result.error or "Service Unavailable",
                    "latency_ms": result.latency_ms,
                }, 503

            session_active_raw = payload.get("session_active", True)
            session_active = str(session_active_raw).lower() in ("1", "true", "yes", "on")

            auto_capture_path = ""
            if result.system_decision == "FAIL" and session_active:
                capture_name = (
                    f"captures/pending/{timezone.now():%Y%m%d_%H%M%S_%f}_{result.image_hash}.png"
                )
                source_bytes = image_bytes
                if result.annotated_image_b64:
                    try:
                        source_bytes = base64.b64decode(result.annotated_image_b64)
                    except Exception:
                        source_bytes = image_bytes
                auto_capture_path = default_storage.save(
                    capture_name,
                    ContentFile(source_bytes, name=f"{result.image_hash}.png"),
                )

            defect_area_percent = 0.0
            segmentation_data = {}
            for detection in result.detections:
                if detection.get("mask") and detection["mask"].get("polygon"):
                    if "mask_polygons" not in segmentation_data:
                        segmentation_data["mask_polygons"] = []
                    segmentation_data["mask_polygons"].append(
                        {
                            "label": detection.get("label"),
                            "confidence": detection.get("confidence"),
                            "polygon": detection["mask"]["polygon"],
                        }
                    )

                if detection.get("label") in ("SCRATCH", "DEFECT"):
                    bbox = detection.get("bbox", [])
                    if len(bbox) == 4:
                        x1, y1, x2, y2 = bbox
                        img_area = 640 * 360
                        bbox_area = (x2 - x1) * (y2 - y1)
                        defect_area_percent = max(defect_area_percent, (bbox_area / img_area) * 100)

            snapshot_name = f"{timezone.now():%Y%m%d_%H%M%S_%f}_{result.image_hash}.png"
            snapshot_bytes = image_bytes
            if result.annotated_image_b64:
                try:
                    snapshot_bytes = base64.b64decode(result.annotated_image_b64)
                except Exception:
                    snapshot_bytes = image_bytes

            log = InferenceLog.objects.create(
                operator=self.user,
                model_used=model,
                component=component,
                image_snapshot=ContentFile(snapshot_bytes, name=snapshot_name),
                detection_results={
                    "detections": result.detections,
                    "cache_hit": result.cache_hit,
                    "image_hash": result.image_hash,
                    "metrics": result.metrics,
                },
                segmentation_data=segmentation_data,
                defect_area_percent=round(defect_area_percent, 2),
                latency_ms=result.latency_ms,
                confidence_score=result.confidence,
                system_decision=result.system_decision,
                final_decision=result.system_decision,
                is_confidence_below_threshold=result.confidence < confidence,
                status="PENDING",
                session_id=payload.get("session_id", ""),
                manufacturing_order=payload.get("manufacturing_order", ""),
            )

            response_payload = result.to_dict()
            response_payload["id"] = log.id
            response_payload["log_id"] = log.id
            response_payload["snapshot_url"] = log.image_snapshot.url if log.image_snapshot else ""
            if auto_capture_path:
                response_payload["auto_capture_url"] = default_storage.url(auto_capture_path)

            return response_payload, None
        except Exception as exc:
            logger.exception("Error processing streamed inference frame")
            return {
                "type": "inference_error",
                "code": "stream_processing_failed",
                "error": str(exc),
            }, 500

    def _is_rate_limited(self, session_id):
        min_interval_ms = int(getattr(settings, "INFERENCE_STREAM_MIN_FRAME_INTERVAL_MS", 250))
        if min_interval_ms <= 0:
            return False

        now = time.monotonic()
        key = f"{self.user.id}:{session_id or '_'}"
        with self._rate_limit_lock:
            last = self._last_frame_by_key.get(key, 0.0)
            if (now - last) * 1000 < min_interval_ms:
                return True
            self._last_frame_by_key[key] = now
            return False


class MetricsConsumer(AsyncWebsocketConsumer):
    """
    Streams real-time metrics and analytics updates
    Requirement 1.4: Analytics & Audit Logging
    """
    
    async def connect(self):
        self.room_group_name = 'metrics_broadcast'
        
        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        
        # Send initial metrics
        metrics = await self.get_current_metrics()
        await self.send(text_data=json.dumps({
            'type': 'initial_metrics',
            'data': metrics
        }))
        
        logger.info("Metrics Consumer connected")
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logger.info("Metrics Consumer disconnected")
    
    @database_sync_to_async
    def get_current_metrics(self):
        """Fetch current analytics metrics"""
        from django.db.models import Avg, Count, Q
        
        total_inferences = InferenceLog.objects.count()
        if total_inferences == 0:
            return {}
        
        correct_detections = InferenceLog.objects.filter(operator_override=False).count()
        accuracy = (correct_detections / total_inferences) * 100
        
        false_rejects = InferenceLog.objects.filter(
            system_decision='FAIL',
            final_decision='PASS'
        ).count()
        frr = (false_rejects / total_inferences) * 100
        
        avg_latency = InferenceLog.objects.aggregate(Avg('latency_ms'))['latency_ms__avg'] or 0
        
        return {
            'accuracy': round(accuracy, 2),
            'false_reject_rate': round(frr, 2),
            'avg_latency': round(avg_latency, 2),
            'total_inferences': total_inferences,
        }
    
    async def metrics_update(self, event):
        """Send metrics update to WebSocket"""
        await self.send(text_data=json.dumps(event))


class TrainingProgressConsumer(AsyncWebsocketConsumer):
    """
    Streams training job progress updates in real-time
    Requirement 1.5: Continuous Learning Pipeline
    """
    
    async def connect(self):
        self.training_job_id = self.scope['url_route']['kwargs']['training_job_id']
        self.room_group_name = f'training_progress_{self.training_job_id}'
        
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        
        # Send initial job status
        job_status = await self.get_job_status()
        await self.send(text_data=json.dumps({
            'type': 'job_status',
            'data': job_status
        }))
        
        logger.info(f"Training Progress Consumer connected for job: {self.training_job_id}")
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logger.info(f"Training Progress Consumer disconnected for job: {self.training_job_id}")
    
    @database_sync_to_async
    def get_job_status(self):
        """Get current training job status"""
        try:
            job = TrainingJob.objects.get(id=self.training_job_id)
            return {
                'id': job.id,
                'status': job.status,
                'current_epoch': job.current_epoch,
                'total_epochs': job.epochs,
                'logs': job.logs[-500:] if job.logs else '',  # Last 500 chars
            }
        except TrainingJob.DoesNotExist:
            return {}
    
    async def progress_update(self, event):
        """Send training progress update"""
        await self.send(text_data=json.dumps(event))


class WebRTCSignalingConsumer(AsyncWebsocketConsumer):
    """
    Minimal signaling relay for WebRTC SDP/ICE exchange.
    Expects JSON messages: { type: 'offer'|'answer'|'ice', from: 'sender'|'receiver', data: ... }
    The consumer simply relays messages to all other participants in the same session group.
    """

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs'].get('session_id')
        if not self.session_id:
            await self.close(code=4001)
            return

        self.room_group_name = f'webrtc_{self.session_id}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Accept text JSON messages and forward to group
        if not text_data:
            return
        try:
            # Basic validation to ensure JSON
            payload = json.loads(text_data)
        except Exception:
            # Ignore invalid payloads
            return

        # Broadcast the raw message to the group; include sender channel to avoid echo
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'webrtc.message',
                'message': text_data,
                'sender_channel': self.channel_name,
            },
        )

    async def webrtc_message(self, event):
        # Don't echo back to the sender
        if event.get('sender_channel') == self.channel_name:
            return
        await self.send(text_data=event.get('message') or '')
