import logging
import time

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.shortcuts import render
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .forensics import ForensicError, analyze_bytes
from .models import ScanRecord
from .serializers import ScanRecordSerializer

logger = logging.getLogger("api")

LEDGER_LIMIT = 50


def _client_ip(request):
    # REMOTE_ADDR only. X-Forwarded-For is client-controlled unless a trusted
    # proxy strips it, so it is deliberately not trusted here.
    return request.META.get("REMOTE_ADDR") or None


class ScanView(APIView):
    """POST /api/scan/ with multipart field `image`."""

    def post(self, request):
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"error": "No image was uploaded. Send a file in the 'image' field."},
                            status=status.HTTP_400_BAD_REQUEST)

        data = upload.read()
        started = time.perf_counter()
        try:
            result = analyze_bytes(data)
        except ForensicError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:  # noqa: BLE001 - never leak internals to the client
            logger.exception("Forensic engine failed")
            return Response({"error": "The analysis engine failed on this file. Please try another image."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        with transaction.atomic():
            record = ScanRecord(
                file_name=(upload.name or "unnamed")[:255],
                file_size_bytes=result.file_size_bytes,
                image_format=result.image_format,
                width=result.width,
                height=result.height,
                sha256=result.sha256,
                risk_score=result.risk_score,
                verdict=result.verdict,
                risk_level=result.risk_level,
                summary=result.summary,
                signals=result.signals,
                findings=result.findings,
                limitations=result.limitations,
                camera_metadata=result.camera_metadata,
                engine_version=result.engine_version,
                processing_time_ms=elapsed_ms,
                uploader_ip=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
            )
            if settings.STORE_UPLOADED_IMAGES:
                upload.seek(0)
                record.image = upload
            record.save()

        logger.info("scan %s verdict=%s score=%s", record.system_hash, record.verdict, record.risk_score)
        payload = ScanRecordSerializer(record).data
        return Response(payload, status=status.HTTP_201_CREATED)


class ScanLedgerView(APIView):
    """GET /api/scans/?q=text — most recent records, newest first."""

    def get(self, request):
        queryset = ScanRecord.objects.all()
        query = (request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(file_name__icontains=query) | queryset.filter(
                system_hash__icontains=query)
        records = list(queryset[:LEDGER_LIMIT])
        hashes = {r.sha256 for r in records}
        counts = dict(
            ScanRecord.objects.filter(sha256__in=hashes)
            .order_by()
            .values_list("sha256")
            .annotate(n=Count("id"))
            .values_list("sha256", "n")
        )
        serializer = ScanRecordSerializer(records, many=True, context={"sha_counts": counts})
        return Response(serializer.data)


class ScanDetailView(APIView):
    """GET /api/scans/<system_hash>/ (public). DELETE requires an admin login."""

    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsAdminUser()]
        return super().get_permissions()

    def get(self, request, system_hash):
        try:
            record = ScanRecord.objects.get(system_hash=system_hash)
        except ScanRecord.DoesNotExist:
            return Response({"error": "No scan record with that ID."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ScanRecordSerializer(record).data)

    def delete(self, request, system_hash):
        deleted, _ = ScanRecord.objects.filter(system_hash=system_hash).delete()
        if not deleted:
            return Response({"error": "No scan record with that ID."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StatsView(APIView):
    """GET /api/stats/ — counts computed from the database, nothing invented."""

    def get(self, request):
        total = ScanRecord.objects.count()
        by_verdict = dict(
            ScanRecord.objects.order_by()
            .values_list("verdict")
            .annotate(n=Count("id"))
            .values_list("verdict", "n")
        )
        unique_images = ScanRecord.objects.order_by().values("sha256").distinct().count()
        return Response({
            "total_scans": total,
            "unique_images": unique_images,
            "by_verdict": {
                "AUTHENTIC IMAGE": by_verdict.get("AUTHENTIC IMAGE", 0),
                "MODIFIED ASSET": by_verdict.get("MODIFIED ASSET", 0),
                "HIGH MANIPULATION RISK": by_verdict.get("HIGH MANIPULATION RISK", 0),
            },
        })


def api_index(request):
    """GET / — styled backend home page with live counts from the database."""
    by_verdict = dict(
        ScanRecord.objects.order_by()
        .values_list("verdict")
        .annotate(n=Count("id"))
        .values_list("verdict", "n")
    )
    context = {
        "total_scans": ScanRecord.objects.count(),
        "unique_images": ScanRecord.objects.order_by().values("sha256").distinct().count(),
        "low": by_verdict.get("AUTHENTIC IMAGE", 0),
        "medium": by_verdict.get("MODIFIED ASSET", 0),
        "high": by_verdict.get("HIGH MANIPULATION RISK", 0),
        "frontend_url": settings.FRONTEND_URL,
        "engine_version": "VeriFace-X Forensic Engine 2.0",
        "store_uploads": settings.STORE_UPLOADED_IMAGES,
    }
    return render(request, "api/index.html", context)