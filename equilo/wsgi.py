"""
WSGI config for equilo project.
Vercel requires a public variable named 'app' to expose the WSGI application.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'equilo.settings')

app = get_wsgi_application()
