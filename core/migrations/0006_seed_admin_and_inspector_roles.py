from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import migrations


def seed_roles(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('core', 'UserProfile')

    admin_user = User.objects.filter(username='admin').first()
    if admin_user:
        UserProfile.objects.update_or_create(
            user_id=admin_user.id,
            defaults={'role': 'ADMIN'},
        )

    inspector_user = User.objects.filter(username='inspector').first()
    if inspector_user:
        UserProfile.objects.update_or_create(
            user_id=inspector_user.id,
            defaults={'role': 'INSPECTOR'},
        )


def unseed_roles(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('core', 'UserProfile')
    UserProfile.objects.filter(user__username__in=['admin', 'inspector']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_create_inspector_user'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(seed_roles, unseed_roles),
    ]
