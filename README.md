# AUTO-QA TPC

The active frontend is now the Vite app in [frontend-vite](frontend-vite). Use the root scripts to work with it from the repository root.

## Scripts

- `npm run dev` starts the Vite frontend.
- `npm run build` produces a production build.
- `npm run lint` runs the frontend lint checks.
- `npm run preview` serves the production build locally.

## Backend

The React app talks to Django through `/api` routes, with JWT auth and role-based dashboard panels already wired in.
