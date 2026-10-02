// The one mutable object the modules share. Keeping it in a single place keeps
// the imports acyclic: everything reads `state`, nothing reads everything else.

export const state = {
  mode: 'live',    // 'live' (the trains right now) | 'replay' (a recorded day)

  // data
  C: null,         // network record: groups, outlines, labels, notes
  S: null,         // { lines, trains, peak, profile } (+ buckets in replay)
  B: null,         // map bounds { x0, y0, x1, y1 }
  viewKey: 'fi',   // live: the map view ('fi', 'hel', 'sto', ...)
  CK: null,        // replay: the country key ('at', 'ch', ...)
  day: null,       // replay: the day key within that country

  // clock
  N: 0,            // the simulation's time in minutes (live: since the network loaded; replay: = T)
  T: 0,            // minutes since midnight, local time: the chord and the clock
  playing: false,  // live: listening; replay: the clock is running
  muted: false,    // live only: sound off while the trains keep moving
  speed: 3,        // replay: simulated minutes per real second

  // per-frame
  moving: [],
  heard: { crossings: 0, arrivals: 0 },   // notes sounded, for the smoke test

  // view
  view: { s: 1, x: 0, y: 0 },
  W: 0, H: 0, DPR: 1,

  // preferences
  showLabels: true,
  bedOn: true,
  plays: 'both',   // what sounds: 'cross' (lines crossed), 'arrive' (own line at stations), 'both'
  lateFx: 'detune', // how lateness sounds: 'detune', 'distort' or 'both'
  tuning: 'chord', // 'chord' | 'harmonic' (shown as Harmonics)
  soloLine: null,
};

export const $ = id => document.getElementById(id);

/** setTargetAtTime throws on NaN, which is easy to produce from an empty frame. */
export const sval = v => (Number.isFinite(v) ? v : 0);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
