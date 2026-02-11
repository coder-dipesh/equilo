import secrets
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.viewsets import ModelViewSet
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite, UserProfile

User = get_user_model()
from .permissions import IsPlaceMember
from .serializers import (
    UserSerializer,
    PlaceSerializer,
    PlaceMemberSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    PlaceInviteSerializer,
)

User = get_user_model()


# ----- Auth (public) -----

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
            profile.profile_photo = request.FILES['profile_photo']
        elif request.data.get('remove_profile_photo') in (True, 'true', '1'):
            profile.profile_photo = None
        profile.save()
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
    return Response({'detail': 'Password updated.'})


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
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }, status=status.HTTP_201_CREATED)


# ----- Hello (public) -----

@api_view(['GET'])
@permission_classes([AllowAny])
def hello_world(request):
    return Response({
        'message': 'Hello World from Django REST API!',
        'status': 'ok',
    })


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

    PRESET_CATEGORIES = ['Rent', 'Utilities', 'Groceries', 'Internet', 'Other']

    def get_queryset(self):
        place_id = self.kwargs.get('place_id')
        if not place_id or not PlaceMember.objects.filter(place_id=place_id, user=self.request.user).exists():
            return ExpenseCategory.objects.none()
        qs = ExpenseCategory.objects.filter(place_id=place_id)
        # Ensure all preset categories exist (fixes new places and places that only got one category)
        try:
            place = Place.objects.get(id=place_id)
            for name in self.PRESET_CATEGORIES:
                ExpenseCategory.objects.get_or_create(place=place, name=name)
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
        return (
            Expense.objects.filter(place_id=place_id)
            .select_related('paid_by', 'added_by', 'category', 'place')
            .prefetch_related('splits__user')
            .order_by('-created_at')
        )

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
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not self._can_edit_expense(self.request, instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the person who added this expense or the place owner can edit it.')
        super().perform_update(serializer)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.kwargs.get('place_id'):
            try:
                context['place'] = Place.objects.get(id=self.kwargs['place_id'])
            except Place.DoesNotExist:
                pass
        return context

    def perform_create(self, serializer):
        place = Place.objects.get(id=self.kwargs['place_id'])
        serializer.save(place=place)


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
    PlaceMember.objects.get_or_create(place=invite.place, user=request.user, defaults={'role': PlaceMember.ROLE_MEMBER})
    invite.status = PlaceInvite.STATUS_ACCEPTED
    invite.save(update_fields=['status'])
    return Response(PlaceSerializer(invite.place).data)


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
        'place_name': invite.place.name,
        'email': invite.email,
    })


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
    Returns: period stats, previous period total for comparison, by_member_balance list with usernames.
    """
    if not PlaceMember.objects.filter(place_id=place_id, user=request.user).exists():
        return Response({'error': 'Not a member'}, status=status.HTTP_403_FORBIDDEN)
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
    me = request.user
    start_date, end_date = _period_dates(period, from_date, week_start)

    total_expense, my_expense, total_i_paid, balance_with = _compute_period_summary(
        place_id, me, start_date, end_date
    )
    others_expense = total_expense - my_expense
    total_i_owe = sum(v for v in balance_with.values() if v > 0)
    total_owed_to_me = sum(-v for v in balance_with.values() if v < 0)

    # Previous period for comparison (same length, ending day before current start)
    prev_end = start_date - timedelta(days=1)
    prev_start, _ = _period_dates(period, prev_end, week_start)
    prev_total, prev_my, _, _ = _compute_period_summary(place_id, me, prev_start, prev_end)
    spending_change_pct = None
    if prev_total and prev_total > 0:
        spending_change_pct = round(((float(total_expense) - float(prev_total)) / float(prev_total)) * 100)
    elif prev_total == 0 and total_expense == 0:
        spending_change_pct = 0  # same as last period (no spending both)
    # When prev_total == 0 and total_expense > 0 we leave spending_change_pct None so frontend can show "Up from no spending"

    # Member balance list with usernames and display names (balance: positive = I owe them, negative = they owe me)
    user_ids = list(balance_with.keys())
    user_map = {}
    if user_ids:
        for u in User.objects.filter(id__in=user_ids).select_related('profile'):
            display_name = (getattr(u.profile, 'display_name', None) or '').strip() or u.username
            user_map[u.id] = {'username': u.username, 'display_name': display_name}
    by_member_balance_list = [
        {
            'user_id': uid,
            'username': (user_map.get(uid) or {}).get('username') or f'User {uid}',
            'display_name': (user_map.get(uid) or {}).get('display_name') or user_map.get(uid, {}).get('username') or f'User {uid}',
            'balance': float(balance_with[uid]),
        }
        for uid in user_ids
    ]
    # Sort: they owe me first (negative balance), then I owe them (positive), by abs amount desc
    by_member_balance_list.sort(key=lambda x: (x['balance'] >= 0, -abs(x['balance'])))

    return Response({
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
    })
