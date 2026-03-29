# UserSession: drop raw refresh token; add metadata fields for sessions.

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_alter_notification_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='usersession',
            name='device_type',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='usersession',
            name='ip_address',
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='usersession',
            name='last_used_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.RemoveField(
            model_name='usersession',
            name='refresh_token',
        ),
    ]
