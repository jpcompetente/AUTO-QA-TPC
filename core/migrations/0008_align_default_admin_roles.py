from django.conf import settings
from django.db import migrations


def align_default_admin_roles(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("core", "UserProfile")

    admin_user = User.objects.filter(username="admin").first()
    if admin_user:
        admin_user.is_active = True
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save(update_fields=["is_active", "is_staff", "is_superuser"])
        UserProfile.objects.update_or_create(
            user_id=admin_user.id,
            defaults={"role": "ADMIN"},
        )

    superadmin_user = User.objects.filter(username="superadmin").first()
    if superadmin_user:
        superadmin_user.is_active = True
        superadmin_user.is_staff = True
        superadmin_user.is_superuser = True
        superadmin_user.save(update_fields=["is_active", "is_staff", "is_superuser"])
        UserProfile.objects.update_or_create(
            user_id=superadmin_user.id,
            defaults={"role": "SUPER_ADMIN"},
        )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_active_configuration"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(align_default_admin_roles, noop_reverse),
    ]
