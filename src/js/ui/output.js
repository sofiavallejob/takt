// The Output section of the Advanced panel: the browser's own sound on or
// off, and OSC out to a port on this computer. Both are remembered.

import { state, $ } from '../state.js';
import { applyFx } from '../audio/engine.js';
import { oscConnect, oscDisconnect, onOscStatus, oscStatus } from '../audio/osc.js';

const KEY = 'takt.output';
const WORDS = { off: 'Not connected', connecting: 'Connecting…', on: 'Sending', waiting: 'Nothing listening yet, retrying' };

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      browserSound: state.browserSound, port: +$('oscport').value, osc: oscStatus() !== 'off',
    }));
  } catch {}
}

function showSound() {
  $('togsound').setAttribute('aria-pressed', String(state.browserSound));
  $('togsound').textContent = state.browserSound ? 'On' : 'Off';
}

function showStatus(s) {
  $('oscstat').dataset.s = s;
  $('oscstat').querySelector('span').textContent = s === 'on' ? `${WORDS.on} to ws://localhost:${$('oscport').value}` : WORDS[s];
  $('oscgo').textContent = s === 'off' ? 'Connect' : 'Disconnect';
  $('oscgo').setAttribute('aria-pressed', String(s !== 'off'));
}

export function initOutput() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (p && typeof p.browserSound === 'boolean') state.browserSound = p.browserSound;
  if (p && p.port) $('oscport').value = p.port;

  onOscStatus(showStatus);
  showStatus('off');
  showSound();

  $('togsound').onclick = () => { state.browserSound = !state.browserSound; showSound(); applyFx(); save(); };
  $('oscgo').onclick = () => {
    const port = Math.round(+$('oscport').value);
    if (oscStatus() !== 'off') oscDisconnect();
    else if (port > 0 && port < 65536) oscConnect(port);
    save();
  };
  $('oscport').onchange = () => { if (oscStatus() !== 'off') oscConnect(Math.round(+$('oscport').value)); save(); };

  // Pick up where the listener left off: a patch that was connected last time
  // is looked for again (quietly, until it answers).
  if (p && p.osc && p.port) oscConnect(p.port);
}
