from django.conf import settings
from django.db import models


class Place(models.Model):
    """
    A shared living space (apartment/house) with multiple members.
    One member creates it and invites others.
    """
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_places'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class PlaceMember(models.Model):
    """Members of a Place. Owner can invite; others join via invite."""
    ROLE_OWNER = 'owner'
    ROLE_MEMBER = 'member'
    ROLE_CHOICES = [(ROLE_OWNER, 'Owner'), (ROLE_MEMBER, 'Member')]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='place_memberships'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['place', 'user']
        ordering = ['joined_at']

    def __str__(self):
        return f"{self.user} in {self.place}"


class PlaceInvite(models.Model):
    """Pending invite to join a Place (by email)."""
    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_EXPIRED = 'expired'

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='invites')
    email = models.EmailField()
    token = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_invites'
    )
    status = models.CharField(
        max_length=20,
        choices=[(STATUS_PENDING, 'Pending'), (STATUS_ACCEPTED, 'Accepted'), (STATUS_EXPIRED, 'Expired')],
        default=STATUS_PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['place', 'email']
        ordering = ['-created_at']


class ExpenseCategory(models.Model):
    """Category for expenses (Rent, Utilities, Groceries, etc.) per Place."""
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = ['place', 'name']
        ordering = ['name']
        verbose_name_plural = 'Expense categories'

    def __str__(self):
        return f"{self.name} ({self.place})"


class Expense(models.Model):
    """A single expense in a Place. Split is defined via ExpenseSplit."""
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='expenses')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    date = models.DateField()
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expenses_paid'
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.description} - {self.amount} ({self.place})"


class ExpenseSplit(models.Model):
    """
    Which members share this expense (equal split).
    Each member in splits owes amount / num_splits.
    """
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='splits')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expense_splits'
    )

    class Meta:
        unique_together = ['expense', 'user']

    def __str__(self):
        return f"{self.expense} -> {self.user}"
