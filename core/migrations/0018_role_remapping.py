from django.db import migrations


def remap_user_roles(apps, schema_editor):
    UserProfile = apps.get_model('core', 'UserProfile')
    for profile in UserProfile.objects.all():
        original_role = profile.role
        if original_role in ('OPERATOR', 'INSPECTOR'):
            profile.role = 'USER'
        elif original_role in ('ADMIN', 'SUPER_ADMIN'):
            profile.role = 'ADMIN'
        if profile.role != original_role:
            profile.save()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_previous_migration'),
    ]

    operations = [
        migrations.RunPython(remap_user_roles),
    ]
