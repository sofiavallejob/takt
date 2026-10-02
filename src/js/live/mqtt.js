// A minimal MQTT 3.1.1 client over WebSocket, enough to subscribe to a public
// feed at QoS 0: connect, subscribe, keep alive, and hand every message to a
// callback. It reconnects on its own when the socket drops.

const enc = new TextEncoder(), dec = new TextDecoder();

const str = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };

function packet(type, body) {
  const len = [];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; len.push(d); } while (n);
  return new Uint8Array([type, ...len, ...body]);
}

/** Subscribe to `topics` on `url`; `onMessage(topic, text)` for each message.
 *  Returns { close() }. */
export function subscribe(url, topics, onMessage) {
  let ws = null, buf = new Uint8Array(0), ping = null, closed = false, retry = 1000;

  const open = () => {
    ws = new WebSocket(url, 'mqtt');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const id = 'takt-' + Math.random().toString(36).slice(2, 10);
      ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, 0, 60, ...str(id)]));
      ws.send(packet(0x82, [0, 1, ...topics.flatMap(t => [...str(t), 0])]));
      ping = setInterval(() => ws.readyState === 1 && ws.send(new Uint8Array([0xc0, 0])), 30000);
      retry = 1000;
    };
    ws.onmessage = e => {
      // Packets can arrive split across frames or several to a frame.
      const add = new Uint8Array(e.data), b = new Uint8Array(buf.length + add.length);
      b.set(buf); b.set(add, buf.length); buf = b;
      for (;;) {
        let len = 0, mul = 1, i = 1;
        for (; i < buf.length && i < 5; i++) { len += (buf[i] & 127) * mul; mul *= 128; if (!(buf[i] & 128)) break; }
        if (i >= buf.length || buf.length < i + 1 + len) break;
        const type = buf[0] >> 4, body = buf.subarray(i + 1, i + 1 + len);
        if (type === 3) {
          const tl = (body[0] << 8) | body[1];
          const qos = (buf[0] >> 1) & 3, start = 2 + tl + (qos ? 2 : 0);
          onMessage(dec.decode(body.subarray(2, 2 + tl)), dec.decode(body.subarray(start)));
        }
        buf = buf.slice(i + 1 + len);
      }
    };
    ws.onclose = () => {
      clearInterval(ping);
      buf = new Uint8Array(0);
      if (!closed) { setTimeout(open, retry); retry = Math.min(30000, retry * 2); }
    };
    ws.onerror = () => ws.close();
  };

  open();
  return { close() { closed = true; ws?.close(); } };
}
