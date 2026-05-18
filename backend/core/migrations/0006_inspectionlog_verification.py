from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_notification_stale_field'),
    ]

    operations = [
        migrations.AddField(
            model_name='inspectionlog',
            name='verified_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='verified_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='inspections_verified',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='revision_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='revision_requested_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='inspections_revision_requested',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='revision_request_note',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AlterField(
            model_name='inspectionlogaudit',
            name='action',
            field=models.CharField(
                choices=[
                    ('create', 'Created'),
                    ('update', 'Edited'),
                    ('amend', 'Amended'),
                    ('amended_by', 'Amended By'),
                    ('photo_added', 'Photo Added'),
                    ('delete', 'Soft-deleted'),
                    ('restore', 'Restored'),
                    ('purge', 'Hard-deleted'),
                    ('verify', 'Verified'),
                    ('request_revision', 'Revision Requested'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='notification',
            name='verb',
            field=models.CharField(
                choices=[
                    ('create', 'Created'),
                    ('update', 'Edited'),
                    ('amend', 'Amended'),
                    ('delete', 'Soft-deleted'),
                    ('restore', 'Restored'),
                    ('lightning', 'Lightning recorded'),
                    ('stale_asset', 'Asset overdue for inspection'),
                    ('verify', 'Verified'),
                    ('request_revision', 'Revision Requested'),
                ],
                max_length=20,
            ),
        ),
    ]
