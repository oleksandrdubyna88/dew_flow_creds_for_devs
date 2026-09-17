import * as assert from 'node:assert/strict';
import { test } from 'node:test';
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
  exitStatus?: { code: number };
  shown: number;
  sent: string[];
}

interface World {
  mod: Manager;
  terminals: FakeTerminal[];
  created: FakeTerminal[];
  warnings: string[];
}

function world(existing: FakeTerminal[] = []): World {
  const terminals = [...existing];
  const created: FakeTerminal[] = [];
  const warnings: string[] = [];
  const mod = loadWithVscode<Manager>('../terminalManager', {
    window: {
      terminals,
      createTerminal: ({ name }: { name: string }): FakeTerminal => {
        const t: FakeTerminal = { name, shown: 0, sent: [] };
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
  });
  return { mod, terminals, created, warnings };
}

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
  assert.match(w.created[0].name, /^SSH: /);
  assert.equal(w.created[0].shown, 1);
  assert.match(w.created[0].sent[0], /ssh/, 'the command is actually sent, not just typed');
});

test('a LIVE terminal for the same target is reused, not duplicated', () => {
  // Clicking Connect twice should bring the session forward, not open a second one beside it.
  const existing = fake('SSH: deploy@prod.example.com');
  const w = world([existing]);

  const opened = w.mod.openSshTerminal(entity());

  assert.equal(opened, existing as never);
  assert.equal(w.created.length, 0, 'nothing new was created');
  assert.equal(existing.shown, 1, 'the existing one was brought forward');
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
  w.mod.openSshTerminal(entity({ id: 'e2', host: 'stage.example.com' }));

  assert.equal(w.created.length, 2);
  assert.notEqual(w.created[0].name, w.created[1].name);
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

  w.mod.openSshTerminal(entity({ sshKeyPath: 'c:\keys\k.key' }), {}, 'win32');

  assert.match(w.created[0].sent[0], /-i "c:\keys\k\.key"/);
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
