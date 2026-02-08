from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


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


class ExpenseSerializer(serializers.ModelSerializer):
    paid_by = UserSerializer(read_only=True)
    added_by = UserSerializer(read_only=True)
    category = ExpenseCategorySerializer(read_only=True)
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
        place = validated_data.get('place') or self.context.get('place')
        if not place or not place.members.filter(user=user).exists():
            raise serializers.ValidationError('You are not a member of this place.')
        paid_by = validated_data.get('paid_by')
        paid_by_id = getattr(paid_by, 'id', paid_by)
        if not paid_by_id or not place.members.filter(user_id=paid_by_id).exists():
            paid_by = user
        elif isinstance(paid_by, int):
            paid_by = User.objects.get(pk=paid_by)
        validated_data['paid_by'] = paid_by
        validated_data['added_by'] = user
        expense = Expense.objects.create(**validated_data)
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
