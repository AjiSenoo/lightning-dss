"""
Data migration: cabut verifikasi pada laporan yang diedit setelah diverifikasi.

Hanya laporan yang memenuhi KEDUA kondisi berikut yang dicabut verifikasinya:
  1. updated_at > verified_at (field-level detection)
  2. Ada audit entry action='update' dengan at > verified_at (konfirmasi real content edit)

Kondisi (2) mencegah false-positive pada laporan yang hanya di-restore
(yang juga mengubah updated_at tanpa mengubah konten).

Audit entry action='verify' lama TIDAK disentuh — tetap menjadi bukti
timeline "pernah diverifikasi oleh siapa dan kapan".

REVERSE: noop — data loss bila dibalik (verified_at sudah dihapus).
"""
from django.db import migrations


def revoke_legacy_edited_after_verify(apps, schema_editor):
    InspectionLog = apps.get_model('core', 'InspectionLog')
    InspectionLogAudit = apps.get_model('core', 'InspectionLogAudit')

    qs = InspectionLog.objects.select_for_update().filter(verified_at__isnull=False)
    for log in qs.iterator(chunk_size=500):
        if not (log.updated_at and log.updated_at > log.verified_at):
            continue
        has_update_audit = InspectionLogAudit.objects.filter(
            inspection=log,
            action='update',
            at__gt=log.verified_at,
        ).exists()
        if not has_update_audit:
            continue
        InspectionLogAudit.objects.create(
            inspection=log,
            actor=None,
            action='revoke_verification',
            diff={
                'legacy_migration': True,
                'verified_at_before': log.verified_at.isoformat(),
                'verified_by_id_before': str(log.verified_by_id) if log.verified_by_id else None,
            },
            note='Pencabutan otomatis: data legacy yang diedit setelah verifikasi (migration 0009)',
        )
        log.verified_at = None
        log.verified_by_id = None
        log.save(update_fields=['verified_at', 'verified_by_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_add_revoke_verification_action'),
    ]

    operations = [
        migrations.RunPython(
            revoke_legacy_edited_after_verify,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
