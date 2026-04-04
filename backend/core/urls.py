from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AssetViewSet, EventViewSet, EventBatchView,
    InspectionViewSet, InspectionBatchView,
    UserViewSet, DashboardSummaryView, DashboardMapView,
    FuzzySimulateView, HealthCheckView,
)

router = DefaultRouter()
router.register(r'assets', AssetViewSet, basename='asset')
router.register(r'events', EventViewSet, basename='event')
router.register(r'inspections', InspectionViewSet, basename='inspection')
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('events/batch/', EventBatchView.as_view(), name='event-batch'),
    path('inspections/batch/', InspectionBatchView.as_view(), name='inspection-batch'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('dashboard/map/', DashboardMapView.as_view(), name='dashboard-map'),
    path('fuzzy/simulate/', FuzzySimulateView.as_view(), name='fuzzy-simulate'),
    path('health/', HealthCheckView.as_view(), name='health-check'),
]
