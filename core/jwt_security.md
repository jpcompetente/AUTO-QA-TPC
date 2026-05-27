"""
JWT Authentication & Authorization Documentation

This module enforces JWT-based authentication for all API endpoints and WebSocket connections.
Only active, authenticated users (and admins) can initiate sessions and run inference.

Architecture:
=============

1. REST API Endpoints
   - All endpoints use DRF's JWTAuthentication
   - Token passed in: Authorization: Bearer <token>
   - Backend validates token signature, expiration, and user status

2. WebSocket Consumers (Channels)
   - Authentication via token in query string or subprotocols
   - InferenceStreamConsumer: authenticates before accepting connection
   - LiveViewConsumer: validates session_id format
   - Both consumers close connections with 4401 (Unauthorized) if auth fails

3. Role-Based Access Control (RBAC)
   - USER: Can only see and modify their own data
   - ADMIN: Can see assigned operator groups and manage system
   - Legacy inspector accounts are treated as USER role

4. Backend Enforcements
   - JWT middleware validates every request (REST)
   - Each consumer authenticates on connection (WebSocket)
   - User must be active and have proper role
   - Session tracking via manufacturing_order (MO) identifier

Implementation Details:
======================

REST Endpoints:
- BasePermission classes:
  * permissions.IsAuthenticated: Requires valid JWT
  * IsAdminOnly: Restricts to admin role
  * IsAdminOrReadOnlyAuthenticated: Safe methods for any auth'd user

- ViewSet Permission Pattern:
  from rest_framework import permissions
  
  class MyViewSet(viewsets.ModelViewSet):
      permission_classes = [permissions.IsAuthenticated]
      
      def get_queryset(self):
          # Role-aware filtering
          role = user_role(request.user)
          if role == 'ADMIN':
      return Model.objects.all()
  return Model.objects.filter(operator=request.user)

WebSocket Endpoints:
- Token extraction methods:
  1. Query string: ws://host/path?token=<jwt_token>
  2. Subprotocols: Connection with subprotocol "jwt.<token>"
  3. Session-based: From authenticated session context

- Consumer Authentication Pattern:
  from rest_framework_simplejwt.tokens import AccessToken
  
  @database_sync_to_async
  def _authenticate_user(self):
      token = # extract from query_string or subprotocols
      try:
          access = AccessToken(token)
          user_id = access.get('user_id')
          return User.objects.filter(id=user_id, is_active=True).first()
      except Exception:
          return None

JWT Token Structure:
====================

Claims in JWT:
- user_id: Django User ID
- username: Username
- role: User role (USER, ADMIN)
- exp: Expiration timestamp (default: 5 minutes)
- iat: Issued at timestamp
- token_type: 'access' or 'refresh'

Token Refresh:
- Access tokens expire after configured duration
- Use refresh token to obtain new access token
- Endpoint: /api/auth/token/refresh/
- Refresh tokens have longer lifetime (default: 24 hours)

Session Management:
===================

MO (Manufacturing Order) as Session ID:
- Session starts with /session/start/<MO>/
- Operator must provide MO number
- Product count resets to 1 for new sessions
- Product count increments after each inspection
- Session ends with /session/end/<MO>/

Active Configuration Linking:
- Operator has active config for their product
- Config specifies model to use for that product
- Config can be shared across multiple MOs if they share Product ID
- Confidence threshold defined per config

Inference Log Association:
- Each inference log linked to:
  * Operator (who performed it)
  * Session ID (MO identifier)
  * Model used
  * Component/Product
  * Manufacturing order

ERROR State Handling:
- If confidence < threshold, system_decision = 'ERROR'
- Status = 'ERROR' (pending manual review)
- Rejection reason = 'CONFIDENCE_BELOW_THRESHOLD'
- Pending review endpoint includes both PENDING and ERROR logs

Odoo Integration:
=================

Background Sync (Non-Blocking):
- Triggered via /session/odoo-sync/ endpoint
- Uses Celery for background processing
- Fetches MOs and Products from Odoo XML-RPC/JSON-RPC
- Populates ManufacturingOrderSession and prepares configs
- Does not block UI during session start

Sync Service:
- OdooConnector: Handles XML-RPC/JSON-RPC communication
- OdooSyncService: Syncs MO data to local models
- trigger_odoo_sync_background: Celery task trigger

Security Best Practices:
========================

1. Token Storage (Frontend):
   ✅ Store in secure HTTP-only cookies (preferred)
   ❌ Never store in localStorage (XSS vulnerability)
   ✅ Store in memory during session (less persistent)

2. Token Transmission:
   ✅ Always use HTTPS in production
   ✅ Pass token in Authorization header: Bearer <token>
   ❌ Don't include token in URL (logs exposure)
   ✅ Use WebSocket Secure (wss://) for real-time

3. Token Expiration:
   ✅ Keep access tokens short-lived (5-15 minutes)
   ✅ Use refresh tokens for longer sessions (24+ hours)
   ✅ Refresh proactively before expiration

4. CORS & CSRF:
   ✅ CSRF_TRUSTED_ORIGINS configured in settings.py
   ✅ CorsMiddleware at top of middleware stack
   ✅ Browser enforces same-origin policy

5. Rate Limiting:
   - Consider adding django-ratelimit for sensitive endpoints
   - Apply per-user rate limits on /inference/detect/
   - Apply stricter limits on /session/start/

6. Audit Logging:
   - All inference logs include operator, timestamp, model
   - Admin can query logs by operator, date range, model
   - Retraining queue tracks false positives for analysis

Testing:
========

Unit Tests:
- Test authentication required on endpoints
- Test role-based access control
- Test invalid/expired tokens
- Test operator data isolation

Integration Tests:
- Test JWT token generation/refresh flow
- Test WebSocket auth with valid/invalid tokens
- Test session creation with MO sync
- Test inference with proper auth

Example Request:
```
POST /api/inference/detect/ HTTP/1.1
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
Content-Type: application/json

{
  "image": "base64_encoded_image_data",
  "session_id": "MO-2025-001",
  "manufacturing_order": "MO-2025-001",
  "confidence": 0.5
}
```

Example WebSocket Connection:
```
const token = localStorage.getItem('token');
const ws = new WebSocket(
  `wss://api.example.com/ws/inference/?token=${token}`
);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'frame',
    session_id: 'MO-2025-001',
    image_base64: 'data:image/jpeg;base64,...'
  }));
};
```

Monitoring & Debugging:
=======================

Common Auth Errors:
- 401 Unauthorized: Missing or invalid token
- 403 Forbidden: Authenticated but insufficient permissions
- 4401 (WebSocket): Failed authentication
- 4403 (WebSocket): Insufficient permissions

Debug Checklist:
✓ Token is present in request header
✓ Token is not expired (check 'exp' claim)
✓ Token signature is valid (not tampered)
✓ User is active (is_active=True in database)
✓ User has proper role assigned
✓ User is not logged out or revoked elsewhere

Log Files to Check:
- Django logs: Look for JWTAuthentication errors
- Daphne logs: WebSocket connection auth failures
- Celery logs: Background task execution for Odoo sync

References:
===========
- Django REST Framework: https://www.django-rest-framework.org/
- Simple JWT: https://django-rest-framework-simplejwt.readthedocs.io/
- Django Channels: https://channels.readthedocs.io/
- Django Security: https://docs.djangoproject.com/en/stable/topics/security/
"""

# Configuration Constants

JWT_AUTH_SETTINGS = {
    'ACCESS_TOKEN_LIFETIME': 5,  # minutes
    'REFRESH_TOKEN_LIFETIME': 24,  # hours
    'ALGORITHM': 'HS256',
    'VERIFY_SIGNATURE': True,
    'VERIFY_EXP': True,
}

ROLE_HIERARCHY = {
    'ADMIN': ['USER'],
    'USER': [],
}

# Permission Requirements by Endpoint

ENDPOINT_PERMISSIONS = {
    # Inference Endpoints
    'POST /api/inference/detect/': 'IsAuthenticated',
    'GET /api/inference/health/': 'Public',
    'GET /api/inference/metrics/': 'IsAuthenticated',
    
    # Session Management
    'POST /api/session/start/<mo>/': 'IsAuthenticated',
    'POST /api/session/end/<mo>/': 'IsAuthenticated',
    'GET /api/session/current/': 'IsAuthenticated',
    'POST /api/session/odoo-sync/': 'IsAuthenticated',
    
    # Analytics
    'GET /api/analytics/dashboard/': 'IsAuthenticated (role-aware)',
    'GET /api/analytics/operator-performance/': 'IsAdminOnly',
    
    # Admin Only
    'POST /api/ai-models/': 'IsAdminOnly',
    'PUT /api/ai-models/<id>/': 'IsAdminOnly',
    'DELETE /api/ai-models/<id>/': 'IsAdminOnly',
    
    # WebSocket
    'ws://inference/': 'JWT Token Auth',
    'ws://live-view/': 'JWT Token Auth',
}
