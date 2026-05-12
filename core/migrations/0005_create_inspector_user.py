from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations


def create_inspector_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('core', 'UserProfile')

    user, created = User.objects.update_or_create(
        username='inspector',
        defaults={
            'first_name': 'Inspector',
            'last_name': 'User',
            'email': '',
            'password': make_password('inspector'),
            'is_staff': False,
            'is_superuser': False,
            'is_active': True,
        },
    )

    # Ensure a profile exists with OPERATOR role
    try:
        profile, _ = UserProfile.objects.update_or_create(
            user_id=user.id,
            defaults={'role': 'OPERATOR'},
        )
    except Exception:
        # Fallback: if UserProfile table isn't available yet, ignore
        pass


def delete_inspector_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(username='inspector').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_inferencelog_operator_review_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(create_inspector_user, delete_inspector_user),
    ]
