'use strict';
// The fake MySQL receiver of PK1 (the E1.7 spec §S7.3 rig F): it greets with the native-password plugin, reads the client's login, and SWITCHES the client to the plugin the leg
// names (a plugin named by a path among them, PK1-m7), with the data that plugin's server would send. It records what the client answers, in words and numbers only:
// the length of the answer and, for a plugin that sends the entry's own word, whether the answer IS that word (compared at the moment it is read; the text is never kept).
//
// The free servers have no Kerberos, LDAP or Windows authentication plugin (rig M's limit): so every plugin leg of PK1 uses this fake. A fake cannot read the name inside a
// Kerberos token: there the leg shows that an answer arrived while the rig's ticket was in reach and that none arrived once it was taken away (§S7.4). For the Windows
// authentication plugin (`ntlm: true`) it sends an NTLM challenge as a further packet and reads the user and the computer name from the client's answer (N15, L3).
const net = require('node:net');
const { answerTo, kindOfFirst, namesOfAnswer } = require('./ntlmFake.cjs');

/** One MySQL packet: three bytes of length, the sequence number, the payload. */
const packet = (sequence, payload) => Buffer.concat([Buffer.from([payload.length & 0xff, (payload.length >> 8) & 0xff, (payload.length >> 16) & 0xff, sequence]), payload]);

const GREETING = Buffer.concat([
  Buffer.from([0x0a]), Buffer.from('8.0.99-fake\0'), Buffer.from([1, 0, 0, 0]), Buffer.from('abcdefgh'), Buffer.from([0]),
  Buffer.from([0x8d, 0xa2]), Buffer.from([0x21]), Buffer.from([0x02, 0x00]), Buffer.from([0x08, 0x00]), Buffer.from([21]), Buffer.alloc(10),
  Buffer.from('ijklmnopqrst\0'), Buffer.from('mysql_native_password\0'),
]);

/** An ERR packet that ends the attempt. */
const refusal = (sequence) => packet(sequence, Buffer.concat([Buffer.from([0xff, 0x15, 0x04]), Buffer.from('#28000the fake receiver records and refuses')]));

/** The next whole packet of `buffer`, or `undefined`. */
function parsePacket(buffer) {
  if (buffer.length < 4) {
    return undefined;
  }
  const length = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16);
  return buffer.length < 4 + length ? undefined : { sequence: buffer[3], payload: buffer.subarray(4, 4 + length), size: 4 + length };
}

/** The user name a login packet (HandshakeResponse41) holds, or `undefined`. */
function userOf(payload) {
  const caps = payload.length >= 4 ? payload.readUInt32LE(0) : 0;
  const end = payload.length > 32 ? payload.indexOf(0, 32) : -1;
  return (caps & 0x200) === 0 || end < 0 ? undefined : payload.subarray(32, end).toString('utf8');
}

/** What an answer was, in words: its length, and whether it was the entry's own word (never the text). */
function labelOf(payload, entryWord) {
  const text = payload.toString('utf8').replace(/\0+$/, ''); // NOSONAR: a payload of the rig's own fake server
  if (payload.length === 0 || text === '') {
    return { length: payload.length, label: 'empty' };
  }
  return { length: payload.length, label: entryWord !== undefined && text === entryWord ? 'the entry\'s own word' : 'other bytes' };
}

/**
 * The fake. `plugin` is the name sent in the switch request, `data` the bytes after it, `entryWord` the throwaway word an answer is compared with, `ntlm` whether a
 * first answer is met with an NTLM challenge and a second is read for names.
 */
function fakeMysql({ plugin, data = Buffer.alloc(0), entryWord, ntlm = false }) {
  const state = { connections: 0, logins: [], switched: false, replies: [], ntlm: undefined };
  const open = new Set();
  const server = net.createServer((socket) => {
    state.connections += 1;
    open.add(socket);
    socket.once('close', () => open.delete(socket));
    let pending = Buffer.alloc(0);
    let phase = 'login';
    socket.on('error', () => undefined);
    socket.write(packet(0, GREETING));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      let at = parsePacket(pending);
      while (at !== undefined && phase !== 'done') {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, state, { plugin, data, entryWord, ntlm });
        at = parsePacket(pending);
      }
    });
  });
  const drained = (ms) => {
    let timer;
    const bound = new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return Promise.race([Promise.all([...open].map((socket) => new Promise((resolve) => socket.once('close', resolve)))), bound]).finally(() => clearTimeout(timer));
  };
  return { server, state, drained, open };
}

/** One packet of the client; the next phase. */
function step(socket, phase, incoming, state, options) {
  if (phase === 'login') {
    state.logins.push({ user: userOf(incoming.payload) });
    state.switched = true;
    socket.write(packet(incoming.sequence + 1, Buffer.concat([Buffer.from([0xfe]), Buffer.from(`${options.plugin}\0`), options.data])));
    return 'reply';
  }
  const answered = labelOf(incoming.payload, options.entryWord);
  state.replies.push(answered);
  if (options.ntlm && state.replies.length === 1 && kindOfFirst(incoming.payload) === 'ntlm1') {
    socket.write(packet(incoming.sequence + 1, Buffer.concat([Buffer.from([0x01]), answerTo(incoming.payload, 'BRIDGE', 'RIGFAKE')])));
    return 'reply';
  }
  if (options.ntlm) {
    state.ntlm = namesOfAnswer(incoming.payload);
  }
  socket.write(refusal(incoming.sequence + 1));
  socket.end();
  return 'done';
}

/** Runs `action(port, state)` against a fresh fake; `state` holds what the client said once its connections have been read to their end. */
async function withFakeMysql(options, action) {
  const { server, state, drained, open } = fakeMysql(options);
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

module.exports = { withFakeMysql };
