# Migration & Deployment Guide

## Pre-Deployment Checklist

### Database
- [ ] Backup current database
- [ ] Test migrations in staging environment first
- [ ] Verify no data loss in migration

### Dependencies
- [ ] Celery installed (for background Odoo sync)
- [ ] Redis configured (for Celery broker)
- [ ] Odoo connection details configured

### Configuration
- [ ] Odoo credentials in settings.py
- [ ] WebSocket URLs updated in frontend if needed
- [ ] CORS settings verified
- [ ] JWT token lifetime configured

---

## Step 1: Backend Migration

### 1.1 Install Dependencies
```bash
cd AUTO-QA-TPC
pip install celery redis requests

# For Odoo XML-RPC support (if not already installed)
pip install xmlrpc-client
```

### 1.2 Create Database Migrations
```bash
python manage.py makemigrations core
# Review migration files:
# - ManufacturingOrderSession model creation
# - InferenceLog field additions (manufacturing_order, is_confidence_below_threshold)
# - ActiveConfiguration M2M field (manufacturing_orders)

python manage.py migrate
```

### 1.3 Verify Database Changes
```bash
python manage.py dbshell
# Check new tables:
# - core_manufacturingordersession
# - core_inferencelog_manufacturing_order (M2M table)

# Verify new fields on InferenceLog:
# - manufacturing_order (CharField)
# - is_confidence_below_threshold (BooleanField)

# Verify new fields on ActiveConfiguration:
# - (M2M relation created)
```

### 1.4 Configure Odoo Integration
Edit `ai_ins_sys/settings.py`:
```python
# Odoo Configuration
ODOO_URL = 'http://your-odoo-server:8069'
ODOO_DATABASE = 'your_database_name'
ODOO_USERNAME = 'admin'
ODOO_PASSWORD = 'your_password'
ODOO_USE_JSON_RPC = False  # Set to True if using JSON-RPC instead of XML-RPC

# Celery Configuration (for background sync)
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
```

### 1.5 Configure Celery Worker (if using background sync)
```bash
# In one terminal, start Celery worker:
celery -A ai_ins_sys worker --loglevel=info

# In another terminal, start Celery beat (scheduler) if needed:
celery -A ai_ins_sys beat --loglevel=info
```

### 1.6 Test Backend Endpoints
```bash
# 1. Get JWT token
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"operator1","password":"password"}'

# 2. Start MO session
curl -X POST http://localhost:8000/api/session/start/MO-2025-001/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sync_from_odoo":true}'

# 3. Get current session
curl -X GET http://localhost:8000/api/session/current/ \
  -H "Authorization: Bearer <token>"

# 4. Test inference with MO
curl -X POST http://localhost:8000/api/inference/detect/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "image":"data:image/jpeg;base64,...",
    "manufacturing_order":"MO-2025-001",
    "session_id":"MO-2025-001",
    "confidence_threshold":0.5
  }'

# 5. Check pending review (includes ERROR status)
curl -X GET http://localhost:8000/api/inference-logs/pending_review/ \
  -H "Authorization: Bearer <token>"
```

---

## Step 2: Frontend Migration

### 2.1 Update OperatorDashboard Component
The component has been updated with:
- Motion detection (no new dependencies)
- Canvas overlay rendering (no new dependencies)
- Manufacturing Order input field
- Session start/end with MO

**New state variables**:
```javascript
const [manufacturingOrder, setManufacturingOrder] = useState('');
const [stabilityTimer, setStabilityTimer] = useState(0);
const [motionDetected, setMotionDetected] = useState(false);
const [liveDetections, setLiveDetections] = useState([]);
```

### 2.2 Update API Client (backend.js)
Verify endpoints exist:
```javascript
// Existing endpoints should work as-is:
- /api/inference/detect/ (now supports manufacturing_order)
- /ws/live-view/ (no changes)
- /ws/metrics/ (no changes)

// New endpoints to use:
- POST /api/session/start/{mo}/
- POST /api/session/end/{mo}/
- GET /api/session/current/
- POST /api/session/odoo-sync/
```

### 2.3 Test Frontend Components
```bash
cd frontend-vite
npm run dev

# In browser:
# 1. Login with operator credentials
# 2. Enter Manufacturing Order number
# 3. Click "Start Session"
# 4. Observe:
#    - Motion indicator appears when motion detected
#    - Stability timer counts up (0-2s)
#    - "Capture & Detect" button enabled
#    - Canvas overlay shows live detections

# 5. Trigger a detection
#    - Watch canvas render bounding boxes
#    - Observe confidence percentages
#    - Verify green/red coloring
```

---

## Step 3: Verify All Changes

### 3.1 Motion Detection
```javascript
// Test in browser console
// Set sessionActive = true, wait 2 seconds of stillness
// Should auto-trigger inference

// Expected behavior:
// 1. "Motion detected..." indicator shown while moving
// 2. "Stable for X/2s" shown when still
// 3. Auto-capture when reaches 2 seconds
```

### 3.2 Canvas Overlay
```javascript
// Verify in browser
// After inference result received:
// 1. Bounding boxes appear on camera feed
// 2. Labels show class and confidence
// 3. Defects colored red, non-defects green
// 4. Masks (if present) show as semi-transparent overlays
```

### 3.3 ERROR Tagging
```bash
# Send low-confidence inference
# Verify in database:
SELECT * FROM core_inferencelog 
WHERE is_confidence_below_threshold = TRUE 
LIMIT 5;

# Should show:
# - system_decision = 'ERROR'
# - final_decision = 'ERROR'
# - status = 'ERROR'
# - rejection_reason = 'CONFIDENCE_BELOW_THRESHOLD'
```

### 3.4 MO Session Management
```bash
# In database:
SELECT * FROM core_manufacturingordersession 
WHERE manufacturing_order = 'MO-2025-001';

# Should show:
# - product_count = 1 (after reset)
# - is_active = True
# - started_at = recent timestamp
# - ended_at = NULL (if still active)

# Test product_count increment:
# - Run multiple inferences
# - Call increment_product_count() API if available
# - Verify product_count increments
```

### 3.5 Odoo Sync
```bash
# Check if Celery task running:
celery -A ai_ins_sys inspect active

# Trigger sync manually:
curl -X POST http://localhost:8000/api/session/odoo-sync/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'

# Verify in database:
SELECT * FROM core_manufacturingordersession 
WHERE odoo_mo_id IS NOT NULL;

# Should show MOs synced from Odoo with:
# - odoo_mo_id populated
# - odoo_product_id populated
# - total_product_count from Odoo
```

### 3.6 JWT Authentication
```bash
# Test with invalid token:
curl -X GET http://localhost:8000/api/session/current/ \
  -H "Authorization: Bearer invalid_token"

# Expected: 401 Unauthorized

# Test with expired token:
# (Wait for token to expire, typically 5 minutes)
# Should get 401 with token_not_valid error

# Test with valid token:
curl -X GET http://localhost:8000/api/session/current/ \
  -H "Authorization: Bearer <valid_token>"

# Expected: 200 with session data or 404 if no active session
```

---

## Step 4: Rollback Plan

If issues occur, rollback in this order:

### 4.1 Frontend Rollback
```bash
# Revert OperatorDashboard.js to previous version
git checkout HEAD~1 -- frontend-vite/src/components/OperatorDashboard.js

# Revert styles
git checkout HEAD~1 -- frontend-vite/src/styles/operator.css

# Rebuild
npm run build
```

### 4.2 Backend API Rollback
```bash
# Revert views and URLs
git checkout HEAD~1 -- core/views.py core/urls.py

# Restart Django (don't migrate down yet)
python manage.py runserver
```

### 4.3 Database Rollback
```bash
# Reverse last migration(s)
python manage.py migrate core <previous_migration_name>

# Example:
python manage.py migrate core 0008_alter_userprofile_role

# Verify data integrity:
python manage.py check
```

### 4.4 Re-enable AdminDashboard (if needed)
```javascript
// frontend-vite/src/App.jsx
// Restore routing to AdminDashboard for ADMIN role
if (role === "admin") {
  return <AdminDashboard onLogout={handleLogout} role={role} />;
}
```

---

## Step 5: Post-Deployment Monitoring

### 5.1 Log Monitoring
```bash
# Watch Django logs
tail -f /var/log/django.log

# Watch Celery logs (if using background sync)
tail -f /var/log/celery.log

# Look for:
# - JWT authentication errors
# - Odoo sync failures
# - Canvas rendering issues
```

### 5.2 Database Monitoring
```sql
-- Check for ERROR logs
SELECT COUNT(*) FROM core_inferencelog 
WHERE status = 'ERROR' 
AND created_at > NOW() - INTERVAL 1 HOUR;

-- Check active sessions
SELECT COUNT(*) FROM core_manufacturingordersession 
WHERE is_active = TRUE;

-- Check Odoo synced sessions
SELECT COUNT(*) FROM core_manufacturingordersession 
WHERE odoo_mo_id IS NOT NULL 
AND created_at > NOW() - INTERVAL 1 DAY;
```

### 5.3 Performance Metrics
- Motion detection latency: Should be < 100ms per frame
- Inference latency: Should match existing performance
- Canvas rendering: Should not block UI
- Odoo sync: Should complete in < 10 seconds (background task)

### 5.4 User Feedback
- Verify operators can start sessions with MO number
- Confirm motion detection works as expected
- Check canvas overlay renders correctly
- Test ERROR flagging for low-confidence results

---

## Common Issues & Solutions

### Issue: Migrations fail with "relation already exists"
**Solution**: 
```bash
python manage.py migrate --fake-initial
# Then migrate forward if needed
```

### Issue: Celery tasks not executing
**Solution**:
```bash
# Check Redis connection
redis-cli ping  # Should return PONG

# Check Celery worker running
celery -A ai_ins_sys inspect active

# Restart Celery worker
celery -A ai_ins_sys worker --loglevel=info --purge
```

### Issue: Odoo connection fails
**Solution**:
```bash
# Test Odoo connectivity
python manage.py shell
from core.odoo_integration import OdooConnector
connector = OdooConnector()
print(connector.authenticate())  # Should print True
```

### Issue: Canvas overlay not rendering
**Solution**:
- Check browser console for JavaScript errors
- Verify canvas element created: `document.querySelector('canvas')`
- Check WebSocket receiving detection data
- Verify liveDetections state updating

### Issue: Motion detection not triggering inference
**Solution**:
- Verify sessionActive = true
- Check motion detection interval running
- Monitor console logs for frame delta values
- Adjust MOTION_THRESHOLD if needed

---

## Performance Tuning

### Motion Detection Tuning
```javascript
// Adjust for sensitivity
STABILITY_THRESHOLD_MS = 2000;  // Increase for slower response
MOTION_THRESHOLD = 5;            // Decrease for more sensitivity
```

### Canvas Rendering Optimization
- Reduce detection count per frame if > 500 detections
- Consider downsampling frames for motion detection
- Use requestAnimationFrame for canvas updates

### Odoo Sync Optimization
```python
# In settings.py
ODOO_SYNC_BATCH_SIZE = 50  # Process MOs in batches
ODOO_SYNC_TIMEOUT = 30     # Timeout in seconds
```

---

## Support & Debugging

### Generate Debug Report
```bash
# Backend
python manage.py check
python manage.py check --deploy

# Database
python manage.py dbshell < debug_queries.sql

# Frontend
npm run build  # Check for build errors
```

### Enable Debug Logging
```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': 'debug.log',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'DEBUG',
            'propagate': True,
        },
        'core': {
            'handlers': ['file'],
            'level': 'DEBUG',
        },
    },
}
```

---

## Rollout Strategy

### Option 1: Staged Rollout (Recommended)
1. Deploy to staging environment
2. Run full test suite
3. Get user acceptance testing
4. Deploy to 10% of production
5. Monitor for 24 hours
6. Deploy to remaining 90%

### Option 2: Blue-Green Deployment
1. Run new version on separate infrastructure
2. Switch traffic to new version
3. Keep old version running for quick rollback

### Option 3: Canary Deployment
1. Deploy to small group of operators first
2. Monitor metrics closely
3. Gradually roll out to all operators

---

**Deployment Checklist Complete** ✅

Once all steps are verified, your deployment is ready for production!
