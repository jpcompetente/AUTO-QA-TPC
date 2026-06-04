from django.db import migrations, models


def normalize_batch_numbers(apps, schema_editor):
    InferenceLog = apps.get_model("core", "InferenceLog")
    InferenceLog.objects.filter(batch_number__lt=1).update(batch_number=1)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_alter_inferencelog_options_inferencelog_batch_number_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="inferencelog",
            name="batch_number",
            field=models.PositiveIntegerField(db_index=True, default=1),
        ),
        migrations.RunPython(normalize_batch_numbers, migrations.RunPython.noop),
    ]