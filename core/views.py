import base64
import io
import logging
import os
from datetime import timedelta
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Avg, Count, Q, F
from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from django_filters.rest_framework import DjangoFilterBackend
from PIL import Image

from .models import (
    UserProfile, AIModel, ComponentType, 
    ActiveConfiguration, InferenceLog, RetrainingQueue,
    TrainingJob, DatasetBuffer
)
from .serializers import (
    ActiveConfigurationSerializer, ComponentTypeSerializer, 
    AIModelSerializer, InferenceLogSerializer, 
    RetrainingQueueSerializer, CustomTokenObtainPairSerializer,
    TrainingJobSerializer, DatasetBufferSerializer,
    OperatorSerializer
)
from .tasks import train_model, deploy_model_version
from .inference_services import InferenceFactory, orchestrator

logger = logging.getLogger(__name__)


def normalize_role(role):
    if role is None:
        return ''
    return UserProfile.normalize_role(role)


def user_role(user):
    try:
        return normalize_role(user.profile.role)
    except Exception:
        return ''


def _coerce_batch_number(raw_value):
    try:
        batch_number = int(raw_value)
    except (TypeError, ValueError):
        return 1
    return max(batch_number, 1)


class IsUser(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_role(request.user) == UserProfile.ROLE_USER


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_role(request.user) == UserProfile.ROLE_ADMIN


class IsAdminOrReadOnlyAuthenticated(permissions.BasePermission):
    """Allow safe/read-only methods for any authenticated user, but require
    admin role for modifying requests (POST/PUT/PATCH/DELETE).
    """
    def has_permission(self, request, view):
        # Allow safe methods for any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)

        # For non-safe methods, require admin role
        return IsAdmin().has_permission(request, view)


class IsAdminOnly(permissions.BasePermission):
    """Allow access for admin role only."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_role(request.user) == UserProfile.ROLE_ADMIN

# 🔑 Custom JWT View
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
def api_status(request):
    """
    Lightweight health/status endpoint for the Vite frontend.
    """
    return Response({
        "message": "Django core API connected",
        "service": "ai_ins_sys.core",
        "authenticated": bool(request.user and request.user.is_authenticated),
    })


@api_view(['GET'])
def operator_preset(request):
    if not request.user or not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=401)

    setting = ActiveConfiguration.objects.filter(
        operator=request.user,
        is_active=True,
    ).select_related('product', 'model', 'operator').order_by('-config_version', '-id').first()

    if not setting:
        return Response(
            {'error': 'No active inspection preset assigned to this operator'},
            status=404,
        )

    return Response(ActiveConfigurationSerializer(setting).data)


# ====================================
# 📊 ANALYTICS ENDPOINTS (Req. 1.4)
# ====================================

@api_view(['GET'])
def dashboard_stats(request):
    """
    Main dashboard statistics
    Returns: Accuracy, FRR, Latency, Total inspections
    """
    total_inferences = InferenceLog.objects.count()
    if total_inferences == 0:
        return Response({
            "detection_accuracy": 0,
            "false_reject_rate": 0,
            "avg_inference_latency": 0,
            "total_inspections": 0,
            "message": "No data available"
        }, status=200)

    # Calculate Accuracy: (Final matches System) / Total
    correct_detections = InferenceLog.objects.filter(operator_override=False).count()
    accuracy = (correct_detections / total_inferences) * 100

    # Calculate False Reject Rate (FRR): Operator Approved but System Flagged Defect
    false_rejects = InferenceLog.objects.filter(
        system_decision='FAIL', 
        final_decision='PASS'
    ).count()
    frr = (false_rejects / total_inferences) * 100 if total_inferences > 0 else 0

    avg_latency = InferenceLog.objects.aggregate(Avg('latency_ms'))['latency_ms__avg'] or 0
    
    # Additional metrics
    false_positives = InferenceLog.objects.filter(
        system_decision='FAIL',
        final_decision='PASS'
    ).count()
    
    false_negatives = InferenceLog.objects.filter(
        system_decision='PASS',
        final_decision='FAIL'
    ).count()

    return Response({
        "detection_accuracy": round(accuracy, 2),
        "false_reject_rate": round(frr, 2),
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "avg_inference_latency": round(avg_latency, 2),
        "total_inspections": total_inferences
    })


@api_view(['GET'])
def latency_trends(request):
    """
    Latency trends over time (last 7 days)
    Returns: Daily average latency for charting
    """
    days = int(request.query_params.get('days', 7))
    
    trends = []
    for i in range(days, 0, -1):
        date = timezone.now().date() - timedelta(days=i)
        daily_avg = InferenceLog.objects.filter(
            timestamp__date=date
        ).aggregate(Avg('latency_ms'))['latency_ms__avg']
        
        trends.append({
            'date': date.isoformat(),
            'avg_latency_ms': round(daily_avg or 0, 2),
            'count': InferenceLog.objects.filter(timestamp__date=date).count()
        })
    
    return Response({'trends': trends})


@api_view(['GET'])
def operator_performance(request):
    """
    Performance metrics per operator
    Returns: Accuracy, FRR, inspection count per operator
    """
    operators = User.objects.filter(profile__role='USER')
    
    results = []
    for operator in operators:
        logs = InferenceLog.objects.filter(operator=operator)
        total = logs.count()
        
        if total > 0:
            correct = logs.filter(operator_override=False).count()
            accuracy = (correct / total) * 100
            
            false_rejects = logs.filter(
                system_decision='FAIL',
                final_decision='PASS'
            ).count()
            frr = (false_rejects / total) * 100
        else:
            accuracy = 0
            frr = 0
        
        results.append({
            'operator_id': operator.id,
            'operator_name': operator.username,
            'accuracy': round(accuracy, 2),
            'false_reject_rate': round(frr, 2),
            'total_inspections': total,
            'avg_latency_ms': round(logs.aggregate(Avg('latency_ms'))['latency_ms__avg'] or 0, 2)
        })
    
    return Response({'operators': results})


@api_view(['GET'])
def model_performance(request):
    """
    Performance comparison between models
    Returns: Accuracy and metrics for each deployed model
    """
    models = AIModel.objects.all()
    
    results = []
    for model in models:
        logs = InferenceLog.objects.filter(model_used=model)
        total = logs.count()
        
        if total > 0:
            correct = logs.filter(operator_override=False).count()
            accuracy = (correct / total) * 100
        else:
            accuracy = 0
        
        results.append({
            'model_id': model.id,
            'model_name': model.name,
            'version': model.version,
            'is_active': model.is_active,
            'mAP': model.mAP,
            'avg_speed_ms': model.avg_speed_ms,
            'accuracy_on_production': round(accuracy, 2),
            'total_inferences': total,
        })
    
    return Response({'models': results})


# ====================================
# 🧠 AI INFERENCE ENDPOINT (Req. 1.1)
# ====================================

@api_view(['POST'])
def detect_image(request):
    """
    Real-time inference endpoint.
    Accepts multipart PNG/JPEG frames or the legacy base64 data URL payload.
    Authenticated USER and ADMIN accounts may access inference.
    USER accounts require an active preset to run detections.
    """
    try:
        # Require authentication for running detections
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)

        role_val = user_role(request.user)
        operator_config = None
        if role_val == 'USER':
            operator_config = ActiveConfiguration.objects.filter(
                operator=request.user,
                is_active=True,
            ).select_related('product', 'model', 'operator').order_by('-config_version', '-id').first()

            if not operator_config:
                return Response(
                    {'error': 'No active inspection preset assigned to this operator'},
                    status=403,
                )

            payload_config_id = request.data.get('config_id') or request.data.get('preset_id')
            payload_config_version = request.data.get('config_version')
            payload_config_hash = request.data.get('config_hash')

            if str(operator_config.id) != str(payload_config_id):
                return Response({'error': 'Preset mismatch'}, status=403)
            if str(operator_config.config_version) != str(payload_config_version):
                return Response({'error': 'Preset version mismatch'}, status=409)
            if not payload_config_hash:
                return Response({'error': 'Preset hash is required'}, status=400)
            if payload_config_hash != operator_config.config_hash:
                return Response({'error': 'Preset hash mismatch'}, status=403)
        image_file = request.FILES.get('image')
        filename = getattr(image_file, 'name', 'frame.png')

        if image_file:
            image_bytes = image_file.read()
        else:
            image_data = request.data.get('image')
            if not image_data:
                return Response({"error": "No image received"}, status=400)
            image_bytes = base64.b64decode(
                image_data.split(',', 1)[1] if ',' in image_data else image_data
            )

        if not image_bytes:
            return Response({"error": "Empty image received"}, status=400)

        operator = request.user if request.user and request.user.is_authenticated else None
        active_preset = operator_config if role_val == 'USER' else None

        model = active_preset.model if active_preset else None
        model_id = request.data.get('model') or request.data.get('model_id')
        if model is None and model_id:
            model = AIModel.objects.filter(id=model_id).first()
        if model is None:
            model = AIModel.objects.filter(is_active=True).first()
        if model is None:
            model, _ = AIModel.objects.get_or_create(
                name=getattr(settings, 'INFERENCE_DEFAULT_MODEL_NAME', 'yolo26_emsd_v1'),
                version='v1',
                defaults={
                    'description': 'Default EMSD YOLOv26 model variant',
                    'is_active': True,
                    'is_deployment_ready': True,
                },
            )

        component = active_preset.product if active_preset else None
        component_id = request.data.get('component') or request.data.get('component_id') or request.data.get('product_id')
        if component is None and component_id:
            component = ComponentType.objects.filter(id=component_id).first()

        confidence = float(
            request.data.get(
                'confidence',
                active_preset.threshold if active_preset else getattr(settings, 'INFERENCE_CONFIDENCE_THRESHOLD', 0.5),
            )
        )
        iou = float(request.data.get('iou', getattr(settings, 'INFERENCE_IOU_THRESHOLD', 0.45)))

        result = orchestrator.infer(
            image_bytes=image_bytes,
            filename=filename,
            model_name=model.name,
            confidence=confidence,
            iou=iou,
        )

        if not result.success:
            return Response(result.to_dict(), status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Only perform automatic auto-capture when the operator session is active.
        # Frontend will send `session_active` flag (true/false) to indicate whether
        # the operator has started a session (ready to allow auto-capture).
        session_active_raw = request.data.get('session_active', True)
        try:
            session_active = str(session_active_raw).lower() in ('1', 'true', 'yes', 'on')
        except Exception:
            session_active = bool(session_active_raw)

        if result.system_decision == 'FAIL' and session_active:
            capture_name = f"captures/pending/{timezone.now():%Y%m%d_%H%M%S_%f}_{result.image_hash}.png"
            result.auto_capture_path = default_storage.save(
                capture_name,
                ContentFile(image_bytes),
            )

        if operator is None:
            operator, _ = User.objects.get_or_create(
                username='system_operator',
                defaults={'is_active': False},
            )

        # Extract segmentation data and calculate defect area percent
        defect_area_percent = 0.0
        segmentation_data = {}
        
        for detection in result.detections:
            # Collect mask polygons
            if detection.get('mask') and detection['mask'].get('polygon'):
                if 'mask_polygons' not in segmentation_data:
                    segmentation_data['mask_polygons'] = []
                segmentation_data['mask_polygons'].append({
                    'label': detection.get('label'),
                    'confidence': detection.get('confidence'),
                    'polygon': detection['mask']['polygon'],
                })
            
            # Calculate defect area percentage based on detected scratches
            if detection.get('label') == 'SCRATCH' or detection.get('label') == 'DEFECT':
                bbox = detection.get('bbox', [])
                if len(bbox) == 4:
                    x1, y1, x2, y2 = bbox
                    if len(result.detections) > 0:
                        # Rough calculation: bbox area / image area
                        img_area = 640 * 360  # Assuming default YOLO input size
                        bbox_area = (x2 - x1) * (y2 - y1)
                        defect_area_percent = max(defect_area_percent, (bbox_area / img_area) * 100)

        snapshot_name = f"{timezone.now():%Y%m%d_%H%M%S_%f}_{result.image_hash}.png"
        log = InferenceLog.objects.create(
            operator=operator,
            model_used=model,
            component=component,
            image_snapshot=ContentFile(image_bytes, name=snapshot_name),
            detection_results={
                'detections': result.detections,
                'cache_hit': result.cache_hit,
                'image_hash': result.image_hash,
                'metrics': result.metrics,
            },
            segmentation_data=segmentation_data,
            defect_area_percent=round(defect_area_percent, 2),
            latency_ms=result.latency_ms,
            confidence_score=result.confidence,
            system_decision=result.system_decision,
            final_decision=result.system_decision,
            status='PENDING',
            session_id=request.data.get('session_id', ''),
            batch_number=_coerce_batch_number(request.data.get('batch_number')),
        )

        payload = result.to_dict()
        payload['id'] = log.id
        payload['log_id'] = log.id
        payload['snapshot_url'] = log.image_snapshot.url if log.image_snapshot else ''
        if result.auto_capture_path:
            payload['auto_capture_url'] = default_storage.url(result.auto_capture_path)
        return Response(payload)
    except Exception as e:
        logger.error(f"Error in detect_image: {str(e)}")
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def inference_metrics(request):
    return Response(orchestrator.snapshot_metrics())


@api_view(['GET'])
def inference_health(request):
    model_name = request.query_params.get(
        'model_name',
        getattr(settings, 'INFERENCE_DEFAULT_MODEL_NAME', 'yolo26_emsd_v1'),
    )
    try:
        health = InferenceFactory.get_service(model_name).health_check()
        return Response(health)
    except Exception as exc:
        return Response(
            {'status': 'unavailable', 'error': str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


# ====================================
# 🔒 RBAC-ENABLED VIEWSETS
# ====================================

class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer
    permission_classes = [IsAdminOrReadOnlyAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['compatible_components']
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a specific model version"""
        try:
            # Deactivate current active model
            AIModel.objects.filter(is_active=True).update(is_active=False)
            
            # Activate new model
            model = self.get_object()
            model.is_active = True
            model.last_deployed_at = timezone.now()
            model.save()
            
            logger.info(f"Model {model.id} activated by {request.user}")
            
            return Response({
                'status': 'activated',
                'model_id': model.id,
                'model_name': model.name
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get currently active model"""
        active_model = AIModel.objects.filter(is_active=True).first()
        if active_model:
            serializer = self.get_serializer(active_model)
            return Response(serializer.data)
        return Response({'message': 'No active model'}, status=404)


class ComponentTypeViewSet(viewsets.ModelViewSet):
    queryset = ComponentType.objects.all()
    serializer_class = ComponentTypeSerializer
    permission_classes = [IsAdminOrReadOnlyAuthenticated]


class AdminSettingsViewSet(viewsets.ModelViewSet):
    queryset = ActiveConfiguration.objects.all().order_by('-updated_at', '-id')
    serializer_class = ActiveConfigurationSerializer
    permission_classes = [IsAdminOnly]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """Override create to log serializer validation errors for debugging."""
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.debug(
                "AdminSettings create validation errors: %s | payload: %s",
                serializer.errors,
                request.data,
            )
            return Response(serializer.errors, status=400)
        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['get'])
    def assigned_operator_sessions(self, request, pk=None):
        """Get all inference logs for assigned operator"""
        setting = self.get_object()
        if not setting.operator:
            return Response({'error': 'No operator assigned'}, status=400)
        
        logs = InferenceLog.objects.filter(
            operator=setting.operator,
            component=setting.product
        ).order_by('-timestamp')[:100]
        
        serializer = InferenceLogSerializer(logs, many=True)
        return Response(serializer.data)


class InferenceLogViewSet(viewsets.ModelViewSet):
    queryset = InferenceLog.objects.all().order_by('-batch_number', '-timestamp')
    serializer_class = InferenceLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['operator', 'status', 'final_decision', 'component']

    def get_queryset(self):
        """Allow simple server-side filtering by batch and dates.

        Supported query params:
        - batch_number: integer
        - date: YYYY-MM-DD (specific date)
        - date_from: YYYY-MM-DD
        - date_to: YYYY-MM-DD
        """
        qs = InferenceLog.objects.all().order_by('-batch_number', '-timestamp')
        params = self.request.query_params

        # Batch filter
        batch = params.get('batch_number')
        if batch is not None and batch != '' and batch.lower() != 'all':
            try:
                b = _coerce_batch_number(batch)
                qs = qs.filter(batch_number=b)
            except Exception:
                pass

        # Specific date
        date = params.get('date')
        if date:
            try:
                qs = qs.filter(timestamp__date=date)
                return qs
            except Exception:
                pass

        # Date range
        date_from = params.get('date_from')
        date_to = params.get('date_to')
        if date_from:
            try:
                qs = qs.filter(timestamp__date__gte=date_from)
            except Exception:
                pass
        if date_to:
            try:
                qs = qs.filter(timestamp__date__lte=date_to)
            except Exception:
                pass

        return qs
    
    @action(detail=True, methods=['post'])
    def operator_override(self, request, pk=None):
        """Record operator override on inference"""
        log = self.get_object()
        
        log.operator_override = True
        log.final_decision = request.data.get('final_decision', log.system_decision)
        log.operator_comment = request.data.get('comment', '')
        log.operator_review_description = request.data.get('description', log.operator_review_description)
        log.rejection_reason = request.data.get('rejection_reason', log.rejection_reason)
        log.reviewed_at = timezone.now()
        log.status = 'APPROVED' if log.final_decision == 'PASS' else 'REJECTED'
        log.save()
        
        # If operator rejected (False Positive), queue for retraining
        if log.final_decision == 'PASS' and log.system_decision == 'FAIL':
            priority = 2  # High priority for false positives
            RetrainingQueue.objects.get_or_create(
                log_entry=log,
                defaults={'priority': priority, 'status': 'PENDING'}
            )
            logger.info(f"Queued inference {log.id} for retraining due to operator override")
        
        return Response(InferenceLogSerializer(log).data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Acknowledge or reject the inference result after auto-capture."""
        log = self.get_object()
        action_value = request.data.get('action')
        description = (request.data.get('description') or '').strip()
        rejection_reason = request.data.get('rejection_reason', '')
        final_decision = request.data.get('final_decision', log.system_decision)

        if action_value not in ('ACKNOWLEDGE', 'REJECT'):
            return Response({'error': 'action must be ACKNOWLEDGE or REJECT'}, status=400)
        if not description:
            return Response({'error': 'description is required'}, status=400)
        if action_value == 'REJECT' and not rejection_reason:
            return Response({'error': 'rejection_reason is required when rejecting'}, status=400)
        if final_decision not in ('PASS', 'FAIL'):
            return Response({'error': 'final_decision must be PASS or FAIL'}, status=400)

        log.operator_review_description = description
        log.operator_comment = description
        log.rejection_reason = rejection_reason if action_value == 'REJECT' else ''
        log.final_decision = final_decision
        log.operator_override = final_decision != log.system_decision or action_value == 'REJECT'
        log.status = 'APPROVED' if action_value == 'ACKNOWLEDGE' else 'REJECTED'
        log.reviewed_at = timezone.now()
        log.save()

        if log.status == 'REJECTED':
            priority = 2 if rejection_reason in ('MISSED_DEFECT', 'BAD_ANNOTATION', 'WRONG_CLASS') else 1
            RetrainingQueue.objects.get_or_create(
                log_entry=log,
                defaults={'priority': priority, 'status': 'PENDING'},
            )

        return Response(InferenceLogSerializer(log).data)
    
    @action(detail=False, methods=['get'])
    def pending_review(self, request):
        """Get pending logs awaiting operator review"""
        pending = self.get_queryset().filter(status='PENDING')[:50]
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def auto_approve(self, request, pk=None):
        """
        Backend-driven confidence-based auto-approval.
        
        Checks operator's active configuration threshold against the inference's confidence.
        If confidence >= threshold, auto-approves the log.
        Otherwise, returns status indicating manual review is needed.
        
        Security/Auditability:
        - All decisions made server-side (cannot be bypassed client-side)
        - Logged centrally for audit trail
        - Consistent across all operators
        """
        log = self.get_object()
        
        # Get operator's active configuration for the component
        config = ActiveConfiguration.objects.filter(
            operator=log.operator,
            product=log.component,
            is_active=True,
        ).select_related('model').first()
        
        if not config:
            return Response(
                {'error': 'No active configuration found for operator and component'},
                status=404
            )
        
        threshold = config.threshold
        confidence = log.confidence_score
        
        # Check if confidence meets threshold
        if confidence >= threshold:
            # Auto-approve
            log.final_decision = log.system_decision  # Accept AI decision
            log.status = 'APPROVED'
            log.operator_override = False
            log.operator_comment = f'Auto-approved by system (confidence: {confidence:.2%} >= threshold: {threshold:.2%})'
            log.reviewed_at = timezone.now()
            log.save()
            
            logger.info(
                f"Auto-approved inference log {log.id} for operator {log.operator.username} "
                f"(confidence: {confidence:.2%} >= threshold: {threshold:.2%})"
            )
            
            return Response({
                'status': 'auto_approved',
                'message': f'Auto-approved (confidence: {confidence:.2%})',
                'log': InferenceLogSerializer(log).data
            }, status=200)
        else:
            # Confidence too low - requires manual review
            log.is_confidence_below_threshold = True
            log.save()
            
            logger.info(
                f"Low confidence inference {log.id} for operator {log.operator.username} "
                f"requires manual review (confidence: {confidence:.2%} < threshold: {threshold:.2%})"
            )
            
            return Response({
                'status': 'requires_manual_review',
                'message': f'Confidence {confidence:.2%} below threshold {threshold:.2%} - manual review required',
                'log': InferenceLogSerializer(log).data
            }, status=200)


class RetrainingQueueViewSet(viewsets.ModelViewSet):
    queryset = RetrainingQueue.objects.filter(status__in=['PENDING', 'LABELED'])
    serializer_class = RetrainingQueueSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def label(self, request, pk=None):
        """
        Super Admin labels an inference snapshot with YOLO bounding boxes
        Requirement 1.5: Labeling UI
        """
        try:
            queue = self.get_object()
            
            queue.label_data = request.data.get('label_data')
            queue.status = 'LABELED'
            queue.labeled_by = request.user
            queue.save()
            
            logger.info(f"Labeled retraining sample {queue.id}")
            
            return Response(RetrainingQueueSerializer(queue).data)
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)
    
    @action(detail=False, methods=['post'])
    def batch_trigger_training(self, request):
        """
        Manually trigger training with selected samples
        Requirement 1.5: Trigger retraining
        """
        try:
            sample_ids = request.data.get('sample_ids', [])
            
            if not sample_ids:
                return Response({'error': 'No samples selected'}, status=400)
            
            # Get base model
            base_model = AIModel.objects.filter(is_active=True).first()
            if not base_model:
                return Response({'error': 'No active model'}, status=500)
            
            # Create training job
            job = TrainingJob.objects.create(
                base_model=base_model,
                status='QUEUED',
                epochs=request.data.get('epochs', 50),
                batch_size=request.data.get('batch_size', 32),
                learning_rate=request.data.get('learning_rate', 0.001),
                created_by=request.user
            )
            
            # Add samples to dataset
            samples = RetrainingQueue.objects.filter(id__in=sample_ids)
            for sample in samples:
                DatasetBuffer.objects.create(
                    training_job=job,
                    retraining_queue=sample,
                    is_included=True
                )
            
            # Trigger async training
            train_model.delay(job.id)
            
            logger.info(f"Training job {job.id} created with {len(sample_ids)} samples by {request.user}")
            
            return Response({
                'training_job_id': job.id,
                'status': 'queued',
                'samples_count': len(sample_ids)
            })
            
        except Exception as e:
            logger.error(f"Error triggering training: {str(e)}")
            return Response({'error': str(e)}, status=500)


class TrainingJobViewSet(viewsets.ModelViewSet):
    queryset = TrainingJob.objects.all()
    serializer_class = TrainingJobSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def deploy(self, request, pk=None):
        """
        Deploy trained model to production
        Requirement 1.5: Deploy version after training
        """
        try:
            job = self.get_object()
            
            if job.status != 'COMPLETED':
                return Response({'error': 'Only completed jobs can be deployed'}, status=400)
            
            model_name = request.data.get('model_name', f"{job.base_model.name}_retrained")
            
            # Trigger deployment task
            deploy_model_version.delay(job.id, model_name)
            
            return Response({
                'status': 'deployment_started',
                'job_id': job.id,
                'model_name': model_name
            })
            
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class DatasetBufferViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DatasetBuffer.objects.all()
    serializer_class = DatasetBufferSerializer
    permission_classes = [permissions.IsAuthenticated]


class OperatorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.filter(profile__role='USER').order_by('username')
    serializer_class = OperatorSerializer
    permission_classes = [IsAdminOnly]
