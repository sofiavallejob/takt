#!/usr/bin/env python3
"""Map outlines for the United States live networks, from the US Census
Bureau's cartographic boundary files (public domain). These are clipped to the
shoreline, so the harbour and the bay read as water.

    python3 tools/build_us_regions.py

Writes:
    data/bos-regions.json   Massachusetts towns around Boston (county subdivisions)
    data/sf-regions.json    Bay Area counties
    data/nyc-regions.json   New York and New Jersey towns around New York City
    data/la-regions.json    cities around Los Angeles

Run by hand when the outlines need refreshing; they hardly ever change.
"""

import io, json, math, os, struct, sys, urllib.request, zipfile

OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
CB = 'https://www2.census.gov/geo/tiger/GENZ2023/shp/'

JOBS = [
    {'out': 'bos-regions.json', 'zip': ['cb_2023_25_cousub_500k.zip'], 'state': '25',
     'box': (-71.40, 42.12, -70.80, 42.58),
     'source': 'US Census Bureau cartographic boundaries 2023, Massachusetts county subdivisions (public domain), cropped to Boston'},
    {'out': 'sf-regions.json', 'zip': ['cb_2023_us_county_500k.zip'], 'state': '06',
     'box': (-122.75, 37.15, -121.55, 38.25),
     'source': 'US Census Bureau cartographic boundaries 2023, California counties (public domain), cropped to the Bay Area'},
    {'out': 'nyc-regions.json', 'zip': ['cb_2023_36_cousub_500k.zip', 'cb_2023_34_cousub_500k.zip'], 'state': ('36', '34'),
     'box': (-74.30, 40.47, -73.68, 40.95),
     'source': 'US Census Bureau cartographic boundaries 2023, New York and New Jersey county subdivisions (public domain), cropped to New York City'},
    {'out': 'la-regions.json', 'zip': ['cb_2023_06_place_500k.zip'], 'state': '06',
     'box': (-118.70, 33.68, -117.75, 34.36),
     'source': 'US Census Bureau cartographic boundaries 2023, California places (public domain), cropped to Los Angeles'},
]


def read_dbf(b):
    """Records of a dBASE file, as dicts of stripped strings."""
    n, hlen, rlen = struct.unpack('<IHH', b[4:12])
    fields, p = [], 32
    while b[p] != 0x0D:
        name = b[p:p + 11].split(b'\0')[0].decode()
        fields.append((name, b[p + 16]))
        p += 32
    out = []
    for i in range(n):
        r, q, rec = hlen + i * rlen + 1, 0, {}
        for name, size in fields:
            rec[name] = b[r + q:r + q + size].decode('latin-1').strip()
            q += size
        out.append(rec)
    return out


def read_shp(b):
    """Polygons of a shapefile, each a list of rings of (lon, lat)."""
    p, shapes = 100, []
    while p < len(b):
        _, clen = struct.unpack('>II', b[p:p + 8])
        body = b[p + 8:p + 8 + clen * 2]
        p += 8 + clen * 2
        if struct.unpack('<i', body[:4])[0] != 5:
            shapes.append([])
            continue
        nparts, npts = struct.unpack('<ii', body[36:44])
        parts = list(struct.unpack(f'<{nparts}i', body[44:44 + 4 * nparts])) + [npts]
        base = 44 + 4 * nparts
        pts = [struct.unpack('<dd', body[base + 16 * k:base + 16 * k + 16]) for k in range(npts)]
        shapes.append([pts[parts[i]:parts[i + 1]] for i in range(nparts)])
    return shapes


def thin(ring, km=0.08):
    """Drop points closer than `km` to the last one kept."""
    out = [ring[0]]
    for x, y in ring[1:]:
        px, py = out[-1]
        if math.hypot((x - px) * 111.32 * math.cos(math.radians(y)), (y - py) * 110.57) >= km:
            out.append((x, y))
    return out if len(out) >= 4 else []


def main():
    for job in JOBS:
        x0, y0, x1, y1 = job['box']
        states = job['state'] if isinstance(job['state'], tuple) else (job['state'],)
        rings, pairs = [], []
        for name in job['zip']:
            print(f"{job['out']}: downloading {name}", file=sys.stderr)
            z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(CB + name).read()))
            stem = name[:-4]
            pairs += zip(read_dbf(z.read(stem + '.dbf')), read_shp(z.read(stem + '.shp')))
        for rec, shape in pairs:
            if rec.get('STATEFP') not in states:
                continue
            for ring in shape:
                xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
                if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
                    continue
                t = thin(ring)
                if t:
                    rings.append([v for x, y in t for v in (round(x, 4), round(y, 4))])
        path = os.path.join(OUT, job['out'])
        with open(path, 'w') as f:
            json.dump({'source': job['source'], 'rings': rings}, f, separators=(',', ':'))
        print(f"{job['out']}: {len(rings)} rings, {os.path.getsize(path) // 1024} KB", file=sys.stderr)


if __name__ == '__main__':
    main()
