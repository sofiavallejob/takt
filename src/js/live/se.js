// Sweden: every passenger train in the country, live from Trafikverket's open
// API. Each train is a list of announcements, one per arrival or departure at
// an advertised station, with a planned time, a live estimate and an actual
// time once it has happened: the same shape as Finland's timetable rows.
//
// The day is read once; after that the API is asked only for announcements
// that changed (its `changeid`), and the trains they belong to are rebuilt.

import { CREDITS_SE } from '../config.js';
import { TRAFIKVERKET_KEY } from '../keys.js';
import { createNet, setStations, ingest, applyFixes } from './network.js';
import { dateAt, shiftDate, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';
import { RouteGraph, SpeedFromFixes } from './rail.js';

const API = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

const GROUPS = [
  { name: 'High-speed', col: '#d62839' },
  { name: 'InterCity', col: '#ee8a00' },
  { name: 'Night train', col: '#6a5acd' },
  { name: 'Regional', col: '#0e9784' },
  { name: 'Commuter', col: '#2b7bd6' },
];

/** Category from the product name Trafikverket gives the train. */
export function catOf(product, traffic, oper) {
  const p = product.toLowerCase();
  if (p.includes('nattåg')) return 2;
  if (p.includes('snabbtåg')) return 0;
  if (traffic === 'Pendeltåg' || p.includes('pendel') || p === 'pågatågen' || oper === 'ATRAIN') return 4;
  if (['sj intercity', 'sj', 'snälltåget', 'tågab', 'vy', 'mtrx'].includes(p)) return 1;
  return 3;
}

const FIELDS = ['ActivityId', 'ActivityType', 'AdvertisedTrainIdent', 'OperationalTrainNumber', 'AdvertisedTimeAtLocation',
  'EstimatedTimeAtLocation', 'TimeAtLocation', 'LocationSignature', 'Canceled', 'Deleted',
  'ProductInformation.Description', 'TypeOfTraffic.Description', 'Operator', 'ScheduledDepartureDateTime'];

async function query(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: `<REQUEST><LOGIN authenticationkey="${TRAFIKVERKET_KEY}"/>${body}</REQUEST>`,
  });
  if (!res.ok) throw new Error(`trafikverket ${res.status}`);
  const r = (await res.json()).RESPONSE.RESULT[0];
  if (r.ERROR) throw new Error(r.ERROR.MESSAGE);
  return r;
}

const point = wkt => wkt.match(/POINT \(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
const ms = s => (s ? Date.parse(s) : NaN);

async function fetchStations() {
  const r = await query(`<QUERY objecttype="TrainStation" namespace="rail.infrastructure" schemaversion="1.5">
    <INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedLocationName</INCLUDE><INCLUDE>Geometry.WGS84</INCLUDE></QUERY>`);
  const out = new Map();
  for (const s of r.TrainStation || []) {
    if (!s.Geometry?.WGS84) continue;
    const [lon, lat] = point(s.Geometry.WGS84);
    out.set(s.LocationSignature, {
      code: s.LocationSignature,
      name: s.AdvertisedLocationName.replace(/ C$/, ''),
      lat, lon, passenger: true,
    });
  }
  return out;
}

/** Announcements for the given service dates; only the changed ones when
 *  `changeId` is not '0'. `extra` narrows the filter further. */
function fetchAnnouncements(dates, changeId, extra = '') {
  const days = dates.map(d => `<EQ name="ScheduledDepartureDateTime" value="${d}"/>`).join('');
  return query(`<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" changeid="${changeId}">
    <FILTER><OR>${days}</OR><EQ name="Advertised" value="true"/>${extra}</FILTER>
    ${FIELDS.map(f => `<INCLUDE>${f}</INCLUDE>`).join('')}</QUERY>`);
}

/** Whole days of announcements. One answer is capped at about 26 MB, which a
 *  busy weekday passes, so each day is asked for in slices of the clock. With
 *  two days loaded (late evening, early morning) every day is cut, not only
 *  the last, or the first slice would hold the whole of the other day. The
 *  change id to continue from is the oldest of the slices', so no change
 *  between them is lost (one seen twice does no harm). */
async function fetchDays(dates) {
  const cuts = dates.flatMap(d => ['09:00', '15:00'].map(t => new Date(`${d}T${t}:00`).toISOString()));
  const lt = v => `<LT name="AdvertisedTimeAtLocation" value="${v}"/>`;
  const gte = v => `<GTE name="AdvertisedTimeAtLocation" value="${v}"/>`;
  const range = [lt(cuts[0]), ...cuts.slice(1).map((c, i) => gte(cuts[i]) + lt(c)), gte(cuts[cuts.length - 1])];
  const parts = await Promise.all(range.map(x => fetchAnnouncements(dates, '0', x)));
  const ids = parts.map(r => r.INFO?.LASTCHANGEID).filter(Boolean).map(BigInt);
  return {
    list: parts.flatMap(r => r.TrainAnnouncement || []),
    changeId: ids.length ? String(ids.reduce((a, b) => (b < a ? b : a))) : '0',
  };
}

export const se = {
  key: 'se',
  name: 'Sweden',
  enabled: !!TRAFIKVERKET_KEY,
  tz: 'Europe/Stockholm',
  views: ['se', 'mal', 'sk'],
  regions: 'data/se-regions.json',
  pollMs: 20000,
  gpsMs: 15000,
  credits: CREDITS_SE,
  groups: GROUPS.map(g => ({ col: g.col, name: g.name, short: g.name })),
  groupOrder: ['Long distance', 'Regional', 'Commuter'],
  byLine: false,
  net: createNet(16, 62),
  today: null,
  dates: [],
  changeId: '0',
  rows: new Map(),     // train id -> Map(ActivityId -> announcement)
  meta: new Map(),     // train id -> { product, traffic, oper }
  edits: 0,            // bumped on every update, so rebuilt trains count as new versions
  speeds: new SpeedFromFixes(),  // the feed gives no speed
  graph: null,

  async load() {
    this.today = dateAt(Date.now());
    const T = minuteOfDay();
    this.dates = [this.today];
    if (T < 6 * 60) this.dates.unshift(shiftDate(this.today, -1));  // last night's trains may still be out
    if (T > 22 * 60) this.dates.push(shiftDate(this.today, 1));
    const [stations, r] = await Promise.all([fetchStations(), fetchDays(this.dates)]);
    setStations(stations);
    this.changeId = r.changeId;
    const touched = this.file(r.list);
    this.buildGraph();
    ingest(this.records(touched), true);
  },

  /** File announcements under their trains and rebuild those trains. */
  take(list) { return this.records(this.file(list)); },

  /** File announcements under their trains; return the ids touched. */
  file(list) {
    const touched = new Set();
    for (const a of list) {
      // The public number can be shared by two operators' trains on one day
      // (a Vy 384 to Oslo and an SJ 384); the operational number cannot.
      const id = `${a.ScheduledDepartureDateTime.slice(0, 10)}/${a.OperationalTrainNumber || a.AdvertisedTrainIdent}`;
      let m = this.rows.get(id);
      if (!m) this.rows.set(id, m = new Map());
      if (a.Deleted) m.delete(a.ActivityId); else m.set(a.ActivityId, a);
      if (a.ProductInformation || a.TypeOfTraffic) {
        this.meta.set(id, {
          product: a.ProductInformation?.[0]?.Description || '',
          traffic: a.TypeOfTraffic?.[0]?.Description || '',
          oper: a.Operator || '',
          number: a.AdvertisedTrainIdent,
        });
      }
      touched.add(id);
    }
    return touched;
  },

  records(touched) {
    this.edits++;
    const out = [];
    for (const id of touched) {
      const raw = this.record(id);
      if (raw) out.push(raw);
    }
    return out;
  },

  record(id) {
    const m = this.meta.get(id) || { product: '', traffic: '', oper: '' };
    if (m.traffic === 'Buss') return null;              // replacement buses are not trains
    const anns = [...this.rows.get(id).values()];
    if (anns.length < 2) return null;
    const rows = anns.map(a => ({
      code: a.LocationSignature,
      dep: a.ActivityType === 'Avgang',
      stop: true, commercial: true,
      cancelled: !!a.Canceled,
      plan: ms(a.AdvertisedTimeAtLocation),
      actual: ms(a.TimeAtLocation),
      estimate: ms(a.EstimatedTimeAtLocation),
    })).sort((a, b) => a.plan - b.plan || a.dep - b.dep);
    this.graph?.fill(rows);
    const cat = catOf(m.product, m.traffic, m.oper);
    const [date, op] = id.split('/'), number = m.number || op;
    return {
      id, date, number, version: String(this.edits),
      type: m.product || 'Train', cat, ci: cat, line: '',
      name: `${m.product || 'Train'} ${number}`,
      oper: m.oper, cancelled: rows.every(r => r.cancelled), rows,
    };
  },

  /** The rail network as today's trains run it, for routing expresses. */
  buildGraph() {
    const seqs = [...this.rows.values()].map(m => [...m.values()]
      .sort((x, y) => ms(x.AdvertisedTimeAtLocation) - ms(y.AdvertisedTimeAtLocation))
      .map(a => a.LocationSignature));
    this.graph = new RouteGraph(this.net.stations, seqs);
  },

  async update(still) {
    const d = dateAt(Date.now());
    if (d !== this.today) {
      const r = await fetchDays([d]);
      if (!still()) return;
      this.today = d;
      this.dates = [shiftDate(d, -1), d];
      ingest(this.take(r.list), false);
    }
    const r = await fetchAnnouncements(this.dates, this.changeId);
    if (!still()) return;
    this.changeId = r.INFO?.LASTCHANGEID || this.changeId;
    const list = r.TrainAnnouncement || [];
    if (list.length) ingest(this.take(list), false);
  },

  async positions(still) {
    const r = await query(`<QUERY objecttype="TrainPosition" namespace="järnväg.trafikinfo" schemaversion="1.1">
      <FILTER><GT name="TimeStamp" value="$dateadd(-0.00:02:00)"/></FILTER>
      <INCLUDE>Train.AdvertisedTrainNumber</INCLUDE><INCLUDE>Train.OperationalTrainNumber</INCLUDE><INCLUDE>Train.OperationalTrainDepartureDate</INCLUDE>
      <INCLUDE>Position.WGS84</INCLUDE><INCLUDE>TimeStamp</INCLUDE></QUERY>`);
    if (!still()) return 0;
    const latest = new Map();
    for (const p of r.TrainPosition || []) {
      if (!p.Train?.AdvertisedTrainNumber || !p.Position?.WGS84) continue;
      const id = `${p.Train.OperationalTrainDepartureDate.slice(0, 10)}/${p.Train.OperationalTrainNumber || p.Train.AdvertisedTrainNumber}`;
      const at = Date.parse(p.TimeStamp);
      if ((latest.get(id)?.at || 0) < at) latest.set(id, { id, at, wkt: p.Position.WGS84 });
    }
    const fixes = [];
    for (const f of latest.values()) {
      const [lon, lat] = point(f.wkt);
      fixes.push({ id: f.id, lon, lat, speed: this.speeds.at(f.id, lon, lat, f.at), at: f.at });
    }
    return applyFixes(fixes, actualDist);
  },
};
