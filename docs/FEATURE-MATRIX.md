# Feature and route matrix — baseline only

Audit: 2026-10-29, task `t_8d91e4e1`; source commit `fed781eb9fae109b065cf2a9a4d27d09d60d306d`, branch `fix/functional-repair`. See BASELINE.md for commands, safety, access limits and repair groups R1–R5. This inventory is complete for the existing explicit source definitions, **not a claim that the application works**.

## Evidence vocabulary

- **PASS-local**: only the named safe render/rejection behavior actually observed; no full-feature pass implied.
- **FAIL**: observed build/runtime/contract failure; **STATIC defect**: inspected contradiction awaiting DB/browser regression.
- **SIMULATED-unit**: checked-in mocks or audit-only boundary doubles; never genuine DB/provider integration.
- **BLOCKED**: full workflow lacks an isolated DB/transport/provider simulation or allowed live access.
- **N/A-unmounted/disabled**: source definition exists but server/App does not expose it; not a missing test pass.

E25 = actual unmodified server on port28371 with synthetic config, pre-DB negative/validation HTTP sweep, 47 observations. All POST/PATCH cases use JSON `{}` unless stated. Cookie-free API401 tests exercise missing-auth only. Valid synthetic JWT validation cases do not prove real user existence, tenant ownership, persistence or successful delivery. E25 code is included in BASELINE.md; do **not** substitute real provider credentials/production DATABASE_URL. Browser = real local Chromium + Vite, API port8080/HTTPS blocked, no fabricated authenticated session.

## Frontend: every page file and navigational branch

All source paths below are relative to `frontend/src/pages/`. Page file count: 14; active page components: 13; disabled file: 1. Browser sweep: 17 distinct requested URL cases, with actual final route/heading read back. Dashboard/data pages were tested only as unauthenticated route guards; their authenticated controls are BLOCKED, not passed.

| ID | File / URL(s) | Existing behavior/features | Actual baseline evidence / status | Next safe acceptance |
|---|---|---|---|---|
| P01 | `HomePage.tsx`; `/` unauthenticated, `/home` onboarded | Marketing cards, Get Started, Learn More, legal navigation | PASS-local `/` renders Welcome to Your AI-Powered Platform. Unauth `/home` redirects `/`. FAIL Learn More goes to nonexistent `/signup`, observed final `/` | Fix existing link; no new signup page needed (signup mode exists in LoginPage) |
| P02 | `LoginPage.tsx`; `/login` | Manual login/signup, Google redirect, name/password confirmation, legal links | PASS-local Welcome back and signup toggle -> Create an account with4 required inputs. Google/manual success BLOCKED; no real submit. Legal anchors observed `#`; manual confirmation navigation contradicts App | Synthetic signup/login/logout; invalid inputs, missing network, wrong password; OAuth via local boundary |
| P03 | `GoogleCallbackPage.tsx`; `/google/callback` | Temp-token exchange, refresh auth, onboarding/dashboard routing | PASS-local missing token -> `/login`, expected console.error `No tempToken found in URL`; token exchange success BLOCKED | Deterministic valid/expired/temp replay/cookie tests; never real Google here |
| P04 | `ChangePasswordPage.tsx`; `/change-password` | Invalid link, password/confirmation form, success return login | PASS-local missing params shows Invalid Reset Link; synthetic token + changePassword=true renders Set New Password; short password shows minimum8 validation without sending | Reset/change email boundary captured; invalid/expired/reuse/purpose tests |
| P05 | `ConfirmEmailPage.tsx`; intended `/confirm-email` | Entire file commented; old code/resend calls `/api/auth/signup/code` | N/A-disabled; `/confirm-email` actually redirects `/`. No App route/import or backend code handler. Manual auth flow STATIC defect | Explicitly reconcile existing intended confirmation flow, not assert it works |
| P06 | `OnboardingPage.tsx`; `/onboard` | Gmail status/connect/skip; brokerage/market/volume, lead sources/other, contact preference, team/challenge, final bundle | PASS-local unauth guard -> `/`; authenticated six-step workflow BLOCKED. Phone choice explicitly disabled/Coming soon | Synthetic user + GET/POST validation, complete bundle/reload; no live connect |
| P07 | `DashboardPage.tsx`; `/dashboard` | KPI cards, time-window selector, activity feed, status bars, unverified banner, quick links | PASS-local unauth guard -> `/`; authenticated data/filters BLOCKED. STATIC missing/colliding contracts/cache issues R3 | Fixture-backed API+DB+browser counts/window/attention/tenant cases |
| P08 | `LeadsPage.tsx`; `/leads` | Search/rank/sort/filter, refer/edit/delete, verify/delete unverified, ready indicator, detail link | PASS-local unauth guard -> `/`; authenticated CRUD BLOCKED. Uses truncated dashboard cache; `?filter=unverified` ignored; modal optimistic records lose fields | Synthetic verified/unverified/archive/soft-delete/reload/ownership; initial outreach captured |
| P09 | `LeadDetailPage.tsx`; `/leads/:id` (browser `/leads/1`) | Contact/details/score, conversation, SMS/email send, subject validation, notes tab/add | PASS-local unauth guard -> `/`; full feature BLOCKED. FAIL build incompatible messages type; notes URL404 from E25. STATIC SMS default for email-only lead | Real synthetic note/message persistence and reload; foreign lead404 |
| P10 | `PropertiesPage.tsx`; `/properties` | Grid/table, search/filter/sort, create/edit/delete modals, numeric/listing details | PASS-local unauth guard -> `/`; full feature BLOCKED. STATIC source enum mismatch corroborated by SQL; type/lint failures R1 | Create/edit/clear numeric values/archive/delete/reload; tenant and enum validation |
| P11 | `MessagesPage.tsx`; `/messages` | Grouped conversations, search/highlight, channel badges, select/read/reply | PASS-local unauth guard -> `/`; full feature BLOCKED. STATIC send action only delays500ms/clears input, no API call | Wire existing /api/messages with captured send; ensure persisted thread and visible errors |
| P12 | `SettingsPage.tsx`; `/settings` | Profile, integration card, notification preferences, signout/reset | PASS-local unauth guard -> `/`; full feature BLOCKED. STATIC Google connection toggle local-only, weekly key typo, success-after-save-error | Persistent preferences/readback, true integration state, logout/cache purge; no live reset mail |
| P13 | `TermsOfServicePage.tsx`; `/terms` | Static content, back-home link | PASS-local Terms of Service renders; content is placeholder, not legally reviewed | Link/navigation smoke only; no legal acceptance implied |
| P14 | `PrivacyPolicyPage.tsx`; `/privacy` | Static content, back-home link | PASS-local Privacy Policy renders; includes placeholder site text, not legally reviewed | Link/navigation smoke only |

`frontend/src/App.tsx` additionally accounts for `/` AppLayout index -> `/dashboard` for onboarded users, authenticated `/login` -> `/dashboard`, all non-onboarded unknown paths -> `/onboard`, unauth wildcard -> `/`, onboarded wildcard -> `/dashboard`. `/google/callback` and `/change-password` bypass normal auth routing. Unauth `/signup` and `/home` both observed redirect `/`; /signup is a link target, not an existing page. There is no task-management page: tasks are schema/helper-created artifacts, not an invented missing frontend route. `main.tsx` mounts AuthProvider and DashboardCacheProvider globally; route guards do not make the cache tenant-safe.

## Mounted backend routes: all 36 explicit method/path pairs

Paths use the exact misspelling `/schaduler` from server.js. For GET root routes, trailing slash is optional under default Express routing. All `/api/*` handlers are under `backend/src/routes/` files shown; the remaining files are under `backend/src/`.

| ID | Method + full URL path | Handler file | Auth / input / side effects | E25 actual observation; full feature status |
|---|---|---|---|---|
| A01 | POST `/api/auth/signup` | `backend/src/routes/auth.js` | Public name/email/password; inserts user, signs cookie | empty400 PASS-local; successful signup/persistence BLOCKED |
| A02 | POST `/api/auth/login` | `backend/src/routes/auth.js` | Public email/password; DB+bcrypt, cookie | empty400 PASS-local; wrong/right password DB cases BLOCKED |
| A03 | POST `/api/auth/logout` | `backend/src/routes/auth.js` | Session cookie; clears cookie | absent cookie401 PASS-local; real logout/session invalidation BLOCKED |
| A04 | GET `/api/auth/me` | `backend/src/routes/auth.js` | Session cookie; reads user, removes hash | absent/invalid cookie401 PASS-local; user read BLOCKED |
| A05 | POST `/api/auth/change-password` | `backend/src/routes/auth.js` | Public email; DB token + Twilio email send | empty400 PASS-local; email delivery excluded, capture seam required |
| A06 | POST `/api/auth/change-password/confirm` | `backend/src/routes/auth.js` | Public reset token/newPassword; DB hash update, notification email | empty400 PASS-local; successful/expired/reused cases BLOCKED |
| A07 | POST `/api/settings/preferences` | `backend/src/routes/settings.js` | Session; newLeadNotify/newMessageReplyNotify/weeklySummeryNotify; DB update | no cookie401; synthetic cookie empty400 PASS-local; persistence BLOCKED |
| A08 | GET `/api/onboarding` | `backend/src/routes/onboarding.js` | Session; reads Google OAuth row -> gmailConnected | no cookie401 PASS-local; connected state DB BLOCKED |
| A09 | POST `/api/onboarding` | `backend/src/routes/onboarding.js` | Session; completed bundle; upsert onboarding + user flag | no cookie401, synthetic empty400 PASS-local; writes BLOCKED |
| A10 | GET `/api/dashboard` | `backend/src/routes/dashboard.js` | Session; optional since; DB leads/properties/conversations/messages/derived activity | no cookie401 PASS-local; metrics/tenant/collision fixtures BLOCKED |
| A11 | GET `/api/leads` | `backend/src/routes/leads.js` | Session; list by user, updatedAt desc | no cookie401 PASS-local; list DB BLOCKED |
| A12 | GET `/api/leads/:id` | `backend/src/routes/leads.js` | Session + ownership; detail/notes/conversations/messages | /1 no cookie401 PASS-local; foreign/missing DB404 BLOCKED |
| A13 | POST `/api/leads` | `backend/src/routes/leads.js` | Session; refer lead/contact/property/initial note; writes | no cookie401, synthetic empty400 PASS-local; CRUD DB BLOCKED |
| A14 | POST `/api/leads/verify/:id` | `backend/src/routes/leads.js` | Session/ownership/unverified; verify boolean; activate or hard delete children/lead | /verify/1 no cookie401; synthetic empty400 PASS-local; activation/deletion BLOCKED |
| A15 | POST `/api/leads/:id/send-initial` | `backend/src/routes/leads.js` | Session/ownership; mode AI/custom/none; DB, AI, SMS/Gmail or phone task | /1/send-initial no cookie401 PASS-local; sends intentionally excluded, channel/failure STATIC defects |
| A16 | PATCH `/api/leads/:id` | `backend/src/routes/leads.js` | Session/ownership; contact/source/status/property/AI edits; soft deletion date | /1 no cookie401 PASS-local; updates/validation DB BLOCKED |
| A17 | GET `/api/properties` | `backend/src/routes/properties.js` | Session; excludes pending_deletion, archive order | no cookie401 PASS-local; DB listing BLOCKED |
| A18 | POST `/api/properties` | `backend/src/routes/properties.js` | Session; address/description/status/numerics/source; inserts | no cookie401; synthetic empty400 PASS-local; DB writes BLOCKED |
| A19 | PATCH `/api/properties/:id` | `backend/src/routes/properties.js` | Session/ownership; updates/soft delete | /1 no cookie401 PASS-local; enum/update DB cases BLOCKED, STATIC contract defect |
| A20 | GET `/api/messages` | `backend/src/routes/messages.js` | Session; joins owned leads, namespaces SMS/email IDs, merges latest200 | no cookie401 PASS-local; real lists/threading BLOCKED |
| A21 | POST `/api/messages` | `backend/src/routes/messages.js` | Session/ownership; leadId/content/channel + email subject; provider send + saves | no cookie401; synthetic empty400 PASS-local; provider success/failure BLOCKED; delivery excluded |
| A22 | POST `/api/messages/convert` | `backend/src/routes/messages.js` | Session/ownership; conversationId; status converted, lead AI=false | no cookie401; synthetic empty400 PASS-local; takeover persistence BLOCKED |
| A23 | POST `/api/notes` | `backend/src/routes/notes.js` | Session/ownership; leadId/content; inserts note | no cookie401; synthetic empty400 PASS-local; actual note write BLOCKED |
| A24 | GET `/auth/google/signup` | `backend/src/google-auth.js` | Public; creates consent URL/redirect, no provider request by server here |302 PASS-local, redirect not followed; Google/signup/watch BLOCKED/excluded |
| A25 | GET `/auth/google/login` | `backend/src/google-auth.js` | Cookie shortcut or redirect to consent | no cookie302 PASS-local, not followed; OAuth positive BLOCKED |
| A26 | POST `/auth/google/exchange` | `backend/src/google-auth.js` | TempToken -> session cookie | empty401 PASS-local; valid synthetic exchange not exercised; token-purpose defect E26 |
| A27 | GET `/auth/google` | `backend/src/google-auth.js` | Google code callback; tokens/userinfo/DB/watch/temp redirect | no code400 PASS-local; code exchange/live watch excluded |
| A28 | GET `/auth/google/status` | `backend/src/google-auth.js` | Optional session cookie, authenticated boolean | no cookie200 PASS-local; false auth status, not successful authentication |
| A29 | GET `/auth/google/logout` | `backend/src/google-auth.js` | Clears cookie |200 PASS-local; no user state/DB tested |
| A30 | POST `/webhook/gmail` | `backend/src/pubsub-email-webhook.js` | Google OIDC/service-account check; base64 message.data -> email/history -> DB/AI/outreach | no bearer401 PASS-local; valid auth/payload/persistence BLOCKED, live excluded |
| A31 | POST `/webhook/sms` | `backend/src/sms-webhook.js` | Twilio signature + form From/Body/MessageSid; DB+AI+Telnyx reply | unsigned JSON500 FAIL with missing BASE_URL (Invalid URL); no valid provider operation |
| A32 | POST `/webhook/draft` | `backend/src/email-webhook.js` | leadId/inboundSubject/inboundBody; req.userId expected but no middleware; undefined writeReplyEmail | empty400; synthetic valid session cookie + leadId1 ->401 FAIL-functional; no AI called |
| A33 | GET `/webhook/outlook` | `backend/src/outlook-email-webhook.js` | Graph validationToken echo | no query400; validationToken=synthetic200 PASS-local; no Graph registration |
| A34 | POST `/webhook/outlook` | `backend/src/outlook-email-webhook.js` | clientState notification; acknowledges202 then Graph/DB/shared pipeline | empty{}202 PASS-local only; no notifications processed; positive Graph excluded |
| A35 | GET `/schaduler/gmail-watch-reset/daily` | `backend/src/shaduled-gmail-watch.js` | Scheduler auth code commented out; DB and Gmail watch mutations | NOT REQUESTED: unsafe without auth. STATIC high-priority defect; BLOCKED until auth regression + fakes |
| A36 | GET `/schaduler/unreply/daily` | `backend/src/scheduled-unreply-handler.js` | Google Scheduler OIDC/service account; DB eligible followups + AI/Gmail | no header401 PASS-local; positive scheduler sends excluded; manual-AI gate STATIC defect |

Additional E25 contract probe: POST `/api/leads/1/notes` ->404 even without auth, because no route exists. This is the URL used by api.postNote, not a missing inventory row. No /api/auth/signup/code route exists either. E25 has37 initial cases +8 synthetic-cookie validation cases +1 draft-cookie case +1 invalid-cookie case =47 observations; one A35 is intentionally skipped, A33 has two cases, and extra missing-contract/error cases are explicit. A matching expected500/404 reproduces a failure, not product success.

## Unmounted legacy router: all 23 definitions

`backend/src/frontend-communicator.js` exports frontendComRouter but `backend/src/server.js` does not import or mount it. Local paths below are **not actual endpoints**; `/api` was the legacy intended prefix, not a live mount. Every row is N/A-unmounted and was not executed. Active split-router equivalents A01–A23 are the source of truth; do not fix this unused copy expecting to change running behavior.

| ID | Method | Local path | Existing feature |
|---|---|---|---|
| L01 | POST | `/auth/signup` | manual signup |
| L02 | POST | `/auth/login` | manual login |
| L03 | POST | `/auth/logout` | logout |
| L04 | GET | `/auth/me` | session user |
| L05 | POST | `/auth/change-password` | reset request |
| L06 | POST | `/auth/change-password/confirm` | reset confirm |
| L07 | POST | `/settings/preferences` | notification preferences |
| L08 | GET | `/onboarding` | connection state |
| L09 | POST | `/onboarding` | onboarding bundle |
| L10 | GET | `/dashboard` | aggregate dashboard |
| L11 | GET | `/leads` | list |
| L12 | GET | `/leads/:id` | detail |
| L13 | POST | `/leads` | refer |
| L14 | POST | `/leads/verify/:id` | verify/delete |
| L15 | POST | `/leads/:id/send-initial` | initial outreach |
| L16 | PATCH | `/leads/:id` | update/soft delete |
| L17 | GET | `/properties` | list |
| L18 | POST | `/properties` | create |
| L19 | PATCH | `/properties/:id` | edit/soft delete |
| L20 | GET | `/messages` | recent messages |
| L21 | POST | `/notes` | add note |
| L22 | POST | `/messages` | send; stale undefined conv/message/email identifiers in unused handler |
| L23 | POST | `/messages/convert` | takeover |

## Unmounted Microsoft auth: all 4 definitions

`backend/src/microsoft-auth.js` is eagerly imported, but server.js comments out `app.use('/auth/microsoft', microsoftAuthRouter)`. Local definitions are N/A-unmounted (not live endpoints):

| ID | Method | Local path | Intended behavior / unverified dependencies |
|---|---|---|---|
| M01 | GET | `/login` | consent redirect using MSAL; cookie shortcut |
| M02 | GET | `/auth` | callback code exchange, Graph userinfo, DB OAuth/user insert, cookie |
| M03 | GET | `/status` | cookie authenticated boolean |
| M04 | GET | `/logout` | clears session cookie |

Do not enable new Outlook auth/CRM features during repair. Existing mounted Outlook webhook remains accounted for at A33/A34, but live Graph access is excluded. Import-time dependency on missing Microsoft config still affects startup despite this unmounted router.

## Every existing backend test file, safety and actual outcome

Paths under `backend/test/`; Node22 means `npm exec --yes --package=node@22.22.0 -- node`. Explicit flags: `--experimental-test-module-mocks` for mock.module. Never discover every test indiscriminately.

| File | Boundary / safety | Executed outcome |
|---|---|---|
| `ai-helpers.test.js` | checked-in OpenAI mock; no real AI | E13 Node18 fails mock.module; E15 Node22 executes,13 stale buildPrompt failures; its opt-out/reply-shape cases execute against fake completions |
| `email-webhook-helpers.test.js` | checked-in DB/schema/Drizzle/AI/phone/message-helper mocks | E13 fails Node18; E15 Node22 executes,12 stale missing-function failures; remaining parser/dedup cases unit-only |
| `lead-scoring.test.js` | ostensibly pure scores, import pulls eager OpenAI clients | E12 fails missing credentials; E27 safe audit preloader enables real deterministic scoring assertions; not AI integration |
| `webhook.test.js` | imports real pipeline; can hit AI fallback without isolation | Run only with E27 extra preloader;2 phone-format assertions fail, other parsing/matching assertions execute; not HTTP push or persistence |
| `outlook-email-webhook.test.js` | intended mocks, but static import before setup; includes copied normalization implementation, not production function | E16 fails missing DB string before route tests. No claimed handshake test pass from this suite; E25 separately exercises real empty/validation HTTP paths |
| `db_connection.test.js` | writes actual configured DB, creates/deletes fixtures; invalid property source unknown | NOT RUN as shipped: no safe application DB transport; real isolated SQL schema/migration checks separately in BASELINE.md |
| `gmail.test.js` | reads stored real account/OAuth, sends/replies/polls live Gmail and mutates DB | NOT RUN: forbidden live provider/user data/delivery |
| `outlook.test.js` | reads stored account/OAuth and live Graph messages | NOT RUN: excluded live provider access |
| `phone.test.js` | explicitly sends real Telnyx message | NOT RUN: forbidden delivery |

`mock-db.js` is a helper, not a test file. Its queries return empty arrays and writes have no persistence; passing cases using it cannot verify constraints, real data flow, tenant ownership or UI visibility. E15 combined:65 tests/40 pass/25 fail; E27 combined:71 tests/69 pass/2 fail. Keep these separate, because the isolation differs. No full available-suite green claim.

## Existing integration/background/data features beyond pages

| Area / exact source | Existing behavior | Baseline classification / safe next seam |
|---|---|---|
| `backend/db/index.js`, `schema.js`, `drizzle.config.js` | PostgreSQL schema through Neon HTTP/Drizzle | Genuine isolated schema export+Postgres execution;13 tables. Plain Postgres is not a Neon HTTP endpoint; app-driver CRUD BLOCKED |
| `backend/src/gmail.js` | OAuth client, list/get message, raw send, threaded reply, expired-token classification | STATIC inspected; live calls NOT RUN. Stub OAuth/fetch and capture envelope/IDs without delivery |
| `backend/src/google-auth.js` | Google consent/session/temp exchange + Gmail watch | Redirect/missing-input/status paths E25; all valid OAuth/watch BLOCKED/live excluded |
| `backend/src/pubsub-email-webhook.js` | OIDC push -> Gmail history/messages -> parser/replies/dedup -> inserts/initial outreach | Only missing-bearer rejection executed. Need synthetic Google-shaped push + real local persistence; cursor/order/pagination/error defects R5 |
| `backend/src/pubsub-webhook-helpers.js`, `lead-detection/{source-detector,platform-parsers,referral-detector,confidence-scorer}.js` | deterministic source/platform/referral/confidence, optional AI fallback, property match/dedup/outreach | SIMULATED-unit E15/E27 helper execution. Not an actual push pipeline; source enum and duplicate-state contradictions R5 |
| `backend/src/lead-detection/correction-logger.js` | exportable correction logger/snapshot helper; schema audit table | STATIC; no callsite in active route/pipeline was found in source search; no training or working feedback-loop claim |
| `backend/src/email-helpers.js` | conversation lookup/create/history, save, Gmail send+save, inbound reply/AI side effects | STATIC; threading/tenant/idempotency/state contract issues R2/R5; needs real synthetic DB + captured sends |
| `backend/src/email-webhook.js` | draft route and separate exported inbound-email handler | A32 broken auth/undefined symbol; separate inbound helper not called by mounted Gmail path (Gmail uses checkForLeadAndReply) |
| `backend/src/sms-webhook.js`, `sms-helpers.js`, `phone.js` | Twilio-verified inbound, Telnyx outbound, opt-out/AI/manual gates, persistence, Twilio email | Missing-config unsigned failure observed; valid SMS/email/call delivery NOT RUN; capture/throw boundaries needed. No implemented automated calling function |
| `backend/src/ai-helpers.js`, `ai/{sms-reply,email-reply,lead-scorer,prompt-helpers}.js`, `lead-scoring.js` | prompts, structured AI replies, opt-out, notes/tasks/ready state, scoring | Pure/mock cases only. Live OpenAI not called; displayed score0 in UI is not proof of integrated scoring |
| `backend/src/load-lead-helpers.js`, `backend/db/schema.js` | note/task/property helpers; lead_tasks storage, AI/manual-call tasks | No task route/page exists; AI-generated task persistence/visibility BLOCKED. Do not invent task CRUD feature |
| `backend/src/shaduled-gmail-watch.js` | daily watch renewal | STATIC missing auth; intentionally no call. Must restore guard before simulated scheduler execution |
| `backend/src/scheduled-unreply-handler.js` | scheduled email follow-up, counters/cold transition, note/task writes | E25 missing-auth401 only; all sends excluded; manual takeover/reply/counter gates need synthetic DB/fakes |
| `backend/src/outlook.js`, `outlook-email-webhook.js`, `microsoft-auth.js` | MSAL/Graph helpers, mounted notification webhook, unmounted auth | Existing paths inventoried; no new Outlook work or live Graph verification |
| `frontend/src/services/api.ts`, `context/{AuthContext,DashboardCacheContext}.tsx`, `hooks/useApi.ts` | credentialed fetch, auth refresh, polling/localStorage/optimistic cache | Real unauth rendering and pre-DB errors only; note URL/cache/tenant/contracts defects documented; API hardcodes8080 |
| `backend/src/routes/settings.js`, `frontend/src/pages/SettingsPage.tsx` | notification preference storage | pre-DB rejection only; no notification worker/delivery implementation verified; no weekly-summary delivery pass |

## Inventory verification / executable interpretation

The local audit scanner enumerated top-level backend/src/*.js and routes/*.js, stripping block/full-line comments, matching explicit router HTTP method/string paths. It read directory entries for pages/*.tsx and test/*.test.js, deduplicated App path names, and wrote JSON before computing totals. Results:63 definitions =36 mounted +23 legacy +4 Microsoft;14 page files;9 test files. Mounted routing was checked against server.js, not inferred from filenames. Matrix IDs A01–A36, L01–L23, M01–M04 and P01–P14 make independent count reconciliation possible.

The matrix is executable at the safe level via E25's complete loop in BASELINE.md and the real browser journeys recorded above. Rerun full build/lint and explicitly selected helper tests using their exact commands. For blocked full-feature cases, first supply the isolated DB/Google-shaped simulation described in BASELINE.md; do not run the positive paths against the synthetic non-listening Neon URL or substitute production configuration. Requirements for later candidate acceptance remain stricter than this baseline: positive/negative/ownership DB flows, real authenticated browser journeys, no-delivery ingestion simulation, duplicate/malformed/error coverage and independent exact-commit review.
