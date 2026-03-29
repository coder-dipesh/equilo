from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_add_pending_settlement_and_resolved_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='settlement',
            name='cycle',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='settlements',
                to='api.expensecycle',
            ),
        ),
    ]
