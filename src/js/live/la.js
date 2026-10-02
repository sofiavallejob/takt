// Los Angeles: Metro Rail (the A, B, C, D, E and K Lines) and Metro's buses,
// live from LA Metro's API (no key). The API streams updates over a WebSocket
// every few seconds; the whole bus fleet is about 60 KB a second, so instead of
// staying connected the page takes a short snapshot every 30 seconds.
//
// Rail trains report predicted arrivals (trip updates) and, separately, where
// they are (vehicle positions, by vehicle id). Buses report where they are and
// the stop they are at or heading for.

import { CREDITS_US } from '../config.js';
import { patternNetwork } from './patterns.js';

const WS = 'wss://api.metro.net/ws/';
const SNAP_MS = 6000;     // long enough for every vehicle to report once

/** Every message the stream sends for `ms`, newest per id. */
function snapshot(path, ms = SNAP_MS) {
  return new Promise((resolve, reject) => {
    const got = new Map();
    let ws;
    try { ws = new WebSocket(WS + path); } catch (e) { reject(e); return; }
    const done = () => { try { ws.close(); } catch {} resolve([...got.values()]); };
    const timer = setTimeout(done, ms);
    ws.onmessage = m => {
      try { const j = JSON.parse(m.data); if (j && j.id) got.set(j.id, j); } catch { /* "Error: ..." text */ }
    };
    ws.onerror = () => { clearTimeout(timer); try { ws.close(); } catch {} got.size ? resolve([...got.values()]) : reject(new Error('LA Metro stream unreachable')); };
  });
}

const ms = s => (Number(s) || 0) * 1000;

export const la = patternNetwork({
  key: 'la',
  name: 'Los Angeles',
  noun: 'trains and buses',
  tz: 'America/Los_Angeles',
  views: ['la'],
  regions: 'data/la-regions.json',
  data: 'data/la/patterns.json',
  centre: [-118.25, 34.05],
  pollMs: 30000,
  peak: 1900,             // buses and trains at once in the rush
  credits: CREDITS_US,
  // Buses are the many small dots (category 4) under the rail lines, which are drawn on top.
  catOf: fam => (fam === 6 ? 4 : 1),
  onTop: fam => fam !== 6,

  async vehicles(still) {
    const [tus, railPos, buses] = await Promise.all([
      snapshot('LACMTA_Rail/trip_updates'),
      snapshot('LACMTA_Rail/vehicle_positions'),
      snapshot('LACMTA/vehicle_positions'),
    ]);
    if (!still()) return [];
    const out = [];

    // Rail: predictions place the train, its vehicle's fix sharpens it.
    const fix = new Map();
    for (const m of railPos) {
      const v = m.vehicle, id = v?.vehicle?.id || m.id;
      if (v?.position) fix.set(id, v);
    }
    for (const m of tus) {
      const tu = m.tripUpdate, trip = tu?.trip;
      const line = trip && this.routeLine[trip.routeId];
      if (!line) continue;
      const times = (tu.stopTimeUpdate || [])
        .map(s => ({ stop: s.stopId, t: ms(s.arrival?.time || s.departure?.time) }))
        .filter(x => x.stop && x.t > 0);
      if (!times.length) continue;
      const f = fix.get(tu.vehicle?.id);
      out.push({
        id: trip.tripId, line, dir: trip.directionId ?? null, stop: times[0].stop, times,
        at: ms(tu.timestamp) || Date.now(),
        lat: f?.position.latitude, lon: f?.position.longitude,
        speed: (f?.position.speed || 0) * 3.6,
      });
    }

    // Buses: where each one is, and the stop it is at or heading for.
    for (const m of buses) {
      const v = m.vehicle, trip = v?.trip;
      const line = trip && this.routeLine[trip.routeId];
      if (!line || !v.position || !v.stopId) continue;
      out.push({
        id: trip.tripId || m.id, line, dir: trip.directionId ?? null, stop: v.stopId,
        status: v.currentStatus, at: ms(v.timestamp) || Date.now(),
        lat: v.position.latitude, lon: v.position.longitude, speed: (v.position.speed || 0) * 3.6,
      });
    }
    return out;
  },
});
