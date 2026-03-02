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
        fields = ['id', 'place', 'start_date', 'end_date', 'status', 'name', 'created_at']
        read_only_fields = ['place', 'status', 'created_at']
        extra_kwargs = {'start_date': {'required': False}, 'end_date': {'required': False}}

    def create(self, validated_data):
        from datetime import timedelta
        from django.utils import timezone
        validated_data.pop('place', None)  # avoid duplicate when view calls save(place=place)
        place = self.context.get('place')
        if not place:
            raise serializers.ValidationError('Place is required')
        start_date = validated_data.get('start_date')
        end_date = validated_data.get('end_date')
        if not start_date or not end_date:
            today = timezone.now().date()
            last = place.cycles.order_by('-start_date').first()
            if last:
                start_date = start_date or (last.end_date + timedelta(days=1))
                end_date = end_date or (start_date + timedelta(days=13))
            else:
                start_date = start_date or today
                end_date = end_date or (start_date + timedelta(days=13))
            # Do not allow cycles to start in the future: cap to today
            if start_date > today:
                start_date = today
                end_date = start_date + timedelta(days=13)
            validated_data['start_date'] = start_date
            validated_data['end_date'] = end_date
        name = validated_data.get('name') or f"{start_date.strftime('%b %d')} – {end_date.strftime('%b %d')}"
        validated_data['name'] = name
        # Avoid duplicate key error if the same period was already created (e.g. user retried)
        cycle, created = ExpenseCycle.objects.get_or_create(
            place=place,
            start_date=start_date,
            end_date=end_date,
            defaults={'name': name, 'status': ExpenseCycle.STATUS_OPEN},
        )
        return cycle


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

    def create(self, validated_data):
        split_user_ids = validated_data.pop('split_user_ids', [])
        user = self.context['request'].user
        place = validated_data.pop('place', None) or self.context.get('place')
        if not place or not place.members.filter(user=user).exists():
            raise serializers.ValidationError('You are not a member of this place.')
        current_cycle = self.context.get('current_cycle')
        paid_by = validated_data.pop('paid_by', None)
        paid_by_id = getattr(paid_by, 'id', paid_by) if paid_by is not None else None
        if not paid_by_id or not place.members.filter(user_id=paid_by_id).exists():
            paid_by = user
        elif isinstance(paid_by, int):
            paid_by = User.objects.get(pk=paid_by)
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
        fields = ['id', 'jti', 'device_label', 'created_at', 'is_current']
        read_only_fields = ['id', 'jti', 'device_label', 'created_at']

    def get_is_current(self, obj):
        current_jti = self.context.get('current_jti')
        return current_jti is not None and obj.jti == current_jti
