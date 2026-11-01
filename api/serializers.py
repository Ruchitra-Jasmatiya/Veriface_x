from rest_framework import serializers

from .models import ScanRecord


class ScanRecordSerializer(serializers.ModelSerializer):
    times_this_image_scanned = serializers.SerializerMethodField()
    uploads_from_this_ip = serializers.SerializerMethodField()

    class Meta:
        model = ScanRecord
        fields = [
            "system_hash", "sha256", "file_name", "file_size_bytes", "image_format",
            "width", "height", "risk_score", "verdict", "risk_level", "summary",
            "signals", "findings", "limitations", "camera_metadata",
            "engine_version", "processing_time_ms", "uploader_ip", "user_agent",
            "created_at", "times_this_image_scanned", "uploads_from_this_ip",
        ]
        read_only_fields = fields

    def get_times_this_image_scanned(self, obj):
        counts = self.context.get("sha_counts")
        if counts is not None:
            return counts.get(obj.sha256, 1)
        return ScanRecord.objects.filter(sha256=obj.sha256).count()

    def get_uploads_from_this_ip(self, obj):
        if not obj.uploader_ip:
            return None
        return ScanRecord.objects.filter(uploader_ip=obj.uploader_ip).count()
