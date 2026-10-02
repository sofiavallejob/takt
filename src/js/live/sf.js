// San Francisco: BART, and Muni's rail (Muni Metro, the F streetcar and the
// cable cars), live from 511.org's GTFS Realtime feeds.
//
// The live feeds name trips by the ids in the static timetables, so those are
// cut down once a day (tools/build_sf.py, run by a GitHub Action) and shipped
// as data/sf/. BART reports predicted times for its trips (no positions);
// Muni reports where its vehicles are (its trip updates come only as one
// megabyte file covering every bus), so a Muni train's delay is read off where
// it is against where the timetable has it.
//
// 511 allows a token 60 requests an hour, shared by everyone listening, so
// the feeds are asked rarely: two requests every three minutes. Between
// answers, and whenever the limit is reached, the trains run on the timetable
// with the last delays they reported.

import { CREDITS_US } from '../config.js';
import { fetchFeed } from './gtfsrt.js';
import { createNet, setStations, ingest, applyFixes, net, minsNow } from './network.js';
import { dateAt, shiftDate, midnight, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';

// A 511.org token. It is read-only and visible to anyone who opens the page.
const TOKEN = '7d764f47-d2e3-4b71-8034-70ef9493cdb6';
const RT = 'https://api.511.org/transit/';

const FAMILIES = [
  { name: 'BART', col: '#0a6fb5' },
  { name: 'Muni Metro', col: '#c8102e' },
  { name: 'Streetcar', col: '#d98e04' },
  { name: 'Cable car', col: '#7a4b2a' },
];

const iso = ymd => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/** Where the timetable has a train at distance `dist`, in minutes. */
function planAt(tr, dist) {
  const d = tr.d, t = tr.t, n = d.length;
  if (dist <= d[0]) return t[0];
  for (let i = 1; i < n; i++) {
    if (dist <= d[i]) {
      const f = d[i] > d[i - 1] ? (dist - d[i - 1]) / (d[i] - d[i - 1]) : 1;
      return t[i - 1] + (t[i] - t[i - 1]) * f;
    }
  }
  return t[n - 1];
}

export const sf = {
  key: 'sf',
  name: 'San Francisco',
  noun: 'trains, trams and cable cars',
  tz: 'America/Los_Angeles',
  views: ['sf', 'bay'],
  regions: 'data/sf-regions.json',
  pollMs: 180000,
  gpsMs: 5000,          // applies the fixes the last poll brought; asks the feed for nothing
  backoffMs: 15 * 60000,
  credits: CREDITS_US,
  groups: FAMILIES.map(f => ({ col: f.col, name: f.name, short: f.name })),
  groupOrder: FAMILIES.map(f => f.name),
  byLine: true,
  net: createNet(-122.27, 37.75),
  today: null,
  base: new Map(),      // id -> the trip as timetabled
  datesOf: new Map(),   // trip id -> service dates it runs on
  platformOf: new Map(), // BART platform stop id -> station code
  fixes: [],

  async load() {
    const index = await (await fetch('data/sf/index.json', { cache: 'no-cache' })).json();
    this.today = dateAt(Date.now());
    if (!index.dates.includes(this.today)) {
      throw new Error(`No San Francisco timetable for ${this.today} yet (have ${index.dates.join(', ')})`);
    }
    const T = minuteOfDay(), want = [this.today];
    const y = shiftDate(this.today, -1);
    if (T < 4 * 60 && index.dates.includes(y)) want.unshift(y);   // trips after midnight belong to yesterday
    const days = await Promise.all(want.map(d => fetch(`data/sf/${d}.json`).then(r => r.json())));
    const stations = new Map();
    for (const day of days) {
      for (const [code, name, lat, lon] of day.stations) {
        if (!stations.has(code)) stations.set(code, { code, name, lat, lon, passenger: true });
      }
    }
    setStations(stations);
    for (const day of days) ingest(this.timetabled(day), true);
  },

  /** One day's static trips as plain train records. */
  timetabled(day) {
    const mid = midnight(day.date), out = [];
    for (const [p, si] of Object.entries(day.platforms)) this.platformOf.set(p, day.stations[si][0]);
    for (const [tid, line, , flat] of day.trips) {
      const [name, color, fam] = day.lines[line];
      const rows = [], n = flat.length / 4;
      for (let k = 0; k < n; k++) {
        const [si, arr, dwell, seq] = flat.slice(4 * k, 4 * k + 4);
        const code = day.stations[si][0];
        const base = { code, stop: true, commercial: true, cancelled: false, actual: NaN, estimate: NaN, seq };
        if (k > 0) rows.push({ ...base, dep: false, plan: mid + arr * 1000 });
        if (k < n - 1) rows.push({ ...base, dep: true, plan: mid + (arr + dwell) * 1000 });
      }
      const raw = {
        id: `${day.date}/${tid}`, date: day.date, number: tid, version: '0',
        type: fam === 0 ? 'train' : 'tram', cat: fam, ci: fam, line, lineName: name, name,
        // Late as each operator counts it: BART within 5 minutes; Muni no more than 4 behind.
        color, groupName: FAMILIES[fam].name, lateThr: 5,
        oper: fam === 0 ? 'BART' : 'Muni', cancelled: false, rows,
      };
      if (!this.base.has(raw.id)) {
        if (!this.datesOf.has(tid)) this.datesOf.set(tid, []);
        this.datesOf.get(tid).push(day.date);
      }
      this.base.set(raw.id, raw);
      out.push(raw);
    }
    return out;
  },

  /** The timetable id of a live trip: agency prefix, and the service date. */
  idFor(agency, trip) {
    const tid = `${agency}:${trip.tripId}`;
    if (trip.startDate) {
      const id = `${iso(trip.startDate)}/${tid}`;
      if (this.base.has(id)) return id;
    }
    const ds = this.datesOf.get(tid);
    if (!ds) return null;
    if (ds.length === 1) return `${ds[0]}/${tid}`;
    const now = Date.now();
    for (const d of ds) {
      const r = this.base.get(`${d}/${tid}`).rows;
      if (now >= r[0].plan - 3600e3 && now <= r[r.length - 1].plan + 3600e3) return `${d}/${tid}`;
    }
    return `${ds[0]}/${tid}`;
  },

  /** BART's predicted times. Its feed names stops by platform, not by sequence. */
  bart(feed) {
    const now = Date.now(), raws = [];
    for (const tu of feed.tripUpdates) {
      const id = tu.trip && this.idFor('BA', tu.trip);
      const base = id && this.base.get(id);
      if (!base) continue;
      const byCode = new Map();
      for (const s of tu.stops) {
        const code = s.stopId && this.platformOf.get(s.stopId);
        if (code) byCode.set(code, s);
      }
      let lastDelay = null;
      const rows = base.rows.map(r => {
        const u = byCode.get(r.code);
        if (!u) {
          if (lastDelay == null) return r;
          const t = r.plan + lastDelay;
          return { ...r, [t <= now ? 'actual' : 'estimate']: t };
        }
        if (u.rel === 1) return { ...r, cancelled: true };
        const ev = (r.dep ? (u.dep || u.arr) : (u.arr || u.dep)) || {};
        let t = null;
        if (ev.time) t = ev.time * 1000;
        else if (ev.delay != null) t = r.plan + ev.delay * 1000;
        if (t == null) return r;
        lastDelay = t - r.plan;
        return { ...r, [t <= now ? 'actual' : 'estimate']: t };
      });
      raws.push({ ...base, rows, cancelled: tu.trip.rel === 3, version: String(tu.timestamp || feed.timestamp) });
    }
    return raws;
  },

  /** Muni's vehicles: rail only, as GPS fixes. */
  muni(feed) {
    const fixes = [];
    for (const v of feed.vehicles) {
      if (!v.trip || !v.pos) continue;
      const id = this.idFor('SF', v.trip);
      if (!id) continue;                          // a bus, or a trip not in today's timetable
      fixes.push({
        id, lon: v.pos.lon, lat: v.pos.lat, speed: (v.pos.speed || 0) * 3.6,
        at: (v.timestamp || feed.timestamp) * 1000,
      });
    }
    return fixes;
  },

  /** How late each Muni train is, from where its fix puts it against where
   *  the timetable has it, carried along its whole trip. */
  muniDelays() {
    const now = Date.now(), N = minsNow(), raws = [];
    for (const f of this.fixes) {
      const tr = net.trains.get(f.id), base = this.base.get(f.id);
      if (!tr || !base || !tr.gps || N - tr.gps.at > 2) continue;
      const late = tr.gps.at - planAt(tr, tr.gps.d);          // minutes, at the moment of the fix
      if (!(late > -10 && late < 90)) continue;               // a fix on the wrong trip
      const delay = late * 60000;
      raws.push({
        ...base, version: String(f.at),
        rows: base.rows.map(r => {
          const t = r.plan + delay;
          return { ...r, [t <= now ? 'actual' : 'estimate']: t };
        }),
      });
    }
    return raws;
  },

  async update(still) {
    const d = dateAt(Date.now());
    if (d !== this.today) {
      try {
        const day = await (await fetch(`data/sf/${d}.json`)).json();
        if (!still()) return;
        this.today = d;
        ingest(this.timetabled(day), false);
      } catch { /* the daily build has not landed yet: try again next poll */ }
    }
    const [ba, sfv] = await Promise.all([
      fetchFeed(`${RT}tripupdates?api_key=${TOKEN}&agency=BA`),
      fetchFeed(`${RT}vehiclepositions?api_key=${TOKEN}&agency=SF`),
    ]);
    if (!still()) return;
    ingest(this.bart(ba), false);
    this.fixes = this.muni(sfv);
    applyFixes(this.fixes, actualDist);
    ingest(this.muniDelays(), false);
  },

  /** The fixes the last poll brought, while they are fresh: no request. */
  async positions(still) {
    if (!still()) return 0;
    return applyFixes(this.fixes, actualDist);
  },
};
