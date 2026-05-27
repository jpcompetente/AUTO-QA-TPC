# Manufacturing AI Defect Detection System
## Advanced RBAC-Enabled Real-Time Monitoring & Continuous Learning

### 📋 Table of Contents
1. [System Architecture](#architecture)
2. [Installation & Setup](#installation)
3. [Key Features](#features)
4. [API Endpoints](#api-endpoints)
5. [WebSocket Connections](#websockets)
6. [Role-Based Access Control](#rbac)
7. [Retraining Pipeline](#retraining)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)

---

## Architecture

### Two-Tier RBAC System
┌─────────────────────────────────────────────────────────┐
│                    ADMIN                                │
│    Analytics | Model Deployment | User Management      │
└─────────────────────────────────────────────────────────┘
           ↑
           │ REST API / WebSocket (Metrics, Settings)
           │
┌─────────────────────────────────────────────────────────┐
│                     USER                                │
│    Live Detection | Frame Approval/Rejection            │
└─────────────────────────────────────────────────────────┘

### Technology Stack
- **Backend**: Django 5.2 + DRF
- **Real-time**: Django Channels + Redis
- **AI**: Ultralytics YOLO + PyTorch
- **Background Tasks**: Celery + Redis
- **Database**: PostgreSQL
- **Frontend**: React 19 with WebCam & WebSocket
- **Async Server**: Daphne

---

## Installation

### Prerequisites
- Python 3.10+
- PostgreSQL 12+
- Redis 6+
- Node.js 16+
- CUDA 11.8+ (for GPU inference)

### Backend Setup

1. **Install Dependencies**
```bash
cd /path/to/AUTO-QA-TPC
pip install -r requirements.txt
```

2. **Configure Environment**
```bash
# Create .env file
cat > .env << EOF
SECRET_KEY=your-secret-key-here
DEBUG=True
DB_NAME=auto_qa_db
DB_USER=postgres
DB_PASSWORD=your-password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/0
EOF
```

3. **Database Setup**
```bash
python manage.py migrate
python manage.py createsuperuser
```

4. **Create Media Directories**
```bash
mkdir -p media/models/weights
mkdir -p media/inference/snapshots
mkdir -p media/retrain_queue
mkdir -p media/training_dataset
mkdir -p media/training_outputs
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

### Start Services

**Terminal 1: Django + Daphne (WebSocket Server)**
```bash
daphne -b 0.0.0.0 -p 8000 ai_ins_sys.asgi:application
```

**Terminal 2: Celery Worker**
```bash
celery -A ai_ins_sys worker -l info
```

**Terminal 3: Celery Beat (Scheduler)**
```bash
celery -A ai_ins_sys beat -l info
```

**Terminal 4: Redis**
```bash
redis-server
```

---

## Features

### 1. Real-Time Inference & Monitoring (Req. 1.1)
- ✅ Live webcam feed from user workstation
- ✅ 2 FPS capture with YOLO inference
- ✅ Real-time bounding boxes and confidence scores
- ✅ Automatic frame streaming to Admin
- ✅ System decision (PASS/FAIL) with latency tracking

**Frontend Component**: `OperatorPanel.jsx`

### 2. Model & Version Management (Req. 1.2)
- ✅ Multiple model format support (.pt, .onnx, .engine)
- ✅ Hot-swap models without server restart
- ✅ Version tracking and compatibility tags
- ✅ Performance metrics per model (mAP, latency)
- ✅ Automatic model activation based on metrics

**Backend**: `ModelLoader` utility in `model_loader.py`

### 3. Analytics & Audit Logging (Req. 1.4)
- ✅ **Accuracy**: (Correct Classifications) / Total
- ✅ **False Reject Rate (FRR)**: (Human Approved / System Rejected) / Total
- ✅ **Latency Trends**: Daily averages over 7 days
- ✅ **User performance**: Per-user accuracy and FRR
- ✅ **Model Performance**: Comparison across deployed versions
- ✅ Real-time dashboard with Chart.js visualization

**Frontend Component**: `AnalyticsDashboard.js`  
**Backend Endpoints**:
- `GET /api/core/analytics/dashboard/`
- `GET /api/core/analytics/latency-trends/`
- `GET /api/core/analytics/operator-performance/` - Per-user metrics
- `GET /api/core/analytics/model-performance/`

### 4. Continuous Learning Pipeline (Req. 1.5)
```
User Override
      ↓
[Is False Positive?]
      ↓ YES
   Queue Entry Created
      ↓
[Pending Labeling]
      ↓
Admin Labels (Canvas Tool)
      ↓
[Reaches 100 Samples Threshold]
      ↓
Celery Task: train_model()
      ↓
Background YOLO Training
      ↓
[Training Complete]
      ↓
Admin Reviews Metrics
      ↓
Deploy New Version
```

---

## API Endpoints

### Authentication
```
POST /api/core/auth/token/
- Input: {username, password}
- Returns: {access, refresh, role, user_id}
```

### AI Model Management
```
GET    /api/core/ai-models/               - List all models
POST   /api/core/ai-models/               - Create new model
GET    /api/core/ai-models/{id}/          - Get model details
POST   /api/core/ai-models/{id}/activate/ - Activate model
GET    /api/core/ai-models/active/        - Get active model
```

### Inference Logging
```
GET    /api/core/inference-logs/                      - List all logs
POST   /api/core/inference-logs/{id}/operator_override/ - Record user override decision
GET    /api/core/inference-logs/pending_review/       - Pending logs
POST   /api/core/inference/detect/                    - Real-time detection
```

### Retraining Queue
```
GET    /api/core/retraining-queue/           - List pending samples
POST   /api/core/retraining-queue/{id}/label/ - Label sample (Admin)
POST   /api/core/retraining-queue/batch_trigger_training/ - Start training
```

### Training Jobs
```
GET    /api/core/training-jobs/           - List jobs
POST   /api/core/training-jobs/{id}/deploy/ - Deploy trained model
```

### Analytics
```
GET /api/core/analytics/dashboard/            - Main KPIs
GET /api/core/analytics/latency-trends/       - 7-day trends
GET /api/core/analytics/operator-performance/ - Per-user metrics
GET /api/core/analytics/model-performance/    - Model comparison
```

---

## WebSocket Connections

### 1. Live View Stream (User → Admin)
```
URL: ws://localhost:8000/ws/live-view/{session_id}/

User Sends:
{
  "type": "inference_update",
  "operator_id": "operator_123",
  "bounding_boxes": [...],
  "confidence": 0.95,
  "latency_ms": 45.2,
  "system_decision": "FAIL",
  "timestamp": "2024-05-07T10:30:00Z"
}

Admin Receives:
(Same data broadcast to all connected Admins)
```

### 2. Metrics Dashboard
```
URL: ws://localhost:8000/ws/metrics/

Admin Receives (Real-time):
{
  "type": "initial_metrics",
  "data": {
    "accuracy": 94.5,
    "false_reject_rate": 2.3,
    "avg_latency": 48.7,
    "total_inferences": 1250
  }
}
```

### 3. Training Progress
```
URL: ws://localhost:8000/ws/training-progress/{training_job_id}/

Updates Broadcast:
{
  "type": "progress_update",
  "status": "running",
  "current_epoch": 15,
  "total_epochs": 50,
  "log_line": "Epoch 15/50: loss=0.234, val_loss=0.267"
}
```

---

## RBAC (Role-Based Access Control)

### Roles
| Role | Permissions | Components |
|------|-------------|-----------|
- USER: Unified role for legacy operator and inspector accounts; can run detections and manage their own data
- ADMIN: System administrators; can manage all users, deploy models, and view analytics

### Middleware
- JWT authentication: All requests require valid token
- Role-based view filtering: API endpoints enforce role permissions
- Session tracking: User sessions tracked for audit

---

## Retraining Pipeline

### Step 1: User Override
```python
# When user rejects AI decision (False Positive)
POST /api/core/inference-logs/{id}/operator_override/
{
  "final_decision": "PASS",
  "comment": "Item is not defective"
}
# → RetrainingQueue entry created with HIGH priority
```

### Step 2: Labeling (Admin)
```python
# Admin labels bounding boxes via Canvas
POST /api/core/retraining-queue/{id}/label/
{
  "label_data": {
    "detections": [
      {
        "class": 0,
        "bbox": [100, 50, 200, 150],
        "confidence": 1.0
      }
    ]
  }
}
# → Status changes to LABELED
```

### Step 3: Auto-Trigger Training
```python
# Celery task runs every 5 minutes
check_retraining_queue()
# If labeled_count >= 100:
#   - Create TrainingJob
#   - Add samples to DatasetBuffer
#   - Call train_model.delay(job_id)
```

### Step 4: Training Execution
```python
# Celery task runs in background
train_model(training_job_id, epochs=50, batch_size=32)
# - Loads base model
# - Prepares YOLO dataset
# - Runs: yolo detect train ...
# - Streams progress via WebSocket
# - Saves best.pt weights
```

### Step 5: Deployment
```python
# Admin reviews metrics and deploys
POST /api/core/training-jobs/{id}/deploy/
{
  "model_name": "defect_detector_v2"
}
# → New AIModel created
# → If metrics better: automatically activated
```

---

## Configuration

### Model Loading
```python
# In your views/inference code
from core.model_loader import model_loader

# Load active model
active_model = model_loader.get_active_model()

# Hot-swap to new model
success = model_loader.hot_swap_model(
    new_model_path='/path/to/new/model.pt',
    model_format='pt'
)
```

### Celery Settings (settings.py)
```python
CELERY_BROKER_URL = 'redis://127.0.0.1:6379/0'
CELERY_RESULT_BACKEND = 'redis://127.0.0.1:6379/0'
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes

# Periodic tasks
CELERY_BEAT_SCHEDULE = {
    'check-retraining-queue': {
        'task': 'core.tasks.check_retraining_queue',
        'schedule': crontab(minute='*/5'),
    }
}
```

### Channels Configuration (settings.py)
```python
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("127.0.0.1", 6379)],
            "capacity": 1500,
            "expiry": 10,
        },
    },
}
```

---

## Troubleshooting

### WebSocket Connection Issues
```bash
# 1. Check Redis is running
redis-cli ping
# Should return: PONG

# 2. Check Daphne is running on port 8000
lsof -i :8000

# 3. Verify channels installed
python -c "import channels; print(channels.__version__)"
```

### Model Loading Errors
```bash
# 1. Check model file exists
ls -la media/models/weights/

# 2. Verify PyTorch/CUDA installation
python -c "import torch; print(torch.cuda.is_available())"

# 3. Check model format matches loader expectation
# Use .pt format for YOLO models
```

### Celery Task Failures
```bash
# 1. Check worker is running
ps aux | grep celery

# 2. View task results
celery -A ai_ins_sys events

# 3. Check logs
celery -A ai_ins_sys worker -l debug

# 4. Clear stuck tasks
celery -A ai_ins_sys purge
```

### Database Migration Issues
```bash
# 1. Apply pending migrations
python manage.py migrate

# 2. Check migration status
python manage.py showmigrations

# 3. Create new migration if models changed
python manage.py makemigrations
python manage.py migrate
```

---

## Performance Optimization

### For High-Volume Inference
```python
# Use model batching
results = model.predict(batch_of_frames, batch_size=32)

# Enable GPU caching
model_loader.load_model(
    model_path='/path/to/model.pt',
    device='cuda'  # Use GPU
)
```

### For Large Retraining Datasets
```python
# Adjust settings.py
CELERY_TASK_TIME_LIMIT = 60 * 60  # 1 hour

# In tasks.py
train_model(
    training_job_id,
    epochs=100,  # More epochs for larger dataset
    batch_size=64  # Larger batch
)
```

---

## Future Enhancements

- [ ] Integration with MLOps platforms (Weights & Biases, MLflow)
- [ ] Multi-GPU support for distributed training
- [ ] Automated data augmentation pipeline
- [ ] A/B testing framework for model versions
- [ ] Edge deployment support (ONNX, TensorRT)
- [ ] Mobile app for users
- [ ] Advanced visualization (3D bounding boxes)
- [ ] Anomaly detection using ensemble methods

---

## Support & Documentation

For detailed API documentation, visit:
- `http://localhost:8000/api/` (Django REST Framework browsable API)

For admin panel:
- `http://localhost:8000/admin/` (Django admin)

---

## License
Proprietary - Manufacturing AI Defect Detection System
