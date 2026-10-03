const MUSIC_SETTING = 'coke-block-crush.musicEnabled';
const EFFECTS_SETTING = 'coke-block-crush.effectsEnabled';
const BPM = 112;
const STEP_SECONDS = 60 / BPM / 2;
const LOOKAHEAD_SECONDS = 0.22;

const CHORDS = [
  { bass: 48, notes: [60, 64, 67], melody: [72, 74, 76, 79] }, // C
  { bass: 45, notes: [57, 60, 64], melody: [69, 72, 76, 79] }, // Am
  { bass: 41, notes: [53, 57, 60], melody: [69, 72, 74, 77] }, // F
  { bass: 43, notes: [55, 59, 62], melody: [67, 71, 74, 79] }, // G
];
const MELODY_STEPS = [0, null, 1, null, 2, 1, null, 3, 2, null, 1, 0, null, 1, 2, null];
const MIN_CUE_GAP = { button: 0.045, place: 0.04, invalid: 0.12, clear: 0.09, apple: 0.09, win: 0.5, lose: 0.5 };
const LOCAL_SAMPLES = ['button', 'place', 'clear', 'apple', 'win'];

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function readSetting(key) {
  try {
    return globalThis.localStorage?.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function saveSetting(key, enabled) {
  try {
    globalThis.localStorage?.setItem(key, String(enabled));
  } catch {
    // Private browsing and restricted frames may disable storage.
  }
}

/** Procedural music and effects. Call start() from a pointer or keyboard gesture. */
export class AudioEngine {
  constructor() {
    this.musicEnabled = readSetting(MUSIC_SETTING);
    this.effectsEnabled = readSetting(EFFECTS_SETTING);
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.musicTimer = null;
    this.nextStepAt = 0;
    this.step = 0;
    this.sources = new Set();
    this.musicSources = new Set();
    this.lastCueAt = new Map();
    this.samples = new Map();
    this.sampleLoadStarted = false;
    this.disposed = false;
    this.handleVisibilityChange = () => this.syncVisibility();
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  get ready() {
    return !!this.context && this.context.state === 'running' && !this.disposed;
  }

  async start() {
    if (this.disposed) return false;
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return false;
      try {
        this.context = new Context();
      } catch {
        return false;
      }
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.effectsBus = this.context.createGain();
      this.master.gain.value = globalThis.document?.hidden ? 0 : 0.8;
      this.musicBus.gain.value = this.musicEnabled ? 0.38 : 0;
      this.effectsBus.gain.value = this.effectsEnabled ? 0.52 : 0;
      this.musicBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(this.context.destination);
    }
    try {
      if (this.context.state !== 'running') await this.context.resume();
    } catch {
      return false;
    }
    if (this.disposed) return false;
    this.syncVisibility();
    if (!this.sampleLoadStarted) void this.loadLocalSamples();
    return this.ready;
  }

  async loadLocalSamples() {
    this.sampleLoadStarted = true;
    if (typeof this.context?.decodeAudioData !== 'function' || !globalThis.location?.protocol?.startsWith('http')) return;
    await Promise.all(LOCAL_SAMPLES.map(async (name) => {
      try {
        const response = await fetch(`/local-reference/audio/${name}.wav`, { cache: 'force-cache' });
        if (!response.ok || !response.headers.get('content-type')?.includes('audio')) return;
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) this.samples.set(name, buffer);
      } catch {
        // A public checkout has no extracted reference pack; synthesis remains playable.
      }
    }));
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = Boolean(enabled);
    saveSetting(MUSIC_SETTING, this.musicEnabled);
    if (this.musicBus && this.context) {
      this.ramp(this.musicBus.gain, this.musicEnabled ? 0.38 : 0, 0.045);
      if (this.musicEnabled) this.startMusic();
      else this.stopMusic();
    }
    return this.musicEnabled;
  }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = Boolean(enabled);
    saveSetting(EFFECTS_SETTING, this.effectsEnabled);
    if (this.effectsBus) this.ramp(this.effectsBus.gain, this.effectsEnabled ? 0.52 : 0, 0.025);
    return this.effectsEnabled;
  }

  toggleMusic() {
    return this.setMusicEnabled(!this.musicEnabled);
  }

  toggleEffects() {
    return this.setEffectsEnabled(!this.effectsEnabled);
  }

  ramp(parameter, value, seconds) {
    if (!this.context) return;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + seconds);
  }

  syncVisibility() {
    if (!this.context || this.disposed) return;
    const hidden = Boolean(globalThis.document?.hidden);
    this.ramp(this.master.gain, hidden ? 0 : 0.8, 0.04);
    if (hidden) {
      this.stopMusic();
    } else if (this.context.state === 'running') {
      this.startMusic();
    } else {
      // Some browsers suspend hidden pages; resume only an already unlocked context.
      void this.context.resume().then(() => {
        if (!this.disposed && !globalThis.document?.hidden) this.startMusic();
      }).catch(() => {});
    }
  }

  startMusic() {
    if (!this.ready || !this.musicEnabled || globalThis.document?.hidden || this.musicTimer) return;
    this.step = 0;
    this.nextStepAt = this.context.currentTime + 0.06;
    this.scheduleMusic();
    this.musicTimer = globalThis.setInterval(() => this.scheduleMusic(), 75);
  }

  stopMusic() {
    if (this.musicTimer) globalThis.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (!this.context) return;
    const end = this.context.currentTime + 0.04;
    for (const source of this.musicSources) {
      try { source.stop(end); } catch { /* Already stopped. */ }
    }
    this.musicSources.clear();
  }

  scheduleMusic() {
    if (!this.ready || !this.musicEnabled || globalThis.document?.hidden) return;
    const now = this.context.currentTime;
    if (this.nextStepAt < now - STEP_SECONDS) {
      const missed = Math.floor((now - this.nextStepAt) / STEP_SECONDS) + 1;
      this.step += missed;
      this.nextStepAt += missed * STEP_SECONDS;
    }
    while (this.nextStepAt < now + LOOKAHEAD_SECONDS) {
      this.scheduleMusicStep(this.step, this.nextStepAt);
      this.step += 1;
      this.nextStepAt += STEP_SECONDS;
    }
  }

  scheduleMusicStep(step, at) {
    const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
    const withinBar = step % 16;
    if (withinBar === 0 || withinBar === 8) {
      this.tone({ frequency: midiFrequency(chord.bass), at, duration: 0.48, volume: 0.11, type: 'sine', music: true });
    }
    if (withinBar % 4 === 0) {
      const note = chord.notes[(withinBar / 4) % chord.notes.length];
      this.tone({ frequency: midiFrequency(note), at, duration: 0.30, volume: 0.038, type: 'triangle', music: true });
    }
    const melodyIndex = MELODY_STEPS[withinBar];
    if (melodyIndex !== null) {
      const note = chord.melody[melodyIndex];
      this.tone({ frequency: midiFrequency(note), at, duration: 0.18, volume: 0.032, type: 'sine', music: true });
    }
  }

  tone({ frequency, endFrequency = frequency, at, duration, volume, type = 'sine', music = false }) {
    if (!this.context || this.disposed) return;
    const start = Math.max(at, this.context.currentTime);
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.012, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(music ? this.musicBus : this.effectsBus);
    this.sources.add(oscillator);
    if (music) this.musicSources.add(oscillator);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      this.musicSources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);
  }

  /** Names: place, invalid, clear, apple, win, button, lose. */
  play(name, { delay = 0 } = {}) {
    if (!this.ready || !this.effectsEnabled || globalThis.document?.hidden) return false;
    const cue = ({ placed: 'place', cleared: 'clear', won: 'win', lost: 'lose' })[name] || name;
    if (!(cue in MIN_CUE_GAP)) return false;
    const at = this.context.currentTime + Math.max(0, delay);
    if (at - (this.lastCueAt.get(cue) ?? -Infinity) < MIN_CUE_GAP[cue]) return false;
    this.lastCueAt.set(cue, at);

    const sample = this.samples.get(cue);
    if (sample) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = sample;
      gain.gain.value = cue === 'win' ? 0.38 : cue === 'clear' ? 0.48 : 0.58;
      source.connect(gain);
      gain.connect(this.effectsBus);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start(at);
      return true;
    }

    const note = (frequency, duration, volume, offset = 0, type = 'sine', endFrequency = frequency) =>
      this.tone({ frequency, endFrequency, at: at + offset, duration, volume, type });
    switch (cue) {
      case 'button':
        note(640, 0.055, 0.09, 0, 'sine', 480);
        break;
      case 'place':
        note(390, 0.12, 0.18, 0, 'triangle', 230);
        note(780, 0.07, 0.055, 0.012, 'sine', 550);
        break;
      case 'invalid':
        note(245, 0.19, 0.12, 0, 'triangle', 150);
        note(185, 0.14, 0.045, 0.02, 'sine', 130);
        break;
      case 'clear':
        [523, 659, 784, 1047].forEach((frequency, index) => note(frequency, 0.20, 0.11, index * 0.052, 'triangle'));
        break;
      case 'apple':
        note(880, 0.13, 0.08);
        note(1320, 0.20, 0.10, 0.075);
        note(1760, 0.27, 0.065, 0.145);
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((frequency, index) => note(frequency, 0.30, 0.12, index * 0.12, 'triangle'));
        note(523, 0.62, 0.09, 0.60);
        note(784, 0.62, 0.075, 0.60);
        break;
      case 'lose':
        note(392, 0.21, 0.10);
        note(311, 0.22, 0.10, 0.16);
        note(196, 0.36, 0.09, 0.32);
        break;
    }
    return true;
  }

  /** Feed this one event at a time from src/engine.js; do not also play the same cue manually. */
  playEvent(event) {
    if (!event) return;
    if (event.type === 'hammer') {
      this.play('button');
      if (event.apples) this.play('apple', { delay: 0.07 });
      return;
    }
    if (event.type === 'cleared') {
      this.play('clear');
      if (event.apples) this.play('apple', { delay: 0.14 });
      return;
    }
    if (event.type === 'rainbow') {
      this.play('clear');
      if (event.apples) this.play('apple', { delay: 0.14 });
      return;
    }
    this.play(event.type);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.stopMusic();
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    this.sources.clear();
    this.musicSources.clear();
    this.lastCueAt.clear();
    this.samples.clear();
    const context = this.context;
    this.context = null;
    this.musicBus?.disconnect();
    this.effectsBus?.disconnect();
    this.master?.disconnect();
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* The page may be shutting down. */ }
    }
  }
}

export default AudioEngine;
