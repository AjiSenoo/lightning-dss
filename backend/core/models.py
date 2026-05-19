import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


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
    skor_kesehatan_aset = models.FloatField(default=1.0, help_text="0.0 (dead) to 1.0 (pristine)")
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
        self.kapasitas_desain_ka = LPL_CAPACITY_MAP.get(self.lpl_grade, 100)
        super().save(*args, **kwargs)

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

    def __str__(self):
        return f"Inspection on {self.asset.nama_gedung} ({self.tgl_inspeksi.date()})"


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
    ('create',  'Created'),
    ('update',  'Edited'),
    ('delete',  'Soft-deleted'),
    ('restore', 'Restored'),
    ('purge',   'Hard-deleted'),
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
]


class Notification(models.Model):
    notif_id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient  = models.ForeignKey('User', on_delete=models.CASCADE, related_name='notifications')
    actor      = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    verb       = models.CharField(max_length=20, choices=NOTIFICATION_VERBS)
    inspection = models.ForeignKey(InspectionLog,  on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    event      = models.ForeignKey(LightningEvent, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    asset      = models.ForeignKey(AssetRegistry,  on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    read_at    = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['recipient', 'read_at'], name='notif_recipient_read_idx')]

    def __str__(self):
        return f'Notif {self.verb} → {self.recipient_id}'
