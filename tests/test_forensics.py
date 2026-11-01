"""
Tests for the forensic engine. These do not need Django.

Run from the project root:
    python tests/test_forensics.py
or:
    python -m unittest tests.test_forensics -v
"""

import io
import os
import sys
import unittest

import numpy as np
from PIL import Image, PngImagePlugin

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from api.forensics import ForensicError, analyze_bytes  # noqa: E402


def _natural_like(size=(640, 480), seed=7) -> Image.Image:
    """Smooth gradient plus uniform sensor-like noise. Stands in for a camera capture."""
    rng = np.random.default_rng(seed)
    h, w = size[1], size[0]
    yy, xx = np.mgrid[0:h, 0:w]
    base = 120 + 60 * np.sin(xx / 40.0) * np.cos(yy / 55.0)
    noise = rng.normal(0, 9, (h, w))
    arr = np.clip(base + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(np.stack([arr, arr, arr], axis=2))


def _jpeg_bytes(img: Image.Image, quality=92, exif=None) -> bytes:
    buf = io.BytesIO()
    kwargs = {"quality": quality}
    if exif is not None:
        kwargs["exif"] = exif
    img.save(buf, "JPEG", **kwargs)
    return buf.getvalue()


def _camera_exif() -> bytes:
    exif = Image.Exif()
    exif[271] = "Canon"
    exif[272] = "Canon EOS 80D"
    exif[306] = "2026:10:01 10:20:30"
    return exif.tobytes()


class ForensicEngineTests(unittest.TestCase):

    def test_camera_like_capture_is_low_risk(self):
        data = _jpeg_bytes(_natural_like(), exif=_camera_exif())
        result = analyze_bytes(data)
        self.assertLessEqual(result.risk_score, 50.0)
        self.assertEqual(result.verdict, "AUTHENTIC IMAGE")
        self.assertEqual(result.camera_metadata.get("make"), "Canon")

    def test_pasted_region_scores_higher_than_untouched_capture(self):
        clean = _natural_like(seed=3)
        clean_result = analyze_bytes(_jpeg_bytes(clean, exif=None))

        tampered = _natural_like(seed=3).copy()
        # A splice from a source with a different noise profile (smoother, weaker sensor noise).
        donor = _natural_like(size=(200, 200), seed=21)
        donor_arr = np.asarray(donor, dtype=np.float32)
        donor_arr = np.clip(128 + (donor_arr - 128) * 0.2, 0, 255).astype(np.uint8)
        tampered.paste(Image.fromarray(donor_arr), (150, 120))
        tampered_result = analyze_bytes(_jpeg_bytes(tampered, quality=70, exif=None))

        self.assertGreater(tampered_result.risk_score, clean_result.risk_score)
        self.assertEqual(clean_result.verdict, "AUTHENTIC IMAGE")
        self.assertIn(tampered_result.verdict, {"MODIFIED ASSET", "HIGH MANIPULATION RISK"})

    def test_ai_marker_in_png_text_is_high_risk(self):
        info = PngImagePlugin.PngInfo()
        info.add_text("parameters", "a portrait, Stable Diffusion XL, steps: 30")
        buf = io.BytesIO()
        _natural_like().save(buf, "PNG", pnginfo=info)
        result = analyze_bytes(buf.getvalue())
        self.assertGreaterEqual(result.risk_score, 81.0)
        self.assertEqual(result.verdict, "HIGH MANIPULATION RISK")
        self.assertTrue(any(s["key"] == "ai_provenance" and s["score"] == 100.0 for s in result.signals))

    def test_photoshop_software_tag_is_at_least_medium(self):
        exif = Image.Exif()
        exif[305] = "Adobe Photoshop 25.0 (Windows)"
        result = analyze_bytes(_jpeg_bytes(_natural_like(), exif=exif.tobytes()))
        self.assertGreaterEqual(result.risk_score, 51.0)
        self.assertIn(result.risk_level, {"Medium", "High"})
        self.assertIn("Photoshop", " ".join(result.findings))

    def test_score_is_deterministic_and_bounded(self):
        data = _jpeg_bytes(_natural_like(seed=11))
        a = analyze_bytes(data)
        b = analyze_bytes(data)
        self.assertEqual(a.risk_score, b.risk_score)
        self.assertGreaterEqual(a.risk_score, 0.0)
        self.assertLessEqual(a.risk_score, 100.0)
        self.assertEqual(a.sha256, b.sha256)

    def test_limitations_are_always_reported(self):
        result = analyze_bytes(_jpeg_bytes(_natural_like()))
        self.assertTrue(any("not legal or forensic proof" in lim for lim in result.limitations))

    def test_non_image_is_rejected(self):
        with self.assertRaises(ForensicError):
            analyze_bytes(b"this is not an image at all")

    def test_empty_file_is_rejected(self):
        with self.assertRaises(ForensicError):
            analyze_bytes(b"")

    def test_unsupported_format_is_rejected(self):
        buf = io.BytesIO()
        _natural_like(size=(64, 64)).save(buf, "BMP")
        with self.assertRaises(ForensicError):
            analyze_bytes(buf.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
