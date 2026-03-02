# Generated manually: add category_type to ExpenseCategory

from django.db import migrations, models


def set_default_type(apps, schema_editor):
    ExpenseCategory = apps.get_model('api', 'ExpenseCategory')
    ExpenseCategory.objects.filter(category_type='').update(category_type='variable')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_usersession'),
    ]

    operations = [
        migrations.AddField(
            model_name='expensecategory',
            name='category_type',
            field=models.CharField(
                choices=[('fixed', 'Fixed'), ('variable', 'Variable'), ('one_time', 'One-time')],
                default='variable',
                max_length=20,
            ),
        ),
    ]
