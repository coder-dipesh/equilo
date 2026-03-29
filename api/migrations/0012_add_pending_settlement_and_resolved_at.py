# Add PENDING_SETTLEMENT state and resolved_at for robust cycle lifecycle

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_activitylog'),
    ]

    operations = [
        migrations.AddField(
            model_name='expensecycle',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='expensecycle',
            name='status',
            field=models.CharField(
                choices=[
                    ('open', 'Open'),
                    ('pending_settlement', 'Pending settlement'),
                    ('resolved', 'Resolved'),
                ],
                default='open',
                max_length=24,
            ),
        ),
    ]
