// Integration test: the scoped Remote Bridge on a REAL topology (change 11.1, the 72-hour slice, S1).
//
//   npm run compile && dotnet build ../src_cli/src/CredsCli.csproj && dotnet build ../src_mcp/src/CredsMcp.csproj
//   node scripts/bridge-note-itest.cjs
//
// The laptop: the real broker with E1's wall (`out/test/bridgeWallWorld.js`): `prod` (alias `one`) is in the bridge's scope, `leak-target`
// (alias `leaky`) is in the same vault, open to agents, and is not. The bridge listener of that broker is what the forward ends at.
// The server: a throwaway `sshd -d` on loopback, reached by a REAL `ssh -R` whose argv is the product's own (`buildBridgeArgv`). The note is
// written by the product's own one-shot ssh (`buildNoteArgv` + `writeBridgeNote`) into a home of the rig's (a second `sshd -d` whose
// ForceCommand sets HOME, so the person's own home is never written). Then the REAL .NET `creds` and `creds-mcp`, with an EMPTY announcement
// folder and no socket variable, must find the bridge by the note alone:
//
//   N1  the note is on disk as the clients require it: folder 0700, file 0600, the listener's port and key;
//   N2  `creds ls` lists the entry in scope and not the one out of it;
//   N3  `creds ssh one -- …` runs, by name, through the forward (cause D2: the old client said port 1 and the door refused it);
//   N4  `creds ssh leaky -- …` is refused by the bridge (a name it does not serve) and runs nothing;
//   N5  `creds-mcp`'s `creds_list` shows the entry in scope and not the other (cause D1: creds-mcp found nothing on the server);
//   N6  a note with a wrong key is refused at the door, runs nothing, and both clients say the BRIDGE refused (not "not enabled");
//   N7  once the forward ends, its socket FILE stays (sshd's default `StreamLocalBindUnlink no`) and the clients do not take it for a bridge.
//
// RED first: against binaries built before the note was read (`CREDS_ITEST_CLI` / `CREDS_ITEST_MCP` name them), N2, N3 and N5 fail.
// POSIX only. With `CI=true` a missing sshd or binary FAILS: a skipped live check on the runner proves nothing.
const fs = require('fs');
const net = require('node:net');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('node:child_process');
const { SSHD, launch, startSshd, endChild, checkedPinOf } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

const OUT = path.join(__dirname, '..', 'out');
const ROOT = path.join(__dirname, '..', '..');
const CLI = process.env.CREDS_ITEST_CLI ?? path.join(ROOT, 'src_cli', 'src', 'bin', 'Debug', 'net10.0', 'creds');
const MCP = process.env.CREDS_ITEST_MCP ?? path.join(ROOT, 'src_mcp', 'src', 'bin', 'Debug', 'net10.0', 'creds-mcp');
const ID = '0f1e2d3c4b5a';

let fails = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  if (!ok) fails += 1;
};

/** A prerequisite that is missing: a FAIL on CI, a SKIP elsewhere. `true` when the run may go on. */
function needs(what, present, fix) {
  if (present) {
    return true;
  }
  if (process.env.CI === 'true') {
    check(`${what} is there`, false, `${fix} — a skipped live check on the runner proves nothing`);
  } else {
    console.log(`SKIP  ${what} is missing: ${fix}`);
  }
  return false;
}

function keygen(file) {
  return new Promise((resolve) => {
    // The PATH's ssh-keygen is the tool under test, as in `itestBridgedRig.cjs`.
    execFile('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], { timeout: 15_000 }, (error, _out, stderr) => { // NOSONAR: a CI rig, the PATH's ssh-keygen is the tool under test
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

/** Resolves `true` once `probe()` is, `false` after `ms`. Polls every 50 ms. */
async function within(ms, probe) {
  const deadline = Date.now() + ms;
  while (!(await probe())) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

/** Whether something accepts a connect on the unix socket at `file`. */
const answers = (file) =>
  new Promise((resolve) => {
    const socket = net.connect(file);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/** One run of a client binary: its exit code, stdout and stderr. Bounded: 30 s. */
function run(exe, args, env) {
  return new Promise((resolve) => {
    execFile(exe, args, { env, timeout: 30_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : String(error.code ?? error.signal)) : 0, stdout, stderr });
    });
  });
}

/** `creds-mcp` over stdio: the handshake, then `requests`; the replies by id. Stdin stays open until the answers are in. */
function speak(env, requests, settleMs = 4000) {
  return new Promise((resolve) => {
    const child = spawn(MCP, [], { env });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', () => undefined);
    const all = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bridge-note-itest', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...requests,
    ];
    all.forEach((message, i) => setTimeout(() => child.stdin.write(`${JSON.stringify(message)}\n`), i * 150));
    setTimeout(() => {
      child.stdin.end();
      child.kill();
      const byId = new Map();
      for (const line of out.split('\n').filter((l) => l.includes('"jsonrpc"'))) {
        try {
          const message = JSON.parse(line);
          if (message.id !== undefined) byId.set(message.id, message);
        } catch {
          /* a partial line at the kill */
        }
      }
      resolve(byId);
    }, all.length * 150 + settleMs);
  });
}

const textOf = (reply) => reply?.result?.content?.map((part) => part.text ?? '').join('\n') ?? JSON.stringify(reply?.error ?? reply);
const modeOf = (file) => (fs.statSync(file).mode & 0o777).toString(8);

/** The entry the product's argv is built for: loopback, this user, the sshd's port. */
const entityOn = (port) => ({ id: 'server1', name: 'prod server', host: '127.0.0.1', user: os.userInfo().username, port, isSshEnabled: true });

/** The rig: keys, a home for the server's login, an empty announcement folder, the laptop's broker with its wall. */
async function makeRig(scope) {
  const dir = ownedDir(scope, 'bnote', { parent: shortSocketRoot() });
  const rig = {
    dir, scope,
    hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'),
    home: path.join(dir, 'home'), endpoints: path.join(dir, 'endpoints'), socket: path.join(dir, `b-${ID}.sock`),
  };
  const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey));
  check('the throwaway keys were generated', failed === undefined, failed);
  fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
  fs.mkdirSync(rig.home, { mode: 0o700 });
  fs.mkdirSync(rig.endpoints);
  const { SSH_AUTH_SOCK: _own, CREDS_BROKER_SOCKET: _socket, CREDS_ENDPOINT_DIR: _dir, ...env } = process.env;
  rig.env = env;
  // The server's clients: the rig's home, an EMPTY announcement folder, no socket variable. Only the note can lead them to the laptop.
  rig.clientEnv = harnessScope.tempEnv(ownedDir(scope, 'bntmp'), { ...env, HOME: rig.home, CREDS_ENDPOINT_DIR: rig.endpoints, CREDS_RELAYED_FROM_WSL: '1' });
  const { wallWorld } = require(path.join(OUT, 'test', 'bridgeWallWorld.js'));
  rig.ww = await wallWorld({});
  scope.after(() => rig.ww.dispose());
  return rig;
}

/** One `sshd -d` in a folder of its own; `extra` are more config lines. `undefined` after a FAIL that names why. */
async function sshdFor(rig, name, extra = []) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  const started = await startSshd(rig.scope, dir, rig.hostKey, rig.authorizedKeys, extra);
  check(`${name}: its sshd started`, started.failure === undefined, started.failure);
  return started.failure === undefined ? started : (await endChild(started.sshd), undefined);
}

/** The argv options both of the product's ssh take: the listener's port, the forward's path, the user's key, the sshd's pinned host key. */
async function optionsFor(rig, started) {
  return { port: rig.ww.bridge.port, remote: { path: rig.socket }, keyPath: rig.userKey, auth: 'key', knownHostsFile: await checkedPinOf(OUT, started.knownHosts) };
}

/** The bridge: the product's `ssh -R` argv, a real ssh, until the forward answers. */
async function openForward(rig) {
  const started = await sshdFor(rig, 'forward');
  if (started === undefined) {
    return undefined;
  }
  const { buildBridgeArgv } = require(path.join(OUT, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(OUT, 'sshCommand.js'));
  const argv = buildBridgeArgv(entityOn(started.port), await optionsFor(rig, started), isSafeSshTarget);
  check('the product builds the bridge argv', Array.isArray(argv), String(argv));
  const tunnel = launch(rig.scope, 'ssh', argv, { env: rig.env });
  const up = await within(15_000, () => answers(rig.socket));
  check('the real ssh -R forwards the server\'s socket to the bridge listener', up, `${tunnel.stderr.trim()}\n${started.sshd.stderr.trim().split('\n').slice(-8).join('\n')}`);
  return up ? { tunnel, sshd: started } : undefined;
}

/** The note, written by the product's own one-shot ssh into the rig's home (the sshd's ForceCommand sets HOME). */
async function writeNote(rig) {
  const started = await sshdFor(rig, 'note', [`ForceCommand HOME=${rig.home} exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"`]);
  if (started === undefined) {
    return undefined;
  }
  const { buildNoteArgv } = require(path.join(OUT, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(OUT, 'sshCommand.js'));
  const { writeBridgeNote } = require(path.join(OUT, 'bridgeNoteWriter.js'));
  const argv = buildNoteArgv(entityOn(started.port), await optionsFor(rig, started), isSafeSshTarget, ID);
  const note = { socket: rig.socket, port: rig.ww.bridge.port, brokerPort: rig.ww.main, key: rig.ww.bridge.key, serverName: 'prod server', openedAt: new Date().toISOString() };
  const written = await writeBridgeNote(note, argv, rig.env);
  await endChild(started.sshd);
  check('the product\'s one-shot ssh wrote the note', written.ok, written.reason);
  return written.ok ? note : undefined;
}

/** N1: the note as the clients require it. */
function noteOnDisk(rig, note) {
  const folder = path.join(rig.home, '.creds-for-devs', 'bridge');
  const file = path.join(folder, `${ID}.json`);
  check('N1: the note folder is 0700', fs.existsSync(folder) && modeOf(folder) === '700', fs.existsSync(folder) ? modeOf(folder) : 'absent');
  check('N1: the note is 0600', fs.existsSync(file) && modeOf(file) === '600', fs.existsSync(file) ? modeOf(file) : 'absent');
  check('N1: it names the listener\'s port and key', fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).key === note.key);
  return file;
}

const ranOn = (rig, entityId) => rig.ww.w.ran.filter((r) => r.entityId === entityId).length;

/** N2-N5: the two binaries, by the note alone. */
async function clientsByNote(rig) {
  const listed = await run(CLI, ['ls'], rig.clientEnv);
  check('N2: `creds ls` reaches the laptop and exits 0', listed.code === 0, `code ${listed.code}: ${listed.stderr.trim()}`);
  check('N2: it lists the entry in scope', /\bone\b/.test(listed.stdout), JSON.stringify(listed.stdout));
  check('N2: and not the one out of it', !/leaky|leak-target/.test(listed.stdout), JSON.stringify(listed.stdout));

  const before = ranOn(rig, 'e1');
  const byName = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check('N3: `creds ssh one` runs by name through the forward', byName.code === 0 && ranOn(rig, 'e1') === before + 1, `code ${byName.code}: ${byName.stderr.trim()}`);
  check('N3: and prints what the laptop ran', byName.stdout.includes('ok'), JSON.stringify(byName.stdout));

  const leaked = await run(CLI, ['ssh', 'leaky', '--', 'id'], rig.clientEnv);
  check('N4: `creds ssh leaky` (out of scope) is refused BY THE BRIDGE, as a name it does not serve', leaked.code !== 0 && /"leaky"/.test(leaked.stderr) && !/window is running/.test(leaked.stderr), `code ${leaked.code}: ${leaked.stderr.trim()}`);
  check('N4: and nothing ran on it', ranOn(rig, 'e-out') === 0, JSON.stringify(rig.ww.w.ran));

  const said = await speak(rig.clientEnv, [{ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'creds_list', arguments: {} } }]);
  const listing = textOf(said.get(2));
  check('N5: `creds-mcp` lists the entry in scope by the note', listing.includes('prod'), listing.slice(0, 400));
  check('N5: and not the one out of it', !listing.includes('leak-target'), listing.slice(0, 400));
}

/** N6: a note whose key is wrong. The real note is put back after. */
async function wrongKey(rig, file) {
  const real = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(real), key: 'not-the-listener-key' }));
  const ran = rig.ww.w.ran.length;
  const byName = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check('N6: `creds` with a wrong key is refused, and says the BRIDGE did not accept it', byName.code !== 0 && /Remote Bridge/.test(byName.stderr), `code ${byName.code}: ${byName.stderr.trim()}`);
  const listed = await run(CLI, ['ls'], rig.clientEnv);
  check('N6: `creds ls` says the same', listed.code !== 0 && /Remote Bridge/.test(listed.stderr), `code ${listed.code}: ${listed.stderr.trim()}`);
  const said = await speak(rig.clientEnv, [{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'creds_list', arguments: {} } }]);
  const listing = textOf(said.get(3));
  check('N6: `creds-mcp` says the same, and lists nothing', /Remote Bridge/.test(listing) && !listing.includes('prod'), listing.slice(0, 400));
  check('N6: and nothing ran', rig.ww.w.ran.length === ran, JSON.stringify(rig.ww.w.ran));
  fs.writeFileSync(file, real);
}

/** N7: the forward ends; its socket file stays, and the clients do not take it for a bridge. */
async function deadForward(rig, forward) {
  await endChild(forward.tunnel);
  await endChild(forward.sshd.sshd);
  await within(5_000, async () => !(await answers(rig.socket)));
  check('N7: the ended forward left its socket file (StreamLocalBindUnlink no)', fs.existsSync(rig.socket));
  const ran = rig.ww.w.ran.length;
  const after = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check('N7: the client does not reach a bridge through it', after.code !== 0 && rig.ww.w.ran.length === ran, `code ${after.code}`);
  check('N7: and says no window is there rather than a socket error', !/ECONNREFUSED|SocketException|Connection refused/i.test(after.stderr), after.stderr.trim());
}

harnessScope.run(async (scope) => {
  if (process.platform === 'win32') {
    console.log('SKIP  the bridge note is a file of a Linux login: POSIX only');
    return 0;
  }
  const ready = [
    needs('sshd', fs.existsSync(SSHD), 'install openssh-server'),
    needs('the creds CLI', fs.existsSync(CLI), 'dotnet build ../src_cli/src/CredsCli.csproj -m:4'),
    needs('creds-mcp', fs.existsSync(MCP), 'dotnet build ../src_mcp/src/CredsMcp.csproj -m:4'),
  ];
  if (!ready.every(Boolean)) {
    return fails === 0 ? 0 : 1;
  }
  const rig = await makeRig(scope);
  const forward = await openForward(rig);
  const note = forward === undefined ? undefined : await writeNote(rig);
  if (note !== undefined) {
    const file = noteOnDisk(rig, note);
    await clientsByNote(rig);
    await wrongKey(rig, file);
    await deadForward(rig, forward);
  }
  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  return fails === 0 ? 0 : 1;
});
