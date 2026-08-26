import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { formatHostKey, HostKey } from '../hostKeyPin';
import { EntityMetadata, TreeNode } from '../types';

/**
 * Whether a connection may go ahead at all, and under what options (audit D7 + B10).
 *
 * <p>One function serving BOTH the human Connect path and the agent's exec, for the reason
 * `sshCredential` gives about credentials: two answers to "which bastion, which host key" means
 * one surface reaches a host the other refuses, and nobody finds out until it matters. So the
 * cases that must return `undefined` — a refused key, an unbuildable jump chain — are the ones
 * worth pinning, because returning options anyway is a connection nobody authorised.</p>
 */

type Options = typeof import('../connectionOptions');

const KEY: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const OTHER: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIOTHERKEY' };

interface World {
  mod: Options;
  warnings: string[];
  updated: TreeNode[];
  storage: unknown;
  dir: string;
}

/**
 * `scanHostKey` spawns `ssh-keyscan`, which a unit test must not do — so the host answers
 * through a stubbed `runBounded`, exactly as the real scan reads it.
 */
function world(options: { scanned?: HostKey; answer?: string } = {}): World {
  const warnings: string[] = [];
  const updated: TreeNode[] = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-conn-'));
  const nodes = new Map<string, TreeNode>();

  const stub = {
    window: {
      showWarningMessage: (m: string): Promise<string | undefined> => {
        warnings.push(m);
        return Promise.resolve(options.answer);
      },
      showErrorMessage: (m: string): Promise<string | undefined> => {
        warnings.push(m);
        return Promise.resolve(options.answer);
      },
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  };

  const storage = {
    getNode: (_a: string, id: string): TreeNode | undefined => nodes.get(id),
    updateNode: (_a: string, node: TreeNode): Promise<void> => {
      updated.push(node);
      return Promise.resolve();
    },
    _put: (node: TreeNode): void => {
      nodes.set(node.id, node);
    },
  };

  const mod = loadWithVscode<Options>('../connectionOptions', stub);
  // The scan is reached through sshExecRunner; make it answer with the fixture host key.
  const runner = require('../sshExecRunner') as { runBounded: unknown };
  (runner as { runBounded: unknown }).runBounded = (): Promise<unknown> =>
    Promise.resolve({
      exitCode: 0,
      stdout:
        options.scanned === undefined
          ? ''
          : `host ${options.scanned.algorithm} ${options.scanned.base64}\n`,
      stderr: '',
    });

  return { mod, warnings, updated, storage, dir };
}

function entity(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'prod', isSshEnabled: true, host: 'prod.example.com', ...over };
}

test('an entity with no host needs no host-key conversation at all', async () => {
  const w = world();

  const got = await w.mod.connectionOptions('acc', entity({ host: undefined }), w.storage as never, w.dir);

  assert.ok(got !== undefined, 'a credential without a host is not a refusal');
  assert.deepEqual(w.warnings, []);
});

test('a jump chain that cannot be built REFUSES, and says why once', async () => {
  // Returning options anyway would connect straight to the target, silently skipping the
  // bastion the person configured — the one outcome worse than not connecting.
  const w = world();
  const got = await w.mod.connectionOptions(
    'acc',
    entity({ jumpHostEntityId: 'missing-entity' }),
    w.storage as never,
    w.dir,
  );

  assert.equal(got, undefined);
  assert.equal(w.warnings.length, 1, w.warnings.join(' | '));
});

test('a refused host key refuses the CONNECTION, not just the pin', async () => {
  const w = world({ scanned: OTHER, answer: undefined });
  (w.storage as { _put(n: TreeNode): void })._put({
    id: 'e1',
    name: 'prod',
    type: 'entity',
    details: entity({ hostKey: formatHostKey(KEY) }),
  });

  const got = await w.mod.connectionOptions(
    'acc',
    entity({ hostKey: formatHostKey(KEY) }),
    w.storage as never,
    w.dir,
  );

  assert.equal(got, undefined, 'a changed key that nobody accepted must not connect');
  assert.deepEqual(w.updated, [], 'and nothing is written to the entity');
});

test('an accepted key is PERSISTED, so the other machines are not on first contact forever', async () => {
  // The pin is plaintext metadata on purpose: it syncs. A pin that lived on one laptop would
  // leave every other machine asking the same question, which is how people learn to click yes.
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  (w.storage as { _put(n: TreeNode): void })._put({
    id: 'e1',
    name: 'prod',
    type: 'entity',
    details: entity(),
  });

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir);

  assert.ok(got !== undefined);
  assert.equal(got.pin, formatHostKey(KEY), 'handed back to the caller');
  assert.equal(w.updated.length, 1, 'and written to the entity');
  assert.equal(w.updated[0].details?.hostKey, formatHostKey(KEY));
});

test('the options carry a known_hosts file, so ssh ENFORCES the pin rather than trusting it', async () => {
  const w = world({ scanned: KEY });
  const got = await w.mod.connectionOptions(
    'acc',
    entity({ hostKey: formatHostKey(KEY) }),
    w.storage as never,
    w.dir,
  );

  assert.ok(got?.knownHostsFile !== undefined);
  assert.match(fs.readFileSync(got.knownHostsFile, 'utf8'), /prod\.example\.com/);
});
