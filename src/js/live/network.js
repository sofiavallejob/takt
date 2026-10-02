// The live network: strings built from the routes trains actually run, and
// trains rebuilt every time the feed says something about them changed.
//
// Every network (Finland, Stockholm) has its own `net`; `useNet` makes one
// current, and everything in this module works on the current one. The
// records fed in all have the same shape, whatever feed they came from.
//
// Times inside the simulation are minutes since `net.epoch` (the moment the
// network was loaded), so they stay small and exact. Space is kilometres on a
// sinusoidal projection centred on the network: distances along a route are
// close to the real ones, which matters because a route's length is its pitch.

import { CATS, LINE_ALIASES, LINE_NAMES, VIEWS, CITY_NAMES } from '../config.js';
import { midnight, dateAt } from './clock.js';

const RAD = Math.PI / 180;

export function createNet(lon0, lat0) {
  return {
    lon0, lat0,
    stations: null,      // Map code -> { code, name, lat, lon, x, y }
    strings: new Map(),  // key -> string
    trains: new Map(),   // id -> train
    version: 0,
    epoch: Date.now(),
    dirty: true,         // the set of strings changed: retune, regrid, redraw
    at: new Map(),       // station code -> [{ g, i }] strings through it
  };
}

export let net = createNet(25.5, 64);
export function useNet(n) { net = n; n.dirty = true; }

export function project(lon, lat) {
  return [(lon - net.lon0) * 111.32 * Math.cos(lat * RAD), -(lat - net.lat0) * 110.57];
}

export const minsAt = ms => (ms - net.epoch) / 60000;
export const minsNow = () => minsAt(Date.now());
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

export function setStations(map) {
  for (const s of map.values()) [s.x, s.y] = project(s.lon, s.lat);
  net.stations = map;
}

/** A polyline through a chain of station codes. */
function polyline(codes) {
  const n = codes.length;
  const x = new Float64Array(n), y = new Float64Array(n), d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = net.stations.get(codes[i]);
    x[i] = s.x; y[i] = s.y;
    if (i) d[i] = d[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  }
  return { codes, x, y, d, n, len: d[n - 1] };
}

function stringKey(raw) {
  if (raw.line) return 'L:' + (LINE_ALIASES[raw.line] || raw.line);
  const a = raw.rows[0].code, b = raw.rows[raw.rows.length - 1].code;
  return 'R:' + [a, b].sort().join('-');
}

const groupOfCat = c => (c <= 2 ? 'Long distance' : c === 3 ? 'Regional' : 'Commuter');
const stationName = code => CITY_NAMES[code] || net.stations.get(code)?.name || code;

/** Give a string new geometry (in place, so every train keeps its reference). */
function shapeString(g, codes) {
  Object.assign(g, polyline(codes));
  g.ek = [];
  for (let i = 0; i < g.n - 1; i++) g.ek.push(pairKey(codes[i], codes[i + 1]));
  g.stD = new Map();
  for (let i = 0; i < g.n; i++) if (!g.stD.has(codes[i])) g.stD.set(codes[i], g.d[i]);
  g.from = stationName(codes[0]);
  g.to = stationName(codes[g.n - 1]);
  net.dirty = true;
}

function getString(key, raw, codes, mayReshape) {
  let g = net.strings.get(key);
  if (!g) {
    const letter = key.startsWith('L:') ? key.slice(2) : null;
    g = {
      key, cat: raw.cat,
      name: raw.lineName || (letter ? (LINE_NAMES[letter] || `${letter} train`) : null),
      lc: raw.color || null, u: 0, ratio: 1, lastPluck: 0, vib: null, _el: null, users: 0,
      group: raw.groupName || groupOfCat(raw.cat),
    };
    net.strings.set(key, g);
    shapeString(g, codes);
    return g;
  }
  // The longest route seen for a line becomes its string, while the day is
  // first being read. Live updates never reshape a string under the listener.
  if (mayReshape && codes.length > g.n) shapeString(g, codes);
  if (raw.cat < g.cat) { g.cat = raw.cat; g.group = raw.groupName || groupOfCat(raw.cat); net.dirty = true; }
  return g;
}

/** Turn one feed record into a train the simulation can move. */
function buildTrain(raw, mayReshape) {
  const rows = raw.rows.filter(r => net.stations.has(r.code) && Number.isFinite(r.plan));
  if (rows.length < 2) return null;

  // The chain of places the train passes, with each row pointing into it.
  const codes = [], at = new Int32Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    if (codes[codes.length - 1] !== rows[i].code) codes.push(rows[i].code);
    at[i] = codes.length - 1;
  }
  if (codes.length < 2) return null;
  const path = polyline(codes);
  if (path.len < 0.5) return null;

  const g = getString(stringKey({ ...raw, rows }), raw, codes, mayReshape);

  const n = rows.length;
  const t = new Float64Array(n), ta = new Float64Array(n), la = new Float64Array(n), d = new Float64Array(n);
  const stop = new Uint8Array(n);
  // Passed points have actual times; the rest have live estimates. Where a
  // point has neither, the last known delay is carried forward.
  let lastDelay = 0, known = false;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    t[i] = minsAt(r.plan);
    let a;
    if (Number.isFinite(r.actual)) { a = r.actual; known = true; }
    else if (Number.isFinite(r.estimate)) a = r.estimate;
    else a = r.plan + lastDelay;
    lastDelay = a - r.plan;
    ta[i] = minsAt(a);
    d[i] = path.d[at[i]];
    // A note on arrival at a passenger stop, and on leaving the first one.
    stop[i] = r.stop && r.commercial && (i === 0 ? r.dep : !r.dep) ? 1 : 0;
  }
  for (let i = 1; i < n; i++) {
    if (t[i] < t[i - 1]) t[i] = t[i - 1];
    if (ta[i] < ta[i - 1]) ta[i] = ta[i - 1];
  }
  for (let i = 0; i < n; i++) la[i] = ta[i] - t[i];

  // A train cancelled from some station onwards stops being a train there.
  let end = n - 1;
  if (!raw.cancelled) while (end > 0 && rows[end].cancelled) end--;
  const canc = raw.cancelled || end === 0;
  const partial = !canc && end < n - 1;

  const edges = new Set();
  for (let i = 0; i < codes.length - 1; i++) edges.add(pairKey(codes[i], codes[i + 1]));

  return {
    id: raw.id, date: raw.date, version: raw.version,
    g, path, c: raw.cat, ci: raw.ci ?? raw.cat, oper: raw.oper,
    name: raw.name || (raw.line ? `${raw.line} ${raw.number}` : `${raw.type} ${raw.number}`),
    from: stationName(codes[0]), to: stationName(codes[codes.length - 1]),
    canc, partial, known,
    t, ta, la, d, stop, edges, rc: rows.map(r => r.code), cs: new Set(codes),
    t0: t[0], t1: t[n - 1], a0: ta[0], a1: canc ? ta[n - 1] : ta[end],
    arr: la[end],
    lateThr: raw.lateThr ?? (raw.cat <= 3 ? 5 : 3),   // Finland's own punctuality limits by default
    head: null, k: 0, x: 0, y: 0, late: 0, lastRow: -2,
    gps: null, dShow: -1,
  };
}

/** Add or replace trains. Returns how many were taken in. */
export function ingest(raws, mayReshape = false) {
  let count = 0;
  for (const raw of raws) {
    const v = Number(raw.version) || 0;
    if (v > net.version) net.version = v;
    const old = net.trains.get(raw.id);
    if (old && old.version === raw.version) continue;
    const tr = buildTrain(raw, mayReshape);
    if (!tr) { net.trains.delete(raw.id); continue; }
    if (old) {
      // Keep what the listener has already heard, so an update does not
      // replay the stations this train passed, and keep where it was drawn.
      tr.lastRow = old.lastRow;
      tr.x = old.x; tr.y = old.y;
      tr.gps = old.gps; tr.dShow = old.dShow;
    }
    net.trains.set(raw.id, tr);
    count++;
  }
  return count;
}

/** Forget trains that finished more than half an hour ago. */
export function prune(N) {
  for (const [id, tr] of net.trains) if (Math.max(tr.a1, tr.t1) < N - 30) net.trains.delete(id);
}

/** Strings every train uses, tuned by length: longest lowest. */
export function retune() {
  const lines = [...net.strings.values()];
  for (const g of lines) g.users = 0;
  for (const tr of net.trains.values()) tr.g.users++;
  const LMAX = Math.max(...lines.map(g => g.len)), LMIN = 5;
  const span = Math.log(LMAX) - Math.log(LMIN);
  for (const g of lines) {
    g.u = Math.max(0, Math.min(1, (Math.log(LMAX) - Math.log(Math.max(LMIN, g.len))) / span));
    g.ratio = LMAX / Math.max(LMIN, g.len);
  }
  // Which strings touch each station, for crossings at junctions.
  net.at = new Map();
  for (const g of lines) for (let i = 0; i < g.n; i++) {
    const c = g.codes[i];
    if (!net.at.has(c)) net.at.set(c, []);
    net.at.get(c).push({ g, i });
  }
  net.dirty = false;
  return lines;
}

/** How many trains are running across the Helsinki day, every ten minutes,
 *  as the feed sees it now. Used for the day bar and to scale the bed. */
export function dayProfile(date = dateAt(Date.now())) {
  const start = minsAt(midnight(date));
  const out = new Array(144).fill(0);
  for (const tr of net.trains.values()) {
    if (tr.canc) continue;
    const a = Math.max(0, Math.floor((tr.a0 - start) / 10)), b = Math.min(143, Math.floor((tr.a1 - start) / 10));
    for (let k = a; k <= b; k++) out[k]++;
  }
  return out;
}

/** Region outlines, projected and in the packed form the renderer draws. */
export function projectRings(rings) {
  return rings.map(r => {
    const out = [];
    for (let i = 0; i < r.length; i += 2) {
      const [x, y] = project(r[i], r[i + 1]);
      out.push(x * 10, y * 10);
    }
    return out;
  });
}

/** Map bounds and labels for one of the two views. */
export function viewFor(key, rings) {
  const V = VIEWS[key];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  if (V.box) {
    const [a, b, c, d] = V.box;
    for (const lon of [a, c]) for (const lat of [b, d]) grow(...project(lon, lat));
    grow(...project((a + c) / 2, b)); grow(...project((a + c) / 2, d));
  } else {
    // Mainland only: the Åland islands have no railway and would shrink the map.
    for (const r of rings) {
      let west = true;
      for (let i = 0; i < r.length; i += 2) if (r[i] > 21.3) { west = false; break; }
      if (west) continue;
      for (let i = 0; i < r.length; i += 2) grow(...project(r[i], r[i + 1]));
    }
  }
  // Labels are station codes, or for networks whose codes mean nothing to a
  // reader (GTFS stop ids), station names.
  const byName = new Map([...net.stations.values()].map(s => [s.name, s]));
  const find = c => net.stations.get(c) || byName.get(c);
  const label = c => CITY_NAMES[c] || find(c)?.name;
  const cities = {};
  for (const c of V.cities) {
    const s = find(c);
    if (s) cities[label(c)] = [s.x, s.y];
  }
  const small = V.small.map(label).filter(Boolean);
  return { B: { x0, y0, x1, y1 }, cities, small };
}

export const groupsFromCats = () =>
  CATS.map(c => ({ col: c.col, name: c.name, short: c.name }));

/** Where along its own route a GPS fix puts a train. Only the stretch near
 *  where the timetable expects it is searched, so a ring line passing the
 *  same station twice cannot snap to the wrong side. */
function snap(tr, x, y, near) {
  const P = tr.path;
  let best = null, bd = 2.0;             // more than 2 km off the route: not trusted
  for (let i = 0; i < P.n - 1; i++) {
    if (P.d[i + 1] < near - 25 || P.d[i] > near + 25) continue;
    const ax = P.x[i], ay = P.y[i], dx = P.x[i + 1] - ax, dy = P.y[i + 1] - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    const e = Math.hypot(ax + dx * f - x, ay + dy * f - y);
    if (e < bd) { bd = e; best = P.d[i] + (P.d[i + 1] - P.d[i]) * f; }
  }
  return best;
}

/** Attach fresh GPS fixes to the trains they belong to. Returns how many matched. */
export function applyFixes(fixes, timetableDist) {
  const N = minsNow();
  let n = 0;
  for (const f of fixes) {
    const tr = net.trains.get(f.id);
    if (!tr || tr.canc) continue;
    const at = minsAt(f.at);
    if (N - at > 2) continue;              // older than two minutes: the timetable knows better
    const [x, y] = project(f.lon, f.lat);
    const d = snap(tr, x, y, tr.dShow >= 0 ? tr.dShow : timetableDist(tr, N));
    if (d == null) continue;
    tr.gps = { d, at, v: f.speed / 60 };  // km per minute
    n++;
  }
  return n;
}
