# Manufacturing AI Defect Detection System
## Quick Start Guide

### 🚀 One-Time Setup

#### 1. Install Dependencies
```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

#### 2. Database Setup
```bash
python manage.py migrate
python manage.py createsuperuser  # Create your admin account
```

#### 3. Create Directories
```bash
mkdir -p media/models/weights
mkdir -p media/inference/snapshots
mkdir -p media/retrain_queue
mkdir -p media/training_dataset
mkdir -p media/training_outputs
```

#### 4. Configure .env File
```bash
cat > .env << 'EOF'
SECRET_KEY=django-insecure-your-secret-key-here-change-in-production
DEBUG=True
DB_NAME=auto_qa_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/0
EOF
```

---

### ▶️ Running the System (4 Terminal Windows)

#### Terminal 1: Django + WebSocket Server (Daphne)
```bash
daphne -b 0.0.0.0 -p 8000 ai_ins_sys.asgi:application
```
- Access: http://localhost:8000/
- Admin panel: http://localhost:8000/admin/
- API docs: http://localhost:8000/api/

#### Terminal 2: React Frontend
```bash
cd frontend
npm start
```
- Access: http://localhost:3000/

#### Terminal 3: Celery Worker (Background Tasks)
```bash
celery -A ai_ins_sys worker -l info
```

#### Terminal 4: Celery Beat (Periodic Tasks)
```bash
celery -A ai_ins_sys beat -l info
```

**Prerequisite**: Redis must be running
```bash
# On Windows: Redis doesn't run natively, use WSL or Docker
# On Mac/Linux:
redis-server
```

---

### 📱 Testing the System

#### 1. Create Test Users
```bash
python manage.py shell
```

```python
from django.contrib.auth.models import User
from core.models import UserProfile

# Create Operator
op = User.objects.create_user(username='operator1', password='test123')
UserProfile.objects.create(user=op, role='OPERATOR')

# Create Admin
admin = User.objects.create_user(username='admin1', password='test123')
UserProfile.objects.create(user=admin, role='ADMIN')

# Create Super Admin
super_admin = User.objects.create_user(username='superadmin1', password='test123')
UserProfile.objects.create(user=super_admin, role='SUPER_ADMIN')

print("Users created!")
exit()
```

#### 2. Test Operator Dashboard
1. Go to: http://localhost:3000/
2. Login as: `operator1` / `test123`
3. You should see:
   - Live webcam feed
   - Real-time YOLO detection
   - Approve/Reject buttons

#### 3. Test Analytics Dashboard
1. Login as: `superadmin1` / `test123`
2. You should see:
   - Key metrics (Accuracy, FRR, Latency, Total Inspections)
   - 7-day latency trends
   - Operator performance comparison
   - Model performance comparison
   - Retraining queue status
   - Training jobs progress

#### 4. Test Real-Time Inference
```bash
# Using curl to test API
curl -X POST http://localhost:8000/api/core/inference/detect/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"image": "data:image/jpeg;base64,..."}'
```

---

### 🎯 Key Workflows

#### Workflow 1: Live Defect Detection
```
1. Operator logs in → OperatorDashboard loads
2. Webcam feed captures frames at 2 FPS
3. Each frame sent to YOLO inference API
4. System decision displayed (PASS/FAIL)
5. Operator clicks APPROVE or REJECT
6. Decision logged to database
7. If False Positive → Added to retraining queue
```

#### Workflow 2: Model Retraining
```
1. False Positive detected → RetrainingQueue entry created
2. Super Admin labels 100+ samples via labeling tool
3. Celery task triggered every 5 minutes
4. Training starts: YOLO fine-tuning on new data
5. Real-time progress streamed via WebSocket
6. Training complete → Metrics calculated
7. Super Admin deploys new version if better
8. Model hot-swapped without server restart
```

#### Workflow 3: Analytics Monitoring
```
1. Super Admin views AnalyticsDashboard
2. Real-time metrics received via WebSocket
3. Sees: Accuracy %, FRR %, Latency trends
4. Compares operator performance
5. Compares model versions
6. Makes deployment decisions
```

---

### 🔧 Configuration Examples

#### Change Confidence Threshold (in Operator Dashboard)
- Use slider in UI
- Range: 0% - 100%
- Lower = More detections, Higher = Fewer detections

#### Adjust Retraining Threshold
Edit in `core/tasks.py`:
```python
threshold = 50  # Change from 100 to 50
```

#### Change Model Format
Edit in `core/models.py` AIModel:
```python
model_format = models.CharField(
    max_length=10,
    choices=MODEL_FORMAT_CHOICES,
    default='PT'  # Change to 'ONNX' or 'ENGINE'
)
```

---

### 📊 Database Schema

```
UserProfile
├── user (ForeignKey to User)
└── role (SUPER_ADMIN, ADMIN, OPERATOR)

AIModel
├── name, version
├── file_path_pt, file_path_onnx, file_path_engine
├── is_active, is_deployment_ready
└── mAP, avg_speed_ms, accuracy

InferenceLog
├── operator (ForeignKey)
├── model_used (ForeignKey to AIModel)
├── image_snapshot
├── detection_results (JSON: bounding boxes)
├── latency_ms, confidence_score
├── system_decision, final_decision
├── operator_override, operator_comment
└── timestamp

RetrainingQueue
├── log_entry (OneToOne to InferenceLog)
├── status (PENDING, LABELED, ADDED_TO_DATASET)
├── label_data (JSON: YOLO format)
├── priority (0=Low, 1=Medium, 2=High)
└── labeled_by (ForeignKey to User)

TrainingJob
├── base_model (ForeignKey to AIModel)
├── status (QUEUED, RUNNING, COMPLETED, FAILED)
├── epochs, batch_size, learning_rate
├── new_weights_path, metrics (JSON)
├── current_epoch, logs
└── created_at, started_at, completed_at

DatasetBuffer
├── training_job (ForeignKey)
├── retraining_queue (ForeignKey)
├── is_included
└── created_at
```

---

### 🚨 Common Issues & Solutions

#### Issue: "No active model loaded"
```python
# Solution: Set active model in Django admin or API
python manage.py shell
from core.models import AIModel
model = AIModel.objects.first()
model.is_active = True
model.save()
```

#### Issue: WebSocket connection fails
```bash
# Check Redis
redis-cli ping  # Should return PONG

# Check Daphne is running
netstat -an | grep 8000

# Check browser console for error
# (Usually CORS or WebSocket protocol issue)
```

#### Issue: Celery tasks not executing
```bash
# Check worker is running
ps aux | grep celery

# Clear task queue
celery -A ai_ins_sys purge

# Restart worker
celery -A ai_ins_sys worker -l info
```

#### Issue: YOLO model not found
```bash
# Download a model first
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Move to media folder
mv yolov8n.pt media/models/weights/
```

---

### 🔐 Security Notes
- **Change SECRET_KEY** before production deployment
- **Set DEBUG=False** in production settings.py
- **Use environment variables** for sensitive data (.env file)
- **Enable HTTPS** for WebSocket connections (wss://)
- **Implement rate limiting** on API endpoints
- **Use authentication** for all API requests

---

### 📈 Performance Tuning
- Increase Celery worker count: `celery -A ai_ins_sys worker -c 4`
- Use GPU for inference: `model.to('cuda')`
- Adjust model batch size for training
- Scale PostgreSQL for large datasets
- Use CDN for frontend assets

---

### 📚 Additional Resources
- Django Channels: https://channels.readthedocs.io/
- Ultralytics YOLO: https://docs.ultralytics.com/
- Celery: https://docs.celeryproject.org/
- DRF: https://www.django-rest-framework.org/

---

### ✅ System Checklist

- [ ] All dependencies installed
- [ ] PostgreSQL running
- [ ] Redis running
- [ ] .env file created
- [ ] Database migrated
- [ ] Test users created
- [ ] Daphne server running
- [ ] Celery worker running
- [ ] Celery beat running
- [ ] React frontend running
- [ ] Can login as operator
- [ ] Can login as super admin
- [ ] Webcam permissions granted
- [ ] First inference successful
- [ ] Analytics dashboard shows data

---

## 🎉 You're all set!

Start with the Operator Dashboard to test live detection, then use the Analytics Dashboard to monitor performance and manage the retraining pipeline.

Good luck with your Manufacturing AI Defect Detection System!
