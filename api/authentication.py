from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication as BaseJWTAuthentication

from .models import UserSession


class SessionTrackingJWTAuthentication(BaseJWTAuthentication):
    """
    JWT auth + session row check + last_used_at bump when access carries `sid`.

    If `sid` is present, the UserSession row must still exist. Revoking a session
    deletes that row, so the next API call with that access token fails auth and
    the client is forced to re-authenticate (not only after access expiry).
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if not result:
            return result
        user, validated_token = result
        sid = None
        try:
            sid = validated_token.get('sid')
        except Exception:
            pass
        if sid is not None:
            if not UserSession.objects.filter(pk=sid, user_id=user.id).exists():
                raise AuthenticationFailed(
                    'Session has been revoked or expired.',
                    code='session_revoked',
                )
            UserSession.objects.filter(pk=sid, user_id=user.id).update(last_used_at=timezone.now())
        return result
