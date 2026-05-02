from django.conf import settings
from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    """Optional profile: display name and photo. One-to-one with User."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile'
    )
    display_name = models.CharField(max_length=255, blank=True)
    profile_photo = models.ImageField(upload_to='profiles/', blank=True, null=True)
    email_notifications_enabled = models.BooleanField(default=True)

    def __str__(self):
        return f"Profile for {self.user.username}"


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
    email = models.EmailField(blank=True, null=True)  # null = link-only invite
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
        ordering = ['-created_at']


class ExpenseCategory(models.Model):
    """Category for expenses (Rent, Utilities, Groceries, etc.) per Place."""
    TYPE_FIXED = 'fixed'      # Predictable recurring (Rent, Internet)
    TYPE_VARIABLE = 'variable'  # Changing costs (Groceries, Electricity)
    TYPE_ONE_TIME = 'one_time'  # One-off (Bond, Furniture)
    TYPE_CHOICES = [
        (TYPE_FIXED, 'Fixed'),
        (TYPE_VARIABLE, 'Variable'),
        (TYPE_ONE_TIME, 'One-time'),
    ]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)
    category_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_VARIABLE,
    )

    class Meta:
        unique_together = ['place', 'name']
        ordering = ['name']
        verbose_name_plural = 'Expense categories'

    # Preset categories for new places: (name, category_type)
    PRESETS = [
        ('Rent', TYPE_FIXED),
        ('Bond / Deposit', TYPE_ONE_TIME),
        ('Strata / Building Fees', TYPE_FIXED),
        ('Electricity', TYPE_VARIABLE),
        ('Water', TYPE_VARIABLE),
        ('Gas', TYPE_VARIABLE),
        ('Internet', TYPE_FIXED),
        ('Mobile (Shared Plan)', TYPE_FIXED),
        ('Groceries', TYPE_VARIABLE),
        ('Cleaning Supplies', TYPE_VARIABLE),
        ('Toiletries', TYPE_VARIABLE),
        ('Kitchen Supplies', TYPE_VARIABLE),
        ('Household Items', TYPE_VARIABLE),
        ('Netflix', TYPE_FIXED),
        ('Spotify', TYPE_FIXED),
        ('Amazon Prime', TYPE_FIXED),
        ('Other Shared Subscriptions', TYPE_VARIABLE),
        ('Takeaway', TYPE_VARIABLE),
        ('Dining Out', TYPE_VARIABLE),
        ('House Party', TYPE_VARIABLE),
        ('Shared Events', TYPE_VARIABLE),
        ('Other', TYPE_VARIABLE),
    ]

    def __str__(self):
        return f"{self.name} ({self.place})"


class ExpenseCycle(models.Model):
    """
    A settlement period for a Place (e.g. fortnight).
    OPEN = active, expenses can be added.
    PENDING_SETTLEMENT = end date passed, no new expenses; members settle up.
    RESOLVED = closed, moved to archive.
    """
    STATUS_OPEN = 'open'
    STATUS_PENDING_SETTLEMENT = 'pending_settlement'
    STATUS_RESOLVED = 'resolved'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_PENDING_SETTLEMENT, 'Pending settlement'),
        (STATUS_RESOLVED, 'Resolved'),
    ]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='cycles')
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default=STATUS_OPEN)
    name = models.CharField(max_length=100, blank=True)  # e.g. "Feb 2 – Feb 15"
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)  # set when status becomes RESOLVED

    class Meta:
        ordering = ['-start_date']
        unique_together = ['place', 'start_date', 'end_date']

    def __str__(self):
        return f"{self.place.name}: {self.start_date}–{self.end_date} ({self.status})"


class Expense(models.Model):
    """A single expense in a Place. Split is defined via ExpenseSplit. Optional cycle for period tracking."""
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='expenses')
    cycle = models.ForeignKey(
        'ExpenseCycle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    date = models.DateField()
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expenses_paid'
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expenses_added',
        null=True,
        blank=True,
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


class Settlement(models.Model):
    """
    Records a payment from one member to another within a Place.
    from_user paid to_user; this reduces the debt (balance moves toward 0).
    cycle is set when the settlement is made against a specific cycle's balance.
    """
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='settlements')
    cycle = models.ForeignKey(
        'ExpenseCycle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settlements',
    )
    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='settlements_made'
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='settlements_received'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()  # when the payment happened (for period filtering)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.from_user} → {self.to_user} {self.amount} ({self.place})"


class ActivityLog(models.Model):
    """
    Audit log of user actions for the Activity feed.
    Types: expense_added, expense_edited, expense_deleted, place_created, place_joined,
           member_removed, place_left, settlement, profile_updated, password_changed.
    """
    TYPE_EXPENSE_ADDED = 'expense_added'
    TYPE_EXPENSE_EDITED = 'expense_edited'
    TYPE_EXPENSE_DELETED = 'expense_deleted'
    TYPE_PLACE_CREATED = 'place_created'
    TYPE_PLACE_JOINED = 'place_joined'
    TYPE_MEMBER_REMOVED = 'member_removed'
    TYPE_PLACE_LEFT = 'place_left'
    TYPE_SETTLEMENT = 'settlement'
    TYPE_PROFILE_UPDATED = 'profile_updated'
    TYPE_PASSWORD_CHANGED = 'password_changed'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='activity_logs',
    )
    type = models.CharField(max_length=40, db_index=True)
    place = models.ForeignKey(
        Place,
        on_delete=models.CASCADE,
        related_name='activity_logs',
        null=True,
        blank=True,
    )
    expense = models.ForeignKey(
        Expense,
        on_delete=models.SET_NULL,
        related_name='activity_logs',
        null=True,
        blank=True,
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='activity_logs_targeted',
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    description = models.CharField(max_length=500, blank=True)
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user_id} {self.type} @ {self.created_at}"


class Notification(models.Model):
    """User-facing notifications shown in the navbar dropdown."""

    TYPE_PAYMENT_REQUEST = 'payment_request'
    TYPE_BALANCE_UPDATED = 'balance_updated'
    TYPE_WELCOME = 'welcome'
    TYPE_UNSETTLED_BALANCE = 'unsettled_balance'
    TYPE_EXPENSE_ADDED = 'expense_added'
    TYPE_CYCLE_ENDED = 'cycle_ended'

    TYPE_CHOICES = [
        (TYPE_PAYMENT_REQUEST, 'Payment Request'),
        (TYPE_BALANCE_UPDATED, 'Balance Updated'),
        (TYPE_WELCOME, 'Welcome'),
        (TYPE_UNSETTLED_BALANCE, 'Unsettled Balance'),
        (TYPE_EXPENSE_ADDED, 'Expense Added'),
        (TYPE_CYCLE_ENDED, 'Cycle Ended'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    place = models.ForeignKey(
        Place,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
    )
    type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    # Optional extra structured data for deep links, amounts, etc.
    data = models.JSONField(default=dict, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user}: {self.title}"


class UserSession(models.Model):
    """
    Tracks active sessions (devices) per user. Created on login/register.
    Identified by refresh token jti (rotated on each refresh). Raw refresh is not stored.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_sessions'
    )
    jti = models.CharField(max_length=255, unique=True, db_index=True)  # JWT ID from current refresh token
    device_label = models.CharField(max_length=255, blank=True)  # e.g. "Chrome on Mac", "iPhone"
    user_agent = models.TextField(blank=True)
    device_type = models.CharField(max_length=32, blank=True)  # mobile, tablet, desktop, unknown
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()  # When the current refresh token expires

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} @ {self.device_label or self.jti[:8]}"
