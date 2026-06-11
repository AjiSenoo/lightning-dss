import datetime
import logging
import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models

logger = logging.getLogger(__name__)


class Organization(models.Model):
    org_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nama = models.CharField(max_length=255)
    alamat = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'organizations'
        ordering = ['nama']

    def __str__(self):
        return self.nama


LPL_CHOICES = [
    ('I', 'LPL I'),
    ('II', 'LPL II'),
    ('III', 'LPL III'),
    ('IV', 'LPL IV'),
]

LPL_CAPACITY_MAP = {
    'I': 200,
    'II': 150,
    'III': 100,
    'IV': 100,
}

AIR_TERMINAL_STATUS = [
    ('OK', 'OK'),
    ('Rusak', 'Rusak'),
    ('Meleleh', 'Meleleh'),
    ('Terkorosi', 'Terkorosi'),
]

DOWN_CONDUCTOR_STATUS = [
    ('OK', 'OK'),
    ('Klem_Lepas', 'Klem Lepas'),
    ('Bengkok', 'Bengkok'),
    ('Putus', 'Putus'),
]

GROUNDING_STATUS = [
    ('OK', 'OK'),
    ('High_Resistance', 'High Resistance'),
    ('Terkorosi', 'Terkorosi'),
]

SPD_STATUS = [
    ('OK', 'OK'),
    ('Degraded', 'Degraded'),
    ('Failed', 'Failed'),
]

BONDING_STATUS = [
    ('OK', 'OK'),
    ('Longgar', 'Longgar'),
    ('Terputus', 'Terputus'),
]

CABLE_STATUS = [
    ('OK', 'OK'),
    ('Terkelupas', 'Terkelupas'),
    ('Terbakar', 'Terbakar'),
]

ROLE_CHOICES = [
    ('Manajer', 'Manajer'),
    ('Teknisi', 'Teknisi'),
]


COMPONENT_TYPE_CHOICES = [
    ('AT', 'Air Terminal'),
    ('DC', 'Down Conductor'),
    ('GR', 'Grounding Electrode'),
]

# Per-component-type allowed status values; mirrors the flat-field choices above
# so backfill from InspectionLog round-trips losslessly.
COMPONENT_STATUS_CHOICES_BY_TYPE = {
    'AT': AIR_TERMINAL_STATUS,
    'DC': DOWN_CONDUCTOR_STATUS,
    'GR': GROUNDING_STATUS,
}

MAINTENANCE_ACTION_CHOICES = [
    ('install', 'Install'),
    ('repair', 'Repair'),
    ('replace', 'Replace'),
]


class AssetRegistry(models.Model):
    asset_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, null=True, blank=True, related_name='assets'
    )
    nama_gedung = models.CharField(max_length=255)
    lokasi_gps = models.CharField(max_length=100, help_text="Lat, Lng string")
    lpl_grade = models.CharField(max_length=4, choices=LPL_CHOICES)
    kapasitas_desain_ka = models.IntegerField(editable=False, help_text="Auto-filled from LPL grade")
    tahun_instalasi = models.IntegerField()
    tanggal_instalasi = models.DateField(null=True, blank=True,
        help_text="Tanggal instalasi presisi; tahun_instalasi diturunkan dari sini. "
                  "Dipakai untuk menanggali komponen saat aset dibuat/diganti.")
    skor_kesehatan_aset = models.FloatField(default=1.0,
        help_text="Cached AHI_safety (stress + physical + age). Synced via recompute_health(); see health_recomputed_at.")
    health_recomputed_at = models.DateTimeField(null=True, blank=True, db_index=True,
        help_text="When skor_kesehatan_aset was last synced from AHI. Drives lazy refresh TTL.")
    jenis_material_konduktor = models.CharField(max_length=50, blank=True, default='')
    resistivitas_tanah = models.FloatField(null=True, blank=True, help_text="Soil resistivity in Ω·m")
    catatan = models.TextField(blank=True, default='')
    last_stale_notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assets_deleted'
    )

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        self.kapasitas_desain_ka = LPL_CAPACITY_MAP.get(self.lpl_grade, 100)
        # Keep tahun_instalasi in sync as a derived display/query field when a precise
        # install date is provided.
        if self.tanggal_instalasi:
            self.tahun_instalasi = self.tanggal_instalasi.year
        super().save(*args, **kwargs)
        if is_new:
            self._ensure_default_components()

    def _ensure_default_components(self):
        # Prefer the precise install date; fall back to Jan 1 of the install year for
        # legacy/year-only registrations where the exact day is unknown.
        install_date = self.tanggal_instalasi or datetime.date(self.tahun_instalasi, 1, 1)
        for ct in ('AT', 'DC', 'GR'):
            exists = self.components.filter(
                component_type=ct, end_date__isnull=True, deleted_at__isnull=True
            ).exists()
            if not exists:
                AssetComponent.objects.create(
                    asset=self, component_type=ct, install_date=install_date,
                )
        self.recompute_health()

    def recompute_health(self, save=True):
        """Sync skor_kesehatan_aset from the computed AHI_safety (includes age + stress + physical)."""
        from django.utils import timezone
        try:
            from fuzzy_engine import calculate_asset_health
            result = calculate_asset_health(self)
            self.skor_kesehatan_aset = result['ahi_safety']
        except Exception:
            logger.exception('recompute_health failed for asset %s; keeping previous score', self.pk)
            result = None
        self._health_cache = result
        self.health_recomputed_at = timezone.now()
        if save:
            self.save(update_fields=['skor_kesehatan_aset', 'health_recomputed_at', 'updated_at'])
        return result

    def recompute_if_stale(self, ttl_hours=None):
        """Recompute only if older than TTL. Called by serializers on read paths."""
        from django.conf import settings as dj_settings
        from django.utils import timezone
        from datetime import timedelta
        ttl_hours = ttl_hours or getattr(dj_settings, 'HEALTH_RECOMPUTE_TTL_HOURS', 6)
        if (
            self.health_recomputed_at is None
            or self.health_recomputed_at < timezone.now() - timedelta(hours=ttl_hours)
        ):
            self.recompute_health()

    def cached_health(self):
        """
        Per-instance-cached full AHI breakdown for read/serializer paths.

        Computes calculate_asset_health() at most once per loaded instance (a single
        request), refreshing the cached score first if the TTL has expired. Lets the
        several serializer methods that need the breakdown share one computation
        instead of recomputing (and writing) per field.
        """
        cache = getattr(self, '_health_cache', None)
        if cache is not None:
            return cache
        self.recompute_if_stale()  # populates self._health_cache when it recomputes
        cache = getattr(self, '_health_cache', None)
        if cache is None:
            try:
                from fuzzy_engine import calculate_asset_health
                cache = calculate_asset_health(self)
            except Exception:
                logger.exception('cached_health computation failed for asset %s', self.pk)
                cache = None
            self._health_cache = cache
        return cache

    class Meta:
        db_table = 'asset_registry'
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.nama_gedung} (LPL {self.lpl_grade})"


class LightningEvent(models.Model):
    event_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(AssetRegistry, on_delete=models.PROTECT, related_name='events')
    timestamp = models.DateTimeField()
    estimasi_arus_puncak_ka = models.FloatField(help_text="Ipeak in kA")
    rasio_stres = models.FloatField(editable=False, default=0.0, help_text="Auto: Ipeak / kapasitas_desain_ka")
    fuzzy_output_score = models.FloatField(null=True, blank=True, help_text="IUI 0-100")
    fuzzy_output_label = models.CharField(max_length=30, blank=True, default='')
    catatan = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        'User', on_delete=models.PROTECT, null=True, blank=True, related_name='events_recorded'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.asset_id and self.estimasi_arus_puncak_ka:
            try:
                capacity = self.asset.kapasitas_desain_ka
                self.rasio_stres = self.estimasi_arus_puncak_ka / capacity
            except Exception:
                self.rasio_stres = 0.0
        super().save(*args, **kwargs)
        try:
            self.asset.recompute_health()
        except Exception:
            logger.exception('recompute_health after LightningEvent save failed (event %s)', self.pk)

    class Meta:
        db_table = 'lightning_events'
        ordering = ['-timestamp']

    def __str__(self):
        return f"Event {self.estimasi_arus_puncak_ka}kA on {self.asset.nama_gedung}"


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, null=True, blank=True, related_name='users'
    )
    nama_lengkap = models.CharField(max_length=100)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='Teknisi')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users'
        ordering = ['username']

    def __str__(self):
        return f"{self.nama_lengkap or self.username} ({self.role})"


class InspectionLog(models.Model):
    log_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        LightningEvent, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections'
    )
    asset = models.ForeignKey(AssetRegistry, on_delete=models.PROTECT, related_name='inspections')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')
    tgl_inspeksi = models.DateTimeField()

    # Required components
    status_air_terminal = models.CharField(max_length=20, choices=AIR_TERMINAL_STATUS)
    status_down_conductor = models.CharField(max_length=20, choices=DOWN_CONDUCTOR_STATUS)
    status_grounding = models.CharField(max_length=20, choices=GROUNDING_STATUS)
    resistansi_grounding_ohm = models.FloatField(null=True, blank=True)

    # Optional components
    status_spd = models.CharField(max_length=20, choices=SPD_STATUS, blank=True, default='')
    arus_bocor_spd_ma = models.FloatField(null=True, blank=True)
    status_bonding = models.CharField(max_length=20, choices=BONDING_STATUS, blank=True, default='')
    status_kabel_instalasi = models.CharField(max_length=20, choices=CABLE_STATUS, blank=True, default='')

    # Evidence
    catatan_teknisi = models.TextField(blank=True, default='')

    # Health score snapshot recorded by the feedback loop after this inspection was submitted.
    health_after = models.FloatField(null=True, blank=True)

    # Amendment chain — corrections after the 5-min grace window create new logs that link here.
    amends = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True, related_name='amendments'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections_last_edited'
    )
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections_deleted'
    )

    # Verification fields — verified_at can be revoked via revoke_verification action
    verified_at = models.DateTimeField(null=True, blank=True, db_index=True)
    verified_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections_verified'
    )
    revision_requested_at = models.DateTimeField(null=True, blank=True)
    revision_requested_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections_revision_requested'
    )
    revision_request_note = models.CharField(max_length=500, blank=True, default='')

    class Meta:
        db_table = 'inspection_logs'
        ordering = ['-tgl_inspeksi']
        constraints = [
            models.UniqueConstraint(
                fields=['amends'],
                condition=models.Q(amends__isnull=False),
                name='inspection_log_one_amendment_per_original',
            ),
        ]

    def __str__(self):
        return f"Inspection on {self.asset.nama_gedung} ({self.tgl_inspeksi.date()})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.deleted_at is None:
            self._sync_component_statuses()

    # Mirror flat status_* fields into InspectionComponentStatus rows so the AHI engine
    # (post-Phase 2) can read from the per-component table consistently. Idempotent via
    # update_or_create. Removed when the frontend stops writing the flat fields.
    def _sync_component_statuses(self):
        field_map = {
            'AT': ('status_air_terminal', None),
            'DC': ('status_down_conductor', None),
            'GR': ('status_grounding', 'resistansi_grounding_ohm'),
        }
        active_components = {
            c.component_type: c
            for c in self.asset.components.filter(
                end_date__isnull=True, deleted_at__isnull=True
            )
        }
        for ct, (status_field, measurement_field) in field_map.items():
            component = active_components.get(ct)
            if component is None:
                continue
            status_value = getattr(self, status_field, '') or ''
            if not status_value:
                continue
            measurement = getattr(self, measurement_field) if measurement_field else None
            InspectionComponentStatus.objects.update_or_create(
                inspection=self,
                component=component,
                defaults={'status': status_value, 'measurement': measurement},
            )


AUDIT_ACTIONS = [
    ('create',              'Created'),
    ('update',              'Edited'),
    ('amend',               'Amended'),
    ('amended_by',          'Amended By'),
    ('photo_added',         'Photo Added'),
    ('delete',              'Soft-deleted'),
    ('restore',             'Restored'),
    ('purge',               'Hard-deleted'),
    ('verify',              'Verified'),
    ('request_revision',    'Revision Requested'),
    ('revoke_verification', 'Verification Revoked'),
]


class InspectionLogAudit(models.Model):
    audit_id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inspection = models.ForeignKey(
        InspectionLog, on_delete=models.CASCADE, related_name='audit_trail'
    )
    actor = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_actions'
    )
    action = models.CharField(max_length=20, choices=AUDIT_ACTIONS)
    diff   = models.JSONField(default=dict, blank=True)
    note   = models.CharField(max_length=255, blank=True, default='')
    at     = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'inspection_log_audit'
        ordering = ['-at']
        indexes = [models.Index(fields=['inspection', '-at'], name='audit_inspection_at_idx')]

    def __str__(self):
        return f'{self.action} on {self.inspection_id} by {self.actor_id}'


ASSET_AUDIT_ACTIONS = [
    ('create',      'Created'),
    ('update',      'Edited'),
    ('delete',      'Soft-deleted'),
    ('restore',     'Restored'),
    ('purge',       'Hard-deleted'),
    ('replace_out', 'Replaced (superseded by new asset)'),
    ('replace_in',  'Replaces (supersedes old asset)'),
]


class AssetAudit(models.Model):
    audit_id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset      = models.ForeignKey(AssetRegistry, on_delete=models.CASCADE, related_name='audits')
    actor      = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='asset_audit_actions')
    action     = models.CharField(max_length=20, choices=ASSET_AUDIT_ACTIONS)
    diff       = models.JSONField(default=dict, blank=True)
    note       = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'asset_audits'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.action} on {self.asset_id} by {self.actor_id}'


class InspectionPhoto(models.Model):
    photo_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inspection = models.ForeignKey(InspectionLog, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='inspections/%Y/%m/')
    caption = models.CharField(max_length=255, blank=True, default='')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspection_photos'
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Photo for {self.inspection}"


NOTIFICATION_VERBS = [
    ('create',              'Created'),
    ('update',              'Edited'),
    ('amend',               'Amended'),
    ('delete',              'Soft-deleted'),
    ('restore',             'Restored'),
    ('lightning',           'Lightning recorded'),
    ('stale_asset',         'Asset overdue for inspection'),
    ('verify',              'Verified'),
    ('request_revision',    'Revision Requested'),
    ('revoke_verification', 'Verification Revoked'),
    ('asset_create',        'Asset Created'),
    ('asset_update',        'Asset Edited'),
    ('asset_delete',        'Asset Soft-deleted'),
    ('asset_restore',       'Asset Restored'),
    ('component_eol_warning', 'Komponen mendekati masa pakai'),
    ('component_eol_urgent',  'Komponen hampir habis masa pakai'),
]


class Notification(models.Model):
    notif_id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient  = models.ForeignKey('User', on_delete=models.CASCADE, related_name='notifications')
    actor      = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    verb       = models.CharField(max_length=30, choices=NOTIFICATION_VERBS)
    inspection = models.ForeignKey(InspectionLog,  on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    event      = models.ForeignKey(LightningEvent, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    asset      = models.ForeignKey(AssetRegistry,  on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    component  = models.ForeignKey('AssetComponent', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    read_at    = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['recipient', 'read_at'], name='notif_recipient_read_idx')]

    def __str__(self):
        return f'Notif {self.verb} → {self.recipient_id}'


class AssetComponent(models.Model):
    """
    A physical component of an LPS asset (Air Terminal, Down Conductor, Grounding Electrode).
    Replacements create a new row and end-date the predecessor — the chain reconstructs
    "which component was installed at the time of a strike" for per-component stress accrual.
    """
    component_id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset               = models.ForeignKey(AssetRegistry, on_delete=models.PROTECT, related_name='components')
    component_type      = models.CharField(max_length=2, choices=COMPONENT_TYPE_CHOICES)
    install_date        = models.DateField(help_text="Resets the stress and age clock on replacement")
    end_date            = models.DateField(null=True, blank=True, db_index=True,
                                           help_text="Set when superseded; null = currently installed")
    replaced_by         = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='replaces')
    design_capacity_ka  = models.FloatField(null=True, blank=True,
                                            help_text="Optional override; null → inherit from asset LPL")
    catatan             = models.TextField(blank=True, default='')
    # End-of-life notification state (see check_component_lifespan command).
    last_eol_notified_at = models.DateTimeField(null=True, blank=True,
                                                help_text="When the last EOL notification fired (cooldown anchor)")
    last_eol_tier        = models.CharField(max_length=10, blank=True, default='',
                                            help_text="Last EOL tier notified: '' | 'warning' | 'urgent'")
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)
    deleted_at          = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by          = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True,
                                            related_name='components_deleted')

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            self.asset.recompute_health()
        except Exception:
            logger.exception('recompute_health after AssetComponent save failed (component %s)', self.pk)

    class Meta:
        db_table = 'asset_components'
        ordering = ['asset', 'component_type', '-install_date']
        constraints = [
            models.UniqueConstraint(
                fields=['asset', 'component_type'],
                condition=models.Q(end_date__isnull=True, deleted_at__isnull=True),
                name='one_active_component_per_type_per_asset',
            ),
        ]

    def __str__(self):
        return f'{self.get_component_type_display()} on {self.asset.nama_gedung} (installed {self.install_date})'


class InspectionComponentStatus(models.Model):
    """
    Per-inspection, per-component status. Replaces the flat status_* fields on InspectionLog
    in the new model. Backward-compat: the flat fields are mirrored during transition.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inspection  = models.ForeignKey(InspectionLog, on_delete=models.CASCADE, related_name='component_statuses')
    component   = models.ForeignKey(AssetComponent, on_delete=models.PROTECT, related_name='status_history')
    status      = models.CharField(max_length=20, help_text="Values constrained per component_type")
    measurement = models.FloatField(null=True, blank=True,
                                    help_text="e.g. resistansi_grounding_ohm for GR")
    catatan     = models.TextField(blank=True, default='')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspection_component_statuses'
        ordering = ['inspection', 'component']
        unique_together = [('inspection', 'component')]

    def __str__(self):
        return f'{self.component.get_component_type_display()} = {self.status} @ {self.inspection_id}'


class ComponentMaintenanceAction(models.Model):
    """
    A maintenance event on a component: install (initial), repair, or replace.
    A 'replace' action atomically creates the new AssetComponent row and end-dates the prior one
    (handled in the serializer/view layer).
    """
    action_id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset        = models.ForeignKey(AssetRegistry, on_delete=models.PROTECT, related_name='maintenance_actions')
    component    = models.ForeignKey(AssetComponent, on_delete=models.PROTECT, related_name='maintenance_actions')
    action       = models.CharField(max_length=10, choices=MAINTENANCE_ACTION_CHOICES)
    performed_at = models.DateTimeField()
    performed_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='maintenance_actions')
    notes        = models.TextField(blank=True, default='')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'component_maintenance_actions'
        ordering = ['-performed_at']

    def __str__(self):
        return f'{self.action} on {self.component} at {self.performed_at}'
