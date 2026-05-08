from django.contrib import admin
from .models import (
    UserProfile, 
    AIModel, 
    ComponentType, 
    ActiveConfiguration,
    InferenceLog, 
    RetrainingQueue
)

# 1. User Profiles & Roles
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_filter = ('role',)
    search_fields = ('user__username',)

# 2. AI Model Management (Super Admin Control)
@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'version', 'is_active', 'mAP', 'avg_speed_ms')
    list_editable = ('is_active',)

# 3. Component/Product Types
@admin.register(ComponentType)
class ComponentTypeAdmin(admin.ModelAdmin):
    list_display = ('name',)

# 4. Active Configurations (Admin Control)
@admin.register(ActiveConfiguration)
class ActiveConfigurationAdmin(admin.ModelAdmin):
    list_display = ('operator', 'product', 'model', 'threshold', 'config_version', 'is_active')
    list_filter = ('is_active', 'product')

# 5. Audit Logs (Inference History)
@admin.register(InferenceLog)
class InferenceLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'operator', 'component', 'final_decision', 'latency_ms')
    list_filter = ('final_decision', 'operator_override', 'operator')
    readonly_fields = ('timestamp', 'image_snapshot', 'detection_results')

# 6. Continuous Learning Queue (Retraining Logic)
@admin.register(RetrainingQueue)
class RetrainingQueueAdmin(admin.ModelAdmin):
    list_display = ('log_entry', 'status', 'priority', 'labeled_by', 'created_at')
    list_filter = ('status', 'priority', 'labeled_by')
    actions = ['mark_as_labeled']

    def mark_as_labeled(self, request, queryset):
        queryset.update(status='LABELED')