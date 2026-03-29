"""
Celery tasks for Equilo. Used by Celery Beat for scheduled jobs.
"""
from celery import shared_task
from django.utils import timezone


@shared_task
def auto_transition_past_cycles_to_pending():
    """
    Run daily (e.g. via Celery Beat). Find all OPEN cycles whose end_date has passed,
    transition them to PENDING_SETTLEMENT (no new expenses; members settle up), and
    send notifications. Resolve (RESOLVED) is manual by admin only when all balances are 0.
    """
    from .models import ExpenseCycle
    from .views import _send_cycle_ended_notifications

    today = timezone.now().date()
    to_transition = ExpenseCycle.objects.filter(
        status=ExpenseCycle.STATUS_OPEN,
        end_date__lt=today,
    ).select_related('place')

    count = 0
    for cycle in to_transition:
        cycle.status = ExpenseCycle.STATUS_PENDING_SETTLEMENT
        cycle.save(update_fields=['status'])
        _send_cycle_ended_notifications(cycle.place, cycle)
        count += 1

    return {'transitioned_to_pending': count}


@shared_task
def cleanup_expired_sessions():
    """Delete UserSession rows past refresh expiry (cron / Celery Beat)."""
    from .models import UserSession

    qs = UserSession.objects.filter(expires_at__lt=timezone.now())
    deleted, _ = qs.delete()
    return {'deleted_sessions': deleted}
