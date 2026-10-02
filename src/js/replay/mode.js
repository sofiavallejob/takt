// Replay mode: a recorded day of a whole network, with real punctuality behind
// it (Austria, Switzerland, Germany, the Netherlands, the Mexico City metro).
// The clock can be paused, sped up and scrubbed, and a country can have a
// second, disrupted day. Addresses are #at, #ch, ... and #at-bad for that day.

import { state, $, clamp } from '../state.js';
import { resize, drawNet } from '../render.js';
import { clearSlots, applyFx } from '../audio/engine.js';
import { resetHour } from '../sim.js';
import { renderCountries, drawProfile } from '../ui/controls.js';
import { buildSidebar, updateSidebarNotes, updateSidebarState } from '../ui/sidebar.js';
import { buildKey } from '../ui/legend.js';
import { buildGrid } from '../geom.js';
import { loadManifest, loadCountry, loaded, getManifest } from './loader.js';
import { ensureCountry, dayShape } from './decode.js';
import { step } from './step.js';

let on = false, wired = false, switching = false;
let replayT = 0;            // the replayed clock, kept while live is playing

/** The country an address names ('#ch', '#de-bad'), or null. */
function keyOf(hash) {
  const k = (hash || '').replace(/^#/, '').split('-')[0];
  const m = getManifest();
  return m && m.order.includes(k) ? k : null;
}
const wantsBad = hash => (hash || '').replace(/^#/, '').split('-')[1] === 'bad';

function setPlaying(p) {
  state.playing = p;
  $('pause').dataset.playing = String(p);
  $('pause').setAttribute('aria-label', p ? 'Pause' : 'Play');
  $('pause').title = p ? 'Pause' : 'Play';
}

function resetHeads() {
  for (const s of state.S.trains) s.head = null;
  clearSlots();
}

function buildDayButtons() {
  $('daybtns').innerHTML = Object.entries(state.C.days)
    .map(([k, d]) => `<button class="dayb" data-day="${k}"><b>${d.label}</b><small>${d.sub}</small></button>`)
    .join('');
  document.querySelectorAll('.dayb').forEach(b => { b.onclick = () => setDay(b.dataset.day); });
}

function setDay(k) {
  state.day = k;
  state.S = state.C.DAYS[k];
  const idx = Object.keys(state.C.days).indexOf(k);
  history.replaceState(null, '', '#' + state.CK + (idx > 0 ? '-bad' : ''));
  document.querySelectorAll('.dayb').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.day === k)));

  for (const s of state.S.trains) { s.head = null; s.k = 0; }
  for (const g of state.S.lines) { g.vib = null; g.lastPluck = 0; }
  state.soloLine = null;
  state.moving = [];
  if ($('ssearch')) $('ssearch').value = '';
  if (!state.S.profile) Object.assign(state.S, dayShape(state.S));

  clearSlots();
  resetHour();
  buildGrid();
  drawNet();
  buildSidebar();
  updateSidebarNotes(true);
  updateSidebarState();
  drawProfile(state.S.profile, `Trains running on ${state.C.days[k].label}`);
  $('daynote').textContent = state.C.NOTE[k] || '';
}

function applyCountry(k) {
  const c = loaded(k);
  state.CK = k;
  state.C = c;
  ensureCountry(c);
  state.B = c.B;
  document.querySelectorAll('#ctry button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.c === k)));
  $('title').textContent = c.name;
  $('tcountsub').textContent = getManifest()?.trains?.[k] || '';
  document.title = `Takt: ${c.name}, static`;
  buildKey();
  buildDayButtons();
  setDay(Object.keys(c.days)[0]);
  resize();
}

async function setCountry(k) {
  if (k === state.CK || switching) return;
  const btn = document.querySelector(`#ctry button[data-c="${k}"]`);
  if (!loaded(k)) {
    const old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    switching = true;
    try {
      await loadCountry(k);
    } catch (err) {
      $('hint').textContent = 'Could not load that network.';
      console.error(err);
      return;
    } finally {
      if (btn) { btn.textContent = old; btn.disabled = false; }
      switching = false;
    }
  }
  if (on) applyCountry(k);
}

/** Play/pause, speed and the scrubbable day bar. Wired once, and only
 *  listening while replay is the current mode. */
function wire() {
  if (wired) return;
  wired = true;
  $('pause').onclick = () => setPlaying(!state.playing);
  document.querySelectorAll('[data-speed]').forEach(b => {
    b.onclick = () => {
      state.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach(o =>
        o.setAttribute('aria-pressed', String(o === b)));
    };
  });

  const bar = $('bar');
  let scrub = false;
  const scrubTo = e => {
    const r = bar.getBoundingClientRect();
    state.T = clamp((e.clientX - r.left) / r.width * 1440, 0, 1439.9);
    resetHeads();
  };
  bar.addEventListener('pointerdown', e => {
    if (!on) return;
    scrub = true; bar.setPointerCapture(e.pointerId); scrubTo(e);
  });
  bar.addEventListener('pointermove', e => { if (scrub && on) scrubTo(e); });
  bar.addEventListener('pointerup', () => { scrub = false; });
  bar.addEventListener('pointercancel', () => { scrub = false; });
  bar.addEventListener('keydown', e => {
    if (!on) return;
    if (e.key === 'ArrowRight') state.T = Math.min(1439, state.T + 15);
    else if (e.key === 'ArrowLeft') state.T = Math.max(0, state.T - 15);
    else return;
    e.preventDefault();
    resetHeads();
  });
}

export const replay = {
  key: 'replay',
  label: 'Static',

  /** The manifest is tiny and local; it is read first so the address can be
   *  matched against the recorded countries. */
  init: () => loadManifest(),

  owns: hash => keyOf(hash) !== null,

  preload(hash) {
    return loadCountry(keyOf(hash) || state.CK || getManifest().order[0]);
  },

  async enter(hash) {
    const m = getManifest();
    const k = keyOf(hash) || state.CK || m.order[0];
    const bad = wantsBad(hash);
    await loadCountry(k);
    on = true;
    state.mode = 'replay';
    state.muted = false;
    wire();
    renderCountries(m.order.map(c => [c, m.names[c]]), setCountry);
    const bar = $('bar');
    bar.setAttribute('role', 'slider');
    bar.setAttribute('aria-label', 'Time of day');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '1440');
    bar.tabIndex = 0;
    $('views').hidden = true;
    // Coming back to the country that was playing keeps its day and its time.
    const prevDay = k === state.CK ? state.day : null;
    state.T = state.N = replayT;
    applyCountry(k);
    const days = Object.keys(state.C.days);
    if (bad && days[1]) setDay(days[1]);
    else if (prevDay && prevDay !== days[0] && state.C.days[prevDay]) setDay(prevDay);
    setPlaying(true);
    applyFx();
  },

  leave() {
    on = false;
    replayT = state.T;
    const bar = $('bar');
    for (const a of ['aria-valuemin', 'aria-valuemax', 'aria-valuetext']) bar.removeAttribute(a);
  },

  busy: () => false,        // a country that is still loading leaves the last one playing
  step,
  status: null,             // the sub-line under the count is the pack's trains per day
  space: () => $('pause').click(),

  hook: { setDay, setCountry },
};
