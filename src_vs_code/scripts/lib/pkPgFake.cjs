'use strict';
// The fake PostgreSQL receiver of PK1 (the E1.7 spec §S7.3 rig F): it answers a GSS-encryption request with `G`, or sends authentication request 7 (GSSAPI) or 9 (SSPI),
// and records what comes back. After request 9 it sends an NTLM challenge and reads the user and the domain or computer name from the client's answer (N15).
// A fake cannot read the name inside a Kerberos token: for Kerberos it shows the request and THAT A TOKEN FOLLOWED (its length), and the real server names the identity.
//
// `state` holds numbers and names only: how many requests, how many bytes of a token, the names of an NTLM answer. No token's bytes are kept or printed.
const net = require('node:net');
const { answerTo, kindOfFirst, namesOfAnswer } = require('./ntlmFake.cjs');

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
/** A FATAL error that ends the attempt, as libpq reads it. */
const FATAL = Buffer.concat([Buffer.from('E'), Buffer.from([0, 0, 0, 0]), Buffer.from('SFATAL\0C28000\0Mthe fake receiver records and refuses\0\0')]);
FATAL.writeInt32BE(FATAL.length - 1, 1);

/** One backend message: the type, the length (which counts itself), the body. */
function backend(type, body) {
  const head = Buffer.alloc(5);
  head.write(type, 0, 'latin1');
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

/** `AuthenticationRequest`: type R, a code, then an optional body. */
const authRequest = (code, extra = Buffer.alloc(0)) => backend('R', Buffer.concat([Buffer.from([0, 0, 0, code]), extra]));

/** The next whole message of `buffer` for `phase`; `undefined` while it has not all arrived. */
function nextMessage(buffer, phase) {
  if (phase === 'gsstoken') {
    if (buffer.length < 4) {
      return undefined;
    }
    const length = buffer.readUInt32BE(0); // a GSS-encryption packet: the length of what follows, not counting these four bytes
    return buffer.length < 4 + length ? undefined : { body: buffer.subarray(4, 4 + length), size: 4 + length };
  }
  const skip = phase === 'msg' ? 1 : 0;
  if (buffer.length < skip + 4) {
    return undefined;
  }
  const length = Math.max(buffer.readInt32BE(skip), 4);
  return buffer.length < skip + length ? undefined : { body: buffer.subarray(skip + 4, skip + length), size: skip + length, type: skip === 1 ? buffer[0] : undefined };
}

/** The user a start-up message names (its body: a four-byte protocol code, then NUL-ended names and values). */
function startupUser(body) {
  const fields = body.subarray(4).toString('utf8').split('\0');
  for (let at = 0; at + 1 < fields.length && fields[at] !== ''; at += 2) {
    if (fields[at] === 'user') {
      return fields[at + 1];
    }
  }
  return undefined;
}

/**
 * The fake. `mode`: `gss` sends request 7 after the start-up message, `sspi` sends request 9 and an NTLM challenge. `gssenc`: `G` answers a GSS-encryption request with yes,
 * `N` with no. The server never completes a login: every conversation ends in a FATAL error after what the leg wants to see.
 */
function fakePg({ mode, gssenc = 'G' }) {
  const state = {
    connections: 0, sslRequests: 0, gssencRequests: 0, gssencTokenBytes: 0, startups: 0, user: undefined, requested: undefined,
    answers: [], firstTokenKind: undefined, ntlm: undefined,
  };
  const open = new Set();
  const server = net.createServer((socket) => {
    state.connections += 1;
    open.add(socket);
    socket.once('close', () => open.delete(socket));
    let pending = Buffer.alloc(0);
    let phase = 'first';
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      let at = nextMessage(pending, phase);
      while (at !== undefined && phase !== 'done') {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, state, mode, gssenc);
        at = nextMessage(pending, phase);
      }
    });
  });
  /** Resolves when every connection has been read to its end, or after `ms`: what the client sent is then all in `state`. */
  const drained = (ms) => {
    let timer;
    const bound = new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return Promise.race([Promise.all([...open].map((socket) => new Promise((resolve) => socket.once('close', resolve)))), bound]).finally(() => clearTimeout(timer));
  };
  return { server, state, drained, open };
}

/** One message of the client; the next phase. */
function step(socket, phase, incoming, state, mode, gssenc) {
  if (phase === 'gsstoken') {
    state.gssencTokenBytes += incoming.body.length;
    socket.end();
    return 'done';
  }
  if (phase === 'first') {
    return firstMessage(socket, incoming, state, mode, gssenc);
  }
  if (incoming.type !== 0x70) {
    socket.end();
    return 'done'; // a Terminate, or a message this receiver did not ask for
  }
  state.answers.push(incoming.body.length);
  return mode === 'sspi' ? sspiAnswer(socket, incoming.body, state) : endAfter(socket);
}

/** The first message of a connection: an SSL request, a GSS-encryption request, or the start-up message. */
function firstMessage(socket, incoming, state, mode, gssenc) {
  const code = incoming.body.length >= 4 ? incoming.body.readInt32BE(0) : 0;
  if (code === SSL_REQUEST) {
    state.sslRequests += 1;
    socket.write('N');
    return 'first';
  }
  if (code === GSSENC_REQUEST) {
    state.gssencRequests += 1;
    socket.write(gssenc);
    return gssenc === 'G' ? 'gsstoken' : 'first';
  }
  state.startups += 1;
  state.user = startupUser(incoming.body);
  state.requested = mode;
  socket.write(authRequest(mode === 'sspi' ? 9 : 7));
  return 'msg';
}

/** An answer to request 7 or the last answer of an SSPI exchange: the receiver refuses and the leg has what it wanted. */
function endAfter(socket) {
  socket.end(FATAL);
  return 'done';
}

/** An answer to request 9: the first token is met with a challenge, the second is read for the names it holds. */
function sspiAnswer(socket, body, state) {
  if (state.firstTokenKind === undefined) {
    state.firstTokenKind = kindOfFirst(body);
    if (state.firstTokenKind === 'ntlm1') {
      socket.write(backend('R', Buffer.concat([Buffer.from([0, 0, 0, 8]), answerTo(body, 'BRIDGE', 'RIGFAKE')])));
      return 'msg';
    }
    return endAfter(socket);
  }
  state.ntlm = namesOfAnswer(body);
  return endAfter(socket);
}

/** Runs `action(port, state)` against a fresh fake and answers what `state` holds once the client's connections have been read to their end. */
async function withFakePg(options, action) {
  const { server, state, drained, open } = fakePg(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await action(server.address().port, state);
    await drained(2000);
    return { state, result };
  } finally {
    for (const socket of open) {
      socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { fakePg, withFakePg };
