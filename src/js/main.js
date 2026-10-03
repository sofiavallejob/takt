// Boot, the mode switch, and the frame loop.
//
// Takt has two modes over one instrument. Live plays the trains where they
// are right now (Finland, Sweden, Norway). Replay plays back a recorded day
// (Austria, Switzerland, Germany, the Netherlands, Mexico City), with a clock
// that can be paused and scrubbed. The address picks the mode: #sto or #hel
// are live, #ch or #de-bad are replay, and no address is live Finland.

import { state, $ } from './state.js';
import { initTheme, onThemeChange } from './theme.js';
import { initCredits } from './ui/credits.js';
import { initCanvas, resize, draw, drawNet } from './render.js';
import { initAudio, resetGrid, applyFx, clearSlots, AC, master, out } from './audio/engine.js';
import { initBed, updateBed } from './audio/bed.js';
import { hourNote } from './sim.js';
import { initControls, updateClock, trimTrail } from './ui/controls.js';
import { initAdvanced } from './ui/advanced.js';
import { updateSidebarNotes } from './ui/sidebar.js';
import { live } from './live/mode.js';
import { replay } from './replay/mode.js';
import { track } from './stats.js';
import { initOutput } from './ui/output.js';
import { oscState } from './audio/osc.js';
import { unlockAudio, watchAudio } from './audio/unlock.js';

const MODES = { live, replay };
let mode = live, changing = false;

function showMode(m) {
  document.body.dataset.mode = m;
  for (const b of document.querySelectorAll('[data-m]')) b.setAttribute('aria-pressed', String(b.dataset.m === m));
}

/** Switch between live and replay while playing. The new mode loads first, so
 *  the old one keeps playing until there is something to hear instead. */
async function setMode(m) {
  if (m === mode.key || changing || !MODES[m]) return;
  const next = MODES[m], btn = document.querySelector(`#modes [data-m="${m}"]`);
  changing = true;
  track(`mode/${next.label.toLowerCase()}`, `Switched to ${next.label}`);
  const label = btn.textContent;
  btn.textContent = '…';
  try {
    await next.preload('');
    mode.leave();
    clearSlots();
    mode = next;
    showMode(m);
    await next.enter('');
  } catch (err) {
    console.error(err);
    $('hint').textContent = `${next.label} could not be loaded: ${err.message}`;
  } finally {
    btn.textContent = label;
    changing = false;
    showMode(mode.key);
    resize();
  }
}

let lastTs = 0;
/** One step of the instrument: move the trains, sound what they pluck, and
 *  (when the page can be seen) draw them. */
function advance(ts, visible) {
  const now = performance.now();
  // A hidden tab is ticked less evenly, so it may take a longer step.
  const cap = !visible ? 1 : state.mode === 'live' ? 0.5 : 0.1;
  const dt = lastTs ? Math.min(cap, Math.max(0, (ts - lastTs) / 1000)) : 0;
  lastTs = ts;
  if (!changing && !mode.busy()) {
    mode.step(dt);
    hourNote();
    updateBed(now);
    oscState(now);
    if (visible) {
      draw(now);
      updateClock(updateSidebarNotes, mode.status);
    }
  }
  if (visible) trimTrail(now);
}

function frame(ts) {
  if (!document.hidden) advance(ts, true);
  requestAnimationFrame(frame);
}

/** Browsers stop drawing a page in a hidden tab, and with it the frame loop.
 *  The music must not stop with the picture, so a timer keeps the
 *  instrument going while the tab is out of sight (a page that is playing
 *  sound is allowed to keep its timers). */
function background() {
  setInterval(() => { if (document.hidden) advance(performance.now(), false); }, 100);
}

async function start(hash) {
  const go = $('go');
  go.textContent = 'Loading…';
  go.disabled = true;
  try {
    await mode.preload(hash);
  } catch (err) {
    go.textContent = 'Try again';
    go.disabled = false;
    $('starterr').textContent = mode === live
      ? `The live feed could not be reached (${err.message}). Check your connection and try again.`
      : 'That network could not be loaded. Check your connection and try again.';
    console.error(err);
    return;
  }

  initCanvas();
  initAdvanced();
  initOutput();
  initControls(() => mode.space());
  document.querySelectorAll('#modes [data-m]').forEach(b => { b.onclick = () => setMode(b.dataset.m); });
  track(`start/${mode.label.toLowerCase()}`, `Start listening (${mode.label})`);
  await mode.enter(hash);

  initAudio();
  applyFx();
  initBed();
  resetGrid();
  // A browser that is slow to hand over the audio device must not hold the
  // map hostage: it runs either way, and the grid is re-zeroed once sound starts.
  AC.resume().then(resetGrid, err => console.warn('audio did not start', err));
  watchAudio();

  onThemeChange(drawNet);
  addEventListener('resize', resize);
  const ro = new ResizeObserver(() => resize());
  for (const id of ['main', 'top', 'bottom']) ro.observe($(id));

  $('start').remove();

  // Inspection hook for the smoke tests and the browser console.
  window.__takt = {
    state, resize, setMode, audio: { AC, master, out },
    get mode() { return mode.key; },
    // live
    get net() { return live.hook.net; },
    get active() { return live.hook.active; },
    setView: live.hook.setView, setNetwork: live.hook.setNetwork, goView: live.hook.goView,
    // replay
    setDay: replay.hook.setDay, setCountry: replay.hook.setCountry,
  };

  requestAnimationFrame(frame);
  background();
}

async function boot() {
  initTheme();
  initCredits();
  // The replay manifest is tiny and local; without it, only live is on offer.
  const haveReplay = await replay.init().then(() => true, err => { console.warn('replay unavailable', err); return false; });
  if (!haveReplay) for (const b of document.querySelectorAll('[data-m="replay"]')) b.hidden = true;

  let hash = location.hash;
  mode = haveReplay && replay.owns(hash) ? replay : live;
  showMode(mode.key);

  const go = $('go');
  const pick = m => {
    mode = MODES[m];
    if (!mode.owns(hash)) hash = '';     // the address named the other mode
    showMode(m);
    $('starterr').textContent = '';
    go.textContent = m === 'live' ? 'Loading live trains…' : 'Loading…';
    go.disabled = true;
    const want = mode;
    const ready = () => { if (mode === want) { go.textContent = 'Start listening'; go.disabled = false; } };
    mode.preload(hash).then(ready, ready);
  };
  document.querySelectorAll('#startmodes [data-m]').forEach(b => { b.onclick = () => { if (b.dataset.m !== mode.key) pick(b.dataset.m); }; });
  // The audio is woken inside the tap itself, before anything loads: phones
  // only allow sound to start there.
  go.onclick = () => { unlockAudio(); start(mode.owns(hash) ? hash : ''); };
  pick(mode.key);
}

boot();
