# Manufacturing AI Defect Detection System

## Quick Start Guide

This project uses Django for the backend and the Vite React app in `frontend-vite` for the frontend.

## One-Time Setup

### 1. Install Backend Dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the repo root:

```env
SECRET_KEY=django-insecure-change-this
DEBUG=True
DB_NAME=auto_qa_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/0
```

### 3. Install Frontend Dependencies

```powershell
cd frontend-vite
npm install
cd ..
```

### 4. Apply Database Migrations

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

Default seeded users:

- Admin: `admin` / `admin`
- Legacy admin: `superadmin` / `superadmin` (maps to ADMIN)
- Legacy user: `inspector` / `inspector` (maps to USER)

## Running The System

Use separate terminals for each process.

### Terminal 1: Django Backend

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

Backend URL: `http://localhost:8000`

### Terminal 2: Vite Frontend

```powershell
cd frontend-vite
npm run dev
```

Frontend URL: `http://localhost:5173`

### Optional: Daphne, Redis, And Celery

Use these only when testing WebSocket or background task behavior.

```powershell
daphne -b 0.0.0.0 -p 8000 ai_ins_sys.asgi:application
celery -A ai_ins_sys worker -l info
celery -A ai_ins_sys beat -l info
```

Redis must be running before Celery or Channels Redis features can work.

## Useful Checks

Backend:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py showmigrations core
```

Frontend:

```powershell
cd frontend-vite
npm run build
```

## Common Issues

### Frontend cannot connect to backend

The frontend uses `/api` by default. If the backend is on another host or port, create `frontend-vite/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

### Login fails

Check that migrations were applied and use one of the seeded accounts above.

### Inference model not found

Confirm the configured model path exists. The default is controlled by `INFERENCE_DEFAULT_WEIGHTS` in `.env` or `ai_ins_sys/settings.py`.

### Celery tasks do not run

Make sure Redis is running, then restart the worker:

```powershell
celery -A ai_ins_sys worker -l info
```

## Notes For The Team

- Do not commit `.env`, `.venv`, `node_modules`, `frontend-vite/dist`, or generated media snapshots.
- Generated captures and inference snapshots are ignored by Git.
- Run `npm install` after pulling frontend dependency changes.
