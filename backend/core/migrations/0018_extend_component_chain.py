"""
0018_extend_component_chain

Schema: bump AssetComponent.component_type max_length 2 → 3 and add BND/SPD/EQP choices.
Data:   backfill BND, SPD, EQP rows for every existing non-deleted asset that lacks them,
        using the asset's install_date (or Jan 1 of tahun_instalasi as fallback).
"""
import datetime
import django.db.models.deletion
from django.db import migrations, models


def backfill_new_components(apps, schema_editor):
    AssetRegistry = apps.get_model('core', 'AssetRegistry')
    AssetComponent = apps.get_model('core', 'AssetComponent')

    new_types = ('BND', 'SPD', 'EQP')

    for asset in AssetRegistry.objects.filter(deleted_at__isnull=True):
        install_date = asset.tanggal_instalasi or datetime.date(asset.tahun_instalasi, 1, 1)
        for ct in new_types:
            exists = AssetComponent.objects.filter(
                asset=asset, component_type=ct,
                end_date__isnull=True, deleted_at__isnull=True,
            ).exists()
            if not exists:
                AssetComponent.objects.create(
                    asset=asset, component_type=ct, install_date=install_date,
                )


def reverse_backfill(apps, schema_editor):
    AssetComponent = apps.get_model('core', 'AssetComponent')
    AssetComponent.objects.filter(component_type__in=('BND', 'SPD', 'EQP')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_add_uniq_live_asset_name_per_org'),
    ]

    operations = [
        # 1. Widen the column and update choices
        migrations.AlterField(
            model_name='assetcomponent',
            name='component_type',
            field=models.CharField(
                max_length=3,
                choices=[
                    ('AT',  'Air Terminal'),
                    ('DC',  'Down Conductor'),
                    ('GR',  'Grounding Electrode'),
                    ('BND', 'Equipotential Bonding'),
                    ('SPD', 'Surge Protective Device'),
                    ('EQP', 'Protected Equipment'),
                ],
            ),
        ),
        # 2. Backfill existing assets with the three new component rows
        migrations.RunPython(backfill_new_components, reverse_code=reverse_backfill),
    ]
