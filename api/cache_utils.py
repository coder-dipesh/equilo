"""
cache_utils.py  —  cycle summary caching helpers.

Drop this file into api/ alongside session_utils.py.

Usage:
    from .cache_utils import (
        get_cached_cycle_summary,
        set_cached_cycle_summary,
        invalidate_cycle_summary,
    )
"""
from __future__ import annotations

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

# How long (seconds) a cached summary stays fresh.
# Short enough that a write by another member feels live within a minute.
SUMMARY_TTL = 60


def _key(place_id: int, cycle_id: int, user_id: int) -> str:
    return f"cycle_summary:{place_id}:{cycle_id}:{user_id}"


def get_cached_cycle_summary(place_id: int, cycle_id: int, user_id: int):
    """Return cached (total_expense, my_expense, total_i_paid, balance_with) or None."""
    try:
        return cache.get(_key(place_id, cycle_id, user_id))
    except Exception:
        # Never let a cache failure break the request — just recompute.
        logger.warning("cache GET failed for cycle_summary", exc_info=True)
        return None


def set_cached_cycle_summary(
    place_id: int, cycle_id: int, user_id: int, data: tuple
) -> None:
    """Store the summary tuple. Silently swallows cache errors."""
    try:
        cache.set(_key(place_id, cycle_id, user_id), data, SUMMARY_TTL)
    except Exception:
        logger.warning("cache SET failed for cycle_summary", exc_info=True)


def invalidate_cycle_summary(place_id: int, cycle_id: int) -> None:
    """
    Delete cached summaries for every member of the place/cycle.

    Call this whenever an Expense or Settlement is created, updated, or deleted
    for this cycle — so the next request always reflects the latest data.

    Example (in a view after saving an expense):
        invalidate_cycle_summary(place.id, expense.cycle_id)
    """
    from .models import PlaceMember  # local import to avoid circular

    try:
        user_ids = PlaceMember.objects.filter(
            place_id=place_id
        ).values_list("user_id", flat=True)
        keys = [_key(place_id, cycle_id, uid) for uid in user_ids]
        if keys:
            cache.delete_many(keys)
    except Exception:
        logger.warning("cache invalidation failed for cycle_summary", exc_info=True)
