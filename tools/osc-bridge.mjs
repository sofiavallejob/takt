#!/usr/bin/env node
// Takt OSC bridge: from the web page to ordinary UDP OSC.
//
// A web page cannot send UDP, so Takt sends its OSC over a WebSocket to this
// computer. This passes every message on, unchanged, as UDP OSC: to Pure
// Data, SuperCollider, Max, a DAW, anything that listens for OSC.
//
//   node tools/osc-bridge.mjs                         # ws://localhost:8080  ->  udp 127.0.0.1:9000
//   node tools/osc-bridge.mjs --port 8080 --to 57120  # to SuperCollider's default port
//   node tools/osc-bridge.mjs --to 9000 --to 7400     # to two programs at once
//
// Then in Takt: Advanced -> Output -> port 8080 -> Connect.
// Needs only Node (nodejs.org), no packages.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createSocket } from 'node:dgram';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const out = [];
  args.forEach((a, i) => { if (a === `--${name}`) out.push(args[i + 1]); });
  return out.length ? out : dflt;
};
const PORT = +opt('port', ['8080'])[0];
const TARGETS = opt('to', ['9000']).map(t => {
  const [h, p] = t.includes(':') ? t.split(':') : ['127.0.0.1', t];
  return { host: h || '127.0.0.1', port: +p };
});
if (args.includes('--help') || args.includes('-h')) {
  console.log('node tools/osc-bridge.mjs [--port 8080] [--to [host:]port ...]');
  process.exit(0);
}

const udp = createSocket('udp4');
let count = 0, last = 0, clients = 0;

function forward(buf) {
  for (const t of TARGETS) udp.send(buf, t.port, t.host);
  count++;
}

/** The address of an OSC packet, for the log. */
const address = buf => buf.subarray(0, buf.indexOf(0) < 0 ? buf.length : buf.indexOf(0)).toString();

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Takt OSC bridge. Connect Takt (Advanced -> Output) to this port.\n');
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  clients++;
  console.log(`Takt connected (${req.headers.origin || 'unknown page'}).`);

  // WebSocket frames: [FIN+opcode] [MASK+length] [ext length] [mask] [payload].
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, o = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); o = 10; }
      const mask = masked ? buf.subarray(o, o + 4) : null;
      if (masked) o += 4;
      if (buf.length < o + len) return;
      const data = Buffer.from(buf.subarray(o, o + len));
      buf = buf.subarray(o + len);
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];

      if (op === 0x8) { sock.end(Buffer.from([0x88, 0])); return; }        // close
      if (op === 0x9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; } // ping -> pong
      if (op === 0x2 || op === 0x1 || op === 0x0) {
        parts.push(data);
        if (fin) { const msg = Buffer.concat(parts); parts = []; forward(msg); if (count === 1) console.log(`First message: ${address(msg)}`); }
      }
    }
  });
  sock.on('close', () => { clients--; console.log('Takt disconnected.'); });
  sock.on('error', () => {});
});

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use; try --port with another number.` : e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Takt OSC bridge: ws://localhost:${PORT}  ->  udp ${TARGETS.map(t => `${t.host}:${t.port}`).join(', ')}`);
  console.log('In Takt: Advanced -> Output -> port ' + PORT + ' -> Connect. Ctrl+C to stop.');
});

setInterval(() => {
  if (count !== last && clients) { console.log(`${count} messages passed on`); last = count; }
}, 10000);
