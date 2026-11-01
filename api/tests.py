import io

import numpy as np
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import ScanRecord


def _jpeg(seed=1):
    rng = np.random.default_rng(seed)
    arr = np.clip(120 + rng.normal(0, 9, (240, 320)), 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(np.stack([arr] * 3, axis=2)).save(buf, "JPEG", quality=92)
    buf.seek(0)
    buf.name = "sample.jpg"
    return buf


@override_settings(STORE_UPLOADED_IMAGES=False)
class ScanApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_scan_creates_record_with_real_fields(self):
        res = self.client.post("/api/scan/", {"image": _jpeg(1)}, format="multipart")
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertTrue(body["system_hash"].startswith("VFX-"))
        self.assertIn(body["verdict"], {"AUTHENTIC IMAGE", "MODIFIED ASSET", "HIGH MANIPULATION RISK"})
        self.assertEqual(ScanRecord.objects.count(), 1)
        self.assertFalse(ScanRecord.objects.first().image)

    def test_repeat_upload_is_counted(self):
        self.client.post("/api/scan/", {"image": _jpeg(2)}, format="multipart")
        res = self.client.post("/api/scan/", {"image": _jpeg(2)}, format="multipart")
        self.assertEqual(res.json()["times_this_image_scanned"], 2)

    def test_missing_file_is_400(self):
        res = self.client.post("/api/scan/", {}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_non_image_is_400(self):
        junk = io.BytesIO(b"not an image")
        junk.name = "x.jpg"
        res = self.client.post("/api/scan/", {"image": junk}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())

    def test_ledger_and_stats(self):
        self.client.post("/api/scan/", {"image": _jpeg(3)}, format="multipart")
        ledger = self.client.get("/api/scans/").json()
        self.assertEqual(len(ledger), 1)
        stats = self.client.get("/api/stats/").json()
        self.assertEqual(stats["total_scans"], 1)
        self.assertEqual(stats["unique_images"], 1)

    def test_detail_404_and_delete_requires_admin(self):
        self.assertEqual(self.client.get("/api/scans/VFX-NOPE/").status_code, 404)
        self.client.post("/api/scan/", {"image": _jpeg(4)}, format="multipart")
        record = ScanRecord.objects.first()
        self.assertEqual(self.client.delete(f"/api/scans/{record.system_hash}/").status_code, 403)
