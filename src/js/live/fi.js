// Finland: every passenger train in the country, live from Fintraffic.

import { CREDITS_FI } from '../config.js';
import { fetchStations, fetchDay, fetchChanges, fetchLocations } from './digitraffic.js';
import { createNet, setStations, ingest, applyFixes, groupsFromCats } from './network.js';
import { dateAt, shiftDate, minuteOfDay } from './clock.js';
import { actualDist } from '../geom.js';

export const fi = {
  key: 'fi',
  name: 'Finland',
  tz: 'Europe/Helsinki',
  views: ['fi', 'hel'],
  regions: 'data/fi-regions.json',
  pollMs: 15000,
  gpsMs: 10000,
  credits: CREDITS_FI,
  groups: groupsFromCats(),
  groupOrder: ['Long distance', 'Regional', 'Commuter'],
  byLine: false,
  net: createNet(25.5, 64),
  today: null,

  /** Stations, then every passenger train for today. Call with this network current. */
  async load() {
    setStations(await fetchStations());
    this.today = dateAt(Date.now());
    const T = minuteOfDay(), dates = [this.today];
    if (T < 6 * 60) dates.unshift(shiftDate(this.today, -1));  // last night's trains may still be out
    if (T > 22 * 60) dates.push(shiftDate(this.today, 1));     // the first ones after midnight
    for (const d of await Promise.all(dates.map(fetchDay))) ingest(d, true);
  },

  /** Trains changed since the last answer. `still()` is false if the listener
   *  switched networks while the request was out. */
  async update(still) {
    const d = dateAt(Date.now());
    if (d !== this.today) {
      const day = await fetchDay(d);
      if (!still()) return;
      this.today = d;
      ingest(day, false);
    }
    const changes = await fetchChanges(this.net.version);
    if (still()) ingest(changes, false);
  },

  async positions(still) {
    const fixes = await fetchLocations();
    return still() ? applyFixes(fixes, actualDist) : 0;
  },
};
