from django.contrib import admin

from .models import ScanRecord


@admin.register(ScanRecord)
class ScanRecordAdmin(admin.ModelAdmin):
    list_display = ("system_hash", "file_name", "verdict", "risk_score", "uploader_ip", "created_at")
    list_filter = ("verdict", "risk_level", "image_format")
    search_fields = ("system_hash", "file_name", "sha256", "uploader_ip")
    readonly_fields = [f.name for f in ScanRecord._meta.fields]
