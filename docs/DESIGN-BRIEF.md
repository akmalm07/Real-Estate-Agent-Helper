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
