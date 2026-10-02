// Helsinki: the metro and the trams, live from HSL's high-frequency
// positioning feed (HFP), which every vehicle publishes about once a second
// over MQTT. Each message names its journey by route, direction, operating day
// and start time, and says how far ahead of or behind the timetable it is.
//
// The timetable those names point into is cut from HSL's GTFS once a day
// (tools/build_hel.py, run by a GitHub Action) and shipped as data/hel/.

import { CREDITS_HEL } from '../config.js';
import { subscribe } from './mqtt.js';
import { createNet, setStations, ingest, applyFixes } from './network.js';
import { dateAt, shiftDate, midnight, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';

const HFP = 'wss://mqtt.hsl.fi:443/';
const TOPICS = ['/hfp/v2/journey/ongoing/vp/metro/#', '/hfp/v2/journey/ongoing/vp/tram/#'];

const FAMILIES = [
  { name: 'Metro', col: '#ff6319' },
  { name: 'Tram', col: '#00985f' },
];

export const hel = {
  key: 'hsl',
  name: 'Helsinki metro & tram',
  noun: 'metros and trams',
  tz: 'Europe/Helsinki',
  views: ['hsl'],
  regions: 'data/hel-regions.json',
  pollMs: 10000,
  gpsMs: 5000,
  credits: CREDITS_HEL,
  groups: FAMILIES.map(f => ({ col: f.col, name: f.name, short: f.name })),
  groupOrder: FAMILIES.map(f => f.name),
  byLine: true,
  net: createNet(24.94, 60.19),
  today: null,
  base: new Map(),     // id -> the journey as timetabled
  latest: new Map(),   // id -> the newest HFP message for it
  applied: new Map(),  // id -> the delay (ms) its rows were last rebuilt with
  stream: null,
  lastUse: 0,

  async load() {
    const index = await (await fetch('data/hel/index.json', { cache: 'no-cache' })).json();
    this.today = dateAt(Date.now());
    if (!index.dates.includes(this.today)) {
      throw new Error(`No Helsinki timetable for ${this.today} yet (have ${index.dates.join(', ')})`);
    }
    const T = minuteOfDay(), want = [this.today];
    const y = shiftDate(this.today, -1);
    if (T < 5 * 60 && index.dates.includes(y)) want.unshift(y);   // trips after midnight belong to yesterday
    const days = await Promise.all(want.map(d => fetch(`data/hel/${d}.json`).then(r => r.json())));
    const stations = new Map();
    for (const day of days) {
      for (const [code, name, lat, lon] of day.stations) {
        if (!stations.has(code)) stations.set(code, { code, name, lat, lon, passenger: true });
      }
    }
    setStations(stations);
    for (const day of days) ingest(this.timetabled(day), true);
    this.listen();
  },

  /** Keep the stream open while this network is in use; it closes itself a
   *  minute after the listener has moved to another one. */
  listen() {
    this.lastUse = Date.now();
    if (this.stream) return;
    this.stream = subscribe(HFP, TOPICS, (topic, text) => {
      if (Date.now() - this.lastUse > 60000) { this.stream?.close(); this.stream = null; return; }
      let vp;
      try { vp = JSON.parse(text).VP; } catch { return; }
      if (!vp || vp.lat == null || !vp.route || !vp.start || !vp.oday) return;
      const id = this.idFor(vp);
      if (id) this.latest.set(id, vp);
    });
  },

  /** The timetable id of a live journey. A journey after midnight starts at
   *  01:10 in the feed and at 25:10 in the timetable. */
  idFor(vp) {
    const id = `${vp.oday}/${vp.route}/${vp.dir}/${vp.start}`;
    if (this.base.has(id)) return id;
    const [h, m] = vp.start.split(':');
    const late = `${vp.oday}/${vp.route}/${vp.dir}/${String(+h + 24).padStart(2, '0')}:${m}`;
    return this.base.has(late) ? late : null;
  },

  timetabled(day) {
    const mid = midnight(day.date), out = [];
    for (const [key, line, kind, flat] of day.trips) {
      const fam = kind === 'metro' ? 0 : 1, rows = [], n = flat.length / 3;
      for (let k = 0; k < n; k++) {
        const [si, arr, dwell] = flat.slice(3 * k, 3 * k + 3);
        const code = day.stations[si][0];
        const base = { code, stop: true, commercial: true, cancelled: false, actual: NaN, estimate: NaN };
        if (k > 0) rows.push({ ...base, dep: false, plan: mid + arr * 1000 });
        if (k < n - 1) rows.push({ ...base, dep: true, plan: mid + (arr + dwell) * 1000 });
      }
      const name = fam === 0 ? `Metro ${line}` : `Tram ${line}`;
      const raw = {
        id: `${day.date}/${key}`, date: day.date, number: key, version: '0',
        type: kind, cat: fam, ci: fam, line, lineName: name, name,
        color: FAMILIES[fam].col, groupName: FAMILIES[fam].name,
        lateThr: 3, oper: 'HSL', cancelled: false, rows,
      };
      this.base.set(raw.id, raw);
      out.push(raw);
    }
    return out;
  },

  /** A new service day, and the delays the vehicles report, as rebuilt journeys. */
  async update(still) {
    this.listen();
    const d = dateAt(Date.now());
    if (d !== this.today) {
      try {
        const day = await (await fetch(`data/hel/${d}.json`)).json();
        if (!still()) return;
        this.today = d;
        ingest(this.timetabled(day), false);
      } catch { /* the daily build has not landed yet: try again next poll */ }
    }
    const now = Date.now(), raws = [];
    for (const [id, vp] of this.latest) {
      if (now - Date.parse(vp.tst) > 120000) { this.latest.delete(id); continue; }
      // dl is seconds ahead of the timetable; a few vehicles report nonsense.
      if (vp.dl == null || Math.abs(vp.dl) > 1800) continue;
      const delay = -vp.dl * 1000, was = this.applied.get(id);
      if (was != null && Math.abs(delay - was) < 20000) continue;
      this.applied.set(id, delay);
      const base = this.base.get(id);
      raws.push({
        ...base, version: String(now),
        rows: base.rows.map(r => {
          const t = r.plan + delay;
          return { ...r, [t <= now ? 'actual' : 'estimate']: t };
        }),
      });
    }
    if (raws.length) ingest(raws, false);
  },

  async positions(still) {
    this.listen();
    if (!still()) return 0;
    const fixes = [];
    for (const [id, vp] of this.latest) {
      fixes.push({ id, lon: vp.long, lat: vp.lat, speed: (vp.spd || 0) * 3.6, at: Date.parse(vp.tst) });
    }
    return applyFixes(fixes, actualDist);
  },
};
