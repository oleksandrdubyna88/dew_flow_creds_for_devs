'use strict';
// What the rows M2, M3 and M8 of G1 share (E3.S6; `todo/PLAN_person_roads_pin_host_key_E3_S6_spec.md` §1, §5.2): in each leg the entry is pinned to ONE key and the host at the entry's address presents ANOTHER, which
// one more source of trust would accept: a known-hosts file the client reads as the person's file (M2 (a)) or as the system-wide one (M2 (b)), a live master connection (M3), or a `KnownHostsCommand` (M8).
// Every source is made by the client config that the shim hands the real `ssh` (`-F`), in the leg's own folder, never by the person's `~/.ssh` (the client's `~` is in the person's real home: S4.F23).
// The roads are the registered commands with the real resolve, the real asker, the real runner and the real bridge spawner. The controls and the witnesses use words that are literal (`lib/otherKeyRecord.cjs`) or
// the road's own recorded argv, and a pin file that the lib writes from a `.pub`: never `hostKeyWords`, so a hand check of the product cannot change a control. They run after the counts (M8: before the mark),
// by the real client's path, so their logins are never counted as logins of a road. Like every row file this one starts no counterpart, no world and no process itself (the guards RR6 and RR7 read it).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');

const { sec, standIn, within, me } = rig;
/** After the last run: a start that a defect would add (the check of a bridge waits 1.5 s) is in the record by then. */
const SETTLE_MS = 2_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The stand-in of the install (made BEFORE the counterpart: its lines go into the counterpart's config), its nonce, and the listings before (§1.8). */
function standing(ctx) {
  const nonce = crypto.randomUUID();
  return { nonce, stand: standIn.installStandIn(ctx.rig, nonce), before: { files: standIn.listingOf(), tmp: standIn.tmpNames() } };
}

/** A pin file of the leg, `<leg>/pins/<name>`, holding the line of `keyFile`'s `.pub` for `port`, written by the lib (not by the product). Answers its path. */
function writePin(leg, name, port, keyFile) {
  const dir = path.join(leg.dir, 'pins');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, ok.knownHostsLineOf(port, fs.readFileSync(`${keyFile}.pub`, 'utf8')), { mode: 0o600 });
  return file;
}

/** M2's other source (§1.2): K2's line for `port` in the `.ssh` folder of the leg's home folder (user) or `<leg>/known_hosts_global` (global). Answers `{ role, path, sha256 }`. */
function writeSource(leg, spec, port) {
  const user = spec.source === 'user';
  const dir = user ? path.join(leg.home, '.ssh') : leg.dir;
  fs.mkdirSync(dir, { recursive: true });
  if (user) {
    fs.chmodSync(dir, 0o700);
  }
  const file = path.join(dir, user ? 'known_hosts' : 'known_hosts_global');
  fs.writeFileSync(file, ok.knownHostsLineOf(port, fs.readFileSync(`${leg.k2}.pub`, 'utf8')), { mode: 0o600 });
  return { role: spec.source, path: file, sha256: sha256(file) };
}

/** The options of the leg's handed config (§1.2): the other source goes IN PLACE of `/dev/null` (a file) or after the five lines (the master's lines, the command's). */
function optionsOf(leg, spec, source) {
  const options = {
    user: { userKnownHosts: source?.path },
    global: { globalKnownHosts: source?.path },
    master: { lines: ['ControlMaster auto', `ControlPath ${path.join(leg.dir, 'cm')}`, 'ControlPersist 120'] },
    command: { lines: [`KnownHostsCommand ${source?.path}`, 'VerifyHostKeyDNS no'] },
  };
  return options[spec.source];
}

/** What the real client resolves under the leg's config (`ssh -G`, with no word of a call): the answer's lines for the keys of §1.2. */
async function whichFiles(ctx, port) {
  const answer = await rig.viaReal(ctx.rig, ['-G', '-p', String(port), `${me}@127.0.0.1`]);
  const value = (key) => answer.stdout.split('\n').find((line) => line.startsWith(`${key} `))?.slice(key.length + 1) ?? null;
  return { code: answer.code, user: value('userknownhostsfile'), global: value('globalknownhostsfile'), command: value('knownhostscommand'), dns: value('verifyhostkeydns'), control: value('controlpath'), master: value('controlmaster') };
}

/** The records of the recording command, as texts, in the order of their names. */
function khcRecords(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.start')).sort().map((name) => fs.readFileSync(path.join(dir, name), 'utf8')) : [];
}

/** The three roads of a refused leg (§1.7 step 5), bounded: the install, the bridge, the bridge's ssh ended (15 s), the mode check ran (40 s), then the settling time. Answers what each did. */
async function driveRefusedRoads(ctx, roads) {
  const leg = ctx.rig;
  const { product } = ctx;
  const install = await rig.press(leg, roads, 'installRemoteCli', 30_000);
  const bridge = await rig.press(leg, roads, 'openRemoteBridge', 30_000);
  const ended = await within(15_000, () => roads.w.ended.includes(product.world.KEY) && !roads.w.bridges.isOpen(product.world.KEY));
  const remote = roads.bridges[0]?.remote;
  const ran = remote !== undefined && (await within(40_000, () => sec.runOf(roads, product.modeCheckCommand({ path: remote })) !== undefined));
  await sleep(SETTLE_MS);
  return { install, bridge, bridgeEnded: ended, modeCheckRan: ran };
}

/**
 * The switch of a leg (§1.7), the install's question held open: the click is started and not waited for; when the question is open, `theSwitch` ends K1 (`spec.stop`) and K2 takes its port; the
 * logs' lengths at that moment are the switch mark; `between(k2)` runs (M3's check of the master); the answer is released, and the click settles within 60 s. Answers `{ click, k2, switchMark, ended, shown }`.
 */
async function driveSwitch(ctx, spec, roads, answer, k1, extra, between = async () => undefined) {
  const leg = ctx.rig;
  const click = rig.pressNow(leg, roads, 'installRemoteCli');
  const asked = await within(30_000, () => roads.w.asked.length >= 1);
  ctx.check(`${leg.label}: the install reached its question, and it is held open (${spec.row}.s1)`, asked && !click.settled(), JSON.stringify({ asked: roads.w.asked.length }));
  const k2 = await rig.theSwitch(ctx.check, leg, k1, { name: 'k2', hostKey: leg.k2, extra, stop: spec.stop });
  const switchMark = { k1: k1.sshd.stderr.length, k2: k2 === undefined ? 0 : k2.sshd.stderr.length };
  await between(k2);
  const said = roads.w.said.length;
  answer.release();
  const ended = await within(60_000, () => click.settled());
  return { click, k2, switchMark, ended, shown: roads.w.said.slice(said) };
}

/** The bridge's stderr, from the file that the shim kept for its recorded start (D2); `null` when it is not there. A `null` fails the judge: it is never read as "no line". */
function bridgeStderrOf(leg, counts) {
  const start = counts.starts.list.find((one) => one.kind === 'bridge');
  const file = start === undefined ? undefined : path.join(leg.records, `${start.pid}.stderr`);
  return file !== undefined && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** The logs of `servers` hold a connection for each of `wanted` connection starts, or 3 s have passed (the log arrives through a pipe, a moment after the connection). */
async function logsArrived(roads, servers, wanted) {
  const from = rig.markOf(roads);
  await Promise.all(servers.map((server) => within(3_000, () => rec.logCounts(server.sshd.stderr.slice(from.logs[server.name] ?? 0), me).connections >= wanted)));
}

/** The connection starts after the mark, with their argv (the shim's records; no start of a control or a master is among them). */
function connectionStarts(leg, roads) {
  const from = rig.markOf(roads);
  return sec.recordedStarts(leg).filter((start) => !from.starts.has(start.file) && rec.isConnectionStart(start.argv));
}

/** M?.1 and M?.2: the judge of the four refused runs (the bridge's line from its own stderr file), and "no install run". Answers the bridge's stderr. */
function refusedChecks(ctx, label, counts, row, { noInstall = true } = {}) {
  const bridgeStderr = bridgeStderrOf(ctx.rig, counts);
  const judged = ok.refusedRoads(counts, bridgeStderr);
  ctx.check(`${label}: each of the four runs that start ended with exit code 255 and the verification line: exactly four connection starts (the probe, the bridge, the sweep, the mode check); the bridge's line read from its own stderr file (${row}.1)`, judged.ok, judged.detail);
  if (noInstall) {
    const installs = counts.starts.list.filter((one) => one.kind === 'install').length;
    ctx.check(`${label}: the record of the client's starts holds no install run (${row}.2)`, installs === 0, JSON.stringify({ installs }));
  }
  return bridgeStderr;
}

/** "0 forwards" (§1.5): after the bridge's ssh ended the remote socket's path does not exist and nothing listens on it (`ss -lx`). Answers what was read, for the evidence. */
async function socketChecks(ctx, label, roads, id, words) {
  const paths = roads.bridges.map((one) => one.remote).filter((remote) => remote !== undefined);
  const listed = await rig.listeningNow();
  const state = { paths: paths.map((one) => path.basename(one)), existing: paths.filter(sec.isSocket).length, listening: listed === null ? null : paths.filter((one) => listed.includes(one)).length, bridgesEnded: roads.bridges.every((one) => one.exitedAt !== null) };
  ctx.check(`${label}: ${words} (${id})`, paths.length > 0 && state.bridgesEnded && state.existing === 0 && state.listening === 0, JSON.stringify(state));
  return state;
}

/** The stand-in guard (§1.8): the marker was not written, and the listing of `/usr/local/bin/creds` and `/tmp/creds-install.*` is the same before and after; no new `creds-*` name in `/tmp` but the bridge's own socket. */
function standInGuard(ctx, label, given, roads, id, opening = 'the stand-in: its marker was not written') {
  const own = roads.bridges.filter((one) => one.remote !== undefined).map((one) => path.basename(one.remote));
  const fresh = standIn.tmpNames().filter((name) => !given.before.tmp.includes(name) && !own.includes(name) && /^creds-/.test(name));
  const same = JSON.stringify(given.before.files) === JSON.stringify(standIn.listingOf());
  ctx.check(`${label}: ${opening}, and the listing of /usr/local/bin/creds and /tmp/creds-install.* is the same before and after (${id})`, !fs.existsSync(given.stand.marker) && same && fresh.length === 0, JSON.stringify({ marker: fs.existsSync(given.stand.marker), same, fresh }));
}

/**
 * One login of the real client by its path with `words` of the row's own (a control or a witness), after the counts: `{ argv, code, stdout, stderr, before, after, session }`, `before` and `after` being
 * the counts of `server`'s log (accepted logins, `Connection from` lines, `Starting session` lines). Waits (5 s) for a new session line: a login that is refused adds none.
 */
async function login(ctx, server, words, command = 'true') {
  const snap = () => ({ accepted: rec.logCounts(server.sshd.stderr, me).accepted.length, connections: rec.logCounts(server.sshd.stderr, me).connections, sessions: ok.sessionsOf(server.sshd.stderr, me).length });
  const before = snap();
  const result = await rig.controlClient(ctx.rig, { port: server.port, words, command });
  await within(5_000, () => snap().sessions > before.sessions);
  return { ...result, before, after: snap(), session: rec.logCounts(server.sshd.stderr, me).accepted.at(-1)?.session ?? null };
}

/** The words before `-i` of a control's argv (what the row's check holds to the literal words). */
const wordsOf = (argv) => argv.slice(0, argv.indexOf('-i'));

/** The accepted logins of `server`, read once its log holds one more than `from` (or after 5 s). */
async function acceptedAfter(server, from) {
  await within(5_000, () => rec.logCounts(server.sshd.stderr, me).accepted.length >= from + 1);
  return rec.logCounts(server.sshd.stderr, me);
}

/**
 * The A2 check (the lead's answer A2): every `<pid>.stderr` file in the leg's records belongs to a recorded start that is a bridge (`-N`): the shim takes only a stderr that the product
 * ignored, and the product ignores only the bridge's. A leg with no bridge has none. Answers the files that belong to no bridge.
 */
function stderrFilesCheck(ctx, label) {
  const leg = ctx.rig;
  const bridges = new Set(sec.recordedStarts(leg).filter((start) => start.argv.includes('-N')).map((start) => String(start.pid)));
  const files = fs.readdirSync(leg.records).filter((name) => name.endsWith('.stderr'));
  const strays = files.filter((name) => !bridges.has(name.slice(0, -'.stderr'.length)));
  ctx.check(`${label}: every <pid>.stderr file in the records belongs to a start of the bridge: the shim took no stderr that the product reads (A2)`, strays.length === 0, JSON.stringify({ files: files.length, bridges: bridges.size, strays }));
  return strays;
}

/** The fields of the evidence that every leg shares (§1.9). */
const commonEvidence = (spec, hash, counts, fields) => ({ scenario: spec.scenario, cold: counts.starts.questions === 1, config: hash, ...fields });

module.exports = {
  standing, writePin, writeSource, optionsOf, whichFiles, khcRecords, driveRefusedRoads, driveSwitch, bridgeStderrOf, logsArrived, connectionStarts, stderrFilesCheck, refusedChecks, socketChecks, standInGuard, login, wordsOf, acceptedAfter, commonEvidence, SETTLE_MS, sha256, sleep,
};
