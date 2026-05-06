from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from .models import (
    AdminSettings,
    OperatorSettings,
    SuperAdminSettings,
    DefectDetectionLog,
    ModelEvaluation,
    AIModel,
    ComponentType
)

# 🔧 Admin Settings (FIXED)
class AdminSettingsSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source='component.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True)

    # 🔥 SAFE VERSION (NO CRASH)
    operator_name = serializers.SerializerMethodField()

    class Meta:
        model = AdminSettings
        fields = '__all__'

    def get_operator_name(self, obj):
        if obj.assigned_operator:
            return obj.assigned_operator.username
        return None


# 🔧 Operator Settings
class OperatorSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperatorSettings
        fields = '__all__'


# 🔧 Super Admin Settings
class SuperAdminSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuperAdminSettings
        fields = '__all__'


# 📊 Detection Logs
class DefectDetectionLogSerializer(serializers.ModelSerializer):
    operator_username = serializers.CharField(source='operator.username', read_only=True)

    class Meta:
        model = DefectDetectionLog
        fields = '__all__'


# 📈 Model Evaluation
class ModelEvaluationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelEvaluation
        fields = '__all__'


# 🔑 JWT
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'username'

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        groups = [g.name for g in user.groups.all()]
        token['groups'] = groups
        token['role'] = groups[0] if groups else 'operator'
        token['username'] = user.username
        token['user_id'] = user.id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        groups = [g.name for g in self.user.groups.all()]
        data['groups'] = groups
        data['role'] = groups[0] if groups else 'operator'
        data['username'] = self.user.username
        data['user_id'] = self.user.id
        return data


# 🔧 Component Types
class ComponentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentType
        fields = '__all__'


# 🔧 AI Models
class AIModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIModel
        fields = '__all__'


# 🔧 Operators
class OperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username']