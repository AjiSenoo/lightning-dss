"""
0021_add_spatial_shielding

Reclassify LPS components into Eksternal (AT/DC/GR) + Internal (SPD/BND/SHD) and
introduce Spatial Shielding (SHD) as a net-new weighted component; remove the
retired Kabel Instalasi field.

Schema:
  * Add 'SHD' ('Spatial Shielding') to AssetComponent.component_type choices.
  * Add InspectionLog.status_shielding (SHIELDING_STATUS).
  * Remove InspectionLog.status_kabel_instalasi (retired component).

Data (mirrors the 0018 backfill pattern):
  * Backfill a live SHD AssetComponent row for every non-deleted asset that lacks one,
    dated with the asset's install_date (or Jan 1 of tahun_instalasi as fallback).
  * Set status_shielding='OK' on all existing InspectionLog rows so historical records
    stay valid under the new (serializer-enforced) all-mandatory rule.
"""
import datetime
from django.db import migrations, models


COMPONENT_TYPE_CHOICES = [
    ('AT',  'Air Terminal'),
    ('DC',  'Down Conductor'),
    ('GR',  'Grounding Electrode'),
    ('BND', 'Equipotential Bonding'),
    ('SPD', 'Surge Protective Device'),
    ('SHD', 'Spatial Shielding'),
    ('EQP', 'Protected Equipment'),
]

SHIELDING_STATUS = [
    ('OK', 'OK'),
    ('Terkorosi', 'Terkorosi'),
    ('Terputus', 'Terputus'),
]


def backfill_shielding(apps, schema_editor):
    AssetRegistry = apps.get_model('core', 'AssetRegistry')
    AssetComponent = apps.get_model('core', 'AssetComponent')
    InspectionLog = apps.get_model('core', 'InspectionLog')

    # 1. Live SHD component for every non-deleted asset lacking one.
    for asset in AssetRegistry.objects.filter(deleted_at__isnull=True):
        install_date = asset.tanggal_instalasi or datetime.date(asset.tahun_instalasi, 1, 1)
        exists = AssetComponent.objects.filter(
            asset=asset, component_type='SHD',
            end_date__isnull=True, deleted_at__isnull=True,
        ).exists()
        if not exists:
            AssetComponent.objects.create(
                asset=asset, component_type='SHD', install_date=install_date,
            )

    # 2. Backfill status_shielding='OK' on existing inspection rows.
    InspectionLog.objects.filter(status_shielding='').update(status_shielding='OK')


def reverse_backfill(apps, schema_editor):
    AssetComponent = apps.get_model('core', 'AssetComponent')
    AssetComponent.objects.filter(component_type='SHD').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_assetregistry_predecessor'),
    ]

    operations = [
        migrations.AlterField(
            model_name='assetcomponent',
            name='component_type',
            field=models.CharField(max_length=3, choices=COMPONENT_TYPE_CHOICES),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='status_shielding',
            field=models.CharField(
                max_length=20, choices=SHIELDING_STATUS, blank=True, default='',
            ),
        ),
        migrations.RemoveField(
            model_name='inspectionlog',
            name='status_kabel_instalasi',
        ),
        migrations.RunPython(backfill_shielding, reverse_code=reverse_backfill),
    ]
