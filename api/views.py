"""
REST API views for equilo project.
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def hello_world(request):
    """
    Hello World endpoint for API health check.
    Consumed by React frontend at /api/hello/
    """
    return Response({
        'message': 'Hello World from Django REST API!',
        'status': 'ok',
    })
