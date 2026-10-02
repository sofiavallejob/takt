// The key under the map. Deliberately terse: what the colours mean, and the two
// marks that are not colours.

import { state, $ } from '../state.js';
import { lineCol } from './colour.js';

export function buildKey() {
  const C = state.C, out = [];

  if (C.byLine) {
    // A metro's lines carry official liveries, so the pitch gradient would lie.
    out.push(...C.groups.map(g =>
      `<span><i class="dot" style="background:${g.col}"></i>${g.short}</span>`));
  } else {
    const grad = [0, 0.25, 0.5, 0.75, 1].map(u => lineCol(u)).join(',');
    out.push(`<span><i class="grad" style="background:linear-gradient(90deg,${grad})"></i>long routes low, short routes high</span>`);
    out.push(...C.groups.map(g =>
      `<span><i class="dot" style="background:${g.col}"></i>${g.name}</span>`));
  }

  if (C.hasDelays) {
    out.push('<span><i class="ring"></i>where a late train should be</span>');
    out.push('<span><i class="ring dash"></i>cancelled</span>');
  }
  $('key').innerHTML = out.join('');
}
