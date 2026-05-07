# AUTO-QA TPC

The active frontend is now the Vite app in [frontend-vite](frontend-vite). Use the root scripts to work with it from the repository root.

## Scripts

- `npm run dev` starts the Vite frontend.
- `npm run build` produces a production build.
- `npm run lint` runs the frontend lint checks.
- `npm run preview` serves the production build locally.

## Backend

The React app talks to Django through `/api` routes, with JWT auth and role-based dashboard panels already wired in.

## Running the project (development)

Backend (Django):

1. Create and activate a Python virtualenv (from repo root):

```powershell
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
```

2. Install dependencies and create `.env` with these values (example):

```powershell
pip install -r requirements.txt
# Create a .env file in the repo root with at minimum:
# SECRET_KEY=admin
# DB_NAME=ai_ins_sys
# DB_USER=postgres
# DB_PASSWORD=admin
# DB_HOST=localhost
# DB_PORT=5432
```

3. Apply migrations (this will also seed default users):

```powershell
.\\.venv\\Scripts\\python.exe manage.py migrate --noinput
```

4. (Optional) Create a superuser if you want custom admin credentials:

```powershell
.\\.venv\\Scripts\\python.exe manage.py createsuperuser
```

5. Run the dev server:

```powershell
.\\.venv\\Scripts\\python.exe manage.py runserver
```

Default seeded users (created by migrations):

- Admin: `admin` / `admin` (superuser)
- Inspector (operator role): `inspector` / `inspector`

Frontend (Vite React):

1. Install Node deps and run the dev server (from `frontend-vite`):

```powershell
cd frontend-vite
npm install
npm run dev
```

2. The frontend expects the API at `/api` by default. If your backend is running on a different host/port, set `VITE_API_BASE_URL` in `frontend-vite/.env` (e.g. `VITE_API_BASE_URL=http://localhost:8000/api`).

Notes:
- Login uses JWT tokens and the frontend reads the `role` claim in the token to route users to the proper dashboard.
- If login fails, check backend logs and ensure the backend URL and credentials match the seeded users above.
