from django.db import models
from django.contrib.auth.models import User


# 🔧 Super Admin (future use)
class SuperAdminSettings(models.Model):
    global_component_types = models.TextField(blank=True)
    global_models = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


# 🔩 Component Types (GLOBAL)
class ComponentType(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


# 🤖 AI Models (GLOBAL)
class AIModel(models.Model):
    name = models.CharField(max_length=100)
    version = models.CharField(max_length=50)
    description = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} ({self.version})"


# 🧠 ADMIN CONTROL SETTINGS (UPDATED)
class AdminSettings(models.Model):
    admin = models.ForeignKey(User, on_delete=models.CASCADE)

    component = models.ForeignKey(ComponentType, on_delete=models.CASCADE)
    model = models.ForeignKey(AIModel, on_delete=models.CASCADE)

    threshold = models.FloatField(default=0.5)

    # 🔥 NEW: assign to operator
    assigned_operator = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='assigned_configs',
        limit_choices_to={'groups__name': 'operator'}
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.assigned_operator.username} → {self.component} ({self.model})"


# 👷 Operator Settings (pwede mo i-keep)
class OperatorSettings(models.Model):
    operator = models.ForeignKey(User, on_delete=models.CASCADE)
    detection_active = models.BooleanField(default=False)
    last_result = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


# 📊 Detection Logs (UPDATED naming consistency)
class DefectDetectionLog(models.Model):
    operator = models.ForeignKey(User, on_delete=models.CASCADE)
    component = models.ForeignKey(ComponentType, on_delete=models.SET_NULL, null=True)
    ai_model = models.ForeignKey(AIModel, on_delete=models.SET_NULL, null=True)
    result = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)


# 📈 Model Evaluation
class ModelEvaluation(models.Model):
    ai_model = models.ForeignKey(AIModel, on_delete=models.CASCADE)
    accuracy = models.FloatField()
    false_positives = models.IntegerField()
    false_negatives = models.IntegerField()
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)