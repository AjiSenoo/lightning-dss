from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import (
    AssetRegistry, AssetAudit, LightningEvent, InspectionLog, InspectionLogAudit,
    InspectionPhoto, Notification, User, Organization,
    AssetComponent, InspectionComponentStatus, ComponentMaintenanceAction,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['nama', 'alamat', 'created_at']
    search_fields = ['nama']
    readonly_fields = ['org_id', 'created_at']


@admin.register(AssetRegistry)
class AssetRegistryAdmin(admin.ModelAdmin):
    list_display = ['nama_gedung', 'organization', 'lpl_grade', 'skor_kesehatan_aset', 'tahun_instalasi', 'updated_at', 'deleted_at']
    list_filter = ['lpl_grade', 'organization', ('deleted_at', admin.EmptyFieldListFilter)]
    search_fields = ['nama_gedung']
    readonly_fields = ['asset_id', 'kapasitas_desain_ka', 'created_at', 'updated_at']


@admin.register(AssetAudit)
class AssetAuditAdmin(admin.ModelAdmin):
    list_display = ['asset', 'action', 'actor', 'created_at']
    list_filter = ['action']
    readonly_fields = ['audit_id', 'created_at']


@admin.register(LightningEvent)
class LightningEventAdmin(admin.ModelAdmin):
    list_display = ['asset', 'estimasi_arus_puncak_ka', 'rasio_stres', 'fuzzy_output_label', 'timestamp', 'created_by']
    list_filter = ['fuzzy_output_label']
    readonly_fields = ['event_id', 'rasio_stres', 'fuzzy_output_score', 'fuzzy_output_label', 'created_at']


@admin.register(InspectionLog)
class InspectionLogAdmin(admin.ModelAdmin):
    list_display = ['asset', 'tgl_inspeksi', 'status_air_terminal', 'status_down_conductor', 'status_grounding', 'amends', 'verified_at', 'deleted_at']
    list_filter = ['status_air_terminal', 'status_grounding', ('verified_at', admin.EmptyFieldListFilter), 'deleted_at']
    readonly_fields = ['log_id', 'created_at', 'updated_at']


@admin.register(AssetComponent)
class AssetComponentAdmin(admin.ModelAdmin):
    list_display = ['asset', 'component_type', 'install_date', 'end_date', 'replaced_by', 'deleted_at']
    list_filter = ['component_type', ('end_date', admin.EmptyFieldListFilter), ('deleted_at', admin.EmptyFieldListFilter)]
    search_fields = ['asset__nama_gedung']
    readonly_fields = ['component_id', 'created_at', 'updated_at']


@admin.register(InspectionComponentStatus)
class InspectionComponentStatusAdmin(admin.ModelAdmin):
    list_display = ['inspection', 'component', 'status', 'measurement', 'created_at']
    list_filter = ['status']
    readonly_fields = ['id', 'created_at']


@admin.register(ComponentMaintenanceAction)
class ComponentMaintenanceActionAdmin(admin.ModelAdmin):
    list_display = ['asset', 'component', 'action', 'performed_at', 'performed_by']
    list_filter = ['action']
    search_fields = ['asset__nama_gedung']
    readonly_fields = ['action_id', 'created_at']


@admin.register(InspectionLogAudit)
class InspectionLogAuditAdmin(admin.ModelAdmin):
    list_display = ['inspection', 'action', 'actor', 'at']
    list_filter = ['action']
    readonly_fields = ['audit_id', 'at']


@admin.register(InspectionPhoto)
class InspectionPhotoAdmin(admin.ModelAdmin):
    list_display = ['inspection', 'image', 'caption', 'uploaded_at']
    readonly_fields = ['photo_id', 'uploaded_at']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'actor', 'verb', 'inspection', 'read_at', 'created_at']
    list_filter = ['verb', 'read_at']
    readonly_fields = ['notif_id', 'created_at']


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ['username', 'nama_lengkap', 'role', 'organization', 'is_active', 'created_at']
    list_filter = ['role', 'is_active', 'is_staff', 'organization']
    search_fields = ['username', 'nama_lengkap', 'email']
    readonly_fields = ['id', 'created_at', 'last_login', 'date_joined']
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('SPP-CBM', {'fields': ('nama_lengkap', 'role', 'organization')}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ('SPP-CBM', {'fields': ('nama_lengkap', 'role', 'organization')}),
    )
