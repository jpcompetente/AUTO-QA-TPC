"""
WebSocket consumers for real-time monitoring and streaming
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from .models import InferenceLog, TrainingJob

logger = logging.getLogger(__name__)


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
