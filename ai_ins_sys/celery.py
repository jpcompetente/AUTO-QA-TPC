"""
Celery configuration for ai_ins_sys project
"""

import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ai_ins_sys.settings')

app = Celery('ai_ins_sys')

# Load configuration from Django settings with namespace
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from installed apps
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery setup"""
    print(f'Request: {self.request!r}')

# Scheduled tasks
app.conf.beat_schedule = {
    'reset-batch-counter-midnight': {
        'task': 'core.tasks.reset_batch_counter',
        'schedule': crontab(hour=0, minute=0),
    },
}
