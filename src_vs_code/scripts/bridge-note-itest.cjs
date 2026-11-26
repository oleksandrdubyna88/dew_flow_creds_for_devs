// Integration test: the scoped Remote Bridge on a REAL topology (change 11.1, the 72-hour slice, S1 and S2).
//
//   npm run compile && dotnet build ../src_cli/src/CredsCli.csproj && dotnet build ../src_mcp/src/CredsMcp.csproj
//   node scripts/bridge-note-itest.cjs
//
// The laptop: the real broker with E1's wall (`out/test/bridgeWallWorld.js`): `prod` (alias `one`) is in the bridge's scope, `leak-target`
// (alias `leaky`) is in the same vault, open to agents, and is not. The server: throwaway `sshd -d` runs on loopback, reached by REAL
// `ssh -R` whose argv is the product's own (`buildBridgeArgv`); each note is written by the product's own one-shot ssh (`buildNoteArgv` +
// `writeBridgeNote`) into a home of the rig's (an sshd whose ForceCommand sets HOME, so the person's own home is never written). The
// product's `BridgeSession` keeps the bridge (`itestBridgeNoteRig.cjs`). Then the REAL .NET `creds` and `creds-mcp`, with an EMPTY
// announcement folder and no socket variable, must find the bridge by the note alone:
//
//   N1  the note is on disk as the clients require it: folder 0700, file 0600, the listener's port and key;
//   N2  `creds ls` lists the entry in scope and not the one out of it;
//   N3  `creds ssh one -- …` runs, by name, through the forward (cause D2: the old client said port 1 and the door refused it);
//   N4  `creds ssh leaky -- …` is refused by the bridge (a name it does not serve) and runs nothing;
//   N5  `creds-mcp`'s `creds_list` shows the entry in scope and not the other (cause D1: creds-mcp found nothing on the server);
//   N6  a note with a wrong key is refused at the door, runs nothing, and both clients say the BRIDGE refused (not "not enabled");
//   N8  (S2) a network drop: the session reconnects with a new socket, listener and key, and the SAME `creds-mcp` process and the same
//       shell's `creds` work again, with nothing pasted and no restart;
//   N9  (S2) Lock while a reconnect is held just before it publishes: no new note, no access, nothing ran; the unlock brings it back;
//   N10 (S2) Close while a reconnect is held just before it publishes: no new note, no access, nothing ran, nothing retried;
//   N7  the ended forward's socket FILE stays (sshd's default `StreamLocalBindUnlink no`) and the clients do not take it for a bridge.
//
// RED first (S1): against binaries built before the note was read (`CREDS_ITEST_CLI` / `CREDS_ITEST_MCP` name them), N2, N3 and N5 fail.
// POSIX only. With `CI=true` a missing sshd or binary FAILS: a skipped live check on the runner proves nothing.
const fs = require('fs');
const path = require('path');
const { SSHD } = require('./itestSshd.cjs');
const harnessScope = require('./lib/harnessScope.cjs');
const { within, answers, run, mcpProcess, makeRig, sessionOf, drop, noteFile } = require('./itestBridgeNoteRig.cjs');

const ROOT = path.join(__dirname, '..', '..');
const CLI = process.env.CREDS_ITEST_CLI ?? path.join(ROOT, 'src_cli', 'src', 'bin', 'Debug', 'net10.0', 'creds');
const MCP = process.env.CREDS_ITEST_MCP ?? path.join(ROOT, 'src_mcp', 'src', 'bin', 'Debug', 'net10.0', 'creds-mcp');

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

const modeOf = (file) => (fs.statSync(file).mode & 0o777).toString(8);
const ranOn = (rig, entityId) => rig.ww.w.ran.filter((r) => r.entityId === entityId).length;
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/** N1: the note as the clients require it. */
function noteOnDisk(rig, record) {
  const { folder, file } = noteFile(rig);
  check('N1: the note folder is 0700', fs.existsSync(folder) && modeOf(folder) === '700', fs.existsSync(folder) ? modeOf(folder) : 'absent');
  check('N1: the note is 0600', file !== undefined && modeOf(file) === '600', file === undefined ? 'absent' : modeOf(file));
  check('N1: it names the listener\'s port and key', file !== undefined && JSON.parse(fs.readFileSync(file, 'utf8')).key === record.listener.key);
  return file;
}

/** N2-N5: the two binaries, by the note alone. */
async function clientsByNote(rig, agent) {
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

  const listing = await agent.call('creds_list');
  check('N5: `creds-mcp` lists the entry in scope by the note', listing.includes('prod'), listing.slice(0, 400));
  check('N5: and not the one out of it', !listing.includes('leak-target'), listing.slice(0, 400));
}

/** N6: a note whose key is wrong. The real note is put back after. */
async function wrongKey(rig, agent, file) {
  const real = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(real), key: 'not-the-listener-key' }));
  const ran = rig.ww.w.ran.length;
  const byName = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check('N6: `creds` with a wrong key is refused, and says the BRIDGE did not accept it', byName.code !== 0 && /Remote Bridge/.test(byName.stderr), `code ${byName.code}: ${byName.stderr.trim()}`);
  const listed = await run(CLI, ['ls'], rig.clientEnv);
  check('N6: `creds ls` says the same', listed.code !== 0 && /Remote Bridge/.test(listed.stderr), `code ${listed.code}: ${listed.stderr.trim()}`);
  const listing = await agent.call('creds_list');
  check('N6: `creds-mcp` says the same, and lists nothing', /Remote Bridge/.test(listing) && !listing.includes('prod'), listing.slice(0, 400));
  check('N6: and nothing ran', rig.ww.w.ran.length === ran, JSON.stringify(rig.ww.w.ran));
  fs.writeFileSync(file, real);
}

/** Both clients reach the laptop now: the same `creds-mcp` process lists `prod`, and `creds ssh one` runs. */
async function bothWork(rig, agent, leg) {
  const listing = await agent.call('creds_list');
  check(`${leg}: the SAME creds-mcp process (pid ${agent.pid}) lists the entry again`, agent.alive() && listing.includes('prod'), listing.slice(0, 300));
  const before = ranOn(rig, 'e1');
  const byName = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check(`${leg}: \`creds ssh one\` runs again from the same shell`, byName.code === 0 && ranOn(rig, 'e1') === before + 1, `code ${byName.code}: ${byName.stderr.trim()}`);
}

/** Neither client reaches the laptop, and nothing ran. */
async function neitherWorks(rig, agent, leg) {
  const ran = rig.ww.w.ran.length;
  const byName = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  const listing = await agent.call('creds_list');
  check(`${leg}: no access: \`creds\` is refused and creds-mcp lists nothing`, byName.code !== 0 && !listing.includes('prod'), `code ${byName.code}; ${listing.slice(0, 200)}`);
  check(`${leg}: and nothing ran`, rig.ww.w.ran.length === ran, JSON.stringify(rig.ww.w.ran));
}

/** A hold just before the next publish: `reached()` says whether the reconnect is there, `release` lets it go on. */
function holdNext(rig) {
  let there = false;
  let release = () => undefined;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  rig.hold = () => {
    rig.hold = undefined;
    there = true;
    return gate;
  };
  return { reached: () => there, release };
}

/** N8: a network drop; the session reconnects and both clients work again, with nothing restarted. */
async function networkDrop(rig, agent, session) {
  const first = rig.connections[0];
  await drop(first);
  const back = await within(30_000, () => session.state === 'open' && rig.connections.length === 2 && rig.connections[1].published);
  check('N8: after a network drop the session reconnected and published a new note', back, `state ${session.state}, ${rig.connections.length} connection(s)`);
  if (!back) {
    return false;
  }
  const second = rig.connections[1];
  check('N8: on a NEW socket path (the old file stays: StreamLocalBindUnlink no)', second.remotePath !== first.remotePath && fs.existsSync(first.remotePath));
  check('N8: with a NEW listener and key', second.listener.port !== first.listener.port && second.listener.key !== first.listener.key);
  await bothWork(rig, agent, 'N8');
  return true;
}

/** Drops the live connection with the next publish held; the held connection once the reconnect reaches the hold. */
async function dropAndHold(rig, leg) {
  const live = rig.connections.at(-1);
  const held = holdNext(rig);
  await drop(live);
  const reached = await within(30_000, () => held.reached());
  check(`${leg}: a reconnect reached the point just before it publishes`, reached);
  return { live, pending: rig.connections.at(-1), release: held.release };
}

/** N9: Lock wins over a reconnect held just before it publishes; the unlock brings the bridge back. */
async function lockWins(rig, agent, session, flags) {
  const { live, pending, release } = await dropAndHold(rig, 'N9');
  flags.unlocked = false;
  session.lock();
  release();
  await settle(500);
  check('N9: Lock: the held reconnect published NO note', pending !== live && !pending.published, `published ${pending.published}`);
  check('N9: Lock: its connection was ended (listener closed)', pending.stopped && !(await answers(pending.remotePath)));
  check('N9: the session waits for the unlock', session.state === 'locked', session.state);
  await neitherWorks(rig, agent, 'N9');

  flags.unlocked = true;
  session.unlock();
  const back = await within(30_000, () => session.state === 'open' && rig.connections.at(-1).published);
  check('N9: the unlock brings the bridge back with a new note', back, session.state);
  if (back) {
    await bothWork(rig, agent, 'N9 after the unlock');
  }
}

/** N10: Close wins over a reconnect held just before it publishes; nothing is retried. The connection the note still names. */
async function closeWins(rig, agent, session) {
  const { live, pending, release } = await dropAndHold(rig, 'N10');
  session.close();
  release();
  await settle(1_000);
  check('N10: Close: the held reconnect published NO note', pending !== live && !pending.published);
  check('N10: Close: its connection was ended', pending.stopped && !(await answers(pending.remotePath)));
  const count = rig.connections.length;
  await settle(1_000);
  check('N10: nothing is retried after the Close', rig.connections.length === count && session.state === 'closed', `${rig.connections.length} connection(s), ${session.state}`);
  await neitherWorks(rig, agent, 'N10');
  return live;
}

/** N7: the note names an ended forward whose socket file stays; the clients do not take it for a bridge. */
async function deadForward(rig, ended) {
  const { file } = noteFile(rig);
  const named = file === undefined ? undefined : JSON.parse(fs.readFileSync(file, 'utf8')).socket;
  check('N7: the note still names the ended forward, and its socket file stays (StreamLocalBindUnlink no)', named === ended.remotePath && fs.existsSync(named), String(named));
  const after = await run(CLI, ['ssh', 'one', '--', 'id'], rig.clientEnv);
  check('N7: the client does not reach a bridge through it', after.code !== 0, `code ${after.code}`);
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
  const rig = await makeRig(scope, check);
  const flags = { unlocked: true };
  const session = sessionOf(rig, flags);
  scope.after(() => session.close());
  const opened = await session.begin();
  check('the product\'s session opened the bridge and published its note', opened !== undefined && rig.connections[0]?.published === true);
  if (opened !== undefined) {
    const agent = mcpProcess(scope, MCP, rig.clientEnv);
    const file = noteOnDisk(rig, rig.connections[0]);
    await clientsByNote(rig, agent);
    if (file !== undefined) {
      await wrongKey(rig, agent, file);
    }
    if (await networkDrop(rig, agent, session)) {
      await lockWins(rig, agent, session, flags);
      await deadForward(rig, await closeWins(rig, agent, session));
    }
  }
  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  return fails === 0 ? 0 : 1;
});
