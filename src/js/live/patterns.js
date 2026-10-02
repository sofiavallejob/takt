// Live networks placed from their vehicles onto stopping patterns: the New
// York subway and Los Angeles Metro. Neither needs a daily timetable. The
// patterns (each sequence of stations a line runs, with typical minutes
// between them) are built now and then by tools/build_patterns.py; live, each
// vehicle is laid onto the pattern it is running, timed from the predictions
// the feed gives for its next stops, or failing those from where it is now.
//
// A city module supplies only `vehicles()`, returning plain records:
//   { id, line, dir, stop, status, at, lat, lon, speed, times }
// where `times` (optional) is [{ stop, t }] of predicted arrivals in ms,
// `stop` is the stop id it is at or heading for, and lat/lon (optional) a fix.

import { createNet, setStations, ingest, applyFixes, net } from './network.js';
import { actualDist } from '../geom.js';

/** A network from a city's pattern file and its live vehicles. */
export function patternNetwork(opts) {
  const rec = {
    pollMs: 30000,
    gpsMs: 10000,
    liveOnly: true,
    hasDelays: false,       // placed from predictions: there is no timetable to be late against
    byLine: true,
    ...opts,
    net: createNet(opts.centre[0], opts.centre[1]),
    groups: [],
    groupOrder: [],
    lines: {},
    routeLine: {},
    stopOf: {},
    byLine_: new Map(),     // `${line}/${dir}` -> patterns
    seen: new Map(),        // train id -> when it was last in the feed
    fixes: [],

    async load() {
      const d = await (await fetch(opts.data, { cache: 'no-cache' })).json();
      this.groups = d.families.map(([name, col]) => ({ col, name, short: name }));
      this.groupOrder = d.families.map(f => f[0]);
      this.lines = d.lines;
      this.routeLine = d.routes;
      this.stopOf = d.stop;
      this.codes = d.stations.map(s => s[0]);
      const stations = new Map();
      for (const [code, name, lat, lon] of d.stations) stations.set(code, { code, name, lat, lon, passenger: true });
      setStations(stations);

      // The main pattern of each line (the one most trips run) is its string.
      const main = new Map();
      for (const [line, dir, idx, mins, n] of d.patterns) {
        const p = { line, dir, idx, codes: idx.map(i => this.codes[i]), mins, n, at: new Map(idx.map((i, k) => [i, k])) };
        const k = `${line}/${dir}`;
        if (!this.byLine_.has(k)) this.byLine_.set(k, []);
        this.byLine_.get(k).push(p);
        const m = main.get(line);
        if (!m || n > m.n || (n === m.n && idx.length > m.idx.length)) main.set(line, p);
      }
      const shapes = [...main.values()].map(p => this.record(p, `shape/${p.line}`, Date.now() - 864e5, 0, 'shape'));
      ingest(shapes, true);
      for (const r of shapes) net.trains.delete(r.id);

      await this.update(() => true);
    },

    /** A train record for pattern `p`, reaching its stop `k` at `at` (ms);
     *  `known` (stop index -> ms) overrides the typical times where given. */
    record(p, id, at, k, version, known) {
      const [name, color, fam] = this.lines[p.line];
      const base = at - p.mins[k] * 60000, n = p.idx.length, plan = new Array(n);
      for (let i = 0; i < n; i++) plan[i] = base + p.mins[i] * 60000;
      if (known && known.size) {
        // Predicted stops as given; before the first, back along the typical
        // times; between and after, on from the last prediction.
        let last = -1;
        for (let i = 0; i < n; i++) {
          if (known.has(i)) { plan[i] = known.get(i); last = i; }
          else if (last >= 0) plan[i] = plan[last] + (p.mins[i] - p.mins[last]) * 60000;
        }
        const first = Math.min(...known.keys());
        for (let i = first - 1; i >= 0; i--) plan[i] = plan[first] - (p.mins[first] - p.mins[i]) * 60000;
      }
      return {
        id, version: String(version), date: '', number: id, type: 'metro',
        cat: this.catOf ? this.catOf(fam) : fam % 5, ci: fam, top: !!this.onTop?.(fam),
        string: `${this.key}:${p.line}`, lineName: name, name,
        color, groupName: this.groupOrder[fam], lateThr: Infinity, oper: this.name, cancelled: false,
        rows: p.codes.map((code, i) => ({
          code, stop: true, commercial: true, cancelled: false, dep: i === 0,
          plan: plan[i], actual: NaN, estimate: NaN,
        })),
      };
    },

    /** The pattern a vehicle is on: the shortest that holds every station it
     *  has a prediction for (an express skips the local stops), else the
     *  busiest that holds the station it is at. */
    pick(v) {
      const cands = v.dir == null
        ? [...(this.byLine_.get(`${v.line}/0`) || []), ...(this.byLine_.get(`${v.line}/1`) || [])]
        : this.byLine_.get(`${v.line}/${v.dir}`) || [];
      if (!cands.length) return null;
      const want = (v.times || []).map(x => this.stopOf[x.stop]).filter(i => i != null);
      if (want.length) {
        let best = null;
        for (const p of cands) {
          let k = -1, ok = true;
          for (const i of want) { const j = p.at.get(i); if (j == null || j < k) { ok = false; break; } k = j; }
          if (ok && (!best || p.idx.length < best.idx.length)) best = p;
        }
        if (best) return best;
      }
      const here = this.stopOf[v.stop] ?? want[0];
      let best = null;
      for (const p of cands) if (p.at.has(here) && (!best || p.n > best.n)) best = p;
      return best;
    },

    async update(still) {
      const vs = await this.vehicles(still);
      if (!still()) return;
      const now = Date.now(), raws = [], fixes = [];
      for (const v of vs) {
        const p = this.pick(v);
        if (!p) continue;
        let k = p.at.get(this.stopOf[v.stop]), known = null;
        if (v.times && v.times.length) {
          known = new Map();
          for (const x of v.times) {
            const j = p.at.get(this.stopOf[x.stop]);
            if (j != null && Number.isFinite(x.t)) known.set(j, x.t);
          }
          if (known.size) k = Math.min(...known.keys());
        }
        if (k == null) continue;
        const at = known && known.size ? known.get(k) : v.status === 'STOPPED_AT' ? now : now + 30000;
        raws.push(this.record(p, v.id, at, k, v.at || now, known));
        this.seen.set(v.id, now);
        if (v.lat != null) fixes.push({ id: v.id, lon: v.lon, lat: v.lat, speed: v.speed || 0, at: v.at || now });
      }
      ingest(raws, false);
      // A vehicle gone from the feed has finished, or gone out of service.
      for (const [id, t] of this.seen) {
        if (now - t > 2.5 * this.pollMs) { net.trains.delete(id); this.seen.delete(id); }
      }
      this.fixes = fixes;
    },

    async positions(still) {
      if (!still()) return 0;
      return applyFixes(this.fixes, actualDist);
    },
  };
  return rec;
}
