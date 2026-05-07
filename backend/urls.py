# backend/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

# Import only the views that exist in your new core/views.py
from core.views import (
    detect_image,
    dashboard_stats,
    CustomTokenObtainPairView,
    AdminSettingsViewSet,
    ComponentTypeViewSet,
    OperatorViewSet,
    AIModelViewSet,
    InferenceLogViewSet,
    RetrainingQueueViewSet
)

router = DefaultRouter()
router.register(r'admin/settings', AdminSettingsViewSet)
router.register(r'component-types', ComponentTypeViewSet)
router.register(r'operators', OperatorViewSet, basename='operator')
router.register(r'ai-models', AIModelViewSet)
router.register(r'inference-logs', InferenceLogViewSet)
router.register(r'retraining-queue', RetrainingQueueViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # AI & Analytics Endpoints
    path('api/dashboard/stats/', dashboard_stats),
    path('api/detect/', detect_image),

    # Auth Endpoints
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API routes (ViewSets)
    path('api/', include(router.urls)),
]