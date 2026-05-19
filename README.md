# AUTO-QA TPC

AUTO-QA TPC is an integrated inspection and quality-assurance platform combining a Django backend, a Vite + React frontend, and an inference service for automated visual inspection. The app includes role-based dashboards (Superadmin, Admin, Operator, Inspector), real-time metrics, and a lightweight retraining pipeline.

## Quick overview

- Backend: Django REST API serving `/api` endpoints, JWT auth, Celery tasks for background work.
- Frontend: Vite + React app in `frontend-vite/` with role-driven panels and live camera capture.
- Inference: Local inference service (see `inference_server/`) that runs model detection and reports results back to the backend.

## Quick start (development)

Prerequisites:

- Python 3.10+ and Node.js 16+ installed.
- PostgreSQL (recommended) or a compatible DB for production workflows.

### Inference server

The standalone inference service lives in [inference_server/app.py](inference_server/app.py). For local development on Windows, use the bundled launcher instead of `uvicorn --workers 2`:

```powershell
.\.venv\Scripts\python.exe inference_server\run_server.py
```

On Linux or macOS you can still set `INFERENCE_SERVER_WORKERS` for higher concurrency.

Backend (Django):

1. Create and activate a virtual environment (from repo root):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install Python dependencies and create a `.env` with required values:

```powershell
pip install -r requirements.txt
# create .env at repo root with at minimum:
# SECRET_KEY=your-secret
# DB_NAME=...
# DB_USER=...
# DB_PASSWORD=...
# DB_HOST=localhost
# DB_PORT=5432
```

3. Apply migrations and seed default users:

```powershell
.\.venv\Scripts\python.exe manage.py migrate --noinput
```

4. Run the development server:

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

Default seeded users (for dev/testing):

- Admin: `admin` / `admin` (admin)
- Superadmin: `superadmin` / `superadmin` (superadmin)
- Inspector: `inspector` / `inspector`

Frontend (Vite + React):

1. From `frontend-vite/` install dependencies and run the dev server:

```powershell
cd frontend-vite
npm install
npm run dev
```

2. The frontend expects the API at `/api` by default. To point to a different backend, set `VITE_API_BASE_URL` in `frontend-vite/.env`, e.g.:

```text
VITE_API_BASE_URL=http://localhost:8000/api
```

## Useful notes

- Authentication: frontend reads `role` from the JWT token to route to the correct dashboard.
- Inference models and weights live under `models/weights/` and the inference server is at `inference_server/app.py`.
- Media and captured images are stored in `media/` during runtime; ensure proper storage configuration for production.

## Contributing & Support

- Run linters and tests before opening PRs. Frontend linting is available under `frontend-vite` via `npm run lint`.
- See `SYSTEM_OVERVIEW.md` for a detailed architecture and developer notes.

---

This README is a concise developer entry point — for a full architectural overview see `SYSTEM_OVERVIEW.md`.
