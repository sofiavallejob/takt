// Stockholm: the tunnelbana, live from Samtrafiken's GTFS Sweden 3 Realtime.
//
// The live feed names trips by the ids in the national static timetable of
// the same day, so the timetable is cut down to the metro once a day
// (tools/build_sto.py, run by a GitHub Action) and shipped as data/sto/.
// Everything that changes during the day comes from the live feed.

import { CREDITS_STO } from '../config.js';
import { fetchFeed } from './gtfsrt.js';
import { createNet, setStations, ingest, applyFixes } from './network.js';
import { dateAt, shiftDate, midnight, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';

// A Trafiklab key for GTFS Sweden 3 Realtime. It is read-only and visible to
// anyone who opens the page; keep an eye on its quota on trafiklab.se.
const RT_KEY = 'a1c6e213032143c1be8fa5abb82a3377';
const RT = 'https://opendata.samtrafiken.se/gtfs-rt-sweden/sl/';

const FAMILIES = [
  { name: 'Blue line', col: '#0089ca' },
  { name: 'Red line', col: '#e3242b' },
  { name: 'Green line', col: '#4ba946' },
];
const FAMILY_OF = { 10: 0, 11: 0, 13: 1, 14: 1, 17: 2, 18: 2, 19: 2 };

const iso = ymd => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

export const sto = {
  key: 'sto',
  name: 'Stockholm',
  tz: 'Europe/Stockholm',
  views: ['sto'],
  regions: 'data/sto-regions.json',
  pollMs: 30000,
  gpsMs: 15000,
  credits: CREDITS_STO,
  groups: FAMILIES.map(f => ({ col: f.col, name: f.name, short: f.name })),
  groupOrder: FAMILIES.map(f => f.name),
  byLine: true,
  net: createNet(18.05, 59.33),
  today: null,
  base: new Map(),     // id -> the trip as timetabled, before any live news
  datesOf: new Map(),  // trip_id -> service dates it runs on

  async load() {
    const index = await (await fetch('data/sto/index.json', { cache: 'no-cache' })).json();
    this.today = dateAt(Date.now());
    if (!index.dates.includes(this.today)) {
      throw new Error(`No Stockholm timetable for ${this.today} yet (have ${index.dates.join(', ')})`);
    }
    const T = minuteOfDay(), want = [this.today];
    const y = shiftDate(this.today, -1), t = shiftDate(this.today, 1);
    if (T < 4 * 60 && index.dates.includes(y)) want.unshift(y);   // trips after midnight belong to yesterday
    if (T > 22 * 60 && index.dates.includes(t)) want.push(t);
    const days = await Promise.all(want.map(d => fetch(`data/sto/${d}.json`).then(r => r.json())));

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
    for (const [tid, line, , flat] of day.trips) {
      const fam = FAMILY_OF[line] ?? 2, rows = [], n = flat.length / 4;
      for (let k = 0; k < n; k++) {
        const [si, arr, dwell, seq] = flat.slice(4 * k, 4 * k + 4);
        const code = day.stations[si][0];
        const base = { code, stop: true, commercial: true, cancelled: false, actual: NaN, estimate: NaN, seq };
        if (k > 0) rows.push({ ...base, dep: false, plan: mid + arr * 1000 });
        if (k < n - 1) rows.push({ ...base, dep: true, plan: mid + (arr + dwell) * 1000 });
      }
      const raw = {
        id: `${day.date}/${tid}`, date: day.date, number: tid, version: '0',
        type: 'metro', cat: fam, ci: fam, line: String(line), lineName: `Line ${line}`,
        name: `Line ${line}`, color: FAMILIES[fam].col, groupName: FAMILIES[fam].name,
        lateThr: 3, oper: 'SL', cancelled: false, rows,
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

  /** Which service date a live trip id belongs to, when the feed does not say. */
  idFor(trip) {
    if (trip.startDate) return `${iso(trip.startDate)}/${trip.tripId}`;
    const ds = this.datesOf.get(trip.tripId);
    if (!ds) return null;
    if (ds.length === 1) return `${ds[0]}/${trip.tripId}`;
    // Running on several loaded days: the one whose timetable covers now.
    const now = Date.now();
    for (const d of ds) {
      const r = this.base.get(`${d}/${trip.tripId}`).rows;
      if (now >= r[0].plan - 3600e3 && now <= r[r.length - 1].plan + 3600e3) return `${d}/${trip.tripId}`;
    }
    return `${ds[0]}/${trip.tripId}`;
  },

  async update(still) {
    const d = dateAt(Date.now());
    if (d !== this.today) {
      // A new service day: its timetable is a static file; if the daily build
      // has not landed yet, keep going on what is loaded.
      try {
        const day = await (await fetch(`data/sto/${d}.json`)).json();
        if (!still()) return;
        this.today = d;
        ingest(this.timetabled(day), false);
      } catch { /* try again next poll */ }
    }
    const feed = await fetchFeed(`${RT}TripUpdatesSweden.pb?key=${RT_KEY}`);
    if (!still()) return;
    const now = Date.now(), raws = [];
    for (const tu of feed.tripUpdates) {
      const id = tu.trip && this.idFor(tu.trip);
      const base = id && this.base.get(id);
      if (!base) continue;                        // not a metro trip
      const bySeq = new Map(tu.stops.map(s => [s.seq, s]));
      let lastDelay = null;
      const rows = base.rows.map(r => {
        const u = bySeq.get(r.seq);
        if (!u) {
          // GTFS Realtime: a delay holds for the stops after it until the next update.
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
      raws.push({
        ...base, rows, cancelled: tu.trip.rel === 3,
        version: String(tu.timestamp || feed.timestamp),
      });
    }
    ingest(raws, false);
  },

  async positions(still) {
    const feed = await fetchFeed(`${RT}VehiclePositionsSweden.pb?key=${RT_KEY}`);
    if (!still()) return 0;
    const fixes = [];
    for (const v of feed.vehicles) {
      if (!v.trip || !v.pos) continue;
      const id = this.idFor(v.trip);
      if (!id || !this.base.has(id)) continue;
      fixes.push({
        id, lon: v.pos.lon, lat: v.pos.lat,
        speed: (v.pos.speed || 0) * 3.6,          // m/s in the feed, km/h here
        at: (v.timestamp || feed.timestamp) * 1000,
      });
    }
    return applyFixes(fixes, actualDist);
  },
};
