# Screenshot walkthrough

`walkthrough.mp4` is a 35-second, silent screenshot montage—not a live browser recording. No capture/recording tool was supplied, so this uses the accepted fallback: full-screen, independently reviewed local browser screenshots already tracked in the repository. It does not simulate clicks, navigation, authentication, persistence, or provider delivery. Every frame retains the original screenshot and has an additional readable header label, `SCREENSHOT WALKTHROUGH | SYNTHETIC VISUAL FIXTURES | NOT AUTHENTICATED E2E`, plus a truthful scene caption outside the screenshot. The screenshots' original simulation banners are retained.

## Scenes and provenance

Seven still scenes, five seconds each, in this order:

| Time | Screenshot | SHA-256 | Caption meaning |
|---|---|---|---|
| 00:00–00:05 | `docs/visual/phase3/home-final-1440.png` | `9294b9b8a65c596f534255dc461ddd0727a153fb1f1f3dcec62d77b0f0100836` | Public home visual; synthetic fixture label. |
| 00:05–00:10 | `docs/visual/phase2/dashboard-final-1440.png` | `6dcaadad01ec1304a702bd86d7f1a2940b9e28eb5b48b33b7a0358cffa34b8f0` | Dashboard layout; records are synthetic. |
| 00:10–00:15 | `docs/visual/phase2/leads-final-1440.png` | `a5ea9d4a6390b385c4a83f3d456824ad200efb6ca72c6ef0074bedb457de82ae` | Lead list; no live data or mutation. |
| 00:15–00:20 | `docs/visual/phase2/properties-final-1440.png` | `9428df20c19e32cb6c1b8a2d69e79d353cc5e258685a3a1c0a8f83107b069976` | Property view; persistence is not demonstrated. |
| 00:20–00:25 | `docs/visual/phase3/messages-populated-1440.png` | `9cd1fe4e7f809fc739b71379ad554f95c5384750d91dad2432625a97526878fe` | Synthetic conversation; sending is not demonstrated. |
| 00:25–00:30 | `docs/visual/phase3/login-final-1440.png` | `1deb77a6840735c71a5d877a2d8753aac4cb50a3b159c06426c8fa00d96c3764` | Login screen only; no authenticated session/OAuth. |
| 00:30–00:35 | `docs/visual/phase3/settings-final-1440.png` | `9e0ad2b74fcaecdc50b23a1f4b273ad23bc6cca543479df625751be5e8e5ba99` | Settings view; no provider connection is demonstrated. |

Scene source manifests (paths are repository-relative):

| Manifest | SHA-256 |
|---|---|
| `docs/visual/phase3/screenshot-manifest.json` | `788984e57b732e48ec68d2ee34d83952a5b181da98805e88f037d260b16eab35` |
| `docs/visual/phase3/source.sha256` | `f63b08601d7d0c8c150cd2d55e36d09e5449b97a99db6b3d148592ee3d6545fb` |
| `docs/visual/phase2/evidence.json` | `4b175041de31a7f5632c7600b9ed09d699783a31376dda06747adf74e4f4db44` |

The source evidence labels these captures SIMULATED-visual / NOT E2E. Phase 2 supplies dashboard/leads/properties screenshots; phase 3 supplies home/messages/login/settings. No screenshot or evidence file was changed to make this video.

## Reproduction and validation

Requirements: Python 3 standard library, `ffmpeg`/`ffprobe` with libx264 and drawtext support, and `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`. No Pillow or Python package is used. From repository root:

```sh
python3 docs/demo/generate.py
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames -of json docs/demo/walkthrough.mp4
ffmpeg -hide_banner -loglevel error -threads 1 -i docs/demo/walkthrough.mp4 -f null -
```

The script prints the exact ffmpeg argument arrays. It encodes each 1440×1000 still serially for five seconds, using `-loop 1 -framerate 24 -t 5`, then scales without cropping and places the image in a 1440×1240 canvas. Header/title/caption are drawn in margins outside the screenshot. Encoding uses `-an -c:v libx264 -preset ultrafast -crf 30 -threads 1 -pix_fmt yuv420p -movflags +faststart`; the seven segments are concatenated with the ffmpeg concat demuxer and `-c copy -movflags +faststart`. Poster extraction takes the first frame of scene 1. Temporary work and machine-readable input/output hashes are retained under `.interim-audit/worker-media/`; generated MP4/JPEG are in `docs/demo/`.

Recorded generation command: `python3 docs/demo/generate.py` (exit 0). Full decode command above exited 0. Final `ffprobe` result: H.264, 1440×1240, yuv420p, 24/1 fps, 840 frames, 35.000000 seconds, silent (no audio stream), 932,403 bytes, 213,120 bit/s. The output is well below the 10 MB target. MP4 SHA-256: `7714516dfa27cb9156d80996a809138483a906d166ca6a2ca216fc804cf57f4d`. Poster SHA-256: `8ece45886238a4713fbbaafec29da020b6ed5a91a22a10b6a89e1e6f22b996ce` (1440×1240 JPEG). Poster visibly includes the real home screenshot, persistent labels, the original simulation banner, and the credited editorial image. The supervisor separately reran ffprobe and full decoding (both exit 0), verified the MP4 `moov` atom precedes `mdat` (faststart), and visually inspected one decoded frame from every scene plus the actual poster. All seven frames retain a readable, unclipped synthetic/not-authenticated-E2E header and truthful captions; the login form is empty, CRM identities are labelled synthetic, and the photograph credit remains visible. This is visual inspection of representative frames, not every frame or authenticated workflow acceptance. Exact candidate commit/tree and file hashes are bound in the native same-card review handoff; independent reviewer approval is still required.

Reproduction is deterministic in scene order and timings, but H.264 byte-for-byte output may vary with ffmpeg builds. Existing demo outputs are regenerated by the script; preserve screenshots and audit evidence. The source photograph is the separately documented CC0 editorial image, not a customer listing; see [image credits](../IMAGE-CREDITS.md).
