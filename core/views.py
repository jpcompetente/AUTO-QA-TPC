import base64
import io
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from PIL import Image
from django.contrib.auth.models import User

from rest_framework import viewsets, permissions
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    AdminSettings, OperatorSettings, SuperAdminSettings,
    DefectDetectionLog, ModelEvaluation, AIModel, ComponentType
)

from .serializers import (
    AdminSettingsSerializer, OperatorSettingsSerializer, SuperAdminSettingsSerializer,
    DefectDetectionLogSerializer, ModelEvaluationSerializer,
    CustomTokenObtainPairSerializer,
    ComponentTypeSerializer, AIModelSerializer, OperatorSerializer
)

# 🔑 Custom JWT View
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

# 🌐 Basic endpoint
def home(request):
    return HttpResponse("Hello, Django is working!")

@api_view(['GET'])
def api_data(request):
    return Response({"message": "Hello from Django API!"})

# 🧠 AI Detection Endpoint
@api_view(['POST'])
def detect_image(request):
    image_data = request.data.get('image')
    if not image_data:
        return Response({"error": "No image received"}, status=400)
    try:
        if isinstance(image_data, str) and 'base64' in image_data:
            img_format, img_str = image_data.split(';base64,')
            image_bytes = base64.b64decode(img_str)
            img = Image.open(io.BytesIO(image_bytes))
        else:
            img = Image.open(image_data)

        width, height = img.size
        result = "No defect detected (mock)"  # placeholder AI logic

        return Response({
            "result": result,
            "size": f"{width}x{height}",
            "format": img.format
        })
    except Exception as e:
        return Response({"error": str(e)}, status=500)

# ==============================
# 🔒 ViewSets
# ==============================

class AdminSettingsViewSet(viewsets.ModelViewSet):
    queryset = AdminSettings.objects.all().order_by('-id')
    serializer_class = AdminSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

    # ✅ Automatically assign the logged-in user as admin
    def perform_create(self, serializer):
        serializer.save(admin=self.request.user)

class OperatorSettingsViewSet(viewsets.ModelViewSet):
    queryset = OperatorSettings.objects.all()
    serializer_class = OperatorSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

class SuperAdminSettingsViewSet(viewsets.ModelViewSet):
    queryset = SuperAdminSettings.objects.all()
    serializer_class = SuperAdminSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

class DefectDetectionLogViewSet(viewsets.ModelViewSet):
    queryset = DefectDetectionLog.objects.all().order_by('-id')
    serializer_class = DefectDetectionLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(operator=self.request.user)

class ModelEvaluationViewSet(viewsets.ModelViewSet):
    queryset = ModelEvaluation.objects.all()
    serializer_class = ModelEvaluationSerializer
    permission_classes = [permissions.IsAuthenticated]

class ComponentTypeViewSet(viewsets.ModelViewSet):
    queryset = ComponentType.objects.all()
    serializer_class = ComponentTypeSerializer
    permission_classes = [permissions.IsAuthenticated]

class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer
    permission_classes = [permissions.IsAuthenticated]

class OperatorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.filter(groups__name='operator')
    serializer_class = OperatorSerializer
    permission_classes = [permissions.IsAuthenticated]
