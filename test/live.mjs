// End-to-end smoke test of live mode, against the real feeds. Serves the project,
// drives it in headless Chromium and checks the things that are easy to break:
// the module graph, both feeds, the strings, the views, both tunings, switching
// networks, and that trains actually make sound over a minute of real time.
//
//   node test/live.mjs              # about 100 seconds
//   node test/live.mjs --shots      # also writes screenshots to test/shots/
//
// Requires network access to rata.digitraffic.fi and opendata.samtrafiken.se,
// a timetable for today in data/sto/, and: npx playwright install chromium

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const TYPES = { '.pb': 'application/octet-stream', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ' (' + detail + ')' : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' (' + detail + ')' : ''}`); }
};

function serve() {
  const server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => server.listen(0, () => r({ server, port: server.address().port })));
}

const { server, port } = await serve();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => document.querySelector('#go')?.textContent === 'Start listening', null, { timeout: 60000 });
  ok('live feed loads', true);
  if (SHOTS) { await mkdir(join(ROOT, 'test/shots'), { recursive: true }); await page.screenshot({ path: join(ROOT, 'test/shots/start.png') }); }

  await page.click('#go');
  await page.waitForFunction(() => window.__takt, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const a = await page.evaluate(() => {
    const { state, net } = window.__takt;
    return {
      strings: state.S.lines.length, trains: net.trains.size, moving: state.moving.length,
      ctx: window.__takt.audio.AC.state, version: net.version,
      longest: Math.max(...state.S.lines.map(g => g.len)),
      clock: document.querySelector('#clock').textContent,
      rows: document.querySelectorAll('#slist .grp').length,
    };
  });
  ok('strings built', a.strings > 30, `${a.strings} strings, longest ${Math.round(a.longest)} km`);
  ok('trains loaded', a.trains > 300, `${a.trains} trains`);
  ok('trains moving or night', a.moving > 0 || /^0[1-4]/.test(a.clock), `${a.moving} moving at ${a.clock} Helsinki`);
  ok('audio running', a.ctx === 'running');
  ok('sidebar groups', a.rows >= 2, `${a.rows} groups`);
  if (SHOTS) await page.screenshot({ path: join(ROOT, 'test/shots/finland.png') });

  // A minute of real time: notes should be heard and the feed should update.
  const v0 = a.version;
  await page.waitForTimeout(60000);
  const b = await page.evaluate(() => {
    const { state, net } = window.__takt;
    return { heard: { ...state.heard }, version: net.version, status: document.querySelector('#tcountsub').textContent };
  });
  ok('notes heard in a minute', b.heard.crossings + b.heard.arrivals > 0,
    `${b.heard.crossings} crossings, ${b.heard.arrivals} arrivals`);
  ok('feed polled', b.version >= v0 && !/unreachable/.test(b.status), `${b.status}`);
  const g = await page.evaluate(async () => {
    const { state } = window.__takt;
    const { actualDist } = await import('/src/js/geom.js');
    const on = state.moving.filter(t => t.gps && state.N - t.gps.at < 2);
    const off = on.map(t => Math.abs(t.dShow - actualDist(t, state.N))).sort((a, b) => a - b);
    return { on: on.length, moving: state.moving.length, median: off[off.length >> 1] || 0, worst: off[off.length - 1] || 0 };
  });
  ok('trains on GPS', g.on > 0, `${g.on} of ${g.moving}; GPS differs from timetable by ${g.median.toFixed(2)} km median, ${g.worst.toFixed(1)} km worst`);

  await page.click('#views button[data-v="hel"]');
  await page.waitForTimeout(800);
  const h = await page.evaluate(() => ({ key: window.__takt.state.viewKey, hash: location.hash }));
  ok('Helsinki view', h.key === 'hel' && h.hash === '#hel');
  if (SHOTS) await page.screenshot({ path: join(ROOT, 'test/shots/helsinki.png') });

  await page.click('#togadv');
  await page.click('[data-tuning="harmonic"]');
  await page.click('#togtheme');
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: join(ROOT, 'test/shots/helsinki-dark.png') });
  ok('tuning switch', await page.evaluate(() => window.__takt.state.tuning === 'harmonic'));

  // A hand strum across the middle of the map must sound something.
  await page.click('#advclose');
  await page.click('#views button[data-v="fi"]');
  await page.waitForTimeout(500);
  const box = await page.locator('#c').boundingBox();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.75);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.78, { steps: 12 });
  await page.mouse.up();
  const plucked = await page.evaluate(() => window.__takt.state.S.lines.filter(g => g.vib && performance.now() - g.vib.t < 3000).length);
  ok('hand strum', plucked > 0, `${plucked} strings`);

  // Sweden: every train, from Trafikverket (only when a key is set).
  // Without a key, Sweden opens on the metro instead.
  await page.click('#ctry button[data-c="se"]');
  await page.waitForFunction(() => window.__takt.active.key !== 'fi', null, { timeout: 90000 });
  if (await page.evaluate(() => window.__takt.active.key === 'se')) {
    await page.waitForTimeout(8000);
    const w = await page.evaluate(() => ({
      strings: window.__takt.state.S.lines.length, moving: window.__takt.state.moving.length,
      gps: window.__takt.state.moving.filter(t => t.gps).length, clock: document.querySelector('#clock').textContent,
    }));
    ok('Sweden strings', w.strings > 100, `${w.strings} strings`);
    ok('Sweden trains moving or night', w.moving > 0 || /^0[1-4]/.test(w.clock), `${w.moving} moving at ${w.clock}, ${w.gps} on GPS`);
  }

  // Stockholm: the metro, from GTFS Sweden 3 Realtime and the bundled timetable.
  await page.evaluate(() => window.__takt.goView('sto'));
  await page.waitForFunction(() => window.__takt.active.key === 'sto', null, { timeout: 30000 });
  await page.waitForTimeout(20000);
  const s = await page.evaluate(() => {
    const { state } = window.__takt;
    return {
      strings: state.S.lines.length, moving: state.moving.length,
      live: state.moving.filter(t => t.known).length, gps: state.moving.filter(t => t.gps).length,
      clock: document.querySelector('#clock').textContent, hash: location.hash,
      views: document.querySelector('#views').hidden,
    };
  });
  ok('Stockholm metro strings', s.strings >= 7, `${s.strings} lines`);
  ok('Stockholm trains moving or night', s.moving > 0 || /^0[1-4]/.test(s.clock), `${s.moving} moving at ${s.clock} Stockholm`);
  ok('Stockholm live times', s.live > 0 || !s.moving, `${s.live} with actual times`);
  ok('Stockholm on GPS', s.gps > 0 || !s.moving, `${s.gps} on GPS`);
  ok('Stockholm view', s.hash === '#sto' && s.views === false);
  if (SHOTS) await page.screenshot({ path: join(ROOT, 'test/shots/stockholm.png') });

  // Helsinki metro and trams (HSL's HFP stream) and Norway (Entur).
  for (const [view, name, min] of [['hsl', 'Helsinki metro & tram', 10], ['no', 'Norway', 40]]) {
    await page.evaluate(v => window.__takt.goView(v), view);
    await page.waitForFunction(v => window.__takt.state.viewKey === v, view, { timeout: 90000 });
    await page.waitForTimeout(20000);
    const r = await page.evaluate(() => {
      const { state } = window.__takt;
      return { strings: state.S.lines.length, moving: state.moving.length, gps: state.moving.filter(t => t.gps).length,
        clock: document.querySelector('#clock').textContent };
    });
    ok(`${name} strings`, r.strings >= min, `${r.strings} strings`);
    ok(`${name} moving or night`, r.moving > 0 || /^0[1-4]/.test(r.clock), `${r.moving} moving at ${r.clock}, ${r.gps} on GPS`);
  }

  await page.click('#ctry button[data-c="fi"]');
  await page.waitForFunction(() => window.__takt.active.key === 'fi', null, { timeout: 30000 });
  ok('back to Finland', await page.evaluate(() => window.__takt.state.S.lines.length > 30));

  // The mode switch: over to a recorded day and back, without reloading.
  await page.click('#modes [data-m="replay"]');
  await page.waitForFunction(() => window.__takt.mode === 'replay' && window.__takt.state.CK, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    key: window.__takt.state.CK, lines: window.__takt.state.S.lines.length, hash: location.hash,
    moving: window.__takt.state.moving.length, pause: !document.querySelector('#pause').offsetParent,
  }));
  ok('Live → Replay', r.lines > 100 && r.hash.startsWith('#' + r.key) && !r.pause, `${r.key}, ${r.lines} strings, ${r.moving} moving`);
  await page.click('#modes [data-m="live"]');
  await page.waitForFunction(() => window.__takt.mode === 'live', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  ok('Replay → Live', await page.evaluate(() =>
    window.__takt.active.key === 'fi' && window.__takt.state.S.lines.length > 30 && !window.__takt.state.muted));

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
