"""
Celery app for Equilo. Loaded in equilo/__init__.py so the app is ready when Django starts.
"""
from celery import Celery
from celery.schedules import crontab

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'equilo.settings')

app = Celery('equilo')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Run auto_transition_past_cycles_to_pending daily at 00:05 UTC (OPEN → PENDING_SETTLEMENT)
app.conf.beat_schedule = {
    'auto-transition-cycles-to-pending': {
        'task': 'api.tasks.auto_transition_past_cycles_to_pending',
        'schedule': crontab(hour=0, minute=5),
    },
    'cleanup-expired-sessions': {
        'task': 'api.tasks.cleanup_expired_sessions',
        'schedule': crontab(hour=3, minute=20),
    },
}
