#!/usr/bin/env python3
"""Cut Wiener Linien's GTFS down to Vienna's U-Bahn and trams, one file per
service date.

Wiener Linien's live data cannot be read by a web page (it sends no CORS
header), so Vienna plays to its timetable. This script is run once a day by
.github/workflows/vienna.yml; it can also be run by hand:

    python3 tools/build_vienna.py                         # today and tomorrow
    python3 tools/build_vienna.py --zip gtfs.zip --dates 2026-10-02 2026-10-03

Kept: the U-Bahn (U1 to U6) and the trams. Left out: buses (hundreds of
routes), night buses, and the Badner Bahn, which runs out to Baden. Platforms
fold into their station (stop ids are at:<area>:<station>:<x>:<platform>).

Output, in data/vie/:
    YYYY-MM-DD.json   lines, stations and every trip running that day,
                      each as [trip id, line, direction, [station, arrival s, dwell s, ...]]
    index.json        the dates available, newest last
"""

import argparse, csv, io, json, os, sys, urllib.request, zipfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Vienna')
URL = 'https://www.wienerlinien.at/ogd_realtime/doku/ogd/gtfs/gtfs.zip'
KEEP_DAYS = 3

# Families: each U-Bahn line in its own colour, the trams in Wiener Linien red.
U_LINES = {'U1': ('#e3000f', 0), 'U2': ('#a762a4', 1), 'U3': ('#ee7d00', 2), 'U4': ('#319f49', 3),
           'U5': ('#008f95', 4), 'U6': ('#9d6930', 5)}
TRAM = 6
LEAVE_OUT = {'BB'}


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def secs(t):
    h, m, s = (int(v) for v in t.split(':'))
    return h * 3600 + m * 60 + s


def services_on(cal, extra, day):
    ymd, wd = day.strftime('%Y%m%d'), day.strftime('%A').lower()
    on = {r['service_id'] for r in cal if r['start_date'] <= ymd <= r['end_date'] and r[wd] == '1'}
    for r in extra:
        if r['date'] == ymd:
            (on.add if r['exception_type'] == '1' else on.discard)(r['service_id'])
    return on


def station_of(stop_id):
    """at:49:1664:0:4 -> at:49:1664, one station for all its platforms."""
    return ':'.join(stop_id.split(':')[:3])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'vie'))
    ap.add_argument('--dates', nargs='*')
    a = ap.parse_args()

    if a.zip:
        z = zipfile.ZipFile(a.zip)
    else:
        print(f'downloading {URL}', file=sys.stderr)
        z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL).read()))

    today = datetime.now(TZ).date()
    days = [date.fromisoformat(d) for d in a.dates] if a.dates else [today, today + timedelta(days=1)]
    os.makedirs(a.out, exist_ok=True)

    # Lines: route ids come per validity period; the short name is the line.
    lines, route_line = {}, {}
    for r in rows(z, 'routes.txt'):
        name = r['route_short_name'].strip()
        if name in LEAVE_OUT:
            continue
        if r['route_type'] == '1' and name in U_LINES:
            col, fam = U_LINES[name]
            lines[name] = [name, col, fam]
        elif r['route_type'] == '0':
            lines[name] = [f'Tram {name}', '#c4161c', TRAM]
        else:
            continue
        route_line[r['route_id']] = name

    cal = list(rows(z, 'calendar.txt'))
    extra = list(rows(z, 'calendar_dates.txt'))
    on = {d: services_on(cal, extra, d) for d in days}
    wanted = set().union(*on.values())
    trips = {t['trip_id']: t for t in rows(z, 'trips.txt')
             if t['route_id'] in route_line and t['service_id'] in wanted}
    print(f'{len(lines)} lines, {len(trips)} trips on the days asked for', file=sys.stderr)

    # Every stop time of those trips, in one pass over the big file.
    times = {}
    for r in rows(z, 'stop_times.txt'):
        if r['trip_id'] in trips:
            times.setdefault(r['trip_id'], []).append((int(r['stop_sequence']), r['stop_id'], r['arrival_time'], r['departure_time']))

    stops = {}
    for r in rows(z, 'stops.txt'):
        stops[r['stop_id']] = r
    # A station sits in the middle of its platforms.
    acc = {}
    for s in stops.values():
        c = station_of(s['stop_id'])
        a_ = acc.setdefault(c, [s['stop_name'].strip(), 0.0, 0.0, 0])
        a_[1] += float(s['stop_lat']); a_[2] += float(s['stop_lon']); a_[3] += 1

    for day in days:
        st_index, stations, out = {}, [], []
        for tid, t in trips.items():
            if t['service_id'] not in on[day] or tid not in times:
                continue
            flat, last = [], None
            for seq, sid, arr, dep in sorted(times[tid]):
                c = station_of(sid)
                if c == last:
                    continue
                last = c
                if c not in st_index:
                    n, la, lo, k = acc[c]
                    st_index[c] = len(stations)
                    stations.append([c, n, round(la / k, 6), round(lo / k, 6)])
                ta, td = secs(arr), secs(dep)
                flat += [st_index[c], ta, td - ta]
            if len(flat) >= 6:
                out.append([tid, route_line[t['route_id']], int(t.get('direction_id') or 0), flat])
        out.sort(key=lambda t: t[3][1])
        data = {'date': day.isoformat(), 'tz': 'Europe/Vienna', 'lines': lines, 'stations': stations, 'trips': out}
        path = os.path.join(a.out, day.isoformat() + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{day}: {len(out)} trips, {len(stations)} stations, {os.path.getsize(path) // 1024} KB', file=sys.stderr)

    have = sorted(f[:-5] for f in os.listdir(a.out) if f[:4].isdigit() and f.endswith('.json'))
    cutoff = (today - timedelta(days=KEEP_DAYS - 1)).isoformat()
    for d in have:
        if d < cutoff:
            os.remove(os.path.join(a.out, d + '.json'))
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        json.dump({'dates': [d for d in have if d >= cutoff]}, f)


if __name__ == '__main__':
    main()
