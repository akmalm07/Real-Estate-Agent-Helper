# Verification evidence

## Frontend production-build gate — t_e689658e (2026-10-29)

**Scope:** build-gate candidate only, based on independently approved baseline
`5d59c25980c42ad19e943f63bb47348aa4c6bd1e`. This is not final application acceptance.
The exact candidate commit is recorded in this card's native review handoff.
Baseline diagnosis/evidence in `BASELINE.md` and `FEATURE-MATRIX.md` is preserved.

Reviewed candidate manifest (only these paths belong to this commit):

- `frontend/src/components/layout/TopNav.tsx`
- `frontend/src/components/leads/types.ts`
- `frontend/src/context/DashboardCacheContext.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/LeadDetailPage.tsx`
- `frontend/src/pages/PrivacyPolicyPage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/TermsOfServicePage.tsx`
- `frontend/src/leads-card-regression.type-test.ts`
- `docs/VERIFICATION.md`

Changes add the already-used optional string `ReferLeadErrors.sourceId`, remove
only build-diagnosed unused imports/setter, and override detail messages through
`Omit<Lead, 'messages'>`. The detail message type follows the existing route/schema:
numeric row/conversation IDs, no invented `leadId`, nullable body/timestamp, optional
nullable subject. Null timestamps are not passed to the formatter; present-value
rendering is unchanged. Shared API contracts, request behavior, backend and Google
implementation are unchanged. Existing saving lifecycle behavior is not repaired.

### Executed commands and results

Commands below run from `frontend/` unless marked root. Cached Node v22.22.0
was verified with `npm exec --offline --package=node@22.22.0 -- node --version`.
No dependency install, upgrade, manifest/lock edit, or gate/config weakening occurred.

| Check | Exact command | Result |
|---|---|---|
| Baseline reproduction | `npm exec --offline --package=node@22.22.0 -- npm run build` | exit 2; all 13 baseline TypeScript diagnostics reproduced; Vite not reached |
| Test-first type regression (worker) | `npm exec --offline --package=node@22.22.0 -- npm exec -- tsc -b` | exit 2; focused missing-sourceId assertion failed alongside baseline errors, before production edits |
| Full build (worker and separate supervisor rerun) | `npm exec --offline --package=node@22.22.0 -- npm run build` | both exit 0; actual `tsc -b && vite build`, 1669 modules; supervisor Vite build 4.43s |
| Forced non-cached type rebuild (supervisor) | `npm exec --offline --package=node@22.22.0 -- npm exec -- tsc -b --force` | exit 0; includes focused type assertions under existing src inclusion |
| Lint (worker and supervisor) | `npm exec --offline --package=node@22.22.0 -- npm run lint` | both exit 1; 25 errors, 0 warnings, 8 affected files |
| Machine-readable lint | `npm exec --offline --package=node@22.22.0 -- npm run --silent lint -- --format json` | exit 1; counts parsed with jq |
| Generated bundle syntax (root) | `npm exec --offline --package=node@22.22.0 -- node --check frontend/dist/assets/index-CTYEV4tZ.js` | exit 0 |
| Static bundle smoke (root) | `npm exec --offline --package=node@22.22.0 -- node .build-gate-audit/inspect-bundle.mjs` | exit 0; index and both referenced assets fetched locally, HTTP200 and byte equality; ephemeral server closed |
| Whitespace (root) | `git diff --check` | exit 0 |

The compile-only regression checks cover sourceId string acceptance, bidirectional
raw-message contract assignability, and rejection of raw rows as shared `Message`.
They add no runtime test infrastructure or production bundle imports. Existing
compiler settings (including non-strict null checking) are unchanged; these are
not runtime validation or exhaustive schema tests. Nullable declarations and the
formatter guard were inspected against `backend/db/schema.js` and the mounted
`GET /api/leads/:id` handler, read-only.

Remaining lint: 17 `@typescript-eslint/no-explicit-any`, 6
`react-hooks/set-state-in-effect`, 2 `react-refresh/only-export-components`.
Affected files/counts: VerifyLeadModal.tsx (1), AuthContext.tsx (2),
DashboardCacheContext.tsx (2), hooks/useApi.ts (1), ChangePasswordPage.tsx (1),
LeadsPage.tsx (1), PropertiesPage.tsx (16), SettingsPage.tsx (1).
Baseline was 30 errors; the five diagnosed unused bindings are removed. Existing
lint rule/file counts otherwise match baseline (line numbers shift after import
removal). Lint repair belongs to serial card `t_143a45f6`, not this candidate.

### Generated artifact inspection

- `dist/index.html`: 473 bytes; root mount and both hashed asset references inspected.
- `dist/assets/index-CTYEV4tZ.js`: 442143 bytes; SHA256 `c53ce8e6c6be9502ef9cdf4fd42d8baf492d8a9b1d7b28cdd0af54087f702169`.
- `dist/assets/index-juSvNVC2.css`: 31642 bytes; SHA256 `323b654cee934467314a0da950d9095527d79aaaf754d000185c2694fb2e2108`.

The local smoke script reads index asset references, checks nonempty JS/CSS,
serves only those in-memory files on an OS-assigned free loopback port, fetches
them and compares bytes, then closes its server. It does not execute the React
app, authenticate, call APIs/providers, or establish browser/database acceptance.
Vite emitted a plugin-timing advisory, not a build failure. Generated dist and
raw local logs in `.build-gate-audit/` are not committed.

### Controls and handoff

`factoryctl status real-estate-agent-helper` initially returned Scope valid: True.
During final verification it briefly returned False while the manager amended
REQUIREMENTS.md/decisions.json for a separately serialized visual-design expansion.
Work paused for read-only diagnosis; the operator then confirmed manager ownership
and lock revalidation. Those dirty authority changes are intentional and excluded
from this commit. The build card's source scope and acceptance remain unchanged.
The reviewer must distinguish this manager-owned dirty diff from candidate code.
AGENTS.md and `.baseline-audit/` remain preserved/untracked. No previously blocked
cleanup was retried; no existing services were touched. No push/PR/deployment.

Final scope recheck returned **Scope valid: True**. Explicit staging used the
10-path manifest above; manager-owned authority files and local audit folders were
not staged. `npm exec --offline --package=node@22.22.0 -- node
.build-gate-audit/scan-staged.mjs` (root) exited 0: exact staged-manifest equality,
SHA256 records, and no private-key/JWT/provider-key/assigned-secret/email-data or
unsafe-code pattern findings across staged file contents. `git diff --cached
--check` exited 0. These bounded pattern checks complement manual diff review;
they are not an exhaustive security audit.

One OpenCode implementation run, exit 0; no repair reruns. Requested and observed
model: `openai/gpt-6-luna`, variant default, standard/non-fast alias, stored OpenAI
account (billing surface/quota/invoice unavailable). Estimated worker budget was
15k input/5k output. Exported aggregate counters: input 49973, output 2695,
reasoning 459, cached-read 550016; step-finish sums differ: input 48191, output
2298, reasoning 459, cached-read 501504. Counters are preserved separately, not
combined into a fabricated billing total. Client cost 0 is not proof of free usage.

Independent native review must inspect the exact candidate commit, rerun the full
Node22 `npm run build` (not Vite-only), inspect regression assertions and nullable
message handling, confirm staged scope/no backend/config changes, and acknowledge
remaining lint before releasing the serial lint card. Final app acceptance remains
outstanding.

## Frontend lint repair — t_143a45f6 (2026-10-29)

**Scope:** working-tree repair on `fix/functional-repair`, approved base
`bf22b680d6cac21bdfe04fdcc5ffb0e07394c378`. No staging or commits. Parent evidence
above is preserved; this section supersedes only its remaining-lint status.
Supervisor baseline `.lint-gate-audit/supervisor-baseline-lint.log` records 25
errors (17 explicit-any, 6 set-state-in-effect, 2 mixed-export errors).

### Implementation and exact worker manifest

- `frontend/src/components/leads/VerifyLeadModal.tsx`: lead-identity-keyed form;
  request-context-keyed detail state, initialized pending, with cleanup ignoring
  old detail results. Same-identity drafts survive rerenders/detail refreshes;
  changed identities reset drafts and validation. Returning to an earlier detail
  context starts pending rather than reusing its old error.
- `frontend/src/hooks/useApi.ts`: request identity/revision and result state derive
  loading/error; URL transitions reset results, refetch retains same-URL data,
  and cleanup ignores obsolete results/errors. Conditional render-time state
  adjustment handles URL changes, including A→B→A; no effect reset setters.
- `frontend/src/context/AuthContext.tsx`, new
  `frontend/src/context/auth-context.ts`, `frontend/src/hooks/useAuth.ts`:
  split context/types/hook from the provider for Fast Refresh; initial session
  request commits only after its real response and ignores cleaned-up results.
  Initial checking and existing event-driven session validation remain.
- `frontend/src/context/DashboardCacheContext.tsx`, new
  `frontend/src/context/dashboard-cache-context.ts`, new
  `frontend/src/hooks/useDashboardCache.ts`: split context/hook from provider;
  snapshot storage once and initialize each loading flag from cache freshness.
  Manual reload resets loading/errors in its event path. Request callbacks handle
  actual fetch outcomes, with effect-lifetime cleanup for initial, background and
  manual requests. The cancellation ref owns the real AbortController lifetime;
  it is not a setter/rule bypass. Removed the old exhaustive-deps suppression and
  interval ref. Background cache replacement and ID comparisons are preserved.
- `frontend/src/pages/SettingsPage.tsx`: initialize preferences in a form keyed by
  user ID and preference context, including null user. Equivalent user objects
  preserve drafts; changed preferences/user reset them. Existing preference keys,
  save behavior and integration toggles are otherwise unchanged.
- `frontend/src/pages/ChangePasswordPage.tsx`: derive invalid-link display directly;
  form keyed by token/reset flag keeps drafts within the same URL context and
  isolates old submission state after a URL transition.
- `frontend/src/pages/PropertiesPage.tsx`, `frontend/src/pages/LeadsPage.tsx`:
  useful local structural optional-field types replace all 17 explicit-any uses.
  Existing address fallback order, status/source values and request bodies remain.
  These pages also import the split dashboard hook.
- `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/MessagesPage.tsx`:
  import-only adjustments for the split dashboard hook.
- `frontend/package.json`, `frontend/package-lock.json`: add only pinned dev tools
  `tsx@4.20.6` and matching `react-test-renderer@19.2.6`, plus `npm test`.
- New `frontend/test/tsconfig.json`, `frontend/test/lifecycle.test.mjs`: separate
  JSX test config extending the unchanged app config; deterministic real React
  component/hook lifecycle harness using Node's test runner.
- `docs/VERIFICATION.md`: this appended evidence. Raw worker logs are only under
  `.lint-gate-audit/worker-*`; no supervisor logs overwritten.

No shared `services/api.ts`, backend/contracts, TopNav/Home, instruction files,
ESLint, existing tsconfig, Vite or build gate configuration changed. No added
eslint-disable, explicit-any casts, exclusions, timer/microtask deferrals or
synthetic Promise wrappers hiding effect setters. Fetch endpoints, credentials,
payloads, mount refresh decisions, 1m/1d windows and 60-second interval preserved.

### Executed commands and exact exits

All npm/Node commands used cached Node 22 through the literal prefix below.
Working directory is `frontend/` except the bundle smoke and Git checks (root).
Each command redirected output to the stated `.lint-gate-audit/worker-*` log.

| Command | Exit / evidence |
|---|---|
| `npm exec --offline --package=node@22.22.0 -- npm install --save-dev --save-exact tsx@4.20.6 react-test-renderer@19.2.6 --ignore-scripts --no-audit --no-fund` | 1; `worker-install.log`: inherited offline install cache lacked the tsx tarball; not an application failure |
| `npm exec --offline --package=node@22.22.0 -- npm install --offline=false --save-dev --save-exact tsx@4.20.6 react-test-renderer@19.2.6 --ignore-scripts --no-audit --no-fund` | 0; `worker-install-online.log`: ordinary package-registry install; 7 added, 2 removed; no audit/lifecycle scripts or major upgrades |
| `npm exec --offline --package=node@22.22.0 -- npm test` | Initial `worker-tests-before.log`: 1, 0/11 pass; test-only JSX resolution error plus two hook failures. Corrected test config before treating component outcomes as evidence |
| same test command, before production lifecycle edits | 1; `worker-tests-red.log`: **5 pass, 6 fail / 11**. Failures demonstrate useApi old-URL data/stale response, modal identity draft leakage, settings unchanged-user draft loss, reset URL error leakage, and background storage write after cleanup |
| same test command, after first lifecycle slice | 0; `worker-tests-lifecycle.log`: 11/11 pass |
| same test command, expanded coverage | 0; `worker-tests-final.log`: 17/17 pass |
| same test command, added return-URL test before repair | 1; `worker-tests-return-url-red.log`: 17 pass, 1 fail / 18 |
| same test command, added return-detail-context test before repair | 1; `worker-tests-return-detail-red.log`: 17 pass, 2 fail / 19; also exposed first-render pending regression in request identity adjustment |
| same test command, detail repair | 1; `worker-tests-verified.log`: 18 pass, 1 fail / 19; first-render pending assertion still failed |
| same test command, request identity repair | 0; `worker-tests-acceptance.log`: 19/19 pass |
| same test command, added manual-reload cleanup test before repair | 1; `worker-tests-manual-cleanup-red.log`: 19 pass, 1 fail / 20 |
| same test command, **final source** | **0; `worker-tests-release.log`: 20 pass / 20, 0 fail/cancelled/skipped/todo** |
| `npm exec --offline --package=node@22.22.0 -- npm run lint` | Intermediate `worker-lint-first.log`, `worker-lint-final.log`: each 1, one remaining cache effect error. `worker-lint-green.log`, `worker-lint-verified.log`, `worker-lint-acceptance.log`, **`worker-lint-release.log`: each 0, final 0 errors/warnings** |
| `npm exec --offline --package=node@22.22.0 -- npm run build` | `worker-build-first.log`, `worker-build-final.log`, `worker-build-verified.log`, `worker-build-acceptance.log`, **`worker-build-release.log`: each 0**; full `tsc -b && vite build`, not Vite-only. Final: 1672 modules, Vite 8.0.14, 6.45s; non-failing plugin timing advisory |
| `npm exec --offline --package=node@22.22.0 -- node .build-gate-audit/inspect-bundle.mjs` (root) | 0 for `worker-bundle-smoke.log` and final `worker-bundle-release.log`; existing read-only script serves generated HTML/JS/CSS on an ephemeral loopback port, verifies HTTP200/byte equality, closes its server |
| `git diff --check` (root) | 0 |
| `git diff --cached --quiet` (root) | 0; index still empty; supervisor staging scan remains separate |

Final bundle smoke: `index.html` 473 bytes;
`assets/index-CZKxfHok.js` 445153 bytes, SHA256
`573af70abb224006b360f6aea9fc273c0ea1c2422e30e6616764270710df51ce`;
`assets/index-juSvNVC2.css` 31642 bytes, SHA256
`323b654cee934467314a0da950d9095527d79aaaf754d000185c2694fb2e2108`.
Generated dist is not source or staged work.

### Regression scope and limitations

The 20 executed tests mount actual React providers/components/hooks and run
effects, rerenders, cleanup and form event handlers. They cover:

- useApi initial pending/success, network/HTTP errors, manual refetch, immediate
  URL-context resets, returning URLs, stale/superseded responses and unmount.
- Verify modal initial pending/disabled action, detail errors, changed lead and
  detail context, stale results, unchanged-lead draft preservation and changed-ID
  draft reset, including returning to a previously errored context.
- Auth checking/authenticated/unauthenticated results, refresh, network failure,
  and StrictMode initial-effect cleanup with out-of-order session results.
- Settings preference initialization, equivalent-user draft preservation,
  changed preference/user reset and null-user context reset.
- Reset URL invalid↔valid transitions, unchanged-context draft preservation,
  changed-token draft reset, exact reset submission payload, and old submission
  success not replacing the new invalid-link view.
- Dashboard missing/fresh/stale/partial cache, first-render stale loading,
  blocking errors, manual reload loading/error reset and success, silent
  background errors, mount/60-second refresh, retained cache, and initial/manual/
  background cleanup preventing late storage writes and interval work.

Only fetch, localStorage and interval timers are replaced at external boundaries;
no mocked application hooks/services or source-regex-only lifecycle claims.
The renderer emits its upstream deprecation warning and Node emits MockTimers'
experimental warning; neither is suppressed. This is a minimal compatible React
test harness, **not browser DOM/accessibility or authenticated end-to-end testing**.
All fetches in lifecycle tests are synthetic in-process boundaries. The separate
HTTP smoke serves static frontend assets only. No backend/provider/cloud/database
requests, acceptance claims, deployment, or changes to existing services.

Separate later contract work remains **unfixed**: auth/cache tenant isolation and
global storage keys; auth operation races; 1m initial/1d background cache truncation
and replacement; property/message same-ID edit detection; property invalid enum
options/shared API mismatch; settings `weeklySummaryNotify` versus
`weeklySummeryNotify`, false Saved-on-error, and local-only Google connection UI.
These passing tests must not be presented as resolving those defects.

Manager-owned dirty `REQUIREMENTS.md`/`decisions.json` were read, not edited or
staged. Untracked `AGENTS.md`, `.baseline-audit/`, `.build-gate-audit/`, supervisor
logs and existing services were preserved. One focused implementation session;
no agents, restarts, staging, commits, pushes or PR operations. Deviations: only
the minimal test tooling/config additions and authorized adjacent provider/hook
split/import changes described above; the first install needed explicit registry
access because npm inherited offline mode from the required runtime prefix.
Independent supervisor review/evidence and final application acceptance remain
outstanding at this worker snapshot; supervisor results follow below.

### Independent supervisor verification and candidate controls

The worker exited **0** before these checks; no source writes overlapped them.
All commands below ran on the final source, with cached Node **v22.22.0** verified
by `npm exec --offline --package=node@22.22.0 -- node --version` (exit 0).
The worker's “no staging/commits” statements above describe its own snapshot;
explicit supervisor staging and the authorized feature-branch commit follow.

| Directory | Exact command | Exit / observed result |
|---|---|---|
| frontend | `npm exec --offline --package=node@22.22.0 -- npm test` | 0; 20 pass, 0 fail/cancelled/skipped/todo; `supervisor-test.log` |
| frontend | `npm exec --offline --package=node@22.22.0 -- npm run lint` | 0; unchanged `eslint .`; `supervisor-lint.log` |
| frontend | `npm exec --offline --package=node@22.22.0 -- npm exec -- tsc -b --force` | 0; forced type rebuild, including parent compile regressions; `supervisor-types.log` |
| frontend | `npm exec --offline --package=node@22.22.0 -- npm run build` | 0; full `tsc -b && vite build`, 1672 modules, 6.03s; `supervisor-build.log` |
| root | `npm exec --offline --package=node@22.22.0 -- node .build-gate-audit/inspect-bundle.mjs` | 0; generated HTML/JS/CSS HTTP200 and byte equality on free loopback port, server closed; `supervisor-bundle-smoke.log` |
| root | `npm exec --offline --package=node@22.22.0 -- node --check frontend/dist/assets/index-CZKxfHok.js` | 0; generated JavaScript syntax only |
| root | `git diff --check` and `git diff --cached --check` | each 0 before staging |
| root | `git diff --exit-code -- backend frontend/eslint.config.js frontend/tsconfig.json frontend/tsconfig.app.json frontend/vite.config.ts frontend/src/services/api.ts CLAUDE.md STYLE.md frontend/CLUADE.md` | 0; no protected implementation/config/instruction changes |
| root | `factoryctl status real-estate-agent-helper` | 0, Scope valid True, before work and during final checks |

Raw supervisor logs are local `.lint-gate-audit/supervisor-*`, not committed.
Smoke asset hashes/bytes exactly match the worker's final artifact above. This
is real React lifecycle execution plus static artifact HTTP smoke, **not browser,
DOM/accessibility, authenticated backend, provider, database or final app acceptance**.
Renderer deprecation, MockTimers experimental and Vite plugin-timing advisories
are disclosed and not suppressed. The narrow lifecycle fixes do not change the
separately deferred contract defects listed above.

Supervisor inspected the actual implementation/test/dependency diff and pre-fix
failure log. Extra DashboardPage/MessagesPage edits are hook-import-only; adjacent
context/type modules preserve provider architecture. Local property types preserve
fallback precedence and requests; no shared API contract repair is smuggled in.
Minimal pinned dev tooling adds a separate test command/config, leaving existing
lint/build and compiler checks unchanged. AGENTS.md remains untracked with SHA256
`76aef9c8e57a39952245e5b01b2e22bb0e5a66a27eec1840cf656f942064f24e`.
Manager-owned authority changes remain excluded; REQUIREMENTS.md SHA256 matches
the approved external lock `581d5b194e615b48dc20e413fd339772b82c2864450a0be4f2e0b91527dbd0d3`.
No cleanup bypass, backend/service operations, push, PR, merge or deployment.

One focused OpenCode implementation run, exit 0; **zero supervisor repair runs**.
Requested/observed `openai/gpt-6.1-sol`, variant default, standard/non-fast alias,
stored OpenAI account; quota/billing surface/invoice unavailable. Prompt budget
estimate was 35k input/12k output, not a hard CLI limit. Exported aggregate usage:
input 106857, cached-read 3689216, output 21192, reasoning 5519, cache-write 0.
Output/reasoning are preserved as separate reported counters, not added together.
This export exposes no step-finish records; no invented secondary totals. Client
cost 0 does not establish free usage or a subscription/API invoice. Budget estimate
was exceeded; no quota error or retry session occurred.

Explicit staging used only the **19 paths** in the worker manifest above;
`git diff --cached --exit-code -- REQUIREMENTS.md decisions.json AGENTS.md
docs/BASELINE.md backend` exited 0. Unstaged tracked changes are only the two
manager-owned authority files. The first staged whitespace check exited 2 for
one extra EOF blank line in this appended evidence; that blank line was removed.
The subsequent `git diff --cached --check` and `git diff --check` both exited 0.
`npm exec --offline --package=node@22.22.0 -- node
.lint-gate-audit/scan-staged.mjs` (root) exited 0: exact 19-path manifest equality,
per-file byte/SHA256 records, no unreviewed secret/private-key/JWT/provider-key/
unsafe-code findings, and no added source suppression markers. Two explicit
synthetic test fixtures (reserved invalid-domain identity and reset-password
payload assertion) were manually reviewed and recorded, not real credentials.
The scanner/log remain local for the native reviewer. This is a bounded pattern
scan plus manual diff review, not an exhaustive security audit.

Native independent review by **mvp-reviewer** is required on the exact commit in
the lifecycle handoff, before releasing visual successor `t_ae413c78`. Reviewer
must rerun Node22 lint, full build and lifecycle tests, inspect state/draft/cleanup
regressions and scoped manifest, and keep deferred contracts/final app acceptance
separate. No pre-created review child exists; the visual child is not itself a
review, so this card uses same-card native review rather than completing early.
