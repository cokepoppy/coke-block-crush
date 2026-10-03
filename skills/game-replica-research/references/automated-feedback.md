# Automated feedback loop

This repository runs a deterministic browser regression loop around its unit tests and production build.

## Run the suite

Install the browser once, then run all checks:

```bash
npx playwright install chromium
npm run test:feedback
```

The command runs engine unit tests, a Vite production build, and Playwright end-to-end tests at `390 × 844`. The browser tests open fixed game states, inspect the read-only `window.blockCrushStudy.snapshot`, place blocks through accessible controls, reject an overlap, clear a row, verify fruit counters and effects, restart, and check music/effect switching.

Playwright stores screenshots, browser logs, videos, and traces under `test-results/feedback/` when useful. This folder is ignored by Git. Tracked images in `test/e2e/game.spec.js-snapshots/` are local implementation-regression baselines; they are not source-game screenshots. Review a change before updating them:

```bash
npx playwright test --update-snapshots
```

## Compare a local state with source media

The opening-frame test accepts a private source screenshot path and crop. The current WeChat screenshot includes a play glyph and a touch marker over the board; the example masks only those two overlays and stops the crop before the player's scrubber covers the tray:

```bash
BLOCK_CRUSH_REFERENCE=/path/to/source-frame.png \
BLOCK_CRUSH_REFERENCE_CROP=142,82,575,833 \
BLOCK_CRUSH_REFERENCE_IGNORE='242,570,105,110;430,740,52,52' \
npm run test:e2e -- --grep 'Level 1 has'
```

Coordinates are `x,y,width,height` in the source image. The browser expands the game to the source crop's pixel width, then captures the top-aligned game region at that width before comparison; this avoids scaling up a 390px screenshot for a 575px reference. It writes `reference-crop.png`, `actual-aligned.png`, `pixel-difference.png`, `overlay-50.png`, and `comparison.json` under the test's output directory. The masks cover the player play glyph and the touch marker only when they obscure game content.

An optional failure threshold makes a source comparison a gate only after alignment and tolerance are reviewed:

```bash
BLOCK_CRUSH_REFERENCE=/path/to/source-frame.png \
BLOCK_CRUSH_REFERENCE_CROP=142,82,575,833 \
BLOCK_CRUSH_REFERENCE_IGNORE='242,570,105,110;430,740,52,52' \
BLOCK_CRUSH_MAX_DIFF_RATIO=0.08 \
npm run test:e2e -- --grep 'Level 1 has'
```

Do not generalize the sample coordinates or tolerance to another source, level, viewport, or build. If the source is a temporary user attachment, keep the copied/cropped working reference under `.research/` or another ignored directory rather than committing player UI or private metadata.

## Audio feedback limits

The automated test triggers a real user gesture and reads the running Web Audio context, cumulative scheduled music voices, accepted cue names, and toggle state through the read-only study snapshot. It verifies that music stops scheduling when muted and resumes when enabled. The browser test does not record or listen to rendered output; it cannot verify timbre, perceived loudness, clipping, or loop-seam quality. Keep those checks in the evidence ledger until matched-level listening or loopback recording is available.

On a machine with the ignored local research pack present, exercise its five candidate WAV samples through browser decode as well:

```bash
BLOCK_CRUSH_USE_LOCAL_REFERENCE=1 npm run test:e2e -- --grep 'browser audio'
```

This optional run verifies that `button`, `place`, `clear`, `apple`, and `win` samples load. Their original in-game event mapping still requires source-audio verification.
