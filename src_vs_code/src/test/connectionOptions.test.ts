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
  /** The signal each host-key scan was handed — the agent request's, when an agent asked (E4.S4). */
  scanSignals: (AbortSignal | undefined)[];
}

interface WorldOptions {
  scanned?: HostKey;
  answer?: string;
  /** Runs while the host-key question is open, before the person's answer is read (E4.S4). */
  duringAsk?: () => void;
  /** The scan does not answer until its signal fires, and then fails as a killed `ssh-keyscan` does (E4.S4). */
  holdScan?: boolean;
  /** Runs inside the scan, before it answers — where the client can leave while a key is already on its way. */
  duringScan?: () => void;
}

/**
 * `scanHostKey` spawns `ssh-keyscan`, which a unit test must not do — so the host answers
 * through a stubbed `runBounded`, exactly as the real scan reads it.
 */
function world(options: WorldOptions = {}): World {
  const warnings: string[] = [];
  const updated: TreeNode[] = [];
  const scanSignals: (AbortSignal | undefined)[] = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-conn-'));
  const nodes = new Map<string, TreeNode>();

  const answer = (m: string): Promise<string | undefined> => {
    warnings.push(m);
    options.duringAsk?.();
    return Promise.resolve(options.answer);
  };
  const stub = {
    window: { showWarningMessage: answer, showErrorMessage: answer },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  };

  const storage = {
    getNode: (_a: string, id: string): TreeNode | undefined => nodes.get(id),
    // Follows the seam: production writes a PATCH against an id now, so the fake composes it the
    // way `StorageManager.updateNodeFields` does — otherwise the test asserts against a shape the
    // product no longer produces.
    updateNodeFields: (_a: string, id: string, patch: Partial<TreeNode>): Promise<void> => {
      const before = nodes.get(id);
      updated.push({ ...(before ?? ({ id } as TreeNode)), ...patch } as TreeNode);
      return Promise.resolve();
    },
    // Merges into the CURRENT details, exactly as `StorageManager.updateDetailsFields` does — a
    // fake that replaced them would assert against a shape the product no longer produces.
    updateDetailsFields: (_a: string, id: string, fields: Record<string, unknown>): Promise<void> => {
      const before = nodes.get(id);
      updated.push({ ...(before ?? ({ id } as TreeNode)), details: { ...before?.details, ...fields } } as TreeNode);
      return Promise.resolve();
    },
    _put: (node: TreeNode): void => {
      nodes.set(node.id, node);
    },
  };

  const mod = loadWithVscode<Options>('../connectionOptions', stub);
  // The scan is reached through sshExecRunner; make it answer with the fixture host key — or, held, not
  // until the request it serves ends, when it fails the way a killed `ssh-keyscan` does.
  const runner = require('../sshExecRunner') as { runBounded: unknown };
  (runner as { runBounded: unknown }).runBounded = (_c: unknown, _a: unknown, _s: unknown, o: { signal?: AbortSignal }): Promise<unknown> => {
    scanSignals.push(o.signal);
    if (options.holdScan === true) {
      return scanKilledWhen(o.signal);
    }
    options.duringScan?.();
    return Promise.resolve({
      exitCode: 0,
      stdout:
        options.scanned === undefined
          ? ''
          : `host ${options.scanned.algorithm} ${options.scanned.base64}\n`,
      stderr: '',
    });
  };

  return { mod, warnings, updated, storage, dir, scanSignals };
}

/** A scan that never answers on its own: it ends only when its signal fires, as a killed child's promise does. */
function scanKilledWhen(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    const killed = (): void => reject(Object.assign(new Error('ssh-keyscan was killed'), { name: 'AbortError' }));
    if (signal === undefined) {
      return;
    }
    if (signal.aborted) {
      killed();
      return;
    }
    signal.addEventListener('abort', killed, { once: true });
  });
}

function entity(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'prod', isSshEnabled: true, host: 'prod.example.com', ...over };
}

test('an entity with no host needs no host-key conversation at all', async () => {
  const w = world();

  const got = await w.mod.connectionOptions('acc', entity({ host: undefined }), w.storage as never, w.dir, undefined);

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
    undefined,
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
    undefined,
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

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, undefined);

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
    undefined,
  );

  assert.ok(got?.knownHostsFile !== undefined);
  assert.match(fs.readFileSync(got.knownHostsFile, 'utf8'), /prod\.example\.com/);
});

/**
 * A gone request reaches no host-key question (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, E4.S4).
 *
 * <p>The conversation used to run with no idea whose request it served: a client gone during the PIN box
 * before it still got the first-contact question raised, and a person who clicked *Trust and connect* wrote
 * the pin onto the entity — synced metadata — for a connection that never happened.</p>
 */
const filesUnder = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

test('a request already gone is asked no host-key question, and nothing is written (E4.S4)', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  (w.storage as { _put(n: TreeNode): void })._put({ id: 'e1', name: 'prod', type: 'entity', details: entity() });

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, request.signal);

  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'the host-key question was raised for a request whose client had gone');
  assert.deepEqual(w.updated, [], 'a pin was written for a request whose client had gone');
  assert.deepEqual(filesUnder(w.dir), [], 'a known_hosts file was written for a request whose client had gone');
});

test('a client gone while the host-key question is open: Trust and connect writes no pin, and nothing goes ahead (E4.S4)', async () => {
  const request = new AbortController();
  const w = world({ scanned: KEY, answer: 'Trust and connect', duringAsk: () => request.abort() });
  (w.storage as { _put(n: TreeNode): void })._put({ id: 'e1', name: 'prod', type: 'entity', details: entity() });

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, request.signal);

  assert.equal(w.warnings.length, 1, 'the question was asked once, of a live request');
  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(w.updated, [], 'the pin was written onto the entity for a request whose client had gone');
  assert.deepEqual(filesUnder(w.dir), [], 'a known_hosts file was written for a request whose client had gone');
});

test('a client gone while the host-key scan runs: the scan is cancelled, nobody is asked, nothing is written (E4.S4)', async () => {
  // The plan round's second finding: a scan that stalls must not keep a gone request pending. The scan is
  // handed the request's signal, so the client's departure kills it; what follows asks and writes nothing.
  const request = new AbortController();
  const w = world({ holdScan: true, answer: 'Trust and connect' });
  (w.storage as { _put(n: TreeNode): void })._put({ id: 'e1', name: 'prod', type: 'entity', details: entity() });

  const pending = w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, request.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  request.abort();
  const got = await pending;

  assert.deepEqual(w.scanSignals, [request.signal], 'the scan was not handed the request it serves');
  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'a question was raised for a request whose client had gone');
  assert.deepEqual(w.updated, []);
  assert.deepEqual(filesUnder(w.dir), []);
});

test('a client gone during the scan whose key still comes back is asked no question (own review)', async () => {
  // The request's end kills `ssh-keyscan`, but a key it had already printed is still returned — and a
  // first-contact key is exactly what raises the question. The request is read again after the scan.
  const request = new AbortController();
  const w = world({ scanned: KEY, answer: 'Trust and connect', duringScan: () => request.abort() });
  (w.storage as { _put(n: TreeNode): void })._put({ id: 'e1', name: 'prod', type: 'entity', details: entity() });

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, request.signal);

  assert.deepEqual(w.warnings, [], 'the host-key question was raised for a request whose client had gone');
  assert.equal(got, undefined);
  assert.deepEqual(w.updated, []);
  assert.deepEqual(filesUnder(w.dir), []);
});

test('the person’s own click, with no request behind it, is asked and trusted exactly as before (E4.S4)', async () => {
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  (w.storage as { _put(n: TreeNode): void })._put({ id: 'e1', name: 'prod', type: 'entity', details: entity() });

  const got = await w.mod.connectionOptions('acc', entity(), w.storage as never, w.dir, undefined);

  assert.equal(w.warnings.length, 1);
  assert.equal(got?.pin, formatHostKey(KEY));
  assert.equal(w.updated.length, 1);
});
