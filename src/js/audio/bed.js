// The bed: one held chord carrying the state of the whole network.
// Loudness and brightness follow how many trains are moving; steadiness follows
// how many are late right now; missing voices are cancellations; the stereo
// lean is where the traffic sits on the map.

import { FX_DEFAULTS } from '../config.js';
import { state, $, sval } from '../state.js';
import { AC, master } from './engine.js';
import { chordAt, mtof } from './tuning.js';

let BED = null;

/** Root, fifth, third, ninth, sixth — spread upward from the bottom of the map. */
function voicing(ch) {
  const order = [ch.root % 12, ch.pcs[2], ch.pcs[1], ch.pcs[3], ch.pcs[4]], out = [];
  let m = 38; while (m % 12 !== order[0]) m++;
  out.push(m);
  for (let i = 1; i < order.length; i++) {
    let n = out[i - 1] + (i === 1 ? 3 : 2);
    while (n % 12 !== order[i]) n++;
    out.push(n);
  }
  return out;
}

export function initBed() {
  if (BED || !AC) return;
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.4;
  const out = AC.createGain(); out.gain.value = 0;
  lp.connect(out); out.connect(master);
  const send = AC.createGain(); send.gain.value = 0.6;
  out.connect(send).connect(AC.verb);

  const notes = voicing(chordAt(state.T)), spread = [-0.1, -0.55, 0.45, -0.3, 0.6];
  const voices = notes.map((m, i) => {
    const f = mtof(m), o1 = AC.createOscillator(), o2 = AC.createOscillator();
    o1.type = o2.type = 'sawtooth';
    o1.frequency.value = o2.frequency.value = f;
    o2.detune.value = 6;
    const lfo = AC.createOscillator(), depth = AC.createGain();
    lfo.frequency.value = 0.12 + i * 0.037; depth.gain.value = 0;
    lfo.connect(depth); depth.connect(o1.detune); depth.connect(o2.detune);
    const g = AC.createGain(); g.gain.value = i === 0 ? 0.9 : 0.6;
    const p = AC.createStereoPanner(); p.pan.value = spread[i];
    o1.connect(g); o2.connect(g); g.connect(p).connect(lp);
    for (const o of [o1, o2, lfo]) o.start();
    return { o1, o2, lfo, depth, g, p, base: spread[i], level: i === 0 ? 0.9 : 0.6 };
  });
  BED = { lp, out, voices, chord: chordAt(state.T).name, t: 0 };
}

export function updateBed(now) {
  if (!BED || !AC) return;
  if (now - BED.t < 120) return;
  BED.t = now;
  const t0 = AC.currentTime, ch = chordAt(state.T);

  if (ch.name !== BED.chord) {         // the hour changed: glide to the new notes
    BED.chord = ch.name;
    voicing(ch).forEach((m, i) => {
      const f = mtof(m);
      for (const o of [BED.voices[i].o1, BED.voices[i].o2]) o.frequency.setTargetAtTime(sval(f), t0, 0.6);
    });
  }

  const moving = state.moving;
  // Nothing is running — the small hours, or a paused clock. Go properly quiet
  // rather than leaving a drone hanging under an empty network.
  if (!moving.length || !state.playing || !state.bedOn) {
    BED.out.gain.setTargetAtTime(0, t0, 0.5);
    return;
  }

  let run = 0, late = 0, canc = 0, sx = 0, sxx = 0;
  for (const tr of moving) {
    if (tr.canc) { canc++; continue; }
    run++;
    if (tr.late >= 3) late++;
    sx += tr.x; sxx += tr.x * tr.x;
  }
  const B = state.B;
  const dens = Math.min(1, run / (state.S.peak || 1));
  const L = run ? late / run : 0, Cx = moving.length ? canc / moving.length : 0;
  const mx = run ? sx / run : (B.x0 + B.x1) / 2;
  const sd = run > 1 ? Math.sqrt(Math.max(0, sxx / run - mx * mx)) : 0;
  const bw = B.x1 - B.x0 || 1;
  const lean = Math.max(-1, Math.min(1, ((mx - B.x0) / bw) * 2 - 1));
  const width = Math.min(1, (sd || 0) / 120);
  const bedVol = +($('fxBed')?.value ?? FX_DEFAULTS.fxBed);

  BED.out.gain.setTargetAtTime(sval(bedVol * (0.012 + 0.07 * Math.pow(dens || 0, 1.3))), t0, 1.2);
  BED.lp.frequency.setTargetAtTime(sval(280 + 1400 * (dens || 0) * (1 - 0.35 * L)), t0, 1.2);

  const muted = Math.min(3, Math.round(Cx / 0.025));  // cancellations take voices out, from the top
  BED.voices.forEach((v, i) => {
    v.depth.gain.setTargetAtTime(sval(4 + L * 70), t0, 1);        // late trains make it waver
    v.lfo.frequency.setTargetAtTime(sval((0.12 + i * 0.037) * (1 + L * 14)), t0, 1);
    v.p.pan.setTargetAtTime(sval(Math.max(-0.95, Math.min(0.95, v.base * (0.4 + 0.6 * width) + lean * 0.45))), t0, 1.5);
    v.g.gain.setTargetAtTime(sval(i >= BED.voices.length - muted ? 0 : v.level), t0, 0.8);
  });
}
