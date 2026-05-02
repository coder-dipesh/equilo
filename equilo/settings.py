"""
Django settings for equilo project.
Configured for Vercel deployment and REST API with React frontend.
"""

import os
from pathlib import Path

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Security - use environment variables in production
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-dev-key-change-in-production'
)

DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'

# Vercel domains + localhost for development (avoid '*' in production - set DEBUG=False)
ALLOWED_HOSTS = [
    '127.0.0.1',
    'localhost',
    '.vercel.app',
]
# Add custom domain if set
if os.environ.get('VERCEL_URL'):
    ALLOWED_HOSTS.append(f".{os.environ.get('VERCEL_URL')}")

# Add LAN IP for mobile dev (phone on same WiFi)
if DEBUG:
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        _lan_ip = s.getsockname()[0]
        s.close()
        ALLOWED_HOSTS.append(_lan_ip)
    except Exception:
        pass

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',
    # Local apps
    'api',
]

def _middleware_list():
    m = [
        'django.middleware.security.SecurityMiddleware',
    ]
    try:
        import whitenoise  # noqa: F401
        m.append('whitenoise.middleware.WhiteNoiseMiddleware')
    except ImportError:
        pass
    m.extend([
        'corsheaders.middleware.CorsMiddleware',  # CORS before CommonMiddleware
        'django.contrib.sessions.middleware.SessionMiddleware',
        'django.middleware.common.CommonMiddleware',
        'django.middleware.csrf.CsrfViewMiddleware',
        'django.contrib.auth.middleware.AuthenticationMiddleware',
        'django.contrib.messages.middleware.MessageMiddleware',
        'django.middleware.clickjacking.XFrameOptionsMiddleware',
    ])
    return m

MIDDLEWARE = _middleware_list()

ROOT_URLCONF = 'equilo.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Required for Vercel - expose WSGI app variable
WSGI_APPLICATION = 'equilo.wsgi.app'

# Database - Supabase (PostgreSQL) when DATABASE_URL is set, else SQLite for local dev
# Always set ENGINE explicitly so we never fall back to Django's dummy backend.
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
if DATABASE_URL:
    import dj_database_url
    _db = dj_database_url.config(
        default=DATABASE_URL,
        conn_max_age=600,
        conn_health_checks=True,
    )
    # Ensure ENGINE is always set (required; some envs may not set it)
    if not _db.get('ENGINE'):
        _db['ENGINE'] = 'django.db.backends.postgresql'
    DATABASES = {'default': _db}
else:
    if os.environ.get('VERCEL'):
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured(
            'On Vercel, DATABASE_URL must be set. '
            'Add it in Vercel Project Settings → Environment Variables '
            '(e.g. Supabase → Settings → Database → Connection string URI).'
        )
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Fail fast if default DB is missing ENGINE (should never happen with the logic above)
if 'default' not in DATABASES or not DATABASES['default'].get('ENGINE'):
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        'settings.DATABASES["default"] must have an ENGINE. '
        'Set DATABASE_URL (e.g. Supabase PostgreSQL URI) in your environment.'
    )

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (admin CSS/JS – WhiteNoise serves these; collectstatic must run at build)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (user uploads, e.g. profile photos)
# Local: filesystem (media/). Production (Vercel): Supabase Storage required.
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_KEY = (
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    or os.environ.get('SUPABASE_SERVICE_KEY')
    or os.environ.get('SUPABASE_KEY', '')
).strip()
SUPABASE_MEDIA_BUCKET = os.environ.get('SUPABASE_MEDIA_BUCKET', 'media')
# Only enforce "must use Supabase" when on Vercel production (DEBUG=False). Local/dev always uses ./media/.
_on_vercel = os.environ.get('VERCEL') == '1'
_running_locally = os.environ.get('RUNNING_LOCALLY', '').lower() in ('1', 'true', 'yes')
# DEBUG is True by default; on Vercel you set DEBUG=False, so this treats local runs as non-Vercel for media
_require_supabase_on_vercel = _on_vercel and not _running_locally and not DEBUG

def _use_supabase_media():
    if not (SUPABASE_URL and SUPABASE_KEY):
        return False
    try:
        import django_supabase_storage  # noqa: F401
        return True
    except ImportError:
        return False

if _use_supabase_media():
    os.environ['SUPABASE_KEY'] = SUPABASE_KEY
    os.environ.setdefault('SUPABASE_BUCKET_NAME', SUPABASE_MEDIA_BUCKET)
    STORAGES = {
        'default': {
            'BACKEND': 'django_supabase_storage.SupabaseMediaStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
    MEDIA_URL = f'{SUPABASE_URL.rstrip("/")}/storage/v1/object/public/{SUPABASE_MEDIA_BUCKET}/'
    MEDIA_ROOT = ''
else:
    if _require_supabase_on_vercel:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured(
            'On Vercel (DEBUG=False), SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set for media. '
            'Add them in Vercel → Project Settings → Environment Variables.'
        )
    MEDIA_URL = 'media/'
    MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'api.authentication.SessionTrackingJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': ['django_filters.rest_framework.DjangoFilterBackend'],
}

# JWT (Simple JWT) — short access token, rotating refresh + blacklist
from datetime import timedelta

SIMPLE_JWT = {
    # Longer access + refresh so returning after a break does not hit rotating-refresh races / weekly expiry
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'TOKEN_OBTAIN_SERIALIZER': 'api.jwt_serializers.EquiloTokenObtainPairSerializer',
    'TOKEN_REFRESH_SERIALIZER': 'api.jwt_serializers.EquiloTokenRefreshSerializer',
}

# HttpOnly refresh cookie (set by login/register/refresh responses)
REFRESH_TOKEN_COOKIE_NAME = os.environ.get('REFRESH_TOKEN_COOKIE_NAME', 'equilo_refresh')
REFRESH_TOKEN_COOKIE_PATH = os.environ.get('REFRESH_TOKEN_COOKIE_PATH', '/')
REFRESH_TOKEN_COOKIE_SECURE = os.environ.get(
    'REFRESH_TOKEN_COOKIE_SECURE', str(not DEBUG).lower()
).lower() in ('1', 'true', 'yes')
REFRESH_TOKEN_SAMESITE = os.environ.get('REFRESH_TOKEN_SAMESITE', 'Lax')
if os.environ.get('REFRESH_TOKEN_CROSS_SITE', '').lower() in ('1', 'true', 'yes'):
    REFRESH_TOKEN_SAMESITE = 'None'
    REFRESH_TOKEN_COOKIE_SECURE = True

# Cap concurrent device sessions (oldest revoked when exceeded)
MAX_ACTIVE_SESSIONS_PER_USER = int(os.environ.get('MAX_ACTIVE_SESSIONS_PER_USER', '10'))

# CORS — credentials required for refresh cookie; do not use * origins
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
if os.environ.get('CORS_ORIGINS'):
    CORS_ALLOWED_ORIGINS.extend(origin.strip() for origin in os.environ['CORS_ORIGINS'].split(','))
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = False

# Celery (broker for tasks; Beat runs auto_resolve_past_cycles daily)
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')

# Cache: use Redis when an explicit URL is provided (prod / Vercel), otherwise
# fall back to in-process memory so local dev does not require a running Redis.
_redis_url = os.environ.get('REDIS_URL') or os.environ.get('CELERY_BROKER_URL')
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url.replace("/0", "/1"),
            "OPTIONS": {
                "socket_connect_timeout": 2,
                "socket_timeout": 2,
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "equilo-local",
        }
    }

CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Email (Brevo SMTP relay). When EMAIL_HOST_USER is empty, falls back to console
# backend so local dev can see the rendered email in the runserver log instead
# of needing real SMTP credentials.
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '').strip()
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '').strip()
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Equilo <noreply@equilo.app>')
SERVER_EMAIL = DEFAULT_FROM_EMAIL
EMAIL_HOST = 'smtp-relay.brevo.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_TIMEOUT = 10
if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Public URLs used by transactional email:
#   FRONTEND_URL — base for "open the app" deep links (the React SPA)
#   BACKEND_URL  — base for backend-served URLs (unsubscribe). Defaults to
#                  FRONTEND_URL for single-host setups; in the standard
#                  two-project Vercel deployment, set this to the backend host.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
BACKEND_URL = (os.environ.get('BACKEND_URL') or FRONTEND_URL).rstrip('/')

# Shared secret required by Vercel Cron-invoked endpoints (e.g. daily cycle
# transition). Sent as ?secret=... in the cron URL configured in vercel.json.
CRON_SECRET = os.environ.get('CRON_SECRET', '').strip()

