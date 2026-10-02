// The Strings panel: every line in the network, grouped into long distance,
// regional and commuter. A section's rows are built the first time it opens.

import { state, $ } from '../state.js';
import { theme } from '../theme.js';
import { lineCol } from './colour.js';
import { labelForLine } from '../audio/tuning.js';
import { drawNet } from '../render.js';

let sections = [], maxLen = 1;

function rowHTML(g) {
  const c = g.lc || lineCol(g.u);
  const title = g.name ? g.name : `${g.from} to ${g.to}`;
  const sub = g.name ? ` <span class="op">${g.from} to ${g.to}</span>` : '';
  return `<i style="background:${c}"></i>` +
    `<span class="nm" title="${title}">${title}${sub}</span>` +
    `<span class="nt km">${Math.round(g.len)} km</span>` +
    `<span class="nt note"></span>` +
    `<div class="bar"><span style="background:${c};width:${Math.max(2, Math.round(g.len / maxLen * 100))}%"></span></div>`;
}

function buildRows(sec) {
  if (sec.built) return;
  sec.built = true;
  const frag = document.createDocumentFragment();
  for (const g of sec.lines) {
    const div = document.createElement('div');
    div.className = 'sl';
    div.innerHTML = rowHTML(g);
    div.onclick = () => {
      state.soloLine = state.soloLine === g ? null : g;
      updateSidebarState();
    };
    frag.appendChild(div);
    g._el = div;
  }
  sec.body.appendChild(frag);
  refreshNotes(sec);
  applySoloTo(sec);
}

export function buildSidebar() {
  const el = $('slist');
  el.innerHTML = '';
  sections = [];
  for (const g of state.S.lines) g._el = null;
  maxLen = Math.max(1, ...state.S.lines.map(g => g.len));

  const sorted = state.S.lines.slice().sort((a, b) => a.u - b.u);
  const groups = new Map();
  for (const g of sorted) {
    if (!groups.has(g.group)) groups.set(g.group, []);
    groups.get(g.group).push(g);
  }
  const order = [...(state.C.groupOrder || []), ...groups.keys()]
    .filter((k, i, a) => groups.has(k) && a.indexOf(k) === i);

  for (const op of order) {
    const lines = groups.get(op);
    if (!lines || !lines.length) continue;
    if (groups.size > 1) {
      const d = document.createElement('details');
      d.className = 'grp';
      const s = document.createElement('summary');
      s.innerHTML = `<span class="gname">${op}</span><span class="gcount">${lines.length}</span>`;
      const body = document.createElement('div');
      d.appendChild(s); d.appendChild(body);
      el.appendChild(d);
      const sec = { op, lines, details: d, body, built: false };
      d.addEventListener('toggle', () => { if (d.open) buildRows(sec); });
      sections.push(sec);
    } else {
      const body = document.createElement('div');
      el.appendChild(body);
      const sec = { op, lines, details: null, body, built: false };
      sections.push(sec);
      buildRows(sec);           // a single group is always visible
    }
  }
  $('scount').textContent = `${state.S.lines.length} strings`;
}

function applySoloTo(sec) {
  const solo = state.soloLine;
  for (const g of sec.lines) {
    if (!g._el) continue;
    g._el.classList.toggle('muted', !!(solo && solo !== g));
    g._el.classList.toggle('solo', solo === g);
  }
}

export function updateSidebarState() {
  drawNet();
  $('unsolo').style.display = state.soloLine ? 'inline-block' : 'none';
  for (const sec of sections) applySoloTo(sec);
}

export function isLineMuted(g) { return state.soloLine && state.soloLine !== g; }

export function flashLine(g) {
  if (!g._el) return;
  g._el.style.background = theme.flash;
  setTimeout(() => { if (g._el) g._el.style.background = ''; }, 350);
}

function refreshNotes(sec) {
  for (const g of sec.lines) {
    if (!g._el) continue;
    const n = g._el.querySelector('.note');
    if (n) n.textContent = labelForLine(g, state.T);
  }
}

let notesKey = null;
/** Note names only change when the chord does, or when the tuning is switched. */
export function updateSidebarNotes(force) {
  const key = state.tuning + '|' + (state.tuning === 'harmonic' ? '' : Math.floor(state.T / 60) % 4);
  if (!force && key === notesKey) return;
  notesKey = key;
  for (const sec of sections) if (sec.built) refreshNotes(sec);
}

export function initSidebarSearch() {
  const box = $('ssearch');
  box.oninput = () => {
    const q = box.value.toLowerCase().trim();
    for (const sec of sections) {
      if (!q) {
        if (sec.details) { sec.details.hidden = false; sec.details.open = false; }
        if (sec.built) for (const g of sec.lines) if (g._el) g._el.style.display = '';
        continue;
      }
      const match = sec.lines.filter(g => lineText(g).includes(q));
      if (sec.details) sec.details.hidden = !match.length;
      if (!match.length) continue;
      if (sec.details) sec.details.open = true;
      buildRows(sec);
      const hit = new Set(match);
      for (const g of sec.lines) if (g._el) g._el.style.display = hit.has(g) ? '' : 'none';
    }
  };
  box.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const visible = [];
    for (const sec of sections) {
      if (!sec.built || (sec.details && sec.details.hidden)) continue;
      for (const g of sec.lines) if (g._el && g._el.style.display !== 'none') visible.push(g._el);
    }
    if (visible.length === 1) visible[0].click();
  };
}

function lineText(g) {
  return `${g.name || ''} ${g.from} ${g.to} ${g.group}`.toLowerCase();
}
