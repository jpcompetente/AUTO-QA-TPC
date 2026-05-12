"""
ASGI config for ai_ins_sys project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from importlib.util import find_spec
from django.core.asgi import get_asgi_application
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ai_ins_sys.settings')

# Initialize Django
django.setup()

if find_spec('channels') is not None:
    from channels.routing import ProtocolTypeRouter, URLRouter
    from channels.auth import AuthMiddlewareStack
    from channels.security.websocket import AllowedHostsOriginValidator

    from core.routing import websocket_urlpatterns

    # ASGI application with WebSocket support
    application = ProtocolTypeRouter(
        {
            # HTTP & HTTPS
            "http": get_asgi_application(),
            # WebSocket
            "websocket": AllowedHostsOriginValidator(
                AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
            ),
        }
    )
else:
    application = get_asgi_application()
