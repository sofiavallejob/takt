// New York: the subway and the Staten Island Railway, live from the MTA's
// GTFS Realtime feeds (no key, open to browsers). The subway is underground:
// its trains report no position, only predicted arrivals at their next
// stations, and those place them. Buses are not here: the MTA's bus feed
// needs a key and cannot be read by a web page directly.

import { CREDITS_US } from '../config.js';
import { fetchFeed } from './gtfsrt.js';
import { patternNetwork } from './patterns.js';

const RT = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F';
const FEEDS = ['gtfs', 'gtfs-ace', 'gtfs-bdfm', 'gtfs-g', 'gtfs-jz', 'gtfs-nqrw', 'gtfs-l', 'gtfs-si'];

export const nyc = patternNetwork({
  key: 'nyc',
  name: 'New York',
  noun: 'subway trains',
  tz: 'America/New_York',
  views: ['nyc'],
  regions: 'data/nyc-regions.json',
  data: 'data/nyc/patterns.json',
  centre: [-73.95, 40.72],
  pollMs: 30000,          // the MTA refreshes its feeds every 30 seconds
  peak: 520,              // about as many trains as run at once in the rush
  credits: CREDITS_US,

  async vehicles(still) {
    // One feed failing (they do, one at a time) leaves the rest playing.
    const feeds = await Promise.allSettled(FEEDS.map(f => fetchFeed(RT + f)));
    if (!still()) return [];
    if (feeds.every(f => f.status === 'rejected')) throw feeds[0].reason;
    const out = [];
    for (const f of feeds) {
      if (f.status !== 'fulfilled') continue;
      for (const tu of f.value.tripUpdates) {
        const line = this.routeLine[tu.trip?.routeId];
        if (!line || !tu.stops.length) continue;
        const times = tu.stops
          .map(s => ({ stop: s.stopId, t: ((s.arr && s.arr.time) || (s.dep && s.dep.time) || 0) * 1000 }))
          .filter(x => x.stop && x.t > 0);
        if (!times.length) continue;
        // Platform ids end in N or S, which is the direction (0 north, 1 south).
        const dir = /N$/.test(times[0].stop) ? 0 : /S$/.test(times[0].stop) ? 1 : null;
        out.push({
          id: tu.trip.tripId, line, dir, stop: times[0].stop, times,
          at: (tu.timestamp || f.value.timestamp) * 1000,
        });
      }
    }
    return out;
  },
});
