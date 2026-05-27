# AUTO-QA TPC: Simplified System Flow & Implementation Plan

**Date**: May 26, 2026  
**Status**: Implementation Ready  
**Target**: Simplify to 2 roles (USER/ADMIN) with unified operator page + auto-retraining pipeline

---

## 📋 Executive Summary

Transform AUTO-QA TPC from a 4-role complex system to a **2-role simplified system** with:
- **USER**: Simple operator interface - camera + defect detection in one page
- **ADMIN**: Batch management + retraining control dashboard
- **Auto-Pipeline**: Low-confidence logs → Label Studio → Auto-retrain → Deploy

**Total Effort**: 30-40 hours  
**Phases**: 3 phases over 3-4 weeks

---

## 🏗️ System Architecture

### Current State (4 Roles)
```
SuperAdmin ────┐
               ├─→ Multiple dashboards (fragmented)
Admin          │
Operator       ├─→ Complex permission model
Inspector  ────┘
```

### Target State (2 Roles)
```
USER ──────────→ Single Unified Operator Dashboard
                 (Camera + Defects + Model Info)

ADMIN ─────────→ Admin Control Panel
                 (Batches + Retraining + Logs)
```

### Data Flow Diagram
```
┌──────────────────────────────────────────────────────────────────┐
│ USER (Operator)                                                  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Camera Feed (Real-time)                                    │  │
│ │ + Motion Detection                                         │  │
│ │ + Auto-Capture on Motion Stabilize                        │  │
│ └────────────────────────────────────────────────────────────┘  │
│                              ↓                                    │
│                    [Inference Server]                            │
│                    (YOLO Detection)                              │
│                              ↓                                    │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Detection Results                                          │  │
│ │ • Bounding Boxes                                          │  │
│ │ • Confidence %                                            │  │
│ │ • Classification (Defect/OK)                             │  │
│ └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         ↓ (Save to DB)
    ┌─────────────────────┐
    │ InferenceLog Table  │
    │ + confidence        │
    │ + is_low_confidence │
    │ + status (PENDING,  │
    │   ERROR, APPROVED)  │
    └─────────────────────┘
         ↓ (Confidence < Threshold?)
    ┌────────────────────────────────────────┐
    │ Batch Collection                       │
    │ (Low-Confidence Logs)                  │
    │ 30+ images → Ready for Export          │
    └────────────────────────────────────────┘
         ↓ (Admin Triggers Export)
    ┌────────────────────────────────────────┐
    │ Label Studio Export                    │
    │ • Images uploaded                      │
    │ • Auto-labeling enabled                │
    │ • Waiting for review                   │
    └────────────────────────────────────────┘
         ↓ (Labeling Complete)
    ┌────────────────────────────────────────┐
    │ Retraining Pipeline (Celery)           │
    │ • Download labeled data                │
    │ • Combine with existing dataset        │
    │ • Train new model                      │
    │ • Validate performance                 │
    └────────────────────────────────────────┘
         ↓ (Validation Passed?)
    ┌────────────────────────────────────────┐
    │ New Model Deployment                   │
    │ • Update ActiveConfiguration           │
    │ • Restart inference server             │
    │ • Archive old model                    │
    └────────────────────────────────────────┘
         ↓
    [USER Dashboard loads new model]
    [Cycle Repeats]
```

---

## 📝 Phase Breakdown

### ⚡ PHASE 1: Role Simplification & UI Consolidation (Week 1)
**Effort**: 10-12 hours  
**Goal**: Simplify to 2 roles + single operator page

#### 1.1 Database Changes
```sql
-- Option A: Simplify existing UserProfile roles
ALTER TABLE core_userprofile 
MODIFY role VARCHAR(20) 
CHECK (role IN ('USER', 'ADMIN'));

-- Mapping:
-- OPERATOR → USER
-- INSPECTOR → USER
-- ADMIN → ADMIN
-- SUPER_ADMIN → ADMIN
```

**Files to Update**:
- `core/models.py` - Update UserProfile.ROLES
- `core/migrations/` - Create migration to update roles
- Data migration to remap existing users

#### 1.2 Frontend: Create Unified Operator Dashboard
**Location**: `frontend-vite/src/components/UnifiedOperatorDashboard.jsx`

**Layout**:
```
┌────────────────────────────────────────────────────────────────┐
│ AUTO-QA TPC - Operator Panel                    [Logout]       │
├─────────────────────────────┬──────────────────────────────────┤
│                             │                                  │
│                             │  📊 SESSION INFO                 │
│  📹 CAMERA FEED             │  ├─ Model: YOLOv8 v2.1          │
│  (Video Stream)             │  ├─ Product: Widget-A            │
│  + Motion Indicator         │  ├─ Session: MO-2024-001        │
│  + Stability Timer          │  ├─ Status: 🟢 Running          │
│                             │  └─ Confidence Threshold: 75%   │
│                             │                                  │
│  [Canvas Overlay]           │  📈 LAST DETECTION              │
│  • Green boxes (OK)         │  ├─ Type: Defect                │
│  • Red boxes (Defect)       │  ├─ Confidence: 92%             │
│  • Labels + %               │  ├─ Time: 14:35:22              │
│                             │  └─ [View Image]                │
│  [Session Controls]         │                                  │
│  [START] [PAUSE] [STOP]     │  🎯 QUICK STATS                │
│                             │  ├─ Total Scanned: 156          │
│                             │  ├─ Defects Found: 12           │
│                             │  ├─ Defect Rate: 7.7%           │
│                             │  └─ Avg Confidence: 88%         │
│                             │                                  │
│                             │  ⚙️ CONTROLS                    │
│                             │  [🔄 Refresh] [📤 Export CSV]  │
│                             │  [📞 Call Admin]                │
│                             │                                  │
└─────────────────────────────┴──────────────────────────────────┘
```

**Key Components**:
```jsx
<UnifiedOperatorDashboard>
  ├─ <CameraFeedPanel>
  │  ├─ <VideoStream />
  │  ├─ <CanvasOverlay /> (for detections)
  │  ├─ <MotionIndicator />
  │  └─ <StabilityTimer />
  │
  └─ <InfoPanel>
     ├─ <SessionInfo />
     ├─ <LastDetection />
     ├─ <QuickStats />
     └─ <ControlButtons />
```

**Features**:
- Live camera feed with motion detection
- Canvas overlay for bounding boxes
- Real-time detection updates via WebSocket
- Session management (START/PAUSE/STOP)
- Quick stats summary
- Simple, clean UI (no complexity)

**Files to Create/Modify**:
- ✅ `frontend-vite/src/components/UnifiedOperatorDashboard.jsx` (NEW)
- ✅ `frontend-vite/src/components/CameraFeedPanel.jsx` (NEW)
- ✅ `frontend-vite/src/components/InfoPanel.jsx` (NEW)
- ✅ `frontend-vite/src/styles/unified-operator.css` (NEW)
- ✅ `frontend-vite/src/App.jsx` (UPDATE - routing)

#### 1.3 Backend: Update Role Checks
**Files to Update**:
- `core/views.py` - Replace OPERATOR/INSPECTOR/SUPER_ADMIN checks with USER/ADMIN
- `core/permissions.py` - Simplify permission classes
- `core/consumers.py` - Update WebSocket authentication

**Key Changes**:
```python
# OLD
if user.profile.role == 'OPERATOR':
    # ...

# NEW
if user.profile.role == 'USER':
    # ...

# Simple permission class
class IsUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role == 'USER'

class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role == 'ADMIN'
```

#### 1.4 Testing
- [ ] Role migration works correctly
- [ ] Existing users remapped properly
- [ ] Unified dashboard loads without errors
- [ ] Camera feed works
- [ ] WebSocket connections established
- [ ] Detections display correctly

---

### 📦 PHASE 2: Admin Batch Dashboard & Label Studio Integration (Week 2)
**Effort**: 12-14 hours  
**Goal**: Admin can view/manage low-confidence batches + export to Label Studio

#### 2.1 Database Models

**New Table: `RetrainingBatch`**
```python
class RetrainingBatch(models.Model):
    STATUS_CHOICES = (
        ('COLLECTING', 'Collecting images'),
        ('READY', 'Ready for export'),
        ('EXPORTED', 'Exported to Label Studio'),
        ('LABELING', 'Awaiting labels'),
        ('LABELED', 'Labeling complete'),
        ('TRAINING', 'Model training'),
        ('COMPLETED', 'Training complete'),
        ('FAILED', 'Training failed'),
    )
    
    id = models.AutoField(primary_key=True)
    batch_name = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COLLECTING')
    
    # Image collection
    inference_logs = models.ManyToManyField('InferenceLog', related_name='batches')
    image_count = models.IntegerField(default=0)
    confidence_range_min = models.FloatField(default=0.0)
    confidence_range_max = models.FloatField(default=1.0)
    
    # Label Studio integration
    label_studio_project_id = models.IntegerField(null=True, blank=True)
    label_studio_task_ids = models.JSONField(default=list, blank=True)
    
    # Retraining
    model_version_before = models.ForeignKey('AIModel', on_delete=models.SET_NULL, null=True, 
                                             related_name='batches_trained_from')
    model_version_after = models.ForeignKey('AIModel', on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='batches_created_from')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    exported_at = models.DateTimeField(null=True, blank=True)
    labeled_at = models.DateTimeField(null=True, blank=True)
    training_started_at = models.DateTimeField(null=True, blank=True)
    training_completed_at = models.DateTimeField(null=True, blank=True)
    
    # Performance metrics
    new_model_accuracy = models.FloatField(null=True, blank=True)
    new_model_mAP = models.FloatField(null=True, blank=True)
    improvement_percent = models.FloatField(null=True, blank=True)
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    notes = models.TextField(blank=True)
    
    def __str__(self):
        return f"Batch {self.id}: {self.status} ({self.image_count} images)"
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]
```

**Update `InferenceLog` Model**:
```python
# Add to InferenceLog:
class InferenceLog(models.Model):
    # ... existing fields ...
    
    # Retraining integration
    is_low_confidence = models.BooleanField(default=False, db_index=True)
    included_in_batch = models.ForeignKey('RetrainingBatch', on_delete=models.SET_NULL, 
                                         null=True, blank=True, related_name='logs')
    label_studio_task_id = models.IntegerField(null=True, blank=True)
    manual_label = models.CharField(max_length=50, null=True, blank=True)  # Labeled result
    was_used_for_training = models.BooleanField(default=False)
```

**Files to Update**:
- ✅ `core/models.py` - Add RetrainingBatch + fields to InferenceLog
- ✅ `core/migrations/` - Create migration

#### 2.2 Backend: Admin APIs

**New Endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/batches/` | GET | List all batches |
| `/api/batches/<id>/` | GET | Batch details |
| `/api/batches/` | POST | Create new batch |
| `/api/batches/<id>/export-to-label-studio/` | POST | Export batch |
| `/api/batches/<id>/import-labels/` | POST | Import labeled data |
| `/api/batches/<id>/trigger-training/` | POST | Start retraining |
| `/api/low-confidence-logs/` | GET | List eligible logs |
| `/api/models/` | GET | List all models |

**Implementation**:
```python
# core/views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

class RetrainingBatchViewSet(viewsets.ModelViewSet):
    queryset = RetrainingBatch.objects.all()
    serializer_class = RetrainingBatchSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    
    @action(detail=True, methods=['post'])
    def export_to_label_studio(self, request, pk=None):
        """
        Export batch to Label Studio for manual labeling
        """
        batch = self.get_object()
        # TODO: Implement Label Studio export
        return Response({'status': 'exported'})
    
    @action(detail=True, methods=['post'])
    def import_labels(self, request, pk=None):
        """
        Import labeled images from Label Studio
        """
        batch = self.get_object()
        # TODO: Implement Label Studio import
        return Response({'status': 'imported'})
    
    @action(detail=True, methods=['post'])
    def trigger_training(self, request, pk=None):
        """
        Start model retraining with labeled data
        """
        batch = self.get_object()
        # Queue Celery task
        retrain_model.delay(batch.id)
        return Response({'status': 'training_started'})

class LowConfidenceLogsViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = InferenceLogSerializer
    
    def get_queryset(self):
        return InferenceLog.objects.filter(
            is_low_confidence=True,
            included_in_batch__isnull=True  # Not yet in a batch
        ).order_by('-timestamp')
    
    @action(detail=False, methods=['post'])
    def create_batch_from_logs(self, request):
        """
        Create a new batch from selected low-confidence logs
        """
        log_ids = request.data.get('log_ids', [])
        logs = InferenceLog.objects.filter(id__in=log_ids)
        
        batch = RetrainingBatch.objects.create(
            batch_name=f"Batch {datetime.now().strftime('%Y%m%d-%H%M%S')}",
            created_by=request.user
        )
        batch.inference_logs.set(logs)
        batch.image_count = logs.count()
        batch.save()
        
        return Response(RetrainingBatchSerializer(batch).data)
```

**Files to Create/Update**:
- ✅ `core/views.py` - Add RetrainingBatchViewSet
- ✅ `core/serializers.py` - Add RetrainingBatchSerializer
- ✅ `core/urls.py` - Add batch routes
- ✅ `core/permissions.py` - Add IsAdmin check

#### 2.3 Label Studio Integration

**New Module**: `core/label_studio_connector.py`

```python
import requests
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
- [ ] Verify unified operator dashboard
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
| Unified dashboard working | All operators on single page | Day 3 |
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
