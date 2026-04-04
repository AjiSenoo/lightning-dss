from rest_framework import serializers
from .models import AssetRegistry, LightningEvent, InspectionLog, User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['user_id', 'nama_lengkap', 'role', 'created_at']
        read_only_fields = ['user_id', 'created_at']


class AssetRegistrySerializer(serializers.ModelSerializer):
    kapasitas_desain_ka = serializers.IntegerField(read_only=True)
    d_asset = serializers.SerializerMethodField()
    latest_event = serializers.SerializerMethodField()
    latest_inspection_date = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistry
        fields = [
            'asset_id', 'nama_gedung', 'lokasi_gps', 'lpl_grade',
            'kapasitas_desain_ka', 'tahun_instalasi', 'skor_kesehatan_aset',
            'jenis_material_konduktor', 'resistivitas_tanah', 'catatan',
            'created_at', 'updated_at', 'd_asset', 'latest_event', 'latest_inspection_date',
        ]
        read_only_fields = ['asset_id', 'kapasitas_desain_ka', 'created_at', 'updated_at']

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
            'source_type', 'fuzzy_output_score', 'fuzzy_output_label',
            'catatan', 'created_at',
        ]
        read_only_fields = ['event_id', 'rasio_stres', 'fuzzy_output_score', 'fuzzy_output_label', 'created_at']


class InspectionLogSerializer(serializers.ModelSerializer):
    asset_nama_gedung = serializers.CharField(source='asset.nama_gedung', read_only=True)
    health_before = serializers.FloatField(read_only=True, default=None)
    health_after = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = InspectionLog
        fields = [
            'log_id', 'event', 'asset', 'asset_nama_gedung', 'user',
            'tgl_inspeksi', 'status_air_terminal', 'status_down_conductor',
            'status_grounding', 'resistansi_grounding_ohm',
            'status_spd', 'arus_bocor_spd_ma', 'status_bonding',
            'status_kabel_instalasi', 'catatan_teknisi', 'foto_bukti_url',
            'created_at', 'health_before', 'health_after',
        ]
        read_only_fields = ['log_id', 'created_at']


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
