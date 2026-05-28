# AUTO-QA TPC: Simplified System Flow

**Date**: May 28, 2026
**Status**: Draft — updated to match repository layout

---

## Overview

This document explains the simplified runtime architecture and data flow for AUTO-QA TPC, aligned with the current repository layout. The system has three primary runtime components: the React frontend (`frontend-vite`), the Django backend (`ai_ins_sys` + `core` app), and the separate inference service (`inference_server`). Background work is handled by Celery workers.

## Key Components (where to look)

- Frontend: [frontend-vite](frontend-vite/)
- Django ASGI entry: [ai_ins_sys/asgi.py](ai_ins_sys/asgi.py)
- Model loader / hot-swap: [core/model_loader.py](core/model_loader.py)
- Inference service (FastAPI): [inference_server/app.py](inference_server/app.py)
- Retraining queue & models: [core/models.py](core/models.py)
- Retraining APIs & orchestration: [core/views.py](core/views.py)

## Simplified Data Flow (high level)

1. Operator (USER) captures image(s) from the browser UI (camera or file). The frontend streams or posts images to the backend or directly to the inference service.
2. Inference request is handled either by the Django backend (which may proxy to the inference service) or directly by the FastAPI inference service at `/predict` in `inference_server/app.py`.
3. Inference results (detections, confidence, masks, annotated image) are returned to the caller. The backend persists a record in `InferenceLog` (see `core/models.py`).
4. Low-confidence or operator-overridden logs are added to the retraining queue (`RetrainingQueue` / `RetrainingBatch` in `core/models.py`).
5. Admin creates an export from the retraining queue — images/tasks are exported to Label Studio for labeling.
6. Labeled data is imported back and queued as a Celery retraining job. Celery workers perform training, evaluation, and, if passing thresholds, save a new `AIModel` version.
7. Model deployment: the new model weights become discoverable by the inference service and the Django model loader can hot-swap the active model (see `core/model_loader.py`). Frontend sessions pick up the new model on the next inference or reload.

## Minimal Mermaid Flow

```mermaid
flowchart LR
  A[Operator (Browser)] -->|REST / WebSocket| B[Django Backend (ai_ins_sys/core)]
  B -->|Store| C[(Postgres DB)]
  B -->|Proxy or direct| D[Inference Service (inference_server/app.py)]
  D -->|Predict| B
  B -->|Persist| C
  C -->|Low-confidence| E[Retraining Queue (core.models)]
  E -->|Export| F[Label Studio]
  F -->|Labeled Data| G[Celery Retrain Job]
  G -->|Train & Validate| H[New Model Weights]
  H -->|Publish| D
  H -->|Hot-swap| B
```

## Implementation notes / important files

- WebSocket support is enabled when `channels` is installed; see [ai_ins_sys/asgi.py](ai_ins_sys/asgi.py).
- Model hot-swap and caching logic lives in [core/model_loader.py](core/model_loader.py).
- The inference service runs as a separate FastAPI app at `inference_server/app.py` and exposes `/predict` and `/health` endpoints.
- The retraining flow and queue live in `core/models.py` and are orchestrated in `core/views.py` and Celery tasks (see `ai_ins_sys/celery.py`).

## Phases (concise)

### Phase 1 — Role Simplification & Operator UI (short)
- Goal: reduce roles to `USER` and `ADMIN`, provide a single, simple Operator page.
- Key deliverables:
    - DB: consolidate role values in `core/models.py` and add a small data migration to remap existing roles.
    - Frontend: add/clean `frontend-vite/src/components/OperatorPanel.jsx`, ensure WebSocket or REST streaming to backend/inference service.
    - Backend: replace scattered role checks in `core/views.py` and `core/consumers.py` with simple `IsUser` / `IsAdmin` permission helpers.
    - Tests: basic integration test verifying operator page can send an image and receive a persisted `InferenceLog`.

### Phase 2 — Admin Batch Dashboard & Label Studio Integration (short)
- Goal: allow Admins to collect low-confidence logs, create batches, export to Label Studio, and trigger retraining.
- Key deliverables:
    - Models/APIs: `RetrainingQueue` / `RetrainingBatch` models in `core/models.py` and REST endpoints in `core/views.py`.
    - Connector: `core/label_studio_connector.py` (export/upload/import helpers) and settings entries for Label Studio credentials.
    - Frontend: `frontend-vite/src/components/AdminBatchDashboard.jsx` and supporting components to list batches, select low-confidence logs, and trigger export/train actions.
    - Celery tasks: import/export tasks and `retrain_model` orchestration in `core/tasks.py` (enqueue/monitor training, publish new `AIModel`).
    - Tests: API tests for batch creation, export flow stub (can be mocked), and a smoke test for queueing a retrain job.

## Next steps (recommended)

1. Verify exact API routes used by the frontend (`frontend-vite/src`) and confirm whether the frontend calls the Django endpoints or the inference service directly.
2. Add minimal diagrams to the README and link this file from `docs/SYSTEM_OVERVIEW.md`.
3. Implement Label Studio connectors in `core/label_studio_connector.py` and add endpoints for export/import in `core/views.py`.

---

If you'd like, I can now:
- open and update `frontend-vite/src` references to the actual endpoints; or
- implement a concise `core/label_studio_connector.py` stub; or
- run lint/tests for the inference server.

from django.conf import settings

class LabelStudioConnector:
    """
    Manage Label Studio API interactions
    """
    
    def __init__(self):
        self.api_url = settings.LABEL_STUDIO_URL
        self.api_key = settings.LABEL_STUDIO_API_KEY
        self.headers = {
            'Authorization': f'Token {self.api_key}',
            'Content-Type': 'application/json'
        }
    
    def create_project(self, project_name, label_config):
        """
        Create new Label Studio project
        """
        data = {
            'title': project_name,
            'label_config': label_config,
            'sampling': 'sequential'
        }
        response = requests.post(
            f'{self.api_url}/api/projects/',
            json=data,
            headers=self.headers
        )
        return response.json()
    
    def upload_images(self, project_id, image_paths):
        """
        Upload images to Label Studio project
        """
        tasks = []
        for img_path in image_paths:
            task_data = {
                'data': {
                    'image': f'{settings.MEDIA_URL}{img_path}'
                }
            }
            tasks.append(task_data)
        
        # Bulk import
        data = {'tasks': tasks}
        response = requests.post(
            f'{self.api_url}/api/projects/{project_id}/import',
            json=data,
            headers=self.headers
        )
        return response.json()
    
    def get_labeled_tasks(self, project_id):
        """
        Fetch completed labeled tasks
        """
        response = requests.get(
            f'{self.api_url}/api/projects/{project_id}/tasks',
            params={'completed': True},
            headers=self.headers
        )
        return response.json()
    
    def download_annotations(self, project_id, format='yolo'):
        """
        Export annotations in specific format
        """
        response = requests.get(
            f'{self.api_url}/api/projects/{project_id}/export',
            params={'format': format},
            headers=self.headers
        )
        return response.content
```

**Files to Create**:
- ✅ `core/label_studio_connector.py` (NEW)

**Settings Updates**:
```python
# ai_ins_sys/settings.py

# Label Studio Configuration
LABEL_STUDIO_URL = env('LABEL_STUDIO_URL', default='http://localhost:8080')
LABEL_STUDIO_API_KEY = env('LABEL_STUDIO_API_KEY')
LABEL_STUDIO_LABEL_CONFIG = """
<View>
  <Image name="image" value="$image"/>
  <Choices name="label" toName="image">
    <Choice value="defect"/>
    <Choice value="ok"/>
  </Choices>
  <RectangleLabeler name="bbox" toName="image">
    <Label value="defect"/>
    <Label value="ok"/>
  </RectangleLabeler>
</View>
"""
```

#### 2.4 Frontend: Admin Batch Dashboard
**Location**: `frontend-vite/src/components/AdminBatchDashboard.jsx`

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│ Admin Panel - Batch Management              [Dashboard] [Logs] │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📊 BATCH SUMMARY                                               │
│ ├─ Total Batches: 12                                           │
│ ├─ In Training: 1                                              │
│ ├─ Ready to Export: 3                                          │
│ └─ Completed: 8                                                │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📦 BATCHES                                                     │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Batch ID    Status       Images  Created    Actions      │  │
│ ├──────────────────────────────────────────────────────────┤  │
│ │ #001        READY        45      May-24    [Export]     │  │
│ │ #002        TRAINING     52      May-23    [Cancel]     │  │
│ │ #003        LABELED      67      May-22    [Train]      │  │
│ │ #004        COMPLETED    58      May-20    [Results]    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ 📈 LATEST BATCH RESULTS                                        │
│ ├─ Model: YOLOv8 v3.2                                         │
│ ├─ mAP: 0.94 (+0.03 improvement)                              │
│ ├─ Accuracy: 96.2% (+1.8%)                                    │
│ └─ [Promote to Production]                                    │
│                                                                 │
│ 🔍 LOW CONFIDENCE LOGS (Not in batch)                         │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Select [45 images] [Create Batch] [View All]            │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Components**:
```jsx
<AdminBatchDashboard>
  ├─ <BatchSummary />
  ├─ <BatchTable>
  │  ├─ Status badge
  │  ├─ Image count
  │  └─ Action buttons
  ├─ <LatestResults />
  └─ <LowConfidenceLogsPanel />
     ├─ Count display
     ├─ Selection checkbox
     └─ "Create Batch" button
```

**Files to Create**:
- ✅ `frontend-vite/src/components/AdminBatchDashboard.jsx` (NEW)
- ✅ `frontend-vite/src/components/BatchTable.jsx` (NEW)
- ✅ `frontend-vite/src/components/BatchDetailsModal.jsx` (NEW)
- ✅ `frontend-vite/src/styles/admin-batch.css` (NEW)

#### 2.5 Testing
- [ ] Batch creation works
- [ ] Low-confidence logs collected correctly
- [ ] Batch export to Label Studio succeeds
- [ ] Batch status transitions work
- [ ] Admin dashboard displays correctly
- [ ] Permission checks prevent USER access

---

### 🤖 PHASE 3: Auto-Retraining Pipeline (Week 3-4)
**Effort**: 12-14 hours  
**Goal**: Fully automated retraining from labeled data to model deployment

#### 3.1 Celery Tasks for Retraining

**New Module**: `core/tasks.py` (UPDATE)

```python
from celery import shared_task
import logging
import torch
from ultralytics import YOLO
import os

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def import_labels_from_label_studio(self, batch_id):
    """
    1. Download labeled annotations from Label Studio
    2. Convert to YOLO format
    3. Store locally
    """
    try:
        batch = RetrainingBatch.objects.get(id=batch_id)
        connector = LabelStudioConnector()
        
        # Download annotations
        annotations = connector.get_labeled_tasks(batch.label_studio_project_id)
        
        # Convert to YOLO format
        dataset_path = f"datasets/batch_{batch_id}"
        os.makedirs(f"{dataset_path}/images", exist_ok=True)
        os.makedirs(f"{dataset_path}/labels", exist_ok=True)
        
        for task in annotations:
            img_path = task['data']['image']
            annotations_data = task['annotations']
            
            # Process and save
            # ...
        
        batch.status = 'LABELED'
        batch.labeled_at = timezone.now()
        batch.save()
        
        logger.info(f"Batch {batch_id} labels imported successfully")
        
    except Exception as exc:
        logger.error(f"Error importing labels: {exc}")
        self.retry(exc=exc, countdown=60)

@shared_task(bind=True, max_retries=2)
def retrain_model(self, batch_id):
    """
    2. Train new model with labeled data
    3. Validate performance
    4. Save if improved
    """
    try:
        batch = RetrainingBatch.objects.get(id=batch_id)
        batch.status = 'TRAINING'
        batch.training_started_at = timezone.now()
        batch.save()
        
        logger.info(f"Starting retraining for batch {batch_id}")
        
        # Load base model
        base_model = batch.model_version_before
        model = YOLO(base_model.file_path_pt.path)
        
        # Prepare dataset
        dataset_path = f"datasets/batch_{batch_id}/data.yaml"
        
        # Train
        results = model.train(
            data=dataset_path,
            epochs=50,
            imgsz=640,
            device=0,  # GPU
            patience=5,
            save=True
        )
        
        # Evaluate
        metrics = results.results_dict
        
        # Check if improvement
        if metrics['mAP50'] > base_model.mAP:
            improvement = ((metrics['mAP50'] - base_model.mAP) / base_model.mAP) * 100
            
            # Save new model
            new_model = AIModel.objects.create(
                name=base_model.name,
                version=f"{base_model.version}_retrained",
                model_format='PT',
                file_path_pt=f"models/weights/best_{batch_id}.pt",
                mAP=metrics['mAP50'],
                avg_speed_ms=metrics['speed']['inference'],
                accuracy=metrics['fitness']
            )
            
            batch.status = 'COMPLETED'
            batch.model_version_after = new_model
            batch.new_model_accuracy = metrics['fitness']
            batch.new_model_mAP = metrics['mAP50']
            batch.improvement_percent = improvement
            batch.training_completed_at = timezone.now()
            batch.save()
            
            logger.info(f"Batch {batch_id} training completed with {improvement:.2f}% improvement")
            
            # Trigger deployment
            deploy_model.delay(new_model.id)
        else:
            batch.status = 'FAILED'
            batch.save()
            logger.warning(f"Model did not improve for batch {batch_id}")
        
    except Exception as exc:
        logger.error(f"Error in retraining: {exc}")
        batch.status = 'FAILED'
        batch.save()
        self.retry(exc=exc, countdown=120)

@shared_task
def deploy_model(model_id):
    """
    3. Deploy new model to production
    4. Update active configuration
    5. Restart inference server
    """
    try:
        model = AIModel.objects.get(id=model_id)
        
        logger.info(f"Deploying model {model.name} v{model.version}")
        
        # Update active configuration
        active_config = ActiveConfiguration.objects.latest('created_at')
        active_config.ai_model = model
        active_config.save()
        
        # Restart inference server (via signal or API)
        # Option 1: SSH restart
        # os.system(f"ssh inference-server 'systemctl restart inference'")
        
        # Option 2: API call
        import requests
        response = requests.post(
            'http://localhost:8001/api/reload-model/',
            json={'model_id': model.id}
        )
        
        logger.info(f"Model {model.name} deployed successfully")
        
    except Exception as exc:
        logger.error(f"Error deploying model: {exc}")

@shared_task
def auto_create_batch_if_ready():
    """
    Periodically check if we should create a new batch
    (e.g., when >= 30 low-confidence logs exist)
    """
    low_conf_count = InferenceLog.objects.filter(
        is_low_confidence=True,
        included_in_batch__isnull=True
    ).count()
    
    if low_conf_count >= 30:
        logs = InferenceLog.objects.filter(
            is_low_confidence=True,
            included_in_batch__isnull=True
        )[:30]
        
        batch = RetrainingBatch.objects.create(
            batch_name=f"Auto-Batch {timezone.now().strftime('%Y%m%d-%H%M%S')}",
            image_count=logs.count()
        )
        batch.inference_logs.set(logs)
        
        logger.info(f"Auto-created batch {batch.id} with {logs.count()} images")
```

**Files to Update**:
- ✅ `core/tasks.py` - Add/update tasks
- ✅ `ai_ins_sys/celery.py` - Ensure Celery configured

#### 3.2 Scheduled Tasks

**Settings Update**:
```python
# ai_ins_sys/settings.py

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-low-confidence-batch': {
        'task': 'core.tasks.auto_create_batch_if_ready',
        'schedule': crontab(minute=0, hour='*/4'),  # Every 4 hours
    },
}
```

#### 3.3 Model Deployment Strategy

**Process**:
```
1. Model trained with new data
2. Validation shows improvement
3. New model version created
4. Active configuration updated
5. Inference server reloaded
6. Rollback capability maintained
   └─ Store old model reference
   └─ Can quickly revert if issues
```

**Fallback Plan**:
```python
class ModelDeploymentRollback:
    @staticmethod
    def quick_rollback(model_id):
        """Revert to previous working model"""
        current_config = ActiveConfiguration.objects.latest('created_at')
        
        # Get previous model from history
        previous_model = AIModel.objects.filter(
            id__lt=model_id
        ).order_by('-id').first()
        
        if previous_model:
            current_config.ai_model = previous_model
            current_config.save()
            # Restart inference with old model
            return True
        return False
```

#### 3.4 Admin Controls for Manual Override

**New Endpoints**:
```
POST /api/batches/<id>/trigger-training/
POST /api/batches/<id>/approve-for-deployment/
POST /api/batches/<id>/reject/
POST /api/models/<id>/deploy/
POST /api/models/<id>/rollback/
```

**Files to Update**:
- ✅ `core/views.py` - Add deployment endpoints
- ✅ Frontend - Add approval UI to AdminBatchDashboard

#### 3.5 Testing
- [ ] Batch created automatically at 30 images
- [ ] Model retrains successfully
- [ ] Performance metrics calculated
- [ ] Model deployment works
- [ ] Inference server loads new model
- [ ] Rollback procedure works
- [ ] Admin can manually trigger/cancel training

---

## 🗄️ Complete Database Schema

```sql
-- Key Tables

-- Updated: core_userprofile
ALTER TABLE core_userprofile MODIFY role VARCHAR(20) 
CHECK (role IN ('USER', 'ADMIN'));

-- Updated: core_inferenceLog
ALTER TABLE core_inferenceLog 
ADD COLUMN is_low_confidence BOOLEAN DEFAULT FALSE;
ADD COLUMN included_in_batch_id INTEGER;
ADD COLUMN label_studio_task_id INTEGER;
ADD COLUMN manual_label VARCHAR(50);
ADD COLUMN was_used_for_training BOOLEAN DEFAULT FALSE;

-- New: core_retrainingbatch
CREATE TABLE core_retrainingbatch (
    id SERIAL PRIMARY KEY,
    batch_name VARCHAR(100),
    status VARCHAR(20),
    image_count INTEGER,
    confidence_range_min FLOAT,
    confidence_range_max FLOAT,
    label_studio_project_id INTEGER,
    label_studio_task_ids JSONB,
    model_version_before_id INTEGER,
    model_version_after_id INTEGER,
    created_at TIMESTAMP,
    exported_at TIMESTAMP,
    labeled_at TIMESTAMP,
    training_started_at TIMESTAMP,
    training_completed_at TIMESTAMP,
    new_model_accuracy FLOAT,
    new_model_mAP FLOAT,
    improvement_percent FLOAT,
    created_by_id INTEGER,
    notes TEXT,
    
    FOREIGN KEY (model_version_before_id) REFERENCES core_aimodel(id),
    FOREIGN KEY (model_version_after_id) REFERENCES core_aimodel(id),
    FOREIGN KEY (created_by_id) REFERENCES auth_user(id),
    FOREIGN KEY (included_in_batch_id) REFERENCES core_retrainingbatch(id)
);

-- New: core_retrainingbatch_inference_logs (M2M)
CREATE TABLE core_retrainingbatch_inference_logs (
    id SERIAL PRIMARY KEY,
    retrainingbatch_id INTEGER,
    inferencelog_id INTEGER,
    FOREIGN KEY (retrainingbatch_id) REFERENCES core_retrainingbatch(id),
    FOREIGN KEY (inferencelog_id) REFERENCES core_inferencelog(id),
    UNIQUE(retrainingbatch_id, inferencelog_id)
);

-- Indexes for performance
CREATE INDEX idx_inferencelog_low_confidence ON core_inferencelog(is_low_confidence);
CREATE INDEX idx_inferencelog_batch ON core_inferencelog(included_in_batch_id);
CREATE INDEX idx_retrainingbatch_status ON core_retrainingbatch(status);
CREATE INDEX idx_retrainingbatch_created ON core_retrainingbatch(created_at);
```

---

## 📡 API Reference

### User Endpoints
```
GET    /api/inference-logs/         - List my logs
POST   /api/inference/detect/       - Send image for detection
WS     /ws/live-view/<session_id>/  - Real-time detections
POST   /api/session/start/          - Start session
POST   /api/session/end/            - End session
GET    /api/session/current/        - Get active session
```

### Admin Endpoints
```
GET    /api/batches/                    - List batches
POST   /api/batches/                    - Create batch
GET    /api/batches/<id>/               - Batch details
POST   /api/batches/<id>/export-to-label-studio/     - Export
POST   /api/batches/<id>/import-labels/              - Import
POST   /api/batches/<id>/trigger-training/           - Train
POST   /api/batches/<id>/approve-for-deployment/     - Approve
GET    /api/low-confidence-logs/        - Unprocessed low-conf
POST   /api/low-confidence-logs/create-batch/        - Create batch
GET    /api/models/                     - List models
POST   /api/models/<id>/deploy/         - Deploy model
POST   /api/models/<id>/rollback/       - Rollback model
```

---

## 🧪 Testing Checklist

### Unit Tests
```
✅ UserProfile role simplification
✅ RetrainingBatch model operations
✅ Low-confidence detection logic
✅ LabelStudioConnector API calls
✅ Model retraining tasks
✅ Model deployment logic
```

### Integration Tests
```
✅ Role-based access control
✅ Batch creation workflow
✅ Label Studio export/import
✅ Model training pipeline
✅ Model deployment
✅ WebSocket permissions
```

### E2E Tests
```
✅ User: Login → Session → Capture → Detection
✅ Admin: Create Batch → Export → Label → Train → Deploy
✅ Model rollback on failure
✅ Auto-batch creation on threshold
```

### Performance Tests
```
✅ Concurrent user sessions
✅ WebSocket stability
✅ Database query optimization
✅ File upload handling (images to Label Studio)
✅ Model training memory usage
```

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Database migrations tested
- [ ] Label Studio configured and accessible
- [ ] GPU/compute resources available
- [ ] Storage capacity for models verified
- [ ] Backup of current production model

### Deployment
- [ ] Deploy backend changes
- [ ] Run migrations
- [ ] Deploy frontend changes
- [ ] Verify APIs responding
- [ ] Test role-based access
- [ ] Verify OperatorPanel
- [ ] Verify admin batch dashboard
- [ ] Test Label Studio integration

### Post-Deployment
- [ ] Monitor error logs
- [ ] Verify low-confidence detection working
- [ ] Test batch creation manually
- [ ] Monitor Celery task queue
- [ ] Collect user feedback
- [ ] Run performance baseline

---

## 🚨 Rollback Plan

**If issues encountered**:

1. **Frontend Issues**
   - Revert frontend deployment
   - Clear browser cache
   - Redeploy previous version

2. **Role Simplification Issues**
   - Restore user role backup
   - Revert code changes
   - Run reverse migration

3. **Batch/Retraining Issues**
   - Stop Celery tasks
   - Clear batch queue
   - Rollback to previous model version
   - Redeploy old inference server

4. **Label Studio Issues**
   - Pause batch export
   - Debug API connection
   - Check Label Studio server health

---

## 📝 Environment Variables Needed

```bash
# .env file additions

# Label Studio
LABEL_STUDIO_URL=http://localhost:8080
LABEL_STUDIO_API_KEY=your-api-key

# Model Training
MODEL_TRAINING_EPOCHS=50
MODEL_TRAINING_DEVICE=0  # GPU device ID
MODEL_TRAINING_PATIENCE=5

# Batch Settings
AUTO_BATCH_THRESHOLD=30  # Create batch when 30 low-conf images collected
AUTO_BATCH_CHECK_INTERVAL=240  # Check every 4 hours

# Storage
DATASETS_DIR=/data/datasets
MODELS_DIR=/data/models
```

---

## 📊 Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Role migration complete | 100% users migrated | Day 1 |
| OperatorPanel working | All operators on single page | Day 3 |
| Admin dashboard working | All admins can see batches | Day 5 |
| Label Studio integration | Export/import working | Day 7 |
| Auto-batch creation | Creates at 30 images | Day 10 |
| Model retraining | Completes in <2 hours | Day 14 |
| Auto-deployment | New model deployed in <5 mins | Day 14 |
| System stability | <0.5% error rate | Day 21 |

---

## 📞 Support & Troubleshooting

### Common Issues

**Q: Batch not auto-creating?**
- Check Celery beat is running: `ps aux | grep celery`
- Check scheduled task config in settings.py
- View Celery logs: `tail -f celery.log`

**Q: Label Studio export failing?**
- Verify Label Studio URL and API key
- Check Label Studio server is running
- Verify image paths are accessible

**Q: Model training stuck?**
- Check GPU availability: `nvidia-smi`
- Check disk space: `df -h`
- View training logs: `tail -f logs/training.log`

**Q: Role migration issues?**
- Verify migration ran: `./manage.py showmigrations`
- Check user profile records: `SELECT * FROM core_userprofile;`

---

## 🔄 Iteration & Feedback Loop

**Weekly Checkpoints**:
- Week 1: Phase 1 complete, collect user feedback
- Week 2: Phase 2 complete, test Label Studio integration
- Week 3: Phase 3 complete, monitor auto-retraining
- Week 4: Optimization based on feedback

**Monthly Reviews**:
- Model performance trends
- Batch creation frequency
- User adoption metrics
- System reliability

---

**Document Version**: 1.0  
**Last Updated**: May 26, 2026  
**Next Review**: June 26, 2026
