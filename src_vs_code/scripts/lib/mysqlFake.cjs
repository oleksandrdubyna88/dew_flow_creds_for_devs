'use strict';
// The fake MySQL server of the bridged `mysql` harnesses (E1.6, parent §4.11, legs (m), PM1 and (t)), moved out of `bridged-mysql-itest.cjs` so that the
// database probes of E1.7 (`bridged-db-pa1-itest.cjs`) read the same server: it speaks just enough of the protocol to greet a client, answer any login with an OK and,
// when it is given a marker path, answer the first query with a LOCAL INFILE request for it. It records the user name and the LENGTH of the authentication answer of each
// login, never the answer.
const net = require('node:net');

/** One MySQL packet: three bytes of length, the sequence number, the payload. */
const packet = (sequence, payload) => Buffer.concat([Buffer.from([payload.length & 0xff, (payload.length >> 8) & 0xff, (payload.length >> 16) & 0xff, sequence]), payload]);

/** The greeting, naming `plugin` as the server's default authentication plugin. */
const greetingOf = (plugin) => Buffer.concat([
  Buffer.from([0x0a]), Buffer.from('8.0.99-fake\0'), Buffer.from([1, 0, 0, 0]), Buffer.from('abcdefgh'), Buffer.from([0]),
  Buffer.from([0x8d, 0xa2]), Buffer.from([0x21]), Buffer.from([0x02, 0x00]), Buffer.from([0x08, 0x00]), Buffer.from([21]), Buffer.alloc(10),
  Buffer.from('ijklmnopqrst\0'), Buffer.from(`${plugin}\0`),
]);
const GREETING = greetingOf('mysql_native_password');
const OK = Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);

/**
 * A server that speaks just enough of the protocol: the greeting, an OK for any login, and for the first query a LOCAL INFILE request for
 * `markerPath`; it collects what the client sends back (the packets after the request, up to the empty one) in `received`. With `options.switchTo` (a plugin name) it answers
 * the login with an authentication switch to that plugin instead (E1.7, PA1-e): a client that does not have the plugin says where it looked.
 */
function fakeServer(markerPath, options = {}) {
  // `logins`: the user name and the length of the authentication answer of each login (PM1). With no `markerPath` a query is just answered with an OK.
  const state = { received: [], requested: false, logins: [] };
  const open = new Set();
  const server = net.createServer((socket) => {
    open.add(socket);
    socket.once('close', () => open.delete(socket));
    let pending = Buffer.alloc(0);
    let phase = 'login';
    socket.on('error', () => undefined);
    socket.write(packet(0, options.greetingPlugin === undefined ? GREETING : greetingOf(options.greetingPlugin)));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (let at = parsePacket(pending); at !== undefined; at = parsePacket(pending)) {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, markerPath, state, options);
      }
    });
  });
  /**
   * Resolves `true` when every connection of the client has been read to its end: what the client sent is then all in `state`. After `ms` it resolves
   * `false`: some connection was still open, so `state` may hold only part of what the client sent, and the caller must not pass on it.
   */
  const drained = (ms) => within(Promise.all([...open].map((socket) => new Promise((resolve) => socket.once('close', resolve)))).then(() => true), ms, false);
  return { server, state, drained };
}

function parsePacket(buffer) {
  if (buffer.length < 4) {
    return undefined;
  }
  const length = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16);
  return buffer.length < 4 + length ? undefined : { sequence: buffer[3], payload: buffer.subarray(4, 4 + length), size: 4 + length };
}

/**
 * What a login packet (HandshakeResponse41) says: the user name, and the length of the authentication answer (0 when the client has no password). Never the
 * answer itself. `undefined` fields when the packet is not one this reads (an SSL request, a protocol older than 4.1).
 */
function loginOf(payload) {
  const caps = payload.length >= 4 ? payload.readUInt32LE(0) : 0;
  const end = payload.length > 32 ? payload.indexOf(0, 32) : -1;
  if ((caps & 0x200) === 0 || end < 0) {
    return { user: undefined, authLength: undefined };
  }
  const user = payload.subarray(32, end).toString('utf8');
  const at = end + 1;
  // Which of the three layouts the client chose: a length-encoded answer, a one-byte length, or a NUL-ended text.
  let authLength;
  if ((caps & 0x00200000) !== 0) {
    authLength = payload[at] < 0xfb ? payload[at] : undefined;
  } else if ((caps & 0x8000) !== 0) {
    authLength = payload[at];
  } else {
    authLength = Math.max(payload.indexOf(0, at) - at, 0);
  }
  return { user, authLength };
}

/** One packet of the client; the next phase. */
function step(socket, phase, incoming, markerPath, state, options) {
  if (phase === 'switched') {
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  if (phase === 'login') {
    state.logins.push(loginOf(incoming.payload));
    if (options.switchTo !== undefined) {
      // E1.7 PA1-e: an authentication switch to a plugin the client may not have: the client's own words name the folder it looked in.
      socket.write(packet(incoming.sequence + 1, Buffer.concat([Buffer.from([0xfe]), Buffer.from(`${options.switchTo}\0`), Buffer.from('abcdefghijklmnopqrst\0')])));
      return 'switched';
    }
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  if (phase === 'command') {
    if (incoming.payload[0] !== 0x03) {
      return 'command';
    }
    if (state.requested || markerPath === undefined) {
      // Only the FIRST query is answered with the request: Oracle's 8.4 client sends more than one COM_QUERY for `-e`, and a request on each
      // made the control receive the marker three times (CI, 2026-11-13). Every later query gets an OK.
      socket.write(packet(incoming.sequence + 1, OK));
      return 'command';
    }
    state.requested = true;
    socket.write(packet(incoming.sequence + 1, Buffer.concat([Buffer.from([0xfb]), Buffer.from(markerPath)])));
    return 'infile';
  }
  if (incoming.payload.length === 0) {
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  state.received.push(incoming.payload);
  return 'infile';
}

/** Resolves with `promise`'s value, or with `value` after `ms`; the timer does not outlive the race. */
async function within(promise, ms, value) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, value);
  });
  try {
    return await Promise.race([promise, bound]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { packet, fakeServer, within };
