"""
URL configuration for equilo project.
"""

from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import path, include


def root(request):
    """Root health check endpoint."""
    return JsonResponse({'message': 'Equilo API', 'docs': '/api/hello/'})


urlpatterns = [
    path('', root),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
