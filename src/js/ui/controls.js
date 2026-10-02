// The controls both modes share: the country picker, the chord bed, the theme
// switch, the Strings panel, the day bar, the clock, and playing the network
// by hand with the pointer. Live adds mute and the views (here); replay adds
// play/pause, speed, days and scrubbing (replay/mode.js).

import { state, $ } from '../state.js';
import { toggleTheme } from '../theme.js';
import { resize, cv, setTrail, pushTrail, trail } from '../render.js';
import { strum, collectSweep } from '../sim.js';
import { initSidebarSearch } from './sidebar.js';
import { VIEWS } from '../config.js';
import { applyFx } from '../audio/engine.js';

/** Live: sound on or off. Muting fades everything out, the chord bed and the
 *  echoes too; the trains keep moving, since there is no pausing real time. */
export function setListening(on) {
  state.playing = on;
  state.muted = !on;
  $('play').setAttribute('aria-pressed', String(!on));
  $('play').setAttribute('aria-label', on ? 'Mute' : 'Unmute');
  $('play').title = on ? 'Mute' : 'Unmute';
  applyFx();
}

/** Live: the views of the current country; hidden when it only has one. */
export function renderViews(keys, setView) {
  $('views').innerHTML = keys.map(k => `<button data-v="${k}">${VIEWS[k].name}</button>`).join('');
  $('views').hidden = keys.length < 2;
  document.querySelectorAll('#views button').forEach(b => { b.onclick = () => setView(b.dataset.v); });
}

/** The country picker. Each mode has its own countries and redraws it on entry. */
export function renderCountries(countries, pickCountry) {
  $('ctry').innerHTML = countries.map(([k, name]) => `<button data-c="${k}">${name}</button>`).join('');
  document.querySelectorAll('#ctry button').forEach(b => { b.onclick = () => pickCountry(b.dataset.c); });
}

/** Wired once. `onSpace` is the current mode's main button: mute live,
 *  play/pause in replay. */
export function initControls(onSpace) {
  // --- transport ------------------------------------------------------------
  $('play').onclick = () => setListening(!state.playing);
  $('bed').onclick = () => {
    state.bedOn = !state.bedOn;
    $('bed').setAttribute('aria-pressed', String(state.bedOn));
  };
  addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); onSpace(); }
  });

  // --- theme ----------------------------------------------------------------
  $('togtheme').onclick = toggleTheme;

  // --- full screen ----------------------------------------------------------
  // The whole page, so the map, the clock and the controls all come along.
  // Hidden where a page cannot go full screen (Safari on iPhone).
  const doc = document, root = doc.documentElement;
  const fsOn = () => doc.fullscreenElement || doc.webkitFullscreenElement;
  const canFs = doc.fullscreenEnabled || doc.webkitFullscreenEnabled;
  const toggleFs = () => {
    if (fsOn()) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  };
  const syncFs = () => {
    const on = !!fsOn();
    $('togfull').setAttribute('aria-pressed', String(on));
    $('togfull').setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    $('togfull').title = on ? 'Leave full screen (F)' : 'Full screen (F)';
    setTimeout(resize, 100);
  };
  if (canFs) {
    $('togfull').hidden = false;
    $('togfull').onclick = toggleFs;
    doc.addEventListener('fullscreenchange', syncFs);
    doc.addEventListener('webkitfullscreenchange', syncFs);
    addEventListener('keydown', e => {
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey
        && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); toggleFs(); }
    });
  }

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

/** The day bar: how many trains run across the day, with now marked on it. */
export function drawProfile(profile, label = 'Trains running today') {
  const max = Math.max(1, ...profile), n = profile.length;
  let d = `M0 40`;
  profile.forEach((v, i) => { d += ` L${(i + 0.5) / n * 1000} ${40 - (v / max) * 36}`; });
  d += ' L1000 40 Z';
  $('profile').innerHTML =
    `<svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  $('bar').setAttribute('aria-label', profile.some(v => v > 0) ? `${label}, up to ${max} at once` : label);
}

let lastKey = -1, lastMin = -1;
/** The clock, the train count and the day bar. Live updates every second
 *  (`status` is the feed's health); replay every simulated minute. */
export function updateClock(updateNotes, status) {
  const key = state.mode === 'live' ? Math.floor(state.T * 60) : Math.floor(state.T);
  if (key === lastKey) return;
  lastKey = key;
  const m = Math.floor(state.T);
  const s = String((m / 60) | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  $('clock').innerHTML = [...s].map(ch => `<span${ch === ':' ? ' class="c"' : ''}>${ch}</span>`).join('');
  $('tcount').textContent = `${state.moving.length.toLocaleString()} ${state.C.noun || 'trains'} moving`;
  if (status) $('tcountsub').textContent = status();
  if (state.mode === 'replay') $('bar').setAttribute('aria-valuetext', s);
  const p = state.T / 1440 * 100;
  $('bar').querySelector('.knob').style.left = p + '%';
  $('bar').querySelector('.fill').style.width = p + '%';
  if (m !== lastMin) { lastMin = m; updateNotes(); }
}

export function trimTrail(now) {
  while (trail.length && now - trail[0][2] > 250) trail.shift();
}
