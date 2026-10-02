// Live: placing the trains that are running right now, and finding what they
// pluck. Finnish lines meet at stations far more often than they cross in open
// country, so crossings are found both ways: geometrically between stations,
// and at every station a train passes, where the lines it leaves behind sound
// too. Arriving at a station, a train also plucks its own line, quietly: at the
// speed of real life crossings are rare, and arrivals are the pulse.

import { state } from '../state.js';
import { delayAt, actualDist, pointAt, query } from '../geom.js';
import { trigger } from '../sim.js';
import { minsNow, net } from './network.js';
import { minuteOfDay } from './clock.js';

let lastN = 0;

/** Index of the last timetable point the train is at or past, by distance,
 *  so the notes happen when the dot reaches the station. */
function passed(tr, dist) {
  const d = tr.d;
  let lo = 0, hi = d.length - 1;
  if (dist + 0.05 < d[0]) return -1;
  if (dist + 0.05 >= d[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= dist + 0.05) lo = m; else hi = m; }
  return lo;
}

/** How far along its route a train is drawn. The timetable gives a position
 *  that jumps a little each time an estimate is revised; a fresh GPS fix,
 *  carried forward at the reported speed, is where the train really is. The
 *  drawn position eases towards whichever applies and never runs backwards,
 *  unless the correction is too large to be jitter. */
function placeDist(tr, N, dt) {
  const fromTimetable = actualDist(tr, N);
  let target = fromTimetable;
  const g = tr.gps;
  if (g && !tr.canc && N - g.at < 2) {
    const ahead = Math.min(g.v * Math.max(0, N - g.at), 4);   // never more than 4 km of guessing
    target = Math.min(tr.path.len, g.d + ahead);
  }
  if (tr.dShow < 0 || Math.abs(target - tr.dShow) > 8) {     // first sight, or a real correction
    tr.dShow = target;
    tr.head = null;
    return target;
  }
  const step = (target - tr.dShow) * Math.min(1, dt * 1.2);
  if (step > 0) tr.dShow += step;
  return tr.dShow;
}

/** A train has just reached a station: its own string at that spot. Softly
 *  under crossings; fuller when arrivals are all there is. */
function arrive(tr, i) {
  const g = tr.g, p = pointAt(tr.path, tr.d[i]);
  const sd = g.stD.get(tr.rc[i]);
  const u = sd == null ? 0.5 : sd / Math.max(1e-6, g.len);
  if (trigger(g, tr, p[0], p[1], u, false, state.plays === 'arrive' ? 0.85 : 0.55)) state.heard.arrivals++;
}

/** The train has passed station `code` (row i). Lines that meet its route
 *  there sound: crossed lines in full (the Pori line at Tampere, for a train
 *  to Oulu), and lines it parts from more softly (the coastal lines at Pasila,
 *  for a train heading north). Lines it keeps running alongside stay silent.
 *  At most three per station, so a busy junction strums instead of slamming. */
function junction(tr, i) {
  const list = net.at.get(tr.rc[i]);
  if (!list || list.length < 2) return;
  const hits = [];
  for (const { g, i: k } of list) {
    if (g === tr.g || hits.some(h => h.g === g)) continue;
    const a = k > 0 ? tr.edges.has(g.ek[k - 1]) : null;
    const b = k < g.n - 1 ? tr.edges.has(g.ek[k]) : null;
    if (a !== false && b !== false) continue;           // alongside, or ends with it
    hits.push({ g, k, cross: a !== true && b !== true });
  }
  if (!hits.length) return;
  hits.sort((x, y) => (y.cross - x.cross) || (x.g.lastPluck - y.g.lastPluck));
  const p = pointAt(tr.path, tr.d[i]);
  hits.slice(0, 3).forEach((h, n) => {
    const go = () => {
      if (trigger(h.g, tr, p[0], p[1], h.g.d[h.k] / Math.max(1e-6, h.g.len), false, h.cross ? 1 : 0.7)) {
        state.heard.crossings++;
      }
    };
    if (n === 0) go(); else setTimeout(go, n * 90);
  });
}

export function step(dt = 0) {
  const N = minsNow();
  state.N = N;
  state.T = minuteOfDay();
  // The tab was hidden, or the machine slept: pick up where things are now
  // instead of playing every crossing that happened in the meantime.
  const jump = !lastN || N - lastN > 0.5;
  lastN = N;
  const moving = [];
  const crossings = state.plays !== 'arrive', arrivals = state.plays !== 'cross';

  for (const tr of state.S.trains) {
    const a = tr.canc ? tr.t0 : tr.a0, b = tr.canc ? tr.t1 : tr.a1;
    if (N < a || N > b) { tr.head = null; tr.dShow = -1; continue; }
    const dist = placeDist(tr, N, dt);
    const p = pointAt(tr.path, dist);
    tr.x = p[0]; tr.y = p[1];
    tr.late = tr.canc ? 0 : delayAt(tr, N);
    moving.push(tr);

    const r = passed(tr, dist);
    if (tr.lastRow === -2 || jump) tr.lastRow = r;
    else if (r > tr.lastRow) {
      let hit = -1;
      for (let i = tr.lastRow + 1; i <= r; i++) {
        if (tr.stop[i]) hit = i;
        if (crossings && (i === 0 || tr.rc[i] !== tr.rc[i - 1])) junction(tr, i);
      }
      tr.lastRow = r;
      if (hit >= 0 && arrivals) arrive(tr, hit);
    }

    if (!tr.head || jump || !crossings) { tr.head = p; continue; }
    const [ax, ay] = tr.head;
    if (Math.abs(p[0] - ax) < 0.01 && Math.abs(p[1] - ay) < 0.01) continue;
    const own = tr.g;
    query(ax, ay, p[0], p[1], (g, i, h) => {
      // Its own line, a line it shares track with here, or one it runs
      // alongside: no note.
      if (g === own || tr.edges.has(g.ek[i]) || h.sin < 0.55) return;
      // Touching the string at a station on this route is a junction, and
      // junction() has already played it.
      if ((h.u < 0.02 && tr.cs.has(g.codes[i])) || (h.u > 0.98 && tr.cs.has(g.codes[i + 1]))) return;
      if (trigger(g, tr, ax + (p[0] - ax) * h.t, ay + (p[1] - ay) * h.t,
        (g.d[i] + (g.d[i + 1] - g.d[i]) * h.u) / g.len, false)) state.heard.crossings++;
    });
    tr.head = p;
  }

  state.moving = moving;
}
