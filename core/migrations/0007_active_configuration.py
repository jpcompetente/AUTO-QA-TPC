from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_seed_admin_and_inspector_roles'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ActiveConfiguration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('threshold', models.FloatField(default=0.5)),
                ('config_version', models.PositiveIntegerField(default=1)),
                ('config_hash', models.CharField(editable=False, max_length=64, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='created_active_configurations', to=settings.AUTH_USER_MODEL)),
                ('model', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='active_configurations', to='core.aimodel')),
                ('operator', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='active_configurations', to=settings.AUTH_USER_MODEL)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='active_configurations', to='core.componenttype')),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='activeconfiguration',
            constraint=models.UniqueConstraint(
                condition=Q(is_active=True),
                fields=('operator', 'product'),
                name='uniq_active_configuration_per_operator_product',
            ),
        ),
        migrations.AddIndex(
            model_name='activeconfiguration',
            index=models.Index(fields=['operator', 'is_active'], name='core_active_operator_idx'),
        ),
        migrations.AddIndex(
            model_name='activeconfiguration',
            index=models.Index(fields=['product', 'is_active'], name='core_active_product_idx'),
        ),
    ]
