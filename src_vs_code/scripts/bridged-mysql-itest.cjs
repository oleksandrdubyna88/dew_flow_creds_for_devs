// Integration test of the bridged `mysql` client (E1.6, parent §4.11, leg (m); mandatory):
//
//   npm run compile && node scripts/bridged-mysql-itest.cjs        (`npm run itest:bridged-mysql`)
//
// `buildDbQueryLaunch(..., { bridged: true })` puts `--no-defaults` FIRST on `mysql`, because Oracle's `load-data-local-dir` in an option file survives
// `--local-infile=0` (the launcher's own comment calls it a known gap). A flag that is IN the argv is not a measured protection, so this asks real
// clients: a fake server completes the handshake and answers the query with a `LOCAL INFILE` request for a marker file, and the harness reads what
// the client sends back.
//
//   control   with `--local-infile=1` (the rig can make a client send a file at all), and, for Oracle's client, an option file that sets
//             `load-data-local-dir` with `--local-infile=0` and NO `--no-defaults`: the marker's bytes arrive;
//   production  the arguments of `buildDbQueryLaunch('mysql', …, { bridged: true })` and the environment of `bridgedSshEnv`, with the SAME option
//             file in the rig home: the server receives none of the bytes, on each client.
//
// Oracle's client and MariaDB's are each named by an absolute path (`BRIDGED_MYSQL_ORACLE`, default `/usr/bin/mysql`; `BRIDGED_MYSQL_MARIADB`, default
// `/usr/bin/mariadb`); the harness prints each `--version`. With `CI=true` a missing one FAILS; off CI it is a printed skip. The pass rule is the one
// above; how the fake server speaks the protocol is the harness's own business. POSIX only.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { launch, endChild } = require('./itestSshd.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

const OUT = path.join(__dirname, '..', 'out');
const MARKER_TEXT = 'the-bytes-of-the-marker-file\n';

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log(`       ${String(detail).split('\n').join('\n       ')}`);
    }
  }
}

/** One MySQL packet: three bytes of length, the sequence number, the payload. */
const packet = (sequence, payload) => Buffer.concat([Buffer.from([payload.length & 0xff, (payload.length >> 8) & 0xff, (payload.length >> 16) & 0xff, sequence]), payload]);

const GREETING = Buffer.concat([
  Buffer.from([0x0a]), Buffer.from('8.0.99-fake\0'), Buffer.from([1, 0, 0, 0]), Buffer.from('abcdefgh'), Buffer.from([0]),
  Buffer.from([0x8d, 0xa2]), Buffer.from([0x21]), Buffer.from([0x02, 0x00]), Buffer.from([0x08, 0x00]), Buffer.from([21]), Buffer.alloc(10),
  Buffer.from('ijklmnopqrst\0'), Buffer.from('mysql_native_password\0'),
]);
const OK = Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);

/**
 * A server that speaks just enough of the protocol: the greeting, an OK for any login, and for the first query a LOCAL INFILE request for
 * `markerPath`; it collects what the client sends back (the packets after the request, up to the empty one) in `received`.
 */
function fakeServer(markerPath) {
  const state = { received: [], requested: false };
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    let phase = 'login';
    socket.on('error', () => undefined);
    socket.write(packet(0, GREETING));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (let at = parsePacket(pending); at !== undefined; at = parsePacket(pending)) {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, markerPath, state);
      }
    });
  });
  return { server, state };
}

function parsePacket(buffer) {
  if (buffer.length < 4) {
    return undefined;
  }
  const length = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16);
  return buffer.length < 4 + length ? undefined : { sequence: buffer[3], payload: buffer.subarray(4, 4 + length), size: 4 + length };
}

/** One packet of the client; the next phase. */
function step(socket, phase, incoming, markerPath, state) {
  if (phase === 'login') {
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  if (phase === 'command') {
    if (incoming.payload[0] !== 0x03) {
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

const versionOf = (exe) => {
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim(); // NOSONAR: an absolute path chosen by the rig
  } catch {
    return undefined;
  }
};

/** One real client against one fake server: the bytes of the marker that the server received. */
async function received(scope, exe, build, markerPath) {
  const { server, state } = fakeServer(markerPath);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { args, env } = build(server.address().port);
  const client = launch(scope, exe, args, { env });
  try {
    await Promise.race([client.done, new Promise((resolve) => setTimeout(resolve, 20_000))]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { bytes: Buffer.concat(state.received).toString('utf8'), requested: state.requested, stderr: client.stderr };
  } finally {
    await endChild(client);
    await new Promise((resolve) => server.close(resolve));
  }
}

async function legM(scope, dir, name, exe, product) {
  const marker = path.join(dir, 'marker.txt');
  const home = path.join(dir, `${name} home`);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(marker, MARKER_TEXT);
  fs.writeFileSync(path.join(home, '.my.cnf'), `[client]\nlocal-infile=1\n[mysql]\nload-data-local-dir=${dir}\n`);
  const base = { PATH: process.env.PATH, HOME: home, MYSQL_PWD: 'pw' };
  const connect = (port) => ['-h', '127.0.0.1', '-P', String(port), '-u', 'u'];
  const manual = (flag) => (port) => ({ args: [...connect(port), flag, '-e', 'select 1'], env: base });
  const control = await received(scope, exe, manual('--local-infile=1'), marker);
  check(`(m) ${name} control: with --local-infile=1 the server receives the marker's bytes`, control.bytes === MARKER_TEXT, JSON.stringify(control));
  if (name === 'oracle') {
    const gap = await received(scope, exe, manual('--local-infile=0'), marker);
    check('(m) oracle control: an option file with load-data-local-dir and --local-infile=0 but no --no-defaults still sends the bytes', gap.bytes === MARKER_TEXT, JSON.stringify(gap));
  }
  const productionBuild = (port) => {
    const launchOf = product.buildDbQueryLaunch('mysql', `mysql://u:pw@127.0.0.1:${port}/db`, 'select 1', { bridged: true });
    return { args: launchOf.args, env: product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home, MYSQL_HOME: dir }, 'linux', launchOf.env) };
  };
  const production = await received(scope, exe, productionBuild, marker);
  check(`(m) ${name}: with the bridged arguments, the same option file and the allow-list environment, the server receives none of the bytes`, production.bytes === '' && production.requested, JSON.stringify(production));
}

async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the bridged mysql harness — Linux only');
    return 0;
  }
  const dir = ownedDir(scope, 'bridged-mysql');
  const product = {
    ...require(path.join(OUT, 'dbCliLauncher.js')),
    ...require(path.join(OUT, 'bridgedSshEnv.js')),
  };
  const clients = [['oracle', process.env.BRIDGED_MYSQL_ORACLE ?? '/usr/bin/mysql'], ['mariadb', process.env.BRIDGED_MYSQL_MARIADB ?? '/usr/bin/mariadb']];
  for (const [name, exe] of clients) {
    const version = fs.existsSync(exe) ? versionOf(exe) : undefined;
    console.log(`${name}: ${exe}: ${version ?? 'not found'}`);
    if (version === undefined) {
      check(`the ${name} client is installed`, process.env.CI !== 'true', `${exe} is missing — a skipped leg on the runner proves nothing`);
      continue;
    }
    check(`${exe} is the ${name} client`, name === 'mariadb' ? /MariaDB/i.test(version) : !/MariaDB/i.test(version), version);
    await legM(scope, dir, name, exe, product);
  }
  console.log(failures === 0 ? '\nall bridged mysql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
