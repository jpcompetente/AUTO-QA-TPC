from django.conf import settings
from django.db import migrations


ADMIN_USERNAMES = ("admin", "superadmin")


def restore_admin_permissions(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("core", "UserProfile")

    for username in ADMIN_USERNAMES:
        user = User.objects.filter(username=username).first()
        if not user:
            continue

        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_active", "is_staff", "is_superuser"])

        UserProfile.objects.update_or_create(
            user_id=user.id,
            defaults={"role": "SUPER_ADMIN"},
        )


def noop_reverse(apps, schema_editor):
    # Keep current permission state on rollback to avoid accidental lockout.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_seed_admin_and_inspector_roles"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(restore_admin_permissions, noop_reverse),
    ]
