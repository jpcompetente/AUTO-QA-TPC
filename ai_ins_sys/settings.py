import os
from datetime import timedelta
from importlib.util import find_spec
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env
load_dotenv()

# Set up the base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Secret key for production (make sure to change it in your .env for security purposes)
SECRET_KEY = os.getenv('SECRET_KEY', 'default-secret-key')  # Fallback in case .env is not loaded

# Debug mode setting (Set to False in production)
DEBUG = True

INTERNAL_IPS = ["127.0.0.1"]
# Allowed hosts setting (necessary if DEBUG is False)
ALLOWED_HOSTS = ['*']  # Set this to your domain or IP in production

# Database Configuration
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', ''),
        'USER': os.getenv('DB_USER', ''),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

# Installed Apps
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    'corsheaders',
    'rest_framework',
    'django_filters',
    'core',
]

if find_spec('daphne') is not None:
    INSTALLED_APPS.insert(0, 'daphne')

if find_spec('channels') is not None:
    INSTALLED_APPS.append('channels')

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
    )
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

# Middleware Configuration
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',   # ✅ must be at the very top
    'django.middleware.common.CommonMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # 'django.contrib.redirects.middleware.RedirectFallbackMiddleware',  # ❌ disabled muna
]

# ✅ CORS Settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://10.0.2.132:5173",
    "https://172.21.16.1:5173",
    "http://10.0.2.132:5173",
    "http://172.21.16.1:5173",
    "http://10.0.2.132:8000",      # ✅ Backend HTTP (for mixed HTTPS frontend)
    "https://10.0.2.132:8000",     # ✅ Backend HTTPS (future production)
    "https://localhost:5173",
    "https://127.0.0.1:5173",    
]

# For testing only (disable in production)
# CORS_ALLOW_ALL_ORIGINS = True

# ✅ CSRF Trusted Origins for Form Submissions
CSRF_TRUSTED_ORIGINS = [
    "http://10.0.2.132",
    "https://10.0.2.132:5173",
    "https://172.21.16.1",
    "https://172.21.16.1:5173",
    "http://localhost",
    "https://localhost",
    "http://127.0.0.1",
    "https://127.0.0.1",
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173",
]

# ✅ Root URL configuration
ROOT_URLCONF = 'ai_ins_sys.urls'

STATIC_URL = '/static/'

# Set STATIC_ROOT to an absolute path
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')  # Ensure the directory exists

# Templates Configuration
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
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

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG',
    },
}

# Static files handling (recommended for production)
if not DEBUG:
    STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ✅ Required for django.contrib.sites
SITE_ID = 1

# ✅ WebSocket & Real-time Support with Channels
ASGI_APPLICATION = 'ai_ins_sys.asgi.application'

if find_spec('channels') is not None and find_spec('channels_redis') is not None:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [("127.0.0.1", 6379)],
                "capacity": 1500,
                "expiry": 10,
            },
        },
    }

# ✅ Media Files Configuration (for model weights, images, etc.)
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Ensure media directory exists
os.makedirs(MEDIA_ROOT, exist_ok=True)
os.makedirs(os.path.join(MEDIA_ROOT, 'models', 'weights'), exist_ok=True)
os.makedirs(os.path.join(MEDIA_ROOT, 'inference', 'snapshots'), exist_ok=True)
os.makedirs(os.path.join(MEDIA_ROOT, 'retrain_queue'), exist_ok=True)
os.makedirs(os.path.join(MEDIA_ROOT, 'captures', 'pending'), exist_ok=True)

# AI inference pipeline defaults
INFERENCE_DEFAULT_MODEL_NAME = os.getenv('INFERENCE_DEFAULT_MODEL_NAME', 'yolo26_emsd_v1')
INFERENCE_SERVER_URL = os.getenv('INFERENCE_SERVER_URL', 'http://127.0.0.1:8091')
INFERENCE_DEFAULT_WEIGHTS = os.getenv(
    'INFERENCE_DEFAULT_WEIGHTS',
    os.path.join(BASE_DIR, 'models', 'weights', 'tpcyolov26nv21gs_emsd.pt'),
)
INFERENCE_CONFIDENCE_THRESHOLD = float(os.getenv('INFERENCE_CONFIDENCE_THRESHOLD', '0.5'))
INFERENCE_IOU_THRESHOLD = float(os.getenv('INFERENCE_IOU_THRESHOLD', '0.45'))
INFERENCE_TIMEOUT_SECONDS = float(os.getenv('INFERENCE_TIMEOUT_SECONDS', '10'))
INFERENCE_CACHE_MAX_ENTRIES = int(os.getenv('INFERENCE_CACHE_MAX_ENTRIES', '256'))
INFERENCE_MODEL_ENDPOINTS = {
    INFERENCE_DEFAULT_MODEL_NAME: INFERENCE_SERVER_URL,
}

# ✅ Celery Configuration for Async Tasks & Model Retraining
CELERY_BROKER_URL = 'redis://127.0.0.1:6379/0'
CELERY_RESULT_BACKEND = 'redis://127.0.0.1:6379/0'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_ENABLE_UTC = True
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Celery Beat Schedule for periodic tasks
try:
    from celery.schedules import crontab
except ImportError:
    crontab = None

if crontab is not None:
    CELERY_BEAT_SCHEDULE = {
        'check-retraining-queue': {
            'task': 'core.tasks.check_retraining_queue',
            'schedule': crontab(minute='*/5'),  # Every 5 minutes
        },
    }

