// Data sources. Reachable from the start screen (before any audio exists) and
// from the footer, so this module deliberately depends on nothing but config.

import { CREDITS_AT, CREDITS_FI, CREDITS_HEL, CREDITS_SE, CREDITS_STO, CREDITS_NO, CREDITS_US, CREDITS_REPLAY, CREDITS_GENERAL } from '../config.js';
import { TRAFIKVERKET_KEY } from '../keys.js';
import { $ } from '../state.js';

const REPLAY_ORDER = ['at', 'de', 'mx', 'nl', 'ch'];   // alphabetical, as in the picker

function render() {
  const live = CREDITS_AT + CREDITS_FI + CREDITS_HEL + CREDITS_NO + (TRAFIKVERKET_KEY ? CREDITS_SE : '') + CREDITS_STO + CREDITS_US;
  const replay = REPLAY_ORDER.map(k => CREDITS_REPLAY[k]).join('');
  $('credtext').innerHTML = live + replay + CREDITS_GENERAL;
}

export function openCredits() {
  render();
  const d = $('credits');
  d.hidden = false;
  $('credclose').focus();
}

export function closeCredits() { $('credits').hidden = true; }

/** Wired once, at load, long before the instrument starts. */
export function initCredits() {
  for (const id of ['credlink', 'credlink2']) {
    const a = $(id);
    if (a) a.onclick = e => { e.preventDefault(); openCredits(); };
  }
  $('credclose').onclick = closeCredits;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('credits').hidden) closeCredits(); });
}
