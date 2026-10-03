# Capture and comparison

Use this when a task calls for exact layout, timing, or motion comparison. Keep the source and the comparison state reproducible.

## Reference record

| Field | Capture |
|---|---|
| Source | URL or local file, uploader, capture date |
| Identity | game title, level, build if visible; conflicts with other sources |
| Video | duration, encoded resolution/frame rate, orientation, audio streams |
| Game crop | `x,y,width,height` within each source frame; exclude player and platform UI |
| Scenario | input sequence and starting state needed to reproduce the scene |

Browser seek/screenshot observations are valid, but name their time precision. A failed page extractor does not prove a video is inaccessible; try the user-visible browser. If only a still image is available, it can ground geometry and art, not gameplay transitions or sounds.

For a local video, inspect its streams before extracting frames:

```bash
ffprobe -v error -show_entries format=duration:stream=index,codec_type,width,height,r_frame_rate,sample_rate -of json "$VIDEO"
```

For a short clip, [scripts/extract-video-frames.sh](../scripts/extract-video-frames.sh) records stream metadata and exports every decoded frame with FFmpeg `showinfo` timestamps. It requires `ffmpeg` and `ffprobe`, takes a video path and a new output directory, and refuses to overwrite an existing directory. Review the generated frames by event; exporting every frame does not make each frame independently informative.

For a single accurately decoded frame, place `-ss` after `-i`:

```bash
ffmpeg -hide_banner -loglevel error -i "$VIDEO" -ss 00:00:12.340 -frames:v 1 "$OUT"
```

For all decoded source frames in a short event interval, retain source timestamps in the extraction log; do not resample with `fps=` and call the result source frames:

```bash
ffmpeg -hide_banner -i "$VIDEO" -vf "select='between(t,12.3,12.8)',showinfo" -fps_mode passthrough "$OUT_DIR/frame-%05d.png" 2> "$OUT_DIR/frames.log"
```

Variable-frame-rate recordings can have uneven time gaps. Save both presentation time and frame order. If a reference cannot be downloaded or exported, use browser playback with recorded seek times and state clearly that the samples are discrete.

## Event ledger

| Source time/frame | Input | Before → after | Position and layer | Motion phase and duration | Evidence grade | Implementation |
|---|---|---|---|---|---|---|
| `00:12.340` | tap block | score `20 → 30` | grid cell `(4,6)` | impact begins; duration unresolved | observed | clear transition |

Use `observed`, `inferred`, or `provisional`. If only start and end exist, describe a lower/upper duration bound or the observed change; do not invent an unseen middle frame. Keep measurements in source pixels plus normalized game-rectangle coordinates so viewport changes do not erase the evidence.

## Comparison loop

1. Reproduce the same game state and freeze or sample the same event phase.
2. Capture the local app at the reference game rectangle's aspect and pixel dimensions.
3. Align the game rectangle, then compare a 50% alpha overlay and absolute-difference image. Exclude only known external chrome, not hard game regions.
4. Sort differences by size and salience: board geometry and large backgrounds first, then icons/text, then effects and subframe motion. Record each correction with a new same-state capture.
5. Confirm behavior with normal pointer/touch input. Screenshot similarity cannot verify rules, and a passing interaction cannot verify pixel alignment.

Record the source frame, local capture, viewport, state, and comparison result together. Avoid a blanket “pixel-perfect” claim when source resolution, compression, font, or frame phase leaves visible uncertainty.
