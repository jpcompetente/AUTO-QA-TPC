from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations


def create_admin_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.update_or_create(
        username='admin',
        defaults={
            'first_name': 'Admin',
            'last_name': 'User',
            'email': '',
            'password': make_password('admin'),
            'is_staff': True,
            'is_superuser': True,
            'is_active': True,
        },
    )


def delete_admin_user(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(username='admin').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(create_admin_user, delete_admin_user),
    ]