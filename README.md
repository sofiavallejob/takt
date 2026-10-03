# Takt

**Rail networks as strings.**

Every route in a rail network is a string, tuned by its length. Trains are the
players: when a train crosses another line, that line's string sounds. Longer
routes play lower. The harmony moves every hour. On-time trains land on the
beat and in tune; late trains drag behind and drift out of tune; cancelled
trains leave only a click.

Takt has two modes, switched with **Live / Static** at the top of the page:

| Mode | Networks | What you hear |
| --- | --- | --- |
| **Live** | **Finland**, **Norway**, **Sweden**; the **Helsinki**, **Oslo** and **Stockholm** metros and trams; **Vienna**'s U-Bahn and trams (to the timetable); in the **United States**, the **Boston** and **New York** subways, **Los Angeles** Metro Rail and buses, and **San Francisco**'s BART, Muni Metro, streetcar and cable cars | The trains where they are right now, from the operators' open live feeds. No recording and no replay: at four in the morning it goes almost silent because the network does. |
| **Static** | **Austria**, **Germany**, the **Mexico City metro**, the **Netherlands**, **Switzerland** | A recorded day with a real timetable behind it, and real punctuality behind all but Mexico City. The clock can be paused, sped up and scrubbed; some countries have a second, disrupted day. |

**▶ [sofiavallejob.github.io/takt](https://sofiavallejob.github.io/takt/)**
· [Stockholm](https://sofiavallejob.github.io/takt/#sto)
· [Boston](https://sofiavallejob.github.io/takt/#bos)
· [Los Angeles](https://sofiavallejob.github.io/takt/#la)
· [New York](https://sofiavallejob.github.io/takt/#nyc)
· [San Francisco](https://sofiavallejob.github.io/takt/#sf)
· [Helsinki](https://sofiavallejob.github.io/takt/#hel)
· [Switzerland, static](https://sofiavallejob.github.io/takt/#ch)
· [Germany, a bad day](https://sofiavallejob.github.io/takt/#de-bad)

The address picks the mode: `#sto`, `#hel`, `#no`, `#bos`, `#la`, `#nyc`, `#sf`, `#bay` … are live; `#at`, `#ch`,
`#de`, `#nl`, `#mx` are static, and `-bad` opens a country's disrupted day. No
address is live Finland. Switching mode in the page keeps the sound running and
remembers where each mode was.

---

## What we are working on

**Live**

* Robustness when a server or feed goes down: keep playing what is known,
  say clearly what is missing, and pick up again on its own when the feed
  comes back.
* New networks: Buenos Aires, Chicago, London, the Netherlands, Paris, Seoul,
  Switzerland and Sydney.
* Vienna live: Wiener Linien's live times cannot be read by a web page (no
  CORS), so Vienna plays its timetable for now; a small relay (a free
  Cloudflare Worker, say) would make it live.
* MIDI out from the browser (Web MIDI): one click, no bridge, straight into
  Ableton, Pure Data or SuperCollider through a virtual MIDI port.
* Oslo's buses: Ruter shares no bus positions, and a day of bus journeys from
  Entur is about a gigabyte.
* Boston's commuter rail, the LIRR and Metro-North, which run to timetables and
  so can be late.
* New York's buses: the MTA's bus feed needs a key and cannot be read by a web
  page directly, so it would need a small proxy.

**Static**

* New recorded networks: Amtrak, Belgium, Japan, New York City and the
  United Kingdom.

---

## How it sounds

### Who plays whom

The note belongs to the line being **crossed**, not to the line the train is
running on. A train on the orange route that passes over the green route sounds
the **green** string, at the pitch the green route's length gives it. One train
travelling across a dense junction area therefore plays a chord of everything
it cuts through, which is why the network arpeggiates itself at rush hour.

Two routes running alongside each other do not count as a crossing: the angle
has to be steep enough (`sin θ > 0.55`) or parallel track would sound
continuously.

Live adds two more ways to sound, because at the speed of real life crossings
are rare and Finnish lines meet at stations far more often than they cross in
open country:

| Where | What sounds |
| --- | --- |
| A station on the train's route that another line also passes through | Lines that meet the route there without sharing track with it: full note. Lines the train is parting from (they shared track up to here): softer. At most three per station, strummed. |
| Open country | Any line the train's path cuts across at a steep angle, as in static. |
| A passenger stop | The train's own line, softly, at that point on the string. Switch off in Advanced → Plays when a train. |

In practice Pasila, Kerava, Riihimäki and Tampere are the loudest places on the
live instrument, because that is where the lines part.

### Tuning (Advanced → Tuning)

| Mode | What it does |
| --- | --- |
| **Chord** | Each string is pulled to the nearest note of the hour's chord (D, Bm, G, A). Musical, and the whole network stays in one harmony. |
| **Harmonics** | Frequency is inversely proportional to length, the way a real string behaves. The longest route in the network is the fundamental; everything else is one of its partials. More honest, and towards the top it stops being a melody and turns into a microtonal cluster. |

Harmonics tuning plays frequencies that are not on the twelve-tone grid at all.
The sampler handles that by picking the nearest rendered semitone and taking the
remainder in cents on the source's `detune`.

### Late trains (Advanced → Late trains)

Late trains can go out of tune (**Detune**), be driven into distortion
(**Distort**), or both. Either way they drag behind the beat.

### The bed

Underneath the plucks sits one held chord carrying the state of the whole
network: louder and brighter with more trains moving (relative to the day's
busiest moment), wavering when many are late, losing voices from the top as
cancellations mount, and leaning in stereo towards wherever the traffic is. It
goes properly silent when nothing is running. Toggle it with the tuning-fork
button.

---

## OSC out: play the trains with your own instruments

Every note Takt plays can also be sent out as **OSC** (Open Sound Control), so
you can play the trains with **Pure Data**, **SuperCollider**, Max, TouchDesigner
or anything else that listens for OSC, in Live or Static.

### Why there is a "bridge"

A web page is not allowed to send OSC straight to other programs: browsers
forbid it, for every website, for safety. A page *can* talk to your own
computer over a WebSocket, so Takt does that, and a tiny program, the
**bridge**, passes every message on as ordinary OSC:

```
Takt in the browser ──▶ port 8080 ──▶ [ bridge ] ──▶ port 9000 ──▶ Pure Data / SuperCollider / …
                       (you type this     (runs in       (your patch
                        in Takt)           Terminal)       listens here)
```

There are **two port numbers**, and they belong to different things:

| Port | Who listens on it | Where you set it |
| --- | --- | --- |
| **8080** (the bridge port) | the bridge, waiting for Takt | in Takt: **Advanced → Output** · and in the bridge command: `--port 8080` |
| **9000** (the patch port) | your patch or program | in the Pd patch's **OSC port** box (or SuperCollider: `57120`) · and in the bridge command: `--to 9000` |

Any free numbers work, as long as each pair matches.

### What you need (once)

1. **Chrome or Firefox** on a computer. Safari may refuse to connect the
   published site to your own computer; phones cannot run the bridge.
2. **Node.js**, which runs the bridge. Download the **LTS** version from
   [nodejs.org](https://nodejs.org) and install it like any app. To check: open
   **Terminal** (Mac: Spotlight → "Terminal"; Windows: "Command Prompt") and type
   `node -v`; it should answer with a version like `v22.11.0`.
3. **The Takt folder** on your computer, because the bridge and the patches are
   in it. On GitHub: **Code → Download ZIP**, then unzip it (say, onto your Desktop).
4. **The program you want to play with**:
   * **Pure Data** (vanilla, 0.54 or newer): [puredata.info/downloads](https://puredata.info/downloads/pure-data).
     Nothing else to install: the patch uses only what comes with Pd.
   * or **SuperCollider**: [supercollider.github.io](https://supercollider.github.io/downloads).

### Every time: three steps

**1 · Start the bridge.** Open Terminal and type (with your folder's location):

```sh
cd ~/Desktop/takt                      # the Takt folder
node tools/osc-bridge.mjs              # bridge port 8080, patch port 9000
```

It answers `Takt OSC bridge: ws://localhost:8080  ->  udp 127.0.0.1:9000`.
**Leave this window open**: closing it stops the bridge. Other ports:
`node tools/osc-bridge.mjs --port 8020 --to 8021`. To SuperCollider: `--to 57120`.
To two programs at once: `--to 9000 --to 57120`.

**2 · Open your patch.**
* **Pure Data:** open `pd/takt.pd`. The **OSC port** box at the top says `9000`;
  change it if your bridge sends elsewhere. Pd's audio switches on by itself.
* **SuperCollider:** open `sc/takt.scd`, select everything, press **Cmd+Enter**
  (Ctrl+Enter on Windows). It says *Takt: listening for the trains on port 57120*.

**3 · Connect Takt.** Press **Start listening**, open **Advanced → Output**,
make sure the port is the bridge port (`8080`), and click **Connect**. The light
turns **green**: *Sending to ws://localhost:8080*. Optional: **Browser sound → Off**,
so you only hear your patch. Takt remembers all of this, and connects again by
itself next time.

**It works when:** the Terminal says `Takt connected` and then counts messages
(`611 messages passed on`); in Pd the **notes** light flashes and **trains**
counts the network once a second; SuperCollider prints `… trains moving in …`.

### The Pure Data patch

`pd/takt.pd` is a control panel; everything that makes sound is inside it.

* **Synth** menu, six sounds (each a small patch in `pd/voices/`):
  **Pluck** (a plucked string) · **Ambient pad** (two detuned saws and a sub,
  slow to rise and fall) · **Bell** (FM, bright strike that mellows) ·
  **Glass** (pure sines, long) · **Mallet** (marimba-like) · **Breath** (noise
  tuned through a narrow filter, airy).
* **Preset** menu, ready-made combinations of synth and effects: **Clean pluck**,
  **Ambient**, **Echo chamber**, **Bells in a hall**, **Dry percussion**,
  **Night breath**.
* **Sliders**: Volume · Attack and Release (stretch or shorten each synth's
  envelope; 1 = as designed) · Brightness (a low-pass on every voice) · Late
  detune (cents out of tune per minute a train is late) · Delay time, feedback
  and mix · Reverb mix, size and damping (Pd's own `rev3~`).
* **Readouts**: a light for every note, the network's name, trains moving, the
  share running late, and the output level.

**Your own sound:** copy any file in `pd/voices/`, change what is between the
inlet and the two `outlet~`s (it receives `freq midi pan amp late pos`), and
put its name in the engine's `clone` line. `tools/build_pd.py` rebuilds the
whole patch from one description, if you prefer to edit it as code.

### Other software

* **TouchDesigner, Max (`node.script`), Open Stage Control**, and anything that
  reads OSC over a WebSocket: no bridge needed; listen as a WebSocket server on
  the port you type into Takt.
* **Ableton Live** does not receive OSC by itself; it needs Max for Live (and the
  bridge). Sending MIDI from the browser instead (no bridge, one click) is on the
  roadmap.

### Messages

| Address | When | Arguments |
| --- | --- | --- |
| `/takt/pluck` | a string sounds | `f` frequency (Hz) · `f` MIDI note (with cents as a fraction) · `f` pan (−1 left … 1 right) · `f` loudness (0–1) · `f` minutes late · `f` where on the string it was plucked (0–1) · `s` kind: `cross`, `junction`, `arrive` or `hand` · `s` line name |
| `/takt/click` | a cancelled train | `f` pan · `s` line name |
| `/takt/hour` | the chord changes on the hour | `f` root (MIDI) · `s` chord name |
| `/takt/state` | about once a second | `f` trains moving · `f` share running late · `f` share cancelled · `f` where the traffic leans (−1 … 1) · `f` clock (minutes since midnight) · `s` network · `s` mode (`live` or `static`) |

Messages go out at the moment each note sounds, on the same beat as the browser
(late trains drag behind it). Expect a few milliseconds of jitter: fine for
playing, not sample-accurate.

### If it does not work

| What you see | What to do |
| --- | --- |
| Terminal: `node: command not found` | Node.js is not installed (see *What you need*), or Terminal was open before you installed it: close and reopen it. |
| Terminal: `Cannot find module …osc-bridge.mjs` | Terminal is not in the Takt folder. `cd` to the folder that contains `tools/`. |
| Terminal: `Port 8080 is already in use` | Something else uses it. Pick another, e.g. `--port 8030`, and type `8030` in Takt. |
| Takt's light stays **yellow** ("Nothing listening yet") | The bridge is not running, or Takt's port is not the bridge's `--port`. |
| Light is yellow in **Safari** although the bridge runs | Safari blocks it. Use Chrome or Firefox, or run Takt locally (`npm start`, then `http://localhost:8000`). |
| Terminal counts messages, but **Pd is silent** | Pd's **OSC port** box must be the bridge's `--to` number; Pd's **DSP** must be on; check **Media → Audio Settings** for the right output. |
| SuperCollider prints nothing | Use `--to 57120` in the bridge, and run the whole file (select all, Cmd+Enter). |
| It worked, then stopped | The Terminal window was closed, or the computer slept. Start the bridge again; Takt reconnects by itself. |

## Live: the data, and what is made of it

Fintraffic's [digitraffic.fi](https://www.digitraffic.fi/en/railway-traffic/)
is the best open real-time rail feed in Europe for this: no API key, CORS open
so a static page can read it directly, and every timetable point of every train
carries a scheduled time, an actual time once the train has passed, and a live
estimate until then.

* **Trains.** On load the page reads every passenger train for today (and
  yesterday before 06:00, tomorrow after 22:00) from the GraphQL endpoint,
  about 0.5 MB compressed. Every 15 seconds it asks only for trains that
  changed since the last answer (`trainsByVersionGreaterThan`).
* **Position.** Every 10 seconds the page reads each train's latest GPS fix,
  snaps it onto the train's route, and carries it forward at the reported speed
  for at most 4 km. Trains without a fresh fix (older than two minutes, or more
  than 2 km off their route) are placed from the timetable instead. The drawn
  position eases towards whichever applies and never runs backwards, so a
  revised estimate does not make a train jump.
* **Notes follow the dot.** Arrivals and junctions sound when the drawn train
  reaches the station, not when the timetable says it should.
* **Routes.** Every train's route is drawn through every timetable point it
  passes. Commuter lines are one string per letter (I and P, the Ring Rail, are
  one string); other trains are one string per pair of end stations. Live
  updates never reshape a string under the listener.
* **Late** means 3 minutes for commuter trains and 5 for everything else, the
  limits Finland itself reports punctuality against. A late train shows a ring
  where the timetable says it should be.
* **Cancelled** trains move on their timetable as dashed rings and click.
* **It keeps playing in a background tab.** Polling stops only while static is
  playing, or while the tab is hidden *and* muted: then nobody is listening, and
  the feeds have quotas. (Safari on iPhone silences every page in the
  background, whatever the page does.)

The clock and the hourly chord follow local time where the trains are, so
Vienna, Stockholm and Oslo run an hour behind Finland, Boston and New York seven hours
behind it, and Los Angeles and San Francisco ten.

### Boston

`live/bos.js` reads the MBTA V3 API with a key (in the file; 1000 requests a
minute, shared by everyone listening). The subway runs to headways, and most
trips in the live feed are added on the day, so they match no published
timetable. Nothing is downloaded ahead: on load the page reads each line's
stopping patterns, then every ten seconds where every vehicle is. A train is
its vehicle's pattern, timed from where the vehicle is at the line's typical
speed, with its GPS fix on top. One string per branch (the Red Line is
Alewife–Ashmont and Alewife–Braintree); short turns sound on their line's main
string. Nothing is ever late, so the key leaves the late and cancelled marks out.

### Oslo

`live/ruter.js` plays Ruter's five metro (T-bane) lines and six tram lines from
Entur's journey planner, as Norway's trains do. A whole day with every live
field is over Entur's size limit, so the day is read line by line with planned
times only; then every 30 seconds the journeys running now are asked again
with expected and actual times, in one request. Ruter shares no vehicle
positions, so trains are placed from those times. Late means 3 minutes.
It is a view of Norway: **Norway → Oslo metro & tram**, or `#oslm`.

### Vienna

`live/vie.js` plays Wiener Linien's U-Bahn and trams (28 tram lines and U1 to
U6, as they run that day) to the **timetable**: Wiener Linien publishes live
departures, but its API sends no CORS header, so a web page may not read it.
The day's timetable is cut from Wiener Linien's open GTFS by
`tools/build_vienna.py` into `data/vie/`, once a day by
`.github/workflows/vienna.yml` (no secrets). Nothing is late or cancelled, and
the status line says *Running to the timetable*. `#vie` opens it.

### New York and Los Angeles

`live/nyc.js` and `live/la.js` work like Boston, through one shared module,
`live/patterns.js`: every vehicle is laid onto its line's stopping pattern,
timed from the arrivals the feed predicts for its next stations, or failing
those from where it is now. The patterns (each sequence of stations a line runs,
with typical minutes between them) are built from the operators' GTFS by
`tools/build_patterns.py` into `data/nyc/` and `data/la/`, and rebuilt on the
first of every month by `.github/workflows/patterns.yml`. Nothing is late.

* **New York**: the subway and the Staten Island Railway, from the MTA's eight
  GTFS Realtime feeds (no key), every 30 seconds. Trains underground report no
  position, so predictions alone place them. Express variants (FX, 6X, 7X) play
  their line's string.
* **Los Angeles**: Metro Rail (A, B, C, D, E, K) and Metro's ~110 bus routes, from
  LA Metro's API (no key). It streams over a WebSocket; the whole bus fleet is
  about 60 KB a second, so every 30 seconds the page listens for six seconds and
  hangs up. Rail is drawn over the buses, and the buses are the small grey dots.

### San Francisco

`live/sf.js` plays BART and Muni's rail lines from 511.org's GTFS Realtime,
matched to the day's timetable in `data/sf/` (cut daily by `tools/build_sf.py`).
BART reports predicted times; Muni reports where its vehicles are, and a Muni
train's delay is read off where its fix puts it against the timetable. Late is
more than 5 minutes, as BART and SFMTA count it.

511 allows a token **60 requests an hour, for everyone listening together**, so
the page asks only twice every three minutes. One listener uses two thirds of
that; when the limit is reached, the trains quietly run on the timetable with
their last delays for fifteen minutes before asking again (the status line just
shows how long ago the last update was). For a
public site, ask 511 for a higher limit (transitdata@511.org).

### Sweden

`live/se.js` plays every passenger train in Sweden from Trafikverket's open API
(`TrainAnnouncement` for the timetable and live times, `TrainPosition` for GPS).
It needs a Trafikverket key in `src/js/keys.js`; while that is empty, Sweden's
trains are left out of the picker. The key ships to every visitor's browser, so
use a read-only key and watch its quota at
[data.trafikverket.se](https://data.trafikverket.se).

### Adding another live network

A network is a module like `live/fi.js` or `live/sto.js` registered in
`live/networks.js`: it loads stations and trains, asks for changes, and returns
GPS fixes, all as the same plain records (`id`, `cat`, `line`, `rows` with
`code`, `plan`, `actual`, `estimate`, `stop`). Everything after that, strings,
junctions, sound, drawing, is shared. Most other European feeds need an API key
(NS, SBB, Deutsche Bahn) or publish GTFS-RT protobuf without CORS, which a
static page cannot read directly; those would need a small proxy.

---

## Static: the recorded days

Each `data/replay/*.bin` is gzipped JSON, fetched only when its country is
picked (Mexico City is 64 KB, the Netherlands 580 KB, Austria 1 MB, Germany
5.6 MB). Coordinates, distances and times are delta-encoded integers, expanded
into `Float32Array`s at load ([`replay/decode.js`](src/js/replay/decode.js)):

```
geoms[i]  flat [dx, dy, dDistance] triples for one polyline
trips[i]  [geomIdx, category, name, from, to, cancelled, known, operator, t0,
           (dt planned, delay at that stop, dDistance) × stops]
```

Trains are bucketed into quarter hours at load, so a frame only ever looks at
the trains that can be running. The decoder hands out the same shape of string
and train records the live networks produce, so drawing, the Strings panel and
the sound are the same code in both modes.

### Strings vs. polylines

Most feeds give one polyline per route. The Mexico City feed gives one per
**direction**, so its 12 lines arrive as 24 polylines. `MX_LINES` in
[`config.js`](src/js/config.js) folds each pair into a single string, names it
with its official terminals and livery, and trims Línea 12 (which the feed
stores as an out-and-back loop) to one leg. The GTFS feed carries no service at
all for Línea 12, so it has no trains; the string is still drawn and can still
be played by hand.

### Rebuilding the Dutch pack

`data/replay/nl.bin` is the only static pack this repository can rebuild from
source. The Dutch feed gives a stop list, not a shape, so `tools/track.py` welds
every OSM running line into a graph, pins all 397 stations onto it, and routes
each hop a train makes along real track. Roughly 6% of hops fall back to a
straight segment where the OSM extract leaves two stations on disconnected
fragments; the build prints the figure.

* A service is filed under the date it *started*, so the previous day is read
  as well and its late trains arrive with negative times.
* Geometry is built from every scheduled calling point, cancelled or not; a
  skipped stop does not move the track.

```sh
sh tools/fetch_nl.sh 2026-01 2026-03     # ~70 MB into build/, not committed
python3 tools/build_nl.py --ordinary 2026-03-04 --bad 2026-01-05
```

---

## Running it

Static, no build step. It uses ES modules and `fetch`, so serve it over HTTP:

```sh
npm start            # python3 -m http.server 8000
# → http://localhost:8000          live, Finland
# → http://localhost:8000/#sto     live, Stockholm metro
# → http://localhost:8000/#bos     live, Boston subway
# → http://localhost:8000/#sf      live, San Francisco
# → http://localhost:8000/#ch      static, Switzerland
# → http://localhost:8000/#de-bad  static, Germany's disrupted day
```

Deploying to GitHub Pages: Settings → Pages → deploy from `main`, root folder.
`.nojekyll` is present so Jekyll does not swallow anything, and every path is
relative, so it works from a project subpath. Bundled data is the static packs
(~9.3 MB, each downloaded only when picked), the region outlines, and the daily
Stockholm, Helsinki and San Francisco timetables, which `.github/workflows/`
rebuild every day. The San Francisco build needs the repository secret
`SF_511_KEY` (a 511.org token).

### Tests

Two end-to-end smoke tests drive the real page in headless Chromium:

```sh
npm install
npx playwright install chromium
npm run test:replay           # static, all five networks, offline (~2 min)
node test/replay.mjs mx       # just one
npm run test:live             # live, against the real feeds (~3 min)
node test/live.mjs --shots    # also writes screenshots to test/shots/
npm test                      # both
```

The static test covers the module graph, the start screen, the Mexico City line
table, both tunings, the strings panel, the theme switch, deep links, and a
measurement that a dense hand strum stays below the clipping ceiling. The live
test listens for one real minute and needs network access and a Stockholm
timetable for today in `data/sto/`; it ends by switching to static and back.

---

## Project layout

```
index.html              markup for both modes; [data-only] marks what belongs to one
assets/                 the logo (white for the dark theme, dark for the light one), the tab icons and the home-screen icon
src/css/takt.css        all styling; colour tokens are written by theme.js
src/js/
  main.js               boot, the Live / Static switch, the frame loop
  config.js             categories, chords, live views, the Mexico City line table, credits
  state.js              the one shared mutable object
  theme.js              light/dark, and the canvas palette that must match the CSS
  geom.js               positions along a route, and the spatial index for crossings
  sim.js                sounding a string: rate limits, timing, lateness, strums
  render.js             canvas drawing
  live/
    mode.js             live mode: loading, polling, views, switching networks
    step.js             placing live trains; crossings, junctions, arrivals
    networks.js         the live networks, in picker order
    fi.js digitraffic.js    Finland
    se.js no.js         Sweden (Trafikverket), Norway (Entur)
    rail.js             routing expresses through stations they pass (Sweden, Norway)
    ruter.js            Oslo metro and trams: Entur journey planner
    vie.js              Vienna U-Bahn and trams, to the timetable
    sto.js gtfsrt.js    Stockholm: daily timetable plus GTFS Realtime
    bos.js              Boston subway: MBTA V3 API, stopping patterns plus vehicles
    sf.js               San Francisco: daily timetable plus 511 GTFS Realtime
    patterns.js         networks placed onto stopping patterns from their vehicles
    nyc.js              New York subway: MTA GTFS Realtime
    la.js               Los Angeles Metro rail and bus: LA Metro's WebSocket
    hel.js mqtt.js      Helsinki metro and trams: HSL GTFS plus HFP over MQTT
    network.js          projection, strings, trains, merging updates, tuning
    clock.js            local time of the network, whatever the listener's zone
  replay/
    mode.js             static mode: countries, days, play/pause, speed, scrubbing
    step.js             moving the recorded trains; crossings
    loader.js           fetch + gunzip the country packs
    decode.js           unpack into typed arrays; fold directions into strings
  audio/
    engine.js           the sampler, the effects chain, distortion, the limiter
    tuning.js           length → pitch, in both tunings
    osc.js              OSC out over a WebSocket
    unlock.js           getting sound out of phones: start on the tap, ignore the silent switch, recover after calls
    bed.js              the held chord under everything
  ui/
    controls.js         shared controls: countries, mute, bed, day bar, clock, playing by hand
    sidebar.js          the Strings panel
    advanced.js         the Advanced panel
    legend.js           the key under the map
    credits.js          data sources
    colour.js           a line's colour from its pitch
    output.js           the Output section: browser sound on/off, OSC port and connect
data/
  *-regions.json        live outlines (geoBoundaries, ODbL)
  sto/ hel/ sf/         live timetables, one file per day, rebuilt daily
  nyc/ la/              stopping patterns, rebuilt monthly
  vie/                  Vienna's timetable, one file per day, rebuilt daily
  replay/index.json     static manifest: order, names, file paths
  replay/*.bin          one gzipped JSON pack per recorded network
pd/
  takt.pd               Pure Data control panel: six synths, presets, delay, reverb
  voices/               the six synths, one small patch each
sc/
  takt.scd              SuperCollider: the trains as OSC, played with a reverb
tools/
  osc-bridge.mjs        WebSocket to UDP OSC, for the patch and other software
  build_pd.py           writes the Pure Data patch and its voices
  build_sto.py build_hel.py build_sf.py    cut the daily timetables
  build_patterns.py     stopping patterns for New York and Los Angeles
  build_vienna.py       Vienna's U-Bahn and tram timetable, from Wiener Linien's GTFS
  build_regions.py      outlines for Oslo and Vienna, from geoBoundaries
  build_us_regions.py   US outlines (towns, counties and cities around each US network)
  fetch_nl.sh build_nl.py track.py    rebuild the Dutch static pack
.github/workflows/      the daily Stockholm, Helsinki, San Francisco and Vienna builds; monthly patterns
test/replay.mjs         static smoke test (offline)
test/live.mjs           live smoke test (real feeds)
archive/
  takt-v0-single-file.html   the original one-file version, kept for reference
```

`archive/takt-v0-single-file.html` is the version this project grew out of:
everything, markup, styles, all the JavaScript and 11.6 MB of base64 data, in a
single 816-line file. Nothing else refers to it, and it can be deleted without
affecting the site.

---

## Controls

| | |
| --- | --- |
| **Live / Static** | The mode. Each remembers its network, view, day and time. |
| **Drag on the map** | Play the network by hand. Crossed strings are strummed low to high. |
| **Speaker** (live) | Mute / unmute. The trains keep moving; only the sound stops. |
| **▶ ⏸ ½× 1× 3×** (static) | Play / pause and speed. |
| **Space** | Mute (live) or play / pause (static) |
| **Day bar** | How many trains run across the day, and where now is on it. In static, drag it to scrub; ← → step 15 minutes. |
| **Countries** | Live: Austria, Finland, Norway, Sweden, United States, with views under each (Vienna; Helsinki, Helsinki metro & tram; Oslo region, Oslo metro & tram; Mälardalen, Skåne, Stockholm metro & tram; Boston, Los Angeles, New York, San Francisco, Bay Area). Static: Austria, Germany, Mexico City, the Netherlands, Switzerland, with an ordinary and a disrupted day where there is one. |
| **Tuning fork** | The bed chord on/off |
| **Tap for sound** | Appears when the browser has paused the sound (after a call, the lock screen or switching apps on a phone); one tap brings it back. On iPhone Takt plays as media, so the silent switch does not mute it. |
| **Corners** (or **F**) | Full screen on and off. Hidden where a browser cannot show a page full screen (Safari on iPhone). |
| **Sun / moon** | Light or dark. Your choice is remembered; without one, it follows the system. |
| **Strings** | Every line, grouped (by category live, by operator in static). Click one to solo it. A group's rows are built the first time it opens. |
| **Advanced** | Tuning; what plays (live: lines crossed, arrivals, or both); how late trains sound (detuned, distorted, or both); density, volume, city labels and the effects chain. |

---

## Data sources

| What | Source |
| --- | --- |
| Finland: trains, timetables, actual and estimated times, cancellations, GPS, stations | Fintraffic, [digitraffic.fi](https://www.digitraffic.fi/en/railway-traffic/) (CC BY 4.0) |
| Sweden's trains, live | [Trafikverket open API](https://data.trafikverket.se) |
| Norway's trains, live | [Entur](https://developer.entur.org) journey planner and vehicle positions, no key (NLOD) |
| Oslo metro and trams, live | Ruter's times via [Entur](https://developer.entur.org)'s journey planner (NLOD); outlines from geoBoundaries NOR ADM2 (CC BY 4.0) |
| Vienna U-Bahn and trams, timetable | [Wiener Linien GTFS](https://www.data.gv.at/katalog/dataset/wiener-linien-fahrplandaten-gtfs-wien) (CC BY 4.0); outlines from geoBoundaries AUT ADM3 (CC BY-SA 2.0) |
| Helsinki metro and trams, live | HSL high-frequency positioning (HFP, MQTT over WebSocket), no key (CC BY 4.0) |
| Helsinki timetable | [HSL GTFS](https://www.hsl.fi/en/hsl/open-data), cut daily by `tools/build_hel.py` (CC BY 4.0) |
| Stockholm metro, live and timetable | GTFS Sweden 3 Realtime and static, Samtrafiken via Trafiklab (CC0) |
| Boston subway, live | [MBTA V3 API](https://www.mbta.com/developers/v3-api) (MBTA Developers License) |
| New York subway, live and patterns | [MTA GTFS Realtime and GTFS](https://api.mta.info) |
| Los Angeles Metro, live and patterns | [LA Metro API](https://api.metro.net) and LA Metro GTFS ([gitlab.com/LACMTA](https://gitlab.com/LACMTA)) |
| San Francisco, live and timetable | BART and Muni GTFS and GTFS Realtime via [511.org](https://511.org/open-data/transit), Metropolitan Transportation Commission |
| US outlines | US Census Bureau cartographic boundary files (public domain) |
| Live outlines (regions, municipalities) | [geoBoundaries](https://www.geoboundaries.org) FIN, SWE, NOR, from OpenStreetMap (ODbL) |
| Austria, static | Mobilitätsverbünde Österreich GTFS (CC BY 4.0); ÖBB-Infrastruktur Zugfahrten (CC BY 3.0 AT); ÖBB GeoNetz; borders from [ginseng666](https://github.com/ginseng666/GeoJSON-TopoJSON-Austria) |
| Switzerland, static | geOps GTFS; opentransportdata.swiss Ist-Daten; Federal Office of Transport Schienennetz; borders from [click_that_hood](https://github.com/codeforgermany/click_that_hood) |
| Germany, static | [piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data) (CC BY 4.0, from the DB Timetable API); DB InfraGO (GeoZG); borders from [deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON) |
| Netherlands, static | [Rijden de Treinen](https://www.rijdendetreinen.nl/open-data) service archive (CC BY 4.0); OpenStreetMap running lines, via Overpass (ODbL); provinces from [cartomap.github.io/nl](https://cartomap.github.io/nl/) |
| Mexico City, static | STC Metro GTFS, datos.cdmx.gob.mx (CC BY, via SEMOVI), timetable only, no punctuality; OpenStreetMap STC Metro relations, via Overpass |

Because the Mexico City feed has no punctuality in it, every train there runs to
plan and the late/cancelled marks are left out of the key rather than invented.

---

## Credits

Built by Sofia Vallejo Budziszewski as part of doctoral research at the
[Institute for Electronic Music and Acoustics](https://iem.kug.ac.at),
University of Music and Performing Arts Graz, Austria. Inspired by Joshua Wolk's
[Train Jazz](https://www.trainjazz.com).

Comments, ideas and feedback are very welcome: **[vallejo@iem.at](mailto:vallejo@iem.at)**.

---

## Using this work

You are free to share, publish, perform, adapt and build on Takt, for any
purpose, including commercially, **as long as you credit it**.

* **The work** (the sonification, its design and its texts) is licensed under
  [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
* **The code** is MIT (see [LICENSE](LICENSE)), which also asks you to keep the
  author's name with it.

Please credit it as:

> *Takt* by Sofia Vallejo Budziszewski, Institute for Electronic Music and
> Acoustics, University of Music and Performing Arts Graz, Austria (CC BY 4.0),
> https://sofiavallejob.github.io/takt

Visits are counted anonymously with [GoatCounter](https://bringmethetxcos.goatcounter.com)
(no cookies, so no consent banner is needed): page views, plus a few events from
`src/js/stats.js`, namely `start/live` or `start/static` (someone pressed Start
listening), `mode/…` (switched mode), `live/<view>` and `static/<country>` (which
networks people pick, once each per visit). Local copies (`localhost`) are not
counted.

The data belongs to Fintraffic, HSL,
Trafikverket, Samtrafiken, Entur, the MBTA, the MTA, LA Metro, BART, SFMTA, 511.org and the operators and projects listed above,
under their own licences.
