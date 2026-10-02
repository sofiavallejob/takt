// Sounding the strings, shared by both modes. Moving the trains is the
// mode's business: live/step.js places the trains that are running right now,
// replay/step.js plays back a recorded day. Both end up here.
//
// The note you hear belongs to the line being *crossed*, not to the line the
// train is running on. A train on the orange route that passes over the green
// route sounds the green string, tuned by the green route's length.

import { CATS, STEP } from './config.js';
import { state, $ } from './state.js';
import { delayAt, query } from './geom.js';
import {
  AC, play, click, nextStep, claimSlot, isRunning, sourness, roughness, distortion,
} from './audio/engine.js';
import { freqForLine, chordAt, mtof } from './audio/tuning.js';
import { flashLine } from './ui/sidebar.js';
import { showLabel } from './render.js';

const SHARE = 1.4;
const budget = CATS.map(() => ({ v: SHARE, t: 0 }));
let lastHour = -1;

export function resetHour() { lastHour = -1; }

/** Sound one string. Returns milliseconds until it speaks, or -1 if the beat
 *  it wanted is already full. */
function sound(g, tr, px, byHand, amp = 1) {
  if (!isRunning()) return 0;
  const B = state.B;
  const pan = ((px - B.x0) / (B.x1 - B.x0)) * 1.8 - 0.9;
  const freq = freqForLine(g, state.T);

  if (byHand) { play(freq, AC.currentTime + 0.005, pan, 0, false, amp); return 0; }

  const late = tr && !tr.canc ? Math.max(0, delayAt(tr, state.N)) : 0;
  const drag = Math.min(1.8, Math.pow(late / 20, 0.8)) * STEP;
  const s = nextStep(drag);
  if (!claimSlot(s.k)) return -1;
  if (tr && tr.canc) { click(s.when, pan, amp); return (s.when - AC.currentTime) * 1000; }
  const detune = state.lateFx !== 'distort', crush = state.lateFx !== 'detune';
  play(freq, s.when, pan, detune ? sourness(late) : 0, detune && roughness(late) > 0.15, amp,
    crush ? distortion(late) : 0);
  return (s.when - AC.currentTime) * 1000;
}

/** Rate-limit a string, then sound it and set off its visual vibration. */
export function trigger(g, tr, x, y, hitU, byHand, amp = 1) {
  const now = performance.now();
  const dv = +($('dens')?.value ?? 0.8);
  const rest = dv >= 1.15 ? 0 : Math.max(60, (1.2 - dv) * 2800);
  if (now - g.lastPluck < (byHand ? 90 : rest)) return false;

  if (!byHand) {
    if (!state.playing) return false;
    const b = budget[Math.min(budget.length - 1, g.cat)];
    b.v = Math.min(SHARE, b.v + (now - b.t) / 1000 * SHARE); b.t = now;
    if (b.v < 1) return false;
    if (state.soloLine && state.soloLine !== g) return false;
  }

  const wait = sound(g, tr, x, byHand, amp);
  if (wait < 0) return false;
  if (!byHand) budget[Math.min(budget.length - 1, g.cat)].v -= 1;

  flashLine(g);
  g.lastPluck = now;
  g.vib = {
    t: now + Math.max(0, wait), pos: hitU, dead: !!(tr && tr.canc),
    late: tr && !tr.canc ? Math.max(0, delayAt(tr, state.N)) : 0,
  };
  return true;
}

/** On every full hour (local time) the new chord's root sounds low, like a
 *  station clock, but only over a network that is actually running. */
export function hourNote() {
  const h = Math.floor(state.T / 60);
  if (h === lastHour) return;
  const first = lastHour < 0;
  lastHour = h;
  if (first || !isRunning() || !state.playing || !state.moving.length) return;
  const ch = chordAt(state.T), s = nextStep(0);
  play(mtof(ch.root - 12), s.when, 0, 0, false, 0.9);
  play(mtof(ch.root - 5), s.when + STEP * 2, 0, 0, false, 0.6);
}

/** Playing by hand. A sweep can cross a dozen lines at once; sounding them all
 *  at the same instant sums into the limiter and sounds like distortion, so a
 *  strum is spread across a few milliseconds and scaled back as it thickens. */
export function strum(hits) {
  if (!hits.length) return;
  hits.sort((a, b) => a.g.u - b.g.u);
  const amp = Math.min(1, 1.25 / Math.sqrt(hits.length));
  hits.forEach((hit, i) => {
    const t = i * 0.012;
    if (t === 0) { trigger(hit.g, null, hit.x, hit.y, hit.u, true, amp); return; }
    setTimeout(() => trigger(hit.g, null, hit.x, hit.y, hit.u, true, amp), t * 1000);
  });
  const first = hits[0];
  showLabel(first.g, first.x, first.y);
}

/** Collect every line the segment crosses, without sounding anything yet. */
export function collectSweep(x0, y0, x1, y1, into) {
  const v = state.view;
  const a = [(x0 - v.x) / v.s, (y0 - v.y) / v.s], b = [(x1 - v.x) / v.s, (y1 - v.y) / v.s];
  query(a[0], a[1], b[0], b[1], (g, i, h) => {
    if (into.some(e => e.g === g)) return;
    into.push({
      g,
      x: a[0] + (b[0] - a[0]) * h.t,
      y: a[1] + (b[1] - a[1]) * h.t,
      u: (g.d[i] + (g.d[i + 1] - g.d[i]) * h.u) / g.len,
    });
  });
}
