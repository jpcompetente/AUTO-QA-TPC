"""
API URL configuration for core app with RBAC endpoints
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()

# Register ViewSets
router.register(r'ai-models', views.AIModelViewSet, basename='aimodel')
router.register(r'components', views.ComponentTypeViewSet, basename='component')
router.register(r'admin-settings', views.AdminSettingsViewSet, basename='admin-settings')
router.register(r'inference-logs', views.InferenceLogViewSet, basename='inference-log')
router.register(r'retraining-queue', views.RetrainingQueueViewSet, basename='retraining-queue')
router.register(r'training-jobs', views.TrainingJobViewSet, basename='training-job')
router.register(r'dataset-buffer', views.DatasetBufferViewSet, basename='dataset-buffer')

app_name = 'core'

urlpatterns = [
    # Router URLs
    path('', include(router.urls)),
    
    # 📊 Analytics Endpoints (Requirement 1.4)
    path('analytics/dashboard/', views.dashboard_stats, name='dashboard-stats'),
    path('analytics/latency-trends/', views.latency_trends, name='latency-trends'),
    path('analytics/operator-performance/', views.operator_performance, name='operator-performance'),
    path('analytics/model-performance/', views.model_performance, name='model-performance'),
    
    # 🧠 Inference Endpoints (Requirement 1.1)
    path('inference/detect/', views.detect_image, name='detect-image'),
    
    # 🔑 JWT Authentication
    path('auth/token/', views.CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
]
