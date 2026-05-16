from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


def backfill_audit(apps, schema_editor):
    InspectionLog = apps.get_model('core', 'InspectionLog')
    InspectionLogAudit = apps.get_model('core', 'InspectionLogAudit')
    rows = []
    for log in InspectionLog.objects.select_related('user').all():
        rows.append(InspectionLogAudit(
            audit_id=uuid.uuid4(),
            inspection=log,
            actor=log.user,
            action='create',
            diff={},
            note='Backfilled from existing log',
            at=log.created_at,
        ))
    InspectionLogAudit.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_alter_user_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='inspectionlog',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='updated_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='inspections_last_edited',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='deleted_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='inspectionlog',
            name='deleted_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='inspections_deleted',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name='InspectionLogAudit',
            fields=[
                ('audit_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(choices=[
                    ('create', 'Created'),
                    ('update', 'Edited'),
                    ('amend', 'Amended'),
                    ('amended_by', 'Amended By'),
                    ('photo_added', 'Photo Added'),
                    ('delete', 'Soft-deleted'),
                    ('restore', 'Restored'),
                    ('purge', 'Hard-deleted'),
                ], max_length=20)),
                ('diff', models.JSONField(blank=True, default=dict)),
                ('note', models.CharField(blank=True, default='', max_length=255)),
                ('at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('actor', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='audit_actions',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('inspection', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='audit_trail',
                    to='core.inspectionlog',
                )),
            ],
            options={
                'db_table': 'inspection_log_audit',
                'ordering': ['-at'],
                'indexes': [models.Index(fields=['inspection', '-at'], name='audit_inspection_at_idx')],
            },
        ),
        migrations.RunPython(backfill_audit, migrations.RunPython.noop),
    ]
