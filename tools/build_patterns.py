#!/usr/bin/env python3
"""Stopping patterns for the live networks that are placed from where their
vehicles are, not matched to a day's timetable: the New York subway and Los
Angeles Metro (rail and bus).

A pattern is one sequence of stations a line runs, with the typical minutes
between them and how many trips run it. The live page lays every vehicle onto
the pattern it is on. Patterns change only with a new service plan, so this
is run by hand now and then, and monthly by .github/workflows/patterns.yml:

    python3 tools/build_patterns.py nyc
    python3 tools/build_patterns.py la
    python3 tools/build_patterns.py nyc --zip gtfs_subway.zip      # from a local copy

Writes data/<city>/patterns.json:
    families   [name, colour] that colour the dots and group the Strings panel
    lines      line -> [name, colour, family]
    stations   [code, name, lat, lon]
    stop       stop id in the live feed -> station index
    routes     route id in the live feed -> line
    patterns   [line, direction, [station index...], [minutes from the first...], trips]
"""

import argparse, csv, io, json, math, os, sys, urllib.request, zipfile
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')

# New York: lines by trunk, coloured as the MTA colours them. Express variants
# run on their line's string.
NYC_FAMILIES = [
    ('1 2 3', '#d82233'), ('4 5 6', '#009952'), ('7', '#9a38a1'), ('A C E', '#0062cf'),
    ('B D F M', '#eb6800'), ('G', '#799534'), ('J Z', '#8e5c33'), ('L', '#7c858c'),
    ('N Q R W', '#d9a400'), ('Shuttles', '#5f6670'), ('Staten Island Railway', '#08179c'),
]
NYC_FAMILY = {'1': 0, '2': 0, '3': 0, '4': 1, '5': 1, '6': 1, '7': 2, 'A': 3, 'C': 3, 'E': 3,
              'B': 4, 'D': 4, 'F': 4, 'M': 4, 'G': 5, 'J': 6, 'Z': 6, 'L': 7,
              'N': 8, 'Q': 8, 'R': 8, 'W': 8, 'GS': 9, 'FS': 9, 'H': 9, 'SI': 10}
NYC_ALIAS = {'FX': 'F', '6X': '6', '7X': '7'}
NYC_NAMES = {'GS': '42 St Shuttle', 'FS': 'Franklin Av Shuttle', 'H': 'Rockaway Park Shuttle',
             'SI': 'Staten Island Railway'}

# Los Angeles: each rail line in its own colour; the buses in one.
LA_RAIL = {'801': 'A', '802': 'B', '803': 'C', '804': 'E', '805': 'D', '807': 'K'}
LA_FAMILIES = [('A Line', '#0072bc'), ('B Line', '#eb131b'), ('C Line', '#58a738'), ('D Line', '#a05da5'),
               ('E Line', '#e0a200'), ('K Line', '#e56db1'), ('Bus', '#8a8f98')]

CITIES = {
    'nyc': {'feeds': [('subway', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip')]},
    'la': {'feeds': [('rail', 'https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip'),
                     ('bus', 'https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip')]},
}


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def secs(t):
    h, m, s = (int(v) for v in t.strip().split(':'))
    return h * 3600 + m * 60 + s


def km(a, b):
    return math.hypot((a[1] - b[1]) * 111.32 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 110.57)


class Stations:
    def __init__(self):
        self.list, self.index, self.by_name, self.stop = [], {}, {}, {}

    def add(self, code, name, lat, lon):
        if code not in self.index:
            self.index[code] = len(self.list)
            self.list.append([code, name, round(lat, 6), round(lon, 6)])
        return self.index[code]

    def near(self, prefix, stop, metres):
        """Stops with the same name within `metres` are one station: a bus
        stop has one on each side of the street."""
        name, ll = stop['stop_name'].strip(), (float(stop['stop_lat']), float(stop['stop_lon']))
        for code in self.by_name.get(name, []):
            s = self.list[self.index[code]]
            if km(ll, (s[2], s[3])) * 1000 < metres:
                return self.index[code]
        code = prefix + stop['stop_id']
        self.by_name.setdefault(name, []).append(code)
        return self.add(code, name, *ll)


def line_of(city, kind, route):
    """(line key, name, colour, family) for a route, or None to leave it out."""
    rid = route['route_id']
    if city == 'nyc':
        key = NYC_ALIAS.get(rid, rid)
        if key not in NYC_FAMILY:
            return None
        fam = NYC_FAMILY[key]
        return key, NYC_NAMES.get(key, f'{key} train'), NYC_FAMILIES[fam][1], fam
    if kind == 'rail':
        key = LA_RAIL.get(rid)
        if not key:
            return None
        fam = 'ABCDEK'.index(key)
        return key, f'{key} Line', LA_FAMILIES[fam][1], fam
    key = route['route_short_name'].strip() or rid.split('-')[0]
    return key, f'Bus {key}', LA_FAMILIES[6][1], 6


def build(city, zips):
    st = Stations()
    lines, route_line, pats = {}, {}, defaultdict(lambda: {'n': 0, 'mins': None})
    for kind, z in zips:
        stops = {r['stop_id']: r for r in rows(z, 'stops.txt')}
        routes = {}
        for r in rows(z, 'routes.txt'):
            l = line_of(city, kind, r)
            if l:
                routes[r['route_id']] = l
                route_line[r['route_id']] = l[0]
                lines[l[0]] = [l[1], l[2], l[3]]
        trips = {t['trip_id']: (routes[t['route_id']][0], int(t.get('direction_id') or 0))
                 for t in rows(z, 'trips.txt') if t['route_id'] in routes}

        def station(stop_id):
            s = stops[stop_id]
            if kind == 'bus':
                return st.near('B:', s, 150)
            p = stops.get(s.get('parent_station')) or s
            return st.add(p['stop_id'], p['stop_name'].strip(), float(p['stop_lat']), float(p['stop_lon']))

        def finish(tid, seq):
            if tid not in trips or len(seq) < 2:
                return
            seq.sort(key=lambda r: r[0])
            codes, times = [], []
            for _, stop_id, t in seq:
                si = station(stop_id)
                st.stop[stop_id] = si
                if codes and codes[-1] == si:
                    continue
                codes.append(si); times.append(t)
            if len(codes) < 2:
                return
            line, d = trips[tid]
            p = pats[(line, d, tuple(codes))]
            p['n'] += 1
            if p['mins'] is None:
                p['mins'] = [round((t - times[0]) / 60, 1) for t in times]

        # stop_times is grouped by trip in both feeds: one pass, one trip at a time.
        cur, seq = None, []
        for r in rows(z, 'stop_times.txt'):
            if r['trip_id'] != cur:
                finish(cur, seq)
                cur, seq = r['trip_id'], []
            if cur in trips:
                seq.append((int(r['stop_sequence']), r['stop_id'], secs(r['arrival_time'] or r['departure_time'])))
        finish(cur, seq)
        print(f'{city}/{kind}: {len(routes)} routes, {len(trips)} trips', file=sys.stderr)

    # Rare patterns (a single trip a week) are noise; keep them only where a
    # line and direction would otherwise have nothing.
    best = defaultdict(int)
    for (line, d, _), p in pats.items():
        best[(line, d)] = max(best[(line, d)], p['n'])
    out = [[line, d, list(codes), p['mins'], p['n']] for (line, d, codes), p in pats.items()
           if p['n'] >= 3 or p['n'] == best[(line, d)]]
    out.sort(key=lambda p: (p[0], p[1], -p[4]))

    # Only the stations and stop ids some kept pattern uses.
    used = sorted({i for p in out for i in p[2]})
    remap = {old: new for new, old in enumerate(used)}
    for p in out:
        p[2] = [remap[i] for i in p[2]]
    families = NYC_FAMILIES if city == 'nyc' else LA_FAMILIES
    return {
        'city': city,
        'families': [list(f) for f in families],
        'lines': lines,
        'stations': [st.list[i] for i in used],
        'stop': {s: remap[i] for s, i in st.stop.items() if i in remap},
        'routes': route_line,
        'patterns': out,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('city', choices=CITIES)
    ap.add_argument('--zip', nargs='*', help='local copies of the feeds, in the order they are listed')
    a = ap.parse_args()
    feeds = CITIES[a.city]['feeds']
    zips = []
    for i, (kind, url) in enumerate(feeds):
        if a.zip and i < len(a.zip):
            zips.append((kind, zipfile.ZipFile(a.zip[i])))
        else:
            print(f'downloading {url}', file=sys.stderr)
            zips.append((kind, zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read()))))
    data = build(a.city, zips)
    os.makedirs(os.path.join(OUT, a.city), exist_ok=True)
    path = os.path.join(OUT, a.city, 'patterns.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{path}: {len(data["lines"])} lines, {len(data["patterns"])} patterns, '
          f'{len(data["stations"])} stations, {os.path.getsize(path) // 1024} KB', file=sys.stderr)


if __name__ == '__main__':
    main()
