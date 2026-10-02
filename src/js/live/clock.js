// Local time for the network being played. The instrument runs on the clock
// where the trains are, wherever the listener is, so the chord changes when
// the hour changes on the platform.

let zone = 'Europe/Helsinki';
let fmt = make(zone);
let cached = { at: -1e15, off: 0 };

function make(z) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: z, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function setZone(z) {
  if (z === zone) return;
  zone = z; fmt = make(z); cached = { at: -1e15, off: 0 };
}

function parts(ms) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = value;
  return p;
}

/** Minutes the zone is ahead of UTC at instant `ms`. */
export function offsetMin(ms) {
  const p = parts(ms);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The local calendar date at `ms`, as YYYY-MM-DD. */
export function dateAt(ms) {
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

export function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Epoch milliseconds of local midnight starting `date`. */
export function midnight(date) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - offsetMin(guess) * 60000;
}

/** Minutes since local midnight, with seconds as a fraction. */
export function minuteOfDay(ms = Date.now()) {
  if (Math.abs(ms - cached.at) > 30000) cached = { at: ms, off: offsetMin(ms) };
  const m = ms / 60000 + cached.off;
  return ((m % 1440) + 1440) % 1440;
}
