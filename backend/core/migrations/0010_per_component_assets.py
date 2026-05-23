import uuid
import datetime
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_components_and_statuses(apps, schema_editor):
    """
    For each existing AssetRegistry, create three AssetComponent rows (AT/DC/GR)
    installed on Jan 1 of tahun_instalasi. For each existing InspectionLog,
    create three InspectionComponentStatus rows mirroring the flat status_* fields.
    """
    AssetRegistry = apps.get_model('core', 'AssetRegistry')
    InspectionLog = apps.get_model('core', 'InspectionLog')
    AssetComponent = apps.get_model('core', 'AssetComponent')
    InspectionComponentStatus = apps.get_model('core', 'InspectionComponentStatus')

    component_types = ('AT', 'DC', 'GR')

    # 1. Components per asset
    asset_to_components = {}
    for asset in AssetRegistry.objects.all():
        install_date = datetime.date(asset.tahun_instalasi, 1, 1)
        per_type = {}
        for ct in component_types:
            per_type[ct] = AssetComponent.objects.create(
                asset=asset,
                component_type=ct,
                install_date=install_date,
            )
        asset_to_components[asset.asset_id] = per_type

    # 2. Status rows per inspection — mirror flat fields, attach GR resistance measurement
    field_map = {
        'AT': 'status_air_terminal',
        'DC': 'status_down_conductor',
        'GR': 'status_grounding',
    }
    for inspection in InspectionLog.objects.select_related('asset').all():
        components = asset_to_components.get(inspection.asset_id)
        if not components:
            continue
        for ct in component_types:
            status_value = getattr(inspection, field_map[ct]) or 'OK'
            measurement = inspection.resistansi_grounding_ohm if ct == 'GR' else None
            InspectionComponentStatus.objects.create(
                inspection=inspection,
                component=components[ct],
                status=status_value,
                measurement=measurement,
            )


def reverse_backfill(apps, schema_editor):
    AssetComponent = apps.get_model('core', 'AssetComponent')
    InspectionComponentStatus = apps.get_model('core', 'InspectionComponentStatus')
    InspectionComponentStatus.objects.all().delete()
    AssetComponent.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0009_revoke_legacy_edited_after_verify'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssetComponent',
            fields=[
                ('component_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('component_type', models.CharField(choices=[('AT', 'Air Terminal'), ('DC', 'Down Conductor'), ('GR', 'Grounding Electrode')], max_length=2)),
                ('install_date', models.DateField(help_text='Resets the stress and age clock on replacement')),
                ('end_date', models.DateField(blank=True, db_index=True, help_text='Set when superseded; null = currently installed', null=True)),
                ('design_capacity_ka', models.FloatField(blank=True, help_text='Optional override; null → inherit from asset LPL', null=True)),
                ('catatan', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='components', to='core.assetregistry')),
                ('deleted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='components_deleted', to=settings.AUTH_USER_MODEL)),
                ('replaced_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replaces', to='core.assetcomponent')),
            ],
            options={
                'db_table': 'asset_components',
                'ordering': ['asset', 'component_type', '-install_date'],
            },
        ),
        migrations.AddConstraint(
            model_name='assetcomponent',
            constraint=models.UniqueConstraint(
                condition=models.Q(('end_date__isnull', True), ('deleted_at__isnull', True)),
                fields=('asset', 'component_type'),
                name='one_active_component_per_type_per_asset',
            ),
        ),
        migrations.CreateModel(
            name='InspectionComponentStatus',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('status', models.CharField(help_text='Values constrained per component_type', max_length=20)),
                ('measurement', models.FloatField(blank=True, help_text='e.g. resistansi_grounding_ohm for GR', null=True)),
                ('catatan', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('component', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='status_history', to='core.assetcomponent')),
                ('inspection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='component_statuses', to='core.inspectionlog')),
            ],
            options={
                'db_table': 'inspection_component_statuses',
                'ordering': ['inspection', 'component'],
                'unique_together': {('inspection', 'component')},
            },
        ),
        migrations.CreateModel(
            name='ComponentMaintenanceAction',
            fields=[
                ('action_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(choices=[('install', 'Install'), ('repair', 'Repair'), ('replace', 'Replace')], max_length=10)),
                ('performed_at', models.DateTimeField()),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='maintenance_actions', to='core.assetregistry')),
                ('component', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='maintenance_actions', to='core.assetcomponent')),
                ('performed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maintenance_actions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'component_maintenance_actions',
                'ordering': ['-performed_at'],
            },
        ),
        migrations.RunPython(backfill_components_and_statuses, reverse_backfill),
    ]
