// A minimal GTFS Realtime reader: just the fields Takt uses, decoded straight
// from the protobuf wire format, so the page needs no protobuf library.
//
// Field numbers are from gtfs-realtime.proto:
//   FeedMessage   header 1, entity 2           FeedHeader   timestamp 3
//   FeedEntity    id 1, trip_update 3, vehicle 4
//   TripUpdate    trip 1, stop_time_update 2, timestamp 4
//   TripDescriptor trip_id 1, start_date 3, schedule_relationship 4, route_id 5
//   StopTimeUpdate stop_sequence 1, arrival 2, departure 3, stop_id 4, schedule_relationship 5
//   StopTimeEvent  delay 1, time 2
//   VehiclePosition trip 1, position 2, timestamp 5
//   Position       latitude 1, longitude 2, speed 5 (metres per second)

class Reader {
  constructor(buf) { this.b = buf; this.p = 0; this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  get done() { return this.p >= this.b.length; }
  /** A varint as [low 32 bits, high 32 bits]. */
  varint() {
    let lo = 0, hi = 0, shift = 0;
    for (let i = 0; i < 10; i++) {
      const byte = this.b[this.p++];
      if (shift < 28) lo |= (byte & 0x7f) << shift;
      else if (shift === 28) { lo |= (byte & 0x0f) << 28; hi |= (byte & 0x7f) >> 4; }
      else hi |= (byte & 0x7f) << (shift - 32);
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    return [lo >>> 0, hi >>> 0];
  }
  uint() { const [lo, hi] = this.varint(); return hi * 4294967296 + lo; }
  int32() { return this.varint()[0] | 0; }
  bytes() { const n = this.uint(), s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
  string() { return dec.decode(this.bytes()); }
  float() { const f = this.v.getFloat32(this.p, true); this.p += 4; return f; }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.p += 8;
    else if (wire === 2) { const n = this.uint(); this.p += n; }
    else if (wire === 5) this.p += 4;
    else throw new Error('unsupported wire type ' + wire);
  }
  /** Call fn(field, wire) for each field until `end`. */
  fields(end, fn) {
    while (this.p < end) {
      const key = this.uint(), field = Math.floor(key / 8), wire = key & 7;
      if (fn(field, wire) === false) this.skip(wire);
    }
  }
}

const dec = new TextDecoder();

function sub(r, fn) { const n = r.uint(), end = r.p + n; fn(end); r.p = end; }

function trip(r) {
  const t = { tripId: '', startDate: '', rel: 0, routeId: '' };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 2) t.tripId = r.string();
    else if (f === 3 && w === 2) t.startDate = r.string();
    else if (f === 4 && w === 0) t.rel = r.uint();
    else if (f === 5 && w === 2) t.routeId = r.string();
    else return false;
  }));
  return t;
}

function event(r) {
  const e = { delay: null, time: null };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 0) e.delay = r.int32();
    else if (f === 2 && w === 0) e.time = r.uint();
    else return false;
  }));
  return e;
}

function stopTimeUpdate(r) {
  const u = { seq: null, stopId: '', arr: null, dep: null, rel: 0 };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 0) u.seq = r.uint();
    else if (f === 2 && w === 2) u.arr = event(r);
    else if (f === 3 && w === 2) u.dep = event(r);
    else if (f === 4 && w === 2) u.stopId = r.string();
    else if (f === 5 && w === 0) u.rel = r.uint();
    else return false;
  }));
  return u;
}

function tripUpdate(r) {
  const tu = { trip: null, stops: [], timestamp: 0 };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 2) tu.trip = trip(r);
    else if (f === 2 && w === 2) tu.stops.push(stopTimeUpdate(r));
    else if (f === 4 && w === 0) tu.timestamp = r.uint();
    else return false;
  }));
  return tu;
}

function position(r) {
  const p = { lat: 0, lon: 0, speed: null };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 5) p.lat = r.float();
    else if (f === 2 && w === 5) p.lon = r.float();
    else if (f === 5 && w === 5) p.speed = r.float();
    else return false;
  }));
  return p;
}

function vehicle(r) {
  const v = { trip: null, pos: null, timestamp: 0 };
  sub(r, end => r.fields(end, (f, w) => {
    if (f === 1 && w === 2) v.trip = trip(r);
    else if (f === 2 && w === 2) v.pos = position(r);
    else if (f === 5 && w === 0) v.timestamp = r.uint();
    else return false;
  }));
  return v;
}

/** Decode a FeedMessage into { timestamp, tripUpdates, vehicles }. */
export function decodeFeed(buf) {
  const r = new Reader(buf), out = { timestamp: 0, tripUpdates: [], vehicles: [] };
  r.fields(buf.length, (f, w) => {
    if (f === 1 && w === 2) {
      sub(r, end => r.fields(end, (g, w2) => {
        if (g === 3 && w2 === 0) out.timestamp = r.uint(); else return false;
      }));
    } else if (f === 2 && w === 2) {
      sub(r, end => r.fields(end, (g, w2) => {
        if (g === 3 && w2 === 2) out.tripUpdates.push(tripUpdate(r));
        else if (g === 4 && w2 === 2) out.vehicles.push(vehicle(r));
        else return false;
      }));
    } else return false;
  });
  return out;
}

/** Fetch a .pb feed. Browsers undo the gzip transfer encoding themselves;
 *  if a server sends gzip without saying so, it is unpacked here. */
export async function fetchFeed(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`);
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(s).arrayBuffer());
  }
  return decodeFeed(buf);
}
