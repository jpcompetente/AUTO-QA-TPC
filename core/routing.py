"""
WebSocket URL routing for real-time inference monitoring
"""

from django.urls import path
from . import consumers

websocket_urlpatterns = [
    # Operator frame streaming for server-side inference + overlays
    path('ws/inference-stream/', consumers.InferenceStreamConsumer.as_asgi()),

    # Real-time inference streaming from Operator to Super Admin
    path('ws/live-view/<str:session_id>/', consumers.LiveViewConsumer.as_asgi()),
    
    # Live metrics dashboard
    path('ws/metrics/', consumers.MetricsConsumer.as_asgi()),
    
    # Training progress updates
    path('ws/training-progress/<int:training_job_id>/', consumers.TrainingProgressConsumer.as_asgi()),
    # Simple WebRTC signaling relay (room by session_id)
    path('ws/webrtc/<str:session_id>/', consumers.WebRTCSignalingConsumer.as_asgi()),
]
