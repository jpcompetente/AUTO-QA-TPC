# PR Preflight Commands

Run these commands before opening a pull request. Execute them from the repository root unless a different folder is noted.

## Recommended One-Command Check

Run the helper script first. It launches the backend tests, inference-server tests, frontend lint, and frontend build, then prints the output for each step:

```powershell
.\scripts\run_pr_checks.py
```

Use this as the main pre-PR verification step when you want the full system check in one place.

## Backend

If you changed Django models, views, serializers, permissions, or API logic:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test core.tests -v 2
```

If you touched model fields, migrations, or anything that could affect schema state, also verify that no new migrations are pending:

```powershell
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

## Frontend

If you changed React components, styles, or frontend API calls:

```powershell
cd frontend-vite
npm run lintwww
npm run build
```

## Inference Server

If you changed the FastAPI inference service or its helpers:

```powershell
.\.venv\Scripts\python.exe -m unittest inference_server.tests -v
```

## Minimum PR Gate

Before creating the pull request, make sure all of the following pass for the files you changed:

```powershell
.\.venv\Scripts\python.exe .\scripts\run_pr_checks.py
or
 cd scripts; python run_pr_checks.py   
```

If you prefer to run the checks individually, these are the equivalent commands:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test core.tests -v 2
cd frontend-vite
npm run lint
npm run build
```

Add the inference-server test command when the backend change touches `inference_server/`.

## Notes

- Run the backend commands from the repo root.
- Run the frontend commands from `frontend-vite/`.
- If a command fails, fix the failure before opening the PR.


## Unit Testing

Frontend

- npm run build
- npm run lint

Backend

- Run Django app tests: run this "python manage.py test core --verbosity 2"
- Run inference server unit test: run this "python -m unittest inference_server.tests"
