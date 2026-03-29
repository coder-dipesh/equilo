"""
Session tracking, refresh cookies, JWT blacklist by jti, and cleanup helpers.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone as dt_utc

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


def get_client_ip(request) -> str | None:
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()[:45]
    ip = request.META.get('REMOTE_ADDR')
    return (ip or '')[:45] or None


def parse_device_type(user_agent: str) -> str:
    """Return a coarse device_type: mobile, tablet, desktop, or unknown."""
    ua = (user_agent or '').lower()
    if not ua:
        return 'unknown'
    if 'tablet' in ua or 'ipad' in ua:
        return 'tablet'
    if 'mobile' in ua or 'android' in ua or 'iphone' in ua or 'ipod' in ua:
        return 'mobile'
    if re.search(r'\b(windows|macintosh|linux|x11)\b', ua):
        return 'desktop'
    return 'unknown'


def _device_label_from_request(request):
    """Parse User-Agent to a short device label (matches existing views helper)."""
    ua = (request.META.get('HTTP_USER_AGENT') or '')[:500]
    ua_lower = ua.lower()
    if not ua:
        return 'Unknown device'
    if 'mobile' in ua_lower or 'android' in ua_lower:
        if 'iphone' in ua_lower or 'ipad' in ua_lower:
            return 'iPhone' if 'iphone' in ua_lower else 'iPad'
        return 'Android'
    browser = 'Browser'
    if 'edg/' in ua_lower:
        browser = 'Edge'
    elif 'chrome' in ua_lower and 'chromium' not in ua_lower:
        browser = 'Chrome'
    elif 'firefox' in ua_lower:
        browser = 'Firefox'
    elif 'safari' in ua_lower and 'chrome' not in ua_lower:
        browser = 'Safari'
    os_name = 'Device'
    if 'mac' in ua_lower or 'macintosh' in ua_lower:
        os_name = 'Mac'
    elif 'windows' in ua_lower:
        os_name = 'Windows'
    elif 'linux' in ua_lower:
        os_name = 'Linux'
    return f'{browser} on {os_name}'


def blacklist_outstanding_for_jti(jti: str, user_id=None) -> None:
    """Blacklist refresh token(s) with this jti via the token_blacklist app."""
    if not jti:
        return
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    qs = OutstandingToken.objects.filter(jti=jti)
    if user_id is not None:
        qs = qs.filter(user_id=user_id)
    for ot in qs:
        BlacklistedToken.objects.get_or_create(token=ot)


def set_refresh_cookie(response, refresh_str: str) -> None:
    """HttpOnly cookie for refresh token (rotation updates via Set-Cookie)."""
    max_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    name = settings.REFRESH_TOKEN_COOKIE_NAME
    secure = settings.REFRESH_TOKEN_COOKIE_SECURE
    samesite = settings.REFRESH_TOKEN_SAMESITE
    if str(samesite).lower() == 'none' and not secure:
        secure = True
    response.set_cookie(
        name,
        refresh_str,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(
        settings.REFRESH_TOKEN_COOKIE_NAME,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


def get_refresh_token_from_request(request) -> str:
    """Prefer cookie; fall back to JSON body (legacy clients)."""
    if not request:
        return ''
    c = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if c:
        return c.strip()
    try:
        body = request.data.get('refresh') or ''
    except Exception:
        body = ''
    return (body or '').strip()


def session_pk_from_access_header(request) -> int | None:
    """DB id from JWT access claim `sid` (which UserSession row this token belongs to)."""
    auth = (request.META.get('HTTP_AUTHORIZATION') or '') if request else ''
    if not auth.startswith('Bearer '):
        return None
    parts = auth.split()
    if len(parts) < 2:
        return None
    raw = parts[1].strip()
    if not raw:
        return None
    try:
        from rest_framework_simplejwt.tokens import AccessToken

        t = AccessToken(raw)
        sid = t.get('sid')
        if sid is None:
            return None
        return int(sid)
    except Exception:
        return None


def jti_from_refresh_string(refresh_str: str) -> str | None:
    from rest_framework_simplejwt.tokens import RefreshToken

    try:
        token = RefreshToken(refresh_str)
        jti = str(token.get('jti', '') or '')
        if jti:
            return jti
        return hashlib.sha256(refresh_str.encode()).hexdigest()[:64]
    except Exception:
        return None


def enforce_max_sessions(user, protect_jti: str | None = None) -> None:
    """Revoke oldest sessions when above max (blacklist jti + delete row)."""
    from .models import UserSession

    max_n = getattr(settings, 'MAX_ACTIVE_SESSIONS_PER_USER', 10)
    if max_n <= 0:
        return
    while UserSession.objects.filter(user=user, expires_at__gt=timezone.now()).count() > max_n:
        qs = UserSession.objects.filter(user=user, expires_at__gt=timezone.now()).order_by('last_used_at', 'created_at')
        if protect_jti:
            qs = qs.exclude(jti=protect_jti)
        victim = qs.first()
        if not victim:
            break
        blacklist_outstanding_for_jti(victim.jti, user.id)
        victim.delete()


def upsert_session_for_refresh_token(refresh_str: str, request, user) -> 'UserSession | None':
    """
    Create or update UserSession for this refresh token (no raw token stored).
    Returns the UserSession row or None.
    """
    from rest_framework_simplejwt.tokens import RefreshToken

    from .models import UserSession

    try:
        token = RefreshToken(refresh_str)
        jti = str(token.get('jti', '') or '')
        if not jti:
            jti = hashlib.sha256(refresh_str.encode()).hexdigest()[:64]
        exp = token.get('exp')
        if not exp:
            return None
        uid = token.get('user_id') or token.get('sub')
        if uid is None or str(uid) != str(user.id):
            return None
        expires_at = datetime.fromtimestamp(exp, tz=dt_utc.utc)
        device_label = _device_label_from_request(request) if request else ''
        user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:2000] if request else ''
        device_type = parse_device_type(user_agent)
        ip_address = get_client_ip(request)
        now = timezone.now()
        session, _ = UserSession.objects.update_or_create(
            jti=jti,
            defaults={
                'user': user,
                'device_label': device_label,
                'user_agent': user_agent,
                'device_type': device_type,
                'ip_address': ip_address,
                'expires_at': expires_at,
                'last_used_at': now,
            },
        )
        enforce_max_sessions(user, protect_jti=jti)
        return session
    except Exception:
        return None


def update_session_after_refresh(old_jti: str, new_refresh_str: str, request) -> None:
    """After rotation: move UserSession row from old jti to new jti."""
    from rest_framework_simplejwt.tokens import RefreshToken

    from .models import UserSession

    if not old_jti or not new_refresh_str:
        return
    try:
        new_t = RefreshToken(new_refresh_str)
        new_jti = str(new_t.get('jti', '') or '')
        exp = new_t.get('exp')
        if not new_jti or not exp:
            return
        uid = new_t.get('user_id') or new_t.get('sub')
        expires_at = datetime.fromtimestamp(exp, tz=dt_utc.utc)
        now = timezone.now()
        user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:2000] if request else ''
        ip_address = get_client_ip(request)
        updated = UserSession.objects.filter(jti=old_jti).update(
            jti=new_jti,
            expires_at=expires_at,
            last_used_at=now,
            user_agent=user_agent,
            device_type=parse_device_type(user_agent),
            ip_address=ip_address,
        )
        if updated:
            return
        user = User.objects.filter(pk=str(uid)).first() if uid is not None else None
        if user:
            upsert_session_for_refresh_token(new_refresh_str, request, user)
    except Exception:
        pass


def touch_session_by_jti(jti: str, request) -> None:
    from .models import UserSession

    if not jti:
        return
    ua = (request.META.get('HTTP_USER_AGENT') or '')[:2000] if request else ''
    updates = {'last_used_at': timezone.now(), 'ip_address': get_client_ip(request)}
    if ua:
        updates['user_agent'] = ua
        updates['device_type'] = parse_device_type(ua)
    UserSession.objects.filter(jti=jti).update(**updates)