from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from .models import (
    UserProfile,
    AIModel,
    ComponentType,
    ActiveConfiguration,
    InferenceLog,
    RetrainingQueue,
    TrainingJob,
    DatasetBuffer
)

# 🔑 Custom JWT Serializer (Includes RBAC role in the token)
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @staticmethod
    def resolve_role(user):
        try:
            return user.profile.role
        except Exception:
            if getattr(user, "is_superuser", False):
                return "SUPER_ADMIN"
            if getattr(user, "is_staff", False):
                return "ADMIN"
            return "OPERATOR"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        role = cls.resolve_role(user)
            
        token['role'] = role
        token['username'] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['role'] = self.resolve_role(self.user)
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
    compatible_component_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        source='compatible_components',
        read_only=True
    )

    class Meta:
        model = AIModel
        fields = '__all__'
        extra_kwargs = {
            'compatible_components': {'read_only': True}
        }

class ComponentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentType
        fields = '__all__'

# 🧠 Active Configuration Serializer
class ActiveConfigurationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    model_name = serializers.CharField(source='model.name', read_only=True)
    operator_name = serializers.CharField(source='operator.username', read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ActiveConfiguration
        fields = '__all__'

    def validate(self, attrs):
        data = super().validate(attrs)

        operator = data.get('operator', getattr(self.instance, 'operator', None))
        product = data.get('product', getattr(self.instance, 'product', None))
        model = data.get('model', getattr(self.instance, 'model', None))
        threshold = data.get('threshold', getattr(self.instance, 'threshold', None))
        is_active = data.get('is_active', getattr(self.instance, 'is_active', True))

        duplicate_qs = ActiveConfiguration.objects.filter(
            operator=operator,
            product=product,
            model=model,
            threshold=threshold,
            is_active=is_active,
        )

        if self.instance is not None:
            duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)

        if duplicate_qs.exists():
            raise serializers.ValidationError(
                'An identical configuration already exists for this operator and product.'
            )

        if operator:
            operator_qs = ActiveConfiguration.objects.filter(operator=operator)
            if self.instance is not None:
                operator_qs = operator_qs.exclude(pk=self.instance.pk)

            if operator_qs.exists():
                raise serializers.ValidationError({
                    'operator': 'This user already has a saved configuration. Remove the existing config before creating a new one.'
                })

        return data

# 📊 Inference & Audit Log Serializer (Requirement 1.3)
class InferenceLogSerializer(serializers.ModelSerializer):
    operator_name = serializers.CharField(source='operator.username', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    model_name = serializers.CharField(source='model_used.name', read_only=True)
    image_snapshot_url = serializers.SerializerMethodField()

    def get_image_snapshot_url(self, obj):
        if not obj.image_snapshot:
            return ''
        # Keep media URL relative so browser uses the current secure origin.
        return obj.image_snapshot.url

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