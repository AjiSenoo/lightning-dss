from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_inspection_log_one_amendment_per_original'),
    ]

    operations = [
        migrations.AddField(
            model_name='assetregistry',
            name='health_recomputed_at',
            field=models.DateTimeField(
                blank=True, db_index=True, null=True,
                help_text='When skor_kesehatan_aset was last synced from AHI. Drives lazy refresh TTL.',
            ),
        ),
        migrations.AlterField(
            model_name='assetregistry',
            name='skor_kesehatan_aset',
            field=models.FloatField(
                default=1.0,
                help_text='Cached AHI_safety (stress + physical + age). Synced via recompute_health(); see health_recomputed_at.',
            ),
        ),
    ]
