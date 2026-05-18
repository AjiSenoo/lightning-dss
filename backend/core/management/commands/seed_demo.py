from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Organization, AssetRegistry, LightningEvent, Notification, User, InspectionLog, InspectionLogAudit


ORG_A = {
    'nama': 'Pertamina Group',
    'alamat': 'Jl. Merdeka Barat No. 12, Jakarta Pusat',
}

ORG_B = {
    'nama': 'PLN & Institusi',
    'alamat': 'Jl. Trunojoyo Blok M-1 No. 135, Jakarta Selatan',
}

ASSETS_ORG_A = [
    {
        'nama_gedung': 'Kilang Balongan - Unit Distilasi',
        'lokasi_gps': '-6.3413, 108.3476',
        'lpl_grade': 'I',
        'tahun_instalasi': 2015,
        'resistivitas_tanah': 25.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Fasilitas pengolahan minyak bumi, LPS dipasang sesuai standar IEC 62305.',
    },
    {
        'nama_gedung': 'Tangki LPG Cilacap',
        'lokasi_gps': '-7.7268, 109.0154',
        'lpl_grade': 'I',
        'tahun_instalasi': 2000,
        'resistivitas_tanah': 6.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Tangki penyimpanan LPG, resistivitas tanah sangat rendah (6.0 Ω·m) → korosi agresif.',
    },
    {
        'nama_gedung': 'Menara BTS Cinere',
        'lokasi_gps': '-6.3335, 106.7860',
        'lpl_grade': 'IV',
        'tahun_instalasi': 2005,
        'resistivitas_tanah': 8.5,
        'jenis_material_konduktor': 'Aluminium',
        'catatan': 'Resistivitas tanah rendah (8.5 Ω·m) → korosi aktif. Perlu pengecekan berkala.',
    },
]

ASSETS_ORG_B = [
    {
        'nama_gedung': 'Gardu Induk PLN Suralaya',
        'lokasi_gps': '-6.0095, 106.0375',
        'lpl_grade': 'II',
        'tahun_instalasi': 2018,
        'resistivitas_tanah': 15.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Gardu induk 500kV, area terbuka tinggi.',
    },
    {
        'nama_gedung': 'Gedung Lab STEI ITB',
        'lokasi_gps': '-6.8912, 107.6107',
        'lpl_grade': 'III',
        'tahun_instalasi': 2020,
        'resistivitas_tanah': 30.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Gedung laboratorium elektronika dan informatika.',
    },
]


class Command(BaseCommand):
    help = 'Seed the database with two demo organizations, assets, and users'

    def handle(self, *args, **options):
        self.stdout.write('Seeding demo data...')

        # Organizations
        org_a, created = Organization.objects.get_or_create(nama=ORG_A['nama'], defaults=ORG_A)
        self.stdout.write(f'  {"Created" if created else "Exists"} org: {org_a.nama}')

        org_b, created = Organization.objects.get_or_create(nama=ORG_B['nama'], defaults=ORG_B)
        self.stdout.write(f'  {"Created" if created else "Exists"} org: {org_b.nama}')

        # Users — Org A
        teknisi, created = User.objects.get_or_create(
            username='teknisi',
            defaults={
                'nama_lengkap': 'Teknisi Demo',
                'role': 'Teknisi',
                'email': 'teknisi@pertamina.example',
                'organization': org_a,
            },
        )
        if not created:
            teknisi.organization = org_a
        teknisi.set_password('teknisi123')
        teknisi.save()
        self.stdout.write(f'  {"Created" if created else "Updated"} user: teknisi / teknisi123 ({org_a.nama})')

        manager, created = User.objects.get_or_create(
            username='manager',
            defaults={
                'nama_lengkap': 'Manajer Pertamina',
                'role': 'Manajer',
                'email': 'manager@pertamina.example',
                'is_staff': True,
                'organization': org_a,
            },
        )
        if not created:
            manager.organization = org_a
        manager.set_password('manager123')
        manager.save()
        self.stdout.write(f'  {"Created" if created else "Updated"} user: manager / manager123 ({org_a.nama})')

        # Users — Org B
        teknisi2, created = User.objects.get_or_create(
            username='teknisi2',
            defaults={
                'nama_lengkap': 'Teknisi PLN',
                'role': 'Teknisi',
                'email': 'teknisi2@pln.example',
                'organization': org_b,
            },
        )
        if not created:
            teknisi2.organization = org_b
        teknisi2.set_password('teknisi456')
        teknisi2.save()
        self.stdout.write(f'  {"Created" if created else "Updated"} user: teknisi2 / teknisi456 ({org_b.nama})')

        manager2, created = User.objects.get_or_create(
            username='manager2',
            defaults={
                'nama_lengkap': 'Manajer PLN',
                'role': 'Manajer',
                'email': 'manager2@pln.example',
                'organization': org_b,
            },
        )
        if not created:
            manager2.organization = org_b
        manager2.set_password('manager456')
        manager2.save()
        self.stdout.write(f'  {"Created" if created else "Updated"} user: manager2 / manager456 ({org_b.nama})')

        # Assets — Org A
        for asset_data in ASSETS_ORG_A:
            asset, created = AssetRegistry.objects.get_or_create(
                nama_gedung=asset_data['nama_gedung'],
                defaults={**asset_data, 'organization': org_a},
            )
            if not created and asset.organization_id != org_a.pk:
                asset.organization = org_a
                asset.save()
            self.stdout.write(f'  {"Created" if created else "Exists"} asset [{org_a.nama}]: {asset.nama_gedung}')

        # Assets — Org B
        for asset_data in ASSETS_ORG_B:
            asset, created = AssetRegistry.objects.get_or_create(
                nama_gedung=asset_data['nama_gedung'],
                defaults={**asset_data, 'organization': org_b},
            )
            if not created and asset.organization_id != org_b.pk:
                asset.organization = org_b
                asset.save()
            self.stdout.write(f'  {"Created" if created else "Exists"} asset [{org_b.nama}]: {asset.nama_gedung}')

        # ── Demo Laporan ────────────────────────────────────────────────────────
        if InspectionLog.objects.filter(catatan_teknisi__startswith='[DEMO]').exists():
            self.stdout.write('  Demo laporan already seeded, skipping.')
        else:
            self._seed_laporan(teknisi, manager)

        # ── Demo Notifications ───────────────────────────────────────────────
        if Notification.objects.filter(inspection__catatan_teknisi__startswith='[DEMO]').exists() \
                or Notification.objects.filter(verb__in=['lightning', 'stale_asset']).exists():
            self.stdout.write('  Demo notifications already seeded, skipping.')
        else:
            self._seed_notifications(teknisi, manager)

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! {Organization.objects.count()} orgs, '
            f'{AssetRegistry.objects.count()} assets, '
            f'{User.objects.count()} users, '
            f'{InspectionLog.objects.count()} inspection logs.'
        ))
        self.stdout.write('\nDemo credentials:')
        self.stdout.write(f'  Org A ({org_a.nama}): manager/manager123, teknisi/teknisi123')
        self.stdout.write(f'  Org B ({org_b.nama}): manager2/manager456, teknisi2/teknisi456')

    def _seed_laporan(self, teknisi, manager):
        now = timezone.now()

        kilang  = AssetRegistry.objects.get(nama_gedung='Kilang Balongan - Unit Distilasi')
        tangki  = AssetRegistry.objects.get(nama_gedung='Tangki LPG Cilacap')
        menara  = AssetRegistry.objects.get(nama_gedung='Menara BTS Cinere')

        # ── Log 1: Laporan biasa — all OK ───────────────────────────────────
        log1 = InspectionLog.objects.create(
            asset=kilang, user=teknisi,
            tgl_inspeksi=now - timedelta(days=3),
            status_air_terminal='OK', status_down_conductor='OK',
            status_grounding='OK', resistansi_grounding_ohm=4.2,
            catatan_teknisi='[DEMO] Inspeksi rutin. Semua komponen dalam kondisi baik.',
            updated_by=teknisi,
        )
        InspectionLog.objects.filter(pk=log1.pk).update(created_at=now - timedelta(days=3))
        a1 = InspectionLogAudit.objects.create(
            inspection=log1, actor=teknisi, action='create',
            note='Inspeksi baru dibuat',
            diff={f: {'old': None, 'new': str(getattr(log1, f)) if getattr(log1, f) is not None else None}
                  for f in ['tgl_inspeksi','status_air_terminal','status_down_conductor',
                             'status_grounding','resistansi_grounding_ohm','catatan_teknisi']},
        )
        InspectionLogAudit.objects.filter(pk=a1.pk).update(at=now - timedelta(days=3))

        # Verify log1 by manager (backdated 3 days, +2 hours after creation)
        verify_at = now - timedelta(days=3) + timedelta(hours=2)
        InspectionLog.objects.filter(pk=log1.pk).update(
            verified_at=verify_at, verified_by=manager,
        )
        log1.refresh_from_db()
        a1v = InspectionLogAudit.objects.create(
            inspection=log1, actor=manager, action='verify',
            diff={},
            note='Laporan diverifikasi oleh Manajer (permanen)',
        )
        InspectionLogAudit.objects.filter(pk=a1v.pk).update(at=verify_at)
        self.stdout.write('  Created demo log 1: Laporan Biasa (Kilang Balongan) — Terverifikasi')

        # ── Log 2: Laporan dengan edit + revisi diminta ──────────────────────
        catatan_awal   = '[DEMO] Ditemukan resistansi grounding tinggi. Segera periksa sambungan.'
        catatan_edited = '[DEMO] Ditemukan resistansi grounding tinggi. Segera periksa sambungan. Perlu tindak lanjut.'
        log2 = InspectionLog.objects.create(
            asset=kilang, user=teknisi,
            tgl_inspeksi=now - timedelta(days=5),
            status_air_terminal='OK', status_down_conductor='OK',
            status_grounding='High_Resistance', resistansi_grounding_ohm=18.7,
            catatan_teknisi=catatan_edited,
            updated_by=manager,
        )
        InspectionLog.objects.filter(pk=log2.pk).update(created_at=now - timedelta(days=5))
        a2a = InspectionLogAudit.objects.create(
            inspection=log2, actor=teknisi, action='create',
            note='Inspeksi baru dibuat',
            diff={},
        )
        InspectionLogAudit.objects.filter(pk=a2a.pk).update(at=now - timedelta(days=5))
        a2b = InspectionLogAudit.objects.create(
            inspection=log2, actor=manager, action='update',
            note='Log diperbarui dalam masa grace',
            diff={'catatan_teknisi': {'old': catatan_awal, 'new': catatan_edited}},
        )
        InspectionLogAudit.objects.filter(pk=a2b.pk).update(at=now - timedelta(days=5) + timedelta(minutes=4))

        # Set log2 to Revisi Diminta
        revision_note = 'Mohon lampirkan foto sambungan grounding yang baru.'
        revision_at = now - timedelta(days=4)
        InspectionLog.objects.filter(pk=log2.pk).update(
            revision_requested_at=revision_at,
            revision_requested_by=manager,
            revision_request_note=revision_note,
        )
        a2r = InspectionLogAudit.objects.create(
            inspection=log2, actor=manager, action='request_revision',
            diff={'note': {'old': None, 'new': revision_note}},
            note=f'Revisi diminta: {revision_note[:120]}',
        )
        InspectionLogAudit.objects.filter(pk=a2r.pk).update(at=revision_at)
        self.stdout.write('  Created demo log 2: Laporan Dengan Edit (Kilang Balongan) — Revisi Diminta')

        # ── Log 3: Original + amandemen ─────────────────────────────────────
        log3_orig = InspectionLog.objects.create(
            asset=tangki, user=teknisi,
            tgl_inspeksi=now - timedelta(days=10),
            status_air_terminal='Rusak', status_down_conductor='OK',
            status_grounding='Terkorosi', resistansi_grounding_ohm=22.0,
            catatan_teknisi='[DEMO] Air terminal rusak dan grounding terkorosi. Perlu perbaikan segera.',
            updated_by=teknisi,
        )
        InspectionLog.objects.filter(pk=log3_orig.pk).update(created_at=now - timedelta(days=10))

        log3_amend = InspectionLog.objects.create(
            asset=tangki, user=manager,
            tgl_inspeksi=now - timedelta(days=8),
            status_air_terminal='Rusak', status_down_conductor='OK',
            status_grounding='Terkorosi', resistansi_grounding_ohm=19.5,
            catatan_teknisi='[DEMO] Amandemen: koreksi nilai resistansi grounding dari 22.0 ke 19.5 Ω. —Manajer',
            amends=log3_orig,
            updated_by=manager,
        )
        InspectionLog.objects.filter(pk=log3_amend.pk).update(created_at=now - timedelta(days=8))

        a3a = InspectionLogAudit.objects.create(
            inspection=log3_orig, actor=teknisi, action='create',
            note='Inspeksi baru dibuat', diff={},
        )
        InspectionLogAudit.objects.filter(pk=a3a.pk).update(at=now - timedelta(days=10))

        a3b = InspectionLogAudit.objects.create(
            inspection=log3_orig, actor=manager, action='amended_by',
            diff={'target_log_id': str(log3_amend.log_id)},
            note=f'Log ini diamandemen menjadi log {str(log3_amend.log_id)[:8]}',
        )
        InspectionLogAudit.objects.filter(pk=a3b.pk).update(at=now - timedelta(days=8))

        a3c = InspectionLogAudit.objects.create(
            inspection=log3_amend, actor=manager, action='amend',
            diff={
                'target_log_id': str(log3_orig.log_id),
                'resistansi_grounding_ohm': {'old': '22.0', 'new': '19.5'},
            },
            note=f'Amandemen dari log {str(log3_orig.log_id)[:8]}',
        )
        InspectionLogAudit.objects.filter(pk=a3c.pk).update(at=now - timedelta(days=8))
        self.stdout.write('  Created demo log 3: Original + Amandemen (Tangki LPG Cilacap)')

        # ── Log 4: Di Tempat Sampah ──────────────────────────────────────────
        log4 = InspectionLog.objects.create(
            asset=menara, user=teknisi,
            tgl_inspeksi=now - timedelta(days=15),
            status_air_terminal='OK', status_down_conductor='OK',
            status_grounding='OK', resistansi_grounding_ohm=7.1,
            catatan_teknisi='[DEMO] Inspeksi ini telah dihapus ke Tempat Sampah untuk keperluan demo.',
            deleted_at=now - timedelta(days=2),
            deleted_by=manager,
            updated_by=teknisi,
        )
        InspectionLog.objects.filter(pk=log4.pk).update(created_at=now - timedelta(days=15))

        a4a = InspectionLogAudit.objects.create(
            inspection=log4, actor=teknisi, action='create',
            note='Inspeksi baru dibuat', diff={},
        )
        InspectionLogAudit.objects.filter(pk=a4a.pk).update(at=now - timedelta(days=15))

        purge_date = (now - timedelta(days=2) + timedelta(days=7)).date()
        a4b = InspectionLogAudit.objects.create(
            inspection=log4, actor=manager, action='delete',
            note=f'Dipindah ke Tempat Sampah; akan dihapus permanen pada {purge_date}',
        )
        InspectionLogAudit.objects.filter(pk=a4b.pk).update(at=now - timedelta(days=2))
        self.stdout.write('  Created demo log 4: Di Tempat Sampah (Menara BTS Cinere)')

    def _seed_notifications(self, teknisi, manager):
        now = timezone.now()
        kilang = AssetRegistry.objects.get(nama_gedung='Kilang Balongan - Unit Distilasi')
        menara = AssetRegistry.objects.get(nama_gedung='Menara BTS Cinere')

        log1      = InspectionLog.objects.filter(asset=kilang, catatan_teknisi__startswith='[DEMO] Inspeksi rutin').first()
        log3_orig = InspectionLog.objects.filter(asset__nama_gedung='Tangki LPG Cilacap',
                                                  catatan_teknisi__contains='Air terminal rusak').first()
        log4      = InspectionLog.objects.filter(asset=menara, deleted_at__isnull=False).first()

        # ── 3 laporan notifications for manager (2 unread, 1 read) ──────────
        if log1:
            n1 = Notification.objects.create(
                recipient=manager, actor=teknisi, verb='create', inspection=log1,
            )
            Notification.objects.filter(pk=n1.pk).update(created_at=now - timedelta(days=3))

        if log3_orig:
            n2 = Notification.objects.create(
                recipient=manager, actor=teknisi, verb='create', inspection=log3_orig,
            )
            Notification.objects.filter(pk=n2.pk).update(created_at=now - timedelta(days=10))

        if log4:
            n3 = Notification.objects.create(
                recipient=manager, actor=teknisi, verb='create', inspection=log4,
                read_at=now - timedelta(days=14),
            )
            Notification.objects.filter(pk=n3.pk).update(created_at=now - timedelta(days=15))

        self.stdout.write('  Created demo laporan notifications for manager (2 unread, 1 read)')

        # ── 1 lightning notification for teknisi ────────────────────────────
        demo_event, event_created = LightningEvent.objects.get_or_create(
            asset=kilang,
            catatan='[DEMO] Kejadian petir terdeteksi selama badai.',
            defaults={
                'timestamp': now - timedelta(hours=6),
                'estimasi_arus_puncak_ka': 85.0,
                'created_by': manager,
            },
        )
        if event_created:
            LightningEvent.objects.filter(pk=demo_event.pk).update(created_at=now - timedelta(hours=6))

        n4 = Notification.objects.create(
            recipient=teknisi, actor=manager, verb='lightning', event=demo_event,
        )
        Notification.objects.filter(pk=n4.pk).update(created_at=now - timedelta(hours=6))
        self.stdout.write('  Created demo lightning notification for teknisi (1 unread)')

        # ── 1 stale-asset notification for manager ───────────────────────────
        n5 = Notification.objects.create(
            recipient=manager, actor=None, verb='stale_asset', asset=menara,
        )
        Notification.objects.filter(pk=n5.pk).update(created_at=now - timedelta(hours=1))
        # Rate-limit so a manual check_stale_inspections run respects the cooldown
        AssetRegistry.objects.filter(pk=menara.pk).update(last_stale_notified_at=now)
        self.stdout.write('  Created demo stale-asset notification for manager (1 unread)')

        # ── Verify + Revisi notifications for teknisi ────────────────────────
        log2 = InspectionLog.objects.filter(
            asset=kilang, catatan_teknisi__contains='Perlu tindak lanjut'
        ).first()

        if log1:
            # read — manager verified log1 (teknisi is creator → receives notification)
            n6 = Notification.objects.create(
                recipient=teknisi, actor=manager, verb='verify', inspection=log1,
                read_at=now - timedelta(days=3) + timedelta(hours=3),
            )
            Notification.objects.filter(pk=n6.pk).update(
                created_at=now - timedelta(days=3) + timedelta(hours=2)
            )

        if log2:
            # unread — manager requested revision on log2
            n7 = Notification.objects.create(
                recipient=teknisi, actor=manager, verb='request_revision', inspection=log2,
            )
            Notification.objects.filter(pk=n7.pk).update(created_at=now - timedelta(days=4))

        self.stdout.write('  Created demo verify + request_revision notifications for teknisi (1 unread)')
