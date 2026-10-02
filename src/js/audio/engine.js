// The synth: a mallet voice rendered once per semitone, an effects chain, and a
// limiter that keeps a fistful of simultaneous plucks from clipping.

import { RENDER_LO, RENDER_HI, LO, HI, STEP, FX_DEFAULTS } from '../config.js';
import { state, $, sval } from '../state.js';
import { mtof, ftom } from './tuning.js';

export let AC = null;
export let master = null;
export let out = null;          // the last node before the speakers
let bus = null, limiter = null;
const BUF = {}, GAIN = {};
let gridT0 = 0, voices = 0, crunch = null;
const slots = new Map();

export const isRunning = () => AC && AC.state === 'running';
export const audioTime = () => (AC ? AC.currentTime : 0);

/** A soft mallet voice: a sine with a few quiet overtones and a brief bell-like
 *  tine at the attack. */
function renderNote(midi) {
  const sr = AC.sampleRate, f = mtof(midi);
  const h = Math.max(0, Math.min(1.6, (midi - LO) / (HI - LO)));
  const dur = Math.max(0.25, 2.6 - 1.2 * h), len = Math.floor(sr * dur);
  const out = new Float32Array(len), tau = 0.75 + 0.9 * Math.max(0, 1 - h);
  const parts = [[1, 1], [2, 0.28], [3, 0.08], [4, 0.03]];
  for (let n = 0; n < len; n++) {
    const t = n / sr, att = Math.min(1, t / 0.008);
    let v = 0;
    for (const [k, a] of parts) {
      if (f * k > sr / 2) break;                 // no partials above Nyquist
      v += a * Math.exp(-t * Math.pow(k, 1.3) / tau) * Math.sin(2 * Math.PI * f * k * t);
    }
    v += 0.06 * Math.exp(-t / 0.018) * Math.sin(2 * Math.PI * f * 7.01 * t);
    out[n] = att * v;
  }
  let e = 0; const m = Math.min(len, Math.floor(sr * 0.4));
  for (let n = 0; n < m; n++) e += out[n] * out[n];
  const rms = Math.sqrt(e / m) || 1;
  // Equal loudness: the same energy for every note, plus a lift for the low
  // ones, which the ear hears as quieter.
  GAIN[midi] = (0.2 / rms) * Math.min(1.9, Math.pow(Math.max(f, 60) / 500, -0.32));
  const buf = AC.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  BUF[midi] = buf;
}

/** A gentle tanh knee. The limiter does the work; this only catches overshoot
 *  so a dense strum saturates smoothly instead of squaring off. */
function softClipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.4) / Math.tanh(1.4); }
  return c;
}

/** The curve late notes are driven into. Input past ±1 is held at the ends,
 *  so the harder a note is driven the more it squares off. */
function crunchCurve() {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.5) / Math.tanh(2.5); }
  return c;
}

export function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  crunch = crunchCurve();

  // Output stage: master trim, then a fast limiter, then a soft knee.
  const shaper = AC.createWaveShaper();
  shaper.curve = softClipCurve(); shaper.oversample = '2x';
  shaper.connect(AC.destination);
  out = shaper;

  limiter = AC.createDynamicsCompressor();
  limiter.threshold.value = -8; limiter.knee.value = 4; limiter.ratio.value = 16;
  limiter.attack.value = 0.002; limiter.release.value = 0.18;
  limiter.connect(shaper);

  master = AC.createGain();
  master.gain.value = +($('vol')?.value ?? FX_DEFAULTS.vol);
  master.connect(limiter);

  const dry = AC.createGain(); dry.gain.value = 1; dry.connect(master);

  // A stereo echo on the dotted eighth, the classic arp delay.
  const dl = AC.createDelay(2), dr = AC.createDelay(2);
  const fb = AC.createGain(), damp = AC.createBiquadFilter(), wet = AC.createGain();
  dl.delayTime.value = STEP * 3; dr.delayTime.value = STEP * 3;
  fb.gain.value = FX_DEFAULTS.fxFb; AC.fbG = fb;
  damp.type = 'lowpass'; damp.frequency.value = 2600;
  wet.gain.value = FX_DEFAULTS.fxEcho; AC.wetG = wet;
  const pl = AC.createStereoPanner(), pr = AC.createStereoPanner();
  pl.pan.value = -0.7; pr.pan.value = 0.7;
  dl.connect(damp).connect(pl).connect(wet);
  damp.connect(dr); dr.connect(pr).connect(wet); dr.connect(fb).connect(dl);
  wet.connect(master);

  const verb = AC.createConvolver(), len = AC.sampleRate * 3;
  const ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  verb.buffer = ir;
  const vg = AC.createGain(); vg.gain.value = FX_DEFAULTS.fxVerb;
  verb.connect(vg).connect(master);
  AC.verb = verb; AC.vg = vg;

  // A wooden body: warm low mids, a softer top.
  const body1 = AC.createBiquadFilter();
  body1.type = 'peaking'; body1.frequency.value = 210; body1.Q.value = 1.2;
  body1.gain.value = FX_DEFAULTS.fxBody; AC.body1 = body1;
  const top = AC.createBiquadFilter();
  top.type = 'lowpass'; top.frequency.value = FX_DEFAULTS.fxBright; AC.topF = top;
  const bodyChain = AC.createGain();
  bodyChain.connect(body1).connect(top).connect(dry);

  bus = AC.createGain();
  bus.connect(bodyChain); bus.connect(dl); bus.connect(verb);
  AC.bus = bus;

  for (let m = RENDER_LO; m <= RENDER_HI; m++) renderNote(m);
  gridT0 = AC.currentTime;
}

export function resetGrid() { if (AC) gridT0 = AC.currentTime; }

/** The next sixteenth-note slot, offset by `extra` seconds of drag. */
export function nextStep(extra) {
  const now = AC.currentTime + 0.03, k = Math.ceil((now - gridT0) / STEP);
  return { k, when: gridT0 + k * STEP + extra };
}

/** At most two notes land on any one sixteenth, so the texture stays legible. */
export function claimSlot(k, cap = 2) {
  const n = slots.get(k) || 0;
  if (n >= cap) return false;
  slots.set(k, n + 1);
  if (slots.size > 128) slots.delete(slots.keys().next().value);
  return true;
}

export function clearSlots() { slots.clear(); }

/** Play a frequency. Buffers exist per semitone, so the fractional part is
 *  taken by `detune`, which is what lets harmonics tuning play notes that are
 *  not on the twelve-tone grid at all. `dist` (0 to 1) drives the note into
 *  distortion. */
export function play(freq, when, pan, sourCents = 0, rough = false, amp = 1, dist = 0) {
  if (!AC || voices > 40) return;
  const m = ftom(freq);
  const base = Math.max(RENDER_LO, Math.min(RENDER_HI, Math.round(m)));
  if (!BUF[base]) return;
  const cents = (m - base) * 100;

  const src = AC.createBufferSource();
  src.buffer = BUF[base];
  src.detune.value = cents - sourCents;
  const g = AC.createGain();
  g.gain.value = GAIN[base] * amp;
  const p = AC.createStereoPanner();
  p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
  if (dist > 0.01) {
    // Drive, clip, then take the level back down: the note gets harsher, not louder.
    const pre = AC.createGain(), sh = AC.createWaveShaper(), post = AC.createGain();
    pre.gain.value = 1 + dist * 14;
    sh.curve = crunch;
    post.gain.value = 1 / (1 + dist * 1.8);
    src.connect(pre).connect(sh).connect(post).connect(g);
  } else {
    src.connect(g);
  }
  g.connect(p).connect(bus);

  if (rough) {                    // a second voice a little sharp: the two beat
    const s2 = AC.createBufferSource();
    s2.buffer = BUF[base];
    s2.detune.value = cents + sourCents * 0.8;
    const g2 = AC.createGain(); g2.gain.value = 0.7;
    s2.connect(g2).connect(g);
    s2.start(when);
    s2.onended = () => g2.disconnect();
  }
  voices++;
  src.onended = () => { voices--; p.disconnect(); };
  src.start(when);
}

/** A cancelled train: a dead click where its note should be. */
export function click(when, pan, amp = 1) {
  if (!AC) return;
  const n = AC.createBufferSource();
  const b = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.05), AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
  n.buffer = b;
  const f = AC.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
  const g = AC.createGain(); g.gain.value = 0.35 * amp;
  const p = AC.createStereoPanner(); p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
  n.connect(f).connect(g).connect(p).connect(bus);
  n.start(when);
  n.onended = () => p.disconnect();
}

/** Volume, or silence while muted: the map and the clock keep running. */
export function setVolume(v) {
  if (master) master.gain.setTargetAtTime(sval(state.muted ? 0 : v), AC.currentTime, 0.05);
}

export function applyFx() {
  if (!AC) return;
  const v = id => +($(id)?.value ?? FX_DEFAULTS[id]);
  const t = AC.currentTime;
  if (AC.vg) AC.vg.gain.setTargetAtTime(sval(v('fxVerb')), t, 0.1);
  if (AC.wetG) AC.wetG.gain.setTargetAtTime(sval(v('fxEcho')), t, 0.1);
  if (AC.fbG) AC.fbG.gain.setTargetAtTime(sval(v('fxFb')), t, 0.1);
  if (AC.topF) AC.topF.frequency.setTargetAtTime(sval(v('fxBright')), t, 0.1);
  if (AC.body1) AC.body1.gain.setTargetAtTime(sval(v('fxBody')), t, 0.1);
  setVolume(v('vol'));
}

/** How lateness is played, tuned so an ordinary day and a bad day differ. */
export function sourness(late) {
  const mx = +($('fxSour')?.value ?? FX_DEFAULTS.fxSour);
  return Math.min(mx, mx * Math.pow(Math.max(0, late) / 60, 0.7));
}
export function roughness(late) { return Math.max(0, late - 1) / 30; }
/** 0 to 1: how hard a late train's note is driven. A minute late is clean;
 *  forty minutes is as rough as the Distortion slider allows. */
export function distortion(late) {
  const mx = +($('fxDist')?.value ?? FX_DEFAULTS.fxDist);
  return mx * Math.pow(Math.min(1, Math.max(0, late - 1) / 40), 0.7);
}
