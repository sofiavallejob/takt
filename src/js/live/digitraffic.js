// Fintraffic's open rail API (rata.digitraffic.fi): no key, CORS open, and
// every timetable point of every train carries a scheduled time, an actual time
// once the train has passed, and a live estimate until then.
//
// This module only talks to the API and turns its answers into plain records;
// network.js does everything else. Another live source would be a sibling of
// this file returning the same shapes.

import { CATS } from '../config.js';

const BASE = 'https://rata.digitraffic.fi';
const GQL = BASE + '/api/v2/graphql/graphql';
const HEADERS = { 'Digitraffic-User': 'Takt/2.0' };

const TRAIN_FIELDS = `trainNumber departureDate version cancelled commuterLineid
  operator { shortCode } trainType { name }
  timeTableRows { type trainStopping commercialStop cancelled scheduledTime
    actualTime liveEstimateTime station { shortCode } }`;

const PASSENGER = `where: { trainType: { trainCategory: { or: [
  { name: { equals: "Long-distance" } }, { name: { equals: "Commuter" } } ] } } }`;

async function gql(query) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`digitraffic ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}

export async function fetchStations() {
  const res = await fetch(BASE + '/api/v1/metadata/stations', { headers: HEADERS });
  if (!res.ok) throw new Error(`digitraffic stations ${res.status}`);
  const out = new Map();
  for (const s of await res.json()) {
    out.set(s.stationShortCode, {
      code: s.stationShortCode,
      name: s.stationName.replace(/ asema$/, ''),
      lat: s.latitude, lon: s.longitude,
      passenger: s.passengerTraffic,
    });
  }
  return out;
}

/** Every passenger train with this departure date (YYYY-MM-DD). */
export async function fetchDay(date) {
  const d = await gql(`{ trainsByDepartureDate(departureDate: "${date}", ${PASSENGER}) { ${TRAIN_FIELDS} } }`);
  return (d.trainsByDepartureDate || []).map(normalise);
}

/** Every passenger train that changed after `version`, on any date. */
export async function fetchChanges(version) {
  const d = await gql(`{ trainsByVersionGreaterThan(version: "${version}", ${PASSENGER}) { ${TRAIN_FIELDS} } }`);
  return (d.trainsByVersionGreaterThan || []).map(normalise);
}

const catOf = type => {
  const i = CATS.findIndex(c => c.types.includes(type));
  return i < 0 ? CATS.length - 1 : i;
};

const ms = s => (s ? Date.parse(s) : NaN);

/** One train, in the shape the rest of the program understands. Times stay in
 *  epoch milliseconds here; network.js turns them into minutes. */
function normalise(t) {
  const type = t.trainType?.name || '';
  return {
    id: `${t.departureDate}/${t.trainNumber}`,
    date: t.departureDate,
    number: t.trainNumber,
    version: t.version,
    type,
    cat: catOf(type),
    line: t.commuterLineid || '',
    oper: (t.operator?.shortCode || '').toUpperCase(),
    cancelled: !!t.cancelled,
    rows: (t.timeTableRows || []).map(r => ({
      code: r.station.shortCode,
      dep: r.type === 'DEPARTURE',
      stop: !!r.trainStopping,
      commercial: !!r.commercialStop,
      cancelled: !!r.cancelled,
      plan: ms(r.scheduledTime),
      actual: ms(r.actualTime),
      estimate: ms(r.liveEstimateTime),
    })),
  };
}

/** The latest GPS fix of every train that has one, every few seconds on the
 *  server side. Cargo trains are in here too; they simply match nothing. */
export async function fetchLocations() {
  const res = await fetch(BASE + '/api/v1/train-locations/latest/', { headers: HEADERS });
  if (!res.ok) throw new Error(`digitraffic locations ${res.status}`);
  return (await res.json()).map(l => ({
    id: `${l.departureDate}/${l.trainNumber}`,
    lon: l.location.coordinates[0], lat: l.location.coordinates[1],
    speed: l.speed || 0,                 // km/h
    at: Date.parse(l.timestamp),
  }));
}
