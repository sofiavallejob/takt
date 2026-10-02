#!/usr/bin/env python3
"""Cut 511.org's GTFS for BART and Muni down to the rail lines of San
Francisco, one file per service date.

The live feeds (511 GTFS Realtime) name trips by the ids in the static feeds,
so the page needs the day's timetable. This script is run once a day by
.github/workflows/sanfrancisco.yml; it can also be run by hand:

    python3 tools/build_sf.py --key YOUR_511_TOKEN          # today and tomorrow
    python3 tools/build_sf.py --sf-zip sf.zip --ba-zip ba.zip --dates 2026-10-02

Kept: every BART line; Muni Metro (J K L M N T), the F streetcar and the three
cable cars. Muni's surface stops have one stop per direction, a street apart;
stops with the same name within 300 m are one station, so both directions run
along one string.

Output, in data/sf/:
    YYYY-MM-DD.json   stations, lines and every trip running that day
    index.json        the dates available, newest last
"""

import argparse, csv, io, json, math, os, sys, urllib.request, zipfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Los_Angeles')
FEEDS = 'https://api.511.org/transit/datafeeds?api_key={key}&operator_id={op}'
KEEP_DAYS = 3

# Families: what colours the dots and groups the Strings panel.
BART, METRO, STREETCAR, CABLE = 0, 1, 2, 3
MUNI = {'J': METRO, 'K': METRO, 'L': METRO, 'M': METRO, 'N': METRO, 'T': METRO, 'S': METRO,
        'F': STREETCAR, 'PH': CABLE, 'PM': CABLE, 'CA': CABLE}
MUNI_NAMES = {'F': 'F Market & Wharves', 'PH': 'Powell-Hyde cable car', 'PM': 'Powell-Mason cable car',
              'CA': 'California St cable car'}
# BART's yellow is unreadable on a light map; the rest are the official colours.
COLOUR_FIX = {'FFFF33': 'D9B300'}


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


def clean(name):
    """One name for both platforms of a Muni station: the feed calls them
    'Metro Powell Station/Downtown' and 'Metro Powell Station/Outbound'."""
    n = name.strip()
    for cut in ('/Downtown', '/Downtn', '/Outbound', '/Outbd', '/Inbound', ' Outbound', ' Inbound', ' Northbound', ' Southbound'):
        if n.endswith(cut):
            n = n[:-len(cut)]
    if n.startswith('Metro '):
        n = n[6:]
    return n.strip()


def km(a, b):
    return math.hypot((a[1] - b[1]) * 111.32 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 110.57)


class Stations:
    """Station codes shared by both agencies. BART platforms fold into their
    parent station; Muni stops fold by name and distance."""

    def __init__(self):
        self.list, self.index, self.by_name = [], {}, {}

    def add(self, code, name, lat, lon):
        if code not in self.index:
            self.index[code] = len(self.list)
            self.list.append([code, name, round(lat, 6), round(lon, 6)])
        return self.index[code]

    def muni(self, stop):
        name, ll = clean(stop['stop_name']), (float(stop['stop_lat']), float(stop['stop_lon']))
        for code in self.by_name.get(name, []):
            s = self.list[self.index[code]]
            if km(ll, (s[2], s[3])) < 0.3:
                return self.index[code]
        code = 'SF:' + stop['stop_id']
        self.by_name.setdefault(name, []).append(code)
        return self.add(code, name, *ll)


def load(zpath_or_bytes):
    return zipfile.ZipFile(io.BytesIO(zpath_or_bytes) if isinstance(zpath_or_bytes, bytes) else zpath_or_bytes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--key', default=os.environ.get('SF_511_KEY'))
    ap.add_argument('--sf-zip'); ap.add_argument('--ba-zip')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'sf'))
    ap.add_argument('--dates', nargs='*')
    a = ap.parse_args()

    def feed(op, path):
        if path:
            return load(path)
        if not a.key:
            sys.exit('need --key (or SF_511_KEY) or --sf-zip/--ba-zip')
        return load(urllib.request.urlopen(FEEDS.format(key=a.key, op=op)).read())
    zs = {'SF': feed('SF', a.sf_zip), 'BA': feed('BA', a.ba_zip)}

    today = datetime.now(TZ).date()
    days = [date.fromisoformat(d) for d in a.dates] if a.dates else [today, today + timedelta(days=1)]
    os.makedirs(a.out, exist_ok=True)

    # Lines, per agency: line key -> [name, colour, family].
    lines, route_line = {}, {}
    for r in rows(zs['BA'], 'routes.txt'):
        if r['route_type'] != '1':
            continue
        key = r['route_id'].split('-')[0]                # Orange-N and Orange-S are one line
        col = COLOUR_FIX.get(r['route_color'].upper(), r['route_color'].upper())
        lines[key] = [f'BART {key}', '#' + col, BART]
        route_line[('BA', r['route_id'])] = key
    for r in rows(zs['SF'], 'routes.txt'):
        if r['route_id'] not in MUNI:
            continue
        key = r['route_id']
        lines[key] = [MUNI_NAMES.get(key, f'{key} {r["route_long_name"].title()}'), '#' + r['route_color'].upper(), MUNI[key]]
        route_line[('SF', key)] = key

    trips_all, times, stops = {}, {}, {}
    for ag, z in zs.items():
        for t in rows(z, 'trips.txt'):
            if (ag, t['route_id']) in route_line:
                trips_all[(ag, t['trip_id'])] = t
        for r in rows(z, 'stop_times.txt'):
            if (ag, r['trip_id']) in trips_all:
                times.setdefault((ag, r['trip_id']), []).append(r)
        stops[ag] = {r['stop_id']: r for r in rows(z, 'stops.txt')}
    print(f'{len(lines)} lines, {len(trips_all)} trips in the feeds', file=sys.stderr)

    feed_version = ' / '.join(next(rows(z, 'feed_info.txt'), {}).get('feed_version', '') for z in zs.values())
    written = []
    for day in days:
        on = {ag: services_on(z, day) for ag, z in zs.items()}
        st = Stations()
        platforms, trips = {}, []
        for (ag, tid), t in trips_all.items():
            if t['service_id'] not in on[ag] or (ag, tid) not in times:
                continue
            flat = []
            for r in sorted(times[(ag, tid)], key=lambda r: int(r['stop_sequence'])):
                s = stops[ag][r['stop_id']]
                if ag == 'BA':
                    p = stops['BA'].get(s.get('parent_station')) or s
                    si = st.add('BA:' + p['stop_id'], p['stop_name'], float(p['stop_lat']), float(p['stop_lon']))
                    platforms[r['stop_id']] = si
                else:
                    si = st.muni(s)
                arr, dep = secs(r['arrival_time']), secs(r['departure_time'])
                flat += [si, arr, dep - arr, int(r['stop_sequence'])]
            trips.append([f'{ag}:{tid}', route_line[(ag, t['route_id'])], int(t.get('direction_id') or 0), flat])
        trips.sort(key=lambda t: t[3][1])
        out = {'date': day.isoformat(), 'feed': feed_version, 'tz': 'America/Los_Angeles',
               'lines': lines, 'stations': st.list, 'platforms': platforms, 'trips': trips}
        path = os.path.join(a.out, day.isoformat() + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{day}: {len(trips)} trips, {len(st.list)} stations, {os.path.getsize(path) // 1024} KB', file=sys.stderr)
        written.append(day.isoformat())

    # Keep a few days, so a page loaded just after midnight still finds yesterday.
    have = sorted(f[:-5] for f in os.listdir(a.out) if f[:4].isdigit() and f.endswith('.json'))
    cutoff = (today - timedelta(days=KEEP_DAYS - 1)).isoformat()
    for d in have:
        if d < cutoff:
            os.remove(os.path.join(a.out, d + '.json'))
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        json.dump({'dates': [d for d in have if d >= cutoff], 'feed': feed_version}, f)


if __name__ == '__main__':
    main()
