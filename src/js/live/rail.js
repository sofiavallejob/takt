// Helpers for national rail feeds that list only the stations a train stops
// at (Sweden, Norway): routing expresses through the stations they pass, and
// a speed for GPS feeds that do not report one.

/** The rail network as the timetable knows it: every pair of stations some
 *  train runs between without stopping. An express hop is then routed along
 *  the way the stopping trains go, so it follows the line instead of cutting
 *  across the map. */
export class RouteGraph {
  /** `seqs` is an iterable of station-code arrays, one per train, in order. */
  constructor(stations, seqs) {
    this.st = stations;
    this.g = new Map();
    this.via = new Map();
    for (const seq of seqs) for (let i = 1; i < seq.length; i++) this.link(seq[i - 1], seq[i]);
  }

  link(a, b) {
    const A = this.st.get(a), B = this.st.get(b);
    if (!A || !B || a === b) return;
    const km = Math.hypot(A.x - B.x, A.y - B.y);
    for (const [p, q] of [[a, b], [b, a]]) {
      if (!this.g.has(p)) this.g.set(p, new Map());
      this.g.get(p).set(q, km);
    }
  }

  /** The stations between a and b on the way stopping trains go, or none
   *  when there is no way much longer than the straight line. */
  between(a, b) {
    const key = a + '>' + b;
    if (this.via.has(key)) return this.via.get(key);
    const A = this.st.get(a), B = this.st.get(b);
    let out = [];
    const direct = A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 0;
    if (direct > 12 && this.g.has(a)) {
      // Dijkstra, leaving out the express hop itself. Long hops cost more than
      // their length, so the way through every small station wins over other
      // expresses' hops. Track bends more over a long hop than a short one, so
      // a long one may take a longer way round.
      const limit = direct * (direct > 60 ? 1.45 : 1.2);
      const cost = new Map([[a, 0]]), real = new Map([[a, 0]]), prev = new Map(), open = [[0, a]];
      while (open.length) {
        open.sort((x, y) => x[0] - y[0]);
        const [c, u] = open.shift();
        if (u === b) break;
        if (c > (cost.get(u) ?? Infinity)) continue;
        for (const [v, km] of this.g.get(u) || []) {
          if (u === a && v === b) continue;
          const nc = c + km + km * km / 30, nr = real.get(u) + km;
          if (nr > limit || nc >= (cost.get(v) ?? Infinity)) continue;
          cost.set(v, nc); real.set(v, nr); prev.set(v, u); open.push([nc, v]);
        }
      }
      if (prev.has(b)) {
        for (let u = prev.get(b); u !== a; u = prev.get(u)) out.push(u);
        out.reverse();
      }
    }
    this.via.set(key, out);
    return out;
  }

  /** Put the stations an express passes without stopping into its rows (in
   *  place), timed by distance. */
  fill(rows) {
    for (let i = rows.length - 1; i > 0; i--) {
      const r0 = rows[i - 1], r1 = rows[i];
      if (r0.code === r1.code) continue;
      const via = this.between(r0.code, r1.code);
      if (!via.length) continue;
      const pts = [r0.code, ...via, r1.code].map(c => this.st.get(c));
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      const L = cum[cum.length - 1] || 1;
      rows.splice(i, 0, ...via.map((code, k) => ({
        code, dep: true, stop: false, commercial: false, cancelled: r1.cancelled,
        plan: r0.plan + (r1.plan - r0.plan) * cum[k + 1] / L, actual: NaN, estimate: NaN,
      })));
    }
  }
}

/** Speed (km/h) from a vehicle's last two fixes, for feeds without one. */
export class SpeedFromFixes {
  constructor() { this.last = new Map(); }

  at(id, lon, lat, at) {
    const prev = this.last.get(id);
    let speed = prev?.speed || 0;
    if (prev && at - prev.at > 5000) {
      const km = Math.hypot((lon - prev.lon) * 111.32 * Math.cos(lat * Math.PI / 180), (lat - prev.lat) * 110.57);
      speed = Math.min(250, km / ((at - prev.at) / 3600e3));
    }
    if (!prev || at > prev.at) this.last.set(id, { at, lon, lat, speed });
    return speed;
  }
}
