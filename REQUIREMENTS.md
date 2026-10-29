# Real Estate Agent Helper — repair and verification

Status: APPROVED by the user's execution request on 2026-10-29; implementation requires the matching factory scope lock.

## Purpose
Make the existing real estate lead-management application functional, repairing demonstrated defects rather than redesigning or adding speculative features.

## Project
- Repository: GitHub.com/akmalm07/real-estate-agent-helper (GitHub canonical casing: akmalm07/Real-Estate-Agent-Helper).
- Workspace: /root/factory/projects/real-estate-agent-helper
- Dedicated board: real-estate-agent-helper
- Starting commit: fed781eb9fae109b065cf2a9a4d27d09d60d306d; base: main; repair branch: fix/functional-repair.
- Lock: /root/factory/state/locks/real-estate-agent-helper.json, validated by factoryctl status real-estate-agent-helper.

## Scope
- Inspect and exercise the existing frontend, backend, database, authentication, lead/property/note/task management, dashboard, conversations, settings/onboarding, and ingestion/AI paths actually present in the repository. Repair reproducible functional and directly relevant security defects with regression tests.
- Preserve the existing React/Vite, Express, Drizzle/PostgreSQL/Neon design and Google Cloud, Gmail OAuth, Gmail Watch and Pub/Sub integration architecture. Preserve existing other provider integrations; do not swap cloud vendors, databases or frameworks.
- Add an explicitly opt-in, isolated local/test simulation for inbound email pushes, representative Gmail/Pub/Sub notification payloads and email fetch/send boundaries. Exercise real ingestion, persistence and UI flows against synthetic fixtures; capture outbound messages locally, never deliver them.
- Live email, SMS and phone provider operations are excluded from required live testing because access is unavailable. Test local code paths safely where possible and distinguish simulated versus untested provider operations.
- Establish a repeatable isolated test database/runtime without production data. Deterministic doubles may be used at unavailable external boundaries, including AI if credentials are missing; identify these boundaries and never call them live integration verification.
- Install ordinary local project/test dependencies and fix reproducible install/build/lint/test/startup failures without unnecessary major upgrades. Do not execute cloud provisioning or deployment scripts.
- Use small serialized Kanban tasks assigned to mvp-coder, independent verification by mvp-reviewer, a feature branch, and a GitHub PR. Manager coordinates and does not implement application code.

## Out of scope
- Architectural rebuilds, speculative features, unimplemented Outlook/new CRM expansions, broad redesigns and unrelated refactoring.
- Live email/SMS/calls, production-data mutations, cloud provisioning/deployment, IAM/billing changes, paid-service activation, destructive remote operations, force pushes, merge or direct commits to main.
- Invented passing tests, synthetic responses represented as live-provider results, or exhaustive-coverage claims without an explicit feature matrix.

## Acceptance criteria
1. Fresh local setup has documented commands and safe sample configuration; backend starts and frontend production build succeeds. Lint/type/test commands are usable and pass, or an exact independently reviewed external blocker is disclosed.
2. A feature/route matrix covers every existing page and backend route, with actual execution evidence and explicit pass/fail/simulated/blocked/not-applicable classifications. Test positive, negative and authorization paths plus browser journeys for accessible core workflows.
3. Local email-push simulation exercises the existing Google-shaped ingestion pipeline end to end, including persistence and visible application results, duplicate/idempotency, malformed-input and error paths, without real email/phone deliveries.
4. Simulation is disabled by default, cannot be activated through request parameters or untrusted webhook data, is isolated from production settings/data, and does not weaken production authentication or replace real Google clients/services.
5. Relevant regression tests and full available suites execute against the final candidate. Record exact commands, exit codes, runtime prerequisites and access gaps in docs/VERIFICATION.md. Commit synthetic fixtures only, no credentials/private data.
6. mvp-reviewer independently reviews and reruns available acceptance checks against the exact candidate commit. Return findings to the coder; repair accessible failures rather than weakening tests.
7. Push a feature branch and create a PR targeting main in the existing repository, including summary, evidence, simulation instructions and honest limitations. Read back exact remote head, PR state and CI. No merge authorized.

## Deployment
No deployment authorized. Preserve Google Cloud and Google services configuration/implementation. Inspect credential presence only, never values. Ask the user only about newly discovered blocking product choices, required missing access or costly/irreversible actions; continue other safe work. Checkpoint provider rate limits for durable queue retry, without repeated probing.
