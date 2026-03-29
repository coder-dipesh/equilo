from typing import Any

from django.contrib.auth.models import update_last_login
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from .session_utils import (
    touch_session_by_jti,
    update_session_after_refresh,
    upsert_session_for_refresh_token,
)


class EquiloTokenObtainPairSerializer(TokenObtainSerializer):
    token_class = RefreshToken

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        data = super().validate(attrs)
        refresh = self.get_token(self.user)
        request = self.context.get('request')
        session = upsert_session_for_refresh_token(str(refresh), request, self.user)
        if session:
            refresh['sid'] = session.pk
        data['refresh'] = str(refresh)
        data['access'] = str(refresh.access_token)
        data['refresh_jti'] = str(refresh.get('jti', '') or '')
        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, self.user)
        return data


class EquiloTokenRefreshSerializer(TokenRefreshSerializer):
    refresh = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        from django.conf import settings as dj_settings

        request = self.context.get('request')
        raw = (attrs.get('refresh') or '').strip()
        if not raw and request:
            raw = request.COOKIES.get(dj_settings.REFRESH_TOKEN_COOKIE_NAME) or ''
        raw = (raw or '').strip()
        if not raw:
            raise serializers.ValidationError({'refresh': _('This field is required.')})

        old_refresh = self.token_class(raw)
        old_jti = str(old_refresh.get('jti', '') or '')

        attrs = {'refresh': raw}
        data = super().validate(attrs)

        if api_settings.ROTATE_REFRESH_TOKENS and data.get('refresh'):
            update_session_after_refresh(old_jti, data['refresh'], request)
        elif old_jti:
            touch_session_by_jti(old_jti, request)

        new_refresh_str = data.get('refresh') or raw
        try:
            nt = self.token_class(new_refresh_str)
            data['refresh_jti'] = str(nt.get('jti', '') or '')
        except Exception:
            data['refresh_jti'] = ''

        return data
