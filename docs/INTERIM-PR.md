# Interim draft PR — reviewed UI, bounded runtime and demo

**Status:** Prepared locally, not pushed or published. Existing application snapshot: `0ba82333c58751f6cebb1ffbadce53b0227afb7e`. The exact new documentation/media commit and tree are supplied in the native same-card review handoff (avoiding a self-referential hash). Independent review is required before the separate publication task may push a **draft** PR targeting `main`; no merge or deployment is authorized.

## Summary

- Retain the independently reviewed editorial/subtle-tech public and CRM redesign, frontend build/lint fixes, SQL bootstrap and guarded local PostgreSQL runtime work already committed through the base above. This is **interim source delivery, not final application acceptance**.
- Replace the overview with an evidence-bounded README: React/TypeScript/Vite, Express/Drizzle, PostgreSQL/default Neon HTTP, and preserved Google OAuth/Gmail Watch/Pub/Sub architecture.
- Add a real 35-second silent MP4 and linked poster from seven reviewed actual browser screenshots. The operator-approved fallback avoids additional browser/login work on the low-memory host. It is persistently labelled **screenshot walkthrough / synthetic visual fixtures / NOT authenticated E2E**. No click, persistence, OAuth or provider-delivery claim.
- Include the manager-supplied `REQUIREMENTS.md` / `decisions.json` interim-delivery amendment unchanged. Do not include the copied untracked `AGENTS.md`.
- No application source, dependency, runtime configuration, historical screenshot or instruction-file edits. Original unfinished auth/cache work remains excluded and preserved.

## Fresh verification — October 30, 2026

All project checks ran **sequentially after the media worker exited**, against this isolated worktree's unchanged reviewed implementation. No new DB/container, provider calls, live login, dependency install or unrelated-process cleanup. Initial preflight: available921MiB/no swap, load0.80/0.54/0.48; host later became constrained, so no parallel gates or browser recording were attempted. Dependencies were linked only after matching package manifests/locks. Local dependency-directory containers retain package links but isolate `.tmp`, `.vite`, `.vite-temp`, dist and build outputs from the original dirty workspace.

Every command below exited **0**. Prefix `P` is exactly `env -i PATH="$PATH" HOME=/root TMPDIR="$PWD/.interim-audit/tmp" npm exec --offline --package=node@22.22.0 --`, with `TMPDIR` resolved at repository root before changing directory. No inherited URL/provider settings or dotenv files were supplied. Node reported v22.22.0. Raw evidence stays local under `.interim-audit/`, not in the upload tree.

| Directory | Command after P | Result |
|---|---|---|
| frontend | `npm test` | 61 tests passed; 0 fail/cancel/skip |
| frontend | `npm run lint` | unchanged ESLint gate passed |
| frontend | `npm exec -- tsc -b --force` | forced rebuild passed |
| frontend | `npm run build` | full tsc + Vite build; 1672 modules |
| backend | `node --test --test-name-pattern='startup boundaries\|default server' test/local-runtime.test.js` | 2 startup/default-server tests passed; no new DB |
| root | `node --test backend/test/lead-scoring.test.js` | 53 pure-scoring tests passed; no provider calls |
| root | `node .interim-audit/verify.mjs` | orchestration above, then actual generated HTML/JS/CSS HTTP200 and byte equality on owned ephemeral loopback server; server closed |

The last command is the local supervisor runner, **not a shipped setup dependency**; the individual portable project commands are in the README. Existing React renderer deprecation/MockTimers experimental warnings, Node module-mock warning and Vite plugin-timing advisory remain visible in logs. No gate/config weakening. Frontend tests are component/synthetic boundary evidence; the HTTP smoke is static artifacts, not authenticated browser or API acceptance. Installation recipes and optional preview are not claimed as freshly executed. `docs/LOCAL-SETUP.md` documents special retained-container/Linux-procfs requirements; its full runtime/bootstrap checks create synthetic DBs and were deliberately not rerun here.

## Media and links

Generation: `python3 docs/demo/generate.py` exited0. Supervisor commands:

```sh
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames -of json docs/demo/walkthrough.mp4
ffmpeg -hide_banner -loglevel error -threads 1 -i docs/demo/walkthrough.mp4 -f null -
ffmpeg -hide_banner -loglevel error -threads 1 -i docs/demo/walkthrough.mp4 -filter_threads 1 -vf fps=1/5 -q:v 2 .interim-audit/supervisor-frame-%02d.jpg
```

All exited0. H.264 / yuv420p, 1440×1240, 24fps, 840 frames, 35.000000 seconds, no audio, **932403 bytes**. MP4 atom inspection confirms `moov` precedes `mdat` (faststart). Supervisor visually inspected all seven decoded scene samples and the actual poster: readable unclipped persistent label/captions, original simulation banners, empty login fields, synthetic identities, no private captures/credentials, and retained CC0 image credit. This is not per-frame exhaustive review. [Demo provenance](demo/README.md) records exact input/source hashes, scene timings, generation and output hashes; [image credits](IMAGE-CREDITS.md) retains the underlying photograph's source/license. All relative Markdown links in the three new/updated README/PR documents resolve, including the poster and real MP4. GitHub inline playback/autoplay is not promised; the relative poster links to the MP4.

## Cleanup and exact change scope

**Deletion manifest: zero files; no deletion candidates approved or executed.** No tracked generated artifact was positively proven unnecessary. No removal means no imports or evidence links were sacrificed for cosmetic cleanup. Retain source/tests, fixtures, licenses/credits, authority/instruction files, all historical screenshots, original auth work, original local audit directories, synthetic DBs and volumes. No `git clean`, wildcard removal, stash/reset or original-workspace mutation.

`.gitignore` only adds these named retained local scratch directories: `.baseline-audit/`, `.build-gate-audit/`, `.lint-gate-audit/`, `.visual-audit/`, `.db-bootstrap-audit/`, `.local-runtime-audit/`, `.auth-session-audit/`, `.interim-audit/`. Ignore rules do not delete anything or untrack committed evidence.

Explicit nine-path staging scope: `.gitignore`, `README.md`, `REQUIREMENTS.md`, `decisions.json`, `docs/INTERIM-PR.md`, `docs/demo/README.md`, `docs/demo/generate.py`, `docs/demo/poster.jpg`, `docs/demo/walkthrough.mp4`. Per-file bytes/SHA256 and full upload-tree manifest are prepared before commit in local `.interim-audit/explicit-staging-manifest.json` and `upload-manifest.json`; native metadata binds the candidate tree/commit. Reviewed existing application commits remain intact. All original12 auth-candidate paths match `.baseline-audit/interim-pr-preserved-auth-manifest.json` before/after verification; protected implementation/evidence hashes are unchanged.

## Bounded source/privacy audit and remaining risks

The complete prospective upload tree, current tracked diff and all reachable base-history blobs were scanned for private keys, provider-token signatures, JWT literals, credential-bearing database URLs and quoted assigned secrets; suspicious filenames and nonreserved-email locations were also reviewed. Existing pattern hits are explicitly synthetic test/local-JWT/rejection strings or unusable baseline examples, not live credentials. No new private runtime dumps, tokens, `.env`, audit transcripts, node_modules or unfinished auth candidate are included. All new media inputs are unchanged reviewed synthetic screenshots, and all new media scene samples were visually inspected.

Residual disclosure: pre-existing legacy `backend/test/gmail.test.js` and `backend/test/outlook.test.js` retain account-looking Gmail selectors in source/history; other old tests/comments contain illustrative nonreserved-domain examples. These are **not run**, newly collected user data, or credentials. This task cannot certify ownership of legacy test addresses or provide an exhaustive secret/PII/security audit; independent reviewer must consider these residuals before publication. No source/history rewrite or broad cleanup is authorized here. The local audit records exact path/line classifications without exposing values in durable metadata.

**Not production ready:** auth token-purpose/session/OAuth/cache isolation, core lead/property/note CRUD contracts, messages sending/persistence, end-to-end Google-shaped email-push/idempotency simulation, final route matrix and authenticated browser acceptance remain unfinished. No live Neon/Google/Gmail/Graph/OpenAI/SMS/email integration or delivery was tested. Real-DB/runtime review of the base is not proof of those outstanding repairs. Original auth card stays blocked; independent same-card reviewer approval must precede the separate draft-publication successor. No push/PR/CI/merge/deployment success is claimed by this document.
