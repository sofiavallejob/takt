// Replay: unpacking the delta-encoded pack into typed arrays, and folding the
// raw polylines into the "strings" the instrument actually plays. The records
// come out in the same shape the live networks produce, so drawing, the
// Strings panel and the sound are shared.

import { CATS, MX_LINES } from '../config.js';

/** Countries whose feed ships one polyline per direction get a table that
 *  folds each direction pair into a single string. */
const STRING_TABLES = { mx: MX_LINES };

/** Keep only points [i0..i1] of a decoded polyline and rebase its distances.
 *  The Mexico feed stores Línea 12 as an out-and-back loop; one leg is the line. */
function clipGeom(g, i0, i1) {
  const n = i1 - i0 + 1;
  const x = new Float32Array(n), y = new Float32Array(n), d = new Float32Array(n);
  const d0 = g.d[i0];
  for (let i = 0; i < n; i++) { x[i] = g.x[i0 + i]; y[i] = g.y[i0 + i]; d[i] = g.d[i0 + i] - d0; }
  g.x = x; g.y = y; g.d = d; g.n = n; g.len = d[n - 1];
}

/** trips: [geomIdx, cat, name, from, to, cancelled, known, operator, t0,
 *          (dt planned, delay at stop, dDist) x stops] */
export function decodeDay(D, C) {
  const QX = (D.q || [100, 100])[0], QD = (D.q || [100, 100])[1];

  const G = D.geoms.map((e, gi) => {
    const n = e.length / 3, x = new Float32Array(n), y = new Float32Array(n), d = new Float32Array(n);
    let a = 0, b = 0, c = 0, straight = false;
    for (let i = 0; i < n; i++) {
      a += e[3 * i]; b += e[3 * i + 1]; c += e[3 * i + 2];
      x[i] = a / QX; y[i] = b / QX; d[i] = c / QD;
      if (i && Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) > 40) straight = true;
    }
    return {
      id: gi, x, y, d, n, len: d[n - 1], straight,
      cat: 9, users: 0, from: '', to: '', opers: null,
      sid: gi, rep: null, lc: null, name: null,
      lastPluck: 0, vib: null, _el: null, u: 0, ci: 0,
    };
  });

  // Fold direction pairs into strings where the country provides a table.
  const table = STRING_TABLES[C.key] || null;
  if (table) {
    for (const L of table) {
      const rep = G[L.rep];
      if (!rep) continue;
      if (L.clip) clipGeom(rep, L.clip[0], L.clip[1]);
      rep.name = L.name; rep.lc = L.col; rep.from = L.from; rep.to = L.to; rep.fixed = true;
      for (const gi of L.geoms) { if (G[gi]) { G[gi].sid = L.rep; G[gi].rep = rep; } }
    }
  }
  for (const g of G) if (!g.rep) g.rep = g;

  // Otherwise the pack may still carry per-line colours.
  if (!table && D.lineColors) for (let i = 0; i < G.length; i++) if (D.lineColors[i]) G[i].lc = D.lineColors[i];

  const trains = [];
  for (const e of D.trips) {
    const g = G[e[0]]; if (!g || g.straight || g.len < 0.5) continue;
    const n = (e.length - 9) / 3; if (n < 2) continue;
    const t = new Float32Array(n), ta = new Float32Array(n), la = new Float32Array(n), d = new Float32Array(n);
    let a = e[8], b = 0;
    for (let i = 0; i < n; i++) {
      a += e[9 + 3 * i]; b += e[11 + 3 * i];
      t[i] = a; la[i] = e[10 + 3 * i]; ta[i] = a + la[i]; d[i] = b / QD;
    }
    for (let i = 1; i < n; i++) if (ta[i] < ta[i - 1]) ta[i] = ta[i - 1];
    trains.push({
      g, c: e[1], name: e[2], from: e[3], to: e[4], canc: !!e[5], known: !!e[6], oper: e[7],
      t, ta, la, d, t0: t[0], t1: t[n - 1], a0: ta[0], a1: ta[n - 1], arr: la[n - 1],
      head: null, k: 0, x: 0, y: 0, late: 0, ci: 0,
      path: g, lateThr: C.late, dShow: -1,   // what the shared renderer reads; no tails in replay
    });
    // Category, terminals and operators belong to the string, not the direction.
    const s = g.rep;
    if (e[1] < s.cat) { s.cat = e[1]; if (!s.fixed) { s.from = e[3]; s.to = e[4]; } }
    if (!s.opers) s.opers = new Set();
    s.opers.add(e[7]);
    s.users++;
  }

  // A string is playable if trains use it, or if the country declared it even
  // though the feed carries no service for it (Mexico City's Línea 12).
  const isLine = g => g.rep === g && !g.straight && (g.users > 0 || !!g.fixed);
  const lines = G.filter(isLine);
  for (const g of lines) if (g.cat === 9) g.cat = CATS.length - 1;

  // Trains bucketed by quarter hour, so a frame only looks at what can be running.
  const buckets = Array.from({ length: 97 }, () => []);
  for (const tr of trains) {
    const a = Math.min(tr.t0, tr.a0), b = Math.max(tr.t1, tr.a1);
    for (let k = Math.max(0, Math.floor(a / 15)); k <= Math.min(96, Math.floor(b / 15)); k++) buckets[k].push(tr);
  }
  return { lines, trains, buckets, peak: 0 };
}

/** The colour groups used for train dots and the legend: train categories for
 *  the railways, the line's own livery for a metro. */
function buildGroups(c) {
  const table = STRING_TABLES[c.key];
  if (table) {
    c.groups = table.map(L => ({ col: L.col, name: L.name, short: 'L' + L.id }));
    const idx = new Map(table.map((L, i) => [L.rep, i]));
    c.groupOf = tr => idx.get(tr.g.rep.sid) ?? 0;
    c.byLine = true;
  } else {
    c.groups = CATS.map((cat, i) => ({ col: cat.col, name: c.cats[i] || cat.name, short: c.cats[i] || cat.name }));
    c.groupOf = tr => tr.c;
    c.byLine = false;
  }
}

function primaryOperator(g, c) {
  if (!g.opers) return c.main;
  return [...g.opers].find(o => o !== c.main) || c.main;
}

/** One-time per country: decode every day, tune the strings, work out bounds. */
export function ensureCountry(c) {
  if (c.DAYS) return;
  c.DAYS = {};
  for (const d in c.days) c.DAYS[d] = decodeDay(c.days[d], c);
  buildGroups(c);
  for (const d in c.DAYS) for (const tr of c.DAYS[d].trains) tr.ci = c.groupOf(tr);

  // The Strings panel groups by operator: the national operator first, then
  // everyone else alphabetically. A metro is one group.
  c.groupOrder = [c.main];
  for (const d in c.DAYS) for (const g of c.DAYS[d].lines) {
    g.group = c.byLine ? c.name : primaryOperator(g, c);
  }
  c.noun = 'trains';

  // Every string gets a fixed place between low (longest route) and high (shortest).
  const all = Object.values(c.DAYS).flatMap(d => d.lines);
  const LMAX = Math.max(...all.map(g => g.len)), LMIN = 5;
  const span = Math.log(LMAX) - Math.log(LMIN);
  for (const g of all) {
    g.u = Math.max(0, Math.min(1, (Math.log(LMAX) - Math.log(Math.max(LMIN, g.len))) / span));
    g.ratio = LMAX / Math.max(LMIN, g.len);   // used by harmonic tuning
  }
  c.LMAX = LMAX;

  // Some feeds are a timetable only, with no punctuality at all (Mexico City).
  // The legend and the bed both need to know.
  c.hasDelays = Object.values(c.DAYS)
    .some(d => d.trains.some(s => s.canc || s.arr !== 0));

  c.NOTE = {};
  for (const d in c.DAYS) {
    if (!c.hasDelays) {
      // Claiming "under 1% late" from a feed with no punctuality in it would be
      // an invention, not a measurement.
      c.NOTE[d] = 'Timetable only — this feed carries no punctuality data, so every train runs to plan.';
      continue;
    }
    const r = c.DAYS[d].trains.filter(s => s.known && s.t0 >= 0);
    const late = r.filter(s => !s.canc && s.arr >= c.late).length, canc = r.filter(s => s.canc).length;
    const pc = v => { const p = v / Math.max(1, r.length) * 100; return p < 1 ? 'under 1%' : Math.round(p) + '%'; };
    const s = `${pc(late)} of trains arrived ${c.late} or more minutes late, ${pc(canc)} were cancelled.`;
    c.NOTE[d] = s[0].toUpperCase() + s.slice(1);
  }

  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  if (c.states.length) {
    for (const p of c.states) for (let i = 0; i < p.length; i += 2) {
      const x = p[i] / 10, y = p[i + 1] / 10;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  } else {
    for (const g of all) for (let i = 0; i < g.n; i++) {
      x0 = Math.min(x0, g.x[i]); x1 = Math.max(x1, g.x[i]);
      y0 = Math.min(y0, g.y[i]); y1 = Math.max(y1, g.y[i]);
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  }
  c.B = { x0, y0, x1, y1 };
}

/** How many trains run in each ten minutes of the day (the shape on the day
 *  bar), and the busiest minute, used to normalise the bed's density. */
export function dayShape(D) {
  const profile = new Array(144).fill(0);
  for (const tr of D.trains) {
    if (tr.canc) continue;
    const a = Math.max(0, Math.floor(tr.a0 / 10)), b = Math.min(143, Math.floor(tr.a1 / 10));
    for (let k = a; k <= b; k++) profile[k]++;
  }
  let peak = 1;
  for (let m = 0; m < 1440; m += 5) {
    let n = 0;
    for (const tr of D.trains) if (!tr.canc && m >= tr.a0 && m <= tr.a1) n++;
    peak = Math.max(peak, n);
  }
  return { profile, peak };
}
