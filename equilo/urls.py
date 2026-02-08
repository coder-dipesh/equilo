"""
URL configuration for equilo project.
"""

from django.contrib import admin
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
