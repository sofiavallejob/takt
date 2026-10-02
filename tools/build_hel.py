#!/usr/bin/env python3
"""Cut HSL's GTFS feed down to the Helsinki metro and trams, one file per
service date.

The live feed (HSL's HFP over MQTT) names a journey by its route, direction,
operating day and start time, so the page needs that day's timetable to know
which stops a vehicle will pass. This script is run once a day by
.github/workflows/helsinki.yml; it can also be run by hand:

    curl -LO https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip
    python3 tools/build_hel.py --zip hsl.zip                    # today and tomorrow
    python3 tools/build_hel.py --zip hsl.zip --dates 2026-10-02

Output, in data/hel/:
    YYYY-MM-DD.json   stations and every metro and tram trip running that day
    index.json        the dates available, newest last
"""

import argparse, csv, io, json, math, os, re, sys, zipfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# GTFS route types: 0 tram, 1 metro, 900 light rail (Raide-Jokeri, line 15).
KINDS = {'0': 'tram', '900': 'tram', '1': 'metro'}
KEEP_DAYS = 3
MERGE_M = 400      # stops with one name closer than this are one station


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def secs(t):
    h, m, s = (int(v) for v in t.split(':'))
    return h * 3600 + m * 60 + s


def services_on(z, day):
    ymd, wd = day.strftime('%Y%m%d'), day.strftime('%A').lower()
    on = set()
    for r in rows(z, 'calendar.txt'):
        if r['start_date'] <= ymd <= r['end_date'] and r[wd] == '1':
            on.add(r['service_id'])
    for r in rows(z, 'calendar_dates.txt'):
        if r['date'] == ymd:
            (on.add if r['exception_type'] == '1' else on.discard)(r['service_id'])
    return on


def line_of(short):
    """Variants share their line's string: 1H, 1T and 9N are line 1 and 9, M1B is M1."""
    m = re.match(r'^(M\d|\d+)', short)
    return m.group(1) if m else short


def metres(a, b):
    dx = (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, (a[0] - b[0]) * 110570)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'hel'))
    ap.add_argument('--dates', nargs='*')
    a = ap.parse_args()

    today = datetime.now(ZoneInfo('Europe/Helsinki')).date()
    days = [date.fromisoformat(d) for d in a.dates] if a.dates else [today, today + timedelta(days=1)]
    os.makedirs(a.out, exist_ok=True)
    z = zipfile.ZipFile(a.zip)
    feed = next(rows(z, 'feed_info.txt'), {}).get('feed_version', '')

    routes = {r['route_id']: (line_of(r['route_short_name']), KINDS[r['route_type']])
              for r in rows(z, 'routes.txt') if r['route_type'] in KINDS}
    ons = {d: services_on(z, d) for d in days}
    every = set().union(*ons.values())
    trips_all = {r['trip_id']: r for r in rows(z, 'trips.txt')
                 if r['route_id'] in routes and r['service_id'] in every}
    print(f'{len(routes)} metro and tram routes, {len(trips_all)} trips on these days', file=sys.stderr)

    times = {}
    for r in rows(z, 'stop_times.txt'):
        if r['trip_id'] in trips_all:
            times.setdefault(r['trip_id'], []).append(r)

    # Tram stops come in pairs, one each side of the street, and a metro
    # station has a platform per track: one name close together is one station.
    # A tram stop at a metro station is named "Itäkeskus (M)": the same place.
    used = {r['stop_id'] for ts in times.values() for r in ts}
    stops = {r['stop_id']: r for r in rows(z, 'stops.txt') if r['stop_id'] in used}
    station_of, clusters = {}, {}
    for sid, s in sorted(stops.items()):
        pos = (float(s['stop_lat']), float(s['stop_lon']))
        name = re.sub(r'\s*\(M\)$', '', s['stop_name'])
        cl = clusters.setdefault(name, [])
        for c in cl:
            if metres(c['pos'], pos) < MERGE_M:
                c['members'].append(pos)
                break
        else:
            c = {'code': f"{name}#{len(cl)}" if cl else name, 'pos': pos, 'members': [pos]}
            cl.append(c)
        station_of[sid] = c
    for cl in clusters.values():
        for c in cl:
            n = len(c['members'])
            c['pos'] = (sum(p[0] for p in c['members']) / n, sum(p[1] for p in c['members']) / n)

    written = []
    for day in days:
        on = ons[day]
        st_index, stations, trips = {}, [], []
        for tid, t in trips_all.items():
            if t['service_id'] not in on or tid not in times:
                continue
            ts = sorted(times[tid], key=lambda r: int(r['stop_sequence']))
            flat = []
            for r in ts:
                c = station_of[r['stop_id']]
                if c['code'] not in st_index:
                    st_index[c['code']] = len(stations)
                    stations.append([c['code'], c['code'].split('#')[0],
                                     round(c['pos'][0], 6), round(c['pos'][1], 6)])
                arr, dep = secs(r['arrival_time']), secs(r['departure_time'])
                flat += [st_index[c['code']], arr, dep - arr]
            start = secs(ts[0]['departure_time'])
            # The live feed's name for this journey: route, direction 1 or 2, start time.
            key = f"{t['route_id']}/{int(t['direction_id'] or 0) + 1}/{start // 3600:02d}:{start % 3600 // 60:02d}"
            line, kind = routes[t['route_id']]
            trips.append([key, line, kind, flat])
        trips.sort(key=lambda t: t[3][1])
        out = {'date': day.isoformat(), 'feed': feed, 'tz': 'Europe/Helsinki',
               'stations': stations, 'trips': trips}
        path = os.path.join(a.out, day.isoformat() + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{day}: {len(trips)} trips, {len(stations)} stations, {os.path.getsize(path) // 1024} KB',
              file=sys.stderr)
        written.append(day.isoformat())

    have = sorted(f[:-5] for f in os.listdir(a.out) if f[:4].isdigit() and f.endswith('.json'))
    cutoff = (today - timedelta(days=KEEP_DAYS - 1)).isoformat()
    for d in have:
        if d < cutoff:
            os.remove(os.path.join(a.out, d + '.json'))
    have = [d for d in have if d >= cutoff]
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        json.dump({'dates': have, 'feed': feed}, f)


if __name__ == '__main__':
    main()
