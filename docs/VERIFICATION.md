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
