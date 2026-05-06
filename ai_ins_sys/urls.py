from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import (
    api_data,
    detect_image,
    CustomTokenObtainPairView,
    # Settings
    AdminSettingsViewSet,
    OperatorSettingsViewSet,
    SuperAdminSettingsViewSet,
    # Operators
    OperatorViewSet,
    # Components & Models
    ComponentTypeViewSet,
    AIModelViewSet,
    # Logs & Evaluations
    DefectDetectionLogViewSet,
    ModelEvaluationViewSet,
)

# 🔧 Router setup
router = DefaultRouter()
# Settings
router.register(r'admin/settings', AdminSettingsViewSet)
router.register(r'operator/settings', OperatorSettingsViewSet)
router.register(r'superadmin/settings', SuperAdminSettingsViewSet)
# Operators
router.register(r'operators', OperatorViewSet)
# Components & Models
router.register(r'component-types', ComponentTypeViewSet)
router.register(r'ai-models', AIModelViewSet)
# Logs & Evaluations
router.register(r'detection-logs', DefectDetectionLogViewSet)
router.register(r'model-evaluations', ModelEvaluationViewSet)

urlpatterns = [
    # 🔹 Admin panel
    path('admin/', admin.site.urls),

    # 🔹 Basic endpoints
    path('api/data/', api_data),
    path('api/detect/', detect_image),

    # 🔹 Auth endpoints
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # 🔹 API routes (ViewSets)
    path('api/', include(router.urls)),

    # 🔹 Root redirect
    path('', RedirectView.as_view(url='/api/data/', permanent=False)),
]
