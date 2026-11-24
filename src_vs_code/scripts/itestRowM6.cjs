'use strict';
// Row M6 of G1 (E3.S4; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md` §7): every call owns
// its files, calls do not disturb each other, nothing is left. Ten legs, each cold, each its own process, world and counterpart(s), each with the
// real resolve over a vault of its own credential: a stored key, a key that the person named by its path, a password. Before the first click the leg
// writes `keys/<pid>/known_hosts-e1` (the file of an entry that this window does not own) and reads the SHA-256 of the person's key file.
//   (a) two installs that overlap, (b) a bridge with its check, (c) a bridge replaced by a second (the gate is on: a call is held at its first run, so
//   the overlap is made and not hoped for); (d) the password entry against K2, the entry pinned to K1 (no gate).
// Each check holds the words of M6's last column. A proving run of this file passes no row. `askpass.sh` is the window's helper, not a file of a
// call (the lead's answer A2): it is listed by name and SHA-256, and not counted among the files of these calls.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');

const { sec, standIn, within, me } = rig;
const VERIFY_FAILED = sec.VERIFY_FAILED;

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const base = (file) => path.basename(file);
/** The calls' pin and key files named in a sample of `point`. */
const sampleOf = (roads, point) => roads.sampler.samples().find((one) => one.point === point);

/** The leg's start: the counterpart, `known_hosts-e1` in the folder, the person's key file read, a new world with the gate. Answers the setup, or `undefined`. */
async function begin(ctx, credential, { stand, k2 = false, gate = true }) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const passwords = credential === 'password';
  const server = k2 ? await rig.counterpart(check, leg, 'k2', leg.k2, { passwords }) : await rig.counterpart(check, leg, 'k1', leg.k1, { extra: stand?.extra ?? [], passwords });
  if (server === undefined) {
    return undefined;
  }
  const folder = product.materializedKeysDir(leg.storage);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const pinLine = product.knownHostsLine('127.0.0.1', server.port, product.parseHostKey(leg.pin));
  const knownFile = path.join(folder, 'known_hosts-e1');
  fs.writeFileSync(knownFile, pinLine);
  const roads = rig.openRoads(leg, server.port, { credential, answer: stand === undefined ? undefined : rig.installAnswer(leg), gate });
  return {
    credential, server, roads, stand, pinLine, personKey: sha256(leg.userKey), known: { name: 'known_hosts-e1', sha256: sha256(knownFile) },
    keyText: credential === 'stored' ? fs.readFileSync(leg.storedKey, 'utf8') : undefined,
  };
}

/** How many calls the leg's runs and bridges make: a call starts with its probe, its sweep or its bridge (counted apart from the pin files, so M6.2 asks both). */
const callCountOf = (counts) => counts.runs.filter((run) => run.kind === 'probe' || run.kind === 'sweep').length + counts.bridges.length;

/** The mode checks that have ended, over every bridge of the leg. */
const modeRuns = (product, roads) => roads.outcomes.filter((one) => roads.bridges.some((bridge) => bridge.remote !== undefined && product.modeCheckCommand({ path: bridge.remote }) === one.argv.at(-1))).length;

/** Whether the sample taken at `point` holds the pin file of every one of `pins`. */
const holdsPins = (roads, point, pins) => pins.every((pin) => sampleOf(roads, point)?.files[base(pin)] !== undefined);

/** (a) Two installs that overlap: O1 both held, O2 the first released and ended, O3 both ended. */
async function installs(ctx, setup) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const { roads } = setup;
  const clicks = [rig.pressNow(leg, roads, 'installRemoteCli'), rig.pressNow(leg, roads, 'installRemoteCli')];
  const held = await roads.gate.waitHeld(2, 30_000);
  roads.sampler.take('O1');
  const pins = roads.gate.held();
  check(`${leg.label}: two installs that overlap: both calls wrote their files and are held at their probe, and both pin files are on the disk at O1 (M6.3)`, held && pins.length === 2 && holdsPins(roads, 'O1', pins), JSON.stringify({ held: pins.map(base) }));
  roads.gate.release(pins[0]);
  await within(200_000, () => clicks.some((click) => click.settled()));
  roads.sampler.take('O2');
  roads.gate.release(pins[1]);
  const both = await within(200_000, () => clicks.every((click) => click.settled()));
  roads.sampler.take('O3');
  const installed = roads.outcomes.filter((one) => one.argv.at(-1) === product.installCommand());
  const done = `\`creds\` is installed on "${product.world.ROW.node.name}" at ${path.join(setup.stand.bin, 'creds')}.`;
  const probes = roads.outcomes.filter((one) => one.argv.at(-1) === product.probeCommand());
  const warned = roads.w.warnings.filter((text) => text.startsWith(`Cannot install on "${product.world.ROW.node.name}"`));
  const keyLeg = setup.credential !== 'password';
  check(`${leg.label}: both installs ended: ${keyLeg ? 'a key leg ran both to their end (two install runs with 0, the product\'s message for an installed creds twice)' : 'a password leg ended each at its probe (255, the product\'s "Cannot install" warning twice): the counterpart cannot check a password'} (M6.12)`, both && (keyLeg
    ? installed.length === 2 && installed.every((one) => one.outcome?.exitCode === 0) && roads.w.infos.filter((text) => text === done).length === 2
    : probes.length === 2 && probes.every((one) => one.outcome?.exitCode === 255) && installed.length === 0 && warned.length === 2), JSON.stringify({ both, installed: installed.map((one) => one.outcome?.exitCode), probes: probes.map((one) => one.outcome?.exitCode), warned }));
  return { expectedCalls: 2, points: [{ point: 'O2', ended: 1 }, { point: 'O3', ended: 2 }] };
}

/** (b) A bridge with its check: O1 the check is held at its sweep, O2 its mode outcome, O3 the bridge closed. */
async function bridge(ctx, setup) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const { roads } = setup;
  const w = roads.w;
  const keyLeg = setup.credential !== 'password';
  const click = await rig.press(leg, roads, 'openRemoteBridge', 30_000);
  const held = await roads.gate.waitHeld(1, 40_000);
  roads.sampler.take('O1');
  const first = roads.bridges[0];
  const pins = roads.gate.held();
  const bridgePin = sec.pinOf(product, first?.argv ?? []);
  const endedBeforeO1 = first?.exitedAt !== null && first?.exitedAt < sampleOf(roads, 'O1').t;
  const bound = keyLeg && first?.remote !== undefined && (await within(5_000, () => sec.isSocket(first.remote)));
  info(`${leg.label}: at O1 the bridge's ssh ${endedBeforeO1 ? 'had ended by itself (the two calls did not overlap)' : 'was alive'}`);
  check(`${leg.label}: a bridge with its check: Open Remote Bridge… ended within 30 s, the check is held at its sweep, and at O1 ${keyLeg ? "the check's and the bridge's pin files are both on the disk, the bridge is alive and its socket is there" : "the check's pin file is on the disk"} (M6.3)`, click.ended && held && pins.length === 1 && holdsPins(roads, 'O1', keyLeg ? [...pins, bridgePin] : pins) && (!keyLeg || (w.bridges.isOpen(product.world.KEY) && bound)), JSON.stringify({ click, held: pins.map(base), bridgePin: bridgePin === undefined ? null : base(bridgePin), bound }));
  roads.gate.release(pins[0]);
  const mode = await within(40_000, () => modeRuns(product, roads) >= 1);
  roads.sampler.take('O2');
  await rig.press(leg, roads, 'closeRemoteBridge', 5_000);
  const ended = await within(5_000, () => first?.exitedAt !== null);
  roads.sampler.take('O3');
  check(`${leg.label}: the check's mode run ended within 40 s, and the bridge's ssh ended within 5 s of Close Remote Bridge (or by itself)`, mode && ended, JSON.stringify({ mode, ended }));
  return { expectedCalls: 2, points: [{ point: 'O2', ended: 1 }, { point: 'O3', ended: 2 }] };
}

/** (c) A bridge replaced by a second: two clicks in the same tick; O1 both checks held, O2 the first released, O3 the second, O4 the second bridge closed. */
async function replaced(ctx, setup) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const { roads } = setup;
  const keyLeg = setup.credential !== 'password';
  const clicks = [rig.pressNow(leg, roads, 'openRemoteBridge'), rig.pressNow(leg, roads, 'openRemoteBridge')];
  const settled = await within(30_000, () => clicks.every((click) => click.settled()));
  const [first, second] = roads.bridges;
  // The manager kills the first bridge's ssh at the second start: it can die before its shim wrote a record, so its end is the child's own `exited`, and the shim's record when there is one.
  const firstStart = sec.recordedStarts(leg).find((one) => first?.remote !== undefined && sec.remoteOf(one.argv) === first.remote);
  const replacedFirst = await within(5_000, () => first?.exitedAt !== null && (firstStart === undefined || !rig.alive(firstStart)));
  check(`${leg.label}: a bridge replaced by a second: both clicks settled within 30 s, two bridges were spawned, and the first spawned one ended within 5 s with no Close (its exit, and its recorded pid when the shim recorded one)${keyLeg ? ', one bridge is open' : ''}`, settled && roads.bridges.length === 2 && replacedFirst && (!keyLeg || roads.w.bridges.keys().length === 1), JSON.stringify({ settled, bridges: roads.bridges.length, replacedFirst, shimRecorded: firstStart !== undefined, open: roads.w.bridges.keys() }));
  const held = await roads.gate.waitHeld(2, 40_000);
  roads.sampler.take('O1');
  const pins = roads.gate.held();
  const secondPin = sec.pinOf(product, second?.argv ?? []);
  check(`${leg.label}: both checks are held at their sweep, and at O1 both check pin files${keyLeg ? " and the second bridge's" : ''} are on the disk (M6.3)`, held && pins.length === 2 && holdsPins(roads, 'O1', keyLeg ? [...pins, secondPin] : pins), JSON.stringify({ held: pins.map(base) }));
  roads.gate.release(pins[0]);
  await within(40_000, () => modeRuns(product, roads) >= 1);
  roads.sampler.take('O2');
  roads.gate.release(pins[1]);
  await within(40_000, () => modeRuns(product, roads) >= 2);
  roads.sampler.take('O3');
  await rig.press(leg, roads, 'closeRemoteBridge', 5_000);
  const ended = await within(5_000, () => second?.exitedAt !== null);
  roads.sampler.take('O4');
  const firstMode = roads.outcomes.find((one) => first?.remote !== undefined && one.argv.at(-1) === product.modeCheckCommand({ path: first.remote }));
  info(`${leg.label}: seen, not judged: the first spawned bridge is the one named ${first?.remote === undefined ? '?' : base(first.remote)} (exit ${first?.exitCode}), and its check's mode run answered ${JSON.stringify(firstMode?.outcome?.stdout ?? null)} with exit ${firstMode?.outcome?.exitCode ?? null}`);
  check(`${leg.label}: both checks ended their mode run, and the second bridge's ssh ended within 5 s of Close Remote Bridge (or by itself)`, modeRuns(product, roads) >= 2 && ended, JSON.stringify({ modes: modeRuns(product, roads), ended }));
  return { expectedCalls: 4, points: [{ point: 'O2', ended: 2 }, { point: 'O3', ended: 3 }, { point: 'O4', ended: 4 }] };
}

/** (d) The password entry against K2: no gate; the three roads once. */
async function againstK2(ctx, setup) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const { roads } = setup;
  await rig.press(leg, roads, 'installRemoteCli', 30_000);
  await rig.press(leg, roads, 'openRemoteBridge', 30_000);
  const remote = roads.bridges[0]?.remote;
  const mode = remote !== undefined && (await within(40_000, () => modeRuns(product, roads) >= 1));
  check(`${leg.label}: the install's probe was refused, the bridge's ssh ended by itself, and the check's mode run ended within 40 s`, mode && (await within(15_000, () => roads.bridges[0].exitedAt !== null)), JSON.stringify({ remote }));
  return { expectedCalls: 3, points: [] };
}

/** M6.2 and the checks every leg ends with: the calls, their files, the person's key, what is left, the counterpart's log. */
async function finish(ctx, setup, scenario) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const { roads, server } = setup;
  const counts = rig.countsOf(leg, roads, [server]);
  const calls = rig.callsOf(leg, roads, product);
  const callCount = callCountOf(counts);
  check(`${leg.label}: the calls are ${scenario.expectedCalls} (${callCount} counted by their first runs and bridges) and their pin paths are distinct, as many as the calls (M6.2)`, callCount === scenario.expectedCalls && calls.length === callCount && new Set(calls.map((call) => call.pin)).size === callCount, JSON.stringify({ callCount, calls: calls.map((call) => base(call.pin)) }));
  const stored = setup.credential === 'stored';
  check(`${leg.label}: ${stored ? 'every call of a stored key names a key file of its own in keys/<pid>/' : 'no call names a key file in keys/<pid>/: the key is the person\'s own file or there is none'}`, calls.length > 0 && calls.every((call) => (call.keyFile !== undefined) === stored), JSON.stringify(calls.map((call) => call.keyFile ?? null)));
  await rig.nothingLeft(check, leg.label, leg, roads, calls, { sockets: true });
  rig.callFilesHold(check, leg.label, leg, roads, calls, { pinLine: setup.pinLine, keyText: setup.keyText, knownHosts: setup.known, points: scenario.points });
  check(`${leg.label}: the person's own key file has the same bytes after (M6.8)`, sha256(leg.userKey) === setup.personKey, setup.personKey);
  return { counts };
}

/** M6.13: with K1 the counterpart's log shows that the password attempt arrived; the result says which. */
function passwordChecks(ctx, setup, counts) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const log = rec.logCounts(setup.server.sshd.stderr, me);
  info(`${leg.label}: the counterpart logged ${log.passwords.failed} Failed password and ${log.passwords.accepted} Accepted password (${counts.starts.connectionStarts} connection starts)`);
  check(`${leg.label}: with K1 the counterpart's log shows that the password attempt arrived: at least one password line for the run's user (M6.13)`, log.passwords.failed + log.passwords.accepted >= 1, JSON.stringify(log.lines.slice(-8)));
}

/** M6.14: with K2 the log shows a connection for each connection start and 0 authentication attempts; each run ended with 255 and the verification line. */
function k2Checks(ctx, setup, counts) {
  const { check } = ctx;
  const leg = ctx.rig;
  const log = rec.logCounts(setup.server.sshd.stderr, me);
  const refused = counts.runs.length > 0 && counts.runs.every((run) => run.exitCode === 255 && run.stderr.includes(VERIFY_FAILED));
  check(`${leg.label}: with K2 the counterpart logged a connection for each of the ${counts.starts.connectionStarts} connection starts and 0 authentication attempts (no line matches AUTH_ATTEMPT); each run ended with 255 and the verification line (M6.14)`, log.connections >= counts.starts.connectionStarts && counts.starts.connectionStarts > 0 && !rec.AUTH_ATTEMPT.test(setup.server.sshd.stderr) && log.authAttempts === 0 && refused, JSON.stringify({ connections: log.connections, starts: counts.starts.connectionStarts, lines: log.lines.filter((line) => rec.AUTH_ATTEMPT.test(line)), runs: counts.runs.map((run) => run.exitCode) }));
}

/** A leg of M6: `scenario` is one of the four above. */
async function oneLeg(ctx, credential, scenario, { k2 = false } = {}) {
  const stand = scenario === installs ? standIn.installStandIn(ctx.rig, crypto.randomUUID()) : undefined;
  const setup = await begin(ctx, credential, { stand, k2, gate: !k2 });
  if (setup === undefined) {
    return;
  }
  const decided = await scenario(ctx, setup);
  const { counts } = await finish(ctx, setup, decided);
  if (k2) {
    k2Checks(ctx, setup, counts);
  } else if (credential === 'password') {
    passwordChecks(ctx, setup, counts);
  }
  await rig.endCounterpart(ctx.check, ctx.rig, setup.server, setup.server.key);
  rig.evidence(ctx.rig, setup.roads, [setup.server], { scenario: scenario.name, expectedCalls: decided.expectedCalls });
}

const legs = {
  'm6-stored-installs': (ctx) => oneLeg(ctx, 'stored', installs),
  'm6-named-installs': (ctx) => oneLeg(ctx, 'named', installs),
  'm6-password-installs': (ctx) => oneLeg(ctx, 'password', installs),
  'm6-stored-bridge': (ctx) => oneLeg(ctx, 'stored', bridge),
  'm6-named-bridge': (ctx) => oneLeg(ctx, 'named', bridge),
  'm6-password-bridge': (ctx) => oneLeg(ctx, 'password', bridge),
  'm6-stored-replaced': (ctx) => oneLeg(ctx, 'stored', replaced),
  'm6-named-replaced': (ctx) => oneLeg(ctx, 'named', replaced),
  'm6-password-replaced': (ctx) => oneLeg(ctx, 'password', replaced),
  'm6-password-k2': (ctx) => oneLeg(ctx, 'password', againstK2, { k2: true }),
};

/** Section 10 runs every leg of M6, one leg process after another. */
async function rowM6(check, top) {
  for (const name of Object.keys(legs)) {
    await rig.runLeg(check, top, 'M6', name);
  }
}

module.exports = { legs, rowM6 };
