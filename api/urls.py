from django.urls import path

from .views import ScanDetailView, ScanLedgerView, ScanView, StatsView

app_name = "api"

urlpatterns = [
    path("scan/", ScanView.as_view(), name="scan"),
    path("scans/", ScanLedgerView.as_view(), name="scan-ledger"),
    path("scans/<str:system_hash>/", ScanDetailView.as_view(), name="scan-detail"),
    path("stats/", StatsView.as_view(), name="stats"),
]
