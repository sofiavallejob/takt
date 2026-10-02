// Norway: every passenger train, live from Entur, the national journey
// planner. The day's journeys come from its GraphQL API with planned,
// expected and actual times for every call; after that only the journeys
// running now are asked again. GPS comes from Entur's vehicle-position API.

import { CREDITS_NO } from '../config.js';
import { createNet, setStations, ingest, applyFixes, minsNow } from './network.js';
import { dateAt, shiftDate, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';
import { RouteGraph, SpeedFromFixes } from './rail.js';

const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const VEHICLES = 'https://api.entur.io/realtime/v2/vehicles/graphql';
const HEADERS = { 'Content-Type': 'application/json', 'ET-Client-Name': 'sofiavallejo-takt' };

// Norwegian rail operators. Swedish ones that cross the border are left to Sweden.
const AUTHORITIES = ['VYG:Authority:VY', 'VYG:Authority:VYT', 'VYG:Authority:TAG', 'VYG:Authority:FLB',
  'GOA:Authority:GOA', 'SJN:Authority:SJN', 'FLT:Authority:FLT'];

const GROUPS = [
  { name: 'Airport express', col: '#d62839' },
  { name: 'Long distance', col: '#ee8a00' },
  { name: 'Night train', col: '#6a5acd' },
  { name: 'Regional', col: '#0e9784' },
  { name: 'Local', col: '#2b7bd6' },
];

const CALL = `quay { stopPlace { id name latitude longitude } }
  aimedArrivalTime expectedArrivalTime actualArrivalTime
  aimedDepartureTime expectedDepartureTime actualDepartureTime
  cancellation realtime forBoarding forAlighting`;

async function gql(url, query) {
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`entur ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}

/** Category from the line code: FLY Flytoget, F long distance, R/RE/RX
 *  regional, L local. A long-distance train leaving late in the evening on a
 *  long run is a night train. */
function catOf(code, calls) {
  if (/^FLY/.test(code)) return 0;
  if (/^F/.test(code)) {
    const t0 = Date.parse(calls[0].aimedDepartureTime), t1 = Date.parse(calls[calls.length - 1].aimedArrivalTime);
    const h = +calls[0].aimedDepartureTime.slice(11, 13);     // Norwegian local time, as the API writes it
    return (h >= 21 || h < 2) && t1 - t0 > 6 * 3600e3 ? 2 : 1;
  }
  if (/^R/.test(code)) return 3;
  return 4;
}

const ms = s => (s ? Date.parse(s) : NaN);

export const no = {
  key: 'no',
  name: 'Norway',
  tz: 'Europe/Oslo',
  views: ['no', 'osl'],
  regions: 'data/no-regions.json',
  pollMs: 30000,
  gpsMs: 15000,
  credits: CREDITS_NO,
  groups: GROUPS.map(g => ({ col: g.col, name: g.name, short: g.name })),
  groupOrder: ['Long distance', 'Regional', 'Commuter'],
  byLine: false,
  net: createNet(10.5, 62),
  today: null,
  journeys: new Map(),   // id -> { date, sj, line, cat }
  graph: null,
  speeds: new SpeedFromFixes(),
  edits: 0,

  async load() {
    this.today = dateAt(Date.now());
    const dates = [this.today];
    if (minuteOfDay() < 5 * 60) dates.unshift(shiftDate(this.today, -1));  // last night's trains may still be out
    const days = await Promise.all(dates.map(d => this.fetchDay(d)));
    const stations = new Map();
    for (const day of days) for (const { sj } of day) for (const c of sj.estimatedCalls) {
      const s = c.quay?.stopPlace;
      if (s && !stations.has(s.id)) {
        stations.set(s.id, { code: s.id, name: s.name.replace(/ stasjon$/, ''), lat: s.latitude, lon: s.longitude, passenger: true });
      }
    }
    setStations(stations);
    const all = days.flat();
    this.graph = new RouteGraph(stations, all.map(({ sj }) => sj.estimatedCalls.map(c => c.quay?.stopPlace?.id)));
    ingest(all.map(j => this.record(j)).filter(Boolean), true);
  },

  async fetchDay(date) {
    const d = await gql(JP, `{ serviceJourneys(authorities: ${JSON.stringify(AUTHORITIES)}, activeDates: ["${date}"]) {
      id line { publicCode } estimatedCalls(date: "${date}") { ${CALL} } } }`);
    return (d.serviceJourneys || []).filter(sj => sj.estimatedCalls.length >= 2).map(sj => ({ date, sj }));
  },

  record({ date, sj }) {
    const calls = sj.estimatedCalls.filter(c => c.quay?.stopPlace);
    if (calls.length < 2) return null;
    const id = `${date}/${sj.id}`, code = sj.line?.publicCode || '';
    const cat = catOf(code, calls);
    this.journeys.set(id, { date, sj, cat });
    const rows = [];
    calls.forEach((c, k) => {
      const base = {
        code: c.quay.stopPlace.id, stop: true, commercial: c.forBoarding || c.forAlighting,
        cancelled: !!c.cancellation,
      };
      if (k > 0) rows.push({ ...base, dep: false, plan: ms(c.aimedArrivalTime), actual: ms(c.actualArrivalTime),
        estimate: c.realtime ? ms(c.expectedArrivalTime) : NaN });
      if (k < calls.length - 1) rows.push({ ...base, dep: true, plan: ms(c.aimedDepartureTime), actual: ms(c.actualDepartureTime),
        estimate: c.realtime ? ms(c.expectedDepartureTime) : NaN });
    });
    this.graph?.fill(rows);
    return {
      id, date, number: code, version: String(this.edits),
      type: code, cat, ci: cat, line: '', name: code ? `${code} ${calls[0].quay.stopPlace.name.replace(/ stasjon$/, '')}–${calls[calls.length - 1].quay.stopPlace.name.replace(/ stasjon$/, '')}` : 'Train',
      oper: sj.id.split(':')[0], cancelled: calls.every(c => c.cancellation), rows,
    };
  },

  /** A new day's journeys; otherwise fresh times for the journeys running now
   *  or about to, in one request. */
  async update(still) {
    const d = dateAt(Date.now());
    if (d !== this.today) {
      const day = await this.fetchDay(d);
      if (!still()) return;
      this.today = d;
      ingest(day.map(j => this.record(j)).filter(Boolean), false);
      return;
    }
    const N = minsNow(), ids = [];
    for (const tr of this.net.trains.values()) {
      if (N >= tr.t0 - 15 && N <= Math.max(tr.a1, tr.t1) + 5 && this.journeys.has(tr.id)) ids.push(tr.id);
    }
    if (!ids.length) return;
    const parts = ids.map((id, i) => {
      const { date, sj } = this.journeys.get(id);
      return `j${i}: serviceJourney(id: "${sj.id}") { id line { publicCode } estimatedCalls(date: "${date}") { ${CALL} } }`;
    });
    const data = await gql(JP, `{ ${parts.join('\n')} }`);
    if (!still()) return;
    this.edits++;
    const raws = [];
    ids.forEach((id, i) => {
      const sj = data[`j${i}`];
      if (sj && sj.estimatedCalls.length >= 2) {
        const raw = this.record({ date: this.journeys.get(id).date, sj });
        if (raw) raws.push(raw);
      }
    });
    ingest(raws, false);
  },

  async positions(still) {
    const data = await gql(VEHICLES, `{ vehicles(mode: RAIL) { serviceJourney { id } location { latitude longitude } lastUpdated } }`);
    if (!still()) return 0;
    const fixes = [];
    for (const v of data.vehicles || []) {
      if (!v.serviceJourney?.id || !v.location) continue;
      const id = [this.today, shiftDate(this.today, -1)].map(d => `${d}/${v.serviceJourney.id}`)
        .find(k => this.journeys.has(k));
      if (!id) continue;
      const { latitude: lat, longitude: lon } = v.location, at = Date.parse(v.lastUpdated);
      fixes.push({ id, lon, lat, speed: this.speeds.at(id, lon, lat, at), at });
    }
    return applyFixes(fixes, actualDist);
  },
};
