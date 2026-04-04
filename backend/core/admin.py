from django.contrib import admin
from .models import AssetRegistry, LightningEvent, InspectionLog, User


@admin.register(AssetRegistry)
class AssetRegistryAdmin(admin.ModelAdmin):
    list_display = ['nama_gedung', 'lpl_grade', 'skor_kesehatan_aset', 'tahun_instalasi', 'updated_at']
    list_filter = ['lpl_grade']
    search_fields = ['nama_gedung']
    readonly_fields = ['asset_id', 'kapasitas_desain_ka', 'created_at', 'updated_at']


@admin.register(LightningEvent)
class LightningEventAdmin(admin.ModelAdmin):
    list_display = ['asset', 'estimasi_arus_puncak_ka', 'rasio_stres', 'fuzzy_output_label', 'timestamp']
    list_filter = ['fuzzy_output_label', 'source_type']
    readonly_fields = ['event_id', 'rasio_stres', 'fuzzy_output_score', 'fuzzy_output_label', 'created_at']


@admin.register(InspectionLog)
class InspectionLogAdmin(admin.ModelAdmin):
    list_display = ['asset', 'tgl_inspeksi', 'status_air_terminal', 'status_down_conductor', 'status_grounding']
    list_filter = ['status_air_terminal', 'status_grounding']
    readonly_fields = ['log_id', 'created_at']


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['nama_lengkap', 'role', 'created_at']
    list_filter = ['role']
    readonly_fields = ['user_id', 'created_at']
