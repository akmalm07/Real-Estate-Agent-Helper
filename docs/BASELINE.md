# Baseline diagnosis — not application acceptance

Task `t_8d91e4e1`, 2026-10-29. Project/board: `real-estate-agent-helper`.
Workspace: `/root/factory/projects/real-estate-agent-helper`.
Branch: `fix/functional-repair`; audited app commit: `fed781eb9fae109b065cf2a9a4d27d09d60d306d`.

Only diagnosis/evidence documents and the manager-created REQUIREMENTS.md / decisions.json are intended for this evidence commit. No application source, dependency manifest/lock, instruction file, provider configuration or cloud service was changed. No push, PR, merge or deployment was performed. This is a baseline for subsequent serialized repair tasks, not final product approval.

## Scope and controls

Read REQUIREMENTS.md, decisions.json, AGENTS.md, CLAUDE.md, root STYLE.md, and backend/frontend CLUADE.md and STYLE.md. `factoryctl status real-estate-agent-helper` returned exit 0 and `Scope valid: True`, both before work and after execution. The external lock names this project and records approval on 2026-10-29. The task explicitly authorizes an evidence-only feature-branch commit; this specific user authorization takes precedence over STYLE.md's general prohibition on automatic commits. No instruction files were edited, and no approval failure may be bypassed.

Inspected all requested package manifests, server/mounts, database files, routes, integration files, test files, App.tsx, API service and page files. Additionally inspected supporting auth/cache/AI/email helper modules and the unused legacy router to avoid missing route definitions. The complete inventory is in FEATURE-MATRIX.md: 63 explicit backend method/path definitions (36 mounted, 23 unmounted legacy, 4 unmounted Microsoft auth); 14 page files (13 active components, one commented-out file); 9 test files plus mock-db.js. Express's implicit HEAD/OPTIONS handling is not an additional source route.

All application API probes used deliberately unusable synthetic credentials and `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/reah_baseline`, never an inherited/production URL. Only pre-database validation/authentication paths were requested. Google redirects were observed with redirect-following disabled, never visited. No valid Pub/Sub/Scheduler/provider event was submitted. The unsafe unauthenticated watch-renewal route was not requested.

Presence-only checks found no `.env*` files at root, backend, frontend or backend/db. All inspected application config/credential variables were absent in the original shell: DATABASE_URL; JWT_SECRET/JWT_EXPIRATION; PASSWORD_RESET_SECRET/TEMP_TOKEN_EXPIRATION; Google client/secret/redirect/scopes/topic/PubSub audience/service-account variables; Scheduler URL/service account; Microsoft client/secret/redirect/scopes/webhook-state; OpenAI key; Telnyx key/number; Twilio account/API-key/auth/from-email variables; FRONTEND_URL/APP_BASE_URL/BASE_URL. No secret values or environment dumps were collected. Synthetic values below are not credentials.

## Actual command evidence

Commands ran from the directory in the second column. Exit codes are individual command results, not the final status of a shell that printed several results. No network/install failure occurred. Optional native dependencies were initially omitted under the incompatible system Node, then recovered by an ordinary locked reinstall under Node 22. Lifecycle scripts and npm audit were disabled.

| ID | Directory | Exact command | Exit / observed result |
|---|---|---|---|
| E01 | root | `factoryctl status real-estate-agent-helper` | 0; scope valid |
| E02 | root | `node --version; npm --version` | 0; foreground Node v18.19.1, npm 9.2.0 |
| E03 | root | `npm ci --ignore-scripts --no-audit --no-fund` | 0; added 7 packages |
| E04 | backend | `npm ci --ignore-scripts --no-audit --no-fund` | 0; added 147; EBADENGINE warnings for MSAL >=20, Neon >=19, Twilio >=20; deprecation warnings |
| E05 | frontend | `npm ci --ignore-scripts --no-audit --no-fund` | 0; added 228; engine warnings for Vite/Rolldown/ESLint/React Router |
| E06 | root | `npm exec --yes --package=node@22.22.0 -- node --version` | 0; v22.22.0, no app manifest/lock changes |
| E07 | frontend | `npm run build` | 2; 13 TypeScript diagnostics, listed below; Vite not reached |
| E08 | frontend | `npm run lint` | 2; ESLint 10.4.0 formatter throws `TypeError: util.styleText is not a function` on Node18 |
| E09 | frontend | `npm exec --yes --package=node@22.22.0 -- npm run build` | 2; same 13 TypeScript diagnostics; rerun after reinstall also exit 2 |
| E10 | frontend | `npm exec --yes --package=node@22.22.0 -- npm run lint` | 1; 30 errors, 0 warnings, 10 files |
| E11 | backend | `npm test` | 1; script is `echo "Error: no test specified" && exit 1`; does not run tests |
| E12 | backend | `node --test test/lead-scoring.test.js` | 1; import-time OpenAI missing credentials, before tests |
| E13 | backend | `node --test test/ai-helpers.test.js test/email-webhook-helpers.test.js` | 1; both files fail `mock.module is not a function` on Node18 |
| E14 | backend | `node src/server.js` | 1; `neon()` missing connection string during import; server not running |
| E15 | backend | `npm exec --yes --package=node@22.22.0 -- node --experimental-test-module-mocks --test test/ai-helpers.test.js test/email-webhook-helpers.test.js` | 1; 65 tests, 40 pass, 25 fail; DB/outreach/AI mocks, not DB or provider integration |
| E16 | backend | `npm exec --yes --package=node@22.22.0 -- node --experimental-test-module-mocks --test --test-reporter=spec test/outlook-email-webhook.test.js` | 1; missing DATABASE_URL on static dependency import before mocks take effect; no HTTP test executed |
| E17 | frontend | `npm exec --yes --package=node@22.22.0 -- npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` | initially 1; missing `@rolldown/binding-linux-x64-gnu`; process log verified |
| E18 | frontend | `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` | 1; background shell used Node v24.22.1, same missing binding; do not assume foreground/background PATHs agree |
| E19 | frontend | `npm exec --yes --package=node@22.22.0 -- npm ci --ignore-scripts --include=optional --no-audit --no-fund` | 0; added 230, recovered optional native binding; locks unchanged |
| E20 | frontend | repeat E17 after E19 | running smoke: Vite 8.0.14 ready in 1431ms; curl root HTTP200; real browser mounted React; cleanup blocked by unattended approval policy (see recovery note), not a production deployment |
| E21 | frontend | `npm exec --yes --package=node@22.22.0 -- node node_modules/vite/bin/vite.js build` | 0; 1669 modules, index HTML/CSS/JS generated; **bypasses TypeScript and is not a passing npm build** |
| E22 | frontend | `npm exec --yes --package=node@22.22.0 -- npm run --silent lint -- --format json` | 1; parsed JSON confirms 30 errors / 0 warnings / 10 files |
| E23 | root | `for file in backend/src/*.js backend/src/routes/*.js backend/src/ai/*.js backend/src/lead-detection/*.js backend/src/middleware/*.js backend/db/*.js backend/test/*.js; do node --check "$file" || exit $?; done` | 0; syntax only, not module-link/runtime correctness |
| E24 | backend | synthetic startup command below | without MICROSOFT_CLIENT_SECRET: 1, `invalid_client_credential`; with dummy secret and free PORT28371: actual server running and HTTP401 from /api/auth/me |
| E25 | root | `node .baseline-audit/http-probes.mjs` (recipe below) | 0; 47 status observations match expected baseline; includes known-bad 500/404; **not 47 passing product tests** |
| E26 | root | `node .baseline-audit/token-probe.mjs` (recipe below) | 0; `temporaryTokenAcceptedBySessionVerifier:true`; security defect |
| E27 | backend | `npm exec --yes --package=node@22.22.0 -- node --experimental-test-module-mocks --import ../.baseline-audit/safe-boundaries.mjs --test --test-reporter=spec test/lead-scoring.test.js test/webhook.test.js` | 1; 71 tests, 69 pass, 2 fail; explicit additional isolation, not unchanged integration tests |
| E28 | root | `git diff --exit-code -- backend frontend package.json package-lock.json CLAUDE.md STYLE.md` | 0; no tracked app/instruction changes |

No root scripts exist. Backend has no build/lint/start scripts; frontend has no test script. These are not reported as passed checks. Do not run bare `node --test` or glob the entire test directory: Gmail/phone/Outlook tests use real accounts/providers, and db_connection writes whichever DATABASE_URL is configured.

### Reproducible TypeScript and lint failures

E07/E09 emit:

- `frontend/src/components/layout/TopNav.tsx:1` — TS6133 unused Bell.
- `frontend/src/components/leads/LeadModal.tsx:48,199,200` — four TS2339 uses of `ReferLeadErrors.sourceId`, absent from the error type in `frontend/src/components/leads/types.ts`.
- `frontend/src/context/DashboardCacheContext.tsx:21` — TS6133 unused mergeDashboardData.
- `frontend/src/pages/HomePage.tsx:1,5` — unused React and EmptyState.
- `frontend/src/pages/LeadDetailPage.tsx:38` — TS2430 LeadDetail extends Lead with incompatible messages: leadId missing.
- `frontend/src/pages/PrivacyPolicyPage.tsx:1`, `SettingsPage.tsx:7,67`, `TermsOfServicePage.tsx:1` — unused imports/setter.

E22 JSON counts: 17 `@typescript-eslint/no-explicit-any`, 5 `@typescript-eslint/no-unused-vars`, 6 `react-hooks/set-state-in-effect`, 2 `react-refresh/only-export-components`. Paths: TopNav.tsx, VerifyLeadModal.tsx, AuthContext.tsx, DashboardCacheContext.tsx, hooks/useApi.ts, ChangePasswordPage.tsx, HomePage.tsx, LeadsPage.tsx, PropertiesPage.tsx, SettingsPage.tsx. No eslint fix, rule weakening or source edits were applied.

E15's failures are precisely stale test contracts: 13 `buildPrompt is not a function` in ai-helpers.test.js; 7 `regexParseLead is not a function` and 5 `isParseComplete is not a function` in email-webhook-helpers.test.js. The current AI shim / pipeline no longer export these symbols. The remainder of those files really executed against their checked-in mocks; this is not proof that AI or persistence works.

E27's two failures are `webhook.test.js:66,109`: normalized phone actuals `5551234567` / `2065550100`, versus formatted expectations `555-123-4567` / `(206) 555-0100`. Establish a canonical phone contract and test inbound E.164 lookup; do not merely relax assertions. Initially the audit-only preloader used a bare `openai` specifier from the repo root and failed module resolution (exit1, two test files did not execute). Correcting that probe to the installed backend ESM entry produced E27. This was a harness correction, not an app fix.

## Genuine database execution, isolated from the app driver

Docker daemon 29.1.3 and local image `postgres:17.7-alpine` were available; no image pull or cloud call was needed. Host psql/postgres commands were absent. Created only the task-owned ephemeral container:

```sh
docker run -d --name reah-baseline-t8d91e4e1-db --network none \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=reah_baseline \
  postgres:17.7-alpine
docker exec reah-baseline-t8d91e4e1-db pg_isready -U postgres -d reah_baseline
```

Both commands exit0. Inspect confirmed `running` / network `none`; psql reported PostgreSQL17.7 and initially zero public tables. No host port, production data or persistent project volume was used. Trust authentication is acceptable here only because this disposable container has no network and no port exposure.

Exact migration evidence (root):

```sh
docker exec -i reah-baseline-t8d91e4e1-db psql -v ON_ERROR_STOP=1 -U postgres -d reah_baseline < backend/db/migrations/0001_add_property_details.sql
docker exec -i reah-baseline-t8d91e4e1-db psql -v ON_ERROR_STOP=1 -U postgres -d reah_baseline < backend/db/migrations/0002_add_ai_enabled_to_leads.sql
```

On an empty DB both exit3: relation properties / leads does not exist. There is no checked-in initial full migration. A safe ordinary alternative, offline schema export (no database URL needed), succeeds:

```sh
# backend working directory; .baseline-audit is an audit-only workspace folder
npm exec --yes --package=node@22.22.0 -- node node_modules/drizzle-kit/bin.cjs export --dialect postgresql --schema ./db/schema.js > ../.baseline-audit/schema.sql
# root working directory
docker exec -i reah-baseline-t8d91e4e1-db psql -v ON_ERROR_STOP=1 -U postgres -d reah_baseline < .baseline-audit/schema.sql
```

Both exit0, producing 13 real public tables. Reapplying migration0001 then exits3: `invalid input value for enum property_source_type: "unknown"`; its column additions are no-ops but the default statement fails. Actual enum query returns `{zillow,realtor,listing}`. Migration0002 on exported schema exits0 (already-existing ai_enabled column notice). Schema export is a diagnostic bootstrap alternative, not a committed migration fix or evidence that checked-in deployment migrations work.

A further real-SQL fixture smoke ran with `docker exec -i reah-baseline-t8d91e4e1-db psql -v ON_ERROR_STOP=1 -U postgres -d reah_baseline < .baseline-audit/db-smoke.sql` (exit0): transactionally inserted one synthetic user/property/lead/note/task/conversation/email using valid enum values; SQL counts for user, lead, note, task and email were all true. ROLLBACK executed and users_after_rollback was0. This is direct psql relational execution, not the checked-in db_connection.test.js or application-driver integration. Only synthetic `example.invalid` identities were used.

**Important separation:** `backend/db/index.js` uses `neon()` with `drizzle-orm/neon-http`. Plain local PostgreSQL does not supply Neon's HTTP query endpoint. We did not pretend that setting DATABASE_URL to local Postgres makes the current application driver integrate with it. The current task exercised real SQL/schema/migrations, not existing app CRUD through Neon. A later isolated local Neon-compatible HTTP test transport/proxy, or explicit test-only injection below the preserved production Neon/Drizzle boundary, is needed before DB-backed browser acceptance. The production architecture must remain intact.

## Real browser evidence and limitations

After E19, navigated a real Chromium browser to the local Vite app. 17 distinct URL cases were saved/deduplicated in browser-session JSONL and read back. FEATURE-MATRIX.md records every page outcome. App console.error/window.error instrumentation saw only the expected missing-tempToken callback error in these cases; this is **not** a claim that network/devtools consoles were globally error-free.

The frontend hardcodes `http://localhost:8080/` in `frontend/src/consts.ts`. Port8080 was already owned by another local process; the initial read-only /api/auth/me probe returned404 and was excluded from application evidence. Port18080 was also occupied. Did not stop or modify either service. The task's backend was verified on a free port28371. Browser requests to localhost/127.0.0.1:8080 and HTTPS were blocked using CDP during the route sweep, so the frontend intentionally remained unauthenticated and could not contact unrelated services/providers. No authenticated API/browser integration is claimed. No Google button was clicked and no form causing external delivery was submitted.

Observed public pages: home, login/signup-mode toggle, terms, privacy, invalid-reset-link and reset-form states. Verified short-password client validation with synthetic input; no submit to backend occurred. Google callback without tempToken redirects to login and logs `No tempToken found in URL`. Protected URLs redirect to home in the unauthenticated state. `/confirm-email` is not routed and its file is fully commented out. Home's Learn More link navigates to nonexistent /signup and returns home. Login's legal anchors both point to `#`.

## Concrete findings and bounded repair groups

`EXEC` means observed by a command/browser/SQL request. `STATIC` means a demonstrated source contract contradiction that still needs a runtime regression test. Severity is triage priority, not a claim of tested exploit reachability.

### R1 — repeatable local runtime and truthful gates (first)

- EXEC: Node18 unsupported by current locked dependencies; E19 fixes missing optional Rolldown binding without lock changes. Pin/document a compatible Node runtime; no major dependency upgrade needed. Paths: root/backend/frontend package manifests and existing lockfiles; frontend/vite.config.ts only if a reproduced config issue requires it.
- EXEC: frontend build/lint failures above. Repair only implicated types/imports/effect/export locations; do not disable checks. Paths: frontend/src/components/{layout/TopNav.tsx,leads/LeadModal.tsx,leads/types.ts,leads/VerifyLeadModal.tsx}, frontend/src/context/{AuthContext.tsx,DashboardCacheContext.tsx}, frontend/src/hooks/useApi.ts, and the listed failing page files.
- EXEC: backend/package.json test is a failing placeholder; stale mocks/exports in backend/test/{ai-helpers.test.js,email-webhook-helpers.test.js,outlook-email-webhook.test.js,webhook.test.js}. Create safe explicit unit/integration commands with provider tests opt-in, not a blanket glob. Inspect current AI/pipeline exports before repairing tests.
- EXEC: missing fresh-schema migration and enum default mismatch. Paths: backend/db/{schema.js,index.js,drizzle.config.js,migrations/0001_add_property_details.sql,migrations/0002_add_ai_enabled_to_leads.sql}, backend/test/db_connection.test.js (its property source `unknown` also contradicts schema). Provide a synthetic DB transport/bootstrap before full CRUD tests; never use production DATABASE_URL. drizzle.config paths are CWD-relative and need a documented invocation.

### R2 — authentication and tenant safety

- EXEC high: backend/src/jwt.js `verifyToken(createTempToken(...))` accepts a temp OAuth token as a session token. STATIC: reset tokens also share JWT_SECRET by default and verifyToken maps userId to id without purpose checks; session verifier must reject non-session purposes. Add regression tests through backend/src/middleware/requireAuth.js. Never output token values.
- EXEC config blocker: backend imports require provider config even for manual auth; outlook.js eagerly creates MSAL despite Microsoft router unmounted, and google-auth.js / microsoft-auth.js blindly split missing scopes. Paths: backend/src/{server.js,outlook.js,microsoft-auth.js,google-auth.js,phone.js,ai/sms-reply.js,ai/email-reply.js,ai/lead-scorer.js,pubsub-webhook-helpers.js}. Ensure deterministic local startup without live provider credentials through narrow opt-in test boundaries, not vendor migration.
- STATIC high: google-auth.js authorization URLs/callback have no state/nonce session binding. Verify state and account-link ownership before accepting codes; never test this against real Google in this phase.
- STATIC high: email-helpers.js `findExistingEmailConversation`'s In-Reply-To branch returns a conversation without checking its leadId; legacy email-webhook.js handleInboundLeadEmail looks up lead by email globally. sms-webhook.js selects first lead by phone globally; a shared inbound number can make multi-agent routing ambiguous. Add synthetic two-agent authorization tests and explicit ownership boundaries rather than guessing tenancy.
- STATIC: frontend main.tsx mounts cache outside auth routing; DashboardCacheContext.tsx uses global localStorage keys and AuthContext.tsx logout does not clear them. Prior-user data can be shown across sessions. Test logout/login/cache isolation with synthetic users.
- STATIC: backend/src/consts.js has secure:false cookie. Keep HTTP-local behavior but verify secure production behavior without changing deployed config. Manual signup validates presence only; backend/src/routes/auth.js should enforce input types/password policy, not rely solely on UI.
- EXEC/STATIC: LoginPage.tsx navigates manual users to /confirm-email, but App.tsx has no such route and ConfirmEmailPage.tsx is commented; routes/auth.js has no /signup/code handler. Do not claim confirmation works. Resolve the already-existing intended flow explicitly, without speculative new auth features.

### R3 — core data contracts, notes and cache correctness

- EXEC: frontend/src/services/api.ts postNote targets `/api/leads/:id/notes`; server has only `/api/notes` in routes/notes.js. Local POST to nested path returns404 before any DB access. Repair caller/server contract and exercise creation + re-fetch.
- STATIC/SQL-supported: routes/properties.js PATCH VALID_SOURCES allows referral/unknown (invalid DB enum) and rejects listing (valid default). PropertiesPage.tsx offers invalid sources and resubmits source on edit. POST silently maps these to listing. Align schema, create/edit controls and validation without a new source taxonomy.
- STATIC: routes/dashboard.js omits propertyId/updatedAt/sourceId from lead data consumed by LeadsPage.tsx, and status list uses new/cold/converted rather than DB lifecycle ready/archived. Its message channel detection compares numeric IDs across SMS/email tables, causing collisions. services/api.ts Property/Lead/Dashboard interfaces differ from actual backend payloads. Add fixture-driven contract tests.
- STATIC: DashboardCacheContext.tsx initial request is since=1m, background request is since=1d and **replaces** cache; LeadsPage.tsx uses that truncated dashboard cache rather than /api/leads, so old leads disappear. Property/message refresh compares IDs/order but ignores edited fields when IDs are unchanged; optimistic lead updates discard email/phone/aiEnabled. Use actual all-record list data and scoped cache refresh tests, not larger speculative abstractions.
- STATIC: DashboardPage.tsx Review now links /leads?filter=unverified but LeadsPage.tsx ignores query filter. LeadDetailPage.tsx defaults SMS even for email-only lead. Types/nullability and globally unique message keys need contract coverage, not hardcoded zero scores presented as live scoring.
- STATIC: SettingsPage.tsx uses weeklySummaryNotify instead of backend/AuthContext weeklySummeryNotify, hardcodes Google-connected=true with local-only Connect/Disconnect toggles, and displays Saved even after HTTP failure. Preference persistence must be verified, not simulated by toggling UI state.

### R4 — existing message actions and provider failure boundaries

- STATIC: MessagesPage.tsx handleSend only waits500ms and clears text; it never calls /api/messages. Wire existing endpoint using same error/outbound-capture boundary as LeadDetailPage; do not add a new messaging service.
- STATIC high: phone.js sendSMS catches errors and returns `{success:false}` while routes/messages.js, sms-webhook.js and pubsub-webhook-helpers.js record outbound/success without checking it; they expect `.sid`, but Telnyx success returns `.messageId`. Initial outreach also swallows errors. Verify failures do not persist successful outbound records or show success.
- STATIC: routes/leads.js resolves preferred email, but sendInitialMessages always prefers phone if present, possibly routing to SMS with null agent/OAuth values. Missing oauthRow.refreshToken also throws for manual users. Test selected channel, absent credentials, opted-out/manual AI state and custom/AI modes with provider fakes.
- EXEC/STATIC: email-webhook.js /draft returns400 for missing leadId,401 even with valid session cookie for leadId1 because req.userId is never set. It lacks requireAuth and references undefined writeReplyEmail. Do not call it a working draft feature. Fix only if keeping this existing endpoint; source handler also has stale saveEmailMessage positional arguments.
- EXEC config-specific: unsigned /webhook/sms returns500 (`Invalid URL` in Twilio validateRequest) when BASE_URL is missing; signature validation occurs outside try. Proper configured bad-signature response remains unverified. No valid SMS or outbound messages were sent.

### R5 — safe Google-shaped simulation, ingestion/idempotency and schedulers

- STATIC high: shaduled-gmail-watch.js comments out the Scheduler authorization block. GET /schaduler/gmail-watch-reset/daily can perform provider mutations unauthenticated. Not invoked; add negative-auth regression before integration tests.
- STATIC: pubsub-email-webhook.js readNewEmails advances lastHistoryId before processing/persistence and does not follow history pagination; it skips failed message fetches, and outer catch returns401 even for DB/pipeline errors. Avoid dropping messages; distinguish auth, malformed input and transient processing failure.
- STATIC: pubsub-webhook-helpers.js deduplicates only active leads; unverified/ready leads can duplicate on retry. email-helpers.js idempotency query uses Gmail ID while inbound save usually stores RFC Message-ID, and schema lacks a unique provider-message constraint. Confirm sequential + concurrent duplicate behavior with real synthetic persistence.
- STATIC: deterministic parser accepts streeteasy/trulia/redfin/homes as final source, but backend/db/schema.js source_type does not. Normalize within existing supported enum or explicitly coordinate a narrowly justified migration; no unsupported new integrations.
- STATIC: email-helpers.js saves inbound but does not reset conversation.lastLeadMessageAt/unansweredFollowups in checkForLeadAndReply; scheduled-unreply-handler.js does not check lead.aiEnabled before follow-up. Prevent follow-up after manual takeover/reply and verify threading IDs. Do not run scheduler sends live.

These are recommended future batches, **not implemented here**. The unused backend/src/frontend-communicator.js contains 23 duplicate handlers (including stale undefined identifiers); server.js does not import/mount it. Do not repair the wrong file or remount legacy routes. Its findings must not be misrepresented as active endpoint failures.

## Proposed local simulation seams (not implemented)

Keep production Google OAuth/Gmail Watch/PubSub OIDC + Neon HTTP/Drizzle intact. Add an explicit server-side, disabled-by-default local/test composition boundary: reject production URLs/credentials, use synthetic users/OAuth rows, and never activate from query/body/webhook payload. Boundary seams already visible:

1. `google-auth-library` verifyIdToken/getAccessToken and Google userinfo/watch operations: deterministic local identity fixtures; production checks not weakened.
2. `pubsub-email-webhook.js` readNewEmails/fetch: Google-shaped base64 push (`message.data` JSON emailAddress/historyId), paginated history/message fixtures, no Gmail calls.
3. `gmail.js` request/fetch plus phone.js sendEmail/sendSMS: capture outbound envelopes locally; mark delivery simulated; reject all unknown network destinations. Preserve IDs/threading semantics.
4. OpenAI completion entrypoints in ai/*.js and pubsub-webhook-helpers.js: fixed structured outputs/errors; no paid/live model calls.
5. `backend/db/index.js`: an isolated test transport/Neon-compatible local adapter with genuine Postgres schema/constraints, never an always-empty mock masquerading as DB.

Exercise high/low-confidence, referral verification/deletion, repeat and concurrent push, malformed base64/JSON/body, expired auth, transient fetch/DB/AI/send failure, tenant boundaries, inactive/manual/opted-out conversation, and persisted results visible through real API + browser. Current helper tests and local HTTP rejections do **not** satisfy this future end-to-end acceptance.

## Reproduction recipes for audit-only probes

Temporary `.baseline-audit/` files are local evidence, not committed application source. For independent reruns they can be recreated from the snippets below. E25's full per-request statuses are enumerated in FEATURE-MATRIX.md, including failures; never run a send or DB-touching route against this dummy Neon URL. Root/backend ordinary dependencies must first be installed.

### Synthetic backend startup (backend directory)

```sh
env DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/reah_baseline \
  GOOGLE_SCOPES=openid MICROSOFT_SCOPES=openid \
  MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000 \
  MICROSOFT_CLIENT_SECRET=local-audit-not-a-real-secret \
  OPENAI_API_KEY=local-audit-not-a-real-key TELNYX_API_KEY=local-audit-not-a-real-key \
  JWT_SECRET=local-audit-not-a-real-secret JWT_EXPIRATION=1h \
  FRONTEND_URL=http://localhost:5173 PORT=28371 \
  npm exec --yes --package=node@22.22.0 -- node src/server.js
```

Use a free port and stop this process afterward. PORT8080 and18080 startup attempts misleadingly logged Server running and exited0 while those ports were occupied; process/listener/HTTP readback, not the log alone, established the real28371 startup. Do not confuse another service's response with this app.

### Safe helper preloader (`.baseline-audit/safe-boundaries.mjs`, root)

```js
import { mock } from 'node:test';
import { db } from '../backend/test/mock-db.js';
mock.module('../backend/db/index.js', { namedExports: { db } });
mock.module('../backend/src/phone.js', { namedExports: {
  sendSMS: async () => { throw new Error('AUDIT: outbound SMS forbidden'); },
  sendEmail: async () => { throw new Error('AUDIT: outbound email forbidden'); },
} });
mock.module('../backend/node_modules/openai/index.mjs', { defaultExport: class {
  chat = { completions: { create: async () => { throw new Error('AUDIT: external AI forbidden'); } } };
} });
globalThis.fetch = async () => { throw new Error('AUDIT: external fetch forbidden'); };
```

This is added audit isolation, not a passing as-shipped suite or production simulation. Use E27 command, not blanket test discovery. No production auth is altered.

### Token-purpose proof (`.baseline-audit/token-probe.mjs`, root)

```js
process.env.JWT_SECRET = 'synthetic-local-baseline-only';
process.env.JWT_EXPIRATION = '1h';
const { createTempToken, verifyToken } = await import('../backend/src/jwt.js');
const payload = verifyToken(createTempToken(12345));
console.log({ temporaryTokenAcceptedBySessionVerifier: payload.id === 12345 && payload.temp === true });
```

No token is printed. Expected fixed behavior would reject the temporary token; baseline accepts it.

### Safe HTTP sweep (`.baseline-audit/http-probes.mjs`, root)

```js
import assert from 'node:assert/strict';
process.env.JWT_SECRET = 'local-audit-not-a-real-secret';
process.env.JWT_EXPIRATION = '1h';
const { createToken } = await import('../backend/src/jwt.js');
const cases = [
 ['POST','/api/auth/signup',400],['POST','/api/auth/login',400],
 ['POST','/api/auth/logout',401],['GET','/api/auth/me',401],
 ['POST','/api/auth/change-password',400],['POST','/api/auth/change-password/confirm',400],
 ['POST','/api/settings/preferences',401],['GET','/api/onboarding',401],['POST','/api/onboarding',401],
 ['GET','/api/dashboard',401],['GET','/api/leads',401],['GET','/api/leads/1',401],
 ['POST','/api/leads',401],['POST','/api/leads/verify/1',401],['POST','/api/leads/1/send-initial',401],['PATCH','/api/leads/1',401],
 ['GET','/api/properties',401],['POST','/api/properties',401],['PATCH','/api/properties/1',401],
 ['GET','/api/messages',401],['POST','/api/messages',401],['POST','/api/messages/convert',401],['POST','/api/notes',401],
 ['GET','/auth/google/signup',302],['GET','/auth/google/login',302],['GET','/auth/google',400],
 ['POST','/auth/google/exchange',401],['GET','/auth/google/status',200],['GET','/auth/google/logout',200],
 ['POST','/webhook/gmail',401],['POST','/webhook/sms',500],['POST','/webhook/draft',400],
 ['GET','/webhook/outlook',400],['GET','/webhook/outlook?validationToken=synthetic',200],['POST','/webhook/outlook',202],
 ['GET','/schaduler/unreply/daily',401],['POST','/api/leads/1/notes',404],
];
async function probe(method,path,expected,cookie='',body={}) {
 const res=await fetch('http://127.0.0.1:28371'+path,{method,redirect:'manual',
  headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
  ...(method!=='GET'?{body:JSON.stringify(body)}:{})});
 console.log(method,path,res.status); await res.text(); assert.equal(res.status,expected);
}
for(const row of cases) await probe(...row);
const cookie='token='+createToken(12345);
for(const path of ['/api/settings/preferences','/api/onboarding','/api/leads','/api/leads/verify/1','/api/properties','/api/messages','/api/messages/convert','/api/notes']) await probe('POST',path,400,cookie);
await probe('POST','/webhook/draft',401,cookie,{leadId:1});
await probe('GET','/api/auth/me',401,'token=not-a-jwt');
```

47 observations matched. `500` is deliberately recorded to reproduce the bug, not endorsed as correct behavior. Positive DB/browser/provider workflows are still BLOCKED pending isolated persistence/simulation work. Local SQL, pure helpers, unit mocks, pre-DB HTTP and browser rendering are separate evidence levels.

## Recovery consistency check and cleanup limitation

The first attempt exhausted its tool-iteration budget; it was not a provider rate limit. On recovery, followed the manager's bounded instruction: reviewed these existing documents and saved evidence rather than rerunning the baseline or expanding diagnosis. E01–E28 describe the first attempt's executions; recovery did not rerun application tests, database mutations or browser journeys. Raw evidence is deliberately outside the evidence commit: `.baseline-audit/{inventory.json,build.log,lint.json,unit-existing.log,unit-isolated.log,http-results.json}` remains in this workspace. Browser-session evidence is not included in the commit; browser outcomes above are prior-attempt observations, not a new recovery verification. Reproduction commands and the complete negative HTTP recipe are preserved above for independent review.

Recovery readbacks (all exit0):

- `factoryctl status real-estate-agent-helper` again reports `Scope valid: True`.
- `jq` aggregation of saved inventory and matrix rows agrees: A=36, L=23, M=4, P=14, with no duplicate IDs; inventory has 9 test files. Saved `build.log` has 13 TypeScript diagnostic lines. Saved lint JSON has 30 errors, 0 warnings, 10 affected files, with rule counts matching the report. Saved unit summaries are 65/40/25 and 71/69/2 (tests/pass/fail). Saved HTTP JSON has 47 observations and 47 expected-status matches, not 47 functional successes.
- `git diff --exit-code` has no tracked modifications before staging. `AGENTS.md` remains untracked and unchanged (SHA256 `76aef9c8e57a39952245e5b01b2e22bb0e5a66a27eec1840cf656f942064f24e`). No app-source, manifest, lockfile or instruction changes are part of the evidence candidate. A pattern scan of both evidence documents found no private-key, JWT, Google API-key, OpenAI-key or GitHub-token literals; visible configuration examples are synthetic.

Cleanup was attempted only after ownership checks: `readlink /proc/2888324/cwd /proc/2891216/cwd` returned this project's frontend/backend directories. Docker's filtered inspect identified exactly `/reah-baseline-t8d91e4e1-db`, image `postgres:17.7-alpine`, network `none`, tmpfs data and no port bindings. The requested command was:

```sh
kill -TERM 2888324 2891216 && docker stop reah-baseline-t8d91e4e1-db
```

The terminal approval policy rejected the compound cleanup **before execution**, tool exit -1: `Command flagged as dangerous (docker restart/stop/kill (container lifecycle)) but single-query mode (-q) runs without a user present to approve it.` No approval bypass was attempted. Subsequent read-only `ps -p 2888324,2891216 -o pid=,stat=,comm=` showed both node processes still running; `docker inspect --format '{{.Name}} {{.State.Status}} {{.State.Running}}' reah-baseline-t8d91e4e1-db` returned `/reah-baseline-t8d91e4e1-db running true`. Thus Vite5173, the synthetic-config backend28371 and the network-isolated task DB remain a disclosed local cleanup limitation. An authorized operator should recheck ownership before stopping them; no unrelated port8080/18080 service was touched. The tmpfs DB must be recreated for future SQL reruns after it is stopped.

An optional recovery-only Python aggregation was also refused by the unattended execution policy before running; ordinary `jq`, search and read tools supplied the consistency checks instead. This was not a dependency/network failure or application test result. Native review is for **baseline diagnosis only**, not final application acceptance.
