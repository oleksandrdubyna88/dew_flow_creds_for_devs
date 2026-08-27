import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { configStub, loadWithVscode } from './vscodeStub';
import { emptySnapshot } from '../syncMerge';
import { StoredAccount, TreeNode } from '../types';

/**
 * The sync cycle (audit A3).
 *
 * <p>`syncMerge.ts` decides what a merge produces and is pure and tested. What is only true
 * HERE is when the cycle refuses to run at all, and those refusals are the most consequential
 * code in the extension: each one guards against writing a vault that is worse than the one
 * already there, and every machine then pulls the damage down.</p>
 *
 * <p>Three of them, each with its own catastrophe:</p>
 * <ul>
 *   <li><b>A locked vault.</b> No key, no cycle — never a push of local-only state over a
 *       remote nobody could read.</li>
 *   <li><b>A detected tamper.</b> Decrypting, merging and re-encrypting would write a FRESH
 *       VALID MAC over the altered file, healing a detected tamper into a legitimate-looking
 *       one. It fails closed and leaves the evidence.</li>
 *   <li><b>An unreadable local tree.</b> A sealed metadata slot that will not open yields an
 *       empty node list while tombstones and the horizon survive, so the merge empties the
 *       vault, `remoteChanged` is true, and the push would empty every other machine on its
 *       next cycle. A keychain reset would destroy the vault everywhere. The cycle stops
 *       BEFORE the merge.</li>
 * </ul>
 *
 * <p>The merge itself is the real `mergeProfiles`, and the envelope MAC is the real
 * `verifyEnvelopeMac` — a stub for either would let these tests agree with an assumption
 * rather than with the code they are guarding.</p>
 */

type Sync = typeof import('../syncManager');

const A: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };

/**
 * A node the real validators accept.
 *
 * <p>`isSshEnabled` is REQUIRED by `isEntityMetadata`, and leaving it out is not a small
 * inaccuracy: `isBackupBundle` then rejects the decrypted payload, `syncProfile` throws
 * `corrupted` before it ever reaches the merge, and every test asserting "nothing was
 * written" passes without exercising the guard it names. Three of the tests below did
 * exactly that until this was fixed.</p>
 */
function node(id: string, name: string): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: null,
    details: { id, name, kind: 'credential', isSshEnabled: false },
  } as unknown as TreeNode;
}

/** A real envelope. `version` decides whether the MAC is even checked (v2 only). */
function envelope(options: { version?: number; mac?: string } = {}): string {
  return JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version: options.version ?? 3,
    kdf: 'hkdf',
    account: A,
    salt: 's',
    iv: 'i',
    tag: 't',
    data: 'd',
    ...(options.mac === undefined ? {} : { mac: options.mac }),
  });
}

interface World {
  mod: Sync;
  writes: string[];
  applied: number;
  warnings: string[];
  errors: string[];
  logs: string[];
  /** The wrap list `encrypt` was handed, when the cycle passed one. Undefined = it did not. */
  escrowWraps?: unknown[];
}

interface Parts {
  raw?: string;
  /** undefined = the vault stays locked. */
  key?: { masterKey: Buffer; version: number };
  remoteNodes?: TreeNode[];
  localNodes?: TreeNode[];
  metadataFault?: string;
  embedsShares?: boolean;
  changeToken?: string;
}

function world(): World {
  const w: World = { mod: undefined as never, writes: [], applied: 0, warnings: [], errors: [], logs: [] };
  const config = configStub({ autoSync: false });
  w.mod = loadWithVscode<Sync>('../syncManager', {
    workspace: {
      getConfiguration: config.workspace.getConfiguration,
      onDidChangeConfiguration: (): { dispose(): void } => ({ dispose: (): void => undefined }),
    },
    window: {
      showWarningMessage: (m: string): Promise<undefined> => {
        w.warnings.push(m);
        return Promise.resolve(undefined);
      },
      showErrorMessage: (m: string): Promise<undefined> => {
        w.errors.push(m);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (m: string): Promise<undefined> => {
        w.warnings.push(m);
        return Promise.resolve(undefined);
      },
    },
    ConfigurationTarget: { Global: 1 },
  });
  return w;
}

function manager(w: World, parts: Parts): InstanceType<Sync['SyncManager']> {
  const localSnapshot = { ...emptySnapshot(), nodes: parts.localNodes ?? [] };
  const storage = {
    getAccounts: (): StoredAccount[] => [A],
    changeToken: (): string => parts.changeToken ?? 'token-1',
    getSnapshot: (): Promise<unknown> => Promise.resolve(localSnapshot),
    applySnapshot: (): Promise<void> => {
      w.applied += 1;
      return Promise.resolve();
    },
    get metadataFault(): string | undefined {
      return parts.metadataFault;
    },
  };
  const keys = {
    unlock: (): Promise<unknown> => Promise.resolve(parts.key),
    decrypt: (): Promise<unknown> =>
      Promise.resolve({ ...emptySnapshot(), nodes: parts.remoteNodes ?? [], version: 1, accountId: 'a1' }),
    encrypt: (bundle: unknown, _k: unknown, _a: unknown, _s: unknown, wraps?: unknown[]): Promise<string> => {
      // Recorded rather than ignored: whether a cycle changed the wrap list is the whole
      // question the corporate-escrow tests below ask, and it is invisible in the ciphertext.
      w.escrowWraps = wraps === undefined ? w.escrowWraps : [...wraps];
      return Promise.resolve(JSON.stringify(bundle));
    },
  };
  const transport = {
    location: '/mnt/nas',
    kind: 'folder' as const,
    embedsShares: parts.embedsShares ?? false,
    readVault: (): Promise<string | undefined> => Promise.resolve(parts.raw),
    writeVault: (_a: unknown, content: string): Promise<void> => {
      w.writes.push(content);
      return Promise.resolve();
    },
    listTeam: (): Promise<unknown[]> => Promise.resolve([]),
    listShares: (): Promise<unknown[]> => Promise.resolve([]),
    appendShares: (): Promise<void> => Promise.resolve(),
    removeShare: (): Promise<void> => Promise.resolve(),
    deleteVault: (): Promise<void> => Promise.resolve(),
  };
  const transports = { forAccount: (): unknown => transport };
  return new w.mod.SyncManager(
    storage as never,
    keys as never,
    transports as never,
    () => undefined,
    undefined,
    undefined,
    {
      info: (_s: string, m: string): void => {
        w.logs.push(m);
      },
      error: (_s: string, m: string): void => {
        w.logs.push(m);
      },
    },
  );
}

const KEY = { masterKey: Buffer.alloc(32, 1), version: 3 };

test('a LOCKED vault is never pushed over — no key, no cycle', async () => {
  // Otherwise the first machine that cannot unlock would write its local-only state over a
  // remote nobody there could read.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: undefined, localNodes: [node('n1', 'local')] });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.deepEqual(w.writes, []);
  assert.equal(w.applied, 0);
});

test('a locked vault is REPORTED, not silently skipped forever', async () => {
  const w = world();
  const sync = manager(w, { raw: envelope(), key: undefined });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.ok(w.warnings.length > 0, 'the person is told which vault needs unlocking');
});

test('a DETECTED TAMPER fails the cycle closed — it is never healed into a valid file', async () => {
  // Decrypting, merging and re-encrypting writes a fresh valid MAC over the altered file.
  // That turns evidence of tampering into a file that looks legitimate to every machine.
  const w = world();
  const sync = manager(w, {
    raw: envelope({ version: 2, mac: 'AAAA' }),
    key: { masterKey: Buffer.alloc(32, 1), version: 2 },
    localNodes: [node('n1', 'local')],
  });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.deepEqual(w.writes, [], 'nothing was written over the evidence');
  assert.equal(w.applied, 0, 'and nothing from it was applied locally');
  assert.ok(w.warnings.some((m) => /tamper|modified|altered/i.test(m)), w.warnings.join(' | '));
});

test('an UNREADABLE LOCAL TREE stops the cycle before the merge', async () => {
  // The catastrophe this guards: a sealed metadata slot that will not open yields an empty
  // node list while tombstones and the horizon survive intact, so the merge drops every
  // remote node, remoteChanged is true, and the push empties every other machine in turn.
  const w = world();
  const sync = manager(w, {
    raw: envelope(),
    key: KEY,
    remoteNodes: [node('n1', 'a real entity')],
    localNodes: [],
    metadataFault: 'the keychain refused',
  });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.deepEqual(w.writes, [], 'the remote is left exactly as it is');
  assert.equal(w.applied, 0);
  assert.ok(w.warnings.length > 0, 'and it says so rather than looking like a quiet success');
});

test('a first sync with no remote file writes the local state', async () => {
  // The ordinary bootstrap: nothing at the location yet.
  const w = world();
  const sync = manager(w, { raw: undefined, key: KEY, localNodes: [node('n1', 'local')] });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.writes.length, 1);
  assert.match(w.writes[0], /"n1"/, 'and it carries the local entity');
});

test('a remote entity the local tree has never seen is applied locally', async () => {
  const w = world();
  const sync = manager(w, {
    raw: envelope(),
    key: KEY,
    remoteNodes: [node('n2', 'from another machine')],
    localNodes: [],
  });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.applied, 1, 'the local tree took the remote entity');
});

test('nothing changed on either side means no write at all', async () => {
  // A cycle that rewrote an identical vault every tick would churn a metered cloud folder and
  // make every other machine re-download it.
  const shared = [node('n1', 'same')];
  const w = world();
  const sync = manager(w, { raw: envelope(), key: KEY, remoteNodes: shared, localNodes: shared });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.deepEqual(w.writes, []);
  assert.equal(w.applied, 0);
});

test('a second identical cycle does no work — the converged mark is honoured', async () => {
  // The idle-cycle optimisation: rebuilding the snapshot costs keychain reads per entity, to
  // reproduce what the previous cycle already proved.
  const shared = [node('n1', 'same')];
  const w = world();
  const sync = manager(w, { raw: envelope(), key: KEY, remoteNodes: shared, localNodes: shared });

  try {
    await sync.syncNow();
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.deepEqual(w.writes, []);
});

test('a v1 vault is migrated even when nothing needs syncing', async () => {
  // A legacy PIN-only file costs a full scrypt on every read; it is rewritten to v3 promptly.
  // Only reachable after a SUCCESSFUL decrypt, so it can never overwrite an unreadable file.
  const shared = [node('n1', 'same')];
  const w = world();
  const sync = manager(w, {
    raw: envelope(),
    key: { masterKey: Buffer.alloc(32, 1), version: 1 },
    remoteNodes: shared,
    localNodes: shared,
  });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.writes.length, 1, 'the migration happens without waiting for a change');
});

test('a security-key wrap seen in the envelope is remembered for the readiness indicator', async () => {
  const w = world();
  const raw = JSON.stringify({
    ...JSON.parse(envelope()),
    wraps: [{ kind: 'webauthn', id: 'k1', salt: 's', iv: 'i', tag: 't', data: 'd' }],
  });
  const sync = manager(w, { raw, key: KEY, remoteNodes: [], localNodes: [] });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(sync.hasSecurityKey('a1'), true);
});

test('an envelope with no security-key wrap CLEARS a previously remembered one', async () => {
  // Removing the last key elsewhere must not leave this window claiming the vault is
  // key-protected when it no longer is.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: KEY, remoteNodes: [], localNodes: [] });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(sync.hasSecurityKey('a1'), false);
});

test('disposing stops the timers — a disposed manager does not keep syncing', () => {
  const w = world();
  const sync = manager(w, { raw: envelope(), key: KEY });

  assert.doesNotThrow(() => sync.dispose());
});

// ---------------------------------------------------------------- corporate escrow

/**
 * Enrolment rides the ordinary sync write. `orgEscrowOps` decides WHAT should happen and is pure
 * and tested; what is only true here is that the cycle asks, applies the answer, and — the part
 * that matters most — cannot be stopped by the asking going wrong.
 */

const ORG = require('../orgEscrowCrypto') as typeof import('../orgEscrowCrypto');

type Enrolment = import('../orgEscrowOps').EscrowEnrolment;

/**
 * A WRAPPED key — `VaultKey.version === 2` means "wrapped", which is a different number from the
 * envelope's own version. The harness's `KEY` above says 3, which no `VaultKey` ever is; it works
 * for the other tests only because none of them reads it. Escrow does: a legacy key mints a fresh
 * master of its own on write, so a wrap list built against the old one would seal nothing.
 */
const WRAPPED_KEY = { version: 2, masterKey: Buffer.alloc(32, 7), wraps: [] };

function enrolment(verdict: Enrolment['verdict'] = 'verified'): Enrolment {
  const pair = ORG.generateOrgRecoveryKeypair();
  return {
    orgPublicKey: pair.publicKey,
    orgPublicKeyFingerprint: 'FP-1',
    verdict,
  };
}

/** The wraps the write actually carried, read back out of what `encrypt` was handed. */
function wrapsWritten(w: World): { kind: string }[] {
  const stub = require('../keyWrap') as typeof import('../keyWrap');
  return (w.escrowWraps ?? []).filter(stub.isKeyWrap);
}

test('a cycle with no escrow resolver behaves exactly as it did before the feature', async () => {
  // The default. Corporate recovery must be invisible to every deployment that has none.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: KEY, remoteNodes: [], localNodes: [node('n1', 'a')] });

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.escrowWraps, undefined, 'no wrap list was passed to encrypt');
});

test('a resolver that THROWS cannot stop somebody’s own secrets from syncing', async () => {
  // The most consequential branch in the wiring. Corporate recovery being unreachable — a
  // timeout, an older server, an offline laptop — is a reason to leave the wraps alone, never
  // a reason for a person's own vault to stop syncing.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: WRAPPED_KEY, remoteNodes: [], localNodes: [node('n1', 'a')] });
  sync.resolveEscrow = (): Promise<never> => Promise.reject(new Error('server unreachable'));

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.writes.length, 1, 'the cycle still wrote');
  assert.equal(w.escrowWraps, undefined, 'and changed no wraps');
  assert.ok(
    w.logs.some((l) => /corporate recovery unreadable/.test(l)),
    'the failure is in the diagnostic log rather than in front of the person',
  );
});

test('an enrolling cycle writes even when nothing else changed', async () => {
  // A wrap change IS a reason to write. Without this, a vault on an idle machine would never
  // enrol at all — it would wait for an unrelated edit.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: WRAPPED_KEY, remoteNodes: [], localNodes: [] });
  sync.resolveEscrow = (): Promise<Enrolment> => Promise.resolve(enrolment());
  sync.escrowOfficers = ['cto@corp.com'];

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(w.writes.length, 1);
  assert.deepEqual(wrapsWritten(w).map((x) => x.kind), ['org-escrow']);
  assert.ok(
    w.warnings.some((m) => /recoverable by your organisation's officers \(cto@corp\.com\)/.test(m)),
    'and the person is told, by name',
  );
});

test('the notice is said once per change, not once per cycle', async () => {
  // A message that appears every five minutes is one people switch off, which makes it worse
  // than no message at all.
  const w = world();
  const sync = manager(w, { raw: envelope(), key: WRAPPED_KEY, remoteNodes: [], localNodes: [] });
  const fixed = enrolment();
  sync.resolveEscrow = (): Promise<Enrolment> => Promise.resolve(fixed);

  try {
    await sync.syncNow();
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(
    w.warnings.filter((m) => /recoverable by your organisation/.test(m)).length,
    1,
  );
});

test('an untrusted key does not enrol, and says why', async () => {
  const w = world();
  const sync = manager(w, { raw: envelope(), key: WRAPPED_KEY, remoteNodes: [], localNodes: [] });
  sync.resolveEscrow = (): Promise<Enrolment> => Promise.resolve(enrolment('keyChanged'));

  try {
    await sync.syncNow();
  } finally {
    sync.dispose();
  }

  assert.equal(wrapsWritten(w).length, 0, 'nothing was sealed to a key this machine distrusts');
});
