'use strict';
// The resolver of probe P2 of E3.S3 (`research/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a name server that the run owns, for M10. It runs INSIDE the
// probe's container, as root (port 53), and is the only thing in the run that does. It is not a package and it validates nothing: it answers what a zone
// file says and SETS the AD bit on those answers, which is the signal that the client's own resolver library passes on under `options trust-ad` (the
// lead's answer on "secure" in the brief). It records every question.
//
//   node scripts/itestResolverServer.cjs <control folder>
//
// The control folder is made by the container's start (`containers/e3-resolver-init.sh`) and is the probe user's. Three files live there:
//   zone.json        written by the harness, read again at every question: { name, a, sshfp: [{ algorithm, type, hex }] }
//   queries.jsonl    appended by this server, one JSON line per question: { at, name, type, answer }
//   ready            written by this server when it is bound: its pid
// A name that is not the zone's gets NXDOMAIN; for the zone's name an `A` question gets its address, an `SSHFP` question its records, and any other type
// gets an empty answer (NODATA), so that a client that asks AAAA first does not wait. A query's EDNS0 record, when it has one, is answered with one.
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { A: 1, AAAA: 28, SSHFP: 44, OPT: 41 };
const TTL = 60;
const FLAG_QR = 0x8000;
const FLAG_AA = 0x0400;
const FLAG_RD = 0x0100;
const FLAG_RA = 0x0080;
const FLAG_AD = 0x0020;

/** The name in the question at `offset` of `buffer` (no compression is allowed in a question), and where the question ends. */
function readQuestion(buffer, offset) {
  const labels = [];
  let at = offset;
  while (buffer[at] !== 0) {
    const length = buffer[at];
    if (length === undefined || length > 63 || at + 1 + length > buffer.length) {
      return undefined;
    }
    labels.push(buffer.toString('latin1', at + 1, at + 1 + length));
    at += 1 + length;
  }
  if (at + 5 > buffer.length) {
    return undefined;
  }
  return { name: labels.join('.').toLowerCase(), type: buffer.readUInt16BE(at + 1), end: at + 5 };
}

/** The zone, read now; `undefined` while the harness has not written it. */
function zoneOf(control) {
  try {
    return JSON.parse(fs.readFileSync(path.join(control, 'zone.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/** The answer records for `type` in `zone`: `{ type, data }` each, or `[]`. */
function recordsOf(zone, type) {
  if (type === TYPES.A && typeof zone.a === 'string') {
    return [{ type, data: Buffer.from(zone.a.split('.').map(Number)) }];
  }
  if (type === TYPES.SSHFP) {
    return zone.sshfp.map((one) => ({ type, data: Buffer.concat([Buffer.from([one.algorithm, one.type]), Buffer.from(one.hex, 'hex')]) }));
  }
  return [];
}

/** The EDNS0 record of the query, when it has one: its DO bit; `undefined` when it has none. */
function optOf(query, end) {
  if (query.readUInt16BE(10) === 0 || query[end] !== 0 || end + 11 > query.length || query.readUInt16BE(end + 1) !== TYPES.OPT) {
    return undefined;
  }
  return { flags: query.readUInt16BE(end + 7) };
}

/** The reply to `query`: the header, the question, the records, and the EDNS0 record when the query had one. */
function replyTo(query, question, zone) {
  const known = zone !== undefined && zone.name.toLowerCase() === question.name;
  const records = known ? recordsOf(zone, question.type) : [];
  const opt = optOf(query, question.end);
  const flags = FLAG_QR | FLAG_AA | FLAG_RA | (query.readUInt16BE(2) & FLAG_RD) | (known && records.length > 0 && zone.secure !== false ? FLAG_AD : 0) | (known ? 0 : 3);
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(records.length, 6);
  header.writeUInt16BE(opt === undefined ? 0 : 1, 10);
  const answers = records.map((one) => {
    const fixed = Buffer.alloc(12);
    fixed.writeUInt16BE(0xc00c, 0); // the question's name
    fixed.writeUInt16BE(one.type, 2);
    fixed.writeUInt16BE(1, 4);
    fixed.writeUInt32BE(TTL, 6);
    fixed.writeUInt16BE(one.data.length, 10);
    return Buffer.concat([fixed, one.data]);
  });
  const extension = Buffer.alloc(11);
  extension.writeUInt16BE(TYPES.OPT, 1);
  extension.writeUInt16BE(1232, 3);
  extension.writeUInt16BE(opt === undefined ? 0 : opt.flags, 7);
  return { buffer: Buffer.concat([header, query.subarray(12, question.end), ...answers, ...(opt === undefined ? [] : [extension])]), answer: known ? (records.length > 0 ? 'records' : 'NODATA') : 'NXDOMAIN' };
}

function serve(control) {
  const socket = dgram.createSocket('udp4');
  const log = path.join(control, 'queries.jsonl');
  socket.on('message', (query, remote) => {
    const question = query.length >= 17 ? readQuestion(query, 12) : undefined;
    if (question === undefined) {
      return;
    }
    const reply = replyTo(query, question, zoneOf(control));
    const typeName = Object.keys(TYPES).find((key) => TYPES[key] === question.type) ?? String(question.type);
    fs.appendFileSync(log, `${JSON.stringify({ at: Date.now(), name: question.name, type: typeName, answer: reply.answer })}\n`);
    socket.send(reply.buffer, remote.port, remote.address);
  });
  socket.on('error', (error) => {
    console.error(`itestResolverServer: ${error}`);
    process.exit(1);
  });
  socket.bind(53, '127.0.0.1', () => fs.writeFileSync(path.join(control, 'ready'), `${process.pid}\n`));
  process.on('SIGTERM', () => socket.close(() => process.exit(0)));
}

const control = process.argv[2];
if (control === undefined || !path.isAbsolute(control)) {
  console.error('itestResolverServer: the control folder must be given as an absolute path');
  process.exit(2);
}
serve(control);
