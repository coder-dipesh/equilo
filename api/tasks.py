"""
Celery tasks for Equilo. Used by Celery Beat for scheduled jobs.

NOTE: On Vercel there is no long-lived process to run Celery Beat or a worker,
so the actual production trigger for the daily cycle transition is the
``/api/cron/transition-cycles/`` HTTP endpoint invoked by Vercel Cron. Both
paths share the same implementation in :func:`transition_pending_cycles`.
"""
from celery import shared_task
from django.utils import timezone


def transition_pending_cycles() -> dict:
    """
    Find OPEN cycles past their ``end_date``, move them to PENDING_SETTLEMENT,
    and fire the cycle-ended notification + email batch for each.

    Pure function (no Celery / no HTTP), so the same body is reused by:
      - the Celery Beat task below (local dev)
      - the Vercel Cron HTTP endpoint (production)
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
def auto_transition_past_cycles_to_pending():
    """Celery wrapper around :func:`transition_pending_cycles`."""
    return transition_pending_cycles()


@shared_task
def cleanup_expired_sessions():
    """Delete UserSession rows past refresh expiry (cron / Celery Beat)."""
    from .models import UserSession

    qs = UserSession.objects.filter(expires_at__lt=timezone.now())
    deleted, _ = qs.delete()
    return {'deleted_sessions': deleted}
