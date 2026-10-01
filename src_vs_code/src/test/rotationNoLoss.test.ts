import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { protectEntity } from '../entityPin';
import { writeUnattended } from '../entryWriter';
import { snapshotForRevision } from '../revisionSnapshot';
import type { RotateDeps } from '../rotateAction';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { NEW_SECRET_PLACEHOLDER } from '../secretRotation';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata } from '../types';
import type { UseAction, UseActionResult } from '../useActions';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * A rotation never loses a password the far side already accepted (the E2 security review, finding 1;
 * the code round's findings 5 and 14).
 *
 * <p>The far side changes FIRST and the vault after — the order that keeps a vault from holding a
 * password the server never accepted. Since E2 the store is unattended and refused on a protected
 * entry, so an entry protected (in another window) while the statement ran turned a rotation into a
 * lockout: the server had the new password, the vault kept the dead one, the new value was dropped and
 * the agent was told of an internal failure. Now the refusal hands the value to the PERSON: store it
 * under the entry's PIN, or — declined — copy it, and the agent is told it was not stored.</p>
 *
 * <p>Over the real `StorageManager` with every keychain write logged, the real door, and a far side that
 * "accepts" the statement while another window protects the entry.</p>
 */

const ENTRY = 'db1';
const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const NEW_SECRET = 'NEW-secret-4b7e-rotated';
const STORE_IT = 'Store it (asks for the entry’s PIN)';
const COPY_IT = 'Copy the new connection string';
const CTX = { accountId: ACCOUNT, entityId: ENTRY, entityName: 'orders-db' };
const STATEMENT = `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'`;

const details = (): EntityMetadata => ({ id: ENTRY, name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }) as EntityMetadata;

interface World {
  storage: StorageManager;
  s: Sinks;
  written: string[];
  rotate: () => Promise<UseActionResult>;
}

/** A plain database entry, and a far side that accepts the statement while another window protects the entry. */
async function world(inputs: (string | undefined)[], modal: (string | undefined)[]): Promise<World> {
  const s = sinks();
  s.modalAnswers.push(...modal);
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, details(), { 'database connection': CONN });
  // One graph: the store's `RotationNotStored` is the class the action catches.
  const [{ storeRotated }, { rotateAction }] = loadEachWithVscode(['../rotationStore', '../rotateAction'], stub) as [
    typeof import('../rotationStore'),
    typeof import('../rotateAction'),
  ];
  const farSide: UseAction = {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => '',
    describeOutcome: () => 'ok',
    run: async () => {
      // The server took the new password. Meanwhile, another window protected the entry.
      await protectEntity(storage, ACCOUNT, ENTRY, PIN);
      await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
      return { status: 200, body: { exitCode: 0, stdout: 'ALTER\n' } };
    },
  };
  const deps: RotateDeps = {
    generate: () => ({ ok: true, value: NEW_SECRET, kind: 'password' }),
    entity: (ctx) => storage.getNode(ctx.accountId, ctx.entityId)?.details,
    current: (ctx) => Promise.resolve(storage.getDbConnection(ctx.accountId, ctx.entityId)),
    snapshot: (ctx, d) => snapshotForRevision(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName, details: d }),
    record: (ctx, revision) => storage.recordRevision(ctx.accountId, ctx.entityId, revision),
    store: (ctx, slot, value) => storeRotated(storage, ctx, slot, value),
  };
  const action = rotateAction(farSide, 'query', deps);
  written.length = 0;
  const rotate = (): Promise<UseActionResult> =>
    action.run(CTX, { statement: STATEMENT }).catch((error: unknown) => ({ status: 500, body: { thrown: describeError(error) } }));
  return { storage, s, written, rotate };
}

const inTheClear = (w: World): string[] => w.written.filter((value) => value.includes(NEW_SECRET));

async function openedConnection(w: World): Promise<string | undefined> {
  const read = readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY));
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : undefined;
}

test('protected while the far side changed — the person stores the new value under the entry\'s PIN: sealed, kept, never in the clear', async () => {
  const w = await world([PIN], [STORE_IT]);

  const result = await w.rotate();

  const opened = await openedConnection(w);
  assert.ok(opened?.includes(NEW_SECRET) === true, `the far side's new password was dropped — the vault holds ${String(opened)}; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), [], 'the new value reached the keychain in the clear, in a protected entry');
  assert.equal(result.status, 200);
  assert.equal((result.body as { stored?: unknown }).stored, undefined, 'a stored rotation answers as it always did');
  assert.match(w.s.modals[0] ?? '', /WAS changed/);
});

test('protected while the far side changed — the person declines: the copy offer happens, nothing plain is stored, and the agent is told it was NOT stored', async () => {
  const w = await world([], [undefined, COPY_IT]);

  const result = await w.rotate();

  assert.equal(w.s.clipboard.filter((value) => value.includes(NEW_SECRET)).length, 1, `the far side's new password was dropped — never offered to the person; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), [], 'the new value reached the keychain in the clear');
  assert.equal(readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY)).kind, 'locked', 'the other window\'s seal was overwritten');
  assert.equal(result.status, 200, `the agent got an internal failure: ${JSON.stringify(result.body)}`);
  const body = result.body as { rotated?: unknown; stored?: unknown; message?: unknown };
  assert.deepEqual([body.rotated, body.stored], [true, false]);
  assert.match(String(body.message), /the far side changed; the new value was not stored in the vault; the person was told/i);
  assert.ok(!JSON.stringify(result.body).includes(NEW_SECRET), 'the agent was handed the new value');
  assert.match(w.s.modals[1] ?? '', /was NOT stored in the vault/);
});

test('protected while the far side changed — the person agrees but the PIN box is dismissed: the copy offer still comes, and nothing is stored in the clear', async () => {
  const w = await world([undefined], [STORE_IT, COPY_IT]);

  const result = await w.rotate();

  assert.equal(w.s.clipboard.filter((value) => value.includes(NEW_SECRET)).length, 1, `the far side's new password was dropped after the PIN box was dismissed; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), []);
  assert.equal((result.body as { stored?: unknown }).stored, false);
});

test('an unattended write refused because the entry was protected meanwhile does not tell its caller to "do it again from the entry"', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, details(), { 'database connection': CONN });

  const refused = await writeUnattended(storage, ACCOUNT, { id: ENTRY, name: 'orders-db' }, async (writer) => {
    await protectEntity(storage, ACCOUNT, ENTRY, PIN);
    await writer.setDbConnection(ACCOUNT, ENTRY, 'mysql://app:x@h/db');
  }).then(() => 'written', (error: unknown) => describeError(error));

  assert.match(refused, /"orders-db" was protected with a PIN/);
  assert.doesNotMatch(refused, /do it again from the entry/i, 'an unattended caller was told to do it again from the entry');
  assert.match(refused, /Nothing was stored/);
});
