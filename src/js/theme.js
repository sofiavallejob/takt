// Light and dark are a user choice, not a function of the clock. The canvas
// needs the same colours as the CSS, so they live here rather than in the
// stylesheet alone and are mirrored onto :root as custom properties.

const KEY = 'takt.theme';

const PALETTES = {
  light: {
    dark: false,
    bg: '#f3f5f7', ink: '#16232f', muted: '#5b6c7c',
    line: 'rgba(22,35,47,.14)', chip: 'rgba(243,245,247,.90)',
    border: 'rgba(22,35,47,.08)',   // state outlines on the map
    label: 'rgba(22,35,47,.62)',    // city labels
    halo: 'rgba(243,245,247,.95)',  // text outline and dot rims
    trail: 'rgba(22,35,47,.30)',
    flash: 'rgba(22,35,47,.12)',
    netAlpha: 0.5, tailAlpha: 1,
  },
  dark: {
    dark: true,
    bg: '#0e141e', ink: '#e2e9f0', muted: '#9fb0c0',
    line: 'rgba(226,233,240,.18)', chip: 'rgba(14,20,30,.92)',
    border: 'rgba(226,233,240,.08)',
    label: 'rgba(226,233,240,.55)',
    halo: 'rgba(17,25,33,.95)',
    trail: 'rgba(226,233,240,.35)',
    flash: 'rgba(226,233,240,.15)',
    netAlpha: 0.6, tailAlpha: 1.4,
  },
};

export let theme = PALETTES.light;

const listeners = new Set();
/** Register a callback fired after every theme change (the canvas redraws). */
export function onThemeChange(fn) { listeners.add(fn); }

export function currentMode() { return theme.dark ? 'dark' : 'light'; }

export function setTheme(mode, persist = true) {
  theme = PALETTES[mode] || PALETTES.light;
  const r = document.documentElement;
  r.dataset.theme = mode;
  r.style.setProperty('--bg', theme.bg);
  r.style.setProperty('--ink', theme.ink);
  r.style.setProperty('--muted', theme.muted);
  r.style.setProperty('--line', theme.line);
  r.style.setProperty('--chip', theme.chip);
  const btn = document.getElementById('togtheme');
  if (btn) {
    btn.setAttribute('aria-pressed', String(theme.dark));
    btn.setAttribute('aria-label', theme.dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if (persist) { try { localStorage.setItem(KEY, mode); } catch {} }
  for (const fn of listeners) fn();
}

export function toggleTheme() { setTheme(theme.dark ? 'light' : 'dark'); }

/** Saved choice wins; otherwise follow the system, and keep following it until
 *  the user picks a side. */
export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  const mq = matchMedia('(prefers-color-scheme: dark)');
  setTheme(saved || (mq.matches ? 'dark' : 'light'), false);
  mq.addEventListener('change', e => {
    let s = null; try { s = localStorage.getItem(KEY); } catch {}
    if (!s) setTheme(e.matches ? 'dark' : 'light', false);
  });
}
