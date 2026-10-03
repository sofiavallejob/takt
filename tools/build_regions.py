#!/usr/bin/env python3
"""Map outlines for a live city network, from geoBoundaries (simplified),
cropped to a box around the city.

    python3 tools/build_regions.py oslo
    python3 tools/build_regions.py vienna

Writes data/<name>-regions.json in the same form as the other outline files:
{ source, rings: [[lon, lat, lon, lat, ...], ...] }.
Run by hand when the outlines need refreshing; they hardly ever change.
"""

import json, math, os, sys, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
API = 'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{adm}/'

JOBS = {
    'oslo': {'iso': 'NOR', 'adm': 'ADM2', 'box': (10.30, 59.78, 11.10, 60.08),
             'source': 'geoBoundaries NOR ADM2 (municipalities, CC BY 4.0), cropped to Oslo'},
    'vienna': {'iso': 'AUT', 'adm': 'ADM3', 'box': (16.15, 48.08, 16.62, 48.34),
               'source': 'geoBoundaries AUT ADM3 (municipalities and districts, CC BY-SA 2.0), cropped to Vienna'},
}


def thin(ring, km=0.06):
    out = [ring[0]]
    for x, y in ring[1:]:
        px, py = out[-1]
        if math.hypot((x - px) * 111.32 * math.cos(math.radians(y)), (y - py) * 110.57) >= km:
            out.append((x, y))
    return out if len(out) >= 4 else []


def rings_of(geom):
    if geom['type'] == 'Polygon':
        return geom['coordinates']
    if geom['type'] == 'MultiPolygon':
        return [r for poly in geom['coordinates'] for r in poly]
    return []


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else ''
    if name not in JOBS:
        sys.exit(f'usage: build_regions.py {"|".join(JOBS)}')
    job = JOBS[name]
    meta = json.load(urllib.request.urlopen(API.format(iso=job['iso'], adm=job['adm'])))
    print(f'{name}: downloading {meta["simplifiedGeometryGeoJSON"]}', file=sys.stderr)
    gj = json.load(urllib.request.urlopen(meta['simplifiedGeometryGeoJSON']))
    x0, y0, x1, y1 = job['box']
    out = []
    for f in gj['features']:
        for ring in rings_of(f['geometry']):
            xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
            if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
                continue
            t = thin([(p[0], p[1]) for p in ring])
            if t:
                out.append([v for x, y in t for v in (round(x, 4), round(y, 4))])
    path = os.path.join(OUT, f'{name}-regions.json')
    with open(path, 'w') as f:
        json.dump({'source': job['source'], 'rings': out}, f, separators=(',', ':'))
    print(f'{path}: {len(out)} rings, {os.path.getsize(path) // 1024} KB', file=sys.stderr)


if __name__ == '__main__':
    main()
