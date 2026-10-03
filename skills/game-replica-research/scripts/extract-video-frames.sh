#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <video-file> <new-output-directory>" >&2
  exit 2
fi

video=$1
out_dir=$2

if [[ ! -f "$video" ]]; then
  echo "Video file not found: $video" >&2
  exit 2
fi
if [[ -e "$out_dir" ]]; then
  echo "Output path already exists; choose a new directory: $out_dir" >&2
  exit 2
fi
for tool in ffprobe ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required command not found: $tool" >&2
    exit 127
  fi
done

mkdir -p "$out_dir"
ffprobe -v error \
  -show_entries format=duration:stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate \
  -of json "$video" > "$out_dir/source-info.json"

# passthrough preserves every decoded source frame; no fps= filter resamples it.
ffmpeg -hide_banner -i "$video" -vf showinfo -fps_mode passthrough \
  "$out_dir/frame-%06d.png" 2> "$out_dir/ffmpeg-showinfo.log"

printf 'Frame images: %s/frame-*.png\nMetadata: %s/source-info.json\nTimestamps: %s/ffmpeg-showinfo.log\n' \
  "$out_dir" "$out_dir" "$out_dir"
