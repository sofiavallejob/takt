"""Route station-to-station hops along the real railway, from OSM geometry.

The other packs trace a published track network. For the Netherlands the track
comes from OpenStreetMap: every `railway=rail` way tagged as a main or branch
line. Those ways are welded into a graph, each station is snapped onto it, and
every hop a train makes between two calling points becomes the shortest path
along real track rather than a straight line.

Degree-2 chains are contracted into single edges, which turns a third of a
million raw points into a few thousand junctions and makes the shortest-path
search cheap enough to run for every hop in the timetable. Stations are pinned
as junctions before contraction — most of them sit mid-line and would otherwise
be optimised away.
"""

import heapq, json, math
from collections import defaultdict

SNAP = 1e-5              # degrees; OSM ways share exact node coordinates
MAX_SNAP_KM = 2.5        # a station further than this from any track is unusable
CELL = 0.02              # degrees, for the station-snapping grid
LAT_KM = 110.574
LON_KM = 111.320


def _key(lat, lon):
    return (round(lat / SNAP), round(lon / SNAP))


class Network:
    def __init__(self, path, lat0, stations):
        """`stations` maps a name to {'lat','lon'}; snapped nodes land in
        self.node_of, keyed the same way."""
        self.kx = LON_KM * math.cos(math.radians(lat0))
        self.ok = False
        self.node_of = {}
        try:
            data = json.load(open(path, encoding='utf-8'))
        except Exception:
            return
        ways = [e for e in data.get('elements', []) if e.get('type') == 'way' and e.get('geometry')]
        if not ways:
            return
        self._build(ways, stations)
        self.ok = True

    def _km(self, a, b):
        return math.hypot((b[1] - a[1]) * self.kx, (b[0] - a[0]) * LAT_KM)

    def _build(self, ways, stations):
        chains = []
        touch = defaultdict(int)
        grid = defaultdict(list)
        for w in ways:
            pts = [(g['lat'], g['lon']) for g in w['geometry']]
            pts = [p for i, p in enumerate(pts) if i == 0 or _key(*p) != _key(*pts[i - 1])]
            if len(pts) < 2:
                continue
            chains.append(pts)
            for i, p in enumerate(pts):
                touch[_key(*p)] += 1 if i in (0, len(pts) - 1) else 2
                grid[(int(p[0] / CELL), int(p[1] / CELL))].append(p)

        # Pin stations onto the graph before anything is contracted away.
        forced = set()
        for name, st in stations.items():
            gi, gj = int(st['lat'] / CELL), int(st['lon'] / CELL)
            best, bd = None, MAX_SNAP_KM
            for a in range(gi - 2, gi + 3):
                for b in range(gj - 2, gj + 3):
                    for p in grid.get((a, b), ()):
                        d = self._km((st['lat'], st['lon']), p)
                        if d < bd:
                            bd, best = d, p
            if best is not None:
                k = _key(*best)
                forced.add(k)
                self.node_of[name] = k

        self.coord = {}
        self.adj = defaultdict(list)
        for pts in chains:
            start = 0
            for i in range(1, len(pts)):
                k = _key(*pts[i])
                if touch[k] != 2 or k in forced or i == len(pts) - 1:
                    seg = pts[start:i + 1]
                    a, b = _key(*seg[0]), _key(*seg[-1])
                    if a != b:
                        d = sum(self._km(seg[j - 1], seg[j]) for j in range(1, len(seg)))
                        self.coord[a], self.coord[b] = seg[0], seg[-1]
                        self.adj[a].append((b, d, seg))
                        self.adj[b].append((a, d, seg[::-1]))
                    start = i
        # A station whose pinned node ended up isolated is no use.
        self.node_of = {n: k for n, k in self.node_of.items() if k in self.coord}

    def stats(self):
        return len(self.coord), sum(len(v) for v in self.adj.values()) // 2, len(self.node_of)

    def path(self, a, b, limit_km):
        """Shortest track path between two pinned nodes as a (lat, lon)
        polyline, or None if there is none within `limit_km`."""
        if a == b:
            return [self.coord[a]]
        target = self.coord[b]
        seen = {a: 0.0}
        prev = {}
        q = [(self._km(self.coord[a], target), 0.0, a)]
        found = False
        while q:
            _, cost, node = heapq.heappop(q)
            if node == b:
                found = True
                break
            if cost > seen.get(node, 1e18) or cost > limit_km:
                continue
            for nxt, d, seg in self.adj[node]:
                nc = cost + d
                if nc < seen.get(nxt, 1e18) and nc <= limit_km:
                    seen[nxt] = nc
                    prev[nxt] = (node, seg)
                    heapq.heappush(q, (nc + self._km(self.coord[nxt], target), nc, nxt))
        if not found:
            return None
        out, node = [], b
        while node != a:
            parent, seg = prev[node]
            out = list(seg) + (out[1:] if out else [])
            node = parent
        return out
