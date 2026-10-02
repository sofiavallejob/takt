// The Advanced panel: everything that shapes the sound but is not a transport
// control — density, volume, tuning, labels, and the effects chain.

import { FX_DEFAULTS } from '../config.js';
import { state, $ } from '../state.js';
import { applyFx } from '../audio/engine.js';
import { drawNet } from '../render.js';
import { updateSidebarNotes } from './sidebar.js';

const KEY = 'takt.prefs';

function savePrefs() {
  const p = { tuning: state.tuning, showLabels: state.showLabels, arrivals: state.arrivals };
  for (const id of Object.keys(FX_DEFAULTS)) p[id] = $(id)?.value;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

function loadPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!p) return;
  for (const id of Object.keys(FX_DEFAULTS)) if (p[id] != null && $(id)) $(id).value = p[id];
  if (p.tuning) state.tuning = p.tuning;
  if (typeof p.showLabels === 'boolean') state.showLabels = p.showLabels;
  if (typeof p.arrivals === 'boolean') state.arrivals = p.arrivals;
}

function syncTuningButtons() {
  document.querySelectorAll('[data-tuning]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.tuning === state.tuning)));
  $('tunenote').textContent = state.tuning === 'harmonic'
    ? 'Length ratios as frequency ratios. Honest, and towards the top it stops being a melody.'
    : 'Strings snap to a chord that moves on every hour in Helsinki.';
}

export function initAdvanced() {
  loadPrefs();

  $('togadv').onclick = () => {
    const p = $('adv');
    const on = p.classList.toggle('on');
    $('togadv').setAttribute('aria-pressed', String(on));
  };
  $('advclose').onclick = () => {
    $('adv').classList.remove('on');
    $('togadv').setAttribute('aria-pressed', 'false');
  };

  for (const id of Object.keys(FX_DEFAULTS)) {
    const el = $(id); if (!el) continue;
    el.oninput = () => { applyFx(); savePrefs(); };
  }

  document.querySelectorAll('[data-tuning]').forEach(b => {
    b.onclick = () => {
      state.tuning = b.dataset.tuning;
      syncTuningButtons();
      updateSidebarNotes(true);
      savePrefs();
    };
  });

  $('toglabels').onclick = () => {
    state.showLabels = !state.showLabels;
    $('toglabels').setAttribute('aria-pressed', String(state.showLabels));
    drawNet();
    savePrefs();
  };

  $('togarr').onclick = () => {
    state.arrivals = !state.arrivals;
    $('togarr').setAttribute('aria-pressed', String(state.arrivals));
    $('togarr').textContent = state.arrivals ? 'On' : 'Off';
    savePrefs();
  };

  $('advreset').onclick = () => {
    for (const [k, v] of Object.entries(FX_DEFAULTS)) if ($(k)) $(k).value = v;
    state.tuning = 'chord';
    state.showLabels = true;
    state.arrivals = true;
    syncTuningButtons();
    $('toglabels').setAttribute('aria-pressed', 'true');
    $('togarr').setAttribute('aria-pressed', 'true');
    $('togarr').textContent = 'On';
    applyFx();
    drawNet();
    updateSidebarNotes(true);
    savePrefs();
  };

  syncTuningButtons();
  $('toglabels').setAttribute('aria-pressed', String(state.showLabels));
  $('togarr').setAttribute('aria-pressed', String(state.arrivals));
  $('togarr').textContent = state.arrivals ? 'On' : 'Off';
}
