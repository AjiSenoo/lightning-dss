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
from .models import AssetRegistry, LightningEvent, InspectionLog, InspectionLogAudit, InspectionPhoto, User, Organization
from .permissions import (
    IsManagerForAssets, IsManagerForUsers, IsOwnerOrManagerWithGrace,
)
from .serializers import (
    AssetRegistrySerializer, LightningEventSerializer,
    InspectionLogSerializer, InspectionLogAuditSerializer, UserSerializer, OrganizationSerializer,
    DashboardSummarySerializer, AssetMapSerializer,
)

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
        qs = super().get_queryset()
        org = _user_org(self.request)
        if org:
            qs = qs.filter(organization=org)
        lpl = self.request.query_params.get('lpl_grade')
        if lpl:
            qs = qs.filter(lpl_grade=lpl)
        return qs

    def perform_create(self, serializer):
        org = _user_org(self.request)
        serializer.save(organization=org)

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
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        return qs

    def perform_create(self, serializer):
        from fuzzy_engine import run_inference, calculate_ahi
        user = self.request.user if self.request and self.request.user.is_authenticated else None
        event = serializer.save(created_by=user)

        # Run fuzzy inference
        try:
            asset = event.asset
            r_stress = event.rasio_stres
            ahi_result = calculate_ahi(asset)
            d_asset = ahi_result['d_asset']
            fuzzy_result = run_inference(r_stress, d_asset)
            event.fuzzy_output_score = fuzzy_result['score']
            event.fuzzy_output_label = fuzzy_result['label']
            event.save(update_fields=['fuzzy_output_score', 'fuzzy_output_label'])
        except Exception as e:
            # Don't fail the request if fuzzy engine errors
            pass

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
        return qs

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
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
                    note='Log diperbarui dalam masa grace',
                )
            for f in new_photos:
                photo = InspectionPhoto.objects.create(inspection=updated, image=f)
                InspectionLogAudit.objects.create(
                    inspection=updated,
                    actor=request.user,
                    action='photo_added',
                    diff={'photo_id': str(photo.photo_id)},
                    note='Foto bukti ditambahkan',
                )

        return Response(InspectionLogSerializer(updated).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        from fuzzy_engine import update_asset_health

        non_ok_fields = ['status_air_terminal', 'status_down_conductor', 'status_grounding']
        needs_photo = any(request.data.get(f, 'OK') != 'OK' for f in non_ok_fields)
        if needs_photo and not request.FILES.getlist('photos'):
            return Response(
                {'photos': ['Foto bukti wajib jika ada komponen yang tidak OK.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asset_id = serializer.validated_data['asset'].asset_id
        asset = AssetRegistry.objects.get(pk=asset_id)
        health_before = asset.skor_kesehatan_aset

        save_kwargs = {}
        if not serializer.validated_data.get('user') and request.user.is_authenticated:
            save_kwargs['user'] = request.user

        with transaction.atomic():
            inspection = serializer.save(**save_kwargs)
            inspection.updated_by = request.user if request.user.is_authenticated else None
            inspection.save(update_fields=['updated_by', 'updated_at'])

            # Audit: create entry
            InspectionLogAudit.objects.create(
                inspection=inspection,
                actor=request.user if request.user.is_authenticated else None,
                action='create',
                diff={f: {'old': None, 'new': str(getattr(inspection, f)) if getattr(inspection, f) is not None else None}
                      for f in TRACKED_FIELDS},
                note='Inspeksi baru dibuat',
            )
            for f in request.FILES.getlist('photos'):
                photo = InspectionPhoto.objects.create(inspection=inspection, image=f)
                InspectionLogAudit.objects.create(
                    inspection=inspection,
                    actor=request.user if request.user.is_authenticated else None,
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
            health_after = health_before

        data = InspectionLogSerializer(inspection).data
        data['health_before'] = health_before
        data['health_after'] = health_after
        data['updated_asset'] = AssetRegistrySerializer(
            AssetRegistry.objects.get(pk=asset_id)
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
        return Response(InspectionLogSerializer(instance, context={'request': request}).data)

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
        if not (is_owner or is_manager):
            return Response(
                {'detail': 'Only the original submitter or a Manajer may amend this log.'},
                status=status.HTTP_403_FORBIDDEN,
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
        for item in items:
            sub_request = request._clone()
            sub_request._full_data = item
            response = view.create(sub_request)
            results.append({'success': response.status_code == 201, 'data': response.data})
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
