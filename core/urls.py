from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from api.views import api_index

admin.site.site_header = "VeriFace-X Administration"
admin.site.site_title = "VeriFace-X"
admin.site.index_title = "Scan records"

urlpatterns = [
    path("", api_index, name="home"),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)