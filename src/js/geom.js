// Where a train is, and which lines a movement crosses.

import { state } from './state.js';

/** The segment a train is on at wall-clock time T, interpolating between the
 *  stops it actually reached, at the times it reached them. */
export function seg(s, T) {
  const ta = s.ta, n = ta.length;
  if (T <= ta[0]) return [0, 0];
  if (T >= ta[n - 1]) return [n - 2, 1];
  let k = s.k; if (k > n - 2 || ta[k] > T) k = 0;
  while (k < n - 2 && ta[k + 1] <= T) k++;
  s.k = k;
  return [k, (T - ta[k]) / Math.max(1e-6, ta[k + 1] - ta[k])];
}

export function delayAt(s, T) {
  if (s.canc) return 0;
  const [k, f] = seg(s, T);
  return s.la[k] + (s.la[k + 1] - s.la[k]) * f;
}

export function actualDist(s, T) {
  if (s.canc) return distAt(s, T);
  const [k, f] = seg(s, T);
  return s.d[k] + (s.d[k + 1] - s.d[k]) * Math.max(0, Math.min(1, f));
}

/** How far along the route the train was *meant* to be — the ghost ring. */
export function distAt(s, tp) {
  const t = s.t, n = t.length;
  if (tp <= t[0]) return s.d[0];
  if (tp >= t[n - 1]) return s.d[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tp) lo = m; else hi = m; }
  return s.d[lo] + (s.d[hi] - s.d[lo]) * (tp - t[lo]) / Math.max(1e-6, t[hi] - t[lo]);
}

export function pointAt(g, dist) {
  if (dist <= 0) return [g.x[0], g.y[0]];
  if (dist >= g.len) return [g.x[g.n - 1], g.y[g.n - 1]];
  let lo = 0, hi = g.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.d[m] <= dist) lo = m; else hi = m; }
  const f = (dist - g.d[lo]) / Math.max(1e-6, g.d[hi] - g.d[lo]);
  return [g.x[lo] + (g.x[hi] - g.x[lo]) * f, g.y[lo] + (g.y[hi] - g.y[lo]) * f];
}

/** Segment/segment intersection. `sin` is the sine of the crossing angle, so a
 *  near-zero value means the two lines run alongside rather than cross. */
export function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy, den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, sin: Math.abs(den) / (Math.hypot(r1, r2) * Math.hypot(s1, s2)) };
}

const CELL = 5, key = (i, j) => i * 100003 + j;
let grid = new Map();

export function buildGrid() {
  grid = new Map();
  for (const g of state.S.lines) for (let i = 0; i < g.n - 1; i++) {
    const x0 = g.x[i], y0 = g.y[i], x1 = g.x[i + 1], y1 = g.y[i + 1];
    const i0 = Math.floor(Math.min(x0, x1) / CELL), i1 = Math.floor(Math.max(x0, x1) / CELL);
    const j0 = Math.floor(Math.min(y0, y1) / CELL), j1 = Math.floor(Math.max(y0, y1) / CELL);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const k = key(a, b); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push([g, i]);
    }
  }
}

let QSTAMP = 0;
/** Call `fn(line, segmentIndex, hit)` once per line the segment a→b crosses. */
export function query(x0, y0, x1, y1, fn) {
  const i0 = Math.floor(Math.min(x0, x1) / CELL), i1 = Math.floor(Math.max(x0, x1) / CELL);
  const j0 = Math.floor(Math.min(y0, y1) / CELL), j1 = Math.floor(Math.max(y0, y1) / CELL);
  const stamp = ++QSTAMP;
  for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
    const c = grid.get(key(a, b)); if (!c) continue;
    for (const e of c) {
      const g = e[0]; if (g._q === stamp) continue;
      const h = segHit(x0, y0, x1, y1, g.x[e[1]], g.y[e[1]], g.x[e[1] + 1], g.y[e[1] + 1]);
      if (h) { g._q = stamp; fn(g, e[1], h); }
    }
  }
}
