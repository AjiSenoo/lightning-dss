from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AssetRegistry, LightningEvent, InspectionLog, User
from .serializers import (
    AssetRegistrySerializer, LightningEventSerializer,
    InspectionLogSerializer, UserSerializer,
    DashboardSummarySerializer, AssetMapSerializer,
)


class AssetViewSet(viewsets.ModelViewSet):
    queryset = AssetRegistry.objects.all()
    serializer_class = AssetRegistrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        lpl = self.request.query_params.get('lpl_grade')
        if lpl:
            qs = qs.filter(lpl_grade=lpl)
        return qs

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

    def get_queryset(self):
        qs = super().get_queryset()
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        return qs

    def perform_create(self, serializer):
        from fuzzy_engine import run_inference, calculate_ahi
        event = serializer.save()

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
    def post(self, request):
        items = request.data if isinstance(request.data, list) else [request.data]
        results = []
        for item in items:
            serializer = LightningEventSerializer(data=item)
            if serializer.is_valid():
                view = EventViewSet()
                view.perform_create(serializer)
                instance = LightningEvent.objects.get(pk=serializer.instance.pk)
                results.append({'success': True, 'data': LightningEventSerializer(instance).data})
            else:
                results.append({'success': False, 'errors': serializer.errors})
        return Response(results, status=status.HTTP_200_OK)


class InspectionViewSet(viewsets.ModelViewSet):
    queryset = InspectionLog.objects.all()
    serializer_class = InspectionLogSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        asset_id = self.request.query_params.get('asset')
        if asset_id:
            qs = qs.filter(asset_id=asset_id)
        return qs

    def create(self, request, *args, **kwargs):
        from fuzzy_engine import update_asset_health
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Capture health before
        asset_id = serializer.validated_data['asset'].asset_id
        asset = AssetRegistry.objects.get(pk=asset_id)
        health_before = asset.skor_kesehatan_aset

        inspection = serializer.save()

        # Run feedback loop
        try:
            feedback = update_asset_health(
                asset=asset,
                inspection_log=inspection,
                linked_event=inspection.event,
            )
            health_after = feedback['health_after']
        except Exception:
            health_after = health_before

        # Return with health update info
        data = InspectionLogSerializer(inspection).data
        data['health_before'] = health_before
        data['health_after'] = health_after
        data['updated_asset'] = AssetRegistrySerializer(
            AssetRegistry.objects.get(pk=asset_id)
        ).data
        return Response(data, status=status.HTTP_201_CREATED)


class InspectionBatchView(APIView):
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
    queryset = User.objects.all()
    serializer_class = UserSerializer


class DashboardSummaryView(APIView):
    def get(self, request):
        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)
        data = {
            'total_assets': AssetRegistry.objects.count(),
            'assets_needing_inspection': AssetRegistry.objects.filter(skor_kesehatan_aset__lt=0.7).count(),
            'events_last_7_days': LightningEvent.objects.filter(timestamp__gte=seven_days_ago).count(),
            'critical_assets': AssetRegistry.objects.filter(skor_kesehatan_aset__lt=0.4).count(),
        }
        return Response(data)


class DashboardMapView(APIView):
    def get(self, request):
        assets = AssetRegistry.objects.all()
        serializer = AssetMapSerializer(assets, many=True)
        return Response(serializer.data)


class FuzzySimulateView(APIView):
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
    def get(self, request):
        return Response({'status': 'ok'})
