"""
VeriFace-X forensic engine.

This module contains NO Django imports on purpose, so it can be unit-tested
on its own (see tests/test_forensics.py).

What it does
------------
Runs a set of measurable checks on an uploaded image and returns:
  * a manipulation-risk score from 0 to 100 (higher = more risk),
  * every individual signal with its raw value and what it means,
  * the limitations of the method.

What it does NOT do
-------------------
* It cannot prove an image is authentic. A clean result means "no
  manipulation signals were detected by these checks", never "100% safe".
* It cannot identify a specific generator (Google, ChatGPT, Claude, ...) from
  pixels. It can only read provenance markers that are present in the file
  (EXIF Software tag, PNG text chunks, C2PA / IPTC "trainedAlgorithmicMedia").
  Markers are easy to strip, so their absence proves nothing.
* The score thresholds below are heuristics. They have NOT been validated on a
  labelled dataset of real vs. edited vs. AI-generated images. Treat the
  numbers as indicators, not measured accuracy.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass, field, asdict

import numpy as np
from PIL import Image, ImageFilter, UnidentifiedImageError

ENGINE_VERSION = "VeriFace-X Forensic Engine 2.0"

MAX_BYTES = 10 * 1024 * 1024          # 10 MB upload limit
MAX_PIXELS = 50_000_000               # decompression-bomb guard
ANALYSIS_LONG_SIDE = 1024             # pixel checks run on a downscaled copy
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Known generator names that appear in Software / parameter metadata.
AI_GENERATOR_MARKERS = [
    "Midjourney", "DALL-E", "DALL·E", "DALLE", "Stable Diffusion", "StableDiffusion",
    "Automatic1111", "ComfyUI", "Firefly", "ChatGPT", "OpenAI", "Gemini", "Imagen",
    "Sora", "NovelAI", "Leonardo", "Flux", "Ideogram", "Runway", "Bing Image Creator",
    "Copilot Designer", "Grok",
]
# Editing software: proves the file was processed, not that it is fake.
EDITOR_MARKERS = [
    "Photoshop", "GIMP", "Lightroom", "Snapseed", "PicsArt", "Facetune", "Canva",
    "Pixlr", "Paint.NET", "Affinity", "Luminar", "darktable", "Capture One",
]
C2PA_MARKERS = [b"c2pa", b"jumb"]
AI_PROVENANCE_BYTES = [
    b"trainedAlgorithmicMedia",
    b"compositeWithTrainedAlgorithmicMedia",
    b"algorithmicMedia",
]


@dataclass
class Signal:
    key: str
    label: str
    value: str
    score: float          # 0..100 contribution to risk, or -1 when not applicable
    meaning: str
    applicable: bool = True


@dataclass
class ForensicResult:
    engine_version: str
    sha256: str
    file_size_bytes: int
    image_format: str
    width: int
    height: int
    risk_score: float
    verdict: str
    risk_level: str
    summary: str
    signals: list = field(default_factory=list)
    findings: list = field(default_factory=list)
    limitations: list = field(default_factory=list)
    camera_metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        data = asdict(self)
        return data


class ForensicError(ValueError):
    """Raised when the upload cannot be analysed (not an image, too big, ...)."""


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _clip01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _load_image(data: bytes) -> Image.Image:
    if len(data) == 0:
        raise ForensicError("The uploaded file is empty.")
    if len(data) > MAX_BYTES:
        raise ForensicError("The file is larger than the 10 MB limit.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ForensicError("The file is not a readable image (JPG, PNG or WEBP).") from exc
    if img.format not in ALLOWED_FORMATS:
        raise ForensicError("Unsupported image format. Use JPG, PNG or WEBP.")
    w, h = img.size
    if w * h > MAX_PIXELS:
        raise ForensicError("The image resolution is too large to analyse.")
    return img


def _text_blobs(img: Image.Image, data: bytes) -> list[str]:
    """All human-readable metadata strings we can find in the file."""
    blobs: list[str] = []
    for k, v in (img.info or {}).items():
        if isinstance(v, bytes):
            v = v.decode("utf-8", "ignore")
        if isinstance(v, str):
            blobs.append(f"{k}={v}")
    try:
        exif = img.getexif()
        for tag_id, value in exif.items():
            blobs.append(str(value))
    except Exception:  # noqa: BLE001 - malformed EXIF must not crash the scan
        pass
    # XMP packets are plain XML inside the file; scan them as text.
    for match in re.finditer(rb"<x:xmpmeta.*?</x:xmpmeta>", data, re.DOTALL):
        blobs.append(match.group(0).decode("utf-8", "ignore"))
    return blobs


def _camera_metadata(img: Image.Image) -> dict:
    out: dict = {}
    try:
        exif = img.getexif()
        ifd = exif.get_ifd(0x8769)  # Exif sub-IFD
    except Exception:  # noqa: BLE001
        return out
    make = exif.get(271)
    model = exif.get(272)
    software = exif.get(305)
    taken = ifd.get(36867) or exif.get(306)
    if make:
        out["make"] = str(make).strip()
    if model:
        out["model"] = str(model).strip()
    if software:
        out["software"] = str(software).strip()
    if taken:
        out["captured_at"] = str(taken).strip()
    return out


def _find_markers(blobs: list[str], markers: list[str]) -> list[str]:
    found = []
    joined = "\n".join(blobs).lower()
    for m in markers:
        if m.lower() in joined:
            found.append(m)
    return found


# --------------------------------------------------------------------------
# Pixel checks
# --------------------------------------------------------------------------

def _downscale(img: Image.Image) -> Image.Image:
    rgb = img.convert("RGB")
    w, h = rgb.size
    long_side = max(w, h)
    if long_side > ANALYSIS_LONG_SIDE:
        scale = ANALYSIS_LONG_SIDE / long_side
        rgb = rgb.resize((max(8, int(w * scale)), max(8, int(h * scale))), Image.LANCZOS)
    return rgb


def _ela(rgb: Image.Image) -> tuple[float, float]:
    """Error Level Analysis: recompress at q=90 and measure local error spread.

    Returns (ratio, score). A uniformly processed JPEG has similar error in every
    block; a region pasted in from another source usually recompresses very
    differently, which raises the ratio of high-error blocks to typical blocks.
    """
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=90)
    buf.seek(0)
    resaved = Image.open(buf).convert("RGB")
    diff = np.abs(np.asarray(rgb, dtype=np.float32) - np.asarray(resaved, dtype=np.float32)).mean(axis=2)
    h, w = diff.shape
    h8, w8 = (h // 8) * 8, (w // 8) * 8
    if h8 < 16 or w8 < 16:
        return 0.0, 0.0
    blocks = diff[:h8, :w8].reshape(h8 // 8, 8, w8 // 8, 8).mean(axis=(1, 3)).ravel()
    p95 = float(np.percentile(blocks, 95))
    median = float(np.median(blocks))
    ratio = p95 / max(median, 0.5)
    score = _clip01((ratio - 1.5) / 2.5) * 100.0
    return round(ratio, 3), round(score, 2)


def _noise_residual(rgb: Image.Image) -> np.ndarray:
    gray = rgb.convert("L")
    smooth = gray.filter(ImageFilter.MedianFilter(3))
    residual = np.asarray(gray, dtype=np.float32) - np.asarray(smooth, dtype=np.float32)
    return residual


def _noise_inconsistency(residual: np.ndarray) -> tuple[float, float]:
    """Compare sensor-noise strength across all blocks on a log scale.

    A single camera capture has one noise profile, so its per-block noise
    levels cluster together. A pasted, generated or heavily retouched region
    usually carries a clearly different noise level, which widens the spread
    of log(block noise). Low-noise blocks are kept on purpose: a smooth
    splice is exactly what this check needs to see.
    """
    h, w = residual.shape
    bs = 32
    h_b, w_b = h // bs, w // bs
    if h_b < 2 or w_b < 2:
        return 0.0, 0.0
    trimmed = residual[: h_b * bs, : w_b * bs].reshape(h_b, bs, w_b, bs)
    block_std = trimmed.std(axis=(1, 3)).ravel()
    # Blocks with essentially no variation (plain backgrounds, flat graphics) carry no
    # sensor-noise information. Including them made the log-spread saturate on almost
    # every image, so they are excluded. Low-noise but textured blocks are kept.
    block_std = block_std[block_std >= 0.2]
    if block_std.size < 4:
        return 0.0, 0.0
    spread = float(np.log(block_std + 0.05).std())
    score = _clip01((spread - 0.25) / 0.6) * 100.0
    return round(spread, 3), round(score, 2)


def _smoothness(residual: np.ndarray) -> tuple[float, float]:
    """Very low sensor noise overall suggests synthetic or heavily smoothed pixels.

    Caveat: flat graphics and UI screenshots are also smooth and will score
    high here even when they are genuine.
    """
    mean_abs = float(np.abs(residual).mean())
    score = _clip01((4.0 - mean_abs) / 3.0) * 100.0
    return round(mean_abs, 3), round(score, 2)


# --------------------------------------------------------------------------
# Main entry point
# --------------------------------------------------------------------------

def analyze_bytes(data: bytes) -> ForensicResult:
    sha256 = hashlib.sha256(data).hexdigest()
    img = _load_image(data)
    fmt = img.format
    width, height = img.size

    blobs = _text_blobs(img, data)
    camera = _camera_metadata(img)
    ai_generator_hits = _find_markers(blobs, AI_GENERATOR_MARKERS)
    editor_hits = _find_markers(blobs, EDITOR_MARKERS)
    c2pa_present = any(marker in data for marker in C2PA_MARKERS)
    ai_provenance_hits = [m.decode() for m in AI_PROVENANCE_BYTES if m in data]

    rgb = _downscale(img)
    residual = _noise_residual(rgb)
    signals: list[Signal] = []
    findings: list[str] = []
    limitations: list[str] = []

    # --- Pixel checks -----------------------------------------------------
    if fmt == "JPEG":
        ela_ratio, ela_score = _ela(rgb)
        signals.append(Signal(
            "ela", "Error Level Analysis", f"ratio {ela_ratio}", ela_score,
            "Share of high-error blocks compared with typical blocks. Pasted or re-saved regions often stand out.",
        ))
        ela_applicable = True
    else:
        ela_score = 0.0
        ela_applicable = False
        signals.append(Signal(
            "ela", "Error Level Analysis", "not applicable", -1,
            f"ELA only measures JPEG compression history; this {fmt} file was skipped.",
            applicable=False,
        ))

    noise_cv, noise_score = _noise_inconsistency(residual)
    signals.append(Signal(
        "noise_consistency", "Noise consistency across regions", f"variation {noise_cv}", noise_score,
        "Uneven sensor-noise strength between regions can indicate pasted, generated or retouched areas.",
    ))

    mean_abs, smooth_score = _smoothness(residual)
    signals.append(Signal(
        "smoothness", "Overall pixel smoothness", f"mean residual {mean_abs}", smooth_score,
        "Unusually low fine detail suggests synthetic or heavily smoothed pixels. Flat graphics and screenshots also score here.",
    ))

    # Fusion: a weighted average alone would let one strong signal be diluted
    # by the others, so a strong localized finding (ELA or noise) can set the floor.
    # Smoothness only enters the average, because flat graphics also score high on it.
    if ela_applicable:
        weighted = 0.40 * ela_score + 0.40 * noise_score + 0.20 * smooth_score
        strongest_local = max(ela_score, noise_score)
    else:
        weighted = 0.65 * noise_score + 0.35 * smooth_score
        strongest_local = noise_score
    pixel_score = round(float(max(weighted, 0.75 * strongest_local)), 2)

    risk = pixel_score

    # --- Provenance checks -----------------------------------------------
    if ai_generator_hits or ai_provenance_hits:
        names = ", ".join(sorted(set(ai_generator_hits + ai_provenance_hits)))
        signals.append(Signal(
            "ai_provenance", "AI generation marker in file", names, 100.0,
            "The file itself declares it was produced or composited by an AI system.",
        ))
        findings.append(f"The file contains an AI-generation marker ({names}).")
        risk = max(risk, 85.0)
    else:
        signals.append(Signal(
            "ai_provenance", "AI generation marker in file", "none found", 0.0,
            "No AI-generation marker was found. This does NOT prove the image is not AI-generated, because markers are easily removed.",
        ))

    if editor_hits:
        names = ", ".join(sorted(set(editor_hits)))
        signals.append(Signal(
            "editing_software", "Editing software recorded", names, 45.0,
            "Metadata shows the file was processed by editing software. Editing is common and is not proof of tampering.",
        ))
        findings.append(f"Metadata records editing software ({names}), so the file was processed after capture.")
        risk = max(risk, 55.0)
    else:
        signals.append(Signal(
            "editing_software", "Editing software recorded", "none recorded", 0.0,
            "No editing software is recorded. Metadata can be stripped or edited, so this is not proof of an unedited file.",
        ))

    if c2pa_present:
        signals.append(Signal(
            "c2pa", "Content Credentials (C2PA) present", "manifest found", -1,
            "A provenance manifest exists, but this engine does not cryptographically verify it. Verify it with the official C2PA tools.",
            applicable=False,
        ))
        findings.append("A Content Credentials (C2PA) manifest is present. It was not cryptographically verified here.")
    else:
        signals.append(Signal(
            "c2pa", "Content Credentials (C2PA) present", "none found", 0.0,
            "Most ordinary cameras, screenshots and social platforms do not add C2PA data, so its absence is common.",
        ))

    # Camera EXIF: only used to avoid flagging a consistent, genuine capture.
    has_camera = bool(camera.get("make") and camera.get("model"))
    if has_camera and not editor_hits and not (ai_generator_hits or ai_provenance_hits):
        capped = min(risk, 50.0)
        if capped < risk:
            findings.append(
                "Camera make and model are recorded and no editing or AI markers were found, "
                "so the score is capped at the low band. Pixel signals alone are not proof."
            )
        risk = capped
        signals.append(Signal(
            "camera_capture", "Camera capture metadata", f"{camera.get('make')} {camera.get('model')}", 0.0,
            "Camera make, model and capture date are recorded. Metadata can be forged, so treat this as supporting evidence only.",
        ))
    else:
        signals.append(Signal(
            "camera_capture", "Camera capture metadata",
            "present" if has_camera else "missing", 0.0,
            "Missing camera metadata is normal for screenshots, messaging apps and social media. It is not evidence of editing on its own.",
        ))
        if not has_camera:
            findings.append("No camera metadata was found. This is common for screenshots and re-shared images.")

    risk = round(_clip01(risk / 100.0) * 100.0, 2)

    # --- Verdict bands (user-defined) ------------------------------------
    if risk <= 50:
        verdict, level = "AUTHENTIC IMAGE", "Low"
        summary = "No manipulation or AI-generation signals were strong enough to flag this image."
    elif risk <= 80:
        verdict, level = "MODIFIED ASSET", "Medium"
        summary = "The image shows signs that it was processed or altered after capture."
    else:
        verdict, level = "HIGH MANIPULATION RISK", "High"
        summary = "The image shows strong indicators of AI generation or significant manipulation."

    # Low-confidence flag: a verdict above "authentic" supported by only one check
    # is easy to get wrong, so the report says so instead of sounding certain.
    flagged_checks = [s for s in signals if s.applicable and s.score >= 30]
    if risk > 50 and len(flagged_checks) < 2 and not (ai_generator_hits or ai_provenance_hits):
        findings.append(
            "Only one check raised a signal, so this result is LOW CONFIDENCE. "
            "Do not rely on it alone."
        )

    if not findings:
        findings.append("None of the checks produced a notable finding.")

    limitations.extend([
        "This is an automated indicator, not legal or forensic proof. Confirm important cases with a qualified examiner.",
        "A low score does not guarantee the image is unedited or real. Edited or AI-generated images can pass these checks.",
        "Thresholds are heuristic and have not been validated on a labelled dataset.",
        "Screenshots, graphics and heavily compressed images can produce false positives.",
        "Generator names (for example Google, ChatGPT or Claude) cannot be identified from pixels, only from metadata that may be missing.",
    ])

    return ForensicResult(
        engine_version=ENGINE_VERSION,
        sha256=sha256,
        file_size_bytes=len(data),
        image_format=fmt,
        width=width,
        height=height,
        risk_score=risk,
        verdict=verdict,
        risk_level=level,
        summary=summary,
        signals=[asdict(s) for s in signals],
        findings=findings,
        limitations=limitations,
        camera_metadata=camera,
    )