// End-to-end smoke test of replay mode. Needs no network: it serves the
// project, drives it in headless Chromium and checks the things that are easy
// to break: the module graph, the start screen, the Mexico City line table,
// the tuning switch, and silence at 4 a.m. Live mode has test/live.mjs.
//
//   node test/replay.mjs            # all recorded networks
//   node test/replay.mjs mx         # one network
//
// Requires: npx playwright install chromium

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.bin': 'application/octet-stream',
};

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ': ' + detail : ''}`); }
};

function serve() {
  const server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, p === '/' ? 'index.html' : p);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise(r => server.listen(0, () => r({ server, port: server.address().port })));
}

async function boot(page, base, hash = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/' + hash, { waitUntil: 'load' });
  await page.waitForSelector('#go:not([disabled])', { timeout: 20000 });
  return errors;
}

async function run() {
  const only = process.argv[2];
  const { server, port } = await serve();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  try {
    // ---- start screen ------------------------------------------------------
    console.log('\nstart screen');
    {
      const page = await browser.newPage();
      const errors = await boot(page, base, '#at');
      ok('a replay address opens in replay mode', await page.evaluate(() =>
        document.body.dataset.mode === 'replay'
        && document.querySelector('#startmodes [data-m="replay"]').getAttribute('aria-pressed') === 'true'));
      await page.click('#credlink');
      await page.waitForSelector('#credits:not([hidden])', { timeout: 3000 });
      const txt = await page.textContent('#credtext');
      ok('data sources open before start', txt.includes('Austria') && txt.includes('Mexico City'));
      ok('credits mention every network', ['Austria', 'Switzerland', 'Germany', 'Mexico City']
        .every(n => txt.includes(n)));
      await page.click('#credclose');
      ok('credits close', await page.isHidden('#credits'));
      ok('no console errors on load', errors.length === 0, errors[0]);
      await page.close();
    }

    // ---- the instrument ----------------------------------------------------
    const manifest = JSON.parse(await readFile(join(ROOT, 'data/replay/index.json'), 'utf8'));
    const keys = only ? [only] : manifest.order;

    for (const key of keys) {
      console.log(`\n${manifest.names[key]} (${key})`);
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      const errors = await boot(page, base, '#' + key);
      await page.click('#go');
      await page.waitForFunction('window.__takt !== undefined', null, { timeout: 60000 });
      await page.waitForTimeout(1200);

      const info = await page.evaluate(() => {
        const s = window.__takt.state;
        return {
          country: s.CK,
          lines: s.S.lines.length,
          trains: s.S.trains.length,
          groups: s.C.groups.length,
          byLine: s.C.byLine,
          hasDelays: s.C.hasDelays,
          named: s.S.lines.map(g => ({ name: g.name, from: g.from, to: g.to, len: Math.round(g.len) })),
          badGeom: s.S.lines.some(g => !isFinite(g.len) || g.len <= 0),
          selfPluck: s.S.trains.some(t => t.g.rep === undefined),
        };
      });

      ok('in replay mode', await page.evaluate(() => window.__takt.mode === 'replay'));
      ok('loaded the requested network', info.country === key, info.country);
      ok('has lines and trains', info.lines > 0 && info.trains > 0);
      ok('every line has a real length', !info.badGeom);
      ok('every train resolves to a string', !info.selfPluck);
      ok('legend groups built', info.groups > 0);

      if (key === 'mx') {
        ok('twelve strings, not twenty-four', info.lines === 12, String(info.lines));
        const want = [
          ['Línea 1', 'Observatorio', 'Pantitlán'], ['Línea 2', 'Cuatro Caminos', 'Tasqueña'],
          ['Línea 3', 'Indios Verdes', 'Universidad'], ['Línea 4', 'Martín Carrera', 'Santa Anita'],
          ['Línea 5', 'Politécnico', 'Pantitlán'], ['Línea 6', 'El Rosario', 'Martín Carrera'],
          ['Línea 7', 'El Rosario', 'Barranca del Muerto'], ['Línea 8', 'Garibaldi', 'Constitución de 1917'],
          ['Línea 9', 'Tacubaya', 'Pantitlán'], ['Línea 12', 'Mixcoac', 'Tláhuac'],
          ['Línea A', 'Pantitlán', 'La Paz'], ['Línea B', 'Buenavista', 'Ciudad Azteca'],
        ];
        const byName = new Map(info.named.map(l => [l.name, l]));
        for (const [n, from, to] of want) {
          const got = byName.get(n);
          ok(`${n}: ${from} ↔ ${to}`, got && got.from === from && got.to === to,
            got ? `${got.from} ↔ ${got.to}` : 'missing');
        }
        const l12 = byName.get('Línea 12');
        ok('Línea 12 clipped to one direction', l12 && l12.len > 18 && l12.len < 30, l12 && String(l12.len));
        ok('dots coloured by line', info.byLine === true);
        ok('no punctuality data, so no late/cancelled key', info.hasDelays === false);
      } else {
        ok('punctuality data present', info.hasDelays === true);
        ok('dots coloured by category', info.byLine === false);
      }

      if (key === 'nl') {
        // The Dutch pack is routed along real OSM track by tools/build_nl.py.
        // Straight chords between stations would show up as long single
        // segments and as route lengths well under the real distance.
        const geo = await page.evaluate(() => {
          const s = window.__takt.state;
          let worstGap = 0, minPts = 1e9;
          for (const g of s.S.lines) {
            minPts = Math.min(minPts, g.n);
            for (let i = 1; i < g.n; i++) {
              worstGap = Math.max(worstGap, Math.hypot(g.x[i] - g.x[i - 1], g.y[i] - g.y[i - 1]));
            }
          }
          const byName = n => s.S.lines.find(g => (g.from + '|' + g.to).includes(n));
          return {
            worstGap, minPts,
            medianPts: s.S.lines.map(g => g.n).sort((a, b) => a - b)[s.S.lines.length >> 1],
            longest: Math.round(Math.max(...s.S.lines.map(g => g.len))),
          };
        });
        ok('routes follow track, not chords', geo.medianPts > 12, `median ${geo.medianPts} points`);
        ok('no route has an impossible straight leg', geo.worstGap < 40,
          `${geo.worstGap.toFixed(1)} km`);
        ok('longest route is a plausible Dutch run', geo.longest > 200 && geo.longest < 500,
          `${geo.longest} km`);
        ok('night services fill the small hours', await page.evaluate(async () => {
          const s = window.__takt.state;
          s.T = 30;                             // 00:30
          for (const t of s.S.trains) t.head = null;
          await new Promise(r => setTimeout(r, 700));
          return s.moving.length > 50;
        }));
      }

      // ---- silence when nothing is running --------------------------------
      const quiet = await page.evaluate(async () => {
        const s = window.__takt.state;
        s.T = 240;                                  // 04:00
        for (const t of s.S.trains) t.head = null;
        await new Promise(r => setTimeout(r, 900));
        return { moving: s.moving.length, T: Math.round(s.T) };
      });
      if (key === 'mx') {
        ok('nothing moves at 04:00 (no service in the feed)', quiet.moving === 0, String(quiet.moving));
      } else {
        ok('night trains really are running at 04:00', quiet.moving > 0, String(quiet.moving));
      }

      // ---- tuning switch ---------------------------------------------------
      await page.click('#togadv');
      await page.click('[data-tuning="harmonic"]');
      const harm = await page.evaluate(() => window.__takt.state.tuning);
      ok('harmonic tuning engages', harm === 'harmonic');

      const tune = await page.evaluate(async () => {
        const { freqForLine } = await import('/src/js/audio/tuning.js');
        const s = window.__takt.state;
        const by = s.S.lines.slice().sort((a, b) => a.len - b.len);
        const shortest = by[0], longest = by[by.length - 1];
        const mid = by[by.length >> 1];
        return {
          shortF: freqForLine(shortest, s.T), longF: freqForLine(longest, s.T),
          shortL: shortest.len, longL: longest.len,
          // Every line must equal fundamental x partial, clamped to the range
          // the sampler can actually render.
          formulaErr: await (async () => {
            const { mtof } = await import('/src/js/audio/tuning.js');
            const { RENDER_LO, RENDER_HI } = await import('/src/js/config.js');
            const fmin = mtof(RENDER_LO), fmax = mtof(RENDER_HI);
            let worst = 0;
            for (const g of by) {
              const want = Math.min(fmax, Math.max(fmin, fmin * g.ratio));
              const got = freqForLine(g, s.T);
              worst = Math.max(worst, Math.abs(want - got) / want);
            }
            return worst;
          })(),
          // And among the lines that are not pinned at either end, doubling the
          // length must halve the frequency.
          ratioErr: await (async () => {
            const { mtof } = await import('/src/js/audio/tuning.js');
            const { RENDER_LO, RENDER_HI } = await import('/src/js/config.js');
            const fmin = mtof(RENDER_LO), fmax = mtof(RENDER_HI);
            const free = by.filter(g => {
              const f = fmin * g.ratio;
              return g.len > 5.5 && f > fmin * 1.05 && f < fmax * 0.95;
            });
            if (free.length < 2) return 0;
            const a = free[0], b = free[free.length - 1];
            const want = b.len / a.len;                 // b is longer, so lower
            const got = freqForLine(a, s.T) / freqForLine(b, s.T);
            return Math.abs(want - got) / want;
          })(),
          distinct: new Set(by.map(g => Math.round(freqForLine(g, s.T)))).size,
          total: by.length,
        };
      });
      ok('harmonic: longer route is lower', tune.longF < tune.shortF,
        `${Math.round(tune.longL)}km→${Math.round(tune.longF)}Hz vs ${Math.round(tune.shortL)}km→${Math.round(tune.shortF)}Hz`);
      ok('harmonic: every string is the fundamental times its partial',
        tune.formulaErr < 1e-6, tune.formulaErr.toExponential(2));
      ok('harmonic: frequency tracks 1/length where unclamped',
        tune.ratioErr < 0.02, tune.ratioErr.toFixed(4));
      ok('harmonic: pitches are distinct, not collapsed',
        tune.distinct > Math.min(20, tune.total * 0.5), `${tune.distinct}/${tune.total}`);

      await page.click('[data-tuning="chord"]');
      ok('chord tuning returns', (await page.evaluate(() => window.__takt.state.tuning)) === 'chord');
      const inChord = await page.evaluate(async () => {
        const { chordMidi, chordAt } = await import('/src/js/audio/tuning.js');
        const s = window.__takt.state, pcs = chordAt(s.T).pcs;
        return s.S.lines.every(g => pcs.includes(chordMidi(g, s.T) % 12));
      });
      ok('chord: every string lands on a chord tone', inChord);
      await page.click('#advclose');

      // ---- strings panel ---------------------------------------------------
      ok('strings panel starts closed', await page.evaluate(() =>
        document.getElementById('side').classList.contains('closed')));
      await page.click('#togside');
      await page.waitForTimeout(350);
      const panel = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('#slist details.grp')];
        return {
          groups: groups.length,
          anyOpen: groups.some(d => d.open),
          rowsBefore: document.querySelectorAll('#slist .sl').length,
          count: document.getElementById('scount').textContent,
        };
      });
      if (panel.groups > 0) {
        ok('operator groups start collapsed', !panel.anyOpen);
        ok('collapsed groups build no rows', panel.rowsBefore === 0, String(panel.rowsBefore));
        await page.evaluate(() => { document.querySelector('#slist details.grp').open = true; });
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => document.querySelectorAll('#slist .sl').length);
        ok('opening a group builds its rows', after > 0, String(after));
      } else {
        ok('single operator lists directly', panel.rowsBefore === info.lines, String(panel.rowsBefore));
      }
      ok('string count shown', /\d+ strings/.test(panel.count), panel.count);

      // ---- search ----------------------------------------------------------
      const first = info.named[0];
      await page.fill('#ssearch', (first.name || first.from).slice(0, 6));
      await page.waitForTimeout(250);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('#slist .sl')].filter(e => e.style.display !== 'none').length);
      ok('search finds something', found > 0, String(found));
      await page.fill('#ssearch', '');

      // ---- theme -----------------------------------------------------------
      const before = await page.getAttribute('html', 'data-theme');
      await page.click('#togtheme');
      const after = await page.getAttribute('html', 'data-theme');
      ok('theme switch flips light/dark', before !== after, `${before} → ${after}`);
      await page.click('#togtheme');

      // ---- playing by hand -------------------------------------------------
      const box = await page.locator('#c').boundingBox();
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(box.x + box.width * (0.35 + i * 0.025), box.y + box.height * (0.45 + i * 0.012));
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      ok('dragging plucks strings', await page.evaluate(() =>
        window.__takt.state.S.lines.some(g => g.vib)));

      // ---- a hand strum must not clip -------------------------------------
      // A single drag can cross a dozen lines at once. Sounding them together
      // used to sum straight past the ceiling and distort.
      await page.evaluate(() => {
        const { AC, out } = window.__takt.audio;
        const an = AC.createAnalyser(); an.fftSize = 2048; out.connect(an);
        const buf = new Float32Array(an.fftSize);
        window.__peak = 0; window.__hot = 0;
        window.__meter = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          for (const v of buf) {
            const a = Math.abs(v);
            if (a > window.__peak) window.__peak = a;
            if (a > 0.995) window.__hot++;
          }
        }, 16);
      });
      for (let pass = 0; pass < 3; pass++) {
        await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * (0.3 + pass * 0.03));
        await page.mouse.down();
        for (let i = 1; i <= 36; i++) {
          await page.mouse.move(
            box.x + box.width * (0.15 + i * 0.02),
            box.y + box.height * (0.3 + pass * 0.03) + Math.sin(i / 3) * 40);
          await page.waitForTimeout(12);
        }
        await page.mouse.up();
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(700);
      const meter = await page.evaluate(() => {
        clearInterval(window.__meter);
        return { peak: window.__peak, hot: window.__hot };
      });
      ok('a dense strum stays below clipping', meter.peak < 0.99 && meter.hot === 0,
        `peak ${meter.peak.toFixed(3)}, ${meter.hot} samples at the ceiling`);

      // ---- day switch ------------------------------------------------------
      const days = await page.evaluate(() => Object.keys(window.__takt.state.C.days));
      if (days.length > 1) {
        await page.click(`.dayb[data-day="${days[1]}"]`);
        await page.waitForTimeout(600);
        ok('switching day reloads the scene', await page.evaluate(k =>
          window.__takt.state.day === k, days[1]));
      }

      await page.waitForTimeout(400);
      ok('no console errors while running', errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
    }

    // ---- deep links --------------------------------------------------------
    // applyCountry rewrites the hash to the day it selects, so "-bad" has to be
    // read before the first render or the link silently opens the ordinary day.
    {
      console.log('\ndeep links');
      const key = only && manifest.order.includes(only) ? only : 'at';
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await boot(page, base, `#${key}-bad`);
      await page.click('#go');
      await page.waitForFunction('window.__takt !== undefined', null, { timeout: 60000 });
      await page.waitForTimeout(500);
      const got = await page.evaluate(() => {
        const s = window.__takt.state;
        return { day: s.day, days: Object.keys(s.C.days), hash: location.hash };
      });
      if (got.days.length > 1) {
        ok(`#${key}-bad opens the disrupted day`, got.day === got.days[1],
          `${got.day} (wanted ${got.days[1]})`);
        ok('and the hash still says so', got.hash === `#${key}-bad`, got.hash);
      } else {
        ok(`#${key} has a single day`, got.day === got.days[0]);
      }
      await page.close();
    }

    // ---- switching networks in place ---------------------------------------
    if (!only) {
      console.log('\nswitching networks');
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      const errors = await boot(page, base, '#at');
      await page.click('#go');
      await page.waitForFunction('window.__takt !== undefined', null, { timeout: 60000 });
      await page.waitForTimeout(800);
      await page.click('#ctry button[data-c="mx"]');
      await page.waitForFunction("window.__takt.state.CK === 'mx'", null, { timeout: 60000 });
      await page.waitForTimeout(800);
      ok('Austria → Mexico City', await page.evaluate(() => window.__takt.state.S.lines.length === 12));
      await page.click('#ctry button[data-c="at"]');
      await page.waitForFunction("window.__takt.state.CK === 'at'", null, { timeout: 60000 });
      await page.waitForTimeout(800);
      ok('and back again', await page.evaluate(() => window.__takt.state.S.lines.length > 100));
      ok('no console errors while switching', errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
