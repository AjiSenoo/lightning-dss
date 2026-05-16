from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    OrganizationViewSet,
    AssetViewSet, EventViewSet, EventBatchView,
    InspectionViewSet, InspectionBatchView,
    NotificationViewSet,
    UserViewSet, CurrentUserView,
    DashboardSummaryView, DashboardMapView,
    FuzzySimulateView, HealthCheckView,
)

router = DefaultRouter()
router.register(r'organizations', OrganizationViewSet, basename='organization')
router.register(r'assets', AssetViewSet, basename='asset')
router.register(r'events', EventViewSet, basename='event')
router.register(r'inspections', InspectionViewSet, basename='inspection')
router.register(r'users', UserViewSet, basename='user')
router.register(r'notifications', NotificationViewSet, basename='notifications')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', TokenObtainPairView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('events/batch/', EventBatchView.as_view(), name='event-batch'),
    path('inspections/batch/', InspectionBatchView.as_view(), name='inspection-batch'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('dashboard/map/', DashboardMapView.as_view(), name='dashboard-map'),
    path('fuzzy/simulate/', FuzzySimulateView.as_view(), name='fuzzy-simulate'),
    path('health/', HealthCheckView.as_view(), name='health-check'),
]
