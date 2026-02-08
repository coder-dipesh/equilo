from django.contrib import admin
from .models import Place, PlaceMember, ExpenseCategory, Expense, ExpenseSplit, PlaceInvite


@admin.register(Place)
class PlaceAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by', 'created_at']


@admin.register(PlaceMember)
class PlaceMemberAdmin(admin.ModelAdmin):
    list_display = ['place', 'user', 'role', 'joined_at']


@admin.register(PlaceInvite)
class PlaceInviteAdmin(admin.ModelAdmin):
    list_display = ['place', 'email', 'invited_by', 'status', 'created_at']


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'place']


class ExpenseSplitInline(admin.TabularInline):
    model = ExpenseSplit
    extra = 0


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['description', 'amount', 'place', 'paid_by', 'date', 'category']
    list_filter = ['place', 'date']
    inlines = [ExpenseSplitInline]
