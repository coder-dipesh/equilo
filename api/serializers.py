from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite, UserProfile, Notification, ExpenseCycle, UserSession

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    profile_photo = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'display_name', 'profile_photo']

    def get_display_name(self, obj):
        try:
            name = (getattr(obj.profile, 'display_name', None) or '').strip()
            return name or obj.username
        except UserProfile.DoesNotExist:
            return obj.username

    def get_profile_photo(self, obj):
        try:
            if obj.profile.profile_photo:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.profile.profile_photo.url)
                return obj.profile.profile_photo.url
        except UserProfile.DoesNotExist:
            pass
        return None


class PlaceMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = PlaceMember
        fields = ['id', 'user', 'role', 'joined_at']


class PlaceSerializer(serializers.ModelSerializer):
    members = PlaceMemberSerializer(many=True, read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Place
        fields = ['id', 'name', 'created_by', 'created_at', 'members', 'member_count']
        read_only_fields = ['created_by', 'created_at']

    def get_member_count(self, obj):
        return obj.members.count()

    def create(self, validated_data):
        user = self.context['request'].user
        place = Place.objects.create(created_by=user, **validated_data)
        PlaceMember.objects.create(place=place, user=user, role=PlaceMember.ROLE_OWNER)
        for name, cat_type in ExpenseCategory.PRESETS:
            ExpenseCategory.objects.get_or_create(
                place=place, name=name,
                defaults={'name': name, 'category_type': cat_type}
            )
        return place


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'category_type']

    def create(self, validated_data):
        # place is passed from view perform_create via save(place=place)
        place = validated_data.pop('place', None)
        if not place:
            raise serializers.ValidationError('Place is required')
        name = (validated_data.get('name') or '').strip()
        if not name:
            raise serializers.ValidationError({'name': 'Category name is required.'})
        category_type = validated_data.get('category_type', ExpenseCategory.TYPE_VARIABLE)
        category, _ = ExpenseCategory.objects.get_or_create(
            place=place, name=name,
            defaults={'name': name, 'category_type': category_type}
        )
        if not _:
            category.category_type = category_type
            category.save(update_fields=['category_type'])
        return category


class ExpenseSplitSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ExpenseSplit
        fields = ['id', 'user']


class ExpenseCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCycle
        fields = ['id', 'place', 'start_date', 'end_date', 'status', 'name', 'created_at', 'resolved_at']
        read_only_fields = ['place', 'status', 'created_at', 'resolved_at']
        extra_kwargs = {'start_date': {'required': False}, 'end_date': {'required': False}}

    def validate_start_date(self, value):
        from django.utils import timezone
        if value is None:
            return value
        today = timezone.now().date()
        if value < today:
            raise serializers.ValidationError('Start date cannot be before today.')
        return value

    def create(self, validated_data):
        from datetime import timedelta
        from django.utils import timezone
        validated_data.pop('place', None)  # avoid duplicate when view calls save(place=place)
        place = self.context.get('place')
        if not place:
            raise serializers.ValidationError('Place is required')
        today = timezone.now().date()
        request_data = getattr(self.context.get('request'), 'data', None) or {}
        user_chose_start_date = 'start_date' in request_data
        # Use provided start_date or default to today; already validated >= today
        start_date = validated_data.pop('start_date', None) or today
        if start_date < today:
            raise serializers.ValidationError('Start date cannot be before today.')
        end_date = start_date + timedelta(days=13)  # 14-day period inclusive
        existing = ExpenseCycle.objects.filter(
            place=place, start_date=start_date, end_date=end_date
        ).first()
        if existing and existing.status == ExpenseCycle.STATUS_OPEN:
            return existing
        if existing:
            # Period exists but is resolved (or pending_settlement): user can "start" it again by reopening
            if user_chose_start_date and existing.status == ExpenseCycle.STATUS_RESOLVED:
                existing.status = ExpenseCycle.STATUS_OPEN
                existing.resolved_at = None
                existing.save(update_fields=['status', 'resolved_at'])
                return existing
            if existing and user_chose_start_date:
                raise serializers.ValidationError(
                    'A cycle for this period already exists and is not yet resolved. Please resolve it first or choose a different start date.'
                )
            # No user choice: advance until we find a free slot
            while ExpenseCycle.objects.filter(place=place, start_date=start_date, end_date=end_date).exists():
                start_date = end_date + timedelta(days=1)
                end_date = start_date + timedelta(days=13)
        name = validated_data.get('name') or f"{start_date.strftime('%b %d')} – {end_date.strftime('%b %d')}"
        validated_data['start_date'] = start_date
        validated_data['end_date'] = end_date
        validated_data['name'] = name
        return ExpenseCycle.objects.create(
            place=place,
            start_date=start_date,
            end_date=end_date,
            name=name,
            status=ExpenseCycle.STATUS_OPEN,
        )


class ExpenseCategoryField(serializers.PrimaryKeyRelatedField):
    """Accept category ID on write; return nested { id, name } on read."""
    def __init__(self, **kwargs):
        kwargs.setdefault('queryset', ExpenseCategory.objects.none())
        kwargs.setdefault('allow_null', True)
        kwargs.setdefault('required', False)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if data is None or data == '':
            return None
        return super().to_internal_value(data)

    def to_representation(self, value):
        if value is None:
            return None
        # Django/DRF may pass PKOnlyObject (only pk, no name); fetch full instance for serialization
        if not hasattr(value, 'name'):
            try:
                pk = getattr(value, 'pk', value)
                value = ExpenseCategory.objects.get(pk=pk)
            except (ExpenseCategory.DoesNotExist, TypeError, ValueError):
                return None
        return ExpenseCategorySerializer(value).data

    def get_queryset(self):
        place = self.context.get('place')
        if place:
            return place.categories.all()
        return ExpenseCategory.objects.none()


class ExpenseSerializer(serializers.ModelSerializer):
    paid_by = UserSerializer(read_only=True)
    added_by = UserSerializer(read_only=True)
    category = ExpenseCategoryField()
    cycle = ExpenseCycleSerializer(read_only=True)
    splits = ExpenseSplitSerializer(many=True, read_only=True)
    split_user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Expense
        fields = [
            'id', 'place', 'cycle', 'amount', 'description', 'date',
            'paid_by', 'added_by', 'category', 'created_at',
            'splits', 'split_user_ids'
        ]
        read_only_fields = ['created_at', 'place', 'added_by', 'cycle']

    @staticmethod
    def _paid_by_id_from_initial(initial_data):
        """
        `paid_by` is read-only (nested User in responses), so DRF does not put it in validated_data.
        Clients send paid_by as a user id (integer). Read it from the raw request body.
        """
        if not initial_data:
            return None
        pb = initial_data.get('paid_by')
        if pb is None:
            return None
        if isinstance(pb, dict):
            pid = pb.get('id')
            if pid is None:
                return None
            try:
                return int(pid)
            except (TypeError, ValueError):
                return None
        try:
            return int(pb)
        except (TypeError, ValueError):
            return None

    def create(self, validated_data):
        split_user_ids = validated_data.pop('split_user_ids', [])
        user = self.context['request'].user
        place = validated_data.pop('place', None) or self.context.get('place')
        if not place or not place.members.filter(user=user).exists():
            raise serializers.ValidationError('You are not a member of this place.')
        current_cycle = self.context.get('current_cycle')
        paid_by_id = self._paid_by_id_from_initial(getattr(self, 'initial_data', None))
        paid_by = user
        if paid_by_id and place.members.filter(user_id=paid_by_id).exists():
            paid_by = User.objects.get(pk=paid_by_id)
        expense = Expense.objects.create(
            place=place,
            cycle=current_cycle,
            paid_by=paid_by,
            added_by=user,
            amount=validated_data.get('amount'),
            description=validated_data.get('description'),
            date=validated_data.get('date'),
            category=validated_data.get('category'),
        )
        for uid in split_user_ids:
            if place.members.filter(user_id=uid).exists():
                ExpenseSplit.objects.get_or_create(expense=expense, user_id=uid)
        if not expense.splits.exists():
            ExpenseSplit.objects.get_or_create(expense=expense, user=user)
        return expense

    def update(self, instance, validated_data):
        split_user_ids = validated_data.pop('split_user_ids', None)
        place = instance.place
        paid_by_id = self._paid_by_id_from_initial(getattr(self, 'initial_data', None))
        if paid_by_id is not None and place.members.filter(user_id=paid_by_id).exists():
            instance.paid_by_id = paid_by_id
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if split_user_ids is not None:
            instance.splits.all().delete()
            place = instance.place
            for uid in split_user_ids:
                if place.members.filter(user_id=uid).exists():
                    ExpenseSplit.objects.get_or_create(expense=instance, user_id=uid)
            if not instance.splits.exists():
                ExpenseSplit.objects.get_or_create(expense=instance, user=instance.paid_by)
        return instance


class PlaceInviteSerializer(serializers.ModelSerializer):
    invited_by = UserSerializer(read_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = PlaceInvite
        fields = ['id', 'place', 'email', 'token', 'invited_by', 'status', 'created_at']
        read_only_fields = ['place', 'invited_by', 'status', 'token']


class NotificationSerializer(serializers.ModelSerializer):
    place_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id',
            'type',
            'title',
            'message',
            'data',
            'place',
            'place_name',
            'is_read',
            'read_at',
            'created_at',
        ]
        read_only_fields = fields

    def get_place_name(self, obj):
        try:
            return obj.place.name if obj.place else None
        except Exception:
            return None


class UserSessionSerializer(serializers.ModelSerializer):
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = [
            'id',
            'jti',
            'device_label',
            'device_type',
            'created_at',
            'last_used_at',
            'ip_address',
            'user_agent',
            'is_current',
        ]
        read_only_fields = fields

    def get_is_current(self, obj):
        # Prefer refresh-cookie jti; fall back to access token `sid` when cookie is not sent (e.g. cross-origin).
        current_sid = self.context.get('current_sid')
        if current_sid is not None and obj.pk == current_sid:
            return True
        current_jti = self.context.get('current_jti')
        return current_jti is not None and obj.jti == current_jti
