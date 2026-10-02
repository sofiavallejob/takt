// Boston: the MBTA subway (Red, Orange, Blue and Green Lines, and the
// Mattapan trolley), live from the MBTA V3 API.
//
// The subway runs to headways, not to a timetable: most trips in the live
// feed are added on the day and appear in no published schedule. So nothing
// is downloaded ahead. On load the page reads each line's stopping patterns;
// then, every ten seconds, where every vehicle is. A train is its vehicle's
// pattern, with times laid out from where the vehicle is now at the line's
// typical speed, and its GPS fix on top. There is no lateness to hear: a
// headway service is never behind a timetable it does not have.

import { CREDITS_US } from '../config.js';
import { createNet, setStations, ingest, applyFixes, net } from './network.js';
import { actualDist } from '../geom.js';

// An MBTA V3 API key. It is read-only and visible to anyone who opens the
// page; the limit (1000 requests a minute) is shared by everyone listening.
const KEY = 'dbc80ec15df14523ad957a8ac7a54db5';
const API = 'https://api-v3.mbta.com';
const ROUTES = ['Red', 'Mattapan', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E'];

const FAMILIES = [
  { name: 'Red Line', col: '#da291c' },
  { name: 'Orange Line', col: '#ed8b00' },
  { name: 'Blue Line', col: '#003da5' },
  { name: 'Green Line', col: '#00843d' },
  { name: 'Mattapan trolley', col: '#9b2335' },
];
const FAMILY_OF = { Red: 0, Orange: 1, Blue: 2, Mattapan: 4 };
const familyOf = route => FAMILY_OF[route] ?? 3;
const LINE_NAME = { Red: 'Red Line', Orange: 'Orange Line', Blue: 'Blue Line', Mattapan: 'Mattapan trolley' };
const lineName = route => LINE_NAME[route] || `Green Line ${route.slice(6)}`;
// Average speed between stations, dwell included: heavy rail, and the Green
// Line and Mattapan running on the street for much of their length.
const KMH = { 0: 32, 1: 32, 2: 32, 3: 17, 4: 22 };

async function get(path) {
  const res = await fetch(API + path, { headers: { 'x-api-key': KEY } });
  if (!res.ok) throw new Error(`${res.status} ${path.split('?')[0]}`);
  return res.json();
}

export const bos = {
  key: 'bos',
  name: 'Boston',
  noun: 'trains and trolleys',
  tz: 'America/New_York',
  views: ['bos'],
  regions: 'data/bos-regions.json',
  pollMs: 10000,
  gpsMs: 10000,
  liveOnly: true,
  hasDelays: false,     // headways: no late or cancelled marks in the key
  peak: 130,            // about as many as run at once at the height of the rush
  credits: CREDITS_US,
  groups: FAMILIES.map(f => ({ col: f.col, name: f.name, short: f.name })),
  groupOrder: FAMILIES.map(f => f.name),
  byLine: true,
  net: createNet(-71.08, 42.35),
  patterns: new Map(),   // pattern id -> { route, dir, codes, mins, string }
  typical: new Map(),    // `${route}/${dir}` -> the main pattern, for trips without one
  parentOf: new Map(),   // platform id -> station code
  seen: new Map(),       // train id -> when its vehicle was last in the feed
  fixes: [],

  async load() {
    const [stops, pats] = await Promise.all([
      get('/stops?filter[route_type]=0,1&fields[stop]=name,latitude,longitude,parent_station'),
      get(`/route_patterns?filter[route]=${ROUTES.join(',')}&include=representative_trip.stops`
        + '&fields[route_pattern]=typicality,direction_id,route,representative_trip&fields[trip]=stops&fields[stop]=name'),
    ]);

    // Stations are parent stations; their place is the middle of their platforms.
    const acc = new Map();
    for (const s of stops.data) {
      const code = s.relationships?.parent_station?.data?.id || s.id;
      this.parentOf.set(s.id, code);
      const a = acc.get(code) || { name: s.attributes.name, lat: 0, lon: 0, n: 0 };
      a.lat += s.attributes.latitude; a.lon += s.attributes.longitude; a.n++;
      acc.set(code, a);
    }
    const stations = new Map();
    for (const [code, a] of acc) stations.set(code, { code, name: a.name, lat: a.lat / a.n, lon: a.lon / a.n, passenger: true });
    setStations(stations);

    // Every regular stopping pattern; shuttle buses (typicality 4 and up) are left out.
    const trips = new Map((pats.included || []).filter(x => x.type === 'trip').map(t => [t.id, t]));
    const main = new Map();
    for (const p of pats.data) {
      const route = p.relationships.route?.data?.id;
      if (!ROUTES.includes(route) || p.attributes.typicality > 3) continue;
      const trip = trips.get(p.relationships.representative_trip.data.id);
      const codes = (trip?.relationships?.stops?.data || [])
        .map(s => this.parentOf.get(s.id)).filter(c => stations.has(c))
        .filter((c, i, a) => c !== a[i - 1]);
      if (codes.length < 2) continue;
      // Cumulative minutes along the pattern at the line's typical speed.
      const kmh = KMH[familyOf(route)], mins = [0];
      for (let i = 1; i < codes.length; i++) {
        const a = stations.get(codes[i - 1]), b = stations.get(codes[i]);
        const km = Math.hypot((b.x - a.x), (b.y - a.y));
        mins.push(mins[i - 1] + km / kmh * 60);
      }
      const pat = { id: p.id, route, dir: p.attributes.direction_id, codes, mins, typicality: p.attributes.typicality };
      this.patterns.set(p.id, pat);
      if (p.attributes.typicality === 1) {
        // One string per branch, both directions alike.
        pat.string = `B:${route}:${[codes[0], codes[codes.length - 1]].sort().join('-')}`;
        const k = `${route}/${pat.dir}`;
        if (!main.has(k) || codes.length > main.get(k).codes.length) main.set(k, pat);
      }
    }
    this.typical = main;
    // A short turn or a diversion sounds on its line's main string.
    for (const p of this.patterns.values()) if (!p.string) p.string = main.get(`${p.route}/${p.dir}`)?.string;

    // Shape every string from its main pattern, so the whole network is on
    // the map before the first train is placed.
    const shapes = [...this.patterns.values()].filter(p => p.typicality === 1)
      .map(p => this.record(p, `shape/${p.id}`, Date.now() - 864e5, 0, 'shape'));
    ingest(shapes, true);
    for (const r of shapes) net.trains.delete(r.id);

    await this.update(() => true);
  },

  /** A train record for a pattern, with stop `k` reached at time `at` (ms). */
  record(p, id, at, k, version) {
    const fam = familyOf(p.route), base = at - p.mins[k] * 60000;
    return {
      id, version: String(version), date: '', number: id, type: fam === 3 || fam === 4 ? 'tram' : 'metro',
      cat: fam, ci: fam, string: p.string, lineName: lineName(p.route), name: lineName(p.route),
      color: FAMILIES[fam].col, groupName: FAMILIES[fam].name, lateThr: Infinity, oper: 'MBTA', cancelled: false,
      rows: p.codes.map((code, i) => ({
        code, stop: true, commercial: true, cancelled: false, dep: i === 0,
        plan: base + p.mins[i] * 60000, actual: NaN, estimate: NaN,
      })),
    };
  },

  async update(still) {
    const v = await get(`/vehicles?filter[route]=${ROUTES.join(',')}&include=trip`
      + '&fields[vehicle]=latitude,longitude,speed,current_status,updated_at,direction_id,route,trip,stop&fields[trip]=route_pattern');
    if (!still()) return;
    const trips = new Map((v.included || []).map(t => [t.id, t]));
    const now = Date.now(), raws = [], fixes = [];
    for (const x of v.data) {
      const route = x.relationships.route?.data?.id, tripId = x.relationships.trip?.data?.id;
      const stop = x.relationships.stop?.data?.id;
      if (!route || !tripId || !stop) continue;
      const pid = trips.get(tripId)?.relationships?.route_pattern?.data?.id;
      const p = this.patterns.get(pid) || this.typical.get(`${route}/${x.attributes.direction_id}`);
      if (!p) continue;
      const k = p.codes.indexOf(this.parentOf.get(stop));
      if (k < 0) continue;
      // Stopped at k: there now. On the way to k: a little before.
      const at = x.attributes.current_status === 'STOPPED_AT' ? now : now + 30000;
      const id = `${x.id}/${tripId}`;
      raws.push(this.record(p, id, at, k, Date.parse(x.attributes.updated_at) || now));
      this.seen.set(id, now);
      fixes.push({
        id, lon: x.attributes.longitude, lat: x.attributes.latitude,
        speed: (x.attributes.speed || 0) * 3.6, at: Date.parse(x.attributes.updated_at) || now,
      });
    }
    ingest(raws, false);
    // A vehicle that has left the feed has finished, or gone out of service.
    for (const [id, t] of this.seen) {
      if (now - t > 60000) { net.trains.delete(id); this.seen.delete(id); }
    }
    this.fixes = fixes;
  },

  async positions(still) {
    if (!still()) return 0;
    return applyFixes(this.fixes, actualDist);
  },
};
