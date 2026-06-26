import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ai_ins_sys.settings')
django.setup()
from core.models import InferenceLog
logs = InferenceLog.objects.filter(system_decision='UNCERTAIN').order_by('-timestamp')[:6]
for log in logs:
    h = log.detection_results.get('image_hash', '')
    print('id=%s | batch=%s | ts=%s | hash=%s' % (log.id, log.batch_number, log.timestamp, h))
