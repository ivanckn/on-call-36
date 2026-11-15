#!/usr/bin/env bash
# Assembles the recorded frames into the demo video.
# Usage: scripts/make-demo-video.sh <framesDir> <narration audio, or - for a silent video> <outDir>
# Silent: writes on-call-36-demo-4k.mp4 (frame size as recorded) and on-call-36-demo-1080p.mp4.
# With narration: writes on-call-36-demo.mp4 and on-call-36-demo-subtitled.mp4 (burnt-in Chinese subtitles).
set -euo pipefail
FRAMES="$1"; AUDIO="$2"; OUT="$3"
FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
# Constant 30 fps: output frame k shows the latest screencast frame captured at or before k/30 s.
python3 - "$FRAMES" <<'PY'
import os, re, sys
d = sys.argv[1]
src = [l for l in open(os.path.join(d, "frames.txt")).read().split("\n") if l]
files, durs = [], []
for l in src:
    if l.startswith("file "): files.append(re.findall(r"'(.+)'", l)[0])
    elif l.startswith("duration "): durs.append(float(l.split()[1]))
starts, t = [], 0.0
for x in durs: starts.append(t); t += x
end = t
cfr = os.path.join(d, "cfr"); os.makedirs(cfr, exist_ok=True)
for f in os.listdir(cfr): os.remove(os.path.join(cfr, f))
j, k = 0, 0
while k / 30 < end:
    while j + 1 < len(starts) and starts[j + 1] <= k / 30: j += 1
    os.symlink(os.path.join(d, files[j]), os.path.join(cfr, f"{k:06d}.jpg")); k += 1
print(f"{k} frames at 30 fps, {end:.2f}s")
PY
X264="-c:v libx264 -preset slow -crf 14 -tune animation -pix_fmt yuv420p -movflags +faststart"
if [ "$AUDIO" = "-" ]; then
  $FF -y -loglevel error -framerate 30 -i "$FRAMES/cfr/%06d.jpg" $X264 -profile:v high -level 5.1 "$OUT/on-call-36-demo-4k.mp4"
  $FF -y -loglevel error -i "$OUT/on-call-36-demo-4k.mp4" -vf "scale=1920:1080:flags=lanczos" $X264 -crf 12 "$OUT/on-call-36-demo-1080p.mp4"
else
  $FF -y -loglevel error -framerate 30 -i "$FRAMES/cfr/%06d.jpg" $X264 "$OUT/demo-silent.mp4"
  # Narration: normalise loudness; the video is a little longer than the voice, so pad with silence.
  $FF -y -loglevel error -i "$OUT/demo-silent.mp4" -i "$AUDIO" -map 0:v -map 1:a -c:v copy \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11,apad" -c:a aac -b:a 160k -shortest "$OUT/on-call-36-demo.mp4"
  $FF -y -loglevel error -i "$OUT/on-call-36-demo.mp4" -vf "ass=$HERE/demo-subtitles.zh.ass" $X264 -c:a copy "$OUT/on-call-36-demo-subtitled.mp4"
  rm "$OUT/demo-silent.mp4"
fi
ls -la "$OUT"
