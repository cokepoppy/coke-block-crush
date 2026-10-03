# Audio reconstruction

Use this when the requested replica includes sound effects, ambience, or background music.

## Observe before authoring

Confirm whether the source has an audio track and whether it contains game audio, narration, music added by the uploader, device noise, or platform sounds. The soundtrack of a social video is mixed evidence: distinguish an audible event from a verified in-game asset. If possible, compare several instances of the same visual trigger; a repeated short cue aligned with each trigger is stronger evidence than one occurrence.

For local media, make a lossless working copy of the audio without altering the original:

```bash
ffmpeg -hide_banner -loglevel error -i "$VIDEO" -map 0:a:0 -vn -ac 2 -ar 48000 -c:a pcm_s16le "$AUDIO_WAV"
```

Log audio observations alongside visual frames:

| Cue | Trigger and source time | Audible onset/length | Timbre, pitch, envelope | Overlap/ducking | Grade | Asset/implementation |
|---|---|---|---|---|---|---|
| placement | block lands, `00:12.34` | `+0.04 s`, about `0.2 s` | short bright impact, fast decay | under music | inferred | `place` cue |

For music, note the presence of intro, steady loop, loop boundary, rhythm, instrumentation, loudness, and transitions (menu/play/pause/win/lose). For effects, check onset relative to the visual trigger, attack/decay, pitch variation, stereo position, and whether fast repeated inputs overlap or restart the same voice. Keep measurements approximate when the video mix or seek precision is poor.

## Build and verify

- Choose a source asset, an original generated asset, or synthesis according to the requested fidelity and available evidence. Record provenance and edits. A generated cue is an approximation unless comparison proves otherwise.
- Centralize cue names and trigger rules so the same event does not play twice through rendering and state code. Schedule audio against the same event clock as animation; audible onset matters more than merely calling `play()` at the right line of code.
- Prepare browser audio after user interaction. Provide a mute control and persist its setting if the game already has settings. Pause or attenuate on visibility loss and modal pause as appropriate; stop old music and effect voices when restarting. Check rapid tap, overlapping clears, level change, and reduced-motion modes.
- Record the local game output for the same action sequence, then listen at matched level and compare the waveform or spectrogram around cue onsets and loop seams. Quantitative plots can locate timing and gross frequency errors; listening is required for timbre, balance, and distracting clicks.

If the reference audio is absent, muted, or mixed beyond identification, record that limit in the evidence ledger. The deliverable can still include working original BGM and effects, with fidelity claims limited to what was observable.
