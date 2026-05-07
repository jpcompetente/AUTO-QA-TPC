from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from .models import (
    UserProfile,
    AIModel,
    ComponentType,
    AdminSettings,
    InferenceLog,
    RetrainingQueue,
    TrainingJob,
    DatasetBuffer
)

# 🔑 Custom JWT Serializer (Includes RBAC role in the token)
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Try to get role from UserProfile, default to operator
        try:
            role = user.profile.role
        except:
            role = 'OPERATOR'
            
        token['role'] = role
        token['username'] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        try:
            data['role'] = self.user.profile.role
        except:
            data['role'] = 'OPERATOR'
        data['username'] = self.user.username
        data['user_id'] = self.user.id
        return data

# 🛡️ User Serializers
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role']

class OperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username']

# 🤖 AI & Component Serializers
class AIModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIModel
        fields = '__all__'

class ComponentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentType
        fields = '__all__'

# 🧠 Admin Settings Serializer
class AdminSettingsSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source='component.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True)
    operator_name = serializers.CharField(source='assigned_operator.username', read_only=True)

    class Meta:
        model = AdminSettings
        fields = '__all__'

# 📊 Inference & Audit Log Serializer (Requirement 1.3)
class InferenceLogSerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source='operator.username', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    model_name = serializers.CharField(source='model_used.name', read_only=True)

    class Meta:
        model = InferenceLog
        fields = '__all__'

# 📈 Retraining Queue Serializer (Requirement 1.5)
class RetrainingQueueSerializer(serializers.ModelSerializer):
    image_url = serializers.ImageField(source='log_entry.image_snapshot', read_only=True)

    class Meta:
        model = RetrainingQueue
        fields = '__all__'

# 🔄 Training Job Serializer
class TrainingJobSerializer(serializers.ModelSerializer):
    base_model_name = serializers.CharField(source='base_model.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = TrainingJob
        fields = [
            'id', 'base_model', 'base_model_name', 'status', 
            'epochs', 'batch_size', 'learning_rate',
            'new_weights_path', 'metrics', 'current_epoch',
            'created_at', 'started_at', 'completed_at', 
            'logs', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'started_at', 'completed_at', 'new_weights_path', 'metrics']

# 🗂️ Dataset Buffer Serializer
class DatasetBufferSerializer(serializers.ModelSerializer):
    image_url = serializers.ImageField(source='retraining_queue.log_entry.image_snapshot', read_only=True)
    label_data = serializers.JSONField(source='retraining_queue.label_data', read_only=True)
    
    class Meta:
        model = DatasetBuffer
        fields = ['id', 'training_job', 'retraining_queue', 'is_included', 'created_at', 'image_url', 'label_data']
        read_only_fields = ['id', 'created_at', 'image_url', 'label_data']