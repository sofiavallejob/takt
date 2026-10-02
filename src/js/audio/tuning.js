// How a string's length becomes a pitch. Two answers, switchable in Advanced.

import { CHORDS, LO, HI, NOTE_NAMES, RENDER_LO, RENDER_HI } from '../config.js';
import { state } from '../state.js';

export const chordAt = T => CHORDS[Math.floor((((T % 1440) + 1440) % 1440) / 60) % 4];

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = f => 69 + 12 * Math.log2(f / 440);
export const noteName = m => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

/** Chord tuning: the string is pulled to the nearest note of the hour's chord,
 *  so the whole network stays inside one harmony. */
export function chordMidi(g, T) {
  const ch = chordAt(T), target = LO + g.u * (HI - LO);
  let best = LO, bd = 99;
  for (let m = LO; m <= HI; m++) {
    if (ch.pcs.includes(m % 12) && Math.abs(m - target) < bd) { bd = Math.abs(m - target); best = m; }
  }
  return best;
}

/** Harmonic tuning: frequency is inversely proportional to length, the way a
 *  real string behaves. The longest route in the country is the fundamental and
 *  everything else is its partial — honest, and towards the top it stops being
 *  a melody and turns into a microtonal cluster. */
export function harmonicFreq(g) {
  const f = mtof(RENDER_LO) * (g.ratio || 1);
  return Math.min(mtof(RENDER_HI), Math.max(mtof(RENDER_LO), f));
}

/** The frequency a string sounds at right now, under the current tuning. */
export function freqForLine(g, T) {
  return state.tuning === 'harmonic' ? harmonicFreq(g) : mtof(chordMidi(g, T));
}

/** Short label for the sidebar: a note name in chord tuning, the nearest note
 *  in harmonic tuning (where exact names rarely exist). */
export function labelForLine(g, T) {
  if (state.tuning !== 'harmonic') return noteName(chordMidi(g, T));
  return noteName(Math.round(ftom(harmonicFreq(g))));
}

/** Longer label for the hover readout. */
export function describeTuning(g, T) {
  if (state.tuning !== 'harmonic') return `plays ${noteName(chordMidi(g, T))} in ${chordAt(T).name}`;
  const m = ftom(harmonicFreq(g)), near = Math.round(m), cents = Math.round((m - near) * 100);
  const sign = cents > 0 ? '+' : '';
  return `plays ${Math.round(harmonicFreq(g))} Hz (${noteName(near)}${cents ? ' ' + sign + cents + '¢' : ''}), partial ${(g.ratio || 1).toFixed(1)}`;
}
