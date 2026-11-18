// Section 10 of `ssh-agent-itest.cjs` (G1, `todo/PLAN_person_roads_pin_host_key_E1.md`, E1.S4), in a file of its own so that script stays
// under the 800-line limit.
//
// A pinned entry's roads must start `ssh` only against the saved host key. The unit tests show the words a pinned call SENDS and the file it
// writes; only a real `ssh` against a real `sshd` shows what the words DO (`testing.md`: a sent option is not a measured protection). So this
// drives the REGISTERED commands *Install creds on host* and *Open Remote Bridge…* (whose socket check is the third road) through the compiled
// test world `out/test/personRoadsWorld.js`, with the real runner, the real bridge spawner, the real pin writer and the real deletes, and the
// real `ssh` (through a shim first on PATH that records each start) against ONE `sshd -D -e` per leg, which serves every connection:
//   leg 1  pinned to K1, K1 answers: the install reaches its question, the socket check reads the socket's mode, K1 logs one accepted
//          login per connection, the question `ssh -V` of the real product starts once, before the connections, and every connection
//          carries the pin words and E2's three pairs, and no pin file and no client is left;
//   leg 2  still pinned to K1, K2 answers at the same address: every start ends with `Host key verification failed.`, K2 logs no login,
//          the install shows sentence C and the bridge's check shows its message, the real client's `Offending` line names the pin file
//          of the probe and of the mode check, and no sentence D is shown.
// The control, by hand (`hostKeyWords` made to answer `accept-new`), turns leg 2 red: K2 then logs the logins.
//
// Linux only: the end of a server reads `/proc`. Where `CI=true` a missing sshd FAILS. The world's stand-ins that stay: `vscode`, and
// `resolveExecAuth`, which hands a key the run named by its path. Teardown, per leg: the bridges, then the server by the bounded recipe of
// the stories document (its descendants listed while it lives, the clients, then the rest by pid and start time, then the listener), then the
// forwarded socket by its exact path; the section's folder last.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, endChild, freePort, listeningFailure } = require('./itestSshd.cjs');
const { tool, within, settledAfter } = require('./itestNoSharing.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

const me = os.userInfo().username;
const VERIFY_FAILED = 'Host key verification failed.';
/** A line of an sshd log that only a client past the key check can cause. */
const AUTH_ATTEMPT = /Accepted |Failed |Postponed |Invalid user|authenticating user/;

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
/** How many times `pattern` (a source, no flags) occurs in `text`. */
const occurrences = (text, pattern) => (text.match(new RegExp(pattern, 'g')) ?? []).length;

/** The pairs that E2 adds to every pinned connection, with the value for a client that knows `KnownHostsCommand` (the plan's §3.10, §3.12 part 1). */
const NEW_PAIRS = { VerifyHostKeyDNS: 'no', KnownHostsCommand: 'none', LogLevel: 'ERROR' };

/** Whether `stderr` holds the real client's evidence for sentence C: the whole line `Offending <type> key in <file>:<n>`, `file` being the pin file of that run. */
const namesPinFile = (stderr, file) => file !== undefined && new RegExp(String.raw`^Offending \S+ key in ${literal(file)}:\d+\r?$`, 'm').test(stderr);

/** The compiled modules this section reads, loaded ONCE before any world: `world()` evicts every module of `out/` from the require cache. */
function productOf(out) {
  const load = (file) => require(path.join(out, file));
  return {
    ...load('sshBridge.js'), // sweepCommand, modeCheckCommand, interpretSocketProbe, isOwnerOnlyMode
    ...load('remoteCliInstall.js'), // probeCommand, interpretProbe, blockerFor, confirmationFor
    ...load('hostKeyPin.js'), // parseHostKey, formatHostKey, knownHostsLine, refusedHostKeySentence (sentence C), unnamedHostKeySentence (sentence D)
    ...load('pinClient.js'), // pinClientOf: how the product reads `ssh -V` (E2.S1)
    ...load('materializedKeys.js'), // materializedKeysDir
    runner: load('sshExecRunner.js'),
    spawner: load('bridgeSpawner.js'),
    world: load(path.join('test', 'personRoadsWorld.js')),
    argv: load(path.join('test', 'pinnedArgv.js')),
  };
}

/** Sentence C of an entry's name, and the bridge's form of it: both are read back from the product (E1.S3), never typed here. */
const sentenceC = (product, name) => product.refusedHostKeySentence(name);
const bridgeForm = (product, name) => `The bridge to "${name}" is not open: ${product.refusedHostKeySentence(name)}`;

/** The config of a serving sshd. `penalties` false leaves `PerSourcePenalties no` out, for an sshd older than 9.8, which has no penalties. */
function servingConfig(rig, dir, hostKey, port, penalties) {
  return [
    `ListenAddress 127.0.0.1:${port}`,
    `HostKey ${hostKey}`,
    `AuthorizedKeysFile ${rig.authorizedKeys}`,
    `PidFile ${path.join(dir, 'sshd.pid')}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    // `Connection from …` is a VERBOSE line: it is how K2's log shows that leg 2 reached it (T37). `Accepted publickey` is there at any level.
    'LogLevel VERBOSE',
    // Measured on sshd 10.2 (2026-11-17): with the default, a run of refused host keys makes the listener refuse every next connection.
    ...(penalties ? ['PerSourcePenalties no'] : []),
    '',
  ].join('\n');
}

/** One start of the listener, waited for (10 s) by its "Server listening" line. */
async function startOnce(rig, dir, hostKey, port, penalties) {
  const config = path.join(dir, 'sshd_config');
  fs.writeFileSync(config, servingConfig(rig, dir, hostKey, port, penalties));
  const sshd = launch(rig.scope, SSHD, ['-D', '-e', '-f', config]);
  // The listener's identity, taken at once: the pid and the start time it has from the fork on. Once `sshd.exited` its pid may be another process's.
  const identity = { pid: sshd.child.pid, start: startOf(sshd.child.pid) };
  const listening = new RegExp(String.raw`Server listening on 127\.0\.0\.1 port ${port}`);
  return { sshd, identity, port, failure: await listeningFailure(sshd, listening, Date.now() + 10_000) };
}

/**
 * One `sshd -D -e` that serves EVERY connection to 127.0.0.1:`port` (a free port when none is given), in a folder `name` of its own: the
 * multi-connection mode of the stories document, a starter of this section because `startSshd` (`itestSshd.cjs`) runs `sshd -d`, which
 * serves one connection. Once more without `PerSourcePenalties no` when this sshd does not know the word, and once more after 300 ms when the
 * port is still held (K2 on K1's port: the same port; a free port taken here: a fresh one). `launch` registers the listener's end with the scope; `endServer` is the leg's own, first.
 */
async function startServingSshd(rig, name, hostKey, port) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  let chosen = port ?? (await freePort());
  let penalties = true;
  let started = await startOnce(rig, dir, hostKey, chosen, penalties);
  if (started.failure !== undefined && /PerSourcePenalties/.test(started.sshd.stderr)) {
    console.log(`info  ${name}: this sshd does not know PerSourcePenalties (before 9.8 it has none); started without the line`);
    await endChild(started.sshd);
    penalties = false;
    started = await startOnce(rig, dir, hostKey, chosen, penalties);
  }
  if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
    await endChild(started.sshd);
    await new Promise((resolve) => setTimeout(resolve, 300));
    chosen = port ?? (await freePort());
    started = await startOnce(rig, dir, hostKey, chosen, penalties);
  }
  return started;
}

/** The start time of a running process (field 22 of `/proc/<pid>/stat`), or `undefined` when it does not run or is a zombie. */
function startOf(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // fields[0] is field 3, the state
    return fields[0] === 'Z' ? undefined : fields[19];
  } catch {
    return undefined;
  }
}

/** Whether `one` (`{ pid, start }`) still runs as the SAME process: a reused pid has another start time. */
const alive = (one) => one.start !== undefined && startOf(one.pid) === one.start;

/** Every pid below `pid` in the table `children` (parent → its children), each once. */
function below(children, pid) {
  return (children.get(pid) ?? []).flatMap((child) => [child, ...below(children, child)]);
}

/**
 * Every process below `root` now, with its start time: `ps -e -o pid=,ppid=`, walked from `root`. Answers `{ list, error }`: a `ps` that
 * failed is an `error` (the list is then empty and proves nothing), never a quiet empty list.
 */
async function descendantsOf(root) {
  const table = await new Promise((resolve) => {
    // The PATH lookup is on purpose, as `tool` does: `ps` of the machine the run is on.
    execFile('ps', ['-e', '-o', 'pid=,ppid='], { timeout: 5_000 }, (error, stdout) => resolve(error ? { error: String(error) } : { text: String(stdout) })); // NOSONAR: a CI rig
  });
  if (table.error !== undefined) {
    return { list: [], error: `ps failed: ${table.error}` };
  }
  const children = new Map();
  for (const line of table.text.trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  return { list: below(children, root).map((pid) => ({ pid, start: startOf(pid) })).filter((one) => one.start !== undefined), error: undefined };
}

/** A signal to every one of `list` that still runs as the same process. */
function signalAll(list, signal) {
  for (const one of list.filter(alive)) {
    try {
      process.kill(one.pid, signal);
    } catch {
      // it ended between the look and the signal
    }
  }
}

const noneAlive = (ms, list) => within(ms, () => !list.some(alive));

/**
 * What the listener of `server` forked, now, as `descendantsOf` answers: `{ list, error }`. Only while it is still the SAME listener: once its
 * `sshd` exited (its pid may be reused) nothing is listed, and a listener that was gone by the end of the `ps` snapshot (the table may then
 * be a foreign process's) gives an empty list too; the processes the leg recorded while it ran are the caller's `taken`.
 */
async function descendantsOfListener(server) {
  const same = () => !server.sshd.exited && alive(server.identity);
  if (!same()) {
    return { list: [], error: undefined };
  }
  const seen = await descendantsOf(server.identity.pid);
  return same() ? seen : { list: [], error: seen.error }; // a changed listener lists nothing, but a failed `ps` stays a failure
}

/**
 * Ends a serving sshd and everything it forked, bounded: (a) its descendants are listed now (`descendantsOfListener`: never the descendants
 * of a pid that sshd no longer has), beside `taken` (a list made earlier, before a client was ended: afterwards a remote command is no
 * descendant any more); (b) the clients still running are ended by their recorded pids;
 * (c) at most 3 s for the rest to go with them; (d) TERM to what is left, at most 2 s, then KILL, at most 2 s, each only to a pid whose start
 * time is still the recorded one; (e) the listener, by `endChild`. `taken` is `{ list, error }` of an earlier `descendantsOf`. Answers
 * `{ list, error }`, for T21 and T39: an `error` of either listing makes the check fail. Never throws.
 */
async function endServer(server, clients, taken) {
  const now = await descendantsOfListener(server);
  const list = [...taken.list, ...now.list];
  const error = taken.error ?? now.error;
  signalAll(clients, 'SIGTERM');
  if (!(await noneAlive(3_000, list))) {
    signalAll(list, 'SIGTERM');
    if (!(await noneAlive(2_000, list))) {
      signalAll(list, 'SIGKILL');
      await noneAlive(2_000, list);
    }
  }
  await endChild(server.sshd);
  return { list, error };
}

/**
 * Removes the forwarded socket of a bridge by its EXACT path: `sshd` makes it where the product names it (`/tmp/creds-<user>-<id>.sock`,
 * outside the owned folder) and never unlinks it. Only a socket, and only one this user owns. Never throws.
 */
function removeSocket(socketPath) {
  try {
    const stat = fs.lstatSync(socketPath);
    if (stat.isSocket() && stat.uid === process.getuid()) {
      fs.rmSync(socketPath);
    }
  } catch {
    // not there: nothing to remove
  }
}

const isSocket = (socketPath) => {
  try {
    return fs.lstatSync(socketPath).isSocket();
  } catch {
    return false;
  }
};

/** The remote socket path of a recorded bridge argv: the `-R` value up to its first `:`. */
const remoteOf = (argv) => (argv.includes('-R') ? argv[argv.indexOf('-R') + 1].split(':')[0] : undefined);

/** `text` in single quotes for `sh`: a `'` inside ends the quote, is escaped, and opens it again. */
const shQuote = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/** The real path of an executable file, or `undefined`. */
function realExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.realpathSync(file);
  } catch {
    return undefined;
  }
}

/**
 * The real `ssh`: the first on this process's PATH whose REAL path is outside `shimDir` (`testing.md`: a shim resolves the program it wraps
 * once, at install, with its own folder out of the lookup, by real path, and never at run time).
 */
function realSsh(shimDir) {
  const own = fs.realpathSync(shimDir);
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter((dir) => dir !== '');
  return dirs
    .map((dir) => realExecutable(path.join(dir, 'ssh')))
    .find((real) => real !== undefined && path.dirname(real) !== own && !real.startsWith(`${own}${path.sep}`));
}

/**
 * Writes `<shim>/ssh`: it records each start as `<records>/<pid>.argv` (its pid, its start time, how many words, then each word, every one ended
 * by a NUL byte: the probe's command holds newlines), then becomes the real client by `exec` (so the recorded pid IS the client's), with the
 * rig's config before the product's argv. `set -C`: a record that exists already is never overwritten, and that start fails with 97. Answers the real path, or `undefined`.
 */
function installShim(rig) {
  const real = realSsh(rig.shimDir);
  if (real !== undefined) {
    const record = `${shQuote(rig.records)}/"$$".argv`;
    const lines = [
      '#!/bin/sh',
      '# The ssh of section 10 of ssh-agent-itest.cjs: it records this start, then becomes the real client. Written once, at install.',
      'set -C',
      `{ printf '%s\\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${record} || exit 97`,
      `exec ${shQuote(real)} -F ${shQuote(rig.clientConfig)} "$@"`,
      '',
    ];
    fs.writeFileSync(path.join(rig.shimDir, 'ssh'), lines.join('\n'), { mode: 0o700 });
  }
  return real;
}

/**
 * The client config the shim hands the real `ssh`, so the person's `~/.ssh/config` and `/etc/ssh/ssh_config` are not read. Its two lines
 * are what a call WITHOUT the pin words falls back to (the control MC1): no known-hosts file at all, so every host is a first contact and
 * nothing is written into the person's files. A command-line `-o` wins over these (E1.S1's fact K9), so a pinned call reads its pin file.
 */
function writeClientConfig(rig) {
  fs.writeFileSync(rig.clientConfig, 'Host *\n  UserKnownHostsFile /dev/null\n  GlobalKnownHostsFile /dev/null\n');
}

/** Every start the shim recorded: `{ file, pid, start, argv, whole }`; `whole` is false when the count of words does not match. */
function recordedStarts(rig) {
  return fs.readdirSync(rig.records).filter((name) => name.endsWith('.argv')).sort().map((file) => {
    const [pid, start, size, ...argv] = fs.readFileSync(path.join(rig.records, file), 'utf8').split('\0').slice(0, -1);
    return { file, pid: Number(pid), start, argv, whole: argv.length === Number(size) };
  });
}

/** The credential the world's resolver hands each click and the check: a key the run named by its path, so no key file is deleted. */
const credentialOf = (rig) => ({ ok: true, keyPath: rig.userKey, env: rig.env, auth: 'key' });

/** The real `runSshExec`, recording each run's argv and outcome. It changes nothing of what the product gets. */
function recordingRunner(runner, outcomes) {
  return {
    runSshExec: (argv, options) =>
      runner.runSshExec(argv, options).then(
        (outcome) => {
          outcomes.push({ argv, outcome });
          return outcome;
        },
        (error) => {
          outcomes.push({ argv, error: String(error) });
          throw error;
        },
      ),
  };
}

/** The world of one leg: the real agent commands, the real runner and spawner, the real pin writer and deletes, the entry pinned to K1 at `port`. */
function openLeg(rig, port) {
  const { product } = rig;
  const outcomes = [];
  const reported = [];
  const w = product.world.world({
    host: '127.0.0.1',
    user: me,
    port,
    hostKey: rig.pin,
    storageDir: rig.storage,
    realForget: true,
    // The real asker of the client (E2): the product asks the real client `ssh -V` through the shim. Without it the world's stand-in answers `knows` and no question starts.
    realClient: true,
    clicks: [credentialOf(rig), credentialOf(rig)],
    checks: [credentialOf(rig)],
    spawn: product.spawner.bridgeSpawner({ report: (error) => reported.push(String(error)) }),
    mocks: { '../sshExecRunner': recordingRunner(product.runner, outcomes) },
  });
  return { w, outcomes, reported, before: new Set(recordedStarts(rig).map((one) => one.file)) };
}

/** The starts of this leg so far. */
const startsOf = (rig, leg) => recordedStarts(rig).filter((one) => !leg.before.has(one.file));

/**
 * Registers a leg's teardown with the section's scope, so a signal or an uncaught error in the middle of the leg ends its processes too (the
 * leg's `finally` does not run when `harnessScope.finish` exits the process). ONE callback, in this order: what the listener forked is listed
 * FIRST (the scope runs its callbacks in reverse registration order, so two callbacks would close the bridges before the listing, and a remote
 * command that left the tree by then would be missed), then the bridges are closed, then `endServer` with that list. After the leg's own end
 * the listener has `exited`, nothing is listed (`descendantsOfListener`) and the second `endServer` signals no foreign pid. SIGKILL cannot be
 * handled: it still leaves them.
 */
function endLegWithScope(rig, leg, server, saved) {
  rig.scope.after(async () => {
    // The leg's own snapshot (made before its bridges closed) joins a fresh one: a remote command that left the listener's tree after
    // the close is in the first only. Every pid in either is signalled only while its start time is the recorded one.
    const fresh = await descendantsOfListener(server);
    const earlier = saved(); // read after the await: the leg may have taken a later snapshot meanwhile
    await leg.w.bridges.dispose();
    await endServer(server, startsOf(rig, leg), { list: [...earlier.list, ...fresh.list], error: earlier.error ?? fresh.error });
  });
}

/**
 * Resolves `{ ended, error }`: `ended` is true when `promise` FULFILLS within `ms`; a rejection is kept as `error` (its text), not an end,
 * and a click that is still running after `ms` has neither. The checks that read it put `error` into their detail.
 */
const finishes = (promise, ms) =>
  settledAfter(promise.then(() => ({ ended: true }), (error) => ({ ended: false, error: String(error?.stack ?? error) })), ms).then((result) => ({ ended: result?.ended === true, error: result?.error }));

/** The recorded outcome of the run whose last word is `command`, or `undefined`. */
const runOf = (leg, command) => leg.outcomes.find((one) => one.argv.at(-1) === command);

/** What a world array holds that it did not hold at `mark`. */
const since = (list, mark) => list.slice(mark);

/** Which start a recorded one is: by `-V` alone for the question, by `-N` for the bridge, by its remote command for the three runs. */
function kindOf(argv, commands) {
  if (argv.length === 1 && argv[0] === '-V') {
    return 'question';
  }
  if (argv.includes('-N')) {
    return 'bridge';
  }
  return Object.keys(commands).find((kind) => commands[kind] === argv.at(-1)) ?? 'other';
}

/** The pin file a start names, when it names ONE file as both known-hosts files and says `yes`; else `undefined`. */
function pinOf(product, argv) {
  const strict = product.argv.valuesOf(argv, 'StrictHostKeyChecking');
  const user = product.argv.valuesOf(argv, 'UserKnownHostsFile');
  const global = product.argv.valuesOf(argv, 'GlobalKnownHostsFile');
  const one = strict.length === 1 && strict[0] === 'yes' && user.length === 1 && global.length === 1 && user[0] === global[0];
  return one ? user[0].replace(/^"(.*)"$/, '$1') : undefined;
}

/** Whether a connection's argv lacks one of E2's three pairs, or says it other than once, or with another value. */
const lacksNewPairs = (product, argv) => Object.entries(NEW_PAIRS).some(([name, value]) => {
  const said = product.argv.valuesOf(argv, name);
  return said.length !== 1 || said[0] !== value;
});

/**
 * The starts of a leg, split by kind: the QUESTION `ssh -V` and the connections. The window's asker keeps the answer of a client that
 * knows `KnownHostsCommand` for its life, one asker per leg (`world()` evicts the modules), and the three roads ask with one key, so per
 * leg exactly ONE question starts: the install's, the first pinned call. The bridge and the socket check take the kept answer.
 * Answers the connections.
 */
async function startsHoldThePin(check, rig, leg, label) {
  const { product } = rig;
  const starts = startsOf(rig, leg);
  const remote = remoteOf(starts.find((one) => one.argv.includes('-N'))?.argv ?? []) ?? '';
  const commands = { probe: product.probeCommand(), sweep: product.sweepCommand(me), mode: product.modeCheckCommand({ path: remote }) };
  const kindsOf = (list) => list.map((one) => kindOf(one.argv, commands));
  const questions = starts.filter((one) => kindOf(one.argv, commands) === 'question');
  const connections = starts.filter((one) => kindOf(one.argv, commands) !== 'question');
  const kinds = kindsOf(connections).sort();
  check(`${label}: the shim recorded 5 starts of ssh, each whole: ONE question ssh -V (the window keeps the answer of a client that knows the option) and 4 connections, the probe, the bridge, the sweep and the mode check`, starts.every((one) => one.whole) && questions.length === 1 && kinds.join(',') === 'bridge,mode,probe,sweep', JSON.stringify({ questions: questions.length, connections: kinds }));
  const firstConnection = Math.min(...connections.map((one) => Number(one.start)));
  check(`${label}: the question did not start after the first connection (the start times the shim recorded)`, questions.length === 1 && connections.length > 0 && Number(questions[0].start) <= firstConnection, JSON.stringify(starts.map((one) => ({ kind: kindOf(one.argv, commands), start: one.start }))));
  const pins = connections.map((one) => ({ kind: kindOf(one.argv, commands), file: pinOf(product, one.argv) }));
  check(`${label}: every connection says StrictHostKeyChecking=yes and names ONE file as both known-hosts files`, pins.length === 4 && pins.every((one) => one.file !== undefined), JSON.stringify(connections.map((one) => product.argv.valuesOf(one.argv, 'UserKnownHostsFile'))));
  // The values are those of the contract (NEW_PAIRS), not read from `hostKeyWords`; the NAMES are tied to the tests' own list.
  const sameNames = JSON.stringify(Object.keys(NEW_PAIRS)) === JSON.stringify(product.argv.PIN_SOURCE_OPTIONS);
  const lacking = connections.filter((one) => lacksNewPairs(product, one.argv)).map((one) => ({ kind: kindOf(one.argv, commands), words: product.argv.sourceWordsOf(one.argv) }));
  check(`${label}: every connection says VerifyHostKeyDNS=no, KnownHostsCommand=none and LogLevel=ERROR, each once (the names those of pinnedArgv's PIN_SOURCE_OPTIONS)`, connections.length === 4 && sameNames && lacking.length === 0, JSON.stringify({ namesAgree: sameNames, names: product.argv.PIN_SOURCE_OPTIONS, lacking }));
  const keys = product.materializedKeysDir(rig.storage);
  const named = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  check(`${label}: each named file is a pin file of this window: ${keys}/known_hosts-e1-<uuid>`, pins.length === 4 && pins.every((one) => one.file !== undefined && path.dirname(one.file) === keys && named.test(path.basename(one.file))), JSON.stringify(pins));
  const of = (kind) => pins.find((one) => one.kind === kind)?.file;
  const distinct = new Set([of('probe'), of('bridge'), of('sweep')]);
  check(`${label}: the install, the bridge and the check named 3 distinct pin files; the check's two runs named the same one`, !distinct.has(undefined) && distinct.size === 3 && of('sweep') === of('mode'), JSON.stringify(pins));
  return connections;
}

async function nothingLeft(check, rig, leg, label) {
  const files = () => rig.product.world.pinFiles(rig.storage);
  const empty = await within(5_000, () => files().length === 0);
  check(`${label}: no pin file of these calls is left in the keys folder (5 s)`, empty, JSON.stringify(files()));
  const living = startsOf(rig, leg).filter(alive);
  check(`${label}: no ssh that the leg started is alive, by its recorded pid and start time`, living.length === 0, JSON.stringify(living.map((one) => one.pid)));
}

/** Leg 1, the install: it reaches its question (T5 to T7). */
async function installAsks(check, rig, leg) {
  const { product } = rig;
  const w = leg.w;
  const asked = w.asked.length;
  const click = await finishes(product.world.click(w, 'installRemoteCli'), 30_000);
  check('leg 1: Install creds on host ended within 30 s', click.ended, click.error);
  const probe = runOf(leg, product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  check('leg 1: the install\'s probe was answered: exit 0, and no blocker', probe?.outcome?.exitCode === 0 && product.blockerFor(facts) === '', JSON.stringify({ probe, blocker: product.blockerFor(facts) }));
  const questions = since(w.asked, asked);
  const expected = product.confirmationFor(facts, product.world.ROW.node.name).message;
  check('leg 1: Install creds on host reached its question: one question, the one confirmationFor builds from the probe\'s answer', questions.length === 1 && questions[0].message === expected, JSON.stringify(questions));
}

/** Leg 1, the bridge and its socket check (T8 to T12). */
async function bridgeIsChecked(check, rig, leg) {
  const { product } = rig;
  const w = leg.w;
  const click = await finishes(product.world.click(w, 'openRemoteBridge'), 30_000);
  check('leg 1: Open Remote Bridge… ended within 30 s, and the bridge is open', click.ended && w.bridges.isOpen(product.world.KEY), click.error);
  const remote = w.bridges.remotePathFor(product.world.KEY);
  if (remote !== undefined) {
    rig.scope.after(() => removeSocket(remote)); // at once, before anything can fail
  }
  // `sshd` binds the socket once the login is through, which the click does not wait for: a bounded wait (5 s) while the bridge is open.
  const bound = remote !== undefined && (await within(5_000, () => isSocket(remote)));
  check('leg 1: the forwarded socket exists while the bridge is open', bound && w.bridges.isOpen(product.world.KEY), String(remote));
  const mode = () => runOf(leg, product.modeCheckCommand({ path: remote ?? '' }));
  const ran = await within(40_000, () => mode() !== undefined);
  const sweep = runOf(leg, product.sweepCommand(me));
  check('leg 1: the socket check ran within 40 s: the sweep and the mode check, each exit 0', ran && sweep?.outcome?.exitCode === 0 && mode()?.outcome?.exitCode === 0, JSON.stringify({ sweep, mode: mode() }));
  const answer = mode()?.outcome?.stdout ?? '';
  const probe = product.interpretSocketProbe(answer);
  check('leg 1: the bridge\'s check read the socket\'s mode: owner only', probe.kind === 'mode' && product.isOwnerOnlyMode(probe.mode), JSON.stringify(answer));
  check('leg 1: no warning and no error was shown, and the bridge\'s spawner reported nothing', w.warnings.length === 0 && w.errors.length === 0 && leg.reported.length === 0, JSON.stringify({ warnings: w.warnings, errors: w.errors, reported: leg.reported }));
}

/** Leg 1, the close (T13). */
async function closeEnds(check, rig, leg) {
  const bridge = startsOf(rig, leg).find((one) => one.argv.includes('-N'));
  await rig.product.world.click(leg.w, 'closeRemoteBridge');
  const ended = bridge !== undefined && (await within(5_000, () => !alive(bridge)));
  check('leg 1: Close Remote Bridge ends the bridge\'s ssh within 5 s', ended, JSON.stringify(bridge?.pid));
}

/** Leg 1: K1 answers, the entry is pinned to K1. Answers K1's port, or `undefined` when K1 did not start. */
async function legOne(check, rig) {
  const server = await startServingSshd(rig, 'k1', rig.k1, undefined);
  check('K1 listens: one sshd -D -e at 127.0.0.1, on a port of its own', server.failure === undefined, server.failure);
  const key = rig.product.parseHostKey(rig.pin);
  check('the saved host key is K1\'s, and the product reads it: parseHostKey reads it and knownHostsLine forms its line', key !== undefined && rig.product.knownHostsLine('127.0.0.1', server.port, key) !== undefined, rig.pin);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return undefined;
  }
  const leg = openLeg(rig, server.port);
  let taken = { list: [], error: undefined };
  endLegWithScope(rig, leg, server, () => taken);
  try {
    await installAsks(check, rig, leg);
    await bridgeIsChecked(check, rig, leg);
    taken = await descendantsOfListener(server); // before the close: afterwards a remote command is no descendant any more
    await closeEnds(check, rig, leg);
    const starts = await startsHoldThePin(check, rig, leg, 'leg 1');
    await nothingLeft(check, rig, leg, 'leg 1');
    const accepted = occurrences(server.sshd.stderr, `Accepted publickey for ${literal(me)} from 127\\.0\\.0\\.1`);
    check('leg 1: K1 logged one accepted login per connection: 4', accepted === 4 && starts.length === 4, `${accepted} accepted\n${server.sshd.stderr.trim().split('\n').slice(-20).join('\n')}`);
  } finally {
    leg.w.bridges.dispose();
    const { list, error } = await endServer(server, startsOf(rig, leg), taken);
    // The bridge's session was alive when `taken` was made, so an empty list means the listing saw nothing: it proves nothing.
    check('K1 and every process it forked are gone', server.sshd.exited && error === undefined && list.length > 0 && !list.some(alive), error ?? JSON.stringify({ forked: list.length, alive: list.filter(alive) }));
  }
  return server.port;
}

/** Leg 2, the install: refused, and sentence C (T23 to T25). */
async function installRefused(check, rig, leg) {
  const { product } = rig;
  const w = leg.w;
  const [asked, warned, failed] = [w.asked.length, w.warnings.length, w.errors.length];
  const click = await finishes(product.world.click(w, 'installRemoteCli'), 30_000);
  check('leg 2: Install creds on host ended within 30 s, and asked no question', click.ended && w.asked.length === asked, click.error ?? JSON.stringify(since(w.asked, asked)));
  const probe = runOf(leg, product.probeCommand());
  check('leg 2: the install\'s probe was refused: exit 255 and "Host key verification failed."', probe?.outcome?.exitCode === 255 && probe.outcome.stderr.includes(VERIFY_FAILED), JSON.stringify(probe));
  const probeFile = pinOf(product, probe?.argv ?? []);
  check('leg 2: the real client named the pin file of the probe: its stderr holds "Offending <type> key in <that file>:<n>", the evidence of sentence C', namesPinFile(probe?.outcome?.stderr ?? '', probeFile), JSON.stringify({ file: probeFile, stderr: probe?.outcome?.stderr }));
  const shown = [...since(w.warnings, warned), ...since(w.errors, failed)];
  const sentence = sentenceC(product, product.world.ROW.node.name);
  const withC = shown.filter((text) => text.includes(sentence));
  check('leg 2: the install showed sentence C once, and never "did not answer the probe"', withC.length === 1 && !shown.some((text) => text.includes('did not answer the probe')), JSON.stringify(shown));
}

/** Leg 2, the bridge and its check: refused, and the check's message (T26 to T30). */
async function bridgeRefused(check, rig, leg) {
  const { product } = rig;
  const w = leg.w;
  const failed = w.errors.length;
  const click = await finishes(product.world.click(w, 'openRemoteBridge'), 30_000);
  check('leg 2: Open Remote Bridge… ended within 30 s', click.ended, click.error);
  // The click returns when the bridge's `ssh` is spawned; its shim writes the record a moment later: a bounded wait (5 s) for it.
  const recorded = () => startsOf(rig, leg).find((one) => one.whole && one.argv.includes('-N'));
  await within(5_000, () => recorded() !== undefined);
  const remote = remoteOf(recorded()?.argv ?? []);
  if (remote !== undefined) {
    rig.scope.after(() => removeSocket(remote)); // a control run (MC1) makes one
  }
  const ended = await within(15_000, () => w.ended.includes(product.world.KEY) && !w.bridges.isOpen(product.world.KEY));
  check('leg 2: the bridge\'s ssh ended by itself within 15 s: no bridge is open', ended, JSON.stringify({ ended: w.ended, open: w.bridges.isOpen(product.world.KEY) }));
  const mode = () => runOf(leg, product.modeCheckCommand({ path: remote ?? '' }));
  const ran = await within(40_000, () => mode() !== undefined);
  const refused = (run) => run?.outcome?.exitCode === 255 && run.outcome.stderr.includes(VERIFY_FAILED);
  const sweep = runOf(leg, product.sweepCommand(me));
  check('leg 2: the socket check ran within 40 s: the sweep and the mode check, each exit 255 and "Host key verification failed."', ran && refused(sweep) && refused(mode()), JSON.stringify({ sweep, mode: mode() }));
  const modeFile = pinOf(product, mode()?.argv ?? []);
  check('leg 2: the real client named the pin file of the mode check: "Offending <type> key in <that file>:<n>"', namesPinFile(mode()?.outcome?.stderr ?? '', modeFile), JSON.stringify({ file: modeFile, stderr: mode()?.outcome?.stderr }));
  const expected = bridgeForm(product, product.world.ROW.node.name);
  const errors = since(w.errors, failed);
  check('leg 2: the bridge\'s check showed its message: exactly one error, "The bridge to \\"box\\" is not open: " and sentence C', errors.length === 1 && errors[0] === expected, JSON.stringify(errors));
  check('leg 2: no forwarded socket was made at the path the bridge named', remote !== undefined && !fs.existsSync(remote), String(remote));
}

/** Leg 2: K2 answers at K1's port, the entry is still pinned to K1. */
async function legTwo(check, rig, port) {
  const server = await startServingSshd(rig, 'k2', rig.k2, port);
  check(`K2 listens at K1's address after K1 ended: 127.0.0.1:${port}`, server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return;
  }
  const leg = openLeg(rig, port);
  let taken = { list: [], error: undefined };
  endLegWithScope(rig, leg, server, () => taken);
  try {
    await installRefused(check, rig, leg);
    await bridgeRefused(check, rig, leg);
    // Sentence D is read back from the product where the product has it, never typed; "could not be checked" is the bridge's opening of it.
    const unnamed = typeof rig.product.unnamedHostKeySentence === 'function' ? rig.product.unnamedHostKeySentence(rig.product.world.ROW.node.name) : undefined;
    const saidD = [...leg.w.infos, ...leg.w.warnings, ...leg.w.errors, ...leg.w.logs].filter((text) => text.includes('could not be checked') || (unnamed !== undefined && text.includes(unnamed)));
    check('leg 2: no message and no log line said sentence D or "could not be checked": where it does, E2.S3\'s rule of evidence missed on the real client (a finding against E2.S3, not a repair of this script)', saidD.length === 0, JSON.stringify(saidD));
    taken = await descendantsOfListener(server);
    await startsHoldThePin(check, rig, leg, 'leg 2');
    await nothingLeft(check, rig, leg, 'leg 2');
    const log = server.sshd.stderr;
    const reached = occurrences(log, `Connection from 127\\.0\\.0\\.1 port \\d+ on 127\\.0\\.0\\.1 port ${port}`);
    check('leg 2: K2 was reached: its log holds a connection from 127.0.0.1 per connection (at least 4)', reached >= 4, `${reached} connections\n${log.trim().split('\n').slice(-20).join('\n')}`);
    check('leg 2: K2 logged no accepted login and no authentication attempt', !AUTH_ATTEMPT.test(log), log.trim().split('\n').filter((line) => AUTH_ATTEMPT.test(line)).join('\n'));
  } finally {
    leg.w.bridges.dispose();
    const { list, error } = await endServer(server, startsOf(rig, leg), taken);
    check('K2 and every process it forked are gone', server.sshd.exited && error === undefined && !list.some(alive), error ?? JSON.stringify(list.filter(alive)));
  }
}

/** The keys: two host keys and the login key, made by the PATH's `ssh-keygen`; the login key is the one authorized key. */
async function makeKeys(check, rig) {
  const keygen = (file) => tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file]);
  const failed = (await keygen(rig.k1)) ?? (await keygen(rig.k2)) ?? (await keygen(rig.userKey));
  check('the throwaway keys were generated: K1, K2 and the user key', failed === undefined, failed);
  if (failed === undefined) {
    fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
  }
  return failed === undefined;
}

/** The SHA-256 of the person's `~/.ssh/known_hosts`, or `absent`. Read only. */
function knownHostsDigest() {
  const file = path.join(os.homedir(), '.ssh', 'known_hosts');
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent';
}

/** The rig in the section's owned folder. Its environment: ours without the person's agent, the shim first on PATH, the temp vars on the folder. */
function rigOf(section, dir, out) {
  const { SSH_AUTH_SOCK: _own, ...ours } = process.env;
  const shimDir = path.join(dir, 'shim');
  const env = harnessScope.tempEnv(dir, { ...ours, PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}` });
  const rig = {
    dir, scope: section, out, env, shimDir, product: productOf(out),
    records: path.join(dir, 'records'), storage: path.join(dir, 'storage'), clientConfig: path.join(dir, 'client_config'),
    k1: path.join(dir, 'k1_key'), k2: path.join(dir, 'k2_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'),
  };
  [shimDir, rig.records, rig.storage].forEach((folder) => fs.mkdirSync(folder));
  return rig;
}

/** What the real client says of itself, read by the product's reader (E2.S1). The words this smoke expects are those of a client that knows `KnownHostsCommand`. */
function clientAnswer(product, real) {
  return new Promise((resolve) => {
    execFile(real, ['-V'], { timeout: 5_000 }, (error, _stdout, stderr) => { // NOSONAR: a CI rig, the real client by its real path
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
      resolve(product.pinClientOf(code, String(stderr)));
    });
  });
}

async function pinnedLegs(check, rig) {
  if (!(await makeKeys(check, rig))) {
    return;
  }
  writeClientConfig(rig);
  const real = installShim(rig);
  check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  const client = real === undefined ? { kind: 'unreadable', exitCode: null } : await clientAnswer(rig.product, real);
  check('the real ssh knows KnownHostsCommand (OpenSSH 8.5 or newer), read as the product reads ssh -V: the words this smoke expects are that client\'s', client.kind === 'knows', JSON.stringify(client));
  const pinned = { ...rig, pin: rig.product.formatHostKey(rig.product.parseHostKey(fs.readFileSync(`${rig.k1}.pub`, 'utf8')) ?? { algorithm: '', base64: '' }) };
  const port = await legOne(check, pinned);
  if (port !== undefined) {
    await legTwo(check, pinned, port);
  }
}

async function livePinnedRoads(check, out) {
  if (process.platform !== 'linux') {
    console.log('skip  live pinned-roads legs — Linux only (the end of a server reads /proc)');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('the live pinned-roads legs ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live pinned-roads legs — sshd not installed');
    }
    return;
  }
  // Its own scope, registered in the module scope at once, closed in the `finally`; the folder is made under the short socket root, as G2's.
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'pin', { parent: shortSocketRoot() });
  const before = knownHostsDigest();
  try {
    await pinnedLegs(check, rigOf(section, dir, out));
  } finally {
    check('the person\'s ~/.ssh/known_hosts is unchanged: the same bytes, or absent before and after', knownHostsDigest() === before);
    await section.close(); // the folder goes last: the children hold files in it, and the section ended them first
  }
}

module.exports = { livePinnedRoads };
