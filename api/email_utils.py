"""
email_utils.py — single entry point for transactional email.

All call sites should use ``send_transactional_email`` so that:
  - opt-out flag (UserProfile.email_notifications_enabled) is honoured
  - unsubscribe URL + List-Unsubscribe header are added consistently
  - Brevo (or any future provider) can be swapped in one place
  - SMTP failures never break the originating request
"""
from __future__ import annotations

import logging
from typing import Any, Mapping, Optional

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.template import TemplateDoesNotExist
from django.template.loader import render_to_string
from django.urls import reverse

logger = logging.getLogger(__name__)

# Salt scopes the signed token to this purpose so a token signed for one
# action cannot be replayed against another.
_UNSUB_SALT = "api.email_utils.unsubscribe"
# 60 days is well beyond any reasonable digest cadence; users can re-enable in
# Settings if they unsubscribed by mistake.
_UNSUB_MAX_AGE_SECONDS = 60 * 24 * 60 * 60


def make_unsubscribe_token(user_id: int) -> str:
    """Sign a user id into a short, URL-safe token for the unsubscribe link."""
    return signing.TimestampSigner(salt=_UNSUB_SALT).sign(str(user_id))


def read_unsubscribe_token(token: str) -> Optional[int]:
    """Return the user id encoded in *token*, or None if invalid/expired."""
    try:
        raw = signing.TimestampSigner(salt=_UNSUB_SALT).unsign(
            token, max_age=_UNSUB_MAX_AGE_SECONDS
        )
        return int(raw)
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return None


def _absolute_unsubscribe_url(user_id: int) -> str:
    token = make_unsubscribe_token(user_id)
    # reverse() returns just the path; we want an absolute URL the user can
    # tap from their inbox without needing host headers. The unsubscribe view
    # is served by the Django backend, so we use BACKEND_URL (which falls
    # back to FRONTEND_URL when both are on the same host).
    path = reverse("email_unsubscribe", kwargs={"token": token})
    base = (
        getattr(settings, "BACKEND_URL", "")
        or getattr(settings, "FRONTEND_URL", "")
        or ""
    ).rstrip("/")
    return f"{base}{path}"


def _user_email(user) -> Optional[str]:
    email = (getattr(user, "email", "") or "").strip()
    return email or None


def _emails_enabled_for(user) -> bool:
    profile = getattr(user, "profile", None)
    if profile is None:
        # No profile row yet — default to enabled (matches model default).
        return True
    return bool(getattr(profile, "email_notifications_enabled", True))


def send_transactional_email(
    user,
    template_name: str,
    subject: str,
    ctx: Optional[Mapping[str, Any]] = None,
) -> bool:
    """
    Render and send a transactional email to *user*.

    Looks up two templates:
      - ``emails/<template_name>.html``  (HTML body, required)
      - ``emails/<template_name>.txt``   (plaintext body, required for
                                          deliverability — most providers
                                          downrank HTML-only mail)

    Returns True if the message was handed to the email backend, False if it
    was skipped (no email, opted out, missing config) or failed.
    """
    if user is None:
        return False
    email = _user_email(user)
    if not email:
        return False
    if not _emails_enabled_for(user):
        return False

    # In production we want SMTP creds set; in dev the console backend works
    # without creds and is genuinely useful (you can read the email in the
    # runserver log). So only short-circuit when the backend is SMTP without
    # credentials, which would otherwise raise on send.
    backend = getattr(settings, "EMAIL_BACKEND", "")
    if backend.endswith("smtp.EmailBackend") and not getattr(settings, "EMAIL_HOST_USER", ""):
        logger.info("email skipped: SMTP backend configured but no EMAIL_HOST_USER")
        return False

    full_ctx: dict[str, Any] = {
        "user": user,
        "user_display_name": (
            getattr(getattr(user, "profile", None), "display_name", "")
            or getattr(user, "username", "")
            or "there"
        ).strip(),
        "frontend_url": (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/"),
        "unsubscribe_url": _absolute_unsubscribe_url(user.id),
        "subject": subject,
    }
    if ctx:
        full_ctx.update(ctx)

    try:
        html_body = render_to_string(f"emails/{template_name}.html", full_ctx)
        text_body = render_to_string(f"emails/{template_name}.txt", full_ctx)
    except TemplateDoesNotExist:
        logger.exception("email template missing for %s", template_name)
        return False

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        to=[email],
    )
    msg.attach_alternative(html_body, "text/html")
    # RFC 2369 / 8058 — gives Gmail/Outlook a one-click unsubscribe button and
    # protects sender reputation.
    msg.extra_headers["List-Unsubscribe"] = f"<{full_ctx['unsubscribe_url']}>"
    msg.extra_headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    try:
        # fail_silently=False so we get the traceback in our log; outer
        # try/except still prevents request failure.
        msg.send(fail_silently=False)
        return True
    except Exception:
        logger.warning(
            "transactional email send failed for template=%s user_id=%s",
            template_name,
            getattr(user, "id", None),
            exc_info=True,
        )
        return False
