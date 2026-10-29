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
