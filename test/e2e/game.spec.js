import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { compareReference } from '../../scripts/compare-reference.mjs';

function watchRuntime(page) {
  const issues = [];
  page.on('console', (message) => {
    const location = message.location().url ?? '';
    const failedRequestMessage = message.text().includes('Failed to load resource: net::ERR_FAILED');
    if (message.type() === 'error' && !failedRequestMessage) issues.push(`console: ${message.text()} ${location}`);
  });
  page.on('pageerror', (error) => issues.push(`page: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/local-reference/')) issues.push(`response: ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? '';
    const expectedFallbackReplacementAbort = process.env.BLOCK_CRUSH_USE_LOCAL_REFERENCE
      && request.resourceType() === 'image'
      && error === 'net::ERR_ABORTED'
      && /\/assets\/(?:apple|pear|avocado|plum|cat-avatar|chest)\.svg$/.test(new URL(request.url()).pathname);
    if (!request.url().includes('/local-reference/') && !expectedFallbackReplacementAbort) {
      issues.push(`request: ${request.url()} ${error}`);
    }
  });
  return issues;
}

async function openGame(page, route = '/') {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

test.beforeEach(async ({ page }) => {
  // Private research packs are optional. Snapshot tests always exercise the
  // tracked fallback assets so the committed baseline works on a clean clone.
  if (!process.env.BLOCK_CRUSH_USE_LOCAL_REFERENCE) {
    await page.route('**/local-reference/**', (route) => route.abort());
  }
});

test('Level 1 has the observed opening structure and a stable visual baseline', async ({ page }, testInfo) => {
  const issues = watchRuntime(page);
  await openGame(page);
  await expect(page.locator('#level-label')).toHaveText('Level 1');
  await expect(page.getByRole('gridcell')).toHaveCount(64);
  await expect(page.locator('.goal-item')).toContainText('0/3');

  const state = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(state.chestProgress, 2);
  assert.equal(state.chestTarget, 500);
  assert.equal(state.board.filter((cell) => cell?.fruit === 'apple').length, 3);
  assert.equal(state.tray.length, 1);
  assert.equal(state.tray[0].slot, 0);

  const screenshotPath = testInfo.outputPath('level-one.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.locator('#game').screenshot({ path: screenshotPath, animations: 'disabled' });
  await expect(page.locator('#game')).toHaveScreenshot('level-one.png');

  if (process.env.BLOCK_CRUSH_REFERENCE) {
    const crop = process.env.BLOCK_CRUSH_REFERENCE_CROP ?? '142,82,575,998';
    const [left, top, width, height] = crop.split(',').map(Number);
    const ignores = (process.env.BLOCK_CRUSH_REFERENCE_IGNORE ?? '242,570,105,110;430,740,52,52')
      .split(';').filter(Boolean).map((region) => {
        const [left, top, width, height] = region.split(',').map(Number);
        return { left, top, width, height };
      });
    // Capture at the source game's pixel width so the comparison does not
    // count an upscaled 390px screenshot's interpolation as replica error.
    await page.setViewportSize({ width, height: Math.round(width * 844 / 390) });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction((sourceWidth) => Math.abs(document.querySelector('#game').getBoundingClientRect().width - sourceWidth) <= 1, width);
    const sourceViewportPath = testInfo.outputPath('source-viewport.png');
    await page.locator('#game').screenshot({ path: sourceViewportPath, animations: 'disabled' });
    const comparison = await compareReference({
      actualPath: sourceViewportPath,
      referencePath: process.env.BLOCK_CRUSH_REFERENCE,
      referenceCrop: { left, top, width, height },
      ignoreRegions: ignores,
      outputDir: testInfo.outputPath('reference-comparison'),
      maxDiffRatio: process.env.BLOCK_CRUSH_MAX_DIFF_RATIO === undefined
        ? undefined
        : Number(process.env.BLOCK_CRUSH_MAX_DIFF_RATIO),
    });
    await testInfo.attach('source-frame-overlay', { path: comparison.artifacts.overlayPng, contentType: 'image/png' });
    console.log(`Source-frame pixel difference: ${(comparison.diffRatio * 100).toFixed(2)}% after crop/scale/masks.`);
    assert.ok(comparison.passed, `Source-frame diff ${(comparison.diffRatio * 100).toFixed(2)}% exceeds BLOCK_CRUSH_MAX_DIFF_RATIO.`);
  }

  assert.deepEqual(issues, []);
});

test('sampled Level 4 plum and Level 7 post-clear frames render their recorded states', async ({ page }) => {
  const issues = watchRuntime(page);
  await openGame(page, '/?studyLevel=4');
  await expect(page.locator('#level-label')).toHaveText('Level 4');
  await expect(page.locator('.goal-item')).toContainText('0/2');
  await expect(page.locator('#chest-count')).toHaveText('947/1500');
  await expect(page.getByRole('button', { name: 'blue bar piece, 3 blocks' })).toBeVisible();
  const levelFour = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(levelFour.objectives[0].kind, 'plum');
  await expect(page.locator('#game')).toHaveScreenshot('level-four.png');

  await openGame(page, '/?studyLevel=7&studyFrame=pear-complete');
  await expect(page.locator('#level-label')).toHaveText('Level 7');
  await expect(page.locator('.goal-item').nth(0)).toContainText('2/2');
  await expect(page.locator('.goal-item').nth(1)).toContainText('2/3');
  await expect(page.locator('#chest-count')).toHaveText('2275/3000');
  await expect(page.getByRole('button', { name: 'blue long bar piece, 4 blocks' })).toBeVisible();
  const levelSeven = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(levelSeven.board.filter((cell) => cell?.fruit === 'apple').length, 2);
  assert.equal(levelSeven.objectives[0].collected, 2);
  await expect(page.locator('#game')).toHaveScreenshot('level-seven-pear-complete.png');
  assert.deepEqual(issues, []);
});

test('real clicks place a block, reject an overlap, and restart without stale state', async ({ page }, testInfo) => {
  const issues = watchRuntime(page);
  await openGame(page);
  await page.getByRole('gridcell', { name: 'Row 1, column 1: empty' }).click();
  await expect(page.getByRole('gridcell', { name: 'Row 1, column 1: green block with apple' })).toBeVisible();
  await expect(page.locator('#chest-count')).toHaveText('3/500');

  const afterPlace = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(afterPlace.moves, 1);
  assert.equal(afterPlace.board[0].fruit, 'apple');
  assert.equal(afterPlace.tray.length, 3);
  const screenshotPath = testInfo.outputPath('level-one-after-place.png');
  await page.locator('#game').screenshot({ path: screenshotPath, animations: 'disabled' });

  await page.getByRole('button', { name: /piece,/ }).first().click();
  await page.getByRole('gridcell', { name: 'Row 1, column 1: green block with apple' }).click();
  await expect(page.getByRole('status')).toContainText('That block does not fit.');
  const afterInvalid = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.deepEqual(afterInvalid.board, afterPlace.board);
  assert.equal(afterInvalid.moves, afterPlace.moves);

  await page.keyboard.press('r');
  const afterRestart = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(afterRestart.moves, 0);
  assert.equal(afterRestart.board[0], null);
  assert.equal(afterRestart.chestProgress, 3);
  assert.deepEqual(issues, []);
});

test('a legal input sequence clears a row, collects a fruit, and runs the feedback effects', async ({ page }, testInfo) => {
  const issues = watchRuntime(page);
  await openGame(page);

  // Fixed opening seed: the starter apple plus the following domino, domino,
  // and three-cell bar complete the first row using ordinary UI clicks.
  await page.getByRole('gridcell', { name: 'Row 1, column 1: empty' }).click();
  await page.getByRole('button', { name: 'yellow domino piece, 2 blocks' }).click();
  await page.getByRole('gridcell', { name: 'Row 1, column 2: empty' }).click();
  await page.getByRole('button', { name: 'green domino piece, 2 blocks' }).click();
  await page.getByRole('gridcell', { name: 'Row 1, column 4: empty' }).click();
  await page.getByRole('button', { name: 'green bar piece, 3 blocks' }).click();
  await page.getByRole('gridcell', { name: 'Row 1, column 6: empty' }).click();

  await expect(page.locator('.goal-count')).toHaveText('1/3');
  await expect(page.locator('#effects .line-beam')).toHaveCount(1);
  await expect(page.locator('#effects .flying-fruit')).toHaveCount(1);
  await expect(page.locator('#effects .board-glow')).toHaveCount(1);
  const effectAnimations = await page.evaluate(() => Object.fromEntries(
    ['.line-beam', '.flying-fruit', '.board-glow'].map((selector) => {
      const style = getComputedStyle(document.querySelector(`#effects ${selector}`));
      return [selector, { name: style.animationName, duration: style.animationDuration }];
    }),
  ));
  assert.deepEqual(effectAnimations, {
    '.line-beam': { name: 'line-beam', duration: '0.65s' },
    '.flying-fruit': { name: 'apple-flight', duration: '0.72s' },
    '.board-glow': { name: 'board-glow', duration: '0.78s' },
  });
  const cleared = await page.evaluate(() => window.blockCrushStudy.snapshot);
  assert.equal(cleared.moves, 4);
  assert.equal(cleared.combo, 1);
  assert.equal(cleared.apples, 1);
  assert.equal(cleared.board.slice(0, 8).filter(Boolean).length, 0);
  assert.ok(cleared.audio.cuesPlayed.place > 0);
  assert.ok(cleared.audio.cuesPlayed.clear > 0);
  assert.ok(cleared.audio.cuesPlayed.apple > 0);

  const effectsPath = testInfo.outputPath('level-one-clear-effects.png');
  await page.locator('#game').screenshot({ path: effectsPath, animations: 'allow' });
  await page.waitForTimeout(1_050);
  await expect(page.locator('#effects').locator('>*')).toHaveCount(0);
  assert.deepEqual(issues, []);
});

test('browser audio starts from a user gesture and honors music and effects switches', async ({ page }) => {
  const issues = watchRuntime(page);
  await openGame(page);
  const idleAudio = await page.evaluate(() => window.blockCrushStudy.snapshot.audio);
  assert.equal(idleAudio.contextState, 'not-created', 'audio must stay silent until the first user gesture');
  assert.equal(idleAudio.musicVoicesScheduled, 0);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.locator('#modal h2')).toHaveText('Settings');

  const started = await page.evaluate(() => window.blockCrushStudy.snapshot.audio);
  assert.equal(started.contextState, 'running');
  assert.ok(started.musicVoicesScheduled > 0, 'music scheduler should create real Web Audio voices after the gesture');
  assert.ok(started.cuesPlayed.button > 0, 'the settings gesture should trigger the button sound');
  if (process.env.BLOCK_CRUSH_USE_LOCAL_REFERENCE) {
    await expect.poll(() => page.evaluate(() => window.blockCrushStudy.snapshot.audio.loadedSamples))
      .toEqual(['apple', 'button', 'clear', 'place', 'win']);
  }

  await page.locator('[data-action="toggle-music"]').click();
  await expect(page.locator('[data-action="toggle-music"]')).toHaveText('OFF');
  const musicOff = await page.evaluate(() => window.blockCrushStudy.snapshot.audio.musicVoicesScheduled);
  await page.waitForTimeout(360);
  assert.equal(await page.evaluate(() => window.blockCrushStudy.snapshot.audio.musicVoicesScheduled), musicOff);

  await page.locator('[data-action="toggle-music"]').click();
  await expect(page.locator('[data-action="toggle-music"]')).toHaveText('ON');
  await expect.poll(() => page.evaluate(() => window.blockCrushStudy.snapshot.audio.musicVoicesScheduled)).toBeGreaterThan(musicOff);

  const effectsBefore = await page.evaluate(() => window.blockCrushStudy.snapshot.audio.cuesPlayed.button);
  await page.locator('[data-action="toggle-effects"]').click();
  await expect(page.locator('[data-action="toggle-effects"]')).toHaveText('OFF');
  const effectsOff = await page.evaluate(() => window.blockCrushStudy.snapshot.audio);
  assert.equal(effectsOff.effectsEnabled, false);
  assert.equal(effectsOff.cuesPlayed.button, effectsBefore, 'turning effects off should not emit another button cue');

  await page.locator('[data-action="toggle-effects"]').click();
  await expect(page.locator('[data-action="toggle-effects"]')).toHaveText('ON');
  const effectsOn = await page.evaluate(() => window.blockCrushStudy.snapshot.audio);
  assert.equal(effectsOn.effectsEnabled, true);
  assert.ok(effectsOn.cuesPlayed.button > effectsOff.cuesPlayed.button);
  assert.deepEqual(issues, []);
});
