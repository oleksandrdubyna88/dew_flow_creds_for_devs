'use strict';
// The NTLM half of a fake receiver (the E1.7 spec §S7.3 rig F, N15, §S7.16 L3): a receiver that sends the challenge (message 2) and reads, from the client's answer
// (message 3), the user name and the domain or computer name that are plain fields of it. A Kerberos token names nobody a fake can read; an NTLM answer does.
// Used by PK1-w0 (a PostgreSQL server asking for SSPI) and PK1-m6 (a MySQL server switching to the Windows authentication plugin).
//
// What is read is a name, never a proof: the NT response and the session key are not looked at, kept or printed.
const SIGNATURE = Buffer.from('NTLMSSP\0', 'latin1');
const NTLM_OID = Buffer.from([0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0x37, 0x02, 0x02, 0x0a]);

/** The flags this receiver offers: Unicode, request target, NTLM, always sign, target type domain, extended session security, target info, 128-bit. */
const CHALLENGE_FLAGS = 0x00000001 | 0x00000004 | 0x00000200 | 0x00008000 | 0x00010000 | 0x00080000 | 0x00800000 | 0x20000000;

/** A security buffer of a message 2 or 3: where `(length, length, offset)` stands at `at` of `buffer`. */
function fieldAt(buffer, base, at) {
  const length = buffer.readUInt16LE(base + at);
  const offset = buffer.readUInt32LE(base + at + 4);
  return base + offset + length <= buffer.length ? buffer.subarray(base + offset, base + offset + length) : Buffer.alloc(0);
}

/** One attribute-value pair of the challenge's target information. */
function pair(type, text) {
  const value = Buffer.from(text, 'utf16le');
  const head = Buffer.alloc(4);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(value.length, 2);
  return Buffer.concat([head, value]);
}

/** NTLM message 2 (the challenge), for a fake domain and computer; `challenge` is eight fixed bytes of no worth. */
function challengeMessage(domain = 'BRIDGE', computer = 'RIGFAKE') {
  const targetName = Buffer.from(domain, 'utf16le');
  const targetInfo = Buffer.concat([pair(2, domain), pair(1, computer), pair(0, '')]);
  const header = Buffer.alloc(48);
  SIGNATURE.copy(header, 0);
  header.writeUInt32LE(2, 8);
  header.writeUInt16LE(targetName.length, 12);
  header.writeUInt16LE(targetName.length, 14);
  header.writeUInt32LE(48, 16);
  header.writeUInt32LE(CHALLENGE_FLAGS, 20);
  Buffer.from('0123abcd'.repeat(1), 'latin1').copy(header, 24);
  header.writeUInt16LE(targetInfo.length, 40);
  header.writeUInt16LE(targetInfo.length, 42);
  header.writeUInt32LE(48 + targetName.length, 44);
  return Buffer.concat([header, targetName, targetInfo]);
}

/** DER length octets. */
function derLength(length) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  return length < 0x100 ? Buffer.from([0x81, length]) : Buffer.from([0x82, length >> 8, length & 0xff]);
}

/** One DER element. */
const der = (tag, body) => Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);

/**
 * The challenge the way a client that opened with SPNEGO expects it: a NegTokenResp (accept-incomplete, the NTLM mechanism, the challenge as the response token).
 * A client that opened with a bare NTLM message 1 gets the bare message 2 (see `answerTo`).
 */
function spnegoChallenge(message) {
  const negState = der(0xa0, der(0x0a, Buffer.from([0x01])));
  const mech = der(0xa1, der(0x06, NTLM_OID));
  const response = der(0xa2, der(0x04, message));
  return der(0xa1, der(0x30, Buffer.concat([negState, mech, response])));
}

/** Where the NTLM message of `type` starts in `token` (bare or inside a SPNEGO token), or -1. */
function messageAt(token, type) {
  for (let at = token.indexOf(SIGNATURE); at >= 0; at = token.indexOf(SIGNATURE, at + 1)) {
    if (token.length >= at + 12 && token.readUInt32LE(at + 8) === type) {
      return at;
    }
  }
  return -1;
}

/** What a client's first token is: `ntlm1` (a message 1, bare or inside SPNEGO), or `other` (a Kerberos-only SPNEGO token, say). */
const kindOfFirst = (token) => (messageAt(token, 1) >= 0 ? 'ntlm1' : 'other');

/** The challenge to send for a first token: bare for a bare message 1, wrapped for a SPNEGO one. */
function answerTo(token, domain, computer) {
  const message = challengeMessage(domain, computer);
  return token.subarray(0, 8).equals(SIGNATURE) ? message : spnegoChallenge(message);
}

/**
 * The names a message 3 holds: `{ user, domain, workstation }`, or `undefined` when `token` holds no message 3. The text is decoded as the message's own flag says (Unicode or the
 * OEM page, read as Latin-1).
 */
function namesOfAnswer(token) {
  const at = messageAt(token, 3);
  if (at < 0 || token.length < at + 64) {
    return undefined;
  }
  const flags = token.readUInt32LE(at + 60);
  const text = (offset) => fieldAt(token, at, offset).toString((flags & 1) === 1 ? 'utf16le' : 'latin1');
  return { domain: text(28), user: text(36), workstation: text(44) };
}

module.exports = { answerTo, kindOfFirst, namesOfAnswer, challengeMessage, spnegoChallenge };
