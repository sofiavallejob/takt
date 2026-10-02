// Listening on and off, the view picker, the theme switch, the day bar, and
// playing the network by hand with the pointer.

import { state, $ } from '../state.js';
import { toggleTheme } from '../theme.js';
import { resize, cv, setTrail, pushTrail, trail } from '../render.js';
import { strum, collectSweep } from '../sim.js';
import { initSidebarSearch } from './sidebar.js';
import { VIEWS } from '../config.js';

export function setListening(on) {
  state.playing = on;
  $('play').textContent = on ? '⏸' : '▶';
  $('play').setAttribute('aria-label', on ? 'Stop listening' : 'Listen');
  $('play').title = on ? 'Stop listening' : 'Listen';
}

/** The views of the current network; hidden when it only has one. */
export function renderViews(keys, setView) {
  $('views').innerHTML = keys.map(k => `<button data-v="${k}">${VIEWS[k].name}</button>`).join('');
  $('views').hidden = keys.length < 2;
  document.querySelectorAll('#views button').forEach(b => { b.onclick = () => setView(b.dataset.v); });
}

export function initControls(networks, setNetwork) {
  // --- networks -------------------------------------------------------------
  $('ctry').innerHTML = networks.map(([k, name]) => `<button data-c="${k}">${name}</button>`).join('');
  document.querySelectorAll('#ctry button').forEach(b => { b.onclick = () => setNetwork(b.dataset.c); });

  // --- transport ------------------------------------------------------------
  $('play').onclick = () => setListening(!state.playing);
  $('bed').onclick = () => {
    state.bedOn = !state.bedOn;
    $('bed').setAttribute('aria-pressed', String(state.bedOn));
  };
  addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); }
  });

  // --- theme ----------------------------------------------------------------
  $('togtheme').onclick = toggleTheme;

  // --- strings panel --------------------------------------------------------
  $('togside').onclick = () => {
    const open = $('side').classList.toggle('closed') === false;
    $('togside').setAttribute('aria-pressed', String(open));
    setTimeout(resize, 300);
  };
  $('closeside').onclick = () => {
    $('side').classList.add('closed');
    $('togside').setAttribute('aria-pressed', 'false');
    setTimeout(resize, 300);
  };
  initSidebarSearch();

  // --- playing by hand ------------------------------------------------------
  // One pointer event can cross a dozen lines; they are gathered first and
  // strummed together so the mix stays under control.
  let last = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    last = [e.offsetX, e.offsetY, performance.now()];
    setTrail([last]);
    const hits = [];
    collectSweep(e.offsetX - 9, e.offsetY - 9, e.offsetX + 9, e.offsetY + 9, hits);
    collectSweep(e.offsetX - 9, e.offsetY + 9, e.offsetX + 9, e.offsetY - 9, hits);
    strum(hits);
  });
  cv.addEventListener('pointermove', e => {
    if (!last) return;
    const p = [e.offsetX, e.offsetY, performance.now()];
    const hits = [];
    collectSweep(last[0], last[1], p[0], p[1], hits);
    strum(hits);
    pushTrail(p);
    last = p;
  });
  const release = () => { last = null; };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('pointerleave', release);
}

/** The day bar: how many trains run across today, with now marked on it. */
export function drawProfile(profile) {
  const max = Math.max(1, ...profile), n = profile.length;
  let d = `M0 40`;
  profile.forEach((v, i) => { d += ` L${(i + 0.5) / n * 1000} ${40 - (v / max) * 36}`; });
  d += ' L1000 40 Z';
  $('profile').innerHTML =
    `<svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  $('bar').setAttribute('aria-label', `Trains running today, up to ${max} at once`);
}

let lastSec = -1;
export function updateClock(updateNotes, status) {
  const sec = Math.floor(state.T * 60);
  if (sec === lastSec) return;
  lastSec = sec;
  const m = Math.floor(state.T);
  const s = String((m / 60) | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  $('clock').innerHTML = [...s].map(ch => `<span${ch === ':' ? ' class="c"' : ''}>${ch}</span>`).join('');
  $('tcount').textContent = `${state.moving.length.toLocaleString()} trains moving`;
  $('tcountsub').textContent = status();
  const p = state.T / 1440 * 100;
  $('bar').querySelector('.knob').style.left = p + '%';
  $('bar').querySelector('.fill').style.width = p + '%';
  if (sec % 60 === 0) updateNotes();
}

export function trimTrail(now) {
  while (trail.length && now - trail[0][2] > 250) trail.shift();
}
