// Boot. The network named in the address (Finland unless it says #sto) starts
// loading as soon as the page opens, so by the time someone has read the
// start screen it is usually there. Other networks load when first picked.

import { VIEWS } from './config.js';
import { state, $ } from './state.js';
import { initTheme, onThemeChange } from './theme.js';
import { initCredits } from './ui/credits.js';
import { initCanvas, resize, draw, drawNet } from './render.js';
import { initAudio, resetGrid, applyFx, clearSlots, AC, master, out } from './audio/engine.js';
import { initBed, updateBed } from './audio/bed.js';
import { step, hourNote, resetHour } from './sim.js';
import { initControls, renderViews, updateClock, trimTrail, drawProfile, setListening } from './ui/controls.js';
import { initAdvanced } from './ui/advanced.js';
import { buildSidebar, updateSidebarNotes, updateSidebarState } from './ui/sidebar.js';
import { buildKey } from './ui/legend.js';
import { buildGrid } from './geom.js';
import { net, useNet, prune, retune, dayProfile, projectRings, viewFor, minsNow } from './live/network.js';
import { setZone } from './live/clock.js';
import { NETWORKS, COUNTRIES, countryOf, networkOfView } from './live/networks.js';

let active = null, switching = false;
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
  // trains are dropped as the day goes on.
  if (active.profileDate !== active.today) {
    active.profile = dayProfile(active.today);
    active.profileDate = active.today;
  }
  state.S.profile = active.profile;
  state.S.peak = Math.max(1, ...state.S.profile);
  drawProfile(state.S.profile);
}

function status() {
  if (switching) return 'Loading…';
  if (failing) return 'Live feed unreachable, retrying';
  const age = (Date.now() - lastOk) / 1000;
  const gps = gpsCount ? `, ${gpsCount} on GPS` : '';
  return `Live, updated ${age < 5 ? 'just now' : Math.round(age) + ' s ago'}${gps}`;
}

/** One loop for both kinds of request, checked every second: each network
 *  says how often it wants trip changes and positions, and a network that has
 *  just been picked is asked straight away. Nothing is asked while the tab is
 *  hidden: nobody is listening, and the feeds have quotas. */
const busy = { poll: false, gps: false };
function tick() {
  setTimeout(tick, 1000);
  if (document.hidden || switching || !active) return;
  const rec = active, now = Date.now(), still = () => active === rec && !switching;

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
      if (still()) failing = true;
      console.warn('poll failed', err);
    }).finally(() => { busy.poll = false; });
  }

  if (!busy.gps && now - (rec.lastGps || 0) >= rec.gpsMs) {
    busy.gps = true;
    rec.lastGps = now;
    rec.positions(still).then(n => { if (still()) gpsCount = n; }, err => {
      if (still()) gpsCount = 0;
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
    hasDelays: true, states: projectRings(rings[rec.key]), cities: {}, small: [],
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

let lastTs = 0;
function frame(ts) {
  const now = performance.now();
  const dt = lastTs ? Math.min(0.5, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (!switching) {
    step(dt);
    hourNote();
    updateBed(now);
    draw(now);
    updateClock(updateSidebarNotes, status);
  }
  trimTrail(now);
  requestAnimationFrame(frame);
}

async function start(rec, view) {
  const go = $('go');
  go.textContent = 'Loading…';
  go.disabled = true;
  try {
    await prepare(rec);
  } catch (err) {
    go.textContent = 'Try again';
    go.disabled = false;
    go.onclick = () => start(rec, view);
    $('starterr').textContent = `The live feed could not be reached (${err.message}). Check your connection and try again.`;
    console.error(err);
    return;
  }

  initCanvas();
  initAdvanced();
  initControls(COUNTRIES.map(c => [c.key, c.name]), pickCountry);
  enter(rec, view);

  initAudio();
  applyFx();
  initBed();
  resetGrid();
  // A browser that is slow to hand over the audio device must not hold the
  // map hostage: it runs either way, and the grid is re-zeroed once sound starts.
  AC.resume().then(resetGrid, err => console.warn('audio did not start', err));
  setListening(true);

  onThemeChange(drawNet);
  addEventListener('resize', resize);
  const ro = new ResizeObserver(() => resize());
  for (const id of ['main', 'top', 'bottom']) ro.observe($(id));

  $('start').remove();

  // Inspection hook for the smoke test and the browser console.
  window.__takt = { state, get net() { return net; }, get active() { return active; }, setView, setNetwork, goView, resize, audio: { AC, master, out } };

  requestAnimationFrame(frame);
  tick();
}

function boot() {
  initTheme();
  initCredits();
  const view = location.hash.slice(1) || 'fi';
  const rec = NETWORKS[networkOfView(view)];
  const loading = prepare(rec);
  const go = $('go');
  const ready = () => { go.textContent = 'Start listening'; go.disabled = false; };
  loading.then(ready, ready);
  go.onclick = () => start(rec, view);
}

boot();
