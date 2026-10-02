// Data sources. Reachable from the start screen (before any audio exists) and
// from the footer, so this module deliberately depends on nothing but config.

import { CREDITS_FI, CREDITS_SE, CREDITS_STO, CREDITS_GENERAL } from '../config.js';
import { TRAFIKVERKET_KEY } from '../keys.js';
import { $ } from '../state.js';

function render() {
  $('credtext').innerHTML = CREDITS_FI + (TRAFIKVERKET_KEY ? CREDITS_SE : '') + CREDITS_STO + CREDITS_GENERAL;
}

export function openCredits() {
  render();
  const d = $('credits');
  d.hidden = false;
  $('credclose').focus();
}

export function closeCredits() { $('credits').hidden = true; }

/** Wired once, at load — long before the instrument starts. */
export function initCredits() {
  for (const id of ['credlink', 'credlink2']) {
    const a = $(id);
    if (a) a.onclick = e => { e.preventDefault(); openCredits(); };
  }
  $('credclose').onclick = closeCredits;
  addEven