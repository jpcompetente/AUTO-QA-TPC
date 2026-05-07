import os
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
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': 'localhost',
        'PORT': '5432',
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
    'corsheaders',   # ✅ required for CORS
    'rest_framework',
    # 'django.contrib.redirects',   # ❌ disabled muna
    'core',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
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
]

# For testing only (disable in production)
# CORS_ALLOW_ALL_ORIGINS = True

# ✅ Root URL configuration
ROOT_URLCONF = 'backend.urls'

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