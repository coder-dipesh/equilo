import hashlib
import io
import secrets
from datetime import date, timedelta, timezone as dt_utc
from decimal import Decimal

from django.conf import settings as django_settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.contrib.auth import get_user_model
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.views import TokenObtainPairView as BaseTokenObtainPairView

from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite, UserProfile, Notification, ExpenseCycle, UserSession, Settlement, ActivityLog

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

User = get_user_model()


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


def _device_label_from_request(request):
    """Parse User-Agent to a short device label, e.g. 'Chrome on Mac', 'iPhone'."""
    ua = (request.META.get('HTTP_USER_AGENT') or '')[:500]
    ua_lower = ua.lower()
    if not ua:
        return 'Unknown device'
    # Mobile
    if 'mobile' in ua_lower or 'android' in ua_lower:
        if 'iphone' in ua_lower or 'ipad' in ua_lower:
            return 'iPhone' if 'iphone' in ua_lower else 'iPad'
        return 'Android'
    # Desktop
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


def _create_user_session(refresh_token_str, request):
    """Create or update UserSession from a refresh token. Returns True if created/updated, False otherwise."""
    from rest_framework_simplejwt.tokens import RefreshToken
    try:
        token = RefreshToken(refresh_token_str)
        jti = str(token.get('jti', '') or '')
        if not jti:
            jti = hashlib.sha256(refresh_token_str.encode()).hexdigest()[:64]
        exp = token.get('exp')
        user_id = token.get('user_id') or token.get('sub')
        if not exp or not user_id:
            return False
        user = User.objects.filter(pk=str(user_id)).first()
        if not user:
            return False
        expires_at = timezone.datetime.fromtimestamp(exp, tz=dt_utc.utc)
        device_label = _device_label_from_request(request)
        user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:1000]
        UserSession.objects.update_or_create(
            jti=jti,
            defaults={
                'user': user,
                'refresh_token': refresh_token_str,
                'device_label': device_label,
                'user_agent': user_agent,
                'expires_at': expires_at,
            }
        )
        return True
    except Exception as e:
        # Don't break login/register if session tracking fails
        if django_settings.DEBUG:
            from traceback import format_exc
            _create_user_session._last_error = format_exc()
        return False


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

    refresh_str = str(refresh)
    _create_user_session(refresh_str, request)
    return Response({
        'user': UserSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh': refresh_str,
    }, status=status.HTTP_201_CREATED)


class TokenObtainPairView(BaseTokenObtainPairView):
    """Custom token obtain that creates UserSession for Active Sessions tracking."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and response.data.get('refresh'):
            try:
                _create_user_session(response.data['refresh'], request)
            except Exception:
                # Never let session tracking break login
                pass
        return response


def _jti_from_refresh_token(refresh_str):
    """Extract jti from refresh token, or a stable hash if jti missing. Returns None if invalid."""
    from rest_framework_simplejwt.tokens import RefreshToken
    try:
        token = RefreshToken(refresh_str)
        jti = str(token.get('jti', '') or '')
        if jti:
            return jti
        return hashlib.sha256(refresh_str.encode()).hexdigest()[:64]
    except Exception:
        return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sessions_register(request):
    """
    Register the current device's session. Body: { "refresh": "..." }.
    Call this when sessions list is empty to retroactively register the current device.
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh_str = (request.data.get('refresh') or '').strip()
    if not refresh_str:
        return Response({'refresh': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
    try:
        token = RefreshToken(refresh_str)
        uid = token.get('user_id') or token.get('sub')
        if uid is None or str(uid) != str(request.user.id):
            return Response({'detail': 'Refresh token does not belong to current user.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
    ok = _create_user_session(refresh_str, request)
    if not ok:
        detail = 'Could not save session. Run: python manage.py migrate'
        if django_settings.DEBUG and getattr(_create_user_session, '_last_error', None):
            detail = _create_user_session._last_error
        return Response(
            {'detail': detail},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    return Response({'detail': 'Session registered.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sessions_list(request):
    """
    List active sessions for the current user.
    Query param ?current_jti=xxx marks that session as is_current (client sends jti from decoded refresh token).
    """
    user = request.user
    current_jti = request.query_params.get('current_jti', '').strip() or None
    sessions = UserSession.objects.filter(user=user, expires_at__gt=timezone.now()).order_by('-created_at')
    serializer = UserSessionSerializer(
        sessions,
        many=True,
        context={'current_jti': current_jti}
    )
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def session_revoke(request, jti):
    """Revoke (logout) a specific session by jti."""
    user = request.user
    session = UserSession.objects.filter(user=user, jti=jti).first()
    if not session:
        return Response({'detail': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken(session.refresh_token)
        token.blacklist()
    except Exception:
        pass
    session.delete()
    return Response({'detail': 'Session revoked.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sessions_revoke_all(request):
    """
    Revoke all other sessions (log out from all devices except this one).
    Body: { "refresh": "..." } - the current device's refresh token. Sessions matching this jti are kept.
    """
    user = request.user
    refresh_str = (request.data.get('refresh') or '').strip()
    if not refresh_str:
        return Response({'refresh': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
    keep_jti = _jti_from_refresh_token(refresh_str)
    sessions = UserSession.objects.filter(user=user, expires_at__gt=timezone.now())
    for session in sessions:
        if session.jti == keep_jti:
            continue
        try:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(session.refresh_token)
            token.blacklist()
        except Exception:
            pass
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
        if not place_id or not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return Expense.objects.none()
        qs = (
            Expense.objects.filter(place_id=place_id)
            .select_related('paid_by', 'added_by', 'category', 'place', 'cycle')
            .prefetch_related('splits__user')
            .order_by('-created_at')
        )
        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            try:
                cid = int(cycle_id)
                if PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
                    if ExpenseCycle.objects.filter(place_id=place_id, pk=cid).exists():
                        return qs.filter(cycle_id=cid)
            except ValueError:
                pass
        current = _get_current_cycle(place_id)
        if current:
            return qs.filter(cycle_id=current.id)
        return qs

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
    return Response({'detail': 'ok'})


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

    balance_with = _compute_balance_all_time(place.id, me)
    if from_user_id == me.id:
        owed = balance_with.get(to_user_id, Decimal('0'))
        if owed <= 0:
            return Response({'error': 'You do not owe this member anything'}, status=status.HTTP_400_BAD_REQUEST)
        if amount > owed:
            return Response(
                {'error': f'Amount cannot exceed what you owe ({owed:.2f})', 'max_amount': float(owed)},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        owed_to_me = -balance_with.get(from_user_id, Decimal('0'))
        if owed_to_me <= 0:
            return Response({'error': 'This member does not owe you anything'}, status=status.HTTP_400_BAD_REQUEST)
        if amount > owed_to_me:
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
        # Ensure only one open cycle: resolve any existing open cycles before creating the new one
        ExpenseCycle.objects.filter(place_id=place.id, status=ExpenseCycle.STATUS_OPEN).update(
            status=ExpenseCycle.STATUS_RESOLVED
        )
        serializer.save(place=place)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cycle_resolve(request, place_id, pk):
    """Mark a cycle as resolved (closed). Only the place creator can resolve."""
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
    cycle.status = ExpenseCycle.STATUS_RESOLVED
    cycle.save(update_fields=['status'])
    return Response(ExpenseCycleSerializer(cycle).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cycle_reopen(request, place_id, pk):
    """Reopen a resolved cycle (undo). Only the place creator; only when there is no other open cycle."""
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
    # Keep single open cycle: resolve any current open cycle, then reopen the selected one
    ExpenseCycle.objects.filter(place_id=place_id, status=ExpenseCycle.STATUS_OPEN).update(
        status=ExpenseCycle.STATUS_RESOLVED
    )
    cycle.status = ExpenseCycle.STATUS_OPEN
    cycle.save(update_fields=['status'])
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


def _compute_period_summary(place_id, me, start_date, end_date):
    """Returns total_expense, my_expense, total_i_paid, balance_with (dict user_id -> Decimal)."""
    expenses = Expense.objects.filter(
        place_id=place_id,
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
    """Returns total_expense, my_expense, total_i_paid, balance_with for expenses in this cycle."""
    expenses = Expense.objects.filter(place_id=place_id, cycle=cycle).prefetch_related('splits__user')
    total_expense, my_expense, total_i_paid, balance_with = _compute_balance_from_expenses(expenses, me)
    settlements = Settlement.objects.filter(
        place_id=place_id,
        date__gte=cycle.start_date,
        date__lte=cycle.end_date,
    ).select_related('from_user', 'to_user')
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
                prev_total = sum(e.amount for e in Expense.objects.filter(place_id=place_id, cycle=prev_cycle))
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
                    'profile_photo': _profile_photo_url(request, u),
                }
        by_member_balance_list = [
            {
                'user_id': uid,
                'username': (user_map.get(uid) or {}).get('username') or f'User {uid}',
                'display_name': (user_map.get(uid) or {}).get('display_name') or user_map.get(uid, {}).get('username') or f'User {uid}',
                'profile_photo': (user_map.get(uid) or {}).get('profile_photo'),
                'balance': float(balance_with[uid]),
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
    """Returns balance_with dict (user_id -> Decimal). Positive = I owe them, negative = they owe me."""
    expenses = Expense.objects.filter(place_id=place_id).prefetch_related('splits__user')
    balance_with = {}
    for exp in expenses:
        splits = list(exp.splits.all())
        n = len(splits) or 1
        share = exp.amount / n
        for s in splits:
            if exp.paid_by_id == s.user_id:
                continue
            if exp.paid_by_id == me.id:
                balance_with[s.user_id] = balance_with.get(s.user_id, Decimal('0')) - share
            elif s.user_id == me.id:
                balance_with[exp.paid_by_id] = balance_with.get(exp.paid_by_id, Decimal('0')) + share
    settlements = Settlement.objects.filter(place_id=place_id).select_related('from_user', 'to_user')
    _apply_settlements_to_balance(balance_with, settlements, me)
    return balance_with


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
