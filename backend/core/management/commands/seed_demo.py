import os
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import (
    Organization, AssetRegistry, AssetAudit, LightningEvent, Notification,
    User, InspectionLog, InspectionLogAudit, ComponentMaintenanceAction,
)
from fuzzy_engine.health_index import per_event_damage
from fuzzy_engine import fuzzy_config as cfg


# ─────────────────────────────────────────────────────────────────────────────
# Organizations
# ─────────────────────────────────────────────────────────────────────────────
ORG_A = {
    'nama': 'Pertamina Group',
    'alamat': 'Jl. Merdeka Barat No. 12, Jakarta Pusat',
}
ORG_B = {
    'nama': 'PLN & Institusi',
    'alamat': 'Jl. Trunojoyo Blok M-1 No. 135, Jakarta Selatan',
}


# ─────────────────────────────────────────────────────────────────────────────
# Showcase assets — Org A holds four assets engineered to sit deterministically
# in each of the four health bands (Baik / Waspada / Bahaya / Kritis). The band
# is driven by the weakest component's AHI (min), which the *latest* inspection's
# per-component status sets. Component ages derive from `tahun_instalasi`
# (Jan 1 of that year) via AssetRegistry._ensure_default_components().
#
# Each asset also covers additional demo cases:
#   • report state   — verified / revision-requested / amendment / trashed
#   • event bands     — kecil <10, sedang_kecil 10–30, sedang 30–50, besar ≥50
#   • corrosion flag  — Bahaya asset: soil resistivity < 10 Ω·m on GR
#   • stale flag      — Bahaya asset: last inspection > 30 days ago
# ─────────────────────────────────────────────────────────────────────────────

# 🟢 BAIK (≥0.85): young, all components OK, only small strikes.
ASSET_BAIK = {
    'nama_gedung': 'Kantor Pusat Pertamina - Gedung Utama',
    'lokasi_gps': '-6.1754, 106.8272',
    'lpl_grade': 'II',
    'tahun_instalasi': 2023,
    'resistivitas_tanah': 50.0,
    'jenis_material_konduktor': 'Tembaga',
    'catatan': 'Instalasi baru (2023), semua komponen prima. Contoh aset kondisi BAIK.',
}

# 🟠 WASPADA (0.70–0.85): mid-life, one minor (non-fatal) down-conductor finding.
ASSET_WASPADA = {
    'nama_gedung': 'Kilang Balongan - Unit Distilasi',
    'lokasi_gps': '-6.3413, 108.3476',
    'lpl_grade': 'I',
    'tahun_instalasi': 2020,
    'resistivitas_tanah': 35.0,
    'jenis_material_konduktor': 'Tembaga',
    'catatan': 'Klem down-conductor mulai lepas (belum putus). Contoh aset kondisi WASPADA.',
}

# 🔴 BAHAYA (0.50–0.70): aged, SPD terdegradasi + grounding terkorosi, tanah
# korosif (6 Ω·m), dan sudah lewat jadwal inspeksi (STALE).
ASSET_BAHAYA = {
    'nama_gedung': 'Tangki LPG Cilacap',
    'lokasi_gps': '-7.7268, 109.0154',
    'lpl_grade': 'III',
    'tahun_instalasi': 2011,
    'resistivitas_tanah': 6.0,
    'jenis_material_konduktor': 'Tembaga',
    'catatan': 'SPD terdegradasi, grounding terkorosi, tanah korosif (6 Ω·m). Contoh aset kondisi BAHAYA + terlambat inspeksi.',
}

# 🟣 KRITIS (<0.50): air terminal RUSAK (hard-fail → AHI 0) plus multiple faults.
ASSET_KRITIS = {
    'nama_gedung': 'Menara BTS Cinere',
    'lokasi_gps': '-6.3335, 106.7860',
    'lpl_grade': 'I',
    'tahun_instalasi': 2009,
    'resistivitas_tanah': 12.0,
    'jenis_material_konduktor': 'Aluminium',
    'catatan': 'Air terminal rusak (kegagalan fungsional) disertai kerusakan majemuk. Contoh aset kondisi KRITIS.',
}

ASSETS_ORG_A = [ASSET_BAIK, ASSET_WASPADA, ASSET_BAHAYA, ASSET_KRITIS]

# Org B — one healthy asset so the second tenant (PLN) demonstrates multi-org
# isolation and its users don't land on an empty dashboard.
ASSET_ORG_B = {
    'nama_gedung': 'Gardu Induk PLN Suralaya',
    'lokasi_gps': '-6.0095, 106.0375',
    'lpl_grade': 'III',
    'tahun_instalasi': 2022,
    'resistivitas_tanah': 45.0,
    'jenis_material_konduktor': 'Tembaga',
    'catatan': 'Gardu induk 500kV, instalasi terpelihara baik. Contoh aset organisasi kedua (PLN).',
}
ASSETS_ORG_B = [ASSET_ORG_B]


# ─────────────────────────────────────────────────────────────────────────────
# Per-asset lightning events — chosen to (a) span all four magnitude bands across
# the portfolio and (b) keep cumulative stress in the range each band assumes.
# (days_ago, i_peak_ka)
# ─────────────────────────────────────────────────────────────────────────────
EVENTS_BY_ASSET = {
    'Kantor Pusat Pertamina - Gedung Utama': [   # small only → stays BAIK
        (60, 6.0), (33, 14.0), (9, 25.0),
    ],
    'Kilang Balongan - Unit Distilasi': [        # adds a 'sedang' strike
        (72, 8.0), (40, 21.0), (18, 35.0), (5, 12.0),
    ],
    'Tangki LPG Cilacap': [                       # one 'besar' strike
        (80, 55.0), (52, 35.0), (26, 22.0), (7, 12.0),
    ],
    'Menara BTS Cinere': [                         # heavy exposure, two 'besar'
        (70, 60.0), (44, 75.0), (20, 30.0), (6, 18.0),
    ],
    'Gardu Induk PLN Suralaya': [
        (48, 9.0), (14, 16.0),
    ],
}


class Command(BaseCommand):
    help = 'Seed the database with demo orgs, users, and case-complete assets.'

    def handle(self, *args, **options):
        if os.environ.get('SEED_DEMO', '1') != '1':
            self.stdout.write('SEED_DEMO=0 — skipping demo seed.')
            return

        if AssetRegistry.objects.exists():
            self.stdout.write(self.style.WARNING(
                'Assets already present — seed_demo is designed to run on an empty DB. '
                'Run `manage.py flush` first for a clean showcase.'
            ))

        self._now = timezone.now()
        self.stdout.write('Seeding demo data...')

        # Organizations ------------------------------------------------------
        org_a, _ = Organization.objects.get_or_create(nama=ORG_A['nama'], defaults=ORG_A)
        org_b, _ = Organization.objects.get_or_create(nama=ORG_B['nama'], defaults=ORG_B)

        # Users --------------------------------------------------------------
        teknisi  = self._user('teknisi',  'Teknisi Demo',    'Teknisi', 'teknisi@pertamina.example',  'teknisi123',  org_a)
        manager  = self._user('manager',  'Manajer Pertamina','Manajer', 'manager@pertamina.example',  'manager123',  org_a, staff=True)
        teknisi2 = self._user('teknisi2', 'Teknisi PLN',      'Teknisi', 'teknisi2@pln.example',       'teknisi456',  org_b)
        manager2 = self._user('manager2', 'Manajer PLN',      'Manajer', 'manager2@pln.example',       'manager456',  org_b, staff=True)

        # Assets -------------------------------------------------------------
        assets = {}
        for data in ASSETS_ORG_A:
            assets[data['nama_gedung']] = self._asset(data, org_a, manager)
        for data in ASSETS_ORG_B:
            assets[data['nama_gedung']] = self._asset(data, org_b, manager2)

        # Lightning events (drives stress; recompute happens on each save) ----
        for name, events in EVENTS_BY_ASSET.items():
            self._seed_events(assets[name], events, creator=manager if assets[name].organization_id == org_a.pk else manager2)

        # Per-asset inspection history + the band-setting final inspection,
        # each folding in one report-state case.
        self._seed_baik(assets[ASSET_BAIK['nama_gedung']], teknisi, manager)
        self._seed_waspada(assets[ASSET_WASPADA['nama_gedung']], teknisi, manager)
        self._seed_bahaya(assets[ASSET_BAHAYA['nama_gedung']], teknisi, manager)
        self._seed_kritis(assets[ASSET_KRITIS['nama_gedung']], teknisi, manager)
        self._seed_org_b(assets[ASSET_ORG_B['nama_gedung']], teknisi2, manager2)

        # Maintenance history (per active component) -------------------------
        for asset in assets.values():
            user = teknisi if asset.organization_id == org_a.pk else teknisi2
            self._seed_maintenance(asset, user)

        # Notifications ------------------------------------------------------
        self._seed_notifications(assets, teknisi, manager)

        # Persist final band scores -----------------------------------------
        for asset in assets.values():
            asset.recompute_health()

        self._report(assets)

    # ── Builders ────────────────────────────────────────────────────────────

    def _user(self, username, nama, role, email, password, org, staff=False):
        u, created = User.objects.get_or_create(
            username=username,
            defaults={'nama_lengkap': nama, 'role': role, 'email': email,
                      'is_staff': staff, 'organization': org},
        )
        u.nama_lengkap = nama
        u.role = role
        u.email = email
        u.is_staff = staff
        u.organization = org
        u.set_password(password)
        u.save()
        self.stdout.write(f'  {"Created" if created else "Updated"} user: {username} / {password} ({org.nama})')
        return u

    def _asset(self, data, org, actor):
        asset, created = AssetRegistry.objects.get_or_create(
            nama_gedung=data['nama_gedung'], organization=org, deleted_at__isnull=True,
            defaults=data,
        )
        if created:
            AssetAudit.objects.create(
                asset=asset, actor=actor, action='create',
                diff={'nama_gedung': asset.nama_gedung, 'lpl_grade': asset.lpl_grade},
                note='Aset baru ditambahkan',
            )
        self.stdout.write(f'  {"Created" if created else "Exists"} asset [{org.nama}]: {asset.nama_gedung}')
        return asset

    def _seed_events(self, asset, events, creator):
        from fuzzy_engine import calculate_asset_health, run_inference_per_component
        for days_ago, i_peak in events:
            ts = self._now - timedelta(days=days_ago)
            event = LightningEvent.objects.create(
                asset=asset, timestamp=ts, estimasi_arus_puncak_ka=i_peak,
                created_by=creator,
                catatan=f'[DEMO] Sambaran {i_peak:.0f} kA ({cfg.classify_magnitude_ka(i_peak)})',
            )
            LightningEvent.objects.filter(pk=event.pk).update(created_at=ts)
            try:
                health = calculate_asset_health(asset)
                ahi_by_type = {ct: r['ahi'] for ct, r in health['per_component'].items()}
                fuzzy = run_inference_per_component(event.rasio_stres, ahi_by_type)['asset']
                event.fuzzy_output_score = fuzzy['score']
                event.fuzzy_output_label = fuzzy['label']
                event.save(update_fields=['fuzzy_output_score', 'fuzzy_output_label'])
            except Exception as exc:
                self.stdout.write(f'  Warning: fuzzy inference skipped: {exc}')
        self.stdout.write(f'  Seeded {len(events)} events for {asset.nama_gedung}')

    def _mk_log(self, asset, user, days_ago, statuses, note, updated_by=None,
                minutes_ago=0, amends=None):
        """Create an InspectionLog, backdate it, snapshot its point-in-time health,
        and record a 'create' audit. Returns the log."""
        tgl = self._now - timedelta(days=days_ago, minutes=minutes_ago)
        log = InspectionLog.objects.create(
            asset=asset, user=user, tgl_inspeksi=tgl,
            status_air_terminal=statuses.get('AT', 'OK'),
            status_down_conductor=statuses.get('DC', 'OK'),
            status_grounding=statuses.get('GR', 'OK'),
            resistansi_grounding_ohm=statuses.get('res', 4.5),
            status_spd=statuses.get('SPD', 'OK'),
            arus_bocor_spd_ma=statuses.get('arus', 0.2),
            status_bonding=statuses.get('BND', 'OK'),
            status_shielding=statuses.get('SHD', 'OK'),
            catatan_teknisi=note,
            updated_by=updated_by or user,
            amends=amends,
        )
        InspectionLog.objects.filter(pk=log.pk).update(created_at=tgl)
        snap = self._snapshot_health(asset, log, as_of=tgl)
        if snap is not None:
            InspectionLog.objects.filter(pk=log.pk).update(health_after=snap)
        audit = InspectionLogAudit.objects.create(
            inspection=log, actor=user, action='create', diff={},
            note='Inspeksi baru dibuat',
        )
        InspectionLogAudit.objects.filter(pk=audit.pk).update(at=tgl)
        return log

    def _history(self, asset, user, specs):
        """Seed benign older inspections (for trend charts). specs: [(days_ago, statuses)]."""
        for days_ago, st in specs:
            self._mk_log(asset, user, days_ago, st,
                         note=f'[DEMO] Inspeksi rutin { (self._now - timedelta(days=days_ago)).date() }.')

    # ── Band 🟢 BAIK — verified routine inspection ───────────────────────────
    def _seed_baik(self, asset, teknisi, manager):
        self._history(asset, teknisi, [(70, {}), (35, {})])
        log = self._mk_log(
            asset, teknisi, days_ago=4,
            statuses={'AT': 'OK', 'DC': 'OK', 'GR': 'OK', 'res': 3.8,
                      'SPD': 'OK', 'arus': 0.15, 'BND': 'OK', 'SHD': 'OK'},
            note='[DEMO] Inspeksi rutin. Semua komponen dalam kondisi baik.',
        )
        # Manager verifies (permanent) ~2h after creation.
        verify_at = log.tgl_inspeksi + timedelta(hours=2)
        InspectionLog.objects.filter(pk=log.pk).update(verified_at=verify_at, verified_by=manager)
        av = InspectionLogAudit.objects.create(
            inspection=log, actor=manager, action='verify', diff={},
            note='Laporan diverifikasi oleh Manajer (permanen)',
        )
        InspectionLogAudit.objects.filter(pk=av.pk).update(at=verify_at)
        self.stdout.write('  🟢 BAIK: Kantor Pusat — inspeksi Terverifikasi')

    # ── Band 🟠 WASPADA — revision requested ──────────────────────────────────
    def _seed_waspada(self, asset, teknisi, manager):
        self._history(asset, teknisi, [(66, {}), (30, {'DC': 'OK'})])
        log = self._mk_log(
            asset, teknisi, days_ago=6,
            statuses={'AT': 'OK', 'DC': 'Klem_Lepas', 'GR': 'OK', 'res': 4.6,
                      'SPD': 'OK', 'arus': 0.35, 'BND': 'OK', 'SHD': 'OK'},
            note='[DEMO] Klem down-conductor mulai lepas. Perlu tindak lanjut.',
        )
        note = 'Mohon lampirkan foto klem down-conductor yang lepas.'
        req_at = log.tgl_inspeksi + timedelta(hours=5)
        InspectionLog.objects.filter(pk=log.pk).update(
            revision_requested_at=req_at, revision_requested_by=manager,
            revision_request_note=note,
        )
        ar = InspectionLogAudit.objects.create(
            inspection=log, actor=manager, action='request_revision',
            diff={'note': {'old': None, 'new': note}},
            note=f'Revisi diminta: {note}',
        )
        InspectionLogAudit.objects.filter(pk=ar.pk).update(at=req_at)
        self.stdout.write('  🟠 WASPADA: Kilang Balongan — inspeksi Revisi Diminta')

    # ── Band 🔴 BAHAYA — original + amendment, corrosive soil, stale ─────────
    def _seed_bahaya(self, asset, teknisi, manager):
        self._history(asset, teknisi, [(120, {'GR': 'OK', 'SPD': 'OK'})])
        # Original (50 days ago) — the amendment corrects it.
        orig = self._mk_log(
            asset, teknisi, days_ago=50,
            statuses={'AT': 'OK', 'DC': 'OK', 'GR': 'Terkorosi', 'res': 11.5,
                      'SPD': 'Degraded', 'arus': 0.9, 'BND': 'OK', 'SHD': 'OK'},
            note='[DEMO] SPD terdegradasi & grounding terkorosi. Tanah korosif (6 Ω·m).',
        )
        # Amendment (45 days ago) — still the LATEST inspection → sets the band,
        # and >30 days old → asset shows as STALE.
        amend = self._mk_log(
            asset, manager, days_ago=45,
            statuses={'AT': 'OK', 'DC': 'OK', 'GR': 'Terkorosi', 'res': 10.8,
                      'SPD': 'Degraded', 'arus': 0.9, 'BND': 'OK', 'SHD': 'OK'},
            note='[DEMO] Amandemen: koreksi resistansi grounding 11.5 → 10.8 Ω. —Manajer',
            updated_by=manager, amends=orig,
        )
        # Cross-link audits between original and amendment.
        aa = InspectionLogAudit.objects.create(
            inspection=orig, actor=manager, action='amended_by',
            diff={'target_log_id': str(amend.log_id)},
            note=f'Log ini diamandemen menjadi log {str(amend.log_id)[:8]}',
        )
        InspectionLogAudit.objects.filter(pk=aa.pk).update(at=amend.tgl_inspeksi)
        ab = InspectionLogAudit.objects.create(
            inspection=amend, actor=manager, action='amend',
            diff={'target_log_id': str(orig.log_id),
                  'resistansi_grounding_ohm': {'old': '11.5', 'new': '10.8'}},
            note=f'Amandemen dari log {str(orig.log_id)[:8]}',
        )
        InspectionLogAudit.objects.filter(pk=ab.pk).update(at=amend.tgl_inspeksi)
        # Mark stale (last notified now, so a manual stale-check respects cooldown).
        AssetRegistry.objects.filter(pk=asset.pk).update(last_stale_notified_at=self._now)
        self.stdout.write('  🔴 BAHAYA: Tangki LPG Cilacap — Amandemen + korosi + STALE')

    # ── Band 🟣 KRITIS — hard-fail + trashed log ─────────────────────────────
    def _seed_kritis(self, asset, teknisi, manager):
        self._history(asset, teknisi, [(60, {'AT': 'OK'})])
        # Active latest inspection — AT Rusak is a hard-fail → AHI 0 → KRITIS.
        self._mk_log(
            asset, teknisi, days_ago=3,
            statuses={'AT': 'Rusak', 'DC': 'Bengkok', 'GR': 'Terkorosi', 'res': 14.0,
                      'SPD': 'Degraded', 'arus': 0.95, 'BND': 'Longgar', 'SHD': 'OK'},
            note='[DEMO] Air terminal RUSAK, down-conductor bengkok, grounding terkorosi, '
                 'SPD terdegradasi, bonding longgar. Perlu perbaikan segera.',
        )
        # A separate trashed inspection (Tempat Sampah case).
        trashed = self._mk_log(
            asset, teknisi, days_ago=15,
            statuses={'AT': 'OK', 'DC': 'OK', 'GR': 'OK', 'res': 7.1, 'SPD': 'OK'},
            note='[DEMO] Inspeksi ini dipindah ke Tempat Sampah untuk keperluan demo.',
        )
        del_at = self._now - timedelta(days=2)
        InspectionLog.objects.filter(pk=trashed.pk).update(deleted_at=del_at, deleted_by=manager)
        purge_date = (del_at + timedelta(days=7)).date()
        ad = InspectionLogAudit.objects.create(
            inspection=trashed, actor=manager, action='delete',
            note=f'Dipindah ke Tempat Sampah; akan dihapus permanen pada {purge_date}',
        )
        InspectionLogAudit.objects.filter(pk=ad.pk).update(at=del_at)
        self.stdout.write('  🟣 KRITIS: Menara BTS Cinere — hard-fail + log di Tempat Sampah')

    # ── Org B — healthy asset ────────────────────────────────────────────────
    def _seed_org_b(self, asset, teknisi2, manager2):
        self._history(asset, teknisi2, [(40, {})])
        self._mk_log(
            asset, teknisi2, days_ago=8,
            statuses={'AT': 'OK', 'DC': 'OK', 'GR': 'OK', 'res': 4.0, 'SPD': 'OK', 'arus': 0.2},
            note='[DEMO] Inspeksi rutin PLN. Semua komponen baik.',
        )
        self.stdout.write('  🟢 BAIK (PLN): Gardu Induk Suralaya — inspeksi rutin')

    def _seed_maintenance(self, asset, user):
        # Kept older than every asset's latest inspection (>45d) so a 'repair'
        # never post-dates a band-setting status and clears its physical penalty
        # (see calculate_component_ahi()'s repair-clears-penalty rule).
        actions = [('install', 320), ('repair', 210), ('repair', 110)]
        active = list(asset.components.filter(end_date__isnull=True, deleted_at__isnull=True))
        for comp in active:
            for action, days_ago in actions:
                ts = self._now - timedelta(days=days_ago)
                ComponentMaintenanceAction.objects.create(
                    asset=asset, component=comp, action=action,
                    performed_at=ts, performed_by=user,
                    notes=f'[DEMO] {action.capitalize()} komponen {comp.component_type} pada {ts.date()}',
                )

    def _seed_notifications(self, assets, teknisi, manager):
        now = self._now
        baik    = assets[ASSET_BAIK['nama_gedung']]
        waspada = assets[ASSET_WASPADA['nama_gedung']]
        bahaya  = assets[ASSET_BAHAYA['nama_gedung']]
        kritis  = assets[ASSET_KRITIS['nama_gedung']]

        def latest_active(asset):
            return (InspectionLog.objects.filter(asset=asset, deleted_at__isnull=True)
                    .order_by('-tgl_inspeksi').first())

        def notif(recipient, actor, verb, when, read=False, **kw):
            n = Notification.objects.create(
                recipient=recipient, actor=actor, verb=verb,
                read_at=(when + timedelta(hours=2)) if read else None, **kw,
            )
            Notification.objects.filter(pk=n.pk).update(created_at=when)
            return n

        # Report-state notifications to the manager (creates) and teknisi.
        notif(manager, teknisi, 'create', now - timedelta(days=4), read=True,  inspection=latest_active(baik))
        notif(teknisi, manager, 'verify', now - timedelta(days=4), read=True,  inspection=latest_active(baik))
        notif(manager, teknisi, 'create', now - timedelta(days=6), inspection=latest_active(waspada))
        notif(teknisi, manager, 'request_revision', now - timedelta(days=6), inspection=latest_active(waspada))
        notif(manager, teknisi, 'create', now - timedelta(days=3), inspection=latest_active(kritis))

        # Component hard-fail on the KRITIS asset (unread, to manager).
        notif(manager, teknisi, 'component_hard_fail', now - timedelta(days=3), inspection=latest_active(kritis))

        # Stale-asset overdue notice for the BAHAYA asset (unread, to manager).
        notif(manager, None, 'stale_asset', now - timedelta(hours=3), asset=bahaya)

        # Lightning notice for the biggest strike (unread, to teknisi).
        big = (LightningEvent.objects.filter(asset=kritis).order_by('-estimasi_arus_puncak_ka').first())
        if big:
            notif(teknisi, manager, 'lightning', now - timedelta(days=1), event=big)

        self.stdout.write('  Seeded demo notifications (mix of read/unread across cases)')

    # ── Health snapshot helper (point-in-time AHI_safety) ─────────────────────
    def _snapshot_health(self, asset, log, as_of):
        """Mirror fuzzy_engine.health_index for a single inspection at `as_of`, so
        seeded historical logs produce a meaningful health trend."""
        active = list(asset.components.filter(end_date__isnull=True, deleted_at__isnull=True))
        if not active:
            return None

        statuses = {s.component.component_type: s.status for s in log.component_statuses.all()}

        ahi_values = []
        for c in active:
            # EQP is the terminal sink node — no lightning-damage model applies
            # (mirrors calculate_component_ahi). Fixed AHI 1.0; it never wins the
            # safety min, and it has no entry in the config maps below.
            if c.component_type == 'EQP':
                ahi_values.append(1.0)
                continue
            events = asset.events.filter(
                timestamp__date__gte=c.install_date, timestamp__lte=as_of,
            )
            total = sum(
                per_event_damage(c.component_type, e.estimasi_arus_puncak_ka, asset.lpl_grade)
                for e in events
            )
            stress = max(1.0 - total / cfg.REFERENCE_DAMAGE_THRESHOLD, 0.0)

            status = statuses.get(c.component_type, 'OK')
            physical = cfg.CONDITION_FACTOR.get(status, 1.0)

            years = (as_of.date() - c.install_date).days / 365.25
            lifespan = cfg.DESIGN_LIFESPAN_BY_COMPONENT[c.component_type]
            age = max(1.0 - years / lifespan, 0.0)
            if (
                c.component_type == 'GR'
                and asset.resistivitas_tanah is not None
                and asset.resistivitas_tanah < cfg.SOIL_RESISTIVITY_THRESHOLD
            ):
                age = max(age - cfg.CORROSION_PENALTY, 0.0)

            ahi = (
                cfg.W_CUMULATIVE_STRESS * stress
                + cfg.W_PHYSICAL_CONDITION * physical
                + cfg.W_CALENDAR_AGE * age
            )
            if status in cfg.HARD_FAIL_STATUSES.get(c.component_type, set()):
                ahi = 0.0
            ahi_values.append(ahi)

        return round(min(ahi_values), 4)

    # ── Summary ──────────────────────────────────────────────────────────────
    def _report(self, assets):
        def band(s):
            if s is None: return 'Belum Ada Data'
            if s >= 0.85: return '🟢 Baik'
            if s >= 0.70: return '🟠 Waspada'
            if s >= 0.50: return '🔴 Bahaya'
            return '🟣 Kritis'

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! {Organization.objects.count()} orgs, '
            f'{AssetRegistry.objects.count()} assets, '
            f'{User.objects.count()} users, '
            f'{InspectionLog.objects.count()} inspection logs, '
            f'{LightningEvent.objects.count()} events.'
        ))
        self.stdout.write('\nHealth band per asset:')
        for asset in AssetRegistry.objects.filter(deleted_at__isnull=True).order_by('organization__nama', 'nama_gedung'):
            asset.recompute_health()
            self.stdout.write(f'  {band(asset.skor_kesehatan_aset):12} AHI={asset.skor_kesehatan_aset}  {asset.nama_gedung}')
        self.stdout.write('\nDemo credentials:')
        self.stdout.write('  Pertamina Group: manager/manager123, teknisi/teknisi123')
        self.stdout.write('  PLN & Institusi: manager2/manager456, teknisi2/teknisi456')
