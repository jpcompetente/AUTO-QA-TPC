from django.db import migrations

def migrate_roles(apps, schema_editor):
    UserProfile = apps.get_model('core', 'UserProfile')
    for profile in UserProfile.objects.all():
        if profile.role in ('OPERATOR', 'INSPECTOR'):
            profile.role = 'USER'
        elif profile.role in ('ADMIN', 'SUPER_ADMIN'):
            profile.role = 'ADMIN'
        profile.save()

class Migration(migrations.Migration):
    dependencies = [
        ('core', '0016_remove_manufacturingordersession_active_model_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_roles),
    ]