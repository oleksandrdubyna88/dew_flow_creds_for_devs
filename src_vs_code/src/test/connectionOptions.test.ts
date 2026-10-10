import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { memoryStorage } from './pinWorld';
import { formatHostKey, HostKey } from '../hostKeyPin';
import type { StorageManager } from '../storageManager';
import { EntityMetadata } from '../types';

/**
 * Whether a connection may go ahead at all, and under what options (audit D7 + B10).
 *
 * <p>One function serving BOTH the human Connect path and the agent's exec, for the reason
 * `sshCredential` gives about credentials: two answers to "which bastion, which host key" means
 * one surface reaches a host the other refuses, and nobody finds out until it matters. So the
 * cases that must return `undefined` — a refused key, an unbuildable jump chain — are the ones
 * worth pinning, because returning options anyway is a connection nobody authorised.</p>
 *
 * <p>The vault is the REAL `StorageManager` over memory (`pinWorld.memoryStorage`), so the pin a
 * conversation writes is read back from the entry rather than counted in a fake (E4.S4, code round 3).</p>
 */

type Options = typeof import('../connectionOptions');

const KEY: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const OTHER: HostKey = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIOTHERKEY' };
const ACCOUNT = 'acc';

interface World {
  mod: Options;
  warnings: string[];
  storage: StorageManager;
  dir: string;
  /** The signal each host-key scan was handed — the agent request's, when an agent asked (E4.S4). */
  scanSignals: (AbortSignal | undefined)[];
  /** The entry, as it is now stored — `undefined` when it was never put. */
  stored(): EntityMetadata | undefined;
  /** Put the entry into the vault, as a window that saved it would have. */
  put(details: EntityMetadata): Promise<void>;
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
  /** Runs while the pin is being written onto the entry — the awaited vault write after the person's answer. */
  duringWrite?: () => void;
}

/**
 * `scanHostKey` spawns `ssh-keyscan`, which a unit test must not do — so the host answers
 * through a stubbed `runBounded`, exactly as the real scan reads it.
 */
function world(options: WorldOptions = {}): World {
  const warnings: string[] = [];
  const scanSignals: (AbortSignal | undefined)[] = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-conn-'));

  const answer = (m: string): Promise<string | undefined> => {
    warnings.push(m);
    options.duringAsk?.();
    return Promise.resolve(options.answer);
  };
  const stub = {
    window: { showWarningMessage: answer, showErrorMessage: answer },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  };

  // The vault FIRST: `memoryStorage` loads its own graph, and the module under test must come after, so the
  // `sshExecRunner` patched below is the one its graph captured.
  const storage = withWriteHook(memoryStorage(stub), options.duringWrite);
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

  return {
    mod,
    warnings,
    storage,
    dir,
    scanSignals,
    stored: () => storage.getNode(ACCOUNT, 'e1')?.details,
    put: async (details) => {
      await storage.upsertAccount({ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' });
      await storage.addNode(ACCOUNT, { id: details.id, name: details.name, type: 'entity', parentId: null, details });
    },
  };
}

/** The real manager, with its one write the conversation makes observed mid-flight when a test asks. */
function withWriteHook(storage: StorageManager, duringWrite: (() => void) | undefined): StorageManager {
  if (duringWrite === undefined) {
    return storage;
  }
  const write = storage.updateDetailsFields.bind(storage);
  storage.updateDetailsFields = (accountId: string, id: string, fields: Partial<EntityMetadata>): Promise<void> => {
    duringWrite();
    return write(accountId, id, fields);
  };
  return storage;
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

const filesUnder = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

test('an entity with no host needs no host-key conversation at all', async () => {
  const w = world();

  const got = await w.mod.connectionOptions(ACCOUNT, entity({ host: undefined }), w.storage, w.dir, undefined);

  assert.ok(got !== undefined, 'a credential without a host is not a refusal');
  assert.deepEqual(w.warnings, []);
});

test('a jump chain that cannot be built REFUSES, and says why once', async () => {
  // Returning options anyway would connect straight to the target, silently skipping the
  // bastion the person configured — the one outcome worse than not connecting.
  const w = world();
  const got = await w.mod.connectionOptions(ACCOUNT, entity({ jumpHostEntityId: 'missing-entity' }), w.storage, w.dir, undefined);

  assert.equal(got, undefined);
  assert.equal(w.warnings.length, 1, w.warnings.join(' | '));
});

test('a refused host key refuses the CONNECTION, not just the pin', async () => {
  const w = world({ scanned: OTHER, answer: undefined });
  await w.put(entity({ hostKey: formatHostKey(KEY) }));

  const got = await w.mod.connectionOptions(ACCOUNT, entity({ hostKey: formatHostKey(KEY) }), w.storage, w.dir, undefined);

  assert.equal(got, undefined, 'a changed key that nobody accepted must not connect');
  assert.equal(w.stored()?.hostKey, formatHostKey(KEY), 'and nothing is written to the entity');
});

test('an accepted key is PERSISTED, so the other machines are not on first contact forever', async () => {
  // The pin is plaintext metadata on purpose: it syncs. A pin that lived on one laptop would
  // leave every other machine asking the same question, which is how people learn to click yes.
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, undefined);

  assert.ok(got !== undefined);
  assert.equal(got.pin, formatHostKey(KEY), 'handed back to the caller');
  assert.equal(w.stored()?.hostKey, formatHostKey(KEY), 'and written to the entity');
});

test('the options carry a known_hosts file, so ssh ENFORCES the pin rather than trusting it', async () => {
  const w = world({ scanned: KEY });
  const got = await w.mod.connectionOptions(ACCOUNT, entity({ hostKey: formatHostKey(KEY) }), w.storage, w.dir, undefined);

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

test('a request already gone is asked no host-key question, and nothing is written (E4.S4)', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, request.signal);

  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'the host-key question was raised for a request whose client had gone');
  assert.equal(w.stored()?.hostKey, undefined, 'a pin was written for a request whose client had gone');
  assert.deepEqual(filesUnder(w.dir), [], 'a known_hosts file was written for a request whose client had gone');
});

test('a client gone while the host-key question is open: Trust and connect writes no pin, and nothing goes ahead (E4.S4)', async () => {
  const request = new AbortController();
  const w = world({ scanned: KEY, answer: 'Trust and connect', duringAsk: () => request.abort() });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, request.signal);

  assert.equal(w.warnings.length, 1, 'the question was asked once, of a live request');
  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.equal(w.stored()?.hostKey, undefined, 'the pin was written onto the entity for a request whose client had gone');
  assert.deepEqual(filesUnder(w.dir), [], 'a known_hosts file was written for a request whose client had gone');
});

test('a client gone while the host-key scan runs: the scan is cancelled, nobody is asked, nothing is written (E4.S4)', async () => {
  // The plan round's second finding: a scan that stalls must not keep a gone request pending. The scan is
  // handed the request's signal, so the client's departure kills it; what follows asks and writes nothing.
  const request = new AbortController();
  const w = world({ holdScan: true, answer: 'Trust and connect' });
  await w.put(entity());

  const pending = w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, request.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  request.abort();
  const got = await pending;

  assert.deepEqual(w.scanSignals, [request.signal], 'the scan was not handed the request it serves');
  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'a question was raised for a request whose client had gone');
  assert.equal(w.stored()?.hostKey, undefined);
  assert.deepEqual(filesUnder(w.dir), []);
});

test('a client gone during the scan whose key still comes back is asked no question (own review)', async () => {
  // The request's end kills `ssh-keyscan`, but a key it had already printed is still returned — and a
  // first-contact key is exactly what raises the question. The request is read again after the scan.
  const request = new AbortController();
  const w = world({ scanned: KEY, answer: 'Trust and connect', duringScan: () => request.abort() });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, request.signal);

  assert.deepEqual(w.warnings, [], 'the host-key question was raised for a request whose client had gone');
  assert.equal(got, undefined);
  assert.equal(w.stored()?.hostKey, undefined);
  assert.deepEqual(filesUnder(w.dir), []);
});

test('a client gone while the accepted pin is being written: the pin stands, no known_hosts is written, nothing goes ahead (code round 3)', async () => {
  // The write began for a live request — the person's Trust and connect was given while somebody waited —
  // and a write already started is finished, as E4.S1 holds for a consent remembered. The file after it is
  // for a connection that will not happen, and the request is read again before it.
  const request = new AbortController();
  const w = world({ scanned: KEY, answer: 'Trust and connect', duringWrite: () => request.abort() });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, request.signal);

  assert.equal(w.stored()?.hostKey, formatHostKey(KEY), 'the trust the person gave to a live request was lost');
  assert.equal(got, undefined, 'the connection went ahead for a request whose client had gone');
  assert.deepEqual(filesUnder(w.dir), [], 'a known_hosts file was written for a request whose client had gone');
});

test('the person’s own click, with no request behind it, is asked and trusted exactly as before (E4.S4)', async () => {
  const w = world({ scanned: KEY, answer: 'Trust and connect' });
  await w.put(entity());

  const got = await w.mod.connectionOptions(ACCOUNT, entity(), w.storage, w.dir, undefined);

  assert.equal(w.warnings.length, 1);
  assert.equal(got?.pin, formatHostKey(KEY));
  assert.equal(w.stored()?.hostKey, formatHostKey(KEY));
});
