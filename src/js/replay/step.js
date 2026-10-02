// Replay: playing back a recorded day. The clock runs at `state.speed`
// simulated minutes per second, and can be paused and scrubbed; every train
// that is running at that minute is placed from its recorded times, and plucks
// the lines its path crosses.

import { state } from '../state.js';
import { delayAt, actualDist, pointAt, query } from '../geom.js';
import { trigger } from '../sim.js';

let STRIDE = 1, rot = 0;

export function step(dt) {
  const T0 = state.T;
  if (state.playing) {
    state.T += dt * state.speed;
    if (state.T >= 1440) { state.T -= 1440; for (const s of state.S.trains) s.head = null; }
  }
  state.N = state.T;              // replay time is clock time
  const jump = !state.playing || Math.abs(state.T - T0) > 5;
  const T = state.T;
  const moving = [];

  for (const tr of state.S.buckets[Math.max(0, Math.min(96, Math.floor(T / 15)))]) {
    const a = tr.canc ? tr.t0 : tr.a0, b = tr.canc ? tr.t1 : tr.a1;
    if (T < a || T > b) { tr.head = null; continue; }
    const p = pointAt(tr.g, actualDist(tr, T));
    tr.x = p[0]; tr.y = p[1];
    tr.late = tr.canc ? 0 : delayAt(tr, T);
    moving.push(tr);

    // Crossings are checked in rotation (about 300 trains a frame); each check
    // covers the whole path travelled since that train was last looked at.
    if (!tr.head || jump) { tr.head = p; continue; }
    if ((++rot) % STRIDE !== 0) continue;
    const [ax, ay] = tr.head;
    if (Math.abs(p[0] - ax) < 0.01 && Math.abs(p[1] - ay) < 0.01) { tr.head = p; continue; }
    const own = tr.g.rep;
    query(ax, ay, p[0], p[1], (g, i, h) => {
      if (g === own || h.sin < 0.55) return;   // its own line, or running alongside: no note
      if (trigger(g, tr, ax + (p[0] - ax) * h.t, ay + (p[1] - ay) * h.t,
        (g.d[i] + (g.d[i + 1] - g.d[i]) * h.u) / g.len, false)) state.heard.crossings++;
    });
    tr.head = p;
  }

  state.moving = moving;
  STRIDE = Math.max(1, Math.ceil(moving.length / 300));
  rot += 1;
}
