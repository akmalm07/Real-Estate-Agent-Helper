#!/usr/bin/env python3
"""Build the labeled, screenshot-based demo using only Python stdlib and ffmpeg."""

import hashlib
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".interim-audit/worker-media"
OUT = ROOT / "docs/demo"
BASE = "0ba82333c58751f6cebb1ffbadce53b0227afb7e"
FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
SCENES = [
    ("docs/visual/phase3/home-final-1440.png", "Home", "Public home page; visual capture with synthetic fixture label."),
    ("docs/visual/phase2/dashboard-final-1440.png", "Dashboard", "Dashboard layout; records are synthetic visual fixtures."),
    ("docs/visual/phase2/leads-final-1440.png", "Leads", "Lead list presentation; no live CRM data or mutation."),
    ("docs/visual/phase2/properties-final-1440.png", "Properties", "Property view; no claim that records are persisted."),
    ("docs/visual/phase3/messages-populated-1440.png", "Messages", "Synthetic conversation view; sending is not demonstrated."),
    ("docs/visual/phase3/login-final-1440.png", "Login", "Login screen only; no authenticated session or OAuth."),
    ("docs/visual/phase3/settings-final-1440.png", "Settings", "Settings presentation; no provider connection is demonstrated."),
]
LABEL = "SCREENSHOT WALKTHROUGH | SYNTHETIC VISUAL FIXTURES | NOT AUTHENTICATED E2E"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args: list[str]) -> None:
    print("$ " + " ".join(map(str, args)), flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")
    if not FONT.is_file():
        raise SystemExit(f"Required readable font not found: {FONT}")
    WORK.mkdir(parents=True, exist_ok=True)
    inputs = []
    for image, title, caption in SCENES:
        path = ROOT / image
        if not path.is_file():
            raise SystemExit(f"Missing screenshot: {image}")
        inputs.append({"path": image, "sha256": sha256(path), "title": title, "caption": caption})

    # Each still is encoded in its own ffmpeg process to keep peak memory low.
    for index, scene in enumerate(SCENES):
        _, title, caption = scene
        segment = WORK / f"scene-{index + 1:02}.mp4"
        title_text = title.replace("'", "\\'")
        caption_text = caption.replace("'", "\\'")
        label_text = LABEL.replace("'", "\\'")
        vf = (
            "scale=1440:1000:flags=lanczos,pad=1440:1240:0:160:color=0x172820,"
            f"drawtext=fontfile={FONT}:text='{label_text}':fontcolor=white:fontsize=28:x=48:y=36,"
            f"drawtext=fontfile={FONT}:text='{title_text}':fontcolor=0xE3C995:fontsize=24:x=48:y=91,"
            f"drawtext=fontfile={FONT}:text='{caption_text}':fontcolor=white:fontsize=22:x=48:y=1182"
        )
        run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "24",
            "-t", "5", "-i", str(ROOT / SCENES[index][0]), "-vf", vf, "-an", "-c:v", "libx264",
            "-preset", "ultrafast", "-crf", "30", "-threads", "1", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-t", "5", str(segment),
        ])

    concat_file = WORK / "segments.txt"
    concat_file.write_text("".join(f"file '{(WORK / f'scene-{i:02}.mp4').as_posix()}'\n" for i in range(1, 8)), encoding="utf-8")
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
         "-c", "copy", "-movflags", "+faststart", str(OUT / "walkthrough.mp4")])
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(WORK / "scene-01.mp4"), "-frames:v", "1",
         "-q:v", "2", str(OUT / "poster.jpg")])

    manifest_paths = ["docs/visual/phase3/screenshot-manifest.json", "docs/visual/phase3/source.sha256", "docs/visual/phase2/evidence.json"]
    manifest = {
        "reviewed_base": BASE,
        "label": LABEL,
        "scene_duration_seconds": 5,
        "scene_count": len(SCENES),
        "input_screenshots": inputs,
        "source_manifests": [{"path": p, "sha256": sha256(ROOT / p)} for p in manifest_paths],
        "generation": {
            "script": "docs/demo/generate.py",
            "commands": "Printed exactly by the script; ffmpeg invoked serially per scene, then concat stream-copy and poster extraction.",
            "font": str(FONT),
            "video": "H.264, yuv420p, 1440x1240, 24 fps, silent, faststart",
            "temporary_work": ".interim-audit/worker-media/",
        },
        "outputs": {"video_sha256": sha256(OUT / "walkthrough.mp4"), "poster_sha256": sha256(OUT / "poster.jpg")},
    }
    (WORK / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    probe = subprocess.run([
        ffprobe, "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height,pix_fmt,r_frame_rate",
        "-of", "json", str(OUT / "walkthrough.mp4"),
    ], cwd=ROOT, check=True, capture_output=True, text=True)
    report = {"probe": json.loads(probe.stdout), "video_sha256": manifest["outputs"]["video_sha256"],
              "poster_sha256": manifest["outputs"]["poster_sha256"]}
    (WORK / "ffprobe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
