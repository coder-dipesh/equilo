# Ensure only one open cycle per place: resolve older open cycles

from django.db import migrations


def resolve_extra_open_cycles(apps, schema_editor):
    ExpenseCycle = apps.get_model('api', 'ExpenseCycle')
    place_ids = ExpenseCycle.objects.filter(status='open').values_list('place_id', flat=True).distinct()
    for place_id in place_ids:
        open_cycles = list(
            ExpenseCycle.objects.filter(place_id=place_id, status='open').order_by('-start_date')
        )
        if len(open_cycles) <= 1:
            continue
        keep_id = open_cycles[0].id
        ExpenseCycle.objects.filter(place_id=place_id, status='open').exclude(pk=keep_id).update(
            status='resolved'
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_add_expense_cycle'),
    ]

    operations = [
        migrations.RunPython(resolve_extra_open_cycles, noop),
    ]
