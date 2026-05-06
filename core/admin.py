from django.contrib import admin
from .models import (
    AdminSettings, OperatorSettings, SuperAdminSettings,
    DefectDetectionLog, ModelEvaluation
)

admin.site.register(AdminSettings)
admin.site.register(OperatorSettings)
admin.site.register(SuperAdminSettings)
admin.site.register(DefectDetectionLog)
admin.site.register(ModelEvaluation)
from django.contrib import admin

# Register your models here.
