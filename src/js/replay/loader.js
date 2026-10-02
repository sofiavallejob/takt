// Replay: the recorded days. Country packs are gzipped JSON fetched on demand. They are served with a
// .bin extension so no host decompresses them behind our back; if one does
// anyway, the plain-JSON fallback below picks it up.

let manifest = null;
const cache = new Map();
const inflight = new Map();

export async function loadManifest() {
  if (!manifest) manifest = await (await fetch('data/replay/index.json')).json();
  return manifest;
}

export function getManifest() { return manifest; }

async function gunzipJSON(res) {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).json();
}

/** Fetch and decompress one country. Concurrent calls share a single request. */
export function loadCountry(key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const m = await loadManifest();
    const url = m.files[key];
    if (!url) throw new Error(`Unknown country: ${key}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    const data = await gunzipJSON(res);
    cache.set(key, data);
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, p);
  return p;
}

export function loaded(key) { return cache.get(key) || null; }
