from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite, UserProfile

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
        for name in ['Rent', 'Utilities', 'Groceries', 'Internet', 'Other']:
            ExpenseCategory.objects.get_or_create(place=place, defaults={'name': name})
        return place


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name']

    def create(self, validated_data):
        # place is passed from view perform_create via save(place=place)
        place = validated_data.pop('place', None)
        if not place:
            raise serializers.ValidationError('Place is required')
        name = (validated_data.get('name') or '').strip()
        if not name:
            raise serializers.ValidationError({'name': 'Category name is required.'})
        category, _ = ExpenseCategory.objects.get_or_create(place=place, name=name, defaults={'name': name})
        return category


class ExpenseSplitSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ExpenseSplit
        fields = ['id', 'user']


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
    splits = ExpenseSplitSerializer(many=True, read_only=True)
    split_user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Expense
        fields = [
            'id', 'place', 'amount', 'description', 'date',
            'paid_by', 'added_by', 'category', 'created_at',
            'splits', 'split_user_ids'
        ]
        read_only_fields = ['created_at', 'place', 'added_by']

    def create(self, validated_data):
        split_user_ids = validated_data.pop('split_user_ids', [])
        user = self.context['request'].user
        place = validated_data.pop('place', None) or self.context.get('place')
        if not place or not place.members.filter(user=user).exists():
            raise serializers.ValidationError('You are not a member of this place.')
        paid_by = validated_data.pop('paid_by', None)
        paid_by_id = getattr(paid_by, 'id', paid_by) if paid_by is not None else None
        if not paid_by_id or not place.members.filter(user_id=paid_by_id).exists():
            paid_by = user
        elif isinstance(paid_by, int):
            paid_by = User.objects.get(pk=paid_by)
        expense = Expense.objects.create(
            place=place,
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
