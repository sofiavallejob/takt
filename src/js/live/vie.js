// Vienna: Wiener Linien's U-Bahn and trams, to the timetable.
//
// Wiener Linien publishes live departures, but its API sends no CORS header,
// so a web page is not allowed to read it. Until there is a small relay for
// it, Vienna plays the day's timetable, cut once a day from Wiener Linien's
// GTFS (tools/build_vienna.py, run by a GitHub Action) into data/vie/. The
// trains run exactly to plan, so nothing is late and nothing is cancelled.

import { CREDITS_AT } from '../config.js';
import { createNet, setStations, ingest } from './network.js';
import { dateAt, shiftDate, midnight, minuteOfDay } from './clock.js';

const FAMILIES = [
  { name: 'U1', col: '#e3000f' }, { name: 'U2', col: '#a762a4' }, { name: 'U3', col: '#ee7d00' },
  { name: 'U4', col: '#319f49' }, { name: 'U5', col: '#008f95' }, { name: 'U6', col: '#9d6930' },
  { name: 'Tram', col: '#bf6b70' },      // a softer red, so the U-Bahn stands out over the trams
];

export const vie = {
  key: 'vie',
  name: 'Vienna',
  noun: 'U-Bahn trains and trams',
  tz: 'Europe/Vienna',
  views: ['vie'],
  regions: 'data/vienna-regions.json',
  pollMs: 60000,
  gpsMs: 600000,
  timetableOnly: true,
  hasDelays: false,
  credits: CREDITS_AT,
  groups: [],          // the families running today (U5 is still being built)
  groupOrder: [],
  ciOf: new Map(),     // family in the data -> its place in `groups`
  byLine: true,
  net: createNet(16.37, 48.21),
  today: null,

  async load() {
    const index = await (await fetch('data/vie/index.json', { cache: 'no-cache' })).json();
    this.today = dateAt(Date.now());
    if (!index.dates.includes(this.today)) {
      throw new Error(`No Vienna timetable for ${this.today} yet (have ${index.dates.join(', ')})`);
    }
    const want = [this.today], y = shiftDate(this.today, -1);
    if (minuteOfDay() < 4 * 60 && index.dates.includes(y)) want.unshift(y);   // trips after midnight belong to yesterday
    const days = await Promise.all(want.map(d => fetch(`data/vie/${d}.json`).then(r => r.json())));
    const stations = new Map();
    for (const day of days) {
      for (const [code, name, lat, lon] of day.stations) {
        if (!stations.has(code)) stations.set(code, { code, name, lat, lon, passenger: true });
      }
    }
    setStations(stations);
    const fams = [...new Set(days.flatMap(day => Object.values(day.lines).map(l => l[2])))].sort((a, b) => a - b);
    this.ciOf = new Map(fams.map((f, i) => [f, i]));
    this.groups = fams.map(f => ({ col: FAMILIES[f].col, name: FAMILIES[f].name, short: FAMILIES[f].name }));
    this.groupOrder = fams.map(f => FAMILIES[f].name);
    for (const day of days) ingest(this.timetabled(day), true);
  },

  /** One day's trips as plain train records. */
  timetabled(day) {
    const mid = midnight(day.date), out = [];
    for (const [tid, line, , flat] of day.trips) {
      const [name, , fam] = day.lines[line];
      const color = FAMILIES[fam].col;
      const rows = [], n = flat.length / 3;
      for (let k = 0; k < n; k++) {
        const [si, arr, dwell] = flat.slice(3 * k, 3 * k + 3);
        const base = { code: day.stations[si][0], stop: true, commercial: true, cancelled: false, actual: NaN, estimate: NaN };
        if (k > 0) rows.push({ ...base, dep: false, plan: mid + arr * 1000 });
        if (k < n - 1) rows.push({ ...base, dep: true, plan: mid + (arr + dwell) * 1000 });
      }
      out.push({
        id: `${day.date}/${tid}`, date: day.date, number: tid, version: '0',
        type: fam === 6 ? 'tram' : 'metro', cat: fam === 6 ? 3 : 1, ci: this.ciOf.get(fam) ?? 0, top: fam !== 6,
        string: `vie:${line}`, lineName: name, name, color, groupName: FAMILIES[fam].name,
        lateThr: Infinity, oper: 'Wiener Linien', cancelled: false, rows,
      });
    }
    return out;
  },

  /** Nothing live to ask for: only a new day's timetable, once it is there. */
  async update(still) {
    const d = dateAt(Date.now());
    if (d === this.today) return;
    try {
      const day = await (await fetch(`data/vie/${d}.json`)).json();
      if (!still()) return;
      this.today = d;
      ingest(this.timetabled(day), false);
    } catch { /* the daily build has not landed yet: try again next poll */ }
  },

  async positions() { return 0; },
};
