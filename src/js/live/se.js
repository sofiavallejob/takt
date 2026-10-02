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
 *  busy weekday passes, so the day is asked for in slices of the clock. The
 *  change id to continue from is the oldest of the slices', so no change
 *  between them is lost (one seen twice does no harm). */
async function fetchDays(dates) {
  const cuts = ['09:00', '15:00'].map(t => new Date(`${dates[dates.length - 1]}T${t}:00`).toISOString());
  const range = [`<LT name="AdvertisedTimeAtLocation" value="${cuts[0]}"/>`,
    `<GTE name="AdvertisedTimeAtLocation" value="${cuts[0]}"/><LT name="AdvertisedTimeAtLocation" value="${cuts[1]}"/>`,
    `<GTE name="AdvertisedTimeAtLocation" value="${cuts[1]}"/>`];
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
  lastFix: new Map(),  // train id -> last GPS fix, for a speed the feed does not give

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
    this.fillGaps(rows);
    const cat = catOf(m.product, m.traffic, m.oper);
    const [date, op] = id.split('/'), number = m.number || op;
    return {
      id, date, number, version: String(this.edits),
      type: m.product || 'Train', cat, ci: cat, line: '',
      name: `${m.product || 'Train'} ${number}`,
      oper: m.oper, cancelled: rows.every(r => r.cancelled), rows,
    };
  },

  /** The stations each stopping train runs between, as a graph of hops: the
   *  rail network as the timetable knows it. */
  buildGraph() {
    const st = this.net.stations, g = new Map();
    const link = (a, b) => {
      const A = st.get(a), B = st.get(b);
      if (!A || !B || a === b) return;
      const km = Math.hypot(A.x - B.x, A.y - B.y);
      for (const [p, q] of [[a, b], [b, a]]) {
        if (!g.has(p)) g.set(p, new Map());
        g.get(p).set(q, km);
      }
    };
    for (const m of this.rows.values()) {
      const seq = [...m.values()].sort((x, y) => ms(x.AdvertisedTimeAtLocation) - ms(y.AdvertisedTimeAtLocation))
        .map(a => a.LocationSignature);
      for (let i = 1; i < seq.length; i++) link(seq[i - 1], seq[i]);
    }
    this.graph = g;
    this.via = new Map();
  },

  /** The stations between a and b on the way stopping trains go, or none
   *  when there is no way much longer than the straight line. */
  between(a, b) {
    const key = a + '>' + b;
    if (this.via.has(key)) return this.via.get(key);
    const st = this.net.stations, A = st.get(a), B = st.get(b);
    let out = [];
    const direct = A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 0;
    if (direct > 12 && this.graph.has(a)) {
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
        for (const [v, km] of this.graph.get(u) || []) {
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
  },

  /** Put the stations an express passes without stopping into its rows, timed
   *  by distance, so its route follows the line instead of cutting across. */
  fillGaps(rows) {
    if (!this.graph) return;
    const st = this.net.stations;
    for (let i = rows.length - 1; i > 0; i--) {
      const r0 = rows[i - 1], r1 = rows[i];
      if (r0.code === r1.code) continue;
      const via = this.between(r0.code, r1.code);
      if (!via.length) continue;
      const pts = [r0.code, ...via, r1.code].map(c => st.get(c));
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      const L = cum[cum.length - 1] || 1;
      const add = via.map((code, k) => ({
        code, dep: true, stop: false, commercial: false, cancelled: r1.cancelled,
        plan: r0.plan + (r1.plan - r0.plan) * cum[k + 1] / L, actual: NaN, estimate: NaN,
      }));
      rows.splice(i, 0, ...add);
    }
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
      // No speed in this feed: take it from the last two fixes.
      const prev = this.lastFix.get(f.id);
      let speed = prev?.speed || 0;
      if (prev && f.at - prev.at > 5000) {
        const km = Math.hypot((lon - prev.lon) * 111.32 * Math.cos(lat * Math.PI / 180), (lat - prev.lat) * 110.57);
        speed = Math.min(250, km / ((f.at - prev.at) / 3600e3));
      }
      if (!prev || f.at > prev.at) this.lastFix.set(f.id, { at: f.at, lon, lat, speed });
      fixes.push({ id: f.id, lon, lat, speed, at: f.at });
    }
    return applyFixes(fixes, actualDist);
  },
};
