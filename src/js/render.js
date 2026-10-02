// Canvas drawing. The static network is painted once into an offscreen canvas
// and blitted each frame; only the vibrating lines, the trains and the labels
// are redrawn.

import { state, $ } from './state.js';
import { theme } from './theme.js';
import { lineCol } from './ui/colour.js';
import { pointAt, distAt, actualDist } from './geom.js';
import { describeTuning } from './audio/tuning.js';

export let cv = null, ctx = null;
let net = null, nctx = null;

export const X = x => state.view.x + x * state.view.s;
export const Y = y => state.view.y + y * state.view.s;
const ws = () => Math.max(0.5, Math.min(1, state.view.s / 2));

export function initCanvas() {
  cv = $('c');
  ctx = cv.getContext('2d');
  net = document.createElement('canvas');
  nctx = net.getContext('2d');
}

export function resize() {
  const mc = $('main'); if (!mc) return;
  state.DPR = Math.min(2, devicePixelRatio || 1);
  const W = mc.offsetWidth, H = mc.offsetHeight;
  if (!W || !H) return;
  state.W = W; state.H = H;
  for (const c of [cv, net]) { c.width = W * state.DPR; c.height = H * state.DPR; }
  const B = state.B;
  // The map fills whatever the header and the controls leave free. On a phone
  // the header sits above the map; held sideways it is a column on the left.
  const mob = W < 760, short = H < 520 && W > H;
  const box = mc.getBoundingClientRect();
  const hb = $('top').getBoundingClientRect(), bb = $('bottom').getBoundingClientRect();
  const left = short ? hb.right - box.left + 12 : mob ? 8 : 40, right = mob || short ? 8 : 40;
  const top = short ? 12 : mob ? hb.bottom - box.top + 10 : 150;
  const bottom = Math.max(mob ? 0 : 128, box.bottom - bb.top + 6);
  const aw = Math.max(40, W - left - right), ah = Math.max(40, H - top - bottom);
  const s = Math.min(aw / (B.x1 - B.x0), ah / (B.y1 - B.y0));
  state.view = {
    s,
    x: left + (aw - s * (B.x1 - B.x0)) / 2 - s * B.x0,
    y: top + (ah - s * (B.y1 - B.y0)) / 2 - s * B.y0,
  };
  drawNet();
}

export function drawNet() {
  if (!nctx || !state.S) return;
  const c = nctx, { W, H, DPR } = state;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  c.fillStyle = theme.bg;
  c.fillRect(0, 0, W, H);
  c.lineJoin = 'round'; c.lineCap = 'round';

  c.beginPath();
  for (const p of state.C.states) {
    c.moveTo(X(p[0] / 10), Y(p[1] / 10));
    for (let i = 2; i < p.length; i += 2) c.lineTo(X(p[i] / 10), Y(p[i + 1] / 10));
    c.closePath();
  }
  c.strokeStyle = theme.border; c.lineWidth = 1; c.stroke();

  const solo = state.soloLine;
  // Longest first, so commuter lines stay visible where they share track.
  const order = state.S.lines.slice().sort((a, b) => b.len - a.len);
  for (const g of order) {
    const dim = solo && solo !== g;
    c.globalAlpha = dim ? 0.03 : theme.netAlpha;
    c.strokeStyle = g.lc || lineCol(g.u);
    c.lineWidth = (solo === g ? 3.5 : 2.0) * ws();
    c.beginPath();
    c.moveTo(X(g.x[0]), Y(g.y[0]));
    for (let i = 1; i < g.n; i++) c.lineTo(X(g.x[i]), Y(g.y[i]));
    c.stroke();
  }
  c.globalAlpha = 1;

  if (state.showLabels) {
    c.font = '600 12px "Bricolage Grotesque", sans-serif';
    c.fillStyle = theme.label;
    c.textBaseline = 'middle';
    for (const [n, [x, y]] of Object.entries(state.C.cities)) {
      if (state.C.small.includes(n) && W < 760) continue;
      c.fillText(n, X(x) + 5, Y(y) - 9);
    }
  }
}

/** The plucked-string wobble: a standing wave pinned at both ends, with the
 *  belly at the point the train crossed. Late trains add a second ripple. */
function linePath(g, now) {
  const v = g.vib, age = (now - v.t) / 1000, L = g.len;
  const N = Math.max(16, Math.min(160, Math.round(L * state.view.s / 4))), pts = [];
  let k = 0;
  for (let q = 0; q <= N; q++) {
    const d = L * q / N;
    while (k < g.n - 2 && g.d[k + 1] < d) k++;
    const f = (d - g.d[k]) / Math.max(1e-6, g.d[k + 1] - g.d[k]);
    const x = g.x[k] + (g.x[k + 1] - g.x[k]) * f, y = g.y[k] + (g.y[k + 1] - g.y[k]) * f;
    const dx = g.x[k + 1] - g.x[k], dy = g.y[k + 1] - g.y[k], ln = Math.hypot(dx, dy) || 1, u = q / N;
    const shape = u < v.pos ? u / Math.max(0.05, v.pos) : (1 - u) / Math.max(0.05, 1 - v.pos);
    let off = v.dead ? 0 : 5 * shape * Math.exp(-age * 2.4) * Math.cos(age * 2 * Math.PI * 9);
    if (v.late >= 2) off += Math.min(3, 0.3 + v.late / 8) * Math.exp(-age * 1.5) * Math.sin(u * N * 1.9 + now / 70);
    pts.push([X(x) - dy / ln * off, Y(y) + dx / ln * off]);
  }
  return pts;
}

let label = null;
export function showLabel(g, x, y) {
  const who = g.name ? `${g.name}, ${g.from} to ${g.to}` : `${g.from} to ${g.to}`;
  const cat = g.name ? '' : `${state.C.groups[g.cat]?.name || ''}, `;
  label = {
    text: `${cat}${who}`,
    sub: `${Math.round(g.len)} km, ${describeTuning(g, state.T)}`,
    x, y, t: performance.now(),
  };
}

/** Add the stretch of a route between distances a and b to a path, following
 *  its bends. */
function span(p2, g, a, b) {
  let lo = 0, hi = g.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.d[m] <= a) lo = m; else hi = m; }
  const p = pointAt(g, a);
  p2.moveTo(X(p[0]), Y(p[1]));
  for (let i = lo + 1; i < g.n && g.d[i] < b; i++) p2.lineTo(X(g.x[i]), Y(g.y[i]));
  const q = pointAt(g, b);
  p2.lineTo(X(q[0]), Y(q[1]));
}

// A train's tail covers where it was over the last few minutes, so motion that
// is too slow to see on a national map still reads as direction and speed.
const TAIL_MIN = 20, TAIL_PX = 60, TAIL_A = [0.1, 0.22, 0.38, 0.6], TAIL_W = [0.45, 0.6, 0.8, 1];

export let trail = [];
export function pushTrail(p) { trail.push(p); }
export function setTrail(t) { trail = t; }

export function draw(now) {
  const { W, H, DPR } = state;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(net, 0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const k = ws();

  // Lines that are sounding
  for (const g of state.S.lines) {
    if (!g.vib || now < g.vib.t || now - g.vib.t > 1500) continue;
    const age = (now - g.vib.t) / 1500, pts = linePath(g, now);
    ctx.globalAlpha = (1 - age) * (g.vib.dead ? 0.45 : 1);
    ctx.strokeStyle = g.vib.dead ? '#8a97a4' : (g.lc || lineCol(g.u));
    ctx.lineWidth = (g.vib.dead ? 1.2 : 2.8) * k;
    if (g.vib.dead) ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;

  // Trains, batched one path per colour, so thousands of dots stay cheap
  const groups = state.C.groups;
  const dots = groups.map(() => new Path2D()), rings = groups.map(() => new Path2D());
  const dead = new Path2D();
  const busy = state.moving.length > 1200, rr = busy ? 0.8 : 1;
  const tails = groups.map(() => TAIL_A.map(() => new Path2D()));
  const maxTail = TAIL_PX * k / state.view.s;
  for (const tr of state.moving) {
    if (tr.canc || tr.dShow < 0) continue;
    const back = actualDist(tr, state.N) - actualDist(tr, state.N - TAIL_MIN);
    const len = Math.min(maxTail, Math.max(0, back));
    if (len * state.view.s < 1.5) continue;
    const ci = Math.min(groups.length - 1, tr.ci), d1 = tr.dShow, n = TAIL_A.length;
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, d1 - len * (n - j) / n), b = Math.max(0, d1 - len * (n - j - 1) / n);
      if (b > a) span(tails[ci][j], tr.path, a, b);
    }
  }
  groups.fo