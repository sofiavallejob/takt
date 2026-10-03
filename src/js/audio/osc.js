// OSC out: every note the instrument plays, sent as Open Sound Control so any
// synth, patch or visual can play the trains its own way.
//
// A web page cannot send UDP, so the messages go over a WebSocket to the
// listener's own computer (ws://localhost:PORT), one OSC packet per binary
// frame. Software that speaks OSC over WebSocket can take them directly;
// for everything else (Pure Data, SuperCollider, Max, Ableton, Reaper ...)
// tools/osc-bridge.mjs passes them on as ordinary UDP OSC.
//
// Messages (see README, "OSC out"):
//   /takt/pluck  f freq  f midi  f pan  f amp  f late  f pos  s kind  s line
//   /takt/click  f pan  s line
//   /takt/hour   f root  s chord
//   /takt/state  f moving  f late  f cancelled  f lean  f clock  s network  s mode

import { state } from '../state.js';

const enc = new TextEncoder();
let ws = null, want = false, port = 8080, retry = null;
let status = 'off';                         // 'off' | 'connecting' | 'on' | 'waiting'
const listeners = new Set();

export const oscStatus = () => status;
export const oscPort = () => port;
export function onOscStatus(fn) { listeners.add(fn); }
function setStatus(s) { status = s; for (const fn of listeners) fn(s); }

/** Start sending to ws://localhost:p, and keep trying until something answers. */
export function oscConnect(p) {
  port = p;
  want = true;
  open();
}

export function oscDisconnect() {
  want = false;
  clearTimeout(retry);
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ws = null; }
  setStatus('off');
}

function open() {
  clearTimeout(retry);
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
  setStatus('connecting');
  try { ws = new WebSocket(`ws://localhost:${port}`); } catch { return later(); }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => setStatus('on');
  ws.onclose = () => { ws = null; later(); };
  ws.onerror = () => {};                    // onclose follows, and retries
}

function later() {
  if (!want) return;
  setStatus('waiting');
  retry = setTimeout(open, 3000);
}

/** One OSC message: the address, the type tags, then each argument, every
 *  part padded to four bytes. Numbers are float32, words are strings. */
function packet(address, args) {
  const str = s => { const b = enc.encode(s); const n = (b.length + 4) & ~3; const o = new Uint8Array(n); o.set(b); return o; };
  const parts = [str(address), str(',' + args.map(a => (typeof a === 'number' ? 'f' : 's')).join(''))];
  for (const a of args) {
    if (typeof a === 'number') {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setFloat32(0, Number.isFinite(a) ? a : 0, false);
      parts.push(b);
    } else parts.push(str(String(a)));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function oscSend(address, ...args) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(packet(address, args)); } catch { /* the next message will try again */ }
}

/** Send at the moment the note is due, so OSC lands on the same beat as the
 *  browser's own sound. */
export function oscAt(waitMs, address, ...args) {
  if (status !== 'on') return;
  if (waitMs > 1) setTimeout(() => oscSend(address, ...args), waitMs);
  else oscSend(address, ...args);
}

let lastState = 0;
/** The state of the whole network, about once a second. */
export function oscState(now) {
  if (status !== 'on' || now - lastState < 1000 || !state.B) return;
  lastState = now;
  let run = 0, late = 0, canc = 0, sx = 0;
  for (const tr of state.moving) {
    if (tr.canc) { canc++; continue; }
    run++;
    if (tr.late >= (tr.lateThr ?? 5)) late++;
    sx += tr.x;
  }
  const B = state.B, mx = run ? sx / run : (B.x0 + B.x1) / 2;
  const lean = Math.max(-1, Math.min(1, ((mx - B.x0) / ((B.x1 - B.x0) || 1)) * 2 - 1));
  const n = state.moving.length || 1;
  oscSend('/takt/state', state.moving.length, run ? late / run : 0, canc / n, lean, state.T,
    document.getElementById('title')?.textContent || '', state.mode === 'live' ? 'live' : 'static');
}
