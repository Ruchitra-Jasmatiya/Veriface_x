import uuid

from django.db import models


class ScanRecord(models.Model):
    """One analysed upload. Every field is filled from real measurements."""

    system_hash = models.CharField(max_length=32, unique=True, editable=False)
    sha256 = models.CharField(max_length=64, db_index=True,
                              help_text="SHA-256 of the uploaded bytes. Identical files share this value.")

    file_name = models.CharField(max_length=255)
    file_size_bytes = models.PositiveIntegerField()
    image_format = models.CharField(max_length=10)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    image = models.FileField(upload_to="uploads/%Y/%m/%d/", blank=True, null=True,
                             help_text="Only populated when VERIFACE_STORE_UPLOADS is enabled.")

    risk_score = models.FloatField(help_text="Manipulation-risk score, 0 (no signals) to 100 (strong signals).")
    verdict = models.CharField(max_length=40)
    risk_level = models.CharField(max_length=10)
    summary = models.TextField()

    signals = models.JSONField(default=list)
    findings = models.JSONField(default=list)
    limitations = models.JSONField(default=list)
    camera_metadata = models.JSONField(default=dict, blank=True)

    engine_version = models.CharField(max_length=80)
    processing_time_ms = models.FloatField(default=0.0)

    uploader_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Scan record"
        verbose_name_plural = "Scan records"

    def save(self, *args, **kwargs):
        if not self.system_hash:
            self.system_hash = f"VFX-{uuid.uuid4().hex[:10].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.system_hash} · {self.file_name} · {self.verdict}"
