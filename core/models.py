from django.db import models
from django.contrib.auth.models import User

# 🛡️ User Profile for RBAC
class UserProfile(models.Model):
    ROLES = (
        ('SUPER_ADMIN', 'Super Admin'),
        ('ADMIN', 'Admin'),
        ('OPERATOR', 'Operator'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLES, default='OPERATOR')

    def __str__(self):
        return f"{self.user.username} - {self.role}"

# 🤖 Enhanced AI Models
class AIModel(models.Model):
    MODEL_FORMAT_CHOICES = (
        ('PT', 'PyTorch (.pt)'),
        ('ONNX', 'ONNX (.onnx)'),
        ('ENGINE', 'TensorRT (.engine)'),
    )
    
    name = models.CharField(max_length=100)
    version = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    
    # Model Files - Support multiple formats for different deployment scenarios
    file_path_pt = models.FileField(upload_to='models/weights/', null=True, blank=True)  # PyTorch format
    file_path_onnx = models.FileField(upload_to='models/weights/', null=True, blank=True)  # ONNX format
    file_path_engine = models.FileField(upload_to='models/weights/', null=True, blank=True)  # TensorRT format
    
    # Model Configuration
    model_format = models.CharField(max_length=10, choices=MODEL_FORMAT_CHOICES, default='PT')
    input_size = models.IntegerField(default=640)  # YOLO default
    
    # Performance Metrics
    mAP = models.FloatField(default=0.0, help_text="Mean Average Precision")
    avg_speed_ms = models.FloatField(default=0.0, help_text="Average inference latency in ms")
    accuracy = models.FloatField(default=0.0)
    
    # Product/Component Compatibility
    compatible_components = models.ManyToManyField('ComponentType', blank=True, related_name='compatible_models')
    
    # Deployment Status
    is_active = models.BooleanField(default=False)
    is_deployment_ready = models.BooleanField(default=False)
    last_deployed_at = models.DateTimeField(null=True, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_models')
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active', '-created_at']),
        ]

    def __str__(self):
        return f"{self.name} v{self.version}"

# 🔩 Component/Product Mapping
class ComponentType(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

# 🧠 Admin Control & Presets
class AdminSettings(models.Model):
    admin = models.ForeignKey(User, on_delete=models.CASCADE, related_name='admin_configs')
    assigned_operator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='active_config', null = True, blank=True)
    
    component = models.ForeignKey(ComponentType, on_delete=models.CASCADE, null = True, blank=True)
    model = models.ForeignKey(AIModel, on_delete=models.CASCADE, null = True, blank=True)
    
    confidence_threshold = models.FloatField(default=0.5)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        op_name = self.assigned_operator.username if self.assigned_operator else "Unassigned"
        comp_name = self.component.name if self.component else "No Component"
        return f"Preset: {op_name} ({comp_name})"

# 📊 Detailed Audit & Inference Logs
class InferenceLog(models.Model):
    DECISION_CHOICES = (
        ('PASS', 'Pass'),
        ('FAIL', 'Fail'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'Pending Operator Review'),
        ('APPROVED', 'Operator Approved'),
        ('REJECTED', 'Operator Rejected'),
        ('ARCHIVED', 'Archived'),
    )
    REJECTION_REASON_CHOICES = (
        ('MISSED_DEFECT', 'Missed a defect'),
        ('FALSE_POSITIVE', 'False positive'),
        ('BLURRY_CAPTURE', 'Blurry capture'),
        ('BAD_ANNOTATION', 'Bad annotation'),
        ('WRONG_CLASS', 'Wrong class'),
        ('OTHER', 'Other'),
    )
    
    operator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='inference_logs')
    model_used = models.ForeignKey(AIModel, on_delete=models.SET_NULL, null=True)
    component = models.ForeignKey(ComponentType, on_delete=models.SET_NULL, null=True)
    
    # Core Data for Analytics 1.4
    image_snapshot = models.ImageField(upload_to='inference/snapshots/')
    detection_results = models.JSONField(default=dict)  # Bounding boxes, classes, confidence scores
    latency_ms = models.FloatField()
    confidence_score = models.FloatField()
    
    # Workflow 3.3 - Human-in-the-loop decision
    system_decision = models.CharField(max_length=10, choices=DECISION_CHOICES)
    operator_override = models.BooleanField(default=False)
    operator_comment = models.TextField(blank=True)
    operator_review_description = models.TextField(blank=True)
    rejection_reason = models.CharField(max_length=40, choices=REJECTION_REASON_CHOICES, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    final_decision = models.CharField(max_length=10, choices=DECISION_CHOICES)
    
    # Real-time Streaming Metadata
    session_id = models.CharField(max_length=100, blank=True, db_index=True)  # WebSocket session identifier
    stream_timestamp = models.DateTimeField(null=True, blank=True)  # When streamed to Super Admin
    
    # Status Tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    # Timestamps
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['operator', '-timestamp']),
            models.Index(fields=['session_id', '-timestamp']),
        ]
    
    def __str__(self):
        return f"Log {self.id} - {self.operator.username} ({self.final_decision})"

# 📈 Retraining & Dataset Queue (Logic 1.5)
class RetrainingQueue(models.Model):
    PRIORITY_CHOICES = (
        (0, 'Low'),
        (1, 'Medium'),
        (2, 'High'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'Pending Review'),
        ('LABELED', 'Labeled'),
        ('REJECTED', 'Rejected'),
        ('ADDED_TO_DATASET', 'Added to Training Dataset'),
    )
    
    log_entry = models.OneToOneField(InferenceLog, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    label_data = models.JSONField(null=True, blank=True) # New YOLO coordinates
    
    priority = models.IntegerField(choices=PRIORITY_CHOICES, default=0)
    labeled_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='labeled_samples')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Queue {self.id} - {self.status}"

# 🔄 Training Job Tracker
class TrainingJob(models.Model):
    STATUS_CHOICES = (
        ('QUEUED', 'Queued'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )
    
    base_model = models.ForeignKey(AIModel, on_delete=models.CASCADE, related_name='training_jobs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='QUEUED')
    
    # Training Metadata
    epochs = models.IntegerField(default=50)
    batch_size = models.IntegerField(default=32)
    learning_rate = models.FloatField(default=0.001)
    
    # Results
    new_weights_path = models.FileField(upload_to='models/weights/', null=True, blank=True)
    metrics = models.JSONField(null=True, blank=True)  # mAP, loss, etc.
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Progress Tracking
    current_epoch = models.IntegerField(default=0)
    logs = models.TextField(blank=True)  # Training logs
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='training_jobs')
    
    def __str__(self):
        return f"TrainingJob {self.id} - {self.status}"

# 🗂️ Dataset Management for Retraining
class DatasetBuffer(models.Model):
    """Manages the labeled dataset for model retraining"""
    training_job = models.ForeignKey(TrainingJob, on_delete=models.CASCADE, related_name='dataset_samples', null=True, blank=True)
    retraining_queue = models.ForeignKey(RetrainingQueue, on_delete=models.CASCADE, related_name='dataset_buffer')
    
    is_included = models.BooleanField(default=False)  # Whether included in current training
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"DatasetBuffer {self.id} - Included: {self.is_included}"
