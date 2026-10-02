#!/usr/bin/env python3
"""Build data/replay/nl.bin, the Netherlands pack, from Rijden de Treinen open data.

Sources (all fetched by tools/fetch_nl.sh, none committed):
  services-YYYY-MM.csv.gz  every train service, per stop, with realised delays
                           and cancellations   (opendata.rijdendetreinen.nl)
  stations.csv             station coordinates (opendata.rijdendetreinen.nl)
  provinces.geojson        province outlines   (cartomap.github.io/nl)

  rail.json                OSM running lines, tiled from Overpass (tools/fetch_nl.sh)

Routes follow real track: every hop between two calling points is the shortest
path along the OSM railway graph (see track.py), not a straight line between
stations. A handful of branch lines sit on disconnected fragments of the
extract; those hops fall back to a straight segment and the build reports how
many.

Usage:  python3 tools/build_nl.py --ordinary 2026-03-04 --bad 2026-01-05
"""

import argparse, csv, gzip, json, math, sys
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from track import Network

SRC = Path(__file__).resolve().parent.parent / 'build' / 'nl'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'replay' / 'nl.bin'

# Replacement road services are not trains and must not become strings.
BUSES = {'Stopbus ipv trein', 'Snelbus ipv trein', 'Taxibus ipv trein'}

# The five categories the instrument draws and budgets, fastest first.
CATS = ['Intercity direct & high speed', 'Intercity', 'Night train',
        'Sneltrein & Stoptrein', 'Sprinter']
CAT_OF = {
    'Intercity direct': 0, 'Eurostar': 0, 'ICE': 0, 'Eurocity Direct': 0,
    'Intercity': 1, 'EuroCity': 1, 'InterCityExpress': 1,
    'Nightjet': 2, 'European Sleeper': 2, 'Nachttrein': 2,
    'Sneltrein': 3, 'Stoptrein': 3, 'Regionale trein': 3,
    'Sprinter': 4,
}

# Stations shown as labels on the map, and the ones dropped on a narrow screen.
CITIES = ['Amsterdam Centraal', 'Rotterdam Centraal', 'Den Haag Centraal',
          'Utrecht Centraal', 'Eindhoven Centraal', 'Groningen', 'Arnhem Centraal',
          'Maastricht', 'Zwolle', 'Leeuwarden', 'Enschede', 'Vlissingen',
          'Schiphol Airport', 'Nijmegen', 'Breda', 'Amersfoort Centraal']
SMALL = ['Vlissingen', 'Enschede', 'Leeuwarden', 'Amersfoort Centraal', 'Nijmegen', 'Breda']
CITY_LABEL = {
    'Amsterdam Centraal': 'Amsterdam', 'Rotterdam Centraal': 'Rotterdam',
    'Den Haag Centraal': 'Den Haag', 'Utrecht Centraal': 'Utrecht',
    'Eindhoven Centraal': 'Eindhoven', 'Arnhem Centraal': 'Arnhem',
    'Amersfoort Centraal': 'Amersfoort', 'Schiphol Airport': 'Schiphol',
}

LAT_KM = 110.574          # km per degree of latitude
LON_KM = 111.320          # km per degree of longitude at the equator


def load_stations(path):
    """NL stations only: a cross-border leg with no intermediate stops we know
    about would otherwise become a straight line hundreds of km long."""
    out = {}
    with open(path, encoding='utf-8') as f:
        for s in csv.DictReader(f):
            if s['country'] != 'NL':
                continue
            out[s['code'].upper()] = {
                'name': s['name_long'],
                'lat': float(s['geo_lat']),
                'lon': float(s['geo_lng']),
            }
    return out


def make_projection(stations):
    lats = [s['lat'] for s in stations.values()]
    lons = [s['lon'] for s in stations.values()]
    lat0 = (min(lats) + max(lats)) / 2
    lon0 = (min(lons) + max(lons)) / 2
    kx = LON_KM * math.cos(math.radians(lat0))
    def project(lat, lon):
        return (kx * (lon - lon0), -LAT_KM * (lat - lat0))
    return project, lat0, lon0


def parse_minutes(ts, day):
    """ISO timestamp -> minutes from local midnight of the service date.
    Trains that run past midnight land beyond 1440, which the player expects."""
    if not ts:
        return None
    t = datetime.fromisoformat(ts)
    base = date.fromisoformat(day)
    delta = t.replace(tzinfo=None) - datetime(base.year, base.month, base.day)
    return delta.total_seconds() / 60.0


def read_day(path, day, stations, project):
    """Collect one day's services as ordered, projected stop lists.

    The feed files a service under the date it *started*, so a train leaving at
    23:50 belongs to the day before. Reading the previous day too, shifted back
    by 24 hours, is what puts the genuine night services into the small hours
    instead of leaving midnight to two o'clock artificially empty."""
    prev = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
    # parse_minutes already measures from *this* day's midnight, so yesterday's
    # late trains come out negative on their own; no extra shift is needed.
    wanted = {day, prev}
    services = defaultdict(lambda: {'stops': [], 'type': '', 'company': '', 'canc': False})
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['Service:Date'] not in wanted:
                continue
            if row['Service:Type'] in BUSES:
                continue
            code = row['Stop:Station code'].upper()
            st = stations.get(code)
            if not st:
                continue
            svc = services[row['Service:RDT-ID']]
            svc['type'] = row['Service:Type']
            svc['company'] = row['Service:Company']
            svc['canc'] = row['Service:Completely cancelled'] == 'true'

            # Every scheduled calling point is kept, cancelled or not. A skipped
            # stop does not move the track: the route is where the line goes,
            # and dropping those stops tore 200 km holes in the geometry on a
            # day with heavy cancellations. Whether the train ran is carried on
            # the trip, not on the shape.
            skipped = (row['Stop:Departure cancelled'] == 'true'
                       and row['Stop:Arrival cancelled'] == 'true')

            t = parse_minutes(row['Stop:Departure time'], day)
            delay = row['Stop:Departure delay']
            if t is None:
                t = parse_minutes(row['Stop:Arrival time'], day)
                delay = row['Stop:Arrival delay']
            if t is None:
                continue
            if skipped:
                delay = ''                    # no realised time to be late against
            try:
                d = float(delay) if delay else 0.0
            except ValueError:
                d = 0.0
            # A cross-border feed occasionally reports a whole day of delay when
            # the service date rolls over. Those are errors, not late trains.
            if abs(d) > 180:
                d = 0.0

            x, y = project(st['lat'], st['lon'])
            svc['stops'].append({'code': code, 'name': st['name'], 't': t, 'd': d, 'x': x, 'y': y})

    # Yesterday's services that were already finished by our midnight are not
    # part of this day at all.
    return {k: v for k, v in services.items()
            if v['stops'] and max(s['t'] for s in v['stops']) > 0}


def rdp(pts, eps):
    """Ramer-Douglas-Peucker. Routed track comes back at metre resolution;
    thinning it to ~80 m keeps every curve the eye can see and keeps the pack
    an eighth of the size."""
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if n < 1e-12:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / n
            if d > worst:
                worst, wi = d, k
        if worst > eps and wi > 0:
            keep[wi] = True
            stack.append((i, wi))
            stack.append((wi, j))
    return [p for p, k in zip(pts, keep) if k]


def route_geometry(seq, net, project, cache, counters):
    """The polyline a train actually follows: shortest path along real track
    between consecutive calling points. Falls back to a straight hop where the
    extract leaves two stations on disconnected fragments."""
    pts = []
    for i in range(len(seq) - 1):
        a, b = seq[i], seq[i + 1]
        key = (a['code'], b['code'])
        leg = cache.get(key)
        if leg is None:
            leg = None
            if net and net.ok:
                na, nb = net.node_of.get(a['code']), net.node_of.get(b['code'])
                if na and nb:
                    gap = math.hypot(b['x'] - a['x'], b['y'] - a['y'])
                    path = net.path(na, nb, max(25.0, gap * 2.5 + 15.0))
                    if path:
                        leg = [project(lat, lon) for lat, lon in path]
            if leg is None:
                leg = [(a['x'], a['y']), (b['x'], b['y'])]
                counters['straight'] += 1
            else:
                counters['routed'] += 1
            cache[key] = leg
        pts += leg if not pts else leg[1:]
    return rdp(pts, 0.08) if pts else pts


def stop_distances(g, seq):
    """Where each calling point falls along the routed polyline. Walking
    forward keeps the result monotonic even where a route doubles back on
    itself, which a nearest-point search would not."""
    pts, dist = g['pts'], g['dist']
    out = []
    at = 0
    for n, s in enumerate(seq):
        best, bi = None, at
        # the last stop is the end of the line; everything else is searched
        # forward from wherever the previous stop landed
        hi = len(pts) if n == len(seq) - 1 else len(pts)
        for i in range(at, hi):
            d = math.hypot(pts[i][0] - s['x'], pts[i][1] - s['y'])
            if best is None or d < best:
                best, bi = d, i
        out.append(dist[bi])
        at = bi
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


def build_day(services, label, sub, net, project, cache):
    """Turn services into the pack's geoms + trips."""
    geom_index = {}
    geoms = []
    trips = []
    kept = dropped = 0
    counters = {'routed': 0, 'straight': 0}

    for svc in services.values():
        stops = sorted(svc['stops'], key=lambda s: s['t'])
        # collapse repeated calls at the same station (reversals keep both)
        seq = [s for i, s in enumerate(stops) if i == 0 or s['code'] != stops[i - 1]['code']]
        if len(seq) < 2:
            dropped += 1
            continue

        # Monotonic planned times; a service that goes backwards in time is bad data.
        for i in range(1, len(seq)):
            if seq[i]['t'] < seq[i - 1]['t']:
                seq[i]['t'] = seq[i - 1]['t']

        key = tuple(s['code'] for s in seq)
        gi = geom_index.get(key)
        if gi is None:
            pts = route_geometry(seq, net, project, cache, counters)
            if len(pts) < 2:
                dropped += 1
                continue
            dist, total = [0.0], 0.0
            for i in range(1, len(pts)):
                total += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
                dist.append(total)
            if total < 0.5:
                dropped += 1
                continue
            gi = geom_index[key] = len(geoms)
            geoms.append({'pts': pts, 'dist': dist, 'stops': seq})
        g = geoms[gi]

        # Each stop's distance along the routed polyline, so the train's motion
        # follows the track rather than the chord between stations.
        stop_d = stop_distances(g, seq)

        cat = CAT_OF.get(svc['type'], 3)
        trips.append({
            'g': gi, 'cat': cat, 'name': svc['type'],
            'from': seq[0]['name'], 'to': seq[-1]['name'],
            'canc': svc['canc'], 'oper': svc['company'],
            't': [s['t'] for s in seq],
            'delay': [s['d'] for s in seq],
            'dist': stop_d,
        })
        kept += 1

    legs = counters['routed'] + counters['straight']
    pct = 100 * counters['straight'] / max(1, legs)
    print(f'  {label}: {kept} trips, {len(geoms)} routes ({dropped} dropped); '
          f'{legs} distinct legs, {pct:.1f}% straight-line fallback', file=sys.stderr)
    return encode_day(geoms, trips, label, sub)


def encode_day(geoms, trips, label, sub):
    """Delta-encode into the integer arrays the loader expects.
    geoms: flat [dx, dy, dDistance] * 100 triples per polyline.
    trips: [geomIdx, cat, name, from, to, cancelled, known, operator, t0,
            (dt, delay, dDistance) * stops]"""
    QX = QD = 100
    eg = []
    for g in geoms:
        flat, px, py, pd = [], 0, 0, 0
        for (x, y), d in zip(g['pts'], g['dist']):
            ix, iy, idd = round(x * QX), round(y * QX), round(d * QD)
            flat += [ix - px, iy - py, idd - pd]
            px, py, pd = ix, iy, idd
        eg.append(flat)

    et = []
    for tr in trips:
        row = [tr['g'], tr['cat'], tr['name'], tr['from'], tr['to'],
               1 if tr['canc'] else 0, 1, tr['oper'], round(tr['t'][0], 2)]
        pt, pd = tr['t'][0], 0
        for t, dly, d in zip(tr['t'], tr['delay'], tr['dist']):
            idd = round(d * QD)
            row += [round(t - pt, 2), round(dly, 2), idd - pd]
            pt, pd = t, idd
        et.append(row)

    return {'label': label, 'sub': sub, 'q': [QX, QD], 'geoms': eg, 'trips': et}


def build_states(path, project):
    """Province outlines, flattened to [x*10, y*10] integer rings."""
    gj = json.load(open(path, encoding='utf-8'))
    rings = []
    for feat in gj['features']:
        geom = feat['geometry']
        polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
        for poly in polys:
            for ring in poly:
                flat = []
                for lon, lat in ring:
                    x, y = project(lat, lon)
                    flat += [round(x * 10), round(y * 10)]
                if len(flat) >= 8:
                    rings.append(flat)
    return rings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ordinary', required=True)
    ap.add_argument('--bad', required=True)
    args = ap.parse_args()

    stations = load_stations(SRC / 'stations.csv')
    project, lat0, lon0 = make_projection(stations)
    print(f'{len(stations)} NL stations; projection centre {lat0:.4f}, {lon0:.4f}', file=sys.stderr)

    net = Network(str(SRC / 'rail.json'), lat0, stations)
    if net.ok:
        j, e, p = net.stats()
        print(f'track graph: {j} junctions, {e} edges, {p}/{len(stations)} stations pinned',
              file=sys.stderr)
    else:
        print('! no rail.json, routes will be straight lines between stations',
              file=sys.stderr)

    cache = {}
    days = {}
    for day, label, sub in [
        (args.ordinary, 'An ordinary day', None),
        (args.bad, 'A bad day', None),
    ]:
        month = day[:7]
        path = SRC / f'services-{month}.csv.gz'
        if not path.exists():
            sys.exit(f'missing {path}; run tools/fetch_nl.sh first')
        pretty = date.fromisoformat(day).strftime('%A %-d %B %Y')
        services = read_day(path, day, stations, project)
        days[day] = build_day(services, label, sub or pretty, net, project, cache)

    by_name = {s['name']: s for s in stations.values()}
    cities = {}
    for n in CITIES:
        s = by_name.get(n)
        if not s:
            print(f'  ! city not found: {n}', file=sys.stderr)
            continue
        x, y = project(s['lat'], s['lon'])
        cities[CITY_LABEL.get(n, n)] = [round(x, 1), round(y, 1)]

    pack = {
        'name': 'Netherlands',
        'key': 'nl',
        'main': 'NS',
        'late': 5,                       # the Dutch punctuality threshold
        'cats': CATS,
        'small': [CITY_LABEL.get(n, n) for n in SMALL],
        'states': build_states(SRC / 'provinces.geojson', project),
        'cities': cities,
        'days': days,
    }

    raw = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode()
    OUT.write_bytes(gzip.compress(raw, 9))
    print(f'wrote {OUT}: {len(raw)/1e6:.1f} MB raw, {OUT.stat().st_size/1e6:.2f} MB gzipped',
          file=sys.stderr)


if __name__ == '__main__':
    main()
