"""
Celery Tasks for Asynchronous Operations
Requirement 1.5: Continuous Learning Pipeline - Background training jobs
"""

import logging
import os
import json
import shutil
import subprocess
from datetime import datetime
from importlib.util import find_spec
from django.conf import settings
from celery import shared_task
from asgiref.sync import async_to_sync
import asyncio


LABEL_MAP = {"SCRATCH": 0, "defect": 0}


def prepare_yolo_dataset(job, dataset_path):
    """Copy images and convert Label Studio polygon annotations to YOLO segment format."""
    from .models import DatasetBuffer

    images_dir = os.path.join(dataset_path, "images", "train")
    labels_dir = os.path.join(dataset_path, "labels", "train")
    val_images_dir = os.path.join(dataset_path, "images", "val")
    val_labels_dir = os.path.join(dataset_path, "labels", "val")
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(labels_dir, exist_ok=True)
    os.makedirs(val_images_dir, exist_ok=True)
    os.makedirs(val_labels_dir, exist_ok=True)

    buffers = DatasetBuffer.objects.filter(training_job=job, is_included=True).select_related(
        "retraining_queue", "retraining_queue__log_entry"
    )

    count = 0
    for buf in buffers:
        sample = buf.retraining_queue
        log = sample.log_entry
        if not log or not log.image_snapshot:
            continue
        if not sample.label_data:
            continue

        src_path = log.image_snapshot.path
        if not os.path.exists(src_path):
            continue

        filename = f"sample_{sample.id}.png"
        dst_path = os.path.join(images_dir, filename)
        shutil.copyfile(src_path, dst_path)

        label_lines = []
        for annotation in sample.label_data:
            value = annotation.get("value", {})
            points = value.get("points", [])
            labels = value.get("polygonlabels", [])
            if not points or not labels:
                continue
            class_id = LABEL_MAP.get(labels[0], 0)
            coords = []
            for px, py in points:
                coords.append(f"{px / 100:.6f}")
                coords.append(f"{py / 100:.6f}")
            label_lines.append(f"{class_id} " + " ".join(coords))

        if label_lines:
            label_filename = f"sample_{sample.id}.txt"
            with open(os.path.join(labels_dir, label_filename), "w") as lf:
                lf.write("\n".join(label_lines))
            count += 1

    # Copy a couple of training samples into val as well so YOLO has something to validate against
    train_images = os.listdir(images_dir)
    for fname in train_images[:max(1, len(train_images) // 5)]:
        shutil.copyfile(os.path.join(images_dir, fname), os.path.join(val_images_dir, fname))
        label_fname = fname.rsplit(".", 1)[0] + ".txt"
        label_src = os.path.join(labels_dir, label_fname)
        if os.path.exists(label_src):
            shutil.copyfile(label_src, os.path.join(val_labels_dir, label_fname))

    return count

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
        
        # Prepare dataset � copy images and convert annotations
        logger.info(f"Preparing training dataset for job {training_job_id}...")
        prepared_count = prepare_training_dataset(job, dataset_path)
        if prepared_count == 0:
            raise ValueError("No valid training samples found. Dataset preparation failed.")
        logger.info(f"Dataset ready: {prepared_count} samples prepared")

        # Prepare data.yaml for YOLO training
        data_yaml_path = os.path.join(dataset_path, 'data.yaml')
        if not os.path.exists(data_yaml_path):
            create_dataset_yaml(dataset_path, data_yaml_path)

        # Copy images and convert annotations to YOLO format
        prepared_count = prepare_yolo_dataset(job, dataset_path)
        logger.info(f"Prepared {prepared_count} labeled samples for training job {training_job_id}")
        if prepared_count == 0:
            raise ValueError("No labeled samples with valid annotations were found for this training job")
        
        # Run YOLO training
        train_cmd = [
            'yolo', 'segment', 'train',
            f'model={model_path}',
            f'data={data_yaml_path}',
            f'epochs={epochs}',
            f'batch={batch_size}',
            f'imgsz=640',
            f'device=cpu',
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
            encoding='utf-8',
            errors='replace',
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
            # Find the actual weights folder (YOLO may append -2, -3, -4 if folder exists)
            import glob
            weights_candidates = glob.glob(os.path.join(output_dir, 'weights*', 'weights', 'best.pt'))
            if weights_candidates:
                new_weights_path = sorted(weights_candidates)[-1]  # latest one
            else:
                new_weights_path = os.path.join(output_dir, 'weights', 'best.pt')
            
            if os.path.exists(new_weights_path):
                # Save new weights
                job.new_weights_path.name = os.path.relpath(new_weights_path, settings.MEDIA_ROOT).replace(os.sep, '/')
                job.status = 'COMPLETED'
                job.completed_at = datetime.now()
                
                # Parse actual metrics from YOLO results.csv
                import glob as _glob, csv as _csv
                csv_candidates = _glob.glob(os.path.join(output_dir, 'weights*', 'results.csv'))
                actual_map50 = 0.0
                if csv_candidates:
                    try:
                        with open(sorted(csv_candidates)[-1], 'r') as _f:
                            rows = list(_csv.DictReader(_f))
                            if rows:
                                key = next((k for k in rows[-1] if 'mAP50(B)' in k), None)
                                if key:
                                    actual_map50 = float(rows[-1][key].strip())
                        logger.info(f"Parsed mAP50: {actual_map50}")
                    except Exception as _e:
                        logger.warning(f"Could not parse results.csv: {_e}")
                job.metrics = {
                    'mAP50': actual_map50,
                    'completed_at': datetime.now().isoformat(),
                }
                
                logger.info(f"Training job {training_job_id} completed successfully")
                
                # Mark all used samples as TRAINED so they won't be retrained
                used_sample_ids = DatasetBuffer.objects.filter(
                    training_job=job, is_included=True
                ).values_list('retraining_queue_id', flat=True)
                RetrainingQueue.objects.filter(id__in=used_sample_ids).update(status='TRAINED')
                logger.info(f"Marked {len(used_sample_ids)} samples as TRAINED")
                
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

        # Prevent duplicate deployment of the same training job's weights
        existing_model = AIModel.objects.filter(file_path_pt=job.new_weights_path.name).first()
        if existing_model:
            logger.info(
                f"Model for training job {training_job_id} already deployed as "
                f"AIModel {existing_model.id} ({existing_model.name} {existing_model.version}). Skipping duplicate creation."
            )
            new_model = existing_model
        else:
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


def prepare_training_dataset(job, dataset_path: str):
    """
    Prepare YOLO training dataset from labeled RetrainingQueue items.
    - Copies images to images/train/ or images/val/
    - Converts Label Studio polygon (%) to YOLO bbox txt files in labels/train/ or labels/val/
    80/20 train/val split.
    """
    import shutil
    import random

    CLASS_MAP = {
        'SCRATCH': 0,
        'DEFECT': 0,
        'defect': 0,
        'scratch': 0,
    }

    buffer_items = DatasetBuffer.objects.filter(
        training_job=job, is_included=True
    ).select_related('retraining_queue__log_entry')

    items = list(buffer_items)
    if not items:
        logger.warning("No items in DatasetBuffer for this training job")
        return 0

    random.shuffle(items)
    split_idx = max(1, int(len(items) * 0.8))
    train_items = items[:split_idx]
    val_items = items[split_idx:]

    prepared = 0

    for split_name, split_items in [('train', train_items), ('val', val_items)]:
        img_dir = os.path.join(dataset_path, 'images', split_name)
        lbl_dir = os.path.join(dataset_path, 'labels', split_name)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

        for buf in split_items:
            try:
                queue_item = buf.retraining_queue
                log = queue_item.log_entry
                label_data = queue_item.label_data

                if not label_data:
                    logger.warning(f"No label_data for RetrainingQueue {queue_item.id}, skipping")
                    continue

                src_image = os.path.join(settings.MEDIA_ROOT, str(log.image_snapshot))
                if not os.path.exists(src_image):
                    logger.warning(f"Image not found: {src_image}, skipping")
                    continue

                img_filename = f"rq_{queue_item.id}_{os.path.basename(src_image)}"
                dst_image = os.path.join(img_dir, img_filename)
                shutil.copy2(src_image, dst_image)

                label_lines = []
                for annotation in label_data:
                    if annotation.get('type') != 'polygonlabels':
                        continue

                    value = annotation.get('value', {})
                    points = value.get('points', [])
                    poly_labels = value.get('polygonlabels', [])

                    if not points or not poly_labels:
                        continue

                    label_name = poly_labels[0].upper()
                    class_id = CLASS_MAP.get(label_name, CLASS_MAP.get(poly_labels[0], 0))

                    # YOLO segmentation format: class x1 y1 x2 y2 ... (normalized 0-1)
                    coords = []
                    for p in points:
                        coords.append(f"{p[0]/100.0:.6f} {p[1]/100.0:.6f}")
                    label_lines.append(f"{class_id} " + " ".join(coords))

                if not label_lines:
                    logger.warning(f"No valid annotations for RetrainingQueue {queue_item.id}, skipping")
                    continue

                lbl_filename = os.path.splitext(img_filename)[0] + '.txt'
                dst_label = os.path.join(lbl_dir, lbl_filename)
                with open(dst_label, 'w') as f:
                    f.write('\n'.join(label_lines))

                prepared += 1
                logger.info(f"Prepared [{split_name}] {img_filename} with {len(label_lines)} annotation(s)")

            except Exception as e:
                logger.error(f"Error preparing item {buf.id}: {str(e)}")
                continue

    logger.info(f"Dataset preparation complete: {prepared} items prepared")
    return prepared
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



