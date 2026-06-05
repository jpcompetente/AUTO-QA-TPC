import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ai_ins_sys.settings')
django.setup()
from core.models import InferenceLog

qs = InferenceLog.objects.order_by('-timestamp')[:20]
for l in qs:
    try:
        op = l.operator.username
    except Exception:
        op = None
    print(json.dumps({'id': l.id, 'session_id': l.session_id, 'batch_number': l.batch_number, 'timestamp': l.timestamp.isoformat(), 'operator': op, 'confidence': l.confidence_score, 'status': l.status}))
