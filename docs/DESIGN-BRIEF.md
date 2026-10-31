# Phase 1 — RealCRM, in context

Scope: public home (Decide / Learn) and existing shared controls (Monitor /
Operate). No new product features, shell redesign, other-page restyling, or
dependency changes. RealCRM is the existing product name, not a new brand.

## Composition and copy

- A ruled masthead leads into a left-aligned editorial headline and direct
  sign-in action. A narrower, right-hand architectural photograph has a small
  folio label and an explicit editorial caption. No fake listing or dashboard.
- Below, a short introduction sits beside a wider, ruled definition list of
  existing workflows: lead records, property records and conversations. The
  dashboard is described only as an overview. No equal feature tiles.
- On small screens: masthead, headline/copy/actions, photograph/caption,
  introduction, workflow rows, legal footer. Grids use shrinkable columns;
  actions wrap, links and buttons have at least 44px height. No fixed text widths.
- `/login` is the real entry; copy explains its existing Sign Up toggle.
  Learn-more links target `#workspace`; legal links use `/terms` and `/privacy`.
  Semantic landmarks, one h1, labeled navigation and a visible-on-focus skip
  link support keyboard reading. Actions are links, never buttons around links.

## Shared tokens

`frontend/src/index.css` is the source; Tailwind semantic colors, fonts, radii
and card shadow reference its CSS variables. No external font request.

| Purpose | Token / value |
| --- | --- |
| Paper / surface | `--color-paper` #f7f5ef / `--color-surface` #fffefa |
| Ink / secondary text | `--color-ink` #222f2a / `--color-muted` #58635a |
| Forest / hover | `--color-forest` #264f3e / `--color-forest-deep` #19392c |
| Sage / wash | `--color-sage` #e8eee6 / `--color-wash` #eeede6 |
| Fine rules / control boundaries | `--color-rule` #cfd1c5 / `--color-input` #7e897e |
| Error / error wash | `--color-error` #9d3027 / `--color-error-wash` #fdefea |
| Caution / caution wash | `--color-caution` #784d14 / `--color-caution-wash` #faf1db |
| Corners | Card 8px; controls 6px; badges 4px |
| Shadow | 0 2px 5px, ink at 4%; no floating marketing cards |

Display typography is Georgia, Palatino Linotype, Palatino, serif; it applies
only to home editorial headings/fallback copy. Working UI and body copy use
Trebuchet MS, Arial, sans-serif. All fonts are offline-safe fallbacks; no uniform
cross-platform font rendering is promised. Numerals use lining/tabular settings
where supported. Home h1 scales 40–80px; body 16–18px; captions remain secondary.

## Photography and working controls

The single local Mx. Granger CC0 photograph brings residential campus architecture,
courtyard greenery and sky into a typographic layout. It is explicitly identified
as University of Chicago architecture, not inventory or an affiliation. See
`IMAGE-CREDITS.md` for the rejected-asset history. Explicit
1400×1050 dimensions, reserved aspect ratio and a deliberate crop prevent layout
collapse; eager/high-priority loading avoids a lazy LCP. A failed image is
removed and replaced by useful text in the same frame, retaining the caption.

Shared buttons keep their default `type="button"`, native disabled state,
handlers, variants and caller class overrides. Loading sets `aria-busy`; icons
are decorative. Inputs merge caller descriptions with an associated error ID,
set `aria-invalid` on error and retain visible error text. Textareas have the
same focus/disabled treatment. Cards remain ordinary containers unless given
an onClick; that opt-in adds focus and Enter/Space activation, ignoring nested
targets and repeated key presses. Current page usages are non-clickable cards;
do not use the clickable variant to wrap nested interactive controls.

Badges retain their status labels and all API variants (`indigo` is now a forest
alias). Empty/error states favor readable explanation and existing actions over
icon toppers. Skeletons are decorative and hidden from assistive technology.
Reduced motion stops spinner/pulse animation and decorative transitions without
removing busy semantics. No new live regions. Legacy hard-coded page colors
are intentionally not globally replaced.

## Anti-generic self-audit (implementation, not browser acceptance)

**Explicit tells score: 0/8 intentionally retained**: centered hero stack,
Sparkles topper, equal feature-tile grid, violet gradient, pill-everything,
glassmorphism, invented proof metrics, fake dashboard. This is a structural
self-audit, not a measured visual-quality score. The asymmetry, editorial photo,
folio/caption and ruled workflow text serve Decide / Learn; working controls
remain sans-serif and task-oriented rather than adopting the marketing surface.

Component regressions run against the real TSX modules. The supervisor owns
running-browser checks (desktop/mobile, contrast, keyboard, reduced motion,
links, failed-image layout and screenshots) and `VISUAL-VERIFICATION.md`.
This brief does not assert browser, database, authentication or provider acceptance.

# Phase 2 — The working property desk

The existing CRM now extends the approved paper/forest vocabulary; it is not a
second visual system. Dashboard is **Monitor**, leads **Operate**, properties
**Explore / Compare**, and lead detail **Command / Inspect**. The original
RealCRM identity, routes, request payloads and provider boundaries stay intact.

- The shell uses a quiet ruled masthead, persistent desktop navigation, accurate
  current-route treatment (including lead detail), actual user initials/name/email,
  a visible Logout action and a labelled mobile drawer. The unused top-bar search
  is removed rather than presenting a non-working action. Skip-to-workspace,
  focus-visible outlines, drawer/dialog focus containment, Escape and return focus
  make the dense workspace keyboard-operable.
- Dashboard keeps the real transformer and period control. A ruled metric strip,
  prioritised verification attention, activity feed and status breakdown replace
  floating equal-weight KPI boxes. No fabricated telemetry or new chart data.
- Leads retain search, status filters, sort, referral, verification, editing and
  both deletion workflows. Explicit detail links replace click-only rows. Mobile
  rows become labelled records; tablet rows move actions below the data; desktop
  aligns data and visible Actions disclosures. No new pagination is invented.
- Properties keep grid/table comparison and all existing forms. Without a supported
  photo field, cards deliberately say **No property photo** instead of assigning
  unrelated architecture to a listing. The comparison viewport scrolls locally,
  remains keyboard-focusable and keeps action disclosures inside the scroll area.
- Detail keeps long contact text readable, separates conversation/notes from record
  facts, and labels message, subject and note controls. SMS/email and action-error
  states remain real existing workflows, not simulated production success.
- Dialogs share the same paper/forest controls, associated field errors, numbered
  sections, readable warnings and busy semantics. Their content must shrink inside
  the available viewport, including borders and a vertical scrollbar.

## D009: restrained technical precision

User feedback on October 30 favours the existing harmony with a subtle technical
feel. Within this phase only, existing metric numerals, property prices and detail
scores use a narrowly scoped offline-safe monospace/tabular treatment. UI copy
stays readable sans, page headings retain restrained serif, and precise rules and
text-labelled statuses carry hierarchy. No neon, gradient, dark-mode overhaul or
new feature. Home/global typography harmonisation remains the queued phase3 task.

## Narrow shared style additions

`index.css` adds CRM-scoped layout, wrapping, fields, modal sizing, comparison
scrolling and numeric classes using the existing phase1 variables. Only minimum
44px controls and focus treatment intentionally reach other routes inside the
shared shell; reduced-motion rules remove CRM transitions. No palette, font
asset, image, dependency or theme configuration was replaced. Existing image
credits remain unchanged because this phase adds no imagery.

Self-audit against the ten claude-design tells: **0/10**. There is no marketing
hero, equal feature-tile grid, tech gradient, generic indigo, blur, monument stat,
icon topper or centred stack. Existing chosen offline typography is deliberate.
The caution rail is a meaningful verification warning, and the navigation rail
is active-state information, not decorative organisation. This is a design
self-audit, not independent accessibility or final application certification.
Actual browser evidence and limitations are appended to VISUAL-VERIFICATION.md.

# Phase 3 — Account, correspondence and reference

Bounded task `t_ce657371`: Configure covers login, Google callback, password,
six-step onboarding and settings; Operate covers the existing inbox; Learn covers
the two legal pages. Home receives utility-label typography only: layout, photo,
copy and claims are preserved. No new assets, dependencies, provider calls or
backend/auth architecture. Browser captures and final verification belong to the
supervisor, including VISUAL-VERIFICATION.md; renderer tests are not browser evidence.

## D009 implementation

Keep the approved warm paper / forest / editorial identity and RealCRM wordmark.
The offline sans stack is Segoe UI / Helvetica Neue / Arial; existing editorial
serif remains on Home and legal titles. Shared `--font-mono` (system monospace /
SFMono-Regular / Consolas / Liberation Mono) carries small utility labels and
tabular metadata, including the existing CRM numeric class. No downloaded fonts.
Forms use a ruled, left-aligned sheet, not decorative imagery or icon toppers.
Semantic palette tokens, clear labels, described errors, focus-visible treatment,
44px controls, busy states and reduced-motion support extend the existing UI.
Inbox stacks list/thread on mobile and uses shrinkable desktop columns; long
names and bodies wrap, selection is pressed and unread meaning is explicit text.
Legal text, including existing placeholders and claims, is unchanged in a quiet
66ch measure with real home links.

## Truthful boundaries and later functional repairs

- Only fetched boolean `gmailConnected: true` produces a connected onboarding
  state; source is not evidence. Removed the never-shared guarantee and promises
  that all onboarding answers or Gmail can be changed in Settings.
- Inbox Send stays visible but disabled, explains that sending is not connected,
  and does not clear a draft or claim delivery. Latest-inbound “Unread” is not
  persisted read tracking. Actual sending/read tracking remain later work.
- Settings Connect/Disconnect stay disabled: connection status unavailable,
  configuration pending. No local toggle pretends to establish a connection.
- Save/password-request busy and error disclosure is narrowly guarded; only an
  existing successful response may show success. Notification keys, including
  `weeklySummeryNotify` versus `weeklySummaryNotify`, remain unchanged for later
  persistence/cache/key repair. No manufactured persistence guarantee.
- Existing manual-signup navigation to absent `/confirm-email` remains a known
  contradiction for a later auth repair; no ConfirmEmailPage or email flow added.
- Legal placeholders/content and invalid-reset copy are existing product debt,
  not newly researched legal advice or a new reset-request workflow.

## Short anti-slop audit (implementation only)

No indigo/gradient account shell, floating icon topper, decorative form photo,
equal feature tiles, invented telemetry or microscopic status labels. Useful
rules and restrained monospace add precision without a neon/dark redesign.
Real controls, existing data and honest unavailable states lead the hierarchy.
Responsive/keyboard/contrast acceptance remains subject to supervisor browser review.
