from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_usersession_security'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='email_notifications_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
