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
    list_display = ('name', 'version', 'is_active', 'mAP', 'avg_speed_ms', 'get_compatible_components')
    list_editable = ('is_active',)
    filter_horizontal = ('compatible_components',)
    
    fieldsets = (
        ('Model Information', {
            'fields': ('name', 'version', 'description')
        }),
        ('Deployment & Compatibility', {
            'fields': ('compatible_components', 'model_format', 'input_size'),
            'description': 'Select which product(s) this model is compatible with. This is required.'
        }),
        ('Model Files', {
            'fields': ('file_path_pt', 'file_path_onnx', 'file_path_engine'),
            'classes': ('collapse',),
        }),
        ('Performance Metrics', {
            'fields': ('mAP', 'avg_speed_ms', 'accuracy'),
        }),
        ('Deployment Status', {
            'fields': ('is_active', 'is_deployment_ready', 'last_deployed_at'),
        }),
        ('Audit Information', {
            'fields': ('created_by', 'created_at'),
            'classes': ('collapse',),
        }),
    )
    
    readonly_fields = ('created_at', 'created_by', 'last_deployed_at')
    search_fields = ('name', 'version')
    
    def get_compatible_components(self, obj):
        """Display compatible products in list view"""
        return ', '.join([c.name for c in obj.compatible_components.all()]) or 'No products assigned'
    get_compatible_components.short_description = 'Compatible Products'
    
    def save_model(self, request, obj, form, change):
        """Set created_by when model is first created"""
        if not change:  # Only for new objects
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def get_form(self, request, obj=None, **kwargs):
        """Make compatible_components required"""
        form = super().get_form(request, obj, **kwargs)
        form.base_fields['compatible_components'].required = True
        return form

# 3. Component/Product Types
@admin.register(ComponentType)
class ComponentTypeAdmin(admin.ModelAdmin):
    list_display = ('name',)

# 4. Active Configurations (Admin Control)
@admin.register(ActiveConfiguration)
class ActiveConfigurationAdmin(admin.ModelAdmin):
    list_display = ('operator', 'product', 'model', 'threshold', 'config_version', 'is_active')
    list_filter = ('is_active', 'product')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter model choices based on selected product compatibility"""
        if db_field.name == 'model':
            # Get the product_id from the form data if available
            product_id = request.GET.get('product') or request.POST.get('product')
            if product_id:
                try:
                    product_id = int(product_id)
                    # Filter models to only those compatible with the selected product
                    kwargs['queryset'] = AIModel.objects.filter(
                        compatible_components__id=product_id
                    ).distinct()
                except (ValueError, TypeError):
                    pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    class Media:
        js = ('admin/js/active_config_filter.js',)

# 5. Audit Logs (Inference History) - Organized by Product
@admin.register(InferenceLog)
class InferenceLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'component', 'operator', 'final_decision', 'confidence_score', 'latency_ms', 'status')
    list_filter = ('component', 'final_decision', 'status', 'operator_override', 'operator', 'timestamp')
    search_fields = ('operator__username', 'component__name', 'session_id')
    readonly_fields = ('timestamp', 'image_snapshot', 'detection_results', 'segmentation_data')
    ordering = ['-timestamp']
    date_hierarchy = 'timestamp'
    
    fieldsets = (
        ('Detection Result', {
            'fields': ('component', 'operator', 'model_used', 'timestamp')
        }),
        ('Detection Metrics', {
            'fields': ('confidence_score', 'latency_ms', 'system_decision', 'final_decision')
        }),
        ('Segmentation Data', {
            'fields': ('segmentation_data', 'defect_area_percent'),
            'classes': ('collapse',),
        }),
        ('Operator Review', {
            'fields': ('operator_override', 'operator_comment', 'operator_review_description', 'rejection_reason', 'reviewed_at', 'status')
        }),
        ('Raw Detection Data', {
            'fields': ('image_snapshot', 'detection_results'),
            'classes': ('collapse',),
        }),
        ('Session Metadata', {
            'fields': ('session_id',),
            'classes': ('collapse',),
        }),
    )
    
    def get_queryset(self, request):
        """Optimize queryset with select_related"""
        qs = super().get_queryset(request)
        return qs.select_related('operator', 'component', 'model_used')

# 6. Continuous Learning Queue (Retraining Logic)
@admin.register(RetrainingQueue)
class RetrainingQueueAdmin(admin.ModelAdmin):
    list_display = ('log_entry', 'status', 'priority', 'labeled_by', 'created_at')
    list_filter = ('status', 'priority', 'labeled_by')
    actions = ['mark_as_labeled']

    def mark_as_labeled(self, request, queryset):
        queryset.update(status='LABELED')