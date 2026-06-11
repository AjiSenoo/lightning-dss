import logging
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.conf import settings
from django.shortcuts import get_object_or_404
import datetime
from .models import (
    AssetRegistry, AssetAudit, LightningEvent, InspectionLog, InspectionLogAudit,
    InspectionPhoto, Notification, User, Organization,
    AssetComponent, ComponentMaintenanceAction,
)
from .permissions import (
    IsManagerForAssets, IsManagerForUsers, IsOwnerOrManagerWithGrace,
)
from .serializers import (
    AssetRegistrySerializer, AssetAuditSerializer, LightningEventSerializer,
    InspectionLogSerializer, InspectionLogAuditSerializer, NotificationSerializer,
    UserSerializer, OrganizationSerializer,
    AssetMapSerializer,
    AssetComponentSerializer, ComponentMaintenanceActionSerializer,
)

logger = logging.getLogger(__name__)

TRACKED_FIELDS = [
    'tgl_inspeksi',
    'status_air_terminal', 'status_down_conductor', 'status_grounding',
    'resistansi_grounding_ohm',
    'status_spd', 'arus_bocor_spd_ma',
    'status_bonding', 'status_kabel_instalasi',
    'catatan_teknisi',
]


def _snapshot(log):
    return {f: getattr(log, f) for f in TRACKED_FIELDS}


def _compute_diff(before, after):
    diff = {}
    for f in TRACKED_FIELDS:
        bv, av = before.get(f), after.get(f)
        if bv != av:
            diff[f] = {
                'old': None if bv is None else str(bv),
                'new': None if av is None else str(av),
            }
    return diff


def _user_org(request):
    """Return the authenticated user's Organization, or None for superusers without an org."""
    return getattr(request.user, 'organization', None)


# -- Notification dispatchers ------------------------------------------------

def _laporan_recipients(inspection, actor):
    """Cross-role recipients for a laporan state change, excluding the actor."""
    if not actor or not getattr(actor, 'is_authenticated', False):
        return User.objects.none()
    org = getattr(actor, 'organization', None)
    actor_role = getattr(actor, 'role', None)

    if actor_role == 'Teknisi':
        qs = User.objects.filter(role='Manajer', is_active=True)
        if org:
            qs = qs.filter(organization=org)
        return qs.exclude(pk=actor.pk)

    if actor_role == 'Manajer':
        creator = inspection.user
        if creator and creator.pk != actor.pk and creator.is_active:
            return User.objects.filter(pk=creator.pk)

    return User.objects.none()


def _emit_laporan_notification(inspection, actor, verb):
    recipients = _laporan_recipients(inspection, actor)
    if not recipients.exists():
        return
    rows = [Notification(recipient=r, actor=actor, verb=verb, inspection=inspection)
            for r in recipients]
    Notification.objects.bulk_create(rows)


def _emit_lightning_broadcast(event):
    """Fan-out: notify every Teknisi in the asset's org (excluding the recorder if they're a teknisi)."""
    org = event.asset.organization
    qs = User.objects.filter(role='Teknisi', is_active=True)
    if org:
        qs = qs.filter(organization=org)
    actor = event.created_by
    if actor:
        qs = qs.exclude(pk=actor.pk)
    rows = [Notification(recipient=r, actor=actor, verb='lightning', event=event) for r in qs]
    if rows:
        Notification.objects.bulk_create(rows)


def _emit_asset_notification(asset, actor, verb):
    """Notify all active users in the asset's org (except the actor) about an asset change."""
    org = asset.organization
    qs = User.objects.filter(is_active=True)
    if org:
        qs = qs.filter(organization=org)
    if actor:
        qs = qs.exclude(pk=actor.pk)
    rows = [Notification(recipient=r, actor=actor, verb=verb, asset=asset) for r in qs]
    if rows:
        Notification.objects.bulk_create(rows)


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = _user_org(self.request)
        if org:
            return Organization.objects.filter(pk=org.pk)
        return Organization.objects.all()


class AssetViewSet(viewsets.ModelViewSet):
    queryset = AssetRegistry.objects.all()
    serializer_class = AssetRegistrySerializer
    permission_classes = [IsManagerForAssets]

    def get_queryset(self):
        qs = AssetRegistry.objects.all()
        if self.request.query_params.get('include_deleted') != 'true':
            qs = qs.filter(deleted_at__isnull=True)
        org = _user_org(self.request)
        if org:
            qs = qs.filter(organization=org)
        lpl = self.request.query_params.get('lpl_grade')
        if lpl:
            qs = qs.filter(lpl_grade=lpl)
        return qs

    def perform_create(self, serializer):
        org = _user_org(self.request)
        asset = serializer.save(organization=org)
        AssetAudit.objects.create(
            asset=asset, actor=self.request.user, action='create',
            diff={'nama_gedung': asset.nama_gedung, 'lpl_grade': asset.lpl_grade},
            note='Aset baru ditambahkan',
        )
        _emit_asset_notification(asset, self.request.user, 'asset_create')

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response(
                {'detail': 'Aset di Tempat Sampah harus dipulihkan dulu sebelum diedit.'},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        tracked = [
            'nama_gedung', 'lokasi_gps', 'lpl_grade', 'tahun_instalasi',
            'jenis_material_konduktor', 'resistivitas_tanah', 'catatan',
            'skor_kesehatan_aset',
        ]
        diff = {}
        for f in tracked:
            old = getattr(instance, f)
            new = serializer.validated_data.get(f, old)
            if old != new:
                diff[f] = {'old': str(old) if old is not None else None,
                            'new': str(new) if new is not None else None}
        with transaction.atomic():
            updated = serializer.save()
            if diff:
                AssetAudit.objects.create(
                    asset=updated, actor=request.user, action='update',
                    diff=diff, note='Aset diedit oleh Manajer',
                )
                _emit_asset_notification(updated, request.user, 'asset_update')
        return Response(AssetRegistrySerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response(
                {'detail': 'Aset sudah di Tempat Sampah.'},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            instance.deleted_at = timezone.now()
            instance.deleted_by = request.user
            instance.save(update_fields=['deleted_at', 'deleted_by'])
            AssetAudit.objects.create(
                asset=instance, actor=request.user, action='delete',
                note='Aset dipindah ke Tempat Sampah',
            )
            _emit_asset_notification(instance, request.user, 'asset_delete')
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def trash(self, request):
        org = _user_org(request)
        qs = AssetRegistry.objects.filter(deleted_at__isnull=False)
        if org:
            qs = qs.filter(organization=org)
        qs = qs.select_related('deleted_by').order_by('-deleted_at')
        page = self.paginate_queryset(qs)
        serializer = AssetRegistrySerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def restore(self, request, pk=None):
        org = _user_org(request)
        base_qs = AssetRegistry.objects.filter(organization=org) if org else AssetRegistry.objects.all()
        instance = get_object_or_404(base_qs, pk=pk, deleted_at__isnull=False)
        with transaction.atomic():
            instance.deleted_at = None
            instance.deleted_by = None
            instance.save(update_fields=['deleted_at', 'deleted_by'])
            AssetAudit.objects.create(
                asset=instance, actor=request.user, action='restore',
                note='Aset dipulihkan dari Tempat Sampah',
            )
            _emit_asset_notification(instance, request.user, 'asset_restore')
        return Response(AssetRegistrySerializer(instance).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def replace(self, request, pk=None):
        old = self.get_object()
        if old.deleted_at is not None:
            return Response({'detail': 'Aset sudah di Tempat Sampah.'}, status=status.HTTP_409_CONFLICT)
        catatan_penggantian = (request.data.get('catatan_penggantian') or '').strip()
        if not catatan_penggantian:
            return Response({'detail': 'Catatan penggantian wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        new_data = {
            'nama_gedung':             request.data.get('nama_gedung', old.nama_gedung),
            'lokasi_gps':              request.data.get('lokasi_gps', old.lokasi_gps),
            'lpl_grade':               request.data.get('lpl_grade', old.lpl_grade),
            'tahun_instalasi':         request.data.get('tahun_instalasi', old.tahun_instalasi),
            'jenis_material_konduktor': request.data.get('jenis_material_konduktor', old.jenis_material_konduktor),
            'resistivitas_tanah':      request.data.get('resistivitas_tanah', old.resistivitas_tanah),
            'catatan':                 request.data.get('catatan', old.catatan),
        }
        serializer = self.get_serializer(data=new_data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            new_asset = serializer.save(organization=old.organization)
            old.deleted_at = timezone.now()
            old.deleted_by = request.user
            old.save(update_fields=['deleted_at', 'deleted_by'])
            AssetAudit.objects.create(
                asset=old, actor=request.user, action='replace_out',
                note=catatan_penggantian,
                diff={'new_asset_id': str(new_asset.asset_id)},
            )
            AssetAudit.objects.create(
                asset=new_asset, actor=request.user, action='replace_in',
                note=catatan_penggantian,
                diff={'old_asset_id': str(old.asset_id)},
            )
            _emit_asset_notification(old, request.user, 'asset_delete')
            _emit_asset_notification(new_asset, request.user, 'asset_create')
        return Response(
            AssetRegistrySerializer(new_asset, context={'request': request, 'view': self}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'])
    def audits(self, request, pk=None):
        asset = self.get_object()
        qs = asset.audits.select_related('actor').order_by('created_at')
        return Response(AssetAuditSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        asset = self.get_object()
        events = asset.events.all().order_by('-timestamp')[:50]
        inspections = asset.inspections.all().order_by('-tgl_inspeksi')[:50]

        event_data = LightningEventSerializer(events, many=True).data
        inspection_data = InspectionLogSerializer(inspections, many=True).data

        # Interleave by date
        timeline = []
        for e in event_data:
            timeline.append({'type': 'event', 'date': e['timestamp'], 'data': e})
        for i in inspection_data:
            timeline.append({'type': 'inspection', 'date': i['tgl_inspeksi'], 'data': i})
        timeline.sort(key=lambda x: x['date'] or '', reverse=True)

        return Response(timeline)


class EventViewSet(viewsets.ModelViewSet):
    queryset = LightningEvent.objects.all()
    serializer_class = LightningEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        org = _user_org(self.request)
        if org:
            qs = qs.filter(asset__organization=org)
        params = self.request.query_params
        asset_id = params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        date_from = params.get('from')
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        date_to = params.get('to')
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        urgency = params.get('urgency')
        if urgency:
            qs = qs.filter(fuzzy_output_label__iexact=urgency)
        return qs.order_by('-timestamp')

    def perform_create(self, serializer):
        from fuzzy_engine import calculate_asset_health, run_inference_per_component
        user = self.request.user if self.request and self.request.user.is_authenticated else None
        with transaction.atomic():
            event = serializer.save(created_by=user)
            _emit_lightning_broadcast(event)

        # Run per-component fuzzy inference outside the transaction
        try:
            asset = event.asset
            health = calculate_asset_health(asset)
            ahi_by_type = {ct: r['ahi'] for ct, r in health['per_component'].items()}
            r_stress = event.rasio_stres
            fuzzy = run_inference_per_component(r_stress, ahi_by_type)
            asset_result = fuzzy['asset']
            # Write fuzzy outputs without going through LightningEvent.save(), which
            # would re-trigger a (redundant) asset health recompute.
            LightningEvent.objects.filter(pk=event.pk).update(
                fuzzy_output_score=asset_result['score'],
                fuzzy_output_label=asset_result['label'],
            )
        except Exception:
            logger.exception('per-component fuzzy inference failed for event %s', event.pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Re-fetch to get computed fields
        instance = LightningEvent.objects.get(pk=serializer.instance.pk)
        return Response(LightningEventSerializer(instance).data, status=status.HTTP_201_CREATED)


class EventBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = request.data if isinstance(request.data, list) else [request.data]
        results = []
        view = EventViewSet()
        view.request = request
        for item in items:
            serializer = LightningEventSerializer(data=item)
            if serializer.is_valid():
                view.perform_create(serializer)
                instance = LightningEvent.objects.get(pk=serializer.instance.pk)
                results.append({'success': True, 'data': LightningEventSerializer(instance).data})
            else:
                results.append({'success': False, 'errors': serializer.errors})
        return Response(results, status=status.HTTP_200_OK)


class InspectionViewSet(viewsets.ModelViewSet):
    queryset = InspectionLog.objects.all()
    serializer_class = InspectionLogSerializer
    permission_classes = [IsOwnerOrManagerWithGrace]

    def get_queryset(self):
        qs = super().get_queryset()
        org = _user_org(self.request)
        if org:
            qs = qs.filter(asset__organization=org)

        # Route-specific deleted_at filtering
        if self.action == 'trash':
            qs = qs.filter(deleted_at__isnull=False)
        elif self.action == 'restore':
            # restore needs to find deleted rows — filter applied in the action itself
            pass
        else:
            qs = qs.filter(deleted_at__isnull=True)

        params = self.request.query_params
        asset_id = params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        date_from = params.get('from')
        if date_from:
            qs = qs.filter(tgl_inspeksi__gte=date_from)
        date_to = params.get('to')
        if date_to:
            qs = qs.filter(tgl_inspeksi__lte=date_to)
        if params.get('issues_only', '').lower() in ('true', '1', 'yes'):
            qs = qs.filter(
                ~Q(status_air_terminal='OK')
                | ~Q(status_down_conductor='OK')
                | ~Q(status_grounding='OK')
            )
        verification = params.get('verification')
        if verification == 'verified':
            qs = qs.filter(verified_at__isnull=False)
        elif verification == 'revision_requested':
            qs = qs.filter(revision_requested_at__isnull=False, verified_at__isnull=True)
        elif verification == 'pending':
            qs = qs.filter(verified_at__isnull=True, revision_requested_at__isnull=True)
        return qs

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response(
                {'detail': 'Laporan di Tempat Sampah harus dipulihkan dulu sebelum diedit.'},
                status=status.HTTP_409_CONFLICT,
            )
        if instance.verified_at is not None:
            return Response(
                {'detail': 'Laporan sudah terverifikasi. Cabut verifikasi terlebih dahulu sebelum mengedit.'},
                status=status.HTTP_409_CONFLICT,
            )
        partial = kwargs.pop('partial', False)
        non_ok_fields = ['status_air_terminal', 'status_down_conductor', 'status_grounding']
        def status_val(field):
            return request.data.get(field, getattr(instance, field, 'OK'))
        needs_photo = any(status_val(f) != 'OK' for f in non_ok_fields)
        existing_photos = instance.photos.exists()
        new_photos = request.FILES.getlist('photos')
        if needs_photo and not existing_photos and not new_photos:
            return Response(
                {'photos': ['Foto bukti wajib jika ada komponen yang tidak OK.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asset = instance.asset
        health_before = asset.skor_kesehatan_aset

        before = _snapshot(instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            updated = serializer.save()
            after = _snapshot(updated)
            diff = _compute_diff(before, after)
            updated.updated_by = request.user
            updated.save(update_fields=['updated_by', 'updated_at'])

            if diff or new_photos:
                InspectionLogAudit.objects.create(
                    inspection=updated,
                    actor=request.user,
                    action='update',
                    diff=diff,
                    note='Log diperbarui',
                )
                _emit_laporan_notification(updated, request.user, 'update')
            for f in new_photos:
                photo = InspectionPhoto.objects.create(inspection=updated, image=f)
                InspectionLogAudit.objects.create(
                    inspection=updated,
                    actor=request.user,
                    action='photo_added',
                    diff={'photo_id': str(photo.photo_id)},
                    note='Foto bukti ditambahkan',
                )

        from fuzzy_engine import update_asset_health
        try:
            feedback = update_asset_health(
                asset=asset,
                inspection_log=updated,
                linked_event=updated.event,
            )
            health_after = feedback['health_after']
        except Exception:
            logger.exception('update_asset_health failed after editing inspection %s', updated.pk)
            health_after = asset.skor_kesehatan_aset

        InspectionLog.objects.filter(pk=updated.pk).update(health_after=health_after)

        data = InspectionLogSerializer(updated).data
        data['health_before'] = health_before
        data['health_after'] = health_after
        return Response(data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def _persist_inspection(self, serializer, actor, photos):
        """
        Persist a validated inspection serializer + audit/notification/feedback side effects.

        Shared by the single-create endpoint and the offline-sync batch endpoint so both
        paths stay in lockstep. `actor` may be None (unauthenticated). `photos` is an
        iterable of uploaded files (empty for JSON batch payloads).

        Returns (inspection, health_before, health_after).
        """
        from fuzzy_engine import update_asset_health

        asset_id = serializer.validated_data['asset'].asset_id
        asset = AssetRegistry.objects.get(pk=asset_id)
        health_before = asset.skor_kesehatan_aset

        save_kwargs = {}
        if not serializer.validated_data.get('user') and actor is not None:
            save_kwargs['user'] = actor

        with transaction.atomic():
            inspection = serializer.save(**save_kwargs)
            inspection.updated_by = actor
            inspection.save(update_fields=['updated_by', 'updated_at'])

            InspectionLogAudit.objects.create(
                inspection=inspection,
                actor=actor,
                action='create',
                diff={f: {'old': None, 'new': str(getattr(inspection, f)) if getattr(inspection, f) is not None else None}
                      for f in TRACKED_FIELDS},
                note='Inspeksi baru dibuat',
            )
            _emit_laporan_notification(inspection, actor, 'create')
            for f in photos:
                photo = InspectionPhoto.objects.create(inspection=inspection, image=f)
                InspectionLogAudit.objects.create(
                    inspection=inspection,
                    actor=actor,
                    action='photo_added',
                    diff={'photo_id': str(photo.photo_id)},
                    note='Foto bukti ditambahkan',
                )

        try:
            feedback = update_asset_health(
                asset=asset,
                inspection_log=inspection,
                linked_event=inspection.event,
            )
            health_after = feedback['health_after']
        except Exception:
            logger.exception('update_asset_health failed after creating inspection %s', inspection.pk)
            health_after = health_before

        InspectionLog.objects.filter(pk=inspection.pk).update(health_after=health_after)
        return inspection, health_before, health_after

    def create(self, request, *args, **kwargs):
        non_ok_fields = ['status_air_terminal', 'status_down_conductor', 'status_grounding']
        needs_photo = any(request.data.get(f, 'OK') != 'OK' for f in non_ok_fields)
        if needs_photo and not request.FILES.getlist('photos'):
            return Response(
                {'photos': ['Foto bukti wajib jika ada komponen yang tidak OK.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        actor = request.user if request.user.is_authenticated else None
        inspection, health_before, health_after = self._persist_inspection(
            serializer, actor, request.FILES.getlist('photos')
        )

        data = InspectionLogSerializer(inspection).data
        data['health_before'] = health_before
        data['health_after'] = health_after
        data['updated_asset'] = AssetRegistrySerializer(
            AssetRegistry.objects.get(pk=inspection.asset_id)
        ).data
        return Response(data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response({'detail': 'Sudah ada di Tempat Sampah.'}, status=status.HTTP_409_CONFLICT)
        grace_days = settings.INSPECTION_DELETE_GRACE_DAYS
        purge_date = (timezone.now() + timedelta(days=grace_days)).date()
        with transaction.atomic():
            instance.deleted_at = timezone.now()
            instance.deleted_by = request.user
            instance.save(update_fields=['deleted_at', 'deleted_by'])
            InspectionLogAudit.objects.create(
                inspection=instance,
                actor=request.user,
                action='delete',
                note=f'Dipindah ke Tempat Sampah; akan dihapus permanen pada {purge_date}',
            )
            _emit_laporan_notification(instance, request.user, 'delete')
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def trash(self, request):
        qs = self.get_queryset().select_related('deleted_by', 'asset', 'user')
        page = self.paginate_queryset(qs)
        serializer = InspectionLogSerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def restore(self, request, pk=None):
        org = _user_org(request)
        base_qs = InspectionLog.objects.filter(asset__organization=org) if org else InspectionLog.objects.all()
        instance = get_object_or_404(base_qs, pk=pk, deleted_at__isnull=False)
        with transaction.atomic():
            instance.deleted_at = None
            instance.deleted_by = None
            instance.updated_by = request.user
            instance.save(update_fields=['deleted_at', 'deleted_by', 'updated_by', 'updated_at'])
            InspectionLogAudit.objects.create(
                inspection=instance,
                actor=request.user,
                action='restore',
                note='Laporan dipulihkan dari Tempat Sampah',
            )
            _emit_laporan_notification(instance, request.user, 'restore')
        return Response(InspectionLogSerializer(instance, context={'request': request}).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def verify(self, request, pk=None):
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response(
                {'detail': 'Tidak dapat memverifikasi laporan di Tempat Sampah.'},
                status=status.HTTP_409_CONFLICT,
            )
        if instance.verified_at is not None:
            return Response(
                {'detail': 'Laporan sudah terverifikasi. Cabut verifikasi terlebih dahulu jika ingin memverifikasi ulang.'},
                status=status.HTTP_409_CONFLICT,
            )
        had_revision = bool(instance.revision_requested_at)
        prior_note = instance.revision_request_note
        with transaction.atomic():
            now = timezone.now()
            instance.verified_at = now
            instance.verified_by = request.user
            instance.revision_requested_at = None
            instance.revision_requested_by = None
            instance.revision_request_note = ''
            instance.updated_at = now
            instance.save(update_fields=[
                'verified_at', 'verified_by',
                'revision_requested_at', 'revision_requested_by', 'revision_request_note',
                'updated_at',
            ])
            if had_revision:
                audit_diff = {'resolves_revision': True, 'prior_note': prior_note}
                audit_note = 'Verifikasi — menyelesaikan permintaan revisi'
            else:
                audit_diff = {}
                audit_note = 'Laporan diverifikasi oleh Manajer'
            InspectionLogAudit.objects.create(
                inspection=instance,
                actor=request.user,
                action='verify',
                diff=audit_diff,
                note=audit_note,
            )
            _emit_laporan_notification(instance, request.user, 'verify')
        return Response(InspectionLogSerializer(instance).data)


    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerForUsers])
    def request_revision(self, request, pk=None):
        instance = self.get_object()
        if instance.deleted_at is not None:
            return Response(
                {'detail': 'Tidak dapat meminta revisi laporan di Tempat Sampah.'},
                status=status.HTTP_409_CONFLICT,
            )
        if instance.verified_at is not None:
            return Response(
                {'detail': 'Laporan sudah terverifikasi dan tidak dapat diminta revisi.'},
                status=status.HTTP_409_CONFLICT,
            )
        note = (request.data.get('note') or '').strip()
        if not note:
            return Response({'note': ['Catatan revisi wajib diisi.']}, status=status.HTTP_400_BAD_REQUEST)
        if len(note) > 500:
            return Response({'note': ['Catatan revisi maksimum 500 karakter.']}, status=status.HTTP_400_BAD_REQUEST)
        old_note = instance.revision_request_note or None
        with transaction.atomic():
            instance.revision_requested_at = timezone.now()
            instance.revision_requested_by = request.user
            instance.revision_request_note = note
            instance.save(update_fields=[
                'revision_requested_at', 'revision_requested_by', 'revision_request_note', 'updated_at',
            ])
            audit_label = 'Catatan revisi diperbarui' if old_note else 'Revisi diminta'
            InspectionLogAudit.objects.create(
                inspection=instance,
                actor=request.user,
                action='request_revision',
                diff={'note': {'old': old_note, 'new': note}},
                note=f'{audit_label}: {note[:120]}',
            )
            _emit_laporan_notification(instance, request.user, 'request_revision')
        return Response(InspectionLogSerializer(instance).data)

    @action(detail=True, methods=['get'])
    def audit(self, request, pk=None):
        log = self.get_object()
        rows = log.audit_trail.select_related('actor').all()
        return Response(InspectionLogAuditSerializer(rows, many=True).data)

    @action(detail=True, methods=['post'])
    def amend(self, request, pk=None):
        """
        Submit a correction after the edit grace window. Creates a new linked log.
        Allowed for: original log's user, or any Manajer.
        """
        original = self.get_object()
        is_owner = original.user_id == request.user.id
        is_manager = getattr(request.user, 'role', None) == 'Manajer'
        if not is_manager:
            if not is_owner:
                return Response(
                    {'detail': 'Only the original submitter or a Manajer may amend this log.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if original.verified_at is not None:
                return Response(
                    {'detail': 'Laporan sudah terverifikasi. Hanya Manajer yang dapat membuat amandemen.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if original.amends_id is not None:
            return Response(
                {'detail': 'Amandemen tidak dapat diamandemen lagi. Buat amandemen dari laporan asli.'},
                status=status.HTTP_409_CONFLICT,
            )
        if original.amendments.exists():
            return Response(
                {'detail': 'Laporan ini sudah memiliki amandemen. Setiap laporan hanya dapat diamandemen satu kali.'},
                status=status.HTTP_409_CONFLICT,
            )

        from fuzzy_engine import update_asset_health

        non_ok_fields = ['status_air_terminal', 'status_down_conductor', 'status_grounding']
        needs_photo = any(request.data.get(f, 'OK') != 'OK' for f in non_ok_fields)
        if needs_photo and not request.FILES.getlist('photos'):
            return Response(
                {'photos': ['Foto bukti wajib jika ada komponen yang tidak OK.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data.dict() if hasattr(request.data, 'dict') else dict(request.data)
        payload['asset'] = str(original.asset_id)
        if original.event_id:
            payload['event'] = str(original.event_id)

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        asset = original.asset
        health_before = asset.skor_kesehatan_aset
        save_kwargs = {'amends': original}
        if not serializer.validated_data.get('user'):
            save_kwargs['user'] = request.user

        orig_snapshot = _snapshot(original)

        with transaction.atomic():
            locked_original = InspectionLog.objects.select_for_update().get(pk=original.pk)
            if locked_original.amendments.exists():
                return Response(
                    {'detail': 'Laporan ini sudah memiliki amandemen. Setiap laporan hanya dapat diamandemen satu kali.'},
                    status=status.HTTP_409_CONFLICT,
                )
            amendment = serializer.save(**save_kwargs)
            amend_snapshot = _snapshot(amendment)
            diff = _compute_diff(orig_snapshot, amend_snapshot)

            amendment.updated_by = request.user
            amendment.save(update_fields=['updated_by', 'updated_at'])

            InspectionLogAudit.objects.create(
                inspection=amendment,
                actor=request.user,
                action='amend',
                diff={'target_log_id': str(original.log_id), **diff},
                note=f'Amandemen dari log {str(original.log_id)[:8]}',
            )
            InspectionLogAudit.objects.create(
                inspection=original,
                actor=request.user,
                action='amended_by',
                diff={'target_log_id': str(amendment.log_id)},
                note=f'Log ini diamandemen menjadi log {str(amendment.log_id)[:8]}',
            )
            _emit_laporan_notification(amendment, request.user, 'amend')
            for f in request.FILES.getlist('photos'):
                photo = InspectionPhoto.objects.create(inspection=amendment, image=f)
                InspectionLogAudit.objects.create(
                    inspection=amendment,
                    actor=request.user,
                    action='photo_added',
                    diff={'photo_id': str(photo.photo_id)},
                    note='Foto bukti ditambahkan',
                )

        try:
            feedback = update_asset_health(
                asset=asset,
                inspection_log=amendment,
                linked_event=amendment.event,
            )
            health_after = feedback['health_after']
        except Exception:
            logger.exception('update_asset_health failed after amending inspection %s', amendment.pk)
            health_after = health_before

        data = InspectionLogSerializer(amendment).data
        data['health_before'] = health_before
        data['health_after'] = health_after
        data['amends'] = str(original.log_id)
        return Response(data, status=status.HTTP_201_CREATED)


class InspectionBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = request.data if isinstance(request.data, list) else [request.data]
        results = []
        view = InspectionViewSet()
        view.request = request
        view.format_kwarg = None
        actor = request.user if request.user.is_authenticated else None
        # Batch payloads are JSON only (no multipart file uploads), so any item whose
        # status fields require photo evidence is rejected — those must be submitted
        # individually via the multipart /inspections/ endpoint.
        non_ok_fields = ['status_air_terminal', 'status_down_conductor', 'status_grounding']
        for item in items:
            if any(item.get(f, 'OK') != 'OK' for f in non_ok_fields):
                results.append({
                    'success': False,
                    'errors': {'photos': ['Foto bukti wajib — kirim laporan ini satu per satu, bukan via batch.']},
                })
                continue
            serializer = InspectionLogSerializer(data=item, context={'request': request})
            if not serializer.is_valid():
                results.append({'success': False, 'errors': serializer.errors})
                continue
            inspection, health_before, health_after = view._persist_inspection(serializer, actor, [])
            data = InspectionLogSerializer(inspection).data
            data['health_before'] = health_before
            data['health_after'] = health_after
            results.append({'success': True, 'data': data})
        return Response(results, status=status.HTTP_200_OK)


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsManagerForUsers]

    def get_queryset(self):
        org = _user_org(self.request)
        if org:
            return User.objects.filter(organization=org)
        return User.objects.all()

    def perform_create(self, serializer):
        org = _user_org(self.request)
        serializer.save(organization=org)


class CurrentUserView(APIView):
    """Return the authenticated user's profile. Used by the frontend to render role-aware UI."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class   = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (Notification.objects
                .filter(recipient=self.request.user)
                .select_related('actor',
                                'inspection', 'inspection__asset',
                                'event', 'event__asset',
                                'asset'))

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        if notif.read_at is None:
            notif.read_at = timezone.now()
            notif.save(update_fields=['read_at'])
        return Response(NotificationSerializer(notif).data)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        n = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({'marked': n})


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models.functions import TruncDate
        from django.db.models import Count

        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)
        org = _user_org(request)
        assets_qs = AssetRegistry.objects.filter(organization=org) if org else AssetRegistry.objects.all()
        events_qs = LightningEvent.objects.filter(asset__organization=org) if org else LightningEvent.objects.all()
        inspections_qs = InspectionLog.objects.filter(asset__organization=org) if org else InspectionLog.objects.all()

        # Refresh any assets whose AHI snapshot is older than the TTL so the SQL
        # ordering/thresholds below reflect current age-based decay.
        ttl_hours = getattr(settings, 'HEALTH_RECOMPUTE_TTL_HOURS', 6)
        stale_cutoff = now - timedelta(hours=ttl_hours)
        stale_assets = assets_qs.filter(
            Q(health_recomputed_at__isnull=True) | Q(health_recomputed_at__lt=stale_cutoff)
        )
        for _a in stale_assets.iterator():
            _a.recompute_health()

        # 7-day event sparkline (counts per day, padded with zeros for missing days)
        event_buckets = (
            events_qs.filter(timestamp__gte=seven_days_ago)
            .annotate(day=TruncDate('timestamp'))
            .values('day')
            .annotate(count=Count('event_id'))
            .order_by('day')
        )
        bucket_map = {b['day']: b['count'] for b in event_buckets}
        sparkline = []
        for i in range(6, -1, -1):
            day = (now - timedelta(days=i)).date()
            sparkline.append({'day': day.isoformat(), 'count': bucket_map.get(day, 0)})

        # Recent activity feeds (top 5 each)
        recent_events = events_qs.order_by('-timestamp')[:5]
        recent_inspections = inspections_qs.order_by('-tgl_inspeksi')[:5]

        # Top 3 critical assets (lowest health)
        critical_top3 = assets_qs.order_by('skor_kesehatan_aset')[:3]

        data = {
            'total_assets': assets_qs.count(),
            'assets_needing_inspection': assets_qs.filter(skor_kesehatan_aset__lt=0.7).count(),
            'events_last_7_days': events_qs.filter(timestamp__gte=seven_days_ago).count(),
            'critical_assets': assets_qs.filter(skor_kesehatan_aset__lt=0.4).count(),
            'events_sparkline': sparkline,
            'recent_events': LightningEventSerializer(recent_events, many=True).data,
            'recent_inspections': InspectionLogSerializer(recent_inspections, many=True).data,
            'critical_top3': AssetRegistrySerializer(critical_top3, many=True).data,
        }
        return Response(data)


class DashboardMapView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = _user_org(request)
        assets = AssetRegistry.objects.filter(organization=org) if org else AssetRegistry.objects.all()
        serializer = AssetMapSerializer(assets, many=True)
        return Response(serializer.data)


class FuzzySimulateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from fuzzy_engine import run_inference
        try:
            r_stress = float(request.query_params.get('r_stress', 0.5))
            d_asset = float(request.query_params.get('d_asset', 0.3))
        except (ValueError, TypeError):
            return Response({'error': 'r_stress and d_asset must be numeric'}, status=400)

        result = run_inference(r_stress, d_asset)
        return Response(result)


class HealthCheckView(APIView):
    # Public so the offline-detection ping works without a token.
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        return Response({'status': 'ok'})


class AssetComponentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only list/retrieve of components per asset.
    GET /api/components/?asset=<uuid>   — active components for an asset
    GET /api/components/<uuid>/         — single component detail
    """
    serializer_class = AssetComponentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AssetComponent.objects.filter(deleted_at__isnull=True)
        org = _user_org(self.request)
        if org:
            qs = qs.filter(asset__organization=org)
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        active_only = self.request.query_params.get('active', 'true').lower()
        if active_only in ('true', '1', 'yes'):
            qs = qs.filter(end_date__isnull=True)
        return qs.select_related('asset').order_by('component_type', '-install_date')


class ComponentMaintenanceActionViewSet(viewsets.ModelViewSet):
    """
    List and create maintenance actions. POST with action='replace' atomically
    end-dates the current component and creates a new one.

    GET  /api/maintenance-actions/?asset=<uuid>
    GET  /api/maintenance-actions/?component=<uuid>
    POST /api/maintenance-actions/
    """
    serializer_class = ComponentMaintenanceActionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = ComponentMaintenanceAction.objects.all()
        org = _user_org(self.request)
        if org:
            qs = qs.filter(asset__organization=org)
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        component_id = self.request.query_params.get('component')
        if component_id:
            qs = qs.filter(component_id=component_id)
        return qs.select_related('asset', 'component', 'performed_by').order_by('-performed_at')

    def create(self, request, *_args, **_kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_type      = serializer.validated_data['action']
        component        = serializer.validated_data['component']
        performed_at     = serializer.validated_data['performed_at']

        with transaction.atomic():
            if action_type == 'replace':
                # End-date the current component and create its successor
                install_date = performed_at.date() if hasattr(performed_at, 'date') else performed_at
                old_component = component

                new_component = AssetComponent.objects.create(
                    asset=old_component.asset,
                    component_type=old_component.component_type,
                    install_date=install_date,
                    design_capacity_ka=old_component.design_capacity_ka,
                )
                old_component.end_date = install_date
                old_component.replaced_by = new_component
                old_component.save(update_fields=['end_date', 'replaced_by', 'updated_at'])

                # Record the action against the NEW component
                maintenance_action = ComponentMaintenanceAction.objects.create(
                    asset=old_component.asset,
                    component=new_component,
                    action='replace',
                    performed_at=performed_at,
                    performed_by=request.user,
                    notes=serializer.validated_data.get('notes', ''),
                )
            else:
                maintenance_action = serializer.save(performed_by=request.user)

            component.asset.recompute_health()

        return Response(
            ComponentMaintenanceActionSerializer(maintenance_action, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
