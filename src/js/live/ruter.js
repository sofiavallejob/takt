// Oslo: Ruter's metro (T-bane) and trams, live from Entur, the national
// journey planner. The day's journeys are read line by line with their
// planned times only (a whole day with every live field is over Entur's size
// limit); after that, every 30 seconds, the journeys running now are asked
// again with their expected and actual times, in one request. Ruter shares no
// vehicle positions, so the trains are placed from those times.
//
// Buses are not here: 371 lines, about a gigabyte of journeys a day, and no
// positions to place them by instead.

import { CREDITS_NO } from '../config.js';
import { createNet, setStations, ingest, minsNow } from './network.js';
import { dateAt, shiftDate, minuteOfDay } from './clock.js';

const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const HEADERS = { 'Content-Type': 'application/json', 'ET-Client-Name': 'sofiavallejo-takt' };
const AUTHORITY = 'RUT:Authority:RUT';

const FAMILIES = [
  { name: 'Metro', col: '#ec700c' },     // Ruter's own colours
  { name: 'Tram', col: '#0b91ef' },
];

const PLAN = 'quay { stopPlace { id } } aimedArrivalTime aimedDepartureTime forBoarding forAlighting';
const LIVE = `quay { stopPlace { id } } aimedArrivalTime expectedArrivalTime actualArrivalTime
  aimedDepartureTime expectedDepartureTime actualDepartureTime cancellation realtime forBoarding forAlighting`;

async function gql(query) {
  const res = await fetch(JP, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`${res.status} entur`);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}

const ms = s => (s ? Date.parse(s) : NaN);

export const ruter = {
  key: 'ruter',
  name: 'Oslo metro & tram',
  noun: 'metros and trams',
  tz: 'Europe/Oslo',
  views: ['oslm'],
  regions: 'data/oslo-regions.json',
  pollMs: 30000,
  gpsMs: 60000,
  credits: CREDITS_NO,
  groups: FAMILIES.map(f => ({ col: f.col, name: f.name, short: f.name })),
  groupOrder: FAMILIES.map(f => f.name),
  byLine: true,
  net: createNet(10.75, 59.92),
  today: null,
  lines: [],            // { id, code, fam }
  journeys: new Map(),  // id -> { date, sj, line }
  edits: 0,

  async load() {
    const d = await gql(`{ lines(authorities: ["${AUTHORITY}"]) { id publicCode transportMode } }`);
    this.lines = d.lines.filter(l => l.transportMode === 'metro' || l.transportMode === 'tram')
      .map(l => ({ id: l.id, code: l.publicCode, fam: l.transportMode === 'metro' ? 0 : 1 }));
    this.today = dateAt(Date.now());
    const dates = [this.today];
    if (minuteOfDay() < 5 * 60) dates.unshift(shiftDate(this.today, -1));   // last night's trains may still be out
    const days = (await Promise.all(dates.map(date => this.fetchDay(date)))).flat();

    // The stations, named and placed, in one request.
    const ids = [...new Set(days.flatMap(({ sj }) => sj.estimatedCalls.map(c => c.quay?.stopPlace?.id).filter(Boolean)))];
    const sp = await gql(`{ stopPlaces(ids: ${JSON.stringify(ids)}) { id name latitude longitude } }`);
    const stations = new Map();
    for (const s of sp.stopPlaces || []) {
      if (s) stations.set(s.id, { code: s.id, name: s.name, lat: s.latitude, lon: s.longitude, passenger: true });
    }
    setStations(stations);
    ingest(days.map(j => this.record(j)).filter(Boolean), true);
  },

  /** One day: every line asked on its own, at once. */
  async fetchDay(date) {
    const parts = await Promise.all(this.lines.map(async line => {
      const d = await gql(`{ serviceJourneys(lines: ["${line.id}"], activeDates: ["${date}"]) {
        id estimatedCalls(date: "${date}") { ${PLAN} } } }`);
      return (d.serviceJourneys || []).filter(sj => sj.estimatedCalls.length >= 2).map(sj => ({ date, sj, line }));
    }));
    return parts.flat();
  },

  record({ date, sj, line }) {
    const calls = sj.estimatedCalls.filter(c => c.quay?.stopPlace);
    if (calls.length < 2) return null;
    const id = `${date}/${sj.id}`;
    this.journeys.set(id, { date, sj, line });
    const rows = [];
    calls.forEach((c, k) => {
      const base = { code: c.quay.stopPlace.id, stop: true, commercial: c.forBoarding || c.forAlighting, cancelled: !!c.cancellation };
      const live = c.realtime;
      if (k > 0) rows.push({ ...base, dep: false, plan: ms(c.aimedArrivalTime), actual: ms(c.actualArrivalTime), estimate: live ? ms(c.expectedArrivalTime) : NaN });
      if (k < calls.length - 1) rows.push({ ...base, dep: true, plan: ms(c.aimedDepartureTime), actual: ms(c.actualDepartureTime), estimate: live ? ms(c.expectedDepartureTime) : NaN });
    });
    const name = `${line.fam === 0 ? 'Metro' : 'Tram'} ${line.code}`;
    return {
      id, date, number: line.code, version: String(this.edits),
      type: line.fam === 0 ? 'metro' : 'tram', cat: line.fam === 0 ? 1 : 3, ci: line.fam,
      string: `ruter:${line.code}`, lineName: name, name,
      color: FAMILIES[line.fam].col, groupName: FAMILIES[line.fam].name,
      lateThr: 3, oper: 'Ruter', cancelled: calls.every(c => c.cancellation), rows,
    };
  },

  /** A new day's journeys; otherwise live times for the ones running now. */
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
      if (N >= tr.t0 - 10 && N <= Math.max(tr.a1, tr.t1) + 5 && this.journeys.has(tr.id)) ids.push(tr.id);
    }
    if (!ids.length) return;
    const parts = ids.map((id, i) => {
      const { date, sj } = this.journeys.get(id);
      return `j${i}: serviceJourney(id: "${sj.id}") { id estimatedCalls(date: "${date}") { ${LIVE} } }`;
    });
    const data = await gql(`{ ${parts.join('\n')} }`);
    if (!still()) return;
    this.edits++;
    const raws = [];
    ids.forEach((id, i) => {
      const sj = data[`j${i}`];
      if (sj && sj.estimatedCalls.length >= 2) {
        const { date, line } = this.journeys.get(id);
        const raw = this.record({ date, sj, line });
        if (raw) raws.push(raw);
      }
    });
    ingest(raws, false);
  },

  /** No positions to ask for. */
  async positions() { return 0; },
};
