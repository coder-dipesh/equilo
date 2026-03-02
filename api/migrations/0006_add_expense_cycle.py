# Generated manually for ExpenseCycle and Expense.cycle

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_notification'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpenseCycle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('status', models.CharField(choices=[('open', 'Open'), ('resolved', 'Resolved')], default='open', max_length=20)),
                ('name', models.CharField(blank=True, max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('place', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cycles', to='api.place')),
            ],
            options={
                'ordering': ['-start_date'],
                'unique_together': {('place', 'start_date', 'end_date')},
            },
        ),
        migrations.AddField(
            model_name='expense',
            name='cycle',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='expenses', to='api.expensecycle'),
        ),
    ]
