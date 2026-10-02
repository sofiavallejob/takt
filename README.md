# Takt

**Rail networks as strings, live.** Two networks so far: every passenger train
in **Finland**, and the **Stockholm metro**.

**▶ [sofiavallejob.github.io/takt-live](https://sofiavallejob.github.io/takt-live/)**
· [Stockholm](https://sofiavallejob.github.io/takt-live/#sto)
· [Helsinki](https://sofiavallejob.github.io/takt-live/#hel)

Every route is a string, tuned by its length. The trains on the map are where
they are right now, from the operators' open live feeds. When a
train crosses another line, that line's string sounds. Where it leaves a line at
a junction, that line sounds more softly. When it reaches a station, its own
line sounds, quietly. Longer routes play lower. The harmony moves on the hour in
Helsinki. Trains running late drag behind the beat and drift out of tune;
cancelled trains leave only a click.

There is no recording and no replay: what you hear at 08:10 is the morning rush
in Helsinki at 08:10, and at four in the morning it goes almost silent because
the network does. The clock and the hourly chord follow local time where the
trains are, so Stockholm runs an hour behind Finland.

---

## Why Finland

Fintraffic's [digitraffic.fi](https://www.digitraffic.fi/en/railway-traffic/)
is the best open real-time rail feed in Europe for this: no API key, CORS open
so a static page can read it directly, and every timetable point of every train
(stations and the operating points between them) carries a scheduled time, an
actual time once the train has passed, and a live estimate until then. That is
everything the original Takt needed from a day of archived data, available as
it happens.

## How it sounds

### Who plays whom

The note belongs to the line being **crossed**, not to the line the train is
running on. Finnish lines meet at stations far more often than they cross in
open country, so crossings are found two ways:

| Where | What sounds |
| --- | --- |
| A station on the train's route that another line also passes through | Lines that meet the route there without sharing track with it: full note. Lines the train is parting from (they shared track up to here): softer. At most three per station, strummed. |
| Open country | Any line the train's path cuts across at a steep angle (`sin θ > 0.55`), as before. |
| A passenger stop | The train's own line, softly, at that point on the string. Switch off in Advanced. |

Lines a train keeps running alongside never sound. In practice Pasila,
Kerava, Riihimäki and Tampere are the loudest places on the instrument, because
that is where the lines part.

### Tuning (Advanced → Tuning)

| Mode | What it does |
| --- | --- |
| **Chord** | Each string is pulled to the nearest note of the hour's chord (D, Bm, G, A). |
| **Harmonic** | Frequency inversely proportional to length. The longest route (Helsinki to Kolari, about 960 km) is the fundamental. |

### The bed

One held chord under everything: louder and brighter with more trains moving
(relative to today's busiest ten minutes), wavering when many are late, losing
voices as cancellations mount, leaning in stereo towards the traffic.

---

## The data, and what is made of it

* **Trains.** On load the page reads every passenger train for today (and
  yesterday before 06:00, tomorrow after 22:00) from the GraphQL endpoint,
  about 0.5 MB compressed. Every 15 seconds it asks only for trains that
  changed since the last answer (`trainsByVersionGreaterThan`).
* **Position.** Every 10 seconds the page reads each train's latest GPS fix
  (`/api/v1/train-locations/latest/`), snaps it onto the train's route, and
  carries it forward at the reported speed for at most 4 km. Trains without a
  fresh fix (older than two minutes, or more than 2 km off their route) are
  placed from the timetable instead: actual times behind them, live estimates
  ahead, and the last known delay carried forward where a point has neither.
  The drawn position eases towards whichever applies and never runs backwards,
  so a revised estimate does not make a train jump. On a typical evening about
  nine in ten moving trains are on GPS, and GPS and timetable agree to within
  a few hundred metres.
* **Notes follow the dot.** Arrivals and junctions sound when the drawn train
  reaches the station, not when the timetable says it should, so what you hear
  and what you see stay together.
* **Routes.** Every train's route is drawn through every timetable point it
  passes, so routes follow the track at station spacing. Commuter lines are one
  string per letter (I and P, the Ring Rail, are one string); other trains are
  one string per pair of end stations. The longest version seen while today's
  timetable is read becomes the string, and live updates never reshape a
  string under the listener.
* **Late** means 3 minutes for commuter trains and 5 for everything else, the
  limits Finland itself reports punctuality against. A late train shows a ring
  where the timetable says it should be.
* **Cancelled** trains move on their timetable as dashed rings and click. A
  train cancelled from some station onwards stops being a train there.

---

## Running it

Static, no build step. It uses ES modules and `fetch`, so serve it over HTTP:

```sh
npm start            # python3 -m http.server 8000
# → http://localhost:8000
# → http://localhost:8000/#hel   opens on the Helsinki view
# → http://localhost:8000/#sto   opens on the Stockholm metro
```

Deploying to GitHub Pages works as before: Settings → Pages → deploy from
`main`, root folder. Bundled data is the region outlines and the daily
Stockholm timetable; everything else comes live from the feeds.

It cannot run as a sandboxed page that blocks outside requests, since the
whole point is the request to the live feed.

### Test

The smoke test runs against the real feeds, so it needs network access, a
Stockholm timetable for today in `data/sto/`, and about 100 seconds (it listens
for one real minute):

```sh
npm install
npx playwright install chromium
npm test                      # node test/smoke.mjs
node test/smoke.mjs --shots   # also writes screenshots to test/shots/
```

---

## Project layout

```
index.html              markup and nothing else
src/css/takt.css        all styling; colour tokens are written by theme.js
src/js/
  main.js               boot, polling, the frame loop
  config.js             categories, chords, views, station names, credits
  state.js              the one shared mutable object
  theme.js              light/dark, and the canvas palette that must match the CSS
  geom.js               positions along a route, and the spatial index for crossings
  sim.js                placing the trains, deciding which strings that plucks
  render.js             canvas drawing
  live/
    networks.js         the networks, in picker order
    fi.js               Finland: loading, updates, positions
    digitraffic.js      Fintraffic's API: stations, a day of trains, changes, GPS fixes
    sto.js              Stockholm: daily timetable plus GTFS Realtime
    gtfsrt.js           a small GTFS Realtime protobuf reader, no library
    network.js          projection, strings, trains, merging updates, tuning
    clock.js            local time of the network, whatever the listener's zone
  audio/
    engine.js           the sampler, the effects chain, the limiter
    tuning.js           length → pitch, in both tunings
    bed.js              the held chord under everything
  ui/
    controls.js         listening, view picker, day bar, playing by hand
    sidebar.js          the Strings panel
    advanced.js         the Advanced panel
    legend.js           the key under the map
    credits.js          data sources
    colour.js           a line's colour from its pitch
data/
  fi-regions.json       Finnish regions, simplified (geoBoundaries, ODbL)
  sto-regions.json      Stockholm municipalities, cropped (geoBoundaries, ODbL)
  sto/                  the metro timetable, one file per day, rebuilt daily
tools/build_sto.py      cuts GTFS Sweden 3 down to the metro
.github/workflows/      the daily Stockholm build
test/smoke.mjs          end-to-end smoke test against the live feeds
```

### Adding another network

A network is a module like `live/fi.js` or `live/sto.js` registered in
`live/networks.js`: it loads stations and trains, asks for changes, and
returns GPS fixes, all as the same plain records (`id`, `cat`, `line`, `rows`
with `code`, `plan`, `actual`, `estimate`, `stop`). Everything after that,
strings, junctions, sound, drawing, is shared. Most other European feeds need an API key (NS, SBB/
opentransportdata.swiss, Deutsche Bahn) or publish GTFS-RT protobuf without
CORS, which a static page cannot read directly; those would need a small proxy.

---

## Controls

| | |
| --- | --- |
| **Drag on the map** | Play the network by hand. Crossed strings are strummed low to high. |
| **Space** | Listen / stop listening (the map keeps running) |
| **Finland / Stockholm** | The network |
| **Finland / Helsinki** | In Finland: the whole country, or the commuter area around Helsinki |
| **Tuning fork** | The bed chord on/off |
| **Sun / moon** | Light or dark |
| **Strings** | Every line, grouped into long distance, regional and commuter. Click one to solo it. |
| **Advanced** | Tuning, density, volume, arrivals, city labels, and the effects chain |

The bar along the bottom is today: how many trains run across the day, and where
now is on it.

---

## Data sources

| What | Source |
| --- | --- |
| Trains, timetables, actual and estimated times, cancellations | Fintraffic, [digitraffic.fi](https://www.digitraffic.fi/en/railway-traffic/) (CC BY 4.0) |
| Train GPS positions | digitraffic.fi train locations (CC BY 4.0) |
| Station coordinates | digitraffic.fi station metadata (CC BY 4.0) |
| Regions | [geoBoundaries](https://www.geoboundaries.org) FIN ADM1, from OpenStreetMap (ODbL) |
| Stockholm metro, live | GTFS Sweden 3 Realtime, Samtrafiken via Trafiklab (CC0) |
| Stockholm metro timetable | GTFS Sweden 3 static, Samtrafiken via Trafiklab (CC0) |
| Stockholm outlines | geoBoundaries SWE ADM2, from OpenStreetMap (ODbL) |

---

## Credits

Built by Sofia Vallejo Budziszewski. Inspired by Alexander Chen's
[Conductor](http://mta.me) and Joshua Wolk's [Train Jazz](https://www.trainjazz.com).

Code is MIT (see [LICENSE](LICENSE)). The data belongs to Fintraffic, Samtrafiken and
the projects listed above, under their own licences.
