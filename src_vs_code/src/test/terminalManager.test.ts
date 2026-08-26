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
