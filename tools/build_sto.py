#!/usr/bin/env python3
"""Cut the national GTFS Sweden 3 feed down to the Stockholm metro and trams,
one file per service date.

The live feed (GTFS Sweden 3 Realtime) names trips by the ids in the static
feed of the same day, so the page needs that day's timetable. This script is
run once a day by .github/workflows/stockholm.yml; it can also be run by hand:

    python3 tools/build_sto.py --zip sweden.zip                 # today and tomorrow
    python3 tools/build_sto.py --zip sweden.zip --dates 2026-10-01 2026-10-02

Output, in data/sto/:
    YYYY-MM-DD.json   stations, lines and every metro and tram trip running that day
    index.json        the dates available, newest last
"""

import argparse, csv, io, json, os, sys, zipfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

METRO_LINES = {'10': 'blue', '11': 'blue', '13': 'red', '14': 'red',
               '17': 'green', '18': 'green', '19': 'green'}
# Spårväg City, Nockebybanan, Lidingöbanan, Tvärbanan.
TRAM_LINES = {'7', '12', '21', '30', '31'}
SL_AGENCY = '505000000000000001'


def is_tram(route_type):
    """Plain GTFS says 0 for a tram; the extended types Samtrafiken uses say 900-906."""
    return route_type == '0' or (len(route_type) == 3 and route_type.startswith('9'))
KEEP_DAYS = 3


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def secs(t):
    h, m, s = (int(v) for v in t.split(':'))
    return h * 3600 + m * 60 + s


def services_on(z, day):
    """service_ids running on `day`, from calendar.txt and its exceptions."""
    ymd, wd = day.strftime('%Y%m%d'), day.strftime('%A').lower()
    on = set()
    for r in rows(z, 'calendar.txt'):
        if r['start_date'] <= ymd <= r['end_date'] and r[wd] == '1':
            on.add(r['service_id'])
    for r in rows(z, 'calendar_dates.txt'):
        if r['date'] != ymd:
            continue
        (on.add if r['exception_type'] == '1' else on.discard)(r['service_id'])
    return on


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'sto'))
    ap.add_argument('--dates', nargs='*')
    a = ap.parse_args()

    today = datetime.now(ZoneInfo('Europe/Stockholm')).date()
    days = [date.fromisoformat(d) for d in a.dates] if a.dates else [today, today + timedelta(days=1)]
    os.makedirs(a.out, exist_ok=True)
    z = zipfile.ZipFile(a.zip)
    feed = next(rows(z, 'feed_info.txt'), {}).get('feed_version', '')

    routes = {}
    for r in rows(z, 'routes.txt'):
        if r['agency_id'] != SL_AGENCY:
            continue
        name = r['route_short_name']
        if (r['route_type'] == '401' and name in METRO_LINES) or (is_tram(r['route_type']) and name in TRAM_LINES):
            routes[r['route_id']] = name
    trips_all = {r['trip_id']: r for r in rows(z, 'trips.txt') if r['route_id'] in routes}
    print(f'{len(routes)} metro and tram routes ({", ".join(sorted(set(routes.values()), key=int))}), '
          f'{len(trips_all)} trips in the feed', file=sys.stderr)

    # Every stop time of every metro and tram trip, read once for all dates.
    times = {}
    for r in rows(z, 'stop_times.txt'):
        if r['trip_id'] in trips_all:
            times.setdefault(r['trip_id'], []).append(r)

    stops = {}
    for r in rows(z, 'stops.txt'):
        stops[r['stop_id']] = r
    def station(stop_id):
        s = stops[stop_id]
        return stops[s['parent_station']] if s.get('parent_station') else s

    written = []
    for day in days:
        on = services_on(z, day)
        st_index, stations, trips = {}, [], []
        for tid, t in trips_all.items():
            if t['service_id'] not in on or tid not in times:
                continue
            flat = []
            for r in sorted(times[tid], key=lambda r: int(r['stop_sequence'])):
                s = station(r['stop_id'])
                if s['stop_id'] not in st_index:
                    st_index[s['stop_id']] = len(stations)
                    stations.append([s['stop_id'], s['stop_name'],
                                     round(float(s['stop_lat']), 6), round(float(s['stop_lon']), 6)])
                arr, dep = secs(r['arrival_time']), secs(r['departure_time'])
                flat += [st_index[s['stop_id']], arr, dep - arr, int(r['stop_sequence'])]
            trips.append([tid, routes[t['route_id']], int(t.get('direction_id') or 0), flat])
        trips.sort(key=lambda t: t[3][1])
        out = {'date': day.isoformat(), 'feed': feed, 'tz': 'Europe/Stockholm',
               'stations': stations, 'trips': trips}
        path = os.path.join(a.out, day.isoformat() + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{day}: {len(trips)} trips, {len(stations)} stations, {os.path.getsize(path) // 1024} KB',
               file=sys.stderr)
        written.append(day.isoformat())

    # Keep a few days, so a page loaded just after midnight still finds yesterday.
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
