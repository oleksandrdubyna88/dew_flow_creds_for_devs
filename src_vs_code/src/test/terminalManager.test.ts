import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEP_COLOR_KEYS, depColorThemeId } from '../depColors';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * Opening an SSH terminal (audit A3).
 *
 * <p>Small, and the two things it decides are both visible to a person every day: whether a
 * second click opens a second terminal to the same host, and what happens when an entity has
 * no host to connect to.</p>
 */

type Manager = typeof import('../terminalManager');

interface FakeTerminal {
  name: string;
  shellPath?: string;
  /** The `color` the terminal was created with; absent when the options carried none. */
  color?: { id: string };
  exitStatus?: { code: number };
  shown: number;
  sent: string[];
}

/** What `composedShellPath` answers here — a local window pins; a WSL one keeps its default. */
const PINNED = 'pinned-native-shell';

interface World {
  mod: Manager;
  terminals: FakeTerminal[];
  created: FakeTerminal[];
  warnings: string[];
}

function world(existing: FakeTerminal[] = [], local = true): World {
  const terminals = [...existing];
  const created: FakeTerminal[] = [];
  const warnings: string[] = [];
  const mod = loadWithVscode<Manager>('../terminalManager', {
    window: {
      terminals,
      createTerminal: ({ name, shellPath: pinned, ...rest }: { name: string; shellPath?: string; color?: { id: string } }): FakeTerminal => {
        const t: FakeTerminal = { name, shellPath: pinned, shown: 0, sent: [], ...('color' in rest ? { color: rest.color } : {}) };
        Object.assign(t, {
          show: (): void => {
            t.shown += 1;
          },
          sendText: (text: string): void => {
            t.sent.push(text);
          },
        });
        created.push(t);
        terminals.push(t);
        return t;
      },
      showWarningMessage: (m: string): Promise<undefined> => {
        warnings.push(m);
        return Promise.resolve(undefined);
      },
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
  }, { './pinnedTerminal': { composedShellPath: (): string | undefined => (local ? PINNED : undefined) } });
  return { mod, terminals, created, warnings };
}

test('the ssh line is typed into the shell it was composed for, never the default profile (#103)', () => {
  // A local window: the line is composed for this machine, so the terminal gets its native shell —
  // a Windows ssh line in a WSL-bash default profile is the reported defect in another place.
  const local = world();
  local.mod.openSshTerminal(entity(), {}, process.platform);
  assert.equal(local.created[0].shellPath, PINNED);

  // A WSL window composes for Linux and keeps its Linux default profile.
  const wsl = world([], false);
  wsl.mod.openSshTerminal(entity(), {}, 'linux');
  assert.equal(wsl.created[0].shellPath, undefined);
});

function fake(name: string, exited = false): FakeTerminal {
  const t: FakeTerminal = { name, shown: 0, sent: [], exitStatus: exited ? { code: 0 } : undefined };
  Object.assign(t, { show: (): void => { t.shown += 1; }, sendText: (): void => undefined });
  return t;
}

const entity = (over: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'e1',
  name: 'prod',
  isSshEnabled: true,
  host: 'prod.example.com',
  user: 'deploy',
  ...over,
});

test('a terminal is created, shown, and sent the command', () => {
  const w = world();

  const opened = w.mod.openSshTerminal(entity());

  assert.ok(opened !== undefined);
  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].name, 'Creds SSH: prod', 'no title given: the entry name under the SSH prefix');
  assert.equal(w.created[0].shown, 1);
  assert.match(w.created[0].sent[0], /ssh/, 'the command is actually sent, not just typed');
});

// The owner, 2026-11-10: the tab names the entry and its folder, not user@host. The title is also the lookup key, and
// two entries may share a name in one folder — so a session is found again only for the entry it was opened for.
const TITLE = 'Creds SSH: ssh connections / prod';

test('the tab is the title it is given, and Connect twice brings the same session forward', () => {
  const w = world();

  const first = w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1' });
  const again = w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1' });

  assert.equal(w.created.length, 1, 'nothing new was created');
  assert.equal(w.created[0].name, TITLE);
  assert.equal(again, first);
  assert.equal(w.created[0].shown, 2, 'the existing one was brought forward');
});

test('another entry with the same title gets its own terminal, never the first entry\'s session', () => {
  const w = world();

  w.mod.openSshTerminal(entity({ id: 'e1' }), {}, process.platform, '', { title: TITLE, accountId: 'a1' });
  w.mod.openSshTerminal(entity({ id: 'e2', host: 'other.example.com' }), {}, process.platform, '', { title: TITLE, accountId: 'a1' });

  assert.equal(w.created.length, 2, 'a session on the wrong server would have been brought forward');
  assert.match(w.created[1].sent[0], /other\.example\.com/);
});

test('after the entry moved, Connect still brings ITS session forward — found by the entry, not by the title', () => {
  const w = world();

  const first = w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: 'Creds SSH: old / prod', accountId: 'a1' });
  const again = w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: 'Creds SSH: new / prod', accountId: 'a1' });

  assert.equal(w.created.length, 1, 'a second session was opened beside the first');
  assert.equal(again, first);
});

test('the same entry id in another account gets its own terminal', () => {
  const w = world();

  w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1' });
  w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a2' });

  assert.equal(w.created.length, 2);
});

test('a live terminal this window did not open for the entry is not reused, even under its title', () => {
  const stranger = fake(TITLE);
  const w = world([stranger]);

  w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1' });

  assert.equal(w.created.length, 1);
  assert.equal(stranger.shown, 0);
});

test('a terminal that has EXITED is not reused — it cannot run anything', () => {
  // Reusing a dead terminal would look like a connection that silently does nothing.
  const dead = fake('SSH: deploy@prod.example.com', true);
  const w = world([dead]);

  w.mod.openSshTerminal(entity());

  assert.equal(w.created.length, 1, 'a fresh terminal replaces the dead one');
});

test('an entity with no host says so, and opens nothing', () => {
  const w = world();

  const opened = w.mod.openSshTerminal(entity({ host: undefined }));

  assert.equal(opened, undefined);
  assert.equal(w.created.length, 0);
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /no host configured/);
});

test('two different hosts get two terminals', () => {
  const w = world();

  w.mod.openSshTerminal(entity());
  w.mod.openSshTerminal(entity({ id: 'e2', name: 'stage', host: 'stage.example.com' }));

  assert.equal(w.created.length, 2);
  assert.notEqual(w.created[0].name, w.created[1].name, 'the tabs name two different entries');
});

// Added with the remote-window fix. Until then this function read `process.platform` — the
// EXTENSION HOST's — and posted the result into the WINDOW's terminal. In a WSL window those are
// two different operating systems, which is how a bash shell came to be handed
// `ssh -i "c:\Users\...\keys\23284\<guid>.key"`.

test('a terminal told its shell is linux gets POSIX quoting and the bare ssh word', () => {
  const w = world();

  w.mod.openSshTerminal(
    entity({ sshKeyPath: '/run/user/1000/k', agentForward: true }),
    {},
    'linux',
  );

  const line = w.created[0].sent[0];
  assert.match(line, /^ssh /, 'a Windows program path cannot start a line meant for bash');
  assert.doesNotMatch(line, /\.exe/);
  assert.doesNotMatch(line, /C:\//i);
});

test('the same entity on a win32 host still composes for Windows — local is unchanged', () => {
  const w = world();

  // The backslashes are DOUBLED on purpose, in the literal and in the pattern. Written singly, `\k`
  // is an identity escape in both — the test ran against `c:keysk.key` and would have kept passing
  // through a regression that ate every separator out of a Windows path, which is the one thing it
  // is here to catch. Found by a review.
  w.mod.openSshTerminal(entity({ sshKeyPath: 'c:\\keys\\k.key' }), {}, 'win32');

  const line = w.created[0].sent[0];
  assert.match(line, /-i "c:\\keys\\k\.key"/);
  assert.equal(line.includes('c:\\keys\\k.key'), true, 'the separators survived, as bytes');
});

test('a prefix is sent as an env WORD in front of the line, so fish and pwsh can run it', () => {
  // A bare `SSH_AUTH_SOCK=... ssh ...` assignment prefix is a parse error in fish and in pwsh,
  // either of which can be a WSL window's default profile — and `createTerminal` uses that profile.
  const w = world();

  w.mod.openSshTerminal(entity(), {}, 'linux', "env SSH_AUTH_SOCK='/run/user/1000/creds.sock' ");

  const line = w.created[0].sent[0];
  assert.match(line, /^env SSH_AUTH_SOCK='\/run\/user\/1000\/creds\.sock' ssh /);
  assert.doesNotMatch(line, /^SSH_AUTH_SOCK=/, 'a bare assignment is not a command');
});

test('no prefix leaves the line exactly as it was — the local path is byte-identical', () => {
  const w = world();

  w.mod.openSshTerminal(entity());

  assert.match(w.created[0].sent[0], /^ssh /);
});

test('the_ssh_terminal_wears_the_place_colour_and_none_without_one', () => {
  for (const key of DEP_COLOR_KEYS) {
    const w = world();
    w.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1', color: key });
    assert.equal(w.created[0].color?.id, depColorThemeId(key), key);
  }
  const plain = world();
  plain.mod.openSshTerminal(entity(), {}, process.platform, '', { title: TITLE, accountId: 'a1' });
  assert.equal(plain.created.length, 1);
  assert.equal('color' in plain.created[0], false, 'a place without a colour creates the terminal with no color property');
  const defaultPlace = world();
  defaultPlace.mod.openSshTerminal(entity());
  assert.equal('color' in defaultPlace.created[0], false, 'the default place has no folder, so no colour');
});
