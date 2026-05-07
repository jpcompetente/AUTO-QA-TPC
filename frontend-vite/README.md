# AUTO-QA TPC Frontend

This Vite app is the active frontend for the project.

## Run

- `npm run dev`
- `npm run build`
- `npm run lint`

## Behavior

The app starts with the login screen, then routes into admin, operator, or super admin panels based on the JWT role returned by Django.
