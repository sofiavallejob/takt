// Live mode: the trains where they are right now. The network named in the
// address (Finland unless it says #sto, #hel, ...) starts loading as soon as
// the page opens; other networks load when first picked. While live is the
// current mode it polls its feed for changes and positions.

import { VIEWS } from '../config.js';
import { state, $ } from '../state.js';
import { resize, drawNet } from '../render.js';
import { clearSlots } from '../audio/engine.js';
import { resetHour } from '../sim.js';
import { renderCountries, renderViews, drawProfile, setListening } from '../ui/controls.js';
import { buildSidebar, updateSidebarNotes, updateSidebarState } from '../ui/sidebar.js';
import { buildKey } from '../ui/legend.js';
import { buildGrid } from '../geom.js';
import { net, useNet, prune, retune, dayProfile, projectRings, viewFor, minsNow } from './network.js';
import { setZone } from './clock.js';
import { NETWORKS, COUNTRIES, countryOf, networkOfView } from './networks.js';
import { step } from './step.js';

let on = false, active = null, switching = false;
let lastOk = 0, failing = false, gpsCount = 0;
const rings = {};

/** Make a network current and load it if it never was. */
function prepare(rec) {
  useNet(rec.net);
  setZone(rec.tz);
  if (!rec.loading) {
    rec.loading = Promise.all([
      rec.load(),
      fetch(rec.regions).then(r => r.json()).then(j => { rings[rec.key] = j.rings; }),
    ]);
    rec.loading.catch(() => { rec.loading = null; });   // allow a retry
  }
  return rec.loading;
}

/** Everything that follows from the feed having changed. */
function afterUpdate() {
  state.S.trains = [...net.trains.values()];
  if (net.dirty) {
    state.S.lines = retune();
    buildGrid();
    drawNet();
    buildSidebar();
    updateSidebarNotes(true);
    updateSidebarState();
  }
  // The day's shape is taken while the whole day is still loaded: finished
  // trains are dropped as the day goes on. A network that only knows what is
  // running right now (Boston) has no day to draw, and says how busy it gets.
  if (active.liveOnly) {
    active.profile = active.profile || new Array(144).fill(0);
  } else if (active.profileDate !== active.today) {
    active.profile = dayProfile(active.today);
    active.profileDate = active.today;
  }
  state.S.profile = active.profile;
  state.S.peak = active.peak || Math.max(1, ...state.S.profile);
  drawProfile(state.S.profile);
}

function status() {
  if (switching) return 'Loading…';
  if (failing) return active && !active.liveOnly ? 'Live feed unreachable, playing the timetable' : 'Live feed unreachable, retrying';
  const age = (Date.now() - lastOk) / 1000;
  const gps = gpsCount ? `, ${gpsCount} on GPS` : '';
  const ago = age < 5 ? 'just now' : age < 90 ? `${Math.round(age)} s ago` : `${Math.round(age / 60)} min ago`;
  return `Live, updated ${ago}${gps}`;
}

/** One loop for both kinds of request, checked every second: each network
 *  says how often it wants trip changes and positions, and a network that has
 *  just been picked is asked straight away. Nothing is asked while the tab is
 *  hidden or replay is playing: nobody is listening, and the feeds have quotas. */
const busy = { poll: false, gps: false };
function tick() {
  setTimeout(tick, 1000);
  if (!on || document.hidden || switching || !active) return;
  const rec = active, now = Date.now(), still = () => on && active === rec && !switching;
  // A feed that answered "too many requests" is left alone for a while; the
  // trains keep running on the timetable meanwhile, quietly: the listener is
  // not told about the quota, only how long ago the last update was.
  if (rec.limitedUntil > now) return;
  const limited = err => {
    if (!/^429\b/.test(err?.message || '')) return false;
    rec.limitedUntil = Date.now() + (rec.backoffMs || 10 * 60000);
    return true;
  };

  if (!busy.poll && now - (rec.lastPoll || 0) >= rec.pollMs) {
    busy.poll = true;
    rec.lastPoll = now;
    rec.update(still).then(() => {
      if (!still()) return;
      prune(minsNow());
      afterUpdate();
      lastOk = Date.now();
      failing = false;
    }, err => {
      if (!limited(err) && still()) failing = true;
      console.warn('poll failed', err);
    }).finally(() => { busy.poll = false; });
  }

  if (!busy.gps && now - (rec.lastGps || 0) >= rec.gpsMs) {
    busy.gps = true;
    rec.lastGps = now;
    rec.positions(still).then(n => { if (still()) gpsCount = n; }, err => {
      if (still()) gpsCount = 0;
      limited(err);
      console.warn('positions failed', err);
    }).finally(() => { busy.gps = false; });
  }
}

function setView(k) {
  if (!active.views.includes(k)) k = active.views[0];
  const v = viewFor(k, rings[active.key]);
  state.viewKey = k;
  state.B = v.B;
  state.C.cities = v.cities;
  state.C.small = v.small;
  $('title').textContent = VIEWS[k].name;
  document.querySelectorAll('#views button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.v === k)));
  history.replaceState(null, '', k === 'fi' ? location.pathname : '#' + k);
  resize();
}

/** Put a loaded, current network on the map. */
function enter(rec, view) {
  active = rec;
  state.C = {
    name: rec.name, groups: rec.groups, groupOrder: rec.groupOrder, byLine: rec.byLine, noun: rec.noun,
    hasDelays: rec.hasDelays !== false, states: projectRings(rings[rec.key]), cities: {}, small: [],
  };
  state.S = { lines: [], trains: [], peak: 1, profile: [] };
  state.moving = [];
  state.soloLine = null;
  net.dirty = true;
  if ($('ssearch')) $('ssearch').value = '';
  const country = countryOf(rec.key);
  document.querySelectorAll('#ctry button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.c === country.key)));
  document.title = `Takt: ${rec.name}, live`;
  clearSlots();
  resetHour();
  buildKey();
  renderViews(country.views, goView);
  setView(view);
  afterUpdate();
  lastOk = Date.now();
  failing = false;
  gpsCount = 0;
  rec.lastPoll = rec.lastGps = 0;          // ask for news straight away
}

/** Any view of any country: a view of another network switches to it first. */
function goView(v) {
  const k = networkOfView(v);
  if (NETWORKS[k] === active) setView(v); else setNetwork(k, v);
}

const pickCountry = c => goView(COUNTRIES.find(x => x.key === c).views[0]);

async function setNetwork(k, view) {
  if (switching || !NETWORKS[k] || NETWORKS[k] === active) return;
  const rec = NETWORKS[k], prev = active;
  view = view || rec.views[0];
  // The pressed button shows the wait: the view within a country, else the country.
  const btn = (countryOf(k) === countryOf(prev.key) && document.querySelector(`#views button[data-v="${view}"]`))
    || document.querySelector(`#ctry button[data-c="${countryOf(k).key}"]`);
  switching = true;
  const label = btn.textContent;
  btn.textContent = '…';
  try {
    await prepare(rec);
    enter(rec, view);
  } catch (err) {
    console.error(err);
    prepare(prev);                       // back to what was playing
    $('hint').textContent = `${VIEWS[view].name} could not be loaded: ${err.message}`;
  } finally {
    btn.textContent = label;
    switching = false;
  }
}

/** The view an address names, or null if it is not a live one. */
function viewOf(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return 'fi';
  return Object.keys(VIEWS).includes(h) ? h : null;
}

export const live = {
  key: 'live',
  label: 'Live',

  owns: hash => viewOf(hash) !== null,

  /** Start loading what the address names (or the view last played),
   *  before anyone presses start or while replay is still playing. */
  preload(hash) {
    const view = (hash ? viewOf(hash) : state.viewKey) || 'fi';
    return prepare(NETWORKS[networkOfView(view)]);
  },

  /** Become the current mode: back to the view that was playing, or the one asked for. */
  async enter(hash) {
    const view = viewOf(hash) || state.viewKey || 'fi';
    const rec = NETWORKS[networkOfView(view)];
    await prepare(rec);
    on = true;
    state.mode = 'live';
    renderCountries(COUNTRIES.map(c => [c.key, c.name]), pickCountry);
    $('bar').setAttribute('role', 'img');
    $('bar').removeAttribute('tabindex');
    $('daybtns').innerHTML = '';
    $('daynote').textContent = '';
    enter(rec, view);
    setListening(true);
  },

  leave() {
    on = false;
    $('views').hidden = true;
  },

  busy: () => switching,
  step,
  status,
  space: () => $('play').click(),

  /** For the smoke test and the console. */
  hook: { get net() { return net; }, get active() { return active; }, setView, setNetwork, goView },
};

tick();
