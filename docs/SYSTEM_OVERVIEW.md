# System Overview — AUTO-QA TPC

This document describes the architecture, components, and data flows of the AUTO-QA TPC system. It is intended for developers and engineers who will maintain, extend, or deploy the platform.

## High-level architecture

- Backend: Django (REST API) providing authentication, API endpoints, and persistence.
- Frontend: Vite + React app located in `frontend-vite/`, implementing role-specific dashboards and live camera capture UI.
- Inference service: Lightweight Python service in `inference_server/` that loads model weights and exposes inference endpoints or sockets.
- Worker queue: Celery (configured in `ai_ins_sys/celery.py`) for background tasks such as retraining, heavy processing, and scheduled jobs.
- Storage: `media/` for runtime captures and `models/weights/` for model artifacts.

## Key components

- `ai_ins_sys/` — project settings, Celery, ASGI, WSGI and app config.
- `core/` — application logic: models, serializers, views, tasks, connectors, and routing for channels/websockets.
- `frontend-vite/` — React UI: components for Operator, Inspector, Admin, and Superadmin dashboards. Uses JWT-based auth and reads role claim for routing.
- `inference_server/` — inference entrypoint (single-file app) that can be run locally or containerized to serve model predictions.

## Authentication & Roles

- JWT tokens are used for authentication; tokens include a `role` (or `groups`) claim.
- Frontend decodes the JWT to determine which panel to show (see `App.jsx`).
- Roles: `superadmin`, `admin`, `operator`, `inspector` (mapping normalized in `App.jsx`).

## Data flow (capture → inference → log)

1. Operator captures frame via webcam in the frontend.
2. Frontend sends the image to the backend inference endpoint (or directly to the inference server depending on configuration).
3. The inference model returns detections and metadata (confidence, bounding boxes, segmentation masks).
4. Backend persists the result as an InferenceLog (in `core.models`) and may enqueue background tasks (e.g., tagging, review notifications, retraining queue).
5. Logs are visible in role-specific dashboards; Superadmin can view system-level metrics and alerts.

## Real-time & integrations

- WebSocket endpoints (Channels) provide real-time metrics and status updates (see `routing.py` and `consumers.py`).
- Celery tasks handle asynchronous workloads (retraining queue, model updates, heavy processing).
- Connectors can be used to integrate external systems or cloud storage.

## Development notes

- Seeded users are created by migrations for convenient local testing.
- Model weights (example files) are provided under `models/weights/` — update these for different model experiments.
- Media files are saved to `media/`; consider configuring a remote storage provider for production (S3, Azure Blob, etc.).

## Running & deployment

- Dockerization: containerize each component (Django, Celery worker, Redis broker, Postgres, inference service, and frontend static server) and orchestrate with docker-compose or Kubernetes.
- Use environment variables for secrets and DB connections (see `.env` usage in the README).
- For production, run static build of `frontend-vite` and serve from a CDN or via an app server.

## Troubleshooting & tips

- If frontend cannot reach backend, set `VITE_API_BASE_URL` in `frontend-vite/.env`.
- If inference appears slow, verify the inference server is running and that GPU resources (if used) are available.
- Logs and Celery results are useful to diagnose async task failures.

## Extending the system

- Add new roles by extending token claims and updating `App.jsx` routing and backend permissions.
- Replace or augment the inference pipeline by implementing a new service in `inference_server/` and updating API connectors.
- Add monitoring and alerting for production: uptime checks, model drift monitoring, and error tracking.

---

For more context, review source files in `core/`, `ai_ins_sys/`, and the frontend components in `frontend-vite/src/components/`.
