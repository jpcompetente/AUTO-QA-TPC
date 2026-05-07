"""
Main URL configuration for ai_ins_sys project
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import (
    AIModelViewSet,
    AdminSettingsViewSet,
    ComponentTypeViewSet,
    CustomTokenObtainPairView,
    InferenceLogViewSet,
    OperatorViewSet,
    RetrainingQueueViewSet,
    dashboard_stats,
    detect_image,
    inference_health,
    inference_metrics,
    operator_preset,
)

legacy_router = DefaultRouter()
legacy_router.register(r'admin/settings', AdminSettingsViewSet, basename='legacy-admin-settings')
legacy_router.register(r'component-types', ComponentTypeViewSet, basename='legacy-component-type')
legacy_router.register(r'operators', OperatorViewSet, basename='legacy-operator')
legacy_router.register(r'ai-models', AIModelViewSet, basename='legacy-ai-model')
legacy_router.register(r'inference-logs', InferenceLogViewSet, basename='legacy-inference-log')
legacy_router.register(r'retraining-queue', RetrainingQueueViewSet, basename='legacy-retraining-queue')

urlpatterns = [
    # Admin panel
    path('admin/', admin.site.urls),
    
    # Current API endpoints
    path('api/core/', include('core.urls')),

    # Backward-compatible API endpoints used by the existing React frontend
    path('api/dashboard/stats/', dashboard_stats),
    path('api/detect/', detect_image),
    path('api/inference/health/', inference_health),
    path('api/inference/metrics/', inference_metrics),
    path('api/operator/preset/', operator_preset),
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include(legacy_router.urls)),
    
    # DRF browsable API auth
    path('api/', include('rest_framework.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
