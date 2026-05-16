from datetime import timedelta
from django.conf import settings
from rest_framework import serializers
from .models import AssetRegistry, LightningEvent, InspectionLog, InspectionPhoto, InspectionLogAudit, User, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['org_id', 'nama', 'alamat', 'created_at']
        read_only_fields = ['org_id', 'created_at']


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=6)
    organization_nama = serializers.CharField(source='organization.nama', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'nama_lengkap', 'role', 'organization', 'organization_nama', 'password', 'is_active', 'created_at']
        read_only_fields = ['id', 'organization_nama', 'created_at']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AssetRegistrySerializer(serializers.ModelSerializer):
    kapasitas_desain_ka = serializers.IntegerField(read_only=True)
    organization_nama = serializers.CharField(source='organization.nama', read_only=True)
    d_asset = serializers.SerializerMethodField()
    latest_event = serializers.SerializerMethodField()
    latest_inspection_date = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistry
        fields = [
            'asset_id', 'organization', 'organization_nama', 'nama_gedung', 'lokasi_gps', 'lpl_grade',
            'kapasitas_desain_ka', 'tahun_instalasi', 'skor_kesehatan_aset',
            'jenis_material_konduktor', 'resistivitas_tanah', 'catatan',
            'created_at', 'updated_at', 'd_asset', 'latest_event', 'latest_inspection_date',
        ]
        read_only_fields = ['asset_id', 'kapasitas_desain_ka', 'organization_nama', 'created_at', 'updated_at']

    def get_d_asset(self, obj):
        return round(1.0 - obj.skor_kesehatan_aset, 4)

    def get_latest_event(self, obj):
        event = obj.events.first()
        if event:
            return {
                'event_id': str(event.event_id),
                'timestamp': event.timestamp,
                'estimasi_arus_puncak_ka': event.estimasi_arus_puncak_ka,
                'fuzzy_output_label': event.fuzzy_output_label,
            }
        return None

    def get_latest_inspection_date(self, obj):
        insp = obj.inspections.first()
        return insp.tgl_inspeksi if insp else None


class LightningEventSerializer(serializers.ModelSerializer):
    asset_nama_gedung = serializers.CharField(source='asset.nama_gedung', read_only=True)
    asset_lpl_grade = serializers.CharField(source='asset.lpl_grade', read_only=True)
    rasio_stres = serializers.FloatField(read_only=True)
    fuzzy_output_score = serializers.FloatField(read_only=True)
    fuzzy_output_label = serializers.CharField(read_only=True)

    class Meta:
        model = LightningEvent
        fields = [
            'event_id', 'asset', 'asset_nama_gedung', 'asset_lpl_grade',
            'timestamp', 'estimasi_arus_puncak_ka', 'rasio_stres',
            'fuzzy_output_score', 'fuzzy_output_label',
            'catatan', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'event_id', 'rasio_stres', 'fuzzy_output_score', 'fuzzy_output_label',
            'created_by', 'created_at',
        ]


class InspectionPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionPhoto
        fields = ['photo_id', 'image', 'caption', 'uploaded_at']
        read_only_fields = ['photo_id', 'uploaded_at']


class InspectionLogSerializer(serializers.ModelSerializer):
    asset_nama_gedung    = serializers.CharField(source='asset.nama_gedung', read_only=True)
    user_nama            = serializers.CharField(source='user.nama_lengkap', read_only=True)
    user_username        = serializers.CharField(source='user.username', read_only=True)
    updated_by_nama      = serializers.CharField(source='updated_by.nama_lengkap', read_only=True)
    updated_by_username  = serializers.CharField(source='updated_by.username', read_only=True)
    deleted_by_nama      = serializers.CharField(source='deleted_by.nama_lengkap', read_only=True)
    purge_at             = serializers.SerializerMethodField()
    amendments           = serializers.SerializerMethodField()
    health_before        = serializers.FloatField(read_only=True, default=None)
    health_after         = serializers.FloatField(read_only=True, default=None)
    photos               = InspectionPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = InspectionLog
        fields = [
            'log_id', 'event', 'asset', 'asset_nama_gedung',
            'user', 'user_nama', 'user_username',
            'tgl_inspeksi', 'status_air_terminal', 'status_down_conductor',
            'status_grounding', 'resistansi_grounding_ohm',
            'status_spd', 'arus_bocor_spd_ma', 'status_bonding',
            'status_kabel_instalasi', 'catatan_teknisi',
            'amends', 'amendments', 'created_at',
            'updated_at', 'updated_by', 'updated_by_nama', 'updated_by_username',
            'deleted_at', 'deleted_by', 'deleted_by_nama', 'purge_at',
            'health_before', 'health_after', 'photos',
        ]
        read_only_fields = [
            'log_id', 'amends', 'amendments', 'user_nama', 'user_username',
            'created_at', 'updated_at', 'updated_by_nama', 'updated_by_username',
            'deleted_by_nama', 'purge_at', 'photos',
        ]

    def get_amendments(self, obj):
        return [str(a.log_id) for a in obj.amendments.all()]

    def get_purge_at(self, obj):
        if obj.deleted_at is None:
            return None
        return obj.deleted_at + timedelta(days=settings.INSPECTION_DELETE_GRACE_DAYS)


class InspectionLogAuditSerializer(serializers.ModelSerializer):
    actor_nama     = serializers.CharField(source='actor.nama_lengkap', read_only=True)
    actor_username = serializers.CharField(source='actor.username',     read_only=True)
    actor_role     = serializers.CharField(source='actor.role',         read_only=True)

    class Meta:
        model  = InspectionLogAudit
        fields = [
            'audit_id', 'inspection', 'actor', 'actor_nama', 'actor_username',
            'actor_role', 'action', 'diff', 'note', 'at',
        ]
        read_only_fields = fields


class DashboardSummarySerializer(serializers.Serializer):
    total_assets = serializers.IntegerField()
    assets_needing_inspection = serializers.IntegerField()
    events_last_7_days = serializers.IntegerField()
    critical_assets = serializers.IntegerField()


class AssetMapSerializer(serializers.ModelSerializer):
    health_status = serializers.SerializerMethodField()
    last_strike = serializers.SerializerMethodField()
    last_inspection = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistry
        fields = [
            'asset_id', 'nama_gedung', 'lokasi_gps', 'lpl_grade',
            'skor_kesehatan_aset', 'health_status', 'last_strike', 'last_inspection',
        ]

    def get_health_status(self, obj):
        s = obj.skor_kesehatan_aset
        if s > 0.7:
            return 'aman'
        elif s >= 0.4:
            return 'waspada'
        return 'bahaya'

    def get_last_strike(self, obj):
        event = obj.events.first()
        return event.timestamp if event else None

    def get_last_inspection(self, obj):
        insp = obj.inspections.first()
        return insp.tgl_inspeksi if insp else None
