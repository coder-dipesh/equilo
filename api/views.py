import io
import logging
import secrets
from datetime import date, timedelta, timezone as dt_utc
from decimal import Decimal

from django.conf import settings as django_settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.contrib.auth import get_user_model
from django.db.models import Q, Count, Sum, Case, When, F, DecimalField, OuterRef, Subquery
from django.shortcuts import render
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView as BaseTokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView as BaseTokenRefreshView

from .jwt_serializers import EquiloTokenObtainPairSerializer, EquiloTokenRefreshSerializer
from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite, UserProfile, Notification, ExpenseCycle, UserSession, Settlement, ActivityLog
from .session_utils import (
    blacklist_outstanding_for_jti,
    clear_refresh_cookie,
    get_refresh_token_from_request,
    jti_from_refresh_string,
    session_pk_from_access_header,
    set_refresh_cookie,
    upsert_session_for_refresh_token,
)

User = get_user_model()
from .permissions import IsPlaceMember
from .serializers import (
    UserSerializer,
    PlaceSerializer,
    PlaceMemberSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    PlaceInviteSerializer,
    NotificationSerializer,
    ExpenseCycleSerializer,
    UserSessionSerializer,
)

from .cache_utils import (
    get_cached_cycle_summary,
    set_cached_cycle_summary,
    invalidate_cycle_summary,
)
from .email_utils import send_transactional_email, read_unsubscribe_token

logger = logging.getLogger(__name__)

# ----- Auth (public) -----

def _safe_display_name(u):
    """Return display name if profile exists, else username."""
    if not u:
        return ''
    try:
        profile = u.profile
    except Exception:
        profile = None
    name = (getattr(profile, 'display_name', None) or '').strip() if profile else ''
    return name or getattr(u, 'username', '') or ''


def _compress_profile_photo(uploaded_file):
    """Resize and compress image for profile photo. Max 512px, JPEG quality 85. Returns file-like or None on error."""
    try:
        from PIL import Image
    except ImportError:
        return uploaded_file
    try:
        img = Image.open(uploaded_file).convert('RGB')
    except Exception:
        return uploaded_file
    max_size = 512
    w, h = img.size
    if w > max_size or h > max_size:
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=85, optimize=True)
    buf.seek(0)
    data = buf.getvalue()
    name = (uploaded_file.name or 'photo.jpg').rsplit('.', 1)[0] + '.jpg'
    return InMemoryUploadedFile(io.BytesIO(data), 'profile_photo', name, 'image/jpeg', len(data), None)


def _log_activity(request, activity_type, place=None, expense=None, target_user=None, amount=None, description='', extra=None):
    """Create an ActivityLog entry for the activity feed."""
    if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
        return
    kwargs = {
        'user': request.user,
        'type': activity_type,
        'place': place,
        'expense': expense,
        'target_user': target_user,
        'amount': amount,
        'description': (description or '')[:500],
        'extra': extra or {},
    }
    ActivityLog.objects.create(**kwargs)


def _profile_photo_url(request, user):
    """Return absolute URL for user's profile photo, or None."""
    if not user:
        return None
    try:
        if getattr(user, 'profile', None) and user.profile.profile_photo:
            return request.build_absolute_uri(user.profile.profile_photo.url)
    except Exception:
        pass
    return None


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me(request):
    """Current user info (GET) or update profile (PATCH: email, display_name, profile_photo). Username is read-only."""
    if request.method == 'PATCH':
        user = request.user
        data = request.data
        # Username is not changeable via this endpoint
        if 'email' in data:
            user.email = (data['email'] or '').strip()
        user.save()
        profile, _ = UserProfile.objects.get_or_create(user=user, defaults={'display_name': ''})
        if 'display_name' in data:
            profile.display_name = (data['display_name'] or '').strip()
        if 'profile_photo' in request.FILES:
            photo_file = _compress_profile_photo(request.FILES['profile_photo'])
            profile.profile_photo = photo_file
        elif request.data.get('remove_profile_photo') in (True, 'true', '1'):
            profile.profile_photo = None
        profile.save()
        _log_activity(request, ActivityLog.TYPE_PROFILE_UPDATED, description='Profile updated')
        return Response(UserSerializer(user, context={'request': request}).data)
    return Response(UserSerializer(request.user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change password. Body: { current_password, new_password }."""
    user = request.user
    current = request.data.get('current_password') or ''
    new_pw = request.data.get('new_password') or ''
    if not current:
        return Response({'current_password': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
    if not new_pw:
        return Response({'new_password': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
    if not user.check_password(current):
        return Response({'current_password': ['Current password is incorrect.']}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_pw) < 8:
        return Response({'new_password': ['Password must be at least 8 characters.']}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new_pw)
    user.save()
    _log_activity(request, ActivityLog.TYPE_PASSWORD_CHANGED, description='Password changed')
    return Response({'detail': 'Password updated.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_account(request):
    """Permanently delete the current user. Body: { password }."""
    user = request.user
    password = request.data.get('password') or ''
    if not password:
        return Response({'password': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
    if not user.check_password(password):
        return Response({'password': ['Password is incorrect.']}, status=status.HTTP_400_BAD_REQUEST)
    if PlaceMember.objects.filter(user=user).exists():
        return Response(
            {'detail': "This user is a member of an expense group so they can't be deleted yet!"},
            status=status.HTTP_400_BAD_REQUEST
        )
    user.delete()
    return Response({'detail': 'Account deleted.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """Register a new user. Returns user + tokens."""
    serializer = UserSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')
    if not username or not password:
        return Response(
            {'error': 'username and password required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if User.objects.filter(username=username).exists():
        return Response(
            {'username': 'A user with that username already exists.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    user = User.objects.create_user(
        username=username,
        email=email or '',
        password=password,
    )
    # Ensure profile exists for display_name/profile_photo consumers
    UserProfile.objects.get_or_create(user=user, defaults={'display_name': ''})
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    session = upsert_session_for_refresh_token(str(refresh), request, user)
    if session:
        refresh['sid'] = session.pk
    data = {
        'user': UserSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh_jti': str(refresh.get('jti', '') or ''),
    }
    response = Response(data, status=status.HTTP_201_CREATED)
    set_refresh_cookie(response, str(refresh))
    return response


class EquiloTokenObtainPairView(BaseTokenObtainPairView):
    """Login: access + refresh_jti in body; refresh token only in HttpOnly cookie."""

    serializer_class = EquiloTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0]) from e
        data = dict(serializer.validated_data)
        refresh = data.pop('refresh', None)
        response = Response(data, status=status.HTTP_200_OK)
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


class CookieTokenRefreshView(BaseTokenRefreshView):
    """Refresh: reads refresh from HttpOnly cookie when body omits it; sets rotated cookie."""

    serializer_class = EquiloTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0]) from e
        data = dict(serializer.validated_data)
        new_refresh = data.pop('refresh', None)
        response = Response(data, status=status.HTTP_200_OK)
        if new_refresh:
            set_refresh_cookie(response, new_refresh)
        return response


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_logout(request):
    """Blacklist current refresh (cookie or body) and clear refresh cookie."""
    from rest_framework_simplejwt.tokens import RefreshToken

    raw = get_refresh_token_from_request(request)
    if raw:
        try:
            token = RefreshToken(raw)
            jti = str(token.get('jti', '') or '')
            token.blacklist()
            if jti:
                UserSession.objects.filter(jti=jti).delete()
        except Exception:
            pass
    response = Response({'detail': 'Logged out.'})
    clear_refresh_cookie(response)
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sessions_register(request):
    """
    Register the current device's session from refresh cookie (or body for legacy).
    """
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh_str = get_refresh_token_from_request(request)
    if not refresh_str:
        return Response({'detail': 'No refresh token (cookie or body).'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        token = RefreshToken(refresh_str)
        uid = token.get('user_id') or token.get('sub')
        if uid is None or str(uid) != str(request.user.id):
            return Response({'detail': 'Refresh token does not belong to current user.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
    ok = upsert_session_for_refresh_token(refresh_str, request, request.user)
    if not ok:
        return Response(
            {'detail': 'Could not save session.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    return Response({'detail': 'Session registered.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sessions_list(request):
    """
    List active sessions. Ensures this browser's session row exists when a refresh cookie is present.
    is_current uses refresh cookie jti and/or access token `sid` (for UI only).
    """
    user = request.user
    refresh_str = get_refresh_token_from_request(request)
    if refresh_str:
        try:
            upsert_session_for_refresh_token(refresh_str, request, user)
        except Exception:
            pass
    current_jti = jti_from_refresh_string(refresh_str) if refresh_str else None
    current_sid = session_pk_from_access_header(request)
    sessions = UserSession.objects.filter(user=user, expires_at__gt=timezone.now()).order_by('-created_at')
    serializer = UserSessionSerializer(
        sessions,
        many=True,
        context={'current_jti': current_jti, 'current_sid': current_sid},
    )
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def session_revoke(request, jti):
    """Revoke (logout) a specific session by jti: blacklist + delete row."""
    user = request.user
    session = UserSession.objects.filter(user=user, jti=jti).first()
    if not session:
        return Response({'detail': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)
    row_pk = session.pk
    cookie_jti = jti_from_refresh_string(get_refresh_token_from_request(request))
    current_sid = session_pk_from_access_header(request)
    is_this_device = (cookie_jti and cookie_jti == jti) or (
        current_sid is not None and row_pk == current_sid
    )
    blacklist_outstanding_for_jti(jti, user.id)
    session.delete()
    data = {'detail': 'Session revoked.'}
    if is_this_device:
        data['logout_required'] = True
    response = Response(data)
    if is_this_device:
        clear_refresh_cookie(response)
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sessions_revoke_all(request):
    """
    Revoke all other sessions. Current session is identified by refresh cookie (or body), never by client-only hints.
    """
    user = request.user
    refresh_str = get_refresh_token_from_request(request)
    if not refresh_str:
        return Response({'detail': 'No refresh token (cookie or body).'}, status=status.HTTP_400_BAD_REQUEST)
    keep_jti = jti_from_refresh_string(refresh_str)
    if not keep_jti:
        return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
    sessions = UserSession.objects.filter(user=user, expires_at__gt=timezone.now())
    for session in sessions:
        if session.jti == keep_jti:
            continue
        blacklist_outstanding_for_jti(session.jti, user.id)
        session.delete()
    return Response({'detail': 'All other sessions revoked.'})


# ----- Hello (public) -----

@api_view(['GET'])
@permission_classes([AllowAny])
def hello_world(request):
    return Response({
        'message': 'Hello World from Django REST API!',
        'status': 'ok',
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def stats(request):
    """Public stats for landing page (e.g. total place count)."""
    return Response({'place_count': Place.objects.count()})


# ----- Places -----

class PlaceViewSet(ModelViewSet):
    serializer_class = PlaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Place.objects.filter(members__user=self.request.user)
            .distinct()
            .prefetch_related('members__user')
        )

    def get_permissions(self):
        return [IsAuthenticated(), IsPlaceMember()]

    def _is_place_owner(self, place, user):
        return (
            place.created_by_id == user.id
            or place.members.filter(user=user, role=PlaceMember.ROLE_OWNER).exists()
        )

    def update(self, request, *args, **kwargs):
        place = self.get_object()
        if not self._is_place_owner(place, request.user):
            raise PermissionDenied('Only the place owner can edit this place.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        place = self.get_object()
        if not self._is_place_owner(place, request.user):
            raise PermissionDenied('Only the place owner can edit this place.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Only the place owner/creator can delete a place.
        This will cascade-delete related members, expenses, categories, invites, notifications.
        """
        place = self.get_object()
        if not self._is_place_owner(place, request.user):
            raise PermissionDenied('Only the place owner can delete this place.')
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        _log_activity(self.request, ActivityLog.TYPE_PLACE_CREATED, place=serializer.instance, description=serializer.instance.name)


# ----- Place members (list only, join via invite) -----

class PlaceMemberList(generics.ListAPIView):
    serializer_class = PlaceMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        place_id = self.kwargs['place_id']
        if not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return PlaceMember.objects.none()
        return PlaceMember.objects.filter(place_id=place_id)


# ----- Categories (nested under place) -----

class ExpenseCategoryViewSet(ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        place_id = self.kwargs.get('place_id')
        if not place_id or not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return ExpenseCategory.objects.none()
        qs = ExpenseCategory.objects.filter(place_id=place_id)
        # Ensure all preset categories exist (fixes new places and places that only got one category)
        try:
            place = Place.objects.get(id=place_id)
            for name, cat_type in ExpenseCategory.PRESETS:
                ExpenseCategory.objects.get_or_create(
                    place=place, name=name,
                    defaults={'name': name, 'category_type': cat_type}
                )
            qs = ExpenseCategory.objects.filter(place_id=place_id).order_by('name')
        except Place.DoesNotExist:
            pass
        return qs

    def perform_create(self, serializer):
        place = Place.objects.get(id=self.kwargs['place_id'])
        serializer.save(place=place)


# ----- Expenses (nested under place) -----


class ExpensePageNumberPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class ExpenseViewSet(ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ExpensePageNumberPagination

    def get_queryset(self):
        place_id = self.kwargs.get('place_id')
        membership = None
        if place_id:
            try:
                membership = PlaceMember.objects.get(place_id=place_id, user=self.request.user)
            except PlaceMember.DoesNotExist:
                pass
        if not place_id or not membership:
            return Expense.objects.none()
        qs = (
            Expense.objects.filter(place_id=place_id)
            .select_related('paid_by', 'added_by', 'category', 'place', 'cycle')
            .prefetch_related('splits__user')
            .order_by('-created_at')
        )
        # Only show expenses added on or after when this user joined the place
        qs = qs.filter(created_at__gte=membership.joined_at)
        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            try:
                cid = int(cycle_id)
                if ExpenseCycle.objects.filter(place_id=place_id, pk=cid).exists():
                    return qs.filter(cycle_id=cid)
            except ValueError:
                pass
        current = _get_current_cycle(place_id)
        if current:
            return qs.filter(cycle_id=current.id)
        # No open cycle: show only current cycle (none), not past expenses
        return qs.none()

    def _can_edit_expense(self, request, expense):
        if not expense.place.members.filter(user=request.user).exists():
            return False
        if expense.place.members.filter(user=request.user, role=PlaceMember.ROLE_OWNER).exists():
            return True
        if expense.added_by_id == request.user.id:
            return True
        return False

    def perform_destroy(self, instance):
        if not self._can_edit_expense(self.request, instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the person who added this expense or the place owner can delete it.')
        place = instance.place
        desc = instance.description
        amt = instance.amount
        _log_activity(
            self.request, ActivityLog.TYPE_EXPENSE_DELETED,
            place=place, expense=None, amount=amt, description=desc,
            extra={'expense_id': instance.id},
        )
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not self._can_edit_expense(self.request, instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the person who added this expense or the place owner can edit it.')
        super().perform_update(serializer)
        _log_activity(
            self.request, ActivityLog.TYPE_EXPENSE_EDITED,
            place=instance.place, expense=instance,
            amount=instance.amount, description=instance.description,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        place_id = self.kwargs.get('place_id')
        if place_id:
            try:
                context['place'] = Place.objects.get(id=place_id)
                context['current_cycle'] = _get_current_cycle(place_id)
            except Place.DoesNotExist:
                pass
        return context

    def perform_create(self, serializer):
        place = Place.objects.get(id=self.kwargs['place_id'])
        current_cycle = _get_current_cycle(place.id)
        if not current_cycle:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'cycle': 'No open cycle. Start a new cycle first from the Summary tab.'})
        expense = serializer.save(place=place)

        _log_activity(
            self.request, ActivityLog.TYPE_EXPENSE_ADDED,
            place=place, expense=expense,
            amount=expense.amount, description=expense.description,
        )

        # Notifications: create a lightweight notification for other members
        actor = self.request.user
        actor_name = _safe_display_name(actor) or actor.username
        title = f"New expense in {place.name}"
        msg = f"{actor_name} added {expense.description}"
        data = {
            'place_id': place.id,
            'expense_id': expense.id,
            'amount': float(expense.amount),
        }
        member_ids = list(place.members.exclude(user=actor).values_list('user_id', flat=True))
        Notification.objects.bulk_create([
            Notification(
                user_id=uid,
                place=place,
                type=Notification.TYPE_EXPENSE_ADDED,
                title=title,
                message=msg,
                data=data,
            )
            for uid in member_ids
        ])


# ----- Invites -----

class PlaceInviteViewSet(ModelViewSet):
    serializer_class = PlaceInviteSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        place_id = self.kwargs.get('place_id')
        if not place_id:
            return PlaceInvite.objects.none()
        if not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return PlaceInvite.objects.none()
        # Only show email invites in the list; link-only invites are not shown as "pending"
        return PlaceInvite.objects.filter(
            place_id=place_id,
            status=PlaceInvite.STATUS_PENDING,
        ).exclude(email__isnull=True)

    def perform_create(self, serializer):
        place = Place.objects.get(id=self.kwargs['place_id'])
        if not place.members.filter(user=self.request.user, role=PlaceMember.ROLE_OWNER).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the place owner can send invites.')
        email = serializer.validated_data.get('email') or None
        if email:
            email = email.strip() or None
        # When creating a link-only invite, expire previous link-only invites so only one is active
        if not email:
            PlaceInvite.objects.filter(
                place=place,
                email__isnull=True,
                status=PlaceInvite.STATUS_PENDING,
            ).update(status=PlaceInvite.STATUS_EXPIRED)
        invite = serializer.save(
            place=place,
            invited_by=self.request.user,
            token=secrets.token_urlsafe(32),
            status=PlaceInvite.STATUS_PENDING,
            email=email,
        )
        # TODO: send email with link containing invite.token


def _invite_expired(invite):
    """Invite links expire after 1 day."""
    return timezone.now() - invite.created_at > timedelta(days=1)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_place(request, token):
    """Join a place using invite token. Body: {}"""
    try:
        invite = PlaceInvite.objects.get(token=token, status=PlaceInvite.STATUS_PENDING)
    except PlaceInvite.DoesNotExist:
        return Response({'error': 'Invalid or expired invite'}, status=status.HTTP_404_NOT_FOUND)
    if _invite_expired(invite):
        invite.status = PlaceInvite.STATUS_EXPIRED
        invite.save(update_fields=['status'])
        return Response({
            'error': 'This invite link has expired. Please ask the place owner for a new link.',
        }, status=status.HTTP_410_GONE)
    if invite.email and request.user.email and invite.email.lower() != request.user.email.lower():
        return Response({'error': 'This invite was sent to another email'}, status=status.HTTP_400_BAD_REQUEST)

    # If user is already a member of this place, don't join again – show a clear validation message.
    if PlaceMember.objects.filter(place=invite.place, user=request.user).exists():
        return Response({'error': 'You are already a member of this place.'}, status=status.HTTP_400_BAD_REQUEST)

    PlaceMember.objects.get_or_create(place=invite.place, user=request.user, defaults={'role': PlaceMember.ROLE_MEMBER})
    invite.status = PlaceInvite.STATUS_ACCEPTED
    invite.save(update_fields=['status'])

    _log_activity(request, ActivityLog.TYPE_PLACE_JOINED, place=invite.place, description=invite.place.name)

    # Notification: welcome message for the joiner
    Notification.objects.create(
        user=request.user,
        place=invite.place,
        type=Notification.TYPE_WELCOME,
        title=f"Welcome to {invite.place.name}!",
        message="You've been added to the group",
        data={'place_id': invite.place.id},
    )
    try:
        member_count = PlaceMember.objects.filter(place=invite.place).count()
        send_transactional_email(
            request.user,
            template_name='welcome',
            subject=f"Welcome to {invite.place.name}",
            ctx={
                'place': invite.place,
                'member_count': member_count,
                'deep_link': f"{django_settings.FRONTEND_URL}/places/{invite.place.id}",
            },
        )
    except Exception:
        logger.warning('welcome email dispatch failed', exc_info=True)
    return Response(PlaceSerializer(invite.place).data)


# ----- Notifications -----

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """List notifications for the current user (newest first)."""
    qs = Notification.objects.filter(user=request.user).select_related('place').order_by('-created_at')
    unread_count = qs.filter(is_read=False).count()
    # simple pagination via ?limit=
    limit = request.query_params.get('limit')
    try:
        limit_n = int(limit) if limit is not None else 8
    except ValueError:
        limit_n = 8
    qs = qs[: max(1, min(limit_n, 50))]
    return Response({
        'unread_count': unread_count,
        'results': NotificationSerializer(qs, many=True).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notifications_mark_all_read(request):
    """Mark all notifications as read for the current user."""
    now = timezone.now()
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True, read_at=now)
    return Response({'detail': 'ok'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notifications_mark_read(request, notification_id):
    """Mark a single notification as read for the current user."""
    now = timezone.now()
    Notification.objects.filter(user=request.user, id=notification_id).update(is_read=True, read_at=now)
    return Response({'detail': 'ok'})


@api_view(['GET'])
@permission_classes([AllowAny])
def invite_by_token(request, token):
    """Get invite details by token (to show place name before joining). Public so join page can show place name."""
    try:
        invite = PlaceInvite.objects.get(token=token, status=PlaceInvite.STATUS_PENDING)
    except PlaceInvite.DoesNotExist:
        return Response({'error': 'Invalid or expired invite'}, status=status.HTTP_404_NOT_FOUND)
    if _invite_expired(invite):
        invite.status = PlaceInvite.STATUS_EXPIRED
        invite.save(update_fields=['status'])
        return Response({
            'error': 'This invite link has expired. Please ask the place owner for a new link.',
        }, status=status.HTTP_410_GONE)
    return Response({
        'place_id': invite.place_id,
        'place_name': invite.place.name,
        'member_count': invite.place.members.count(),
        'email': invite.email,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_payment(request, place_id):
    """
    Manual payment request from current user to another member in this place.
    Enforced so that the same requester cannot notify the same member more than once every 12 hours.
    """
    try:
        place = Place.objects.get(id=place_id)
    except Place.DoesNotExist:
        return Response({'error': 'Place not found'}, status=status.HTTP_404_NOT_FOUND)

    if not PlaceMember.objects.filter(place=place, user=request.user).exists():
        return Response({'error': 'Not a member of this place'}, status=status.HTTP_403_FORBIDDEN)

    target_id = request.data.get('user_id')
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    if not PlaceMember.objects.filter(place=place, user_id=target_id).exists():
        return Response({'error': 'Target user is not a member of this place'}, status=status.HTTP_400_BAD_REQUEST)

    # Compute how much this member owes me (all-time), using existing helper.
    me = request.user
    balance_with = _compute_balance_all_time(place.id, me)
    from decimal import Decimal
    raw = balance_with.get(target_id, Decimal('0'))
    # In balance_with: positive = I owe them, negative = they owe me.
    amount_owed = max(Decimal('0'), -raw)
    if amount_owed <= 0:
        return Response({'error': 'This member does not owe you anything right now.'}, status=status.HTTP_400_BAD_REQUEST)

    # Enforce 12-hour cooldown per (requester, target, place) for manual payment requests.
    window_start = timezone.now() - timedelta(hours=12)
    recent_exists = Notification.objects.filter(
        user_id=target_id,
        place=place,
        type=Notification.TYPE_PAYMENT_REQUEST,
        data__kind='manual',
        data__from_user_id=me.id,
        created_at__gte=window_start,
    ).exists()
    if recent_exists:
        return Response({'error': 'You can only send a payment request to this member once every 12 hours.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    actor_name = (getattr(getattr(me, 'profile', None), 'display_name', None) or '').strip() or me.username
    title = f'Payment request from {actor_name}'
    message = f'Requested payment for {place.name}.'
    Notification.objects.create(
        user_id=target_id,
        place=place,
        type=Notification.TYPE_PAYMENT_REQUEST,
        title=title,
        message=message,
        data={
            'kind': 'manual',
            'from_user_id': me.id,
            'place_id': place.id,
            'amount': float(amount_owed),
        },
    )
    try:
        target_user = User.objects.filter(id=target_id).select_related('profile').first()
        if target_user is not None:
            send_transactional_email(
                target_user,
                template_name='payment_request',
                subject=title,
                ctx={
                    'from_user_name': actor_name,
                    'place': place,
                    'amount': float(amount_owed),
                    'deep_link': (
                        f"{django_settings.FRONTEND_URL}/places/{place.id}"
                        "?tab=summary&settle=1"
                    ),
                },
            )
    except Exception:
        logger.warning('payment_request email dispatch failed', exc_info=True)
    return Response({'detail': 'ok'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def remove_member(request, place_id):
    """
    Owner only. Remove a member from the place. Cannot remove self; cannot remove the last owner.
    Body: { "user_id": <id> }.
    """
    try:
        place = Place.objects.get(id=place_id)
    except Place.DoesNotExist:
        return Response({'error': 'Place not found'}, status=status.HTTP_404_NOT_FOUND)

    if not PlaceMember.objects.filter(place=place, user=request.user, role=PlaceMember.ROLE_OWNER).exists():
        return Response({'error': 'Only the place owner can remove members'}, status=status.HTTP_403_FORBIDDEN)

    target_id = request.data.get('user_id')
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    if target_id == request.user.id:
        return Response({'error': 'You cannot remove yourself. Use Leave place instead.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_membership = PlaceMember.objects.get(place=place, user_id=target_id)
    except PlaceMember.DoesNotExist:
        return Response({'error': 'User is not a member of this place'}, status=status.HTTP_404_NOT_FOUND)

    if target_membership.role == PlaceMember.ROLE_OWNER:
        owner_count = place.members.filter(role=PlaceMember.ROLE_OWNER).count()
        if owner_count <= 1:
            return Response({'error': 'Cannot remove the last owner'}, status=status.HTTP_400_BAD_REQUEST)

    target_user = target_membership.user
    if _has_unsettled_balance(place.id, target_user):
        return Response(
            {'error': 'This member has unsettled balances in this place. They must settle all balances before being removed.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    target_membership.delete()
    _log_activity(
        request,
        ActivityLog.TYPE_MEMBER_REMOVED,
        place=place,
        target_user=target_user,
        description=f'Removed {_safe_display_name(target_user) or target_user.username} from the place',
    )
    return Response({'detail': 'Member removed'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def leave_place(request, place_id):
    """
    Current user leaves the place. Only non-owners can leave (owner must delete the place or remove themselves via transfer first).
    """
    try:
        place = Place.objects.get(id=place_id)
    except Place.DoesNotExist:
        return Response({'error': 'Place not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        membership = PlaceMember.objects.get(place=place, user=request.user)
    except PlaceMember.DoesNotExist:
        return Response({'error': 'You are not a member of this place'}, status=status.HTTP_403_FORBIDDEN)

    if membership.role == PlaceMember.ROLE_OWNER:
        owner_count = place.members.filter(role=PlaceMember.ROLE_OWNER).count()
        if owner_count <= 1:
            return Response(
                {'error': 'As the only owner, you cannot leave. Delete the place or remove yourself after making someone else owner.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if _has_unsettled_balance(place.id, request.user):
        return Response(
            {'error': 'You have unsettled balances in this place. Please settle all balances before leaving.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    membership.delete()
    _log_activity(request, ActivityLog.TYPE_PLACE_LEFT, place=place, description=f'Left {place.name}')
    return Response({'detail': 'You have left the place'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def settlement_create(request):
    """
    POST /api/settlements/
    Body: place_id, from_user_id (optional, defaults to current user), to_user_id, amount, date, note.
    Creates a Settlement: from_user paid to_user.
    If from_user_id omitted, current user is the payer (records "I paid someone").
    If from_user_id provided, records "X paid Y" (e.g. "Prerana paid me" when you're recording a payment you received).
    """
    me = request.user
    place_id = request.data.get('place_id')
    from_user_id = request.data.get('from_user_id')
    to_user_id = request.data.get('to_user_id')
    amount = request.data.get('amount')
    date_str = (request.data.get('date') or '').strip()
    note = (request.data.get('note') or '').strip()[:500]

    try:
        place_id = int(place_id)
    except (TypeError, ValueError):
        return Response({'error': 'place_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        to_user_id = int(to_user_id)
    except (TypeError, ValueError):
        return Response({'error': 'to_user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    if from_user_id is not None:
        try:
            from_user_id = int(from_user_id)
        except (TypeError, ValueError):
            return Response({'error': 'from_user_id must be a valid user id'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        from_user_id = me.id

    try:
        place = Place.objects.get(id=place_id)
    except Place.DoesNotExist:
        return Response({'error': 'Place not found'}, status=status.HTTP_404_NOT_FOUND)

    if not PlaceMember.objects.filter(place=place, user=me).exists():
        return Response({'error': 'Not a member of this place'}, status=status.HTTP_403_FORBIDDEN)
    if not PlaceMember.objects.filter(place=place, user_id=from_user_id).exists():
        return Response({'error': 'Payer is not a member of this place'}, status=status.HTTP_400_BAD_REQUEST)
    if not PlaceMember.objects.filter(place=place, user_id=to_user_id).exists():
        return Response({'error': 'Recipient is not a member of this place'}, status=status.HTTP_400_BAD_REQUEST)
    if from_user_id == to_user_id:
        return Response({'error': 'Payer and recipient cannot be the same'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        amount = Decimal(str(amount))
    except (TypeError, ValueError, Exception):
        return Response({'error': 'amount must be a positive number'}, status=status.HTTP_400_BAD_REQUEST)
    if amount <= 0:
        return Response({'error': 'amount must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)

    cycle_id_param = request.data.get('cycle_id')
    use_cycle_balance = False
    cycle = None
    if cycle_id_param is not None:
        try:
            cid = int(cycle_id_param)
            cycle = ExpenseCycle.objects.filter(place_id=place_id, pk=cid).first()
            if cycle:
                use_cycle_balance = True
        except (TypeError, ValueError):
            pass

    # Tolerance for decimal comparison: allow rounding up to 1 cent so exact settlements (e.g. 153.06) are accepted
    settlement_amount_tolerance = Decimal('0.01')

    if use_cycle_balance:
        payer = User.objects.filter(pk=from_user_id).first()
        if not payer:
            return Response({'error': 'Payer not found'}, status=status.HTTP_400_BAD_REQUEST)
        _, _, _, balance_with = _compute_cycle_summary(place.id, payer, cycle)
        if from_user_id == me.id:
            owed = balance_with.get(to_user_id, Decimal('0'))
            if owed <= 0:
                return Response({'error': 'You do not owe this member anything in this cycle'}, status=status.HTTP_400_BAD_REQUEST)
            if amount > owed + settlement_amount_tolerance:
                return Response(
                    {'error': f'Amount cannot exceed what you owe in this cycle ({owed:.2f})', 'max_amount': float(owed)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            owed_to_me = -balance_with.get(from_user_id, Decimal('0'))
            if owed_to_me <= 0:
                return Response({'error': 'This member does not owe you anything in this cycle'}, status=status.HTTP_400_BAD_REQUEST)
            if amount > owed_to_me + settlement_amount_tolerance:
                return Response(
                    {'error': f'Amount cannot exceed what they owe you in this cycle ({owed_to_me:.2f})', 'max_amount': float(owed_to_me)},
                    status=status.HTTP_400_BAD_REQUEST
                )
    else:
        balance_with = _compute_balance_all_time(place.id, me)
        if from_user_id == me.id:
            owed = balance_with.get(to_user_id, Decimal('0'))
            if owed <= 0:
                return Response({'error': 'You do not owe this member anything'}, status=status.HTTP_400_BAD_REQUEST)
            if amount > owed + settlement_amount_tolerance:
                return Response(
                    {'error': f'Amount cannot exceed what you owe ({owed:.2f})', 'max_amount': float(owed)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            owed_to_me = -balance_with.get(from_user_id, Decimal('0'))
            if owed_to_me <= 0:
                return Response({'error': 'This member does not owe you anything'}, status=status.HTTP_400_BAD_REQUEST)
            if amount > owed_to_me + settlement_amount_tolerance:
                return Response(
                    {'error': f'Amount cannot exceed what they owe you ({owed_to_me:.2f})', 'max_amount': float(owed_to_me)},
                    status=status.HTTP_400_BAD_REQUEST
                )

    settlement_date = timezone.now().date()
    if date_str:
        try:
            settlement_date = date.fromisoformat(date_str)
        except Exception:
            return Response({'error': 'date must be ISO format YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
    settlement = Settlement.objects.create(
        place=place,
        cycle=cycle,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        amount=amount,
        date=settlement_date,
        note=note,
    )
    _log_activity(
        request, ActivityLog.TYPE_SETTLEMENT,
        place=place, target_user=settlement.to_user, amount=settlement.amount,
        description=note or f"Settled {settlement.amount}",
    )
    return Response({
        'id': settlement.id,
        'place_id': settlement.place_id,
        'from_user_id': settlement.from_user_id,
        'to_user_id': settlement.to_user_id,
        'amount': float(settlement.amount),
        'date': settlement.date.isoformat(),
        'note': settlement.note,
        'created_at': settlement.created_at.isoformat(),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def settlement_list(request, place_id):
    """
    GET /api/places/<place_id>/settlements/
    Returns settlement history for the place (newest first).
    """
    if not PlaceMember.objects.filter(place_id=place_id, user=request.user).exists():
        return Response({'error': 'Not a member of this place'}, status=status.HTTP_403_FORBIDDEN)
    settlements = (
        Settlement.objects.filter(place_id=place_id)
        .select_related('from_user', 'to_user', 'from_user__profile', 'to_user__profile')
        .order_by('-date', '-created_at')[:100]
    )
    results = []
    for s in settlements:
        results.append({
            'id': s.id,
            'from_user_id': s.from_user_id,
            'to_user_id': s.to_user_id,
            'from_user_display_name': _safe_display_name(s.from_user) or getattr(s.from_user, 'username', ''),
            'to_user_display_name': _safe_display_name(s.to_user) or getattr(s.to_user, 'username', ''),
            'amount': float(s.amount),
            'date': s.date.isoformat(),
            'note': s.note or '',
            'created_at': s.created_at.isoformat(),
        })
    return Response({'results': results})


# ----- Cycles -----

def _get_current_cycle(place_id):
    """Return the open cycle for this place (latest open one), or None."""
    return (
        ExpenseCycle.objects.filter(place_id=place_id, status=ExpenseCycle.STATUS_OPEN)
        .order_by('-start_date')
        .first()
    )


class CycleListCreate(generics.ListCreateAPIView):
    """GET list cycles for place; POST create (start) a new cycle."""
    serializer_class = ExpenseCycleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        place_id = self.kwargs.get('place_id')
        if not place_id or not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return ExpenseCycle.objects.none()
        return ExpenseCycle.objects.filter(place_id=place_id).order_by('-start_date')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        place_id = self.kwargs.get('place_id')
        if place_id:
            try:
                context['place'] = Place.objects.get(id=place_id)
            except Place.DoesNotExist:
                pass
        return context

    def perform_create(self, serializer):
        place = self.kwargs.get('place_id') and Place.objects.filter(id=self.kwargs['place_id']).first()
        if not place or not place.members.filter(user=self.request.user).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Not a member of this place.')
        if place.created_by_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the person who created the place can start a new cycle.')
        if ExpenseCycle.objects.filter(place_id=place.id, status=ExpenseCycle.STATUS_OPEN).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'A cycle is still open. Wait for the end date (it will move to settlement), '
                'then settle up and resolve it before starting a new cycle.'
            )
        serializer.save(place=place)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cycle_resolve(request, place_id, pk):
    """
    Mark a cycle as resolved (closed). Only the place creator can resolve.
    Only allowed when cycle is PENDING_SETTLEMENT and all balances are zero.
    """
    place = Place.objects.filter(id=place_id).first()
    if not place or not PlaceMember.objects.filter(place_id=place_id, user=request.user).exists():
        return Response({'error': 'Not a member'}, status=status.HTTP_403_FORBIDDEN)
    if place.created_by_id != request.user.id:
        return Response({'error': 'Only the person who created the place can resolve a cycle.'}, status=status.HTTP_403_FORBIDDEN)
    cycle = ExpenseCycle.objects.filter(place_id=place_id, pk=pk).first()
    if not cycle:
        return Response({'error': 'Cycle not found'}, status=status.HTTP_404_NOT_FOUND)
    if cycle.status == ExpenseCycle.STATUS_RESOLVED:
        return Response({'error': 'Cycle already resolved'}, status=status.HTTP_400_BAD_REQUEST)
    if not _cycle_all_settled(place_id, cycle):
        return Response(
            {'error': 'All balances must be settled before resolving. Record settlements until everyone is at zero.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    cycle.status = ExpenseCycle.STATUS_RESOLVED
    cycle.resolved_at = timezone.now()
    cycle.save(update_fields=['status', 'resolved_at'])
    return Response(ExpenseCycleSerializer(cycle).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cycle_reopen(request, place_id, pk):
    """Reopen a resolved cycle (undo). Only the place creator; only when there is no open or pending cycle."""
    place = Place.objects.filter(id=place_id).first()
    if not place or not PlaceMember.objects.filter(place_id=place_id, user=request.user).exists():
        return Response({'error': 'Not a member'}, status=status.HTTP_403_FORBIDDEN)
    if place.created_by_id != request.user.id:
        return Response(
            {'error': 'Only the person who created the place can reopen a cycle.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    cycle = ExpenseCycle.objects.filter(place_id=place_id, pk=pk).first()
    if not cycle:
        return Response({'error': 'Cycle not found'}, status=status.HTTP_404_NOT_FOUND)
    if cycle.status != ExpenseCycle.STATUS_RESOLVED:
        return Response(
            {'error': 'Only a resolved cycle can be reopened.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if ExpenseCycle.objects.filter(place_id=place_id, status=ExpenseCycle.STATUS_OPEN).exists():
        return Response(
            {'error': 'Another cycle is still open. Wait for it to end and resolve it first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if ExpenseCycle.objects.filter(place_id=place_id, status=ExpenseCycle.STATUS_PENDING_SETTLEMENT).exists():
        return Response(
            {'error': 'A cycle is pending settlement. Resolve it before reopening a past cycle.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    cycle.status = ExpenseCycle.STATUS_OPEN
    cycle.resolved_at = None
    cycle.save(update_fields=['status', 'resolved_at'])
    return Response(ExpenseCycleSerializer(cycle).data)


# ----- Summary -----

def _sunday_of_week(d):
    """Return the Sunday of the week containing d (week = Monday–Sunday)."""
    return d + timedelta(days=(6 - d.weekday()))


def _saturday_of_week(d):
    """Return the Saturday of the week containing d (week = Sunday–Saturday)."""
    return d + timedelta(days=(5 - d.weekday()) % 7)


def _period_dates(period, from_date=None, week_start='monday'):
    """Return (start_date, end_date) for period 'weekly' or 'fortnightly'.
    week_start: 'monday' (week = Mon–Sun) or 'sunday' (week = Sun–Sat).
    from_date is period end; default is end of current week."""
    today = timezone.now().date()
    if from_date is not None:
        end = from_date
    else:
        end = _saturday_of_week(today) if week_start == 'sunday' else _sunday_of_week(today)
    if period == 'weekly':
        start = end - timedelta(days=6)
    elif period == 'fortnightly':
        start = end - timedelta(days=13)
    else:
        start = end - timedelta(days=6)
    return start, end


def _expenses_since_joined(place_id, user):
    """Base expense queryset for place, filtered by user's join date so they only see expenses after they joined."""
    try:
        membership = PlaceMember.objects.get(place_id=place_id, user=user)
        return Expense.objects.filter(place_id=place_id, created_at__gte=membership.joined_at)
    except PlaceMember.DoesNotExist:
        return Expense.objects.none()


def _compute_period_summary(place_id, me, start_date, end_date):
    """Returns total_expense, my_expense, total_i_paid, balance_with (dict user_id -> Decimal)."""
    expenses = _expenses_since_joined(place_id, me).filter(
        date__gte=start_date,
        date__lte=end_date,
    ).prefetch_related('splits__user')
    total_expense, my_expense, total_i_paid, balance_with = _compute_balance_from_expenses(expenses, me)
    settlements = Settlement.objects.filter(
        place_id=place_id,
        date__gte=start_date,
        date__lte=end_date,
    ).select_related('from_user', 'to_user')
    _apply_settlements_to_balance(balance_with, settlements, me)
    return total_expense, my_expense, total_i_paid, balance_with

def _compute_cycle_summary(place_id, me, cycle):
    """
    Returns (total_expense, my_expense, total_i_paid, balance_with) for a cycle.

    Results are cached in Redis for SUMMARY_TTL seconds (default 60 s) per
    (place_id, cycle_id, user_id).  Any write to an Expense or Settlement that
    belongs to this cycle must call:

        invalidate_cycle_summary(place_id, cycle.id)

    so the next read recomputes from the DB.
    """
    cached = get_cached_cycle_summary(place_id, cycle.id, me.id)
    if cached is not None:
        return cached

    result = _compute_cycle_summary_uncached(place_id, me, cycle)
    set_cached_cycle_summary(place_id, cycle.id, me.id, result)
    return result

def _compute_cycle_summary_uncached(place_id, me, cycle):
    """
    The original computation — fetch expenses + settlements and calculate
    balances in Python.  Called only on a cache miss.
    """
    expenses = (
        _expenses_since_joined(place_id, me)
        .filter(cycle=cycle)
        .prefetch_related("splits__user")
    )
    total_expense, my_expense, total_i_paid, balance_with = (
        _compute_balance_from_expenses(expenses, me)
    )
    settlements = (
        Settlement.objects.filter(place_id=place_id)
        .filter(
            Q(cycle_id=cycle.id)
            | Q(
                cycle__isnull=True,
                date__gte=cycle.start_date,
                date__lte=cycle.end_date,
            )
        )
        .select_related("from_user", "to_user")
    )
    _apply_settlements_to_balance(balance_with, settlements, me)
    return total_expense, my_expense, total_i_paid, balance_with


def _compute_balance_from_expenses(expenses, me):
    total_expense = sum(e.amount for e in expenses)
    my_expense = Decimal('0')
    total_i_paid = Decimal('0')
    balance_with = {}
    for exp in expenses:
        splits = list(exp.splits.all())
        n = len(splits) or 1
        share = exp.amount / n
        if exp.paid_by_id == me.id:
            total_i_paid += exp.amount
        for s in splits:
            if s.user_id == me.id:
                my_expense += share
            if exp.paid_by_id == s.user_id:
                continue
            if exp.paid_by_id == me.id:
                balance_with[s.user_id] = balance_with.get(s.user_id, Decimal('0')) - share
            elif s.user_id == me.id:
                balance_with[exp.paid_by_id] = balance_with.get(exp.paid_by_id, Decimal('0')) + share
    return total_expense, my_expense, total_i_paid, balance_with


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def place_summary(request, place_id):
    """
    GET /api/places/<id>/summary/?period=weekly|fortnightly&from=YYYY-MM-DD
    GET /api/places/<id>/summary/?cycle_id=<id>  (cycle-based; returns cycle stats)
    Returns: period/cycle stats, previous period total for comparison, by_member_balance list.
    """
    if not PlaceMember.objects.filter(place_id=place_id, user=request.user).exists():
        return Response({'error': 'Not a member'}, status=status.HTTP_403_FORBIDDEN)
    me = request.user
    cycle_id_param = request.query_params.get('cycle_id')

    if cycle_id_param:
        try:
            cid = int(cycle_id_param)
            cycle = ExpenseCycle.objects.filter(place_id=place_id, pk=cid).first()
        except ValueError:
            cycle = None
        if not cycle:
            return Response({'error': 'Cycle not found'}, status=status.HTTP_404_NOT_FOUND)
        start_date, end_date = cycle.start_date, cycle.end_date
        period = 'cycle'
    else:
        cycle = None
        period = request.query_params.get('period', 'weekly')
        week_start = request.query_params.get('week_start', 'monday')
        if week_start not in ('monday', 'sunday'):
            week_start = 'monday'
        from_param = request.query_params.get('from')
        from_date = None
        if from_param:
            try:
                from_date = date.fromisoformat(from_param)
            except ValueError:
                pass
        start_date, end_date = _period_dates(period, from_date, week_start)

    try:
        if cycle:
            total_expense, my_expense, total_i_paid, balance_with = _compute_cycle_summary(place_id, me, cycle)
            prev_total = Decimal('0')
            prev_cycle = ExpenseCycle.objects.filter(place_id=place_id, start_date__lt=cycle.start_date).order_by('-start_date').first()
            if prev_cycle:
                prev_total = sum(e.amount for e in _expenses_since_joined(place_id, me).filter(cycle=prev_cycle))
        else:
            total_expense, my_expense, total_i_paid, balance_with = _compute_period_summary(
                place_id, me, start_date, end_date
            )
            prev_end = start_date - timedelta(days=1)
            week_start = request.query_params.get('week_start', 'monday') or 'monday'
            prev_start, _ = _period_dates(period, prev_end, week_start)
            prev_total, prev_my, _, _ = _compute_period_summary(place_id, me, prev_start, prev_end)

        others_expense = total_expense - my_expense
        total_i_owe = sum(v for v in balance_with.values() if v > 0)
        total_owed_to_me = sum(-v for v in balance_with.values() if v < 0)

        spending_change_pct = None
        if not cycle:
            if prev_total and prev_total > 0:
                spending_change_pct = round(((float(total_expense) - float(prev_total)) / float(prev_total)) * 100)
            elif prev_total == 0 and total_expense == 0:
                spending_change_pct = 0
        else:
            if prev_cycle and prev_total and prev_total > 0:
                spending_change_pct = round(((float(total_expense) - float(prev_total)) / float(prev_total)) * 100)
            elif prev_cycle and prev_total == 0 and total_expense == 0:
                spending_change_pct = 0

        user_ids = list(balance_with.keys())
        user_map = {}
        if user_ids:
            for u in User.objects.filter(id__in=user_ids).select_related('profile'):
                user_map[u.id] = {
                    'username': u.username,
                    'display_name': _safe_display_name(u) or u.username,
                    'email': getattr(u, 'email', '') or '',
                    'profile_photo': _profile_photo_url(request, u),
                }
        balance_all_time = _compute_balance_all_time(place_id, me)
        by_member_balance_list = [
            {
                'user_id': uid,
                'username': (user_map.get(uid) or {}).get('username') or f'User {uid}',
                'display_name': (user_map.get(uid) or {}).get('display_name') or user_map.get(uid, {}).get('username') or f'User {uid}',
                'email': (user_map.get(uid) or {}).get('email') or '',
                'profile_photo': (user_map.get(uid) or {}).get('profile_photo'),
                'balance': float(balance_with[uid]),
                'all_time_balance': float(balance_all_time.get(uid, Decimal('0'))),
            }
            for uid in user_ids
        ]
        by_member_balance_list.sort(key=lambda x: (x['balance'] >= 0, -abs(x['balance'])))

        payload = {
            'period': period,
            'from': start_date.isoformat(),
            'to': end_date.isoformat(),
            'total_expense': float(total_expense),
            'my_expense': float(my_expense),
            'others_expense': float(others_expense),
            'total_i_paid': float(total_i_paid),
            'total_i_owe': float(total_i_owe),
            'total_owed_to_me': float(total_owed_to_me),
            'by_member_balance': {str(k): float(v) for k, v in balance_with.items()},
            'by_member_balance_list': by_member_balance_list,
            'previous_total_expense': float(prev_total),
            'spending_change_percent': spending_change_pct,
        }
        if cycle:
            payload['cycle'] = ExpenseCycleSerializer(cycle).data
            payload['cycle_id'] = cycle.id
            payload['all_settled'] = _cycle_all_settled(place_id, cycle)
        return Response(payload)
    except Exception as exc:
        return Response({
            'period': period if not cycle else 'cycle',
            'from': start_date.isoformat(),
            'to': end_date.isoformat(),
            'total_expense': 0.0,
            'my_expense': 0.0,
            'others_expense': 0.0,
            'total_i_paid': 0.0,
            'total_i_owe': 0.0,
            'total_owed_to_me': 0.0,
            'by_member_balance': {},
            'by_member_balance_list': [],
            'previous_total_expense': 0.0,
            'spending_change_percent': None,
            'error': str(exc),
        }, status=status.HTTP_200_OK)


def _apply_settlements_to_balance(balance_with, settlements, me):
    """
    Apply settlements to balance_with in place.
    balance_with: user_id -> Decimal (positive = I owe them, negative = they owe me).
    If I paid them (from_user=me, to_user=other): I owe them less -> balance_with[other] -= amount.
    If they paid me (from_user=other, to_user=me): they owe me less -> balance_with[other] += amount.
    """
    for s in settlements:
        if s.from_user_id == me.id and s.to_user_id != me.id:
            balance_with[s.to_user_id] = balance_with.get(s.to_user_id, Decimal('0')) - s.amount
        elif s.to_user_id == me.id and s.from_user_id != me.id:
            balance_with[s.from_user_id] = balance_with.get(s.from_user_id, Decimal('0')) + s.amount


def _compute_balance_all_time(place_id, me):
    """
    Returns balance_with dict (user_id -> Decimal).
    Positive = I owe them.  Negative = they owe me.

    BEFORE: fetched every Expense row into Python then looped over splits.
    AFTER:  two DB queries — one annotated split query that does the arithmetic
            in PostgreSQL, one settlements query.  The Python loop is replaced
            by a simple accumulation of pre-computed per-row values.
    """
    # --- Step 1: DB-side share computation -----------------------------------
    # Count splits per expense in a subquery so PostgreSQL divides correctly.
    from django.db.models import IntegerField
    from django.db.models.functions import Cast

    split_count_sq = (
        ExpenseSplit.objects.filter(expense=OuterRef("expense"))
        .values("expense")
        .annotate(n=Count("id"))
        .values("n")
    )

    rows = (
        ExpenseSplit.objects.filter(expense__place_id=place_id)
        .annotate(
            split_count=Subquery(split_count_sq, output_field=IntegerField()),
        )
        .select_related("expense", "user")
        .values(
            "user_id",
            "expense__paid_by_id",
            "expense__amount",
            "expense__id",
            "split_count",
        )
    )

    # --- Step 2: accumulate ---------------------------------------------------
    # We only care about rows where one side is `me`.
    balance_with = {}
    seen_expenses = set()

    for row in rows:
        n = row["split_count"] or 1
        share = row["expense__amount"] / n
        paid_by = row["expense__paid_by_id"]
        split_user = row["user_id"]

        # Skip the payer's own split — paying yourself is not a debt.
        if paid_by == split_user:
            continue

        if paid_by == me.id:
            # I paid; split_user owes me → their balance goes negative (they owe me).
            balance_with[split_user] = (
                balance_with.get(split_user, Decimal("0")) - share
            )
        elif split_user == me.id:
            # They paid; I owe them → their balance goes positive (I owe them).
            balance_with[paid_by] = (
                balance_with.get(paid_by, Decimal("0")) + share
            )

    # --- Step 3: apply all-time settlements -----------------------------------
    settlements = Settlement.objects.filter(place_id=place_id).select_related(
        "from_user", "to_user"
    )
    _apply_settlements_to_balance(balance_with, settlements, me)
    return balance_with


def _has_unsettled_balance(place_id, user):
    """True if the user has any non-zero balance (owes or is owed) in this place."""
    balance_with = _compute_balance_all_time(place_id, user)
    return any(v != 0 for v in balance_with.values())


def _cycle_all_settled(place_id, cycle):
    """
    True if every member's net balance for this cycle is zero (±0.01 tolerance).

    BEFORE: called _compute_cycle_summary(member) N times → N full DB round-trips.
    AFTER:  fetches expenses + settlements ONCE, then checks each member in a
            single Python pass.  For a 5-member place this is ~5× fewer queries.
    """
    tolerance = Decimal("0.01")

    members = list(
        PlaceMember.objects.filter(place_id=place_id).select_related("user")
    )
    if not members:
        return True

    # Fetch the shared data once.
    expenses = (
        Expense.objects.filter(place_id=place_id, cycle=cycle)
        .prefetch_related("splits")
        .select_related("paid_by")
    )
    settlements = (
        Settlement.objects.filter(place_id=place_id)
        .filter(
            Q(cycle_id=cycle.id)
            | Q(
                cycle__isnull=True,
                date__gte=cycle.start_date,
                date__lte=cycle.end_date,
            )
        )
        .select_related("from_user", "to_user")
    )

    # Materialise once — both loops below iterate in Python.
    expense_list = list(expenses)
    settlement_list = list(settlements)

    for member in members:
        me = member.user
        try:
            # Filter to expenses this member can see (joined_at guard).
            membership = member  # already fetched above
            visible_expenses = [
                e for e in expense_list
                if e.created_at >= membership.joined_at
            ]
            _, _, _, balance_with = _compute_balance_from_expenses(
                visible_expenses, me
            )
            _apply_settlements_to_balance(balance_with, settlement_list, me)
            net = sum(balance_with.values(), Decimal("0"))
            if abs(net) > tolerance:
                return False
        except Exception:
            return False

    return True


def _send_cycle_ended_notifications(place, cycle):
    """
    After a cycle is resolved, create a notification for each member with their
    settlement summary. Tapping opens place Summary tab to settle up.
    """
    period_label = f"{cycle.start_date.strftime('%b %d')} – {cycle.end_date.strftime('%b %d')}"
    title = f"Cycle ended: {place.name} ({period_label})"
    deep_link = (
        f"{getattr(django_settings, 'FRONTEND_URL', '').rstrip('/')}"
        f"/places/{place.id}?tab=summary&settle=1"
    )
    for member in place.members.select_related('user', 'user__profile'):
        user = member.user
        try:
            _, _, _, balance_with = _compute_cycle_summary(place.id, user, cycle)
        except Exception:
            balance_with = {}
        parts = []
        balance_lines = []
        for other_uid, bal in balance_with.items():
            if bal == 0:
                continue
            other = User.objects.filter(id=other_uid).select_related('profile').first()
            other_name = _safe_display_name(other) or (other.username if other else f"User {other_uid}")
            if bal > 0:
                parts.append(f"You owe ${bal:.2f} to {other_name}")
                balance_lines.append(f"You owe ${bal:.2f} to {other_name}")
            else:
                parts.append(f"{other_name} owes you ${(-bal):.2f}")
                balance_lines.append(f"{other_name} owes you ${(-bal):.2f}")
        message = " Tap to settle up." if parts else " You're all settled for this cycle."
        if parts:
            message = " ".join(parts) + message
        else:
            message = f"Cycle {period_label} closed." + message
        Notification.objects.create(
            user=user,
            place=place,
            type=Notification.TYPE_CYCLE_ENDED,
            title=title,
            message=message,
            data={
                'place_id': place.id,
                'cycle_id': cycle.id,
                'open_settlement': True,
            },
        )
        try:
            send_transactional_email(
                user,
                template_name='cycle_ended',
                subject=title,
                ctx={
                    'place': place,
                    'cycle': cycle,
                    'period_label': period_label,
                    'balance_lines': balance_lines,
                    'deep_link': deep_link,
                },
            )
        except Exception:
            logger.warning('cycle_ended email dispatch failed', exc_info=True)


def _activity_item_from_log(request, log):
    """Build activity feed item dict from an ActivityLog entry."""
    u = log.user
    display_name = _safe_display_name(u) or getattr(u, 'username', '') or ''
    item = {
        'type': log.type,
        'id': log.id,
        'created_at': log.created_at.isoformat(),
        'description': log.description or '',
        'place_id': log.place_id,
        'place_name': log.place.name if log.place else None,
        'user_id': u.id,
        'user_display_name': display_name or u.username,
        'user_profile_photo': _profile_photo_url(request, u),
    }
    if log.amount is not None:
        item['amount'] = float(log.amount)
    if getattr(log, 'expense_id', None):
        item['expense_id'] = log.expense_id
    if log.target_user_id:
        item['target_user_id'] = log.target_user_id
        item['target_user_display_name'] = _safe_display_name(log.target_user) or getattr(log.target_user, 'username', '') or ''
    return item


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_list(request):
    """
    GET /api/activity/?limit=50
    Returns activity for the current user: expenses, places, joins, settlements, profile/password changes.
    """
    me = request.user
    my_place_ids = list(
        PlaceMember.objects.filter(user=me).values_list('place_id', flat=True)
    )

    try:
        limit = min(int(request.query_params.get('limit', 50)), 200)
    except ValueError:
        limit = 50

    activity = []

    # Legacy: expenses and places (for backward compat; new ones also in ActivityLog)
    if my_place_ids:
        expenses_qs = (
            Expense.objects.filter(place_id__in=my_place_ids)
            .select_related('place', 'paid_by', 'added_by', 'added_by__profile', 'paid_by__profile')
            .order_by('-created_at')[: limit + 50]
        )
        for e in expenses_qs:
            added_by = e.added_by or e.paid_by
            display_name = _safe_display_name(added_by) or getattr(added_by, 'username', '') or ''
            activity.append({
                'type': 'expense_added',
                'id': e.id,
                'created_at': e.created_at.isoformat(),
                'description': e.description,
                'amount': float(e.amount),
                'place_id': e.place_id,
                'place_name': e.place.name,
                'user_id': added_by.id,
                'user_display_name': display_name or added_by.username,
                'user_profile_photo': _profile_photo_url(request, added_by),
            })
        places_created = Place.objects.filter(
            created_by=me, id__in=my_place_ids
        ).order_by('-created_at')[:limit]
        for p in places_created:
            activity.append({
                'type': 'place_created',
                'id': p.id,
                'created_at': p.created_at.isoformat(),
                'place_id': p.id,
                'place_name': p.name,
                'user_id': me.id,
                'user_display_name': _safe_display_name(me) or me.username,
                'user_profile_photo': _profile_photo_url(request, me),
            })

    # ActivityLog: expense_edited, expense_deleted, place_joined, settlement, profile_updated, password_changed (expense_added/place_created come from legacy above)
    log_qs = (
        ActivityLog.objects.filter(
            (Q(place_id__in=my_place_ids) | Q(place__isnull=True, user=me))
            & ~Q(type__in=[ActivityLog.TYPE_EXPENSE_ADDED, ActivityLog.TYPE_PLACE_CREATED])
        )
        .select_related('place', 'user', 'user__profile', 'target_user', 'target_user__profile', 'expense')
        .order_by('-created_at')[: limit + 100]
    )
    for log in log_qs:
        activity.append(_activity_item_from_log(request, log))

    activity.sort(key=lambda x: x['created_at'], reverse=True)
    results = activity[:limit]
    return Response({'results': results})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """
    GET /api/dashboard/
    Returns: this_month stats, balance_summary (all-time), unsettled_balances_count,
             recent_activity, places (with member_count, expense_count).
    """
    me = request.user
    today = timezone.now().date()

    # Calendar month range
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = today.replace(month=12, day=31)
    else:
        month_end = (month_start.replace(month=today.month + 1) - timedelta(days=1))

    my_place_ids = list(
        PlaceMember.objects.filter(user=me).values_list('place_id', flat=True)
    )
    # Only count manual payment requests (from the "Request payment" form), not expense-added etc.
    payment_requests_pending = Notification.objects.filter(
        user=me,
        type=Notification.TYPE_PAYMENT_REQUEST,
        data__kind='manual',
        is_read=False,
    ).count()
    if not my_place_ids:
        return Response({
            'this_month': {
                'total_expense': 0, 'owed_to_me': 0, 'i_owe': 0, 'net': 0,
                'net_change_from_last_month': 0,
                'from': month_start.isoformat(), 'to': month_end.isoformat(),
            },
            'balance_summary': {'you_owe': 0, 'youre_owed': 0, 'net': 0},
            'unsettled_balances_count': 0,
            'payment_requests_pending': 0,
            'last_activity_at': None,
            'recent_activity': [],
            'places': [],
        })

    # This month aggregates
    month_total = Decimal('0')
    month_owed_to_me = Decimal('0')
    month_i_owe = Decimal('0')
    for pid in my_place_ids:
        tot, _, _, bal = _compute_period_summary(pid, me, month_start, month_end)
        month_total += tot
        month_owed_to_me += sum(-v for v in bal.values() if v < 0)
        month_i_owe += sum(v for v in bal.values() if v > 0)
    month_net = month_owed_to_me - month_i_owe

    # Last month net (for trend indicator)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    last_month_owed = Decimal('0')
    last_month_i_owe = Decimal('0')
    for pid in my_place_ids:
        _, _, _, bal = _compute_period_summary(pid, me, last_month_start, last_month_end)
        last_month_owed += sum(-v for v in bal.values() if v < 0)
        last_month_i_owe += sum(v for v in bal.values() if v > 0)
    last_month_net = last_month_owed - last_month_i_owe
    net_change_from_last_month = float(month_net - last_month_net)

    # All-time balance summary (for Balance Summary card)
    all_you_owe = Decimal('0')
    all_youre_owed = Decimal('0')
    unsettled_count = 0
    for pid in my_place_ids:
        bal = _compute_balance_all_time(pid, me)
        all_you_owe += sum(v for v in bal.values() if v > 0)
        all_youre_owed += sum(-v for v in bal.values() if v < 0)
        unsettled_count += sum(1 for v in bal.values() if v != 0)

    all_net = all_youre_owed - all_you_owe

    # Recent activity: expenses in my places + places I created (fetch more so dashboard can show more)
    expenses_qs = (
        Expense.objects.filter(place_id__in=my_place_ids)
        .select_related('place', 'paid_by', 'added_by', 'added_by__profile', 'paid_by__profile')
        .order_by('-created_at')[:50]
    )
    activity = []
    for e in expenses_qs:
        added_by = e.added_by or e.paid_by
        display_name = _safe_display_name(added_by) or getattr(added_by, 'username', '') or ''
        activity.append({
            'type': 'expense_added',
            'id': e.id,
            'created_at': e.created_at.isoformat(),
            'description': e.description,
            'amount': float(e.amount),
            'place_id': e.place_id,
            'place_name': e.place.name,
            'user_id': added_by.id,
            'user_display_name': display_name or added_by.username,
            'user_profile_photo': _profile_photo_url(request, added_by),
        })
    places_created = Place.objects.filter(
        created_by=me, id__in=my_place_ids
    ).order_by('-created_at')[:15]
    for p in places_created:
        activity.append({
            'type': 'place_created',
            'id': p.id,
            'created_at': p.created_at.isoformat(),
            'place_id': p.id,
            'place_name': p.name,
            'user_id': me.id,
            'user_display_name': _safe_display_name(me) or me.username,
            'user_profile_photo': _profile_photo_url(request, me),
        })
    activity.sort(key=lambda x: x['created_at'], reverse=True)
    recent_activity = activity[:25]

    last_activity_at = recent_activity[0]['created_at'] if recent_activity else None

    # Places with member_count and expense count
    place_list = list(
        Place.objects.filter(id__in=my_place_ids)
        .prefetch_related('members__user', 'members__user__profile')
        .order_by('-created_at')
    )
    places_payload = []
    for p in place_list:
        member_count = p.members.count()
        expense_count = p.expenses.count()
        bal = _compute_balance_all_time(p.id, me)
        place_unsettled = sum(1 for v in bal.values() if v != 0)
        members_preview = [
            {
                'id': m.user_id,
                'username': getattr(m.user, 'username', ''),
                'display_name': _safe_display_name(m.user) or getattr(m.user, 'username', ''),
                'profile_photo': _profile_photo_url(request, m.user),
            }
            for m in p.members.select_related('user', 'user__profile').all()[:5]
        ]
        places_payload.append({
            'id': p.id,
            'name': p.name,
            'member_count': member_count,
            'expense_count': expense_count,
            'unsettled_balances_count': place_unsettled,
            'members': members_preview,
        })

    return Response({
        'this_month': {
            'total_expense': float(month_total),
            'owed_to_me': float(month_owed_to_me),
            'i_owe': float(month_i_owe),
            'net': float(month_net),
            'net_change_from_last_month': net_change_from_last_month,
            'from': month_start.isoformat(),
            'to': month_end.isoformat(),
        },
        'balance_summary': {
            'you_owe': float(all_you_owe),
            'youre_owed': float(all_youre_owed),
            'net': float(all_net),
        },
        'unsettled_balances_count': unsettled_count,
        'payment_requests_pending': payment_requests_pending,
        'last_activity_at': last_activity_at,
        'recent_activity': recent_activity,
        'places': places_payload,
    })


# ----- Email unsubscribe + Vercel Cron (public endpoints) -----

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def email_unsubscribe(request, token):
    """
    One-click unsubscribe target for the link embedded in transactional emails.

    The token is signed with TimestampSigner (see ``api.email_utils``) so no
    user session is required — possessing the link IS the auth, scoped to a
    single user id with a 60-day max age.

    Supports POST so RFC 8058 one-click unsubscribe ("List-Unsubscribe-Post"
    header) works in Gmail and Outlook without showing a confirmation page.
    """
    user_id = read_unsubscribe_token(token)
    frontend_url = (getattr(django_settings, 'FRONTEND_URL', '') or '').rstrip('/')
    if not user_id:
        return render(
            request,
            'emails/unsubscribed.html',
            {'ok': False, 'frontend_url': frontend_url},
            status=400,
        )

    user = User.objects.filter(id=user_id).select_related('profile').first()
    if user is None:
        return render(
            request,
            'emails/unsubscribed.html',
            {'ok': False, 'frontend_url': frontend_url},
            status=404,
        )

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if profile.email_notifications_enabled:
        profile.email_notifications_enabled = False
        profile.save(update_fields=['email_notifications_enabled'])

    return render(
        request,
        'emails/unsubscribed.html',
        {'ok': True, 'frontend_url': frontend_url},
    )


def _cron_secret_ok(request) -> bool:
    """
    Validate the shared secret for cron endpoints.

    Vercel Cron does not let us set a custom Authorization header, so we accept
    the secret either in the ``Authorization: Bearer <s>`` header (handy for
    curl / GitHub Actions / local testing) or in the ``?secret=<s>`` query
    string (what we configure in ``vercel.json``).
    """
    expected = (getattr(django_settings, 'CRON_SECRET', '') or '').strip()
    if not expected:
        return False
    auth = request.headers.get('Authorization', '')
    if auth == f'Bearer {expected}':
        return True
    return request.query_params.get('secret') == expected


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def cron_transition_cycles(request):
    """
    Daily Vercel Cron entry point: transition past-due OPEN cycles to
    PENDING_SETTLEMENT and fire cycle-ended notifications + emails.

    Replaces the Celery Beat schedule in production (Vercel cannot run a
    persistent worker). Local dev can either hit this endpoint manually or
    keep using ``celery -A equilo beat``; both call the same body.
    """
    expected = (getattr(django_settings, 'CRON_SECRET', '') or '').strip()
    if not expected:
        return Response(
            {'error': 'CRON_SECRET is not configured on the server'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not _cron_secret_ok(request):
        return Response({'error': 'unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    from .tasks import transition_pending_cycles
    result = transition_pending_cycles()
    return Response(result)
