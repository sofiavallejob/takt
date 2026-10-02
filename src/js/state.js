// The one mutable object the modules share. Keeping it in a single place keeps
// the imports acyclic: everything reads `state`, nothing reads everything else.

export const state = {
  // data
  C: null,         // network record: groups, outlines, labels, notes
  S: null,         // { lines, trains, peak, profile }
  B: null,         // map bounds { x0, y0, x1, y1 }
  viewKey: 'fi',   // 'fi' | 'hel'

  // clock
  N: 0,            // minutes since the page started: the simulation's time
  T: 0,            // minutes since midnight in Helsinki: the chord and the clock
  playing: false,  // listening (the map runs either way)

  // per-frame
  moving: [],
  heard: { crossings: 0, arrivals: 0 },   // notes sounded, for the smoke test

  // view
  view: { s: 1, x: 0, y: 0 },
  W: 0, H: 0, DPR: 1,

  // preferences
  showLabels: true,
  bedOn: true,
  arrivals: true,  // trains pluck their own line when they reach a station
  tuning: 'chord', // 'chord' | 'harmonic'
  soloLine: null,
};

export const $ = id => document.getElementById(id);

/** setTargetAtTime throws on NaN, which is easy to produce from an empty frame. */
export const sval = v => (Number.isFinite(v) ? v : 0);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
