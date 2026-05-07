import base64
import io
import logging
from datetime import timedelta
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

logger = logging.getLogger(__name__)

# 🔑 Custom JWT View
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


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
    Real-time inference endpoint
    Receives image frame, runs YOLO detection, returns results with latency
    """
    try:
        from .model_loader import model_loader
        import time
        import cv2
        import numpy as np
        
        image_data = request.data.get('image')
        if not image_data:
            return Response({"error": "No image received"}, status=400)
        
        # Get active model
        model = model_loader.get_active_model()
        if not model:
            return Response({"error": "No active model loaded"}, status=500)
        
        # Decode image
        image_bytes = base64.b64decode(image_data.split(',')[1] if ',' in image_data else image_data)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if frame is None:
            return Response({"error": "Invalid image data"}, status=400)
        
        # Run inference
        start_time = time.time()
        results = model.predict(frame, conf=0.5, verbose=False)
        latency_ms = (time.time() - start_time) * 1000
        
        # Parse results
        detections = []
        confidence_scores = []
        
        for result in results:
            for box in result.boxes:
                detections.append({
                    'class': int(box.cls),
                    'confidence': float(box.conf),
                    'bbox': box.xyxy.tolist()[0]  # [x1, y1, x2, y2]
                })
                confidence_scores.append(float(box.conf))
        
        # Determine system decision
        system_decision = 'PASS' if len(detections) == 0 else 'FAIL'
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
        
        return Response({
            "system_decision": system_decision,
            "confidence": round(avg_confidence, 3),
            "detections": detections,
            "latency_ms": round(latency_ms, 2),
            "num_detections": len(detections)
        })
        
    except Exception as e:
        logger.error(f"Error in detect_image: {str(e)}")
        return Response({"error": str(e)}, status=500)


# ====================================
# 🔒 RBAC-ENABLED VIEWSETS
# ====================================

class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer
    permission_classes = [permissions.IsAuthenticated]
    
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
    permission_classes = [permissions.IsAuthenticated]


class AdminSettingsViewSet(viewsets.ModelViewSet):
    queryset = AdminSettings.objects.all().order_by('-id')
    serializer_class = AdminSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

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
    permission_classes = [permissions.IsAuthenticated]
