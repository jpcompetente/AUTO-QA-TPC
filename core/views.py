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
from PIL import Image

from .models import (
    UserProfile, AIModel, ComponentType, 
    AdminSettings, InferenceLog, RetrainingQueue,
    TrainingJob, DatasetBuffer
)
from .serializers import (
    AdminSettingsSerializer, ComponentTypeSerializer, 
    AIModelSerializer, InferenceLogSerializer, 
    RetrainingQueueSerializer, CustomTokenObtainPairSerializer,
    TrainingJobSerializer, DatasetBufferSerializer,
    OperatorSerializer
)
from .tasks import train_model, deploy_model_version
from .inference_services import InferenceFactory, orchestrator

logger = logging.getLogger(__name__)


def user_role(user):
    try:
        return user.profile.role
    except Exception:
        return ''


class IsAdminOrSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_role(request.user) in ('ADMIN', 'SUPER_ADMIN') or request.user.is_staff

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

    setting = AdminSettings.objects.filter(
        assigned_operator=request.user,
        is_active=True,
    ).select_related('component', 'model', 'assigned_operator').order_by('-id').first()

    if not setting:
        return Response(
            {'error': 'No active inspection preset assigned to this operator'},
            status=404,
        )

    return Response(AdminSettingsSerializer(setting).data)


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
    operators = User.objects.filter(profile__role='OPERATOR')
    
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
    """
    try:
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
        active_preset = None
        if operator and user_role(operator) == 'OPERATOR':
            active_preset = AdminSettings.objects.filter(
                assigned_operator=operator,
                is_active=True,
            ).select_related('component', 'model').order_by('-id').first()
            if not active_preset or not active_preset.model:
                return Response(
                    {'error': 'No active inspection preset assigned to this operator'},
                    status=403,
                )

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

        component = active_preset.component if active_preset else None
        component_id = request.data.get('component') or request.data.get('component_id')
        if component is None and component_id:
            component = ComponentType.objects.filter(id=component_id).first()

        confidence = float(
            request.data.get(
                'confidence',
                active_preset.confidence_threshold if active_preset else getattr(settings, 'INFERENCE_CONFIDENCE_THRESHOLD', 0.5),
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

        if result.system_decision == 'FAIL':
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
            latency_ms=result.latency_ms,
            confidence_score=result.confidence,
            system_decision=result.system_decision,
            final_decision=result.system_decision,
            status='PENDING',
            session_id=request.data.get('session_id', ''),
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
    permission_classes = [IsAdminOrSuperAdmin]
    
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
    permission_classes = [IsAdminOrSuperAdmin]


class AdminSettingsViewSet(viewsets.ModelViewSet):
    queryset = AdminSettings.objects.all().order_by('-id')
    serializer_class = AdminSettingsSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(admin=self.request.user)
    
    @action(detail=True, methods=['get'])
    def assigned_operator_sessions(self, request, pk=None):
        """Get all inference logs for assigned operator"""
        setting = self.get_object()
        if not setting.assigned_operator:
            return Response({'error': 'No operator assigned'}, status=400)
        
        logs = InferenceLog.objects.filter(
            operator=setting.assigned_operator,
            component=setting.component
        ).order_by('-timestamp')[:100]
        
        serializer = InferenceLogSerializer(logs, many=True)
        return Response(serializer.data)


class InferenceLogViewSet(viewsets.ModelViewSet):
    queryset = InferenceLog.objects.all().order_by('-timestamp')
    serializer_class = InferenceLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['operator', 'status', 'final_decision']
    
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
    queryset = User.objects.filter(profile__role='OPERATOR').order_by('username')
    serializer_class = OperatorSerializer
    permission_classes = [IsAdminOrSuperAdmin]
