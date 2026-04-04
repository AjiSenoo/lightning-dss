import uuid
from django.db import models

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

SOURCE_TYPE_CHOICES = [
    ('Manual', 'Manual'),
    ('AudioEstimation', 'Audio Estimation'),
    ('Sensor', 'Sensor'),
]

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
    nama_gedung = models.CharField(max_length=255)
    lokasi_gps = models.CharField(max_length=100, help_text="Lat, Lng string")
    lpl_grade = models.CharField(max_length=4, choices=LPL_CHOICES)
    kapasitas_desain_ka = models.IntegerField(editable=False, help_text="Auto-filled from LPL grade")
    tahun_instalasi = models.IntegerField()
    skor_kesehatan_aset = models.FloatField(default=1.0, help_text="0.0 (dead) to 1.0 (pristine)")
    jenis_material_konduktor = models.CharField(max_length=50, blank=True, default='')
    resistivitas_tanah = models.FloatField(null=True, blank=True, help_text="Soil resistivity in Ω·m")
    catatan = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    asset = models.ForeignKey(AssetRegistry, on_delete=models.CASCADE, related_name='events')
    timestamp = models.DateTimeField()
    estimasi_arus_puncak_ka = models.FloatField(help_text="Ipeak in kA")
    rasio_stres = models.FloatField(editable=False, default=0.0, help_text="Auto: Ipeak / kapasitas_desain_ka")
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES, default='Manual')
    fuzzy_output_score = models.FloatField(null=True, blank=True, help_text="IUI 0-100")
    fuzzy_output_label = models.CharField(max_length=30, blank=True, default='')
    catatan = models.TextField(blank=True, default='')
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


class User(models.Model):
    user_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nama_lengkap = models.CharField(max_length=100)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f"{self.nama_lengkap} ({self.role})"


class InspectionLog(models.Model):
    log_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(
        LightningEvent, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections'
    )
    asset = models.ForeignKey(AssetRegistry, on_delete=models.CASCADE, related_name='inspections')
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
    foto_bukti_url = models.TextField(blank=True, default='', help_text="Comma-separated photo paths")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspection_logs'
        ordering = ['-tgl_inspeksi']

    def __str__(self):
        return f"Inspection on {self.asset.nama_gedung} ({self.tgl_inspeksi.date()})"
