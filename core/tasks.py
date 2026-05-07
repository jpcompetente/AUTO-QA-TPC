"""
Celery Tasks for Asynchronous Operations
Requirement 1.5: Continuous Learning Pipeline - Background training jobs
"""

import logging
import os
import json
import subprocess
from datetime import datetime
from importlib.util import find_spec
from django.conf import settings
from celery import shared_task
from asgiref.sync import async_to_sync
import asyncio

from .models import (
    TrainingJob, RetrainingQueue, DatasetBuffer, 
    AIModel, InferenceLog
)

logger = logging.getLogger(__name__)

if find_spec("channels") is not None:
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
else:
    channel_layer = None


@shared_task(bind=True)
def train_model(self, training_job_id: int, epochs: int = 50, batch_size: int = 32):
    """
    Background task to train/fine-tune a YOLO model
    Triggered when retraining queue reaches threshold
    
    Args:
        training_job_id: ID of the TrainingJob instance
        epochs: Number of training epochs
        batch_size: Batch size for training
    """
    try:
        job = TrainingJob.objects.get(id=training_job_id)
        job.status = 'RUNNING'
        job.started_at = datetime.now()
        job.save()
        
        logger.info(f"Starting training job {training_job_id}")
        
        # Get base model path
        base_model = job.base_model
        if not base_model.file_path_pt:
            raise FileNotFoundError(f"Base model file not found for {base_model.name}")
        
        model_path = str(base_model.file_path_pt.path)
        dataset_path = os.path.join(settings.MEDIA_ROOT, 'training_dataset')
        
        # Ensure dataset directory exists
        os.makedirs(dataset_path, exist_ok=True)
        
        # Build YOLO training command
        output_dir = os.path.join(settings.MEDIA_ROOT, 'training_outputs', f'run_{training_job_id}')
        os.makedirs(output_dir, exist_ok=True)
        
        # Prepare data.yaml for YOLO training
        data_yaml_path = os.path.join(dataset_path, 'data.yaml')
        if not os.path.exists(data_yaml_path):
            create_dataset_yaml(dataset_path, data_yaml_path)
        
        # Run YOLO training
        train_cmd = [
            'yolo', 'detect', 'train',
            f'model={model_path}',
            f'data={data_yaml_path}',
            f'epochs={epochs}',
            f'batch={batch_size}',
            f'imgsz=640',
            f'device=0',  # GPU device
            f'project={output_dir}',
            f'name=weights',
            'patience=20',  # Early stopping
        ]
        
        logger.info(f"Running training command: {' '.join(train_cmd)}")
        
        # Execute training with real-time log streaming
        process = subprocess.Popen(
            train_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            universal_newlines=True
        )
        
        # Stream logs and update job
        for line in process.stdout:
            job.logs += line + '\n'
            
            # Parse epoch information
            if 'Epoch' in line:
                try:
                    # Example: "Epoch 1/50"
                    epoch_info = line.split('Epoch')[1].split('/')[0].strip()
                    job.current_epoch = int(epoch_info)
                except:
                    pass
            
            # Broadcast progress update via WebSocket
            broadcast_training_progress(training_job_id, job.current_epoch, epochs, line)
            
            job.save()
        
        returncode = process.wait()
        
        if returncode == 0:
            # Training successful
            new_weights_path = os.path.join(output_dir, 'weights', 'best.pt')
            
            if os.path.exists(new_weights_path):
                # Save new weights
                job.new_weights_path.name = f'training_outputs/run_{training_job_id}/weights/best.pt'
                job.status = 'COMPLETED'
                job.completed_at = datetime.now()
                
                # Extract metrics (placeholder - parse from YOLO output)
                job.metrics = {
                    'mAP50': 0.95,  # TODO: Parse from YOLO results.csv
                    'completed_at': datetime.now().isoformat(),
                }
                
                logger.info(f"Training job {training_job_id} completed successfully")
                
                # Notify Super Admin
                notify_training_complete(training_job_id, new_weights_path)
            else:
                raise FileNotFoundError(f"Best weights not found at {new_weights_path}")
        else:
            job.status = 'FAILED'
            job.logs += f'\nTraining failed with return code: {returncode}'
            logger.error(f"Training job {training_job_id} failed")
        
        job.save()
        
    except Exception as e:
        logger.error(f"Error in training job {training_job_id}: {str(e)}")
        try:
            job = TrainingJob.objects.get(id=training_job_id)
            job.status = 'FAILED'
            job.logs += f'\nError: {str(e)}'
            job.save()
        except:
            pass


@shared_task
def check_retraining_queue():
    """
    Periodic task (every 5 minutes) to check if retraining queue
    has reached threshold and needs to trigger model retraining
    """
    try:
        # Check if there are pending labeled samples
        pending_samples = RetrainingQueue.objects.filter(status='LABELED').count()
        threshold = 100  # Retraining threshold (configurable)
        
        logger.info(f"Retraining queue check: {pending_samples} pending samples (threshold: {threshold})")
        
        if pending_samples >= threshold:
            logger.info(f"Retraining threshold reached! Creating training job...")
            
            # Get base model
            base_model = AIModel.objects.filter(is_active=True).first()
            if not base_model:
                logger.warning("No active model found for retraining")
                return
            
            # Create training job
            job = TrainingJob.objects.create(
                base_model=base_model,
                status='QUEUED',
                epochs=50,
                batch_size=32,
                learning_rate=0.001,
            )
            
            # Mark samples for inclusion in dataset
            samples = RetrainingQueue.objects.filter(status='LABELED')[:threshold]
            for sample in samples:
                DatasetBuffer.objects.create(
                    training_job=job,
                    retraining_queue=sample,
                    is_included=True
                )
            
            # Trigger training task
            train_model.delay(job.id)
            logger.info(f"Training job {job.id} queued for {pending_samples} samples")
        
    except Exception as e:
        logger.error(f"Error in check_retraining_queue: {str(e)}")


@shared_task
def label_inference_snapshot(inference_log_id: int, label_data: dict):
    """
    Process labeled inference snapshot and add to retraining queue
    Called when Super Admin completes labeling on inference snapshots
    
    Args:
        inference_log_id: ID of InferenceLog
        label_data: YOLO format label data (bounding boxes, classes)
    """
    try:
        log = InferenceLog.objects.get(id=inference_log_id)
        
        # Get or create retraining queue entry
        queue_entry, created = RetrainingQueue.objects.get_or_create(
            log_entry=log,
            defaults={'status': 'PENDING'}
        )
        
        # Update with label data
        queue_entry.label_data = label_data
        queue_entry.status = 'LABELED'
        queue_entry.save()
        
        logger.info(f"Labeled inference snapshot {inference_log_id}")
        
        # Check if we should trigger retraining
        check_retraining_queue.delay()
        
    except InferenceLog.DoesNotExist:
        logger.error(f"InferenceLog {inference_log_id} not found")


@shared_task
def deploy_model_version(training_job_id: int, new_model_name: str):
    """
    Deploy a trained model version to production
    Creates new AIModel entry and optionally activates it
    
    Args:
        training_job_id: ID of completed TrainingJob
        new_model_name: Name for new model version
    """
    try:
        job = TrainingJob.objects.get(id=training_job_id)
        
        if job.status != 'COMPLETED':
            logger.warning(f"Cannot deploy incomplete job {training_job_id}")
            return
        
        # Create new model version
        new_model = AIModel.objects.create(
            name=new_model_name,
            version=f"v{AIModel.objects.filter(name=new_model_name).count() + 1}",
            file_path_pt=job.new_weights_path,
            model_format='PT',
            mAP=job.metrics.get('mAP50', 0) if job.metrics else 0,
            is_deployment_ready=True,
            created_by=job.created_by,
        )
        
        logger.info(f"New model version created: {new_model.id} - {new_model}")
        
        # Optionally activate if metrics are better than current
        current_active = AIModel.objects.filter(is_active=True).first()
        if not current_active or new_model.mAP > (current_active.mAP or 0):
            if current_active:
                current_active.is_active = False
                current_active.save()
            new_model.is_active = True
            new_model.save()
            logger.info(f"Activated new model: {new_model}")
        
        # Notify Super Admin about deployment
        notify_deployment_ready(training_job_id, new_model.id)
        
    except TrainingJob.DoesNotExist:
        logger.error(f"TrainingJob {training_job_id} not found")


# Helper Functions

def create_dataset_yaml(dataset_path: str, yaml_path: str):
    """Create data.yaml for YOLO training"""
    yaml_content = f"""
path: {dataset_path}
train: images/train
val: images/val
test: images/test

nc: 1  # Number of classes
names: ['defect']  # Class names
"""
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    logger.info(f"Created data.yaml at {yaml_path}")


def broadcast_training_progress(training_job_id: int, current_epoch: int, total_epochs: int, log_line: str):
    """Broadcast training progress via WebSocket"""
    if channel_layer is None:
        return

    try:
        room_name = f'training_progress_{training_job_id}'
        async_to_sync(channel_layer.group_send)(
            room_name,
            {
                'type': 'progress_update',
                'status': 'running',
                'current_epoch': current_epoch,
                'total_epochs': total_epochs,
                'log_line': log_line.strip(),
            }
        )
    except Exception as e:
        logger.error(f"Error broadcasting training progress: {str(e)}")


def notify_training_complete(training_job_id: int, weights_path: str):
    """Notify Super Admin that training is complete"""
    if channel_layer is None:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            f'training_progress_{training_job_id}',
            {
                'type': 'progress_update',
                'status': 'completed',
                'weights_path': str(weights_path),
                'message': 'Training completed. Ready for deployment review.'
            }
        )
    except Exception as e:
        logger.error(f"Error notifying training complete: {str(e)}")


def notify_deployment_ready(training_job_id: int, model_id: int):
    """Notify Super Admin about deployment readiness"""
    if channel_layer is None:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            'metrics_broadcast',
            {
                'type': 'metrics_update',
                'event': 'deployment_ready',
                'training_job_id': training_job_id,
                'model_id': model_id,
                'message': f'New model version is ready for deployment!'
            }
        )
    except Exception as e:
        logger.error(f"Error notifying deployment ready: {str(e)}")
