import logging
from datetime import timedelta
from django.conf import settings
from rest_framework import serializers

logger = logging.getLogger(__name__)
from .models import (
    AssetRegistry, AssetAudit, LightningEvent, InspectionLog, InspectionPhoto,
    InspectionLogAudit, Notification, User, Organization,
    AssetComponent, InspectionComponentStatus, ComponentMaintenanceAction,
)


def _latest_through_chain(asset, attr):
    """Return the most recent related row (`attr` = 'events' or 'inspections'),
    walking predecessor links so a replacement asset inherits its predecessor's
    last strike/inspection until it accumulates its own. Capped to guard cycles."""
    seen = 0
    while asset is not None and seen < 20:
        row = getattr(asset, attr).first()
        if row:
            return row
        asset = asset.predecessor
        seen += 1
    return None


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


class AssetComponentSerializer(serializers.ModelSerializer):
    component_type_display = serializers.CharField(source='get_component_type_display', read_only=True)
    age_label = serializers.SerializerMethodField()

    class Meta:
        model = AssetComponent
        fields = [
            'component_id', 'asset', 'component_type', 'component_type_display',
            'install_date', 'end_date', 'replaced_by',
            'design_capacity_ka', 'catatan', 'created_at', 'updated_at',
            'deleted_at', 'age_label',
        ]
        read_only_fields = ['component_id', 'component_type_display', 'created_at', 'updated_at', 'age_label']

    def get_age_label(self, obj):
        import datetime
        today = datetime.date.today()
        reference = obj.end_date if obj.end_date else today
        install = obj.install_date
        if not install:
            return None
        delta_days = (reference - install).days
        if delta_days < 30:
            return 'baru terpasang'
        months = delta_days // 30
        if months < 12:
            return f'{months} bulan'
        years = delta_days // 365
        return f'{years} tahun'


class InspectionComponentStatusSerializer(serializers.ModelSerializer):
    component_type = serializers.CharField(source='component.component_type', read_only=True)

    class Meta:
        model = InspectionComponentStatus
        fields = ['id', 'inspection', 'component', 'component_type', 'status', 'measurement', 'catatan', 'created_at']
        read_only_fields = ['id', 'component_type', 'created_at']


class ComponentMaintenanceActionSerializer(serializers.ModelSerializer):
    performed_by_nama = serializers.CharField(source='performed_by.nama_lengkap', read_only=True)
    component_type    = serializers.CharField(source='component.component_type', read_only=True)

    class Meta:
        model = ComponentMaintenanceAction
        fields = [
            'action_id', 'asset', 'component', 'component_type', 'action',
            'performed_at', 'performed_by', 'performed_by_nama', 'notes', 'created_at',
        ]
        read_only_fields = ['action_id', 'performed_by', 'performed_by_nama', 'component_type', 'created_at']


class AssetRegistrySerializer(serializers.ModelSerializer):
    kapasitas_desain_ka     = serializers.IntegerField(read_only=True)
    # Optional: tahun_instalasi is derived from tanggal_instalasi when the precise date
    # is supplied (the model's save() handles it), so the date picker can be the only input.
    tahun_instalasi         = serializers.IntegerField(required=False)
    organization_nama       = serializers.CharField(source='organization.nama', read_only=True)
    deleted_by_nama         = serializers.CharField(source='deleted_by.nama_lengkap', read_only=True)
    deleted_by_username     = serializers.CharField(source='deleted_by.username', read_only=True)
    d_asset                 = serializers.SerializerMethodField()
    latest_event            = serializers.SerializerMethodField()
    latest_inspection_date  = serializers.SerializerMethodField()
    ahi_breakdown           = serializers.SerializerMethodField()
    recommendations         = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistry
        fields = [
            'asset_id', 'organization', 'organization_nama', 'nama_gedung', 'lokasi_gps', 'lpl_grade',
            'kapasitas_desain_ka', 'tahun_instalasi', 'tanggal_instalasi', 'skor_kesehatan_aset',
            'jenis_material_konduktor', 'resistivitas_tanah', 'catatan',
            'created_at', 'updated_at',
            'deleted_at', 'deleted_by', 'deleted_by_nama', 'deleted_by_username',
            'd_asset', 'latest_event', 'latest_inspection_date',
            'ahi_breakdown', 'recommendations',
        ]
        read_only_fields = [
            'asset_id', 'kapasitas_desain_ka', 'organization_nama',
            'created_at', 'updated_at',
            'deleted_by_nama', 'deleted_by_username',
            # Cached AHI snapshot — recomputed by the engine, never client-writable.
            'skor_kesehatan_aset',
        ]

    def validate(self, attrs):
        # Accept either a precise tanggal_instalasi (preferred) or a year-only
        # tahun_instalasi (legacy). At least one must be present on create.
        tanggal = attrs.get('tanggal_instalasi')
        tahun = attrs.get('tahun_instalasi')
        if self.instance is None and tanggal is None and tahun is None:
            raise serializers.ValidationError(
                {'tanggal_instalasi': 'Tanggal instalasi (atau tahun instalasi) wajib diisi.'}
            )
        if tanggal is not None:
            attrs['tahun_instalasi'] = tanggal.year
        return attrs

    def get_d_asset(self, obj):
        return round(1.0 - obj.skor_kesehatan_aset, 4)

    def get_latest_event(self, obj):
        event = _latest_through_chain(obj, 'events')
        if event:
            return {
                'event_id': str(event.event_id),
                'timestamp': event.timestamp,
                'estimasi_arus_puncak_ka': event.estimasi_arus_puncak_ka,
                'fuzzy_output_label': event.fuzzy_output_label,
            }
        return None

    def get_latest_inspection_date(self, obj):
        insp = _latest_through_chain(obj, 'inspections')
        return insp.tgl_inspeksi if insp else None

    def get_ahi_breakdown(self, obj):
        try:
            return obj.cached_health()
        except Exception:
            logger.exception('ahi_breakdown failed for asset %s', obj.pk)
            return None

    def get_recommendations(self, obj):
        # Only run the full recommendation engine on detail views to avoid N+1 on list
        view = self.context.get('view')
        if view and getattr(view, 'action', None) != 'retrieve':
            return None
        try:
            from fuzzy_engine import run_inference_per_component, recommend_for_asset
            health = obj.cached_health()
            per_ahi = {ct: r for ct, r in health['per_component'].items()}
            ahi_by_type = {ct: r['ahi'] for ct, r in per_ahi.items()}
            from fuzzy_engine import fuzzy_config as cfg
            latest_event = obj.events.first()
            r_stress = latest_event.rasio_stres if latest_event else 0.0
            incidental = bool(latest_event and latest_event.kategori_magnitudo == cfg.INCIDENTAL_TRIGGER_MAGNITUDE)
            fuzzy = run_inference_per_component(r_stress, ahi_by_type)
            # Build latest per-component numeric measurements for threshold rules
            def _latest_measurement(component_type):
                comp = obj.components.filter(
                    component_type=component_type, end_date__isnull=True, deleted_at__isnull=True
                ).first()
                if comp is None:
                    return None
                return (
                    comp.status_history
                    .order_by('-inspection__tgl_inspeksi')
                    .values_list('measurement', flat=True)
                    .first()
                )

            return recommend_for_asset(
                per_ahi,
                fuzzy['per_component'],
                latest_measurements={
                    'GR':  _latest_measurement('GR'),   # resistance Ω
                    'SPD': _latest_measurement('SPD'),  # leakage mA
                },
                incidental=incidental,
            )
        except Exception:
            logger.exception('recommendations failed for asset %s', obj.pk)
            return None


class LightningEventSerializer(serializers.ModelSerializer):
    asset_nama_gedung = serializers.CharField(source='asset.nama_gedung', read_only=True)
    asset_lpl_grade = serializers.CharField(source='asset.lpl_grade', read_only=True)
    rasio_stres = serializers.FloatField(read_only=True)
    kategori_magnitudo = serializers.CharField(read_only=True)
    fuzzy_output_score = serializers.FloatField(read_only=True)
    fuzzy_output_label = serializers.CharField(read_only=True)
    created_by_nama = serializers.CharField(source='created_by.nama_lengkap', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = LightningEvent
        fields = [
            'event_id', 'asset', 'asset_nama_gedung', 'asset_lpl_grade',
            'timestamp', 'estimasi_arus_puncak_ka', 'rasio_stres', 'kategori_magnitudo',
            'fuzzy_output_score', 'fuzzy_output_label',
            'catatan', 'created_by', 'created_by_nama', 'created_by_username', 'created_at',
        ]
        read_only_fields = [
            'event_id', 'rasio_stres', 'kategori_magnitudo', 'fuzzy_output_score',
            'fuzzy_output_label', 'created_by', 'created_at',
        ]


class InspectionPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionPhoto
        fields = ['photo_id', 'image', 'caption', 'uploaded_at']
        read_only_fields = ['photo_id', 'uploaded_at']


class InspectionLogSerializer(serializers.ModelSerializer):
    asset_nama_gedung           = serializers.CharField(source='asset.nama_gedung', read_only=True)
    user_nama                   = serializers.CharField(source='user.nama_lengkap', read_only=True)
    user_username               = serializers.CharField(source='user.username', read_only=True)
    updated_by_nama             = serializers.CharField(source='updated_by.nama_lengkap', read_only=True)
    updated_by_username         = serializers.CharField(source='updated_by.username', read_only=True)
    deleted_by_nama             = serializers.CharField(source='deleted_by.nama_lengkap', read_only=True)
    verified_by_nama            = serializers.CharField(source='verified_by.nama_lengkap', read_only=True)
    verified_by_username        = serializers.CharField(source='verified_by.username', read_only=True)
    revision_requested_by_nama  = serializers.CharField(source='revision_requested_by.nama_lengkap', read_only=True)
    verification_status         = serializers.SerializerMethodField()
    purge_at                    = serializers.SerializerMethodField()
    amendments                  = serializers.SerializerMethodField()
    health_before               = serializers.FloatField(read_only=True, default=None)
    health_after                = serializers.FloatField(read_only=True, default=None)
    photos                      = InspectionPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = InspectionLog
        fields = [
            'log_id', 'event', 'asset', 'asset_nama_gedung',
            'user', 'user_nama', 'user_username',
            'tgl_inspeksi', 'status_air_terminal', 'status_down_conductor',
            'status_grounding', 'resistansi_grounding_ohm',
            'status_spd', 'arus_bocor_spd_ma', 'status_bonding',
            'status_shielding', 'catatan_teknisi',
            'amends', 'amendments', 'created_at',
            'updated_at', 'updated_by', 'updated_by_nama', 'updated_by_username',
            'deleted_at', 'deleted_by', 'deleted_by_nama', 'purge_at',
            'verified_at', 'verified_by', 'verified_by_nama', 'verified_by_username',
            'revision_requested_at', 'revision_requested_by', 'revision_requested_by_nama',
            'revision_request_note',
            'verification_status',
            'health_before', 'health_after', 'photos',
        ]
        read_only_fields = [
            'log_id', 'amends', 'amendments', 'user_nama', 'user_username',
            'created_at', 'updated_at', 'updated_by_nama', 'updated_by_username',
            'deleted_by_nama', 'purge_at', 'photos',
            'verified_by_nama', 'verified_by_username', 'revision_requested_by_nama',
            'verification_status',
        ]

    # All six component statuses (LPS Eksternal AT/DC/GR + LPS Internal SPD/BND/SHD) are
    # mandatory: an inspection cannot be submitted unless every status is chosen.
    _REQUIRED_STATUS_FIELDS = {
        'status_air_terminal':   'Status Air Terminal wajib diisi.',
        'status_down_conductor': 'Status Down Conductor wajib diisi.',
        'status_grounding':      'Status Grounding wajib diisi.',
        'status_spd':            'Status SPD wajib diisi.',
        'status_bonding':        'Status Bonding wajib diisi.',
        'status_shielding':      'Status Spatial Shielding wajib diisi.',
    }

    def validate(self, attrs):
        errors = {}
        for field, message in self._REQUIRED_STATUS_FIELDS.items():
            if field in attrs:
                value = attrs.get(field)
            elif self.instance is not None:
                value = getattr(self.instance, field, '')
            else:
                value = ''
            if not (value or '').strip():
                errors[field] = [message]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def get_amendments(self, obj):
        return [str(a.log_id) for a in obj.amendments.all()]

    def get_purge_at(self, obj):
        if obj.deleted_at is None:
            return None
        return obj.deleted_at + timedelta(days=settings.INSPECTION_DELETE_GRACE_DAYS)

    def get_verification_status(self, obj):
        if obj.verified_at:
            return 'verified'
        if obj.revision_requested_at:
            return 'revision_requested'
        return 'pending'


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


class AssetAuditSerializer(serializers.ModelSerializer):
    actor_nama     = serializers.CharField(source='actor.nama_lengkap', read_only=True)
    actor_username = serializers.CharField(source='actor.username',     read_only=True)
    actor_role     = serializers.CharField(source='actor.role',         read_only=True)

    class Meta:
        model  = AssetAudit
        fields = [
            'audit_id', 'asset', 'actor', 'actor_nama', 'actor_username',
            'actor_role', 'action', 'diff', 'note', 'created_at',
        ]
        read_only_fields = fields


class NotificationSerializer(serializers.ModelSerializer):
    actor_nama     = serializers.CharField(source='actor.nama_lengkap', read_only=True)
    actor_username = serializers.CharField(source='actor.username',     read_only=True)
    actor_role     = serializers.CharField(source='actor.role',         read_only=True)
    is_read        = serializers.SerializerMethodField()
    target_label   = serializers.SerializerMethodField()
    link_url       = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ['notif_id', 'actor', 'actor_nama', 'actor_username', 'actor_role',
                  'verb', 'inspection', 'event', 'asset', 'component',
                  'target_label', 'link_url',
                  'is_read', 'read_at', 'created_at']
        read_only_fields = fields

    def get_is_read(self, obj):
        return obj.read_at is not None

    def get_target_label(self, obj):
        if obj.component_id and obj.component.asset_id:
            return f'{obj.component.get_component_type_display()} · {obj.component.asset.nama_gedung}'
        if obj.inspection_id and obj.inspection.asset_id:
            return obj.inspection.asset.nama_gedung
        if obj.event_id and obj.event.asset_id:
            return obj.event.asset.nama_gedung
        if obj.asset_id:
            return obj.asset.nama_gedung
        return ''

    def get_link_url(self, obj):
        if obj.inspection_id:
            return f'/inspections/{obj.inspection_id}'
        if obj.event_id:
            return f'/assets/{obj.event.asset_id}'
        if obj.component_id:
            return f'/assets/{obj.component.asset_id}'
        if obj.asset_id:
            if obj.verb == 'asset_delete':
                return '/assets/trash'
            return f'/assets/{obj.asset_id}'
        return '/'


class AssetMapSerializer(serializers.ModelSerializer):
    health_status = serializers.SerializerMethodField()
    health_band   = serializers.SerializerMethodField()
    ahi_safety    = serializers.SerializerMethodField()
    last_strike   = serializers.SerializerMethodField()
    last_inspection = serializers.SerializerMethodField()

    class Meta:
        model = AssetRegistry
        fields = [
            'asset_id', 'nama_gedung', 'lokasi_gps', 'lpl_grade',
            'skor_kesehatan_aset', 'health_status', 'health_band', 'ahi_safety',
            'last_strike', 'last_inspection',
        ]

    def _get_ahi_safety(self, obj):
        try:
            health = obj.cached_health()
            if health is not None:
                return health['ahi_safety']
        except Exception:
            logger.exception('ahi_safety failed for asset %s', obj.pk)
        return obj.skor_kesehatan_aset

    def get_ahi_safety(self, obj):
        return round(self._get_ahi_safety(obj), 4)

    def get_health_band(self, obj):
        # Per research §Q2(d): Green ≥ 0.85 / Orange 0.70–0.85 / Red 0.50–0.70 / Violet < 0.50
        s = self._get_ahi_safety(obj)
        if s >= 0.85:
            return 'hijau'
        elif s >= 0.70:
            return 'oranye'
        elif s >= 0.50:
            return 'merah'
        return 'ungu'

    def get_health_status(self, obj):
        # Legacy field — maps new bands to old aman/waspada/bahaya labels for backward compat
        band = self.get_health_band(obj)
        return 'aman' if band == 'hijau' else ('waspada' if band in ('oranye', 'merah') else 'bahaya')

    def get_last_strike(self, obj):
        event = _latest_through_chain(obj, 'events')
        return event.timestamp if event else None

    def get_last_inspection(self, obj):
        insp = _latest_through_chain(obj, 'inspections')
        return insp.tgl_inspeksi if insp else None
