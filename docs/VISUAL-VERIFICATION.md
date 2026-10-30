# Visual phase 1 verification — October 29, 2026

## Status: bounded candidate ready for independent review

Task `t_ae413c78`, branch `fix/functional-repair`. Public home and shared
primitives only. This is **not final application acceptance**. The phase2 child
`t_d7be6155` is implementation, not an existing review child; keep it gated while
same-card `mvp-reviewer` review runs. Exact candidate SHA is recorded on the native
handoff, avoiding a self-referential commit hash in this document.

## Authority, scope and recovery

- Read REQUIREMENTS.md, decisions.json D006/D007/D008, AGENTS.md, CLAUDE.md,
  frontend/CLUADE.md and STYLE.md; loaded claude-design and popular-web-designs
  for process, not a branded clone. Explicit task authorization for local commits
  takes precedence over STYLE.md's generic no-commit rule. No push/PR in this phase.
- `factoryctl status real-estate-agent-helper`: exit0, Scope valid True.
  REQUIREMENTS SHA256 matches approved external lock:
  `581d5b194e615b48dc20e413fd339772b82c2864450a0be4f2e0b91527dbd0d3`.
- Exact manager authority diff was read: separate commit
  `3dd9c2ac8391c9526bbca5474fc35b89a7e30fee` contains REQUIREMENTS.md and D006/D007.
  D008's exact pending diff was read and is included in a separate documentation
  commit before the visual implementation, not silently attributed to the user.
- Upstream independently approved lint repair: `4c9785994b2c0b6658a529783898f41cd8948a13`.
- Original OpenCode writer `proc_ff6a2df23c1f`, session
  `ses_e76ba1391ffepl0WIv1C6QZUXQ`, exited0 before independent checks. Current
  process inspection found no surviving `opencode run` writer. Recovery did not
  launch another coding agent or redo the baseline/design.
- The preceding worker failures were gateway-owner transport failures/turn budget;
  no claim that transport has been repaired. A read-only inline Python inventory
  command was approval-denied; not rerun through another tool/script/agent.
  Existing native edits, npm gates, browser checks and Git operations used only
  for their distinct authorized purposes. No approval/profile/config bypass.
- App.css is unused/unchanged. Backend, auth, shell, other pages, dependencies,
  lint/compiler configuration and instruction files unchanged. Untracked audit
  folders and AGENTS.md are excluded. AGENTS SHA256 remains
  `76aef9c8e57a39952245e5b01b2e22bb0e5a66a27eec1840cf656f942064f24e`.

## Final candidate gates (rerun after asset/reference edits)

Inside `frontend`, existing cached compatible Node v22.22.0:

| Exact command | Actual result |
| --- | --- |
| `npm exec --offline --package=node@22.22.0 -- npm test` | exit0; 32/32 pass, no fail/skip (20 lifecycle + 12 UI) |
| `npm exec --offline --package=node@22.22.0 -- npm run lint` | exit0, unchanged eslint gate |
| `npm exec --offline --package=node@22.22.0 -- npm run build` | exit0; tsc -b + Vite, 1672 modules |
| `git diff --check` | exit0 |

Output: index.html 0.47kB, `index-BVOKnqrq.css` 40.27kB,
`index-2kEiN4gJ.js` 448.01kB. Renderer deprecation/MockTimers experimental and
Vite plugin timing advice are disclosed, not gate failures. Logs are untracked
`.visual-audit/final-{test,lint,build}.log`, not commit deliverables.

UI tests import actual TSX: button default/submit/loading/disabled/busy/icons;
caller overrides; stable input IDs, invalid/error association and merged caller
descriptions; textarea props; clickable-card Enter/Space; badge variants/status
labels; empty/error handlers; decorative skeletons; home landmarks, real links,
no nested controls, exact CC0 local image/dimensions/alt and failure caption.
Synthetic renderer boundaries are not DB/auth acceptance.

## Final browser evidence

All included PNGs are real browser captures, visually inspected. No invented
rendering or synthesized screenshot. Final home is the built production preview
`http://127.0.0.1:4175/`; actual-component fixture uses fresh dev5175. Existing
5173 retained stale Tailwind utility values and is **not** control-style evidence.
No old server was killed/reconfigured. Existing Node22 dev/preview commands:

```
npm exec --offline --package=node@22.22.0 -- npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
npm exec --offline --package=node@22.22.0 -- npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

Explicit screenshot manifest under `docs/visual/phase1/`:

| File | Evidence |
| --- | --- |
| `home-before-390.png` | preserved actual baseline; centered Sparkles hero, mobile copy clips |
| `home-before-1440.png` | preserved desktop baseline, equal feature tiles |
| `home-final-390.png` | final CC0 photo, complete mobile page, viewport390×2100 |
| `home-final-1440.png` | final desktop editorial layout, CC0 crop/caption, viewport1440 wide |
| `home-final-fallback-390.png` | real network-blocked CC0 request, useful text, retained caption |
| `home-final-fallback-1440.png` | same genuine failure at desktop, stable reserved frame |
| `home-final-focus-1440.png` | first native Tab exposes focused skip link |
| `controls-final-focus-1440.png` | SIMULATED visual, actual components; forest button focus, disabled/loading/error/empty/badges |
| `controls-final-error-1440.png` | SIMULATED visual, associated error field focused; reduced-motion static loading |

Earlier `home-after-*`, `home-focus-390` and `home-fallback-390` captures are
historical untracked artifacts of the rejected-photo iteration, not final evidence
or included commit assets. Initial mobile final capture showed an unpainted photo
despite natural dimensions; it was replaced by a visibly painted capture above.
Intermittent browser RPC/screenshot timeouts are not passing evidence. Successful
capture used a taller mobile viewport and inspected actual pixels; desktop full
capture required a longer35s CDP deadline. No application workaround was added.

### Home results

- At requested390px and1440px widths, built home renders the real headline and
  caption with eager/high-priority local1400×1050 image. Initial production
  metrics client/scroll375/375 and1425/1425 (15px scrollbar); later viewport
  capture without scrollbar390/390, desktop fallback1440/1440. No horizontal
  page overflow. Desktop crop keeps facade/sky/courtyard; mobile crop shows both
  wings, greenery and paths. No prominent identifiable people.
- Warm paper/ink/forest, serif editorial headings, deliberate off-center structure,
  ruled workflow list, full legal footer and truthful copy. No fabricated numbers,
  testimonials, listing claims, security claims or replacement brand.
- Zero nested interactive controls; all nine home links measured at least44px
  tall in prior checks. Signup dead link removed in favor of real `/login` and
  explanation of its existing Sign Up toggle; no new auth flow.
- Native CDP first Tab: visible skip link, 2px rgb(38,79,62) outline, transform
  identity. Enter focuses `main-content` (rerun on production). Prior preserved
  native Tab/Enter then reached sign-in and existing /login Sign Up toggle;
  Explore targeted #workspace; /terms and /privacy rendered actual headings.
  No credentials/account creation or messages sent.
- Real CDP `Network.setBlockedURLs` and cache disable blocked only the CC0 photo.
  Both widths showed zero img nodes, meaningful unavailable text and full caption,
  reserved frame and no overflow. Network blocking/cache settings restored after
  capture. No fabricated error event used for browser evidence.
- No remote font dependency; Georgia/Palatino serif and Trebuchet/Arial sans
  degrade offline. No claim of identical cross-platform font metrics.

### Fresh shared-control visual fixture (SIMULATED, not authenticated E2E)

Untracked `.visual-audit/control-preview.js` injects the actual existing UI
modules into a browser-only host. It is not a production route/auth bypass.
Clear SIMULATED labels appear in the screenshots. Local prevented form events
use `visual@example.invalid`; no network or persistence result claimed.

- Actual primary rgb(38,79,62), native mouse hover rgb(25,57,44); forest keyboard
  focus ring measured as2px with2px white offset. Input error border rgb(157,48,39)
  with visible error text, `aria-invalid=true`, descriptions merged as
  `preview-hint preview-input-error`; focused error ring visible.
- Actual native mouse default action click count1, submit0. Disabled/loading
  `.click()` did nothing. Native required/email constraint validation prevented
  empty form submit; synthetic valid email allowed only local prevented submit1.
  Native Enter/Space on actual card produced card count2. Renderer tests independently
  cover these contracts. The fixture intentionally retains its error prop even
  after a syntactically valid email; it does not simulate app validation recovery.
- Buttons/inputs/textareas min-height44px; disabled fields legible and visually
  distinct; status/error meaning includes text, not solely color. No modal code
  changed; actual-component contracts checked, no claim of authenticated modal E2E.
- Emulated `prefers-reduced-motion:reduce`: spinner/pulse animation `none`, loading
  button remains disabled and `aria-busy=true`. Media emulation restored later.
- Measured computed-color WCAG sRGB luminance ratios in browser: paper/ink12.77:1;
  primary/surface9.17:1, hover12.51:1; secondary/input text13.80:1; muted/body5.75:1;
  disabled text5.35:1; error text6.68:1; danger wash6.48:1; success badge7.84:1;
  warning badge6.50:1; normal control border/surface3.61:1. Measured sampled text
  all exceeds4.5:1; important control boundary exceeds3:1. These are sampled
  components, not a site-wide accessibility certification. Raw metrics retained
  only in `.visual-audit/final-controls.json` and browser tool results.

## Image provenance recovery

Original Paul Lichtblau/Unsplash claim was not established by exact primary
artifacts; repeated primary requests returned401/Access Denied. Do not recast
that as verified. Manager D008 supplied Commons original/API/page/deed, each
HTTP200; recovery read exact saved API and visually inspected original/derivative.
Fresh supervisor `curl --fail --location --max-time25` of the primary Commons
file page and CC0 deed returned HTTP200; saved untracked as
`.visual-audit/final-commons-page.html` and `final-cc0.html`. The optional
web_extract backend could not extract URLs and was not used as verification.

The final optimized local CC0 derivative is258916 bytes (~259kB; slightly above
the250kB target, not a hard gate),1400×1050. SHA256
`4c8bb7265174793b427cc5181e9a078110e33172117feda80c67ad984478d5fe`.
Original source hash matched manager note. Full author/source/license/download/
retrieval, transformations and rejected history are in IMAGE-CREDITS.md.
The unverified WebP was moved out of public delivery into untracked audit storage;
neither it nor the6MB source is staged. Only the verified derivative ships.

## Commit/review boundary

Before commit, explicit manifest and native handoff prepared; stage/scan only the
10 scoped source/theme paths, UI test, verified WebP,3 design/evidence docs and9
named PNGs above (24 implementation paths). Separate authorized D008 documentation
manifest is `decisions.json` only. Native staged text-pattern scan and SHA256
manifest saved in untracked `.visual-audit/`; exact scan result/commit in handoff.
Never stage instruction files, runtime logs, baseline/build/lint/visual audit
directories, rejected photo or original JPEG. No broad `git add .`.

Review must independently inspect exact diff/screenshots, rerun available gates,
exercise final controls/images, and approve before releasing phase2. No backend,
database, live auth, provider, tenant security, final app acceptance, deployment,
push, PR or merge was performed/claimed here. Broader functional retest follows
all visual phases.

## OpenCode usage (preserved original run)

openai/gpt-6.1-sol, default variant/standard speed. Export reports input35346,
output17172, reasoning2387, cache-read309504, cache-write0; reasoning not added
twice. Client cost0 does not establish free usage/subscription invoice. Stored
OpenAI sign-in; actual dollar/quota cost unavailable. Original20–35k input/8–15k
output estimate exceeded in output. One focused run, zero repair runs; no new
coding writer in recovery.

# Visual phase 2 verification — October 30, 2026

## Bounded candidate, pending independent review

Task `t_d7be6155`, same `fix/functional-repair` branch, based on approved
`401236572e1d80e31e5dfea8cac261012762f12c`. This recovery made **no application
source edits or new coding-agent runs**. It preserved the original implementation
and both completed repairs. Only evidence and factual documentation were added;
one trailing blank line in the phase2 brief was removed. Explicit task commit
permission overrides STYLE.md's generic prohibition. No push, PR, merge or deployment.

Read all assigned authority/instruction/brief files and manager recovery note;
`factoryctl status real-estate-agent-helper` returned exit0 / Scope valid True.
D009's manager-owned REQUIREMENTS.md/decisions.json changes remain unstaged for
phase3. Inspected existing scoped diff and actual workspace regressions; no new
backend/provider/auth/data-model/dependency/configuration changes. Shared CRM CSS
and dialog/property-form styling are documented in DESIGN-BRIEF.md. No new images
or image-credit changes. The phase3 child is implementation, so this card requests
same-card independent `mvp-reviewer` review rather than releasing it prematurely.

## Exact-source-bound gates

From `frontend`, using cached compatible Node22, all freshly executed:

| Command | Actual result |
| --- | --- |
| `npm exec --offline --package=node@22.22.0 -- npm test` | exit0; 48/48 pass, 0 failed/cancelled/skipped |
| `npm exec --offline --package=node@22.22.0 -- npm run lint` | exit0; no weakened rules |
| `npm exec --offline --package=node@22.22.0 -- npx tsc -b --force` | exit0 |
| `npm exec --offline --package=node@22.22.0 -- npm run build` | exit0; tsc + Vite8.0.14, 1672 modules, built6.07s |
| `sha256sum --check --quiet docs/visual/phase2/source.sha256` | exit0; source/test/config hashes unchanged across gates and browser verification |
| `git diff --check` | exit0 after documentation EOF cleanup |

Build output: CSS `index-BivhjOEs.css`40.40kB, JS `index-Cmrgpg4a.js`449.17kB.
React renderer deprecation, MockTimers experimental and Vite plugin timing notices
are warnings, not hidden failures. Exact raw logs remain local/untracked:
`.visual-audit/phase2-recovery-{test,lint,types,build}.log`.
Committed source snapshot `docs/visual/phase2/source.sha256` has SHA256
`178863a44a0a37a6a706a92fa9bf630a400c83335ccb0f56227dc50907c8cce1`.
It includes unchanged supporting frontend modules/configuration as well as the
candidate paths, not merely a hash of this document. Exact commit is on the native
review handoff to avoid self-reference.

Sixteen added actual-component regressions retain request payloads/methods,
verification/send-warning/delete contracts, property create/delete/view behavior,
message/note refetch behavior, period navigation, user identity, nested-route
active state, dialog names/labels/errors/busy handling, and focus/inert cleanup.
They extend the existing32 tests; renderer/fake-DOM boundaries are not E2E.

## Browser boundary and reproducible evidence

**Every phase2 screenshot is SIMULATED-visual / NOT E2E.** Real local React pages
were rendered at `http://127.0.0.1:5175`; no production authentication bypass was
added. Untracked `.visual-audit/phase2-browser-fixture.js` is injected before local
navigation in isolated browser tabs. It supplies visibly synthetic API records,
intercepts API reads, rejects every non-GET request with422, clears only the
isolated preview's local storage, and adds the visible simulation banner. Reserved
`example.invalid` contacts and labelled synthetic addresses are not real inventory.
Network blocking additionally excludes local8080 and HTTPS providers. No live
DB/auth/provider/messaging success is asserted or required by these visuals.

The default browser really was about:blank; storage was accessed only after an
actual local origin existed (or by initialization on the actual local document).
Intermittent screenshot WebSocket closure/RPC timeouts were not counted as success.
Successful final capture used guarded fresh tabs, stable render and foreground
`Page.bringToFront`. A premature tablet dashboard capture was replaced after the
actual Overview heading rendered. Raw JSONL history remains untracked; committed
`evidence.json` contains only the latest exact18 screenshot records and SHA256s.
All18 actual PNGs were inspected through contact sheets; individual files remain
full-resolution, not generated mockups. Captures are1000px-high viewports, not
claims that every long page fits without ordinary vertical scrolling.

### Explicit PNG manifest — `docs/visual/phase2/`

| Files | Actual content |
| --- | --- |
| `dashboard-final-{390,768,1440}.png` | Monitor overview, metric strip, activity/status and shell |
| `leads-final-{390,768,1440}.png` | Operate list; responsive records/table; filters and long address |
| `detail-final-{390,768,1440}.png` | Command/Inspect; long name/email, conversation and record facts |
| `properties-final-{390,768,1440}.png` | Explore/Compare; wrapping address, real controls, honest No property photo |
| `dialog-final-390.png` | Refer Lead, focus outline and shrinkable scrollable dialog |
| `leads-empty-390.png` | zero records, existing empty-state action context |
| `dashboard-loading-390.png` | pending synthetic API, existing skeletons |
| `dashboard-error-390.png` | synthetic503, truthful error and retry control |
| `properties-table-390.png` | comparison viewport locally scrolled horizontally |
| `navigation-open-390.png` | mobile drawer, actual active Properties, synthetic identity/logout |

`evidence.json`, `interactions.json`, `comparison-controls.json`,
`filter-contrast.json` and `source.sha256` are the companion handles. Older
`dashboard-390.png`, `browser-metrics.json` and raw `recovery-metrics.jsonl` remain
unstaged historical/local working evidence, not the final screenshot manifest.

### Observed controls and layout

- All18 final document client/scroll widths agree at their requested widths;
  zero broken img nodes. Populated main widths also agree. No unrelated stock
  house appears on a listing: unsupported photo records use deliberate text.
  Mobile long name/email/address wraps; tablet actions move below rows; desktop
  sidebar and compact multi-column hierarchy remain accurate and legible.
- Native mouse opened mobile navigation: expanded=true, named dialog, initial
  Close navigation focus, background main inert. Native Shift-Tab wrapped to
  Logout; Escape closed it, restored Open navigation focus and inert/expanded
  state. Desktop screenshots preserve nested Leads active navigation on detail.
- Native Refer Lead opener focused Close lead dialog. Shift-Tab wrapped to Add
  Lead, forward Tab wrapped back. Empty submit produced four aria-invalid fields
  with actual associated name/contact/referrer descriptions, **no mutation
  request**. Escape returned focus to Refer Lead. Final repaired390px modal:
  client341 / scroll341 / child341 (previous358px child finding resolved).
- Native property Open filter returned1 of3, synthetic search `902 Example`
  returned1 of3, clearing restored3 of3. Grid/Table controls remain exposed.
  Existing routes have no pagination controls; none invented. Responsive filter
  wrapping is visible at all widths. Existing actual-component tests cover sort
  and request behavior; this is not a claim of exhaustive native control testing.
- Comparison region is keyboard-focusable tabindex0. At390: client356 / scroll780,
  local scrollLeft424, document width390. Native Tab reached Address sort with
  forest2px outline /3px offset. Horizontal comparison is intentional local
  scrolling, not horizontal page overflow.
- Emulated reduced motion: preference=true and sidebar transition0s. Existing
  shared skeleton/spinner reduced-motion rules and regression coverage retained.
  Palette-token contrast calculations (not a site-wide computed-style audit):
  ink/paper12.77:1, muted/paper5.75:1, primary9.17:1, error/wash6.48:1. Phase1's
  independently checked shared-control contrast remains supporting evidence.

## Handoff and limitations

Explicit allowed-path staging excludes manager authority edits, instruction files,
all audit directories/raw logs and old phase1/rejected-asset captures. Final
staged manifest, credential-signature scan, whitespace and SHA256 audit results
are recorded on the native handoff. No blanket staging. New implementation,
functional retest, cloud changes and production preview certification were not
performed in recovery. Dev5175 smoke is real page execution with intercepted
synthetic data; the production build passed but old unavailable4175 is not cited
as a current running production smoke.

Independent visual review is still required. Final DB-backed functional/security,
real authentication and provider acceptance remain unverified and follow all
visual phases. No application-wide accessibility or final product acceptance is
claimed here.

## Reviewer-requested backdrop correction — October 30, 2026

`0ec8e0a0994a23d627a1bb94081f55a8110f1626` was **not approved**. Reviewer
comment42 demonstrated that the focus helper also made the clickable mobile
backdrop inert. The manager authorized this correction only, not another redesign.
The interrupted attempt's single Luna run and three-file repair were adopted;
no replacement editor/source repair was run in recovery. AppLayout marks only
its non-focusable, aria-hidden backdrop `data-focus-scope-allow-click`; the helper
skips that sibling while retaining background inertness and keyboard containment.
Sidebar, modal production code, routes, provider boundaries and authority files
are unchanged. Explicit task commit permission overrides generic STYLE.md policy.

### Regression and exact-source gates

Saved `.visual-audit/phase2-backdrop-red.log`:49 executed,48 pass,1 fail,exit1;
the new actual-shell regression failed on backdrop inert `true !== false` before
the production fix. The initial name filter followed the glob, so the whole suite
ran. Saved GREEN: focused1/1 and full49/49,exit0. The test asserts backdrop
exemption, retained main/header ancestor inertness, close/return-focus and cleanup.
Existing modal busy/Escape/focus and disabled-control tests remain passing.

Fresh supervisor commands from `frontend`, all exit0:
- `npm exec --offline --package=node@22.22.0 -- npm test`:49/49;0 failed/skipped.
- `npm exec --offline --package=node@22.22.0 -- npm run lint`.
- `npm exec --offline --package=node@22.22.0 -- npx tsc -b --force`.
- `npm exec --offline --package=node@22.22.0 -- npm run build`:1672 modules,6.88s.

Logs: `.visual-audit/phase2-backdrop-final-{test,lint,types,build}.log`.
Separate63-path `docs/visual/phase2/backdrop-rework/source.sha256`, SHA256
`d165d83ff451c4f4b79a16bbded5b575fdda74ddfe38b910e83e5125e38ec2f5`,
verifies across gates/browser checks. Original source manifest and18 PNGs stay
**pre-fix** evidence for0ec8e0a; no historical screenshot was overwritten.
The exact new commit is on the native handoff to avoid self-reference.

### Affected native checks — SIMULATED-visual / NOT E2E

Existing mutation-rejecting fixture injected before local5175 navigation;
HTTPS/providers/local8080 additionally blocked. At390×1000 on `/properties`:
- Two native CDP open→click(330,500) cycles outside240px drawer dismiss it.
  Before each: backdrop inert=false, main/header inert=true. After each:
  expanded=false, background released, focus=Open navigation; page390/scroll390.
- Native Shift-Tab wraps Close→Logout; Tab wraps Logout→Close. Background focus
  attempt cannot escape. Native Escape and Close each restore the opener.
- `/leads` Refer Lead settled native Tab wraps Close↔Add Lead. Outside click
  does not dismiss; inert workspace/header reject background focus. Visible native
  submit exposes4 associated field errors; modal client341/scroll341/child341.
- One browser-only delayed synthetic POST observes aria-busy=true, disabled
  Close/Cancel/submit, blocked Escape/outside dismissal and inert workspace/header.
  Disabling focused submit transiently blurs focus to body (recorded, not hidden);
  outside click recaptures dialog focus and further header focus attempt stays
  inside. Existing fixture releases422; Escape returns Refer Lead. No persistence,
  delivery or provider contact; this is not live functional acceptance.

Records: `backdrop-rework/{native-dismissal,native-modal,gates,evidence}.json`.
Three actual PNGs individually inspected: `navigation-open-390.png` (Properties
active,identity,dim backdrop), `navigation-dismissed-390.png` (opener focus ring,
no drawer/backdrop), `dialog-validation-390.png` (readable associated errors in
vertically scrollable modal). All have simulation banners. Screenshot hashes are
separate from source hashes. No new imagery or whole-route matrix recapture.

Probe limitations: generic click helper initially did not open the drawer;
direct CDP input succeeded. One selector quoting error was corrected. Early
modal probes incorrectly assumed ancestor main should be inert and used offscreen
submit coordinates; actual workspace/header inertness and visible native pointer
submission were then rechecked. Failed probes are not reported as passes.

Preserved OpenCode session `ses_e754cf457ffeG4dxdF4KW1hycL`, requested
`openai/gpt-6-luna`, default effort/standard speed. Saved final text reports completion;
last step-finish reason is tool-calls, not a proven terminal exit. Original exit unavailable after gateway-owner crash. Manager confirmed
no surviving writer; supervisor verified files and all gates. Step-finish totals:
input66902, cache-read242688, output2395, reasoning2275, cache-write0 (do not add
reasoning twice). Observed model/cost/quota unverified: export command was
approval-blocked before execution and not bypassed. No new coding/provider run.

Explicit scoped staging/credential scan excludes manager-owned REQUIREMENTS.md
and decisions.json, instruction files, audit/raw logs and historical captures.
Independent same-card `mvp-reviewer` re-review is required; phase3 remains gated.
No PR/push/merge/deployment or DB/auth/provider/final-app acceptance.
