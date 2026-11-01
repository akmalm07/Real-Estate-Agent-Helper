# RealCRM — Real Estate Agent Helper

RealCRM is a real-estate CRM prototype for helping agents organize leads, properties and conversations. It brings together a React and TypeScript interface with an Express backend and PostgreSQL data layer.

## Status

Finished UI prototype; full-app/live validation is incomplete, and this is **not production-ready**.

## Screenshot walkthrough

[![Open the screenshot walkthrough (synthetic visual fixtures; not a logged-in recording or authenticated E2E)](docs/demo/poster.jpg)](docs/demo/walkthrough.mp4)

[Play the screenshot walkthrough](docs/demo/walkthrough.mp4) · [How it was made and what it shows](docs/demo/README.md)

This is a montage of reviewed screenshots using synthetic visual fixtures—not a logged-in recording, authenticated end-to-end session, or demonstration of persisted actions.

## Local run recipes

Prerequisites: Node **22.22.0** and npm. From the repository root, start the UI:

```sh
cd frontend
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open [http://localhost:5173](http://localhost:5173) to view the public UI. Configure `backend/.env` as described below, then start the API from the repository root in a separate terminal:

```sh
cd backend
npm ci
FRONTEND_URL=http://localhost:5173 PORT=8080 node src/server.js
```

The public UI can run separately; API-backed features require the backend. The frontend targets `http://localhost:8080/`. These are source-checked launch recipes, **not** a verified fresh full-stack quickstart or E2E evidence. API dotenv reads `backend/.env` from `backend/`. Use only an already configured, isolated synthetic/development **Neon HTTP-compatible** `DATABASE_URL` with schema; plain PostgreSQL is not compatible with the default app driver. Configure `JWT_SECRET`, `JWT_EXPIRATION`, and `TEMP_TOKEN_EXPIRATION`; password reset uses `PASSWORD_RESET_SECRET` (defaults to `JWT_SECRET`) and optionally `APP_BASE_URL`.

Enabled integration paths need their provider configuration: Google OAuth uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SCOPES` and, for Gmail watch, `GMAIL_TOPIC`, plus matching Pub/Sub/scheduler audiences and service accounts. Outlook requires Microsoft OAuth settings, `MICROSOFT_SCOPES` and `MICROSOFT_WEBHOOK_CLIENT_STATE`; its auth mount is currently commented out. Configure AI, Twilio or Telnyx settings only for applicable features; see the relevant [backend source](backend/src/) for details. Use synthetic data only—no real customer/provider accounts or live delivery.

See [local setup](docs/LOCAL-SETUP.md) for bounded runtime-test prerequisites (not turnkey app setup), [verification evidence](docs/VERIFICATION.md), and [visual verification](docs/VISUAL-VERIFICATION.md).

## Future Features

Planned work is to verify and repair existing account, inbox, AI and manual-takeover workflows; exercise simulated email ingestion end to end; and capture a real authenticated walkthrough. Live integrations and production readiness remain future verification goals, not current capabilities or delivery promises.

## Project documentation

- [Feature matrix](docs/FEATURE-MATRIX.md) — historical inventory, not current acceptance
- [Interim project record](docs/INTERIM-PR.md)
- [Image credits and provenance](docs/IMAGE-CREDITS.md)
- [Walkthrough details](docs/demo/README.md)
