# Takt

**Rail networks as strings.**

Every route in a rail network is a string, tuned by its length. Trains are the
players: when a train crosses another line, that line's string sounds. Longer
routes play lower. The harmony moves every hour. On-time trains land on the
beat and in tune; late trains drag behind and drift out of tune; cancelled
trains leave only a click.

Takt has two modes, switched with **Live / Replay** at the top of the page:

| Mode | Networks | What you hear |
| --- | --- | --- |
| **Live** | **Finland**, **Norway**, **Sweden**; the **Helsinki** and **Stockholm** metros and trams; in the **United States**, the **Boston** subway and **San Francisco**'s BART, Muni Metro, streetcar and cable cars | The trains where they are right now, from the operators' open live feeds. No recording and no replay: at four in the morning it goes almost silent because the network does. |
| **Replay** | **Austria**, **Germany**, the **Mexico City metro**, the **Netherlands**, **Switzerland** | A recorded day with a real timetable behind it, and real punctuality behind all but Mexico City. The clock can be paused, sped up and scrubbed; some countries have a second, disrupted day. |

**▶ [sofiavallejob.github.io/takt](https://sofiavallejob.github.io/takt/)**
· [Stockholm](https://sofiavallejob.github.io/takt/#sto)
· [Boston](https://sofiavallejob.github.io/takt/#bos)
· [San Francisco](https://sofiavallejob.github.io/takt/#sf)
· [Helsinki](https://sofiavallejob.github.io/takt/#hel)
· [Switzerland, replayed](https://sofiavallejob.github.io/takt/#ch)
· [Germany, a bad day](https://sofiavallejob.github.io/takt/#de-bad)

The address picks the mode: `#sto`, `#hel`, `#no`, `#bos`, `#sf`, `#bay` … are live; `#at`, `#ch`,
`#de`, `#nl`, `#mx` are replay, and `-bad` opens a country's disrupted day. No
address is live Finland. Switching mode in the page keeps the sound running and
remembers where each mode was.

---

## What we are working on

**Live**

* Robustness when a server or feed goes down: keep playing what is known,
  say clearly what is missing, and pick up again on its own when the feed
  comes back.
* New networks: Buenos Aires, Chicago, London, the Netherlands, Paris, Seoul,
  Switzerland and Sydney; the Oslo metro and trams (and perhaps buses).
* Boston's commuter rail, which runs to a timetable and so can be late.

**Replay**

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
| Open country | Any line the train's path cuts across at a steep angle, as in replay. |
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
* **Polling stops** while the tab is hidden or replay is playing: nobody is
  listening, and the feeds have quotas.

The clock and the hourly chord follow local time where the trains are, so
Stockholm and Oslo run an hour behind Finland, Boston seven hours behind it, and
San Francisco ten.

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

### San Francisco

`live/sf.js` plays BART and Muni's rail lines from 511.org's GTFS Realtime,
matched to the day's timetable in `data/sf/` (cut daily by `tools/build_sf.py`).
BART reports predicted times; Muni reports where its vehicles are, and a Muni
train's delay is read off where its fix puts it against the timetable. Late is
more than 5 minutes, as BART and SFMTA count it.

511 allows a token **60 requests an hour, for everyone listening together**, so
the page asks only twice every three minutes. One listener uses two thirds of
that; when the limit is reached, the page says so and the trains run on the
timetable with their last delays for fifteen minutes before asking again. For a
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

## Replay: the recorded days

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

`data/replay/nl.bin` is the only replay pack this repository can rebuild from
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
# → http://localhost:8000/#ch      replay, Switzerland
# → http://localhost:8000/#de-bad  replay, Germany's disrupted day
```

Deploying to GitHub Pages: Settings → Pages → deploy from `main`, root folder.
`.nojekyll` is present so Jekyll does not swallow anything, and every path is
relative, so it works from a project subpath. Bundled data is the replay packs
(~9.3 MB, each downloaded only when picked), the region outlines, and the daily
Stockholm, Helsinki and San Francisco timetables, which `.github/workflows/`
rebuild every day. The San Francisco build needs the repository secret
`SF_511_KEY` (a 511.org token).

### Tests

Two end-to-end smoke tests drive the real page in headless Chromium:

```sh
npm install
npx playwright install chromium
npm run test:replay           # replay, all five networks, offline (~2 min)
node test/replay.mjs mx       # just one
npm run test:live             # live, against the real feeds (~3 min)
node test/live.mjs --shots    # also writes screenshots to test/shots/
npm test                      # both
```

The replay test covers the module graph, the start screen, the Mexico City line
table, both tunings, the strings panel, the theme switch, deep links, and a
measurement that a dense hand strum stays below the clipping ceiling. The live
test listens for one real minute and needs network access and a Stockholm
timetable for today in `data/sto/`; it ends by switching to replay and back.

---

## Project layout

```
index.html              markup for both modes; [data-only] marks what belongs to one
src/css/takt.css        all styling; colour tokens are written by theme.js
src/js/
  main.js               boot, the Live / Replay switch, the frame loop
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
    sto.js gtfsrt.js    Stockholm: daily timetable plus GTFS Realtime
    bos.js              Boston subway: MBTA V3 API, stopping patterns plus vehicles
    sf.js               San Francisco: daily timetable plus 511 GTFS Realtime
    hel.js mqtt.js      Helsinki metro and trams: HSL GTFS plus HFP over MQTT
    network.js          projection, strings, trains, merging updates, tuning
    clock.js            local time of the network, whatever the listener's zone
  replay/
    mode.js             replay mode: countries, days, play/pause, speed, scrubbing
    step.js             moving the recorded trains; crossings
    loader.js           fetch + gunzip the country packs
    decode.js           unpack into typed arrays; fold directions into strings
  audio/
    engine.js           the sampler, the effects chain, distortion, the limiter
    tuning.js           length → pitch, in both tunings
    bed.js              the held chord under everything
  ui/
    controls.js         shared controls: countries, mute, bed, day bar, clock, playing by hand
    sidebar.js          the Strings panel
    advanced.js         the Advanced panel
    legend.js           the key under the map
    credits.js          data sources
    colour.js           a line's colour from its pitch
data/
  *-regions.json        live outlines (geoBoundaries, ODbL)
  sto/ hel/ sf/         live timetables, one file per day, rebuilt daily
  replay/index.json     replay manifest: order, names, file paths
  replay/*.bin          one gzipped JSON pack per recorded network
tools/
  build_sto.py build_hel.py build_sf.py    cut the daily timetables
  build_us_regions.py   US outlines (Boston towns, Bay Area counties)
  fetch_nl.sh build_nl.py track.py    rebuild the Dutch replay pack
.github/workflows/      the daily Stockholm, Helsinki and San Francisco builds
test/replay.mjs         replay smoke test (offline)
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
| **Live / Replay** | The mode. Each remembers its network, view, day and time. |
| **Drag on the map** | Play the network by hand. Crossed strings are strummed low to high. |
| **Speaker** (live) | Mute / unmute. The trains keep moving; only the sound stops. |
| **▶ ⏸ ½× 1× 3×** (replay) | Play / pause and speed. |
| **Space** | Mute (live) or play / pause (replay) |
| **Day bar** | How many trains run across the day, and where now is on it. In replay, drag it to scrub; ← → step 15 minutes. |
| **Countries** | Live: Finland, Norway, Sweden, United States, with views under each (Helsinki, Helsinki metro & tram; Oslo region; Mälardalen, Skåne, Stockholm metro & tram; Boston, San Francisco, Bay Area). Replay: Austria, Germany, Mexico City, the Netherlands, Switzerland, with an ordinary and a disrupted day where there is one. |
| **Tuning fork** | The bed chord on/off |
| **Sun / moon** | Light or dark. Your choice is remembered; without one, it follows the system. |
| **Strings** | Every line, grouped (by category live, by operator in replay). Click one to solo it. A group's rows are built the first time it opens. |
| **Advanced** | Tuning; what plays (live: lines crossed, arrivals, or both); how late trains sound (detuned, distorted, or both); density, volume, city labels and the effects chain. |

---

## Data sources

| What | Source |
| --- | --- |
| Finland: trains, timetables, actual and estimated times, cancellations, GPS, stations | Fintraffic, [digitraffic.fi](https://www.digitraffic.fi/en/railway-traffic/) (CC BY 4.0) |
| Sweden's trains, live | [Trafikverket open API](https://data.trafikverket.se) |
| Norway's trains, live | [Entur](https://developer.entur.org) journey planner and vehicle positions, no key (NLOD) |
| Helsinki metro and trams, live | HSL high-frequency positioning (HFP, MQTT over WebSocket), no key (CC BY 4.0) |
| Helsinki timetable | [HSL GTFS](https://www.hsl.fi/en/hsl/open-data), cut daily by `tools/build_hel.py` (CC BY 4.0) |
| Stockholm metro, live and timetable | GTFS Sweden 3 Realtime and static, Samtrafiken via Trafiklab (CC0) |
| Boston subway, live | [MBTA V3 API](https://www.mbta.com/developers/v3-api) (MBTA Developers License) |
| San Francisco, live and timetable | BART and Muni GTFS and GTFS Realtime via [511.org](https://511.org/open-data/transit), Metropolitan Transportation Commission |
| US outlines | US Census Bureau cartographic boundary files (public domain) |
| Live outlines (regions, municipalities) | [geoBoundaries](https://www.geoboundaries.org) FIN, SWE, NOR, from OpenStreetMap (ODbL) |
| Austria, replay | Mobilitätsverbünde Österreich GTFS (CC BY 4.0); ÖBB-Infrastruktur Zugfahrten (CC BY 3.0 AT); ÖBB GeoNetz; borders from [ginseng666](https://github.com/ginseng666/GeoJSON-TopoJSON-Austria) |
| Switzerland, replay | geOps GTFS; opentransportdata.swiss Ist-Daten; Federal Office of Transport Schienennetz; borders from [click_that_hood](https://github.com/codeforgermany/click_that_hood) |
| Germany, replay | [piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data) (CC BY 4.0, from the DB Timetable API); DB InfraGO (GeoZG); borders from [deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON) |
| Netherlands, replay | [Rijden de Treinen](https://www.rijdendetreinen.nl/open-data) service archive (CC BY 4.0); OpenStreetMap running lines, via Overpass (ODbL); provinces from [cartomap.github.io/nl](https://cartomap.github.io/nl/) |
| Mexico City, replay | STC Metro GTFS, datos.cdmx.gob.mx (CC BY, via SEMOVI), timetable only, no punctuality; OpenStreetMap STC Metro relations, via Overpass |

Because the Mexico City feed has no punctuality in it, every train there runs to
plan and the late/cancelled marks are left out of the key rather than invented.

---

## Credits

Built by Sofia Vallejo Budziszewski as part of doctoral research at the
[Institute for Electronic Music and Acoustics](https://iem.kug.ac.at),
University of Music and Performing Arts Graz, Austria. Inspired by Joshua Wolk's
[Train Jazz](https://www.trainjazz.com).

Code is MIT (see [LICENSE](LICENSE)). The data belongs to Fintraffic, HSL,
Trafikverket, Samtrafiken, Entur, the MBTA, BART, SFMTA, 511.org and the operators and projects listed above,
under their own licences.
