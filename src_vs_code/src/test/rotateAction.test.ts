import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { RotateDeps, rotateAction } from '../rotateAction';
import {
  NEW_SECRET_PLACEHOLDER,
  checkRotation,
  countPlaceholders,
  slotFor,
  storedValueFor,
  substituteNewSecret,
} from '../secretRotation';
import type { UseAction, UseActionResult } from '../useActions';
import type { EntityMetadata } from '../types';

/**
 * Rotation: the far side changes first, and only then does the vault.
 *
 * <p>Three things can go wrong here and two of them are silent. <b>Storing before running</b>
 * leaves a vault holding a password the server never accepted — an entry that looks fine until
 * somebody tries it. <b>Storing after a failed run</b> does the same thing with extra steps: a
 * database that refuses `ALTER USER` answers with a non-zero exit code inside a perfectly
 * successful call, so a 200 is not evidence. And <b>skipping the snapshot</b> makes the mistake
 * unrecoverable, which is the one property that turns a bad rotation into a lost credential.</p>
 *
 * <p>The fourth thing is not silent but is worse: the agent seeing the new secret. It writes a
 * placeholder and this substitutes — so the tests below check that the value handed to the far
 * side is not the value the agent sent, and that what the person is asked about still shows the
 * placeholder.</p>
 */

const OLD = 'old-password-9f2c';
const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';

interface Log {
  ran: string[];
  recorded: number;
  stored: { slot: string; value: string }[];
  refreshed: number;
}

function world(
  overrides: { result?: UseActionResult; details?: Partial<EntityMetadata>; current?: string } = {},
): { action: UseAction; log: Log; generated: string } {
  const log: Log = { ran: [], recorded: 0, stored: [], refreshed: 0 };
  const generated = 'NEW-secret-4b7e';
  const underlying: UseAction = {
    kind: 'db',
    action: 'query',
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: (body) => String((body as { query?: unknown }).query ?? ''),
    describeOutcome: () => 'ok',
    run: (_ctx, body) => {
      log.ran.push(String((body as { query?: unknown }).query ?? ''));
      return Promise.resolve(overrides.result ?? { status: 200, body: { exitCode: 0, stdout: 'ALTER\n' } });
    },
  };
  const deps: RotateDeps = {
    generate: (kind) =>
      kind === 'x509'
        ? { ok: false, kind: 'x509', message: 'Certificates come from a certificate authority.' }
        : { ok: true, value: generated, kind: 'password' },
    entity: () =>
      ({ id: 'e1', name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql', ...overrides.details }) as EntityMetadata,
    current: () => Promise.resolve(overrides.current ?? CONN),
    snapshot: () => Promise.resolve({ at: 1, name: 'orders-db', details: {} as EntityMetadata, secrets: {} }),
    record: () => {
      log.recorded += 1;
      return Promise.resolve();
    },
    store: (_ctx, slot, value) => {
      log.stored.push({ slot, value });
      return Promise.resolve();
    },
    onRotated: () => {
      log.refreshed += 1;
    },
  };
  return { action: rotateAction(underlying, 'query', deps), log, generated };
}

const CTX = { accountId: 'a1', entityId: 'e1', entityName: 'orders-db' };
const STATEMENT = `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'`;

test('the agent never writes the secret — the window substitutes it', async () => {
  const { action, log, generated } = world();

  await action.run(CTX, { statement: STATEMENT });

  assert.equal(log.ran.length, 1);
  assert.ok(log.ran[0].includes(generated), 'the far side got the real value');
  assert.equal(log.ran[0].includes(NEW_SECRET_PLACEHOLDER), false, 'and not the placeholder');
});

test('what the person is asked about still shows the placeholder', () => {
  // The prompt must not display the generated value: that would put it on a screen, in a
  // screenshot, and in this window's own audit line.
  const { action, generated } = world();

  const summary = action.summarize({ statement: STATEMENT });

  assert.ok(summary.includes(NEW_SECRET_PLACEHOLDER));
  assert.equal(summary.includes(generated), false);
});

test('a successful rotation snapshots first, then stores', async () => {
  const { action, log, generated } = world();

  const result = await action.run(CTX, { statement: STATEMENT });

  assert.equal(result.status, 200);
  assert.equal(log.recorded, 1, 'the previous value went into history');
  assert.equal(log.stored.length, 1);
  assert.equal(log.stored[0].slot, 'dbConnection');
  assert.ok(log.stored[0].value.includes(generated));
  assert.equal(log.refreshed, 1, 'the tree was told');
});

test('a statement that FAILED stores nothing, however successful the call was', async () => {
  // The trap: a 200 means the query ran, not that it worked. A database refusing ALTER USER
  // answers with a non-zero exit code inside a perfectly successful call.
  const { action, log } = world({ result: { status: 200, body: { exitCode: 1, stderr: 'denied' } } });

  const result = await action.run(CTX, { statement: STATEMENT });

  assert.equal(log.stored.length, 0, 'the vault must not hold a password the server refused');
  assert.equal(log.recorded, 0, 'and history was not disturbed');
  assert.deepEqual(result.body, { exitCode: 1, stderr: 'denied' }, 'the real error is handed back as it came');
});

test('a refused call stores nothing either', async () => {
  const { action, log } = world({ result: { status: 500, body: { error: 'boom' } } });

  await action.run(CTX, { statement: STATEMENT });

  assert.equal(log.stored.length, 0);
  assert.equal(log.recorded, 0);
});

test('a statement with no placeholder is refused before anything is generated', async () => {
  // Without it nothing would change on the far side, and the vault would then hold a secret
  // that works nowhere.
  const { action, log } = world();

  const validated = action.validate({ statement: 'ALTER USER app IDENTIFIED BY "hunter2"' });
  const result = await action.run(CTX, { statement: 'ALTER USER app IDENTIFIED BY "hunter2"' });

  assert.equal(validated.ok, false);
  assert.equal(result.status, 400);
  assert.deepEqual(log.ran, [], 'nothing ran');
  assert.equal(log.stored.length, 0);
});

test('a database entry with no connection string is refused rather than half-rotated', async () => {
  const { action, log } = world({ current: '' });

  const result = await action.run(CTX, { statement: STATEMENT });

  assert.equal(result.status, 400);
  assert.deepEqual(log.ran, []);
});

test('the entry going missing mid-flight is refused, not stored into', async () => {
  // An entry deleted between the consent prompt and the run is a real race: the prompt can sit
  // for five minutes. Nothing must be written into a vault position that no longer exists.
  const ran: string[] = [];
  const gone = rotateAction(underlyingThatRecords(ran), 'query', {
    generate: () => ({ ok: true, value: 'x', kind: 'password' }),
    entity: () => undefined,
    current: () => Promise.resolve(CONN),
    snapshot: () => Promise.resolve({ at: 1, name: '', details: {} as EntityMetadata, secrets: {} }),
    record: () => Promise.resolve(),
    store: () => Promise.resolve(),
  });

  assert.equal((await gone.run(CTX, { statement: STATEMENT })).status, 400);
  assert.deepEqual(ran, [], 'and the statement never ran');
});

/** A minimal wrapped action, for the paths that must never reach it. */
function underlyingThatRecords(ran: string[]): UseAction {
  return {
    kind: 'db',
    action: 'query',
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => '',
    describeOutcome: () => 'ok',
    run: (_ctx, body) => {
      ran.push(String((body as { query?: unknown }).query ?? ''));
      return Promise.resolve({ status: 200, body: { exitCode: 0 } });
    },
  };
}

// ---- the pure half -------------------------------------------------------

test('the placeholder is not a creds:// reference, and that is deliberate', () => {
  // `creds://…` already means "the value stored today" everywhere in this product. One spelling
  // meaning that in one place and "the value that does not exist yet" in another is discovered
  // by somebody rotating the wrong thing.
  assert.equal(NEW_SECRET_PLACEHOLDER.includes('creds://'), false);
  assert.equal(NEW_SECRET_PLACEHOLDER, '{{creds:new}}');
});

test('every occurrence is substituted — a statement may set and then verify', () => {
  const text = `SET ${NEW_SECRET_PLACEHOLDER}; CHECK ${NEW_SECRET_PLACEHOLDER}`;

  assert.equal(countPlaceholders(text), 2);
  assert.equal(substituteNewSecret(text, 'abc'), 'SET abc; CHECK abc');
});

test('a generated secret containing $& survives substitution intact', () => {
  // `String.replace` reads `$&` in a replacement as an instruction. A password containing one
  // would be substituted as something else, and surface as an auth failure days later.
  const value = 'a$&b$`c';

  assert.equal(substituteNewSecret(NEW_SECRET_PLACEHOLDER, value), value);
});

test('each kind rotates the place its password actually lives', () => {
  // A database keeps its password inside the connection string. Writing the new value into the
  // password field a database does not use would report success and change nothing.
  assert.equal(slotFor('db'), 'dbConnection');
  assert.equal(slotFor('ssh'), 'password');
  assert.equal(slotFor('credential'), 'password');
  assert.equal(slotFor('vpn'), undefined);
  assert.equal(slotFor('script'), undefined);
});

test('a kind with nothing to rotate is refused by name', () => {
  const checked = checkRotation(STATEMENT, 'vpn');

  assert.equal(checked.ok, false);
  assert.ok(!checked.ok && checked.message.includes('vpn'));
});

test('the rebuilt connection string keeps everything but the password', () => {
  // A rotation must not quietly re-normalise a string somebody wrote by hand: the host, the
  // port and the database are theirs, and only the password is ours to change.
  const built = storedValueFor('dbConnection', CONN, 'NEW-secret', 'mysql');

  assert.ok(built.ok);
  const value = built.ok ? built.value : '';
  assert.ok(value.includes('db-01.example.internal'));
  assert.ok(value.includes('3306'));
  assert.ok(value.includes('orders'));
  assert.ok(value.includes('NEW-secret'));
  assert.equal(value.includes(OLD), false, 'the old password is gone');
});

/**
 * A kind this extension does not make.
 *
 * <p>The refusal is not a failure of the request — it is the map of where an agent will be
 * tempted to generate the value itself, and the journal counts them for exactly that reason. So
 * it carries its own outcome word rather than a status number, and nothing is stored.</p>
 */
test('a kind we do not generate is refused, with the reason, before anything runs', async () => {
  const { action, log } = world();

  const result = await action.run(CTX, { statement: STATEMENT, secretKind: 'x509' });

  assert.equal(result.status, 404, 'the request was fine; the generator is what is missing');
  assert.equal((result.body as { noGenerator?: boolean }).noGenerator, true);
  assert.deepEqual(log.ran, [], 'nothing ran on the far side');
  assert.equal(log.stored.length, 0);
  assert.equal(log.recorded, 0);
});

test('and the audit says "no generator", which is the word the journal counts', async () => {
  const { action } = world();

  const result = await action.run(CTX, { statement: STATEMENT, secretKind: 'x509' });

  assert.equal(action.describeOutcome(result), 'no generator');
});

test('a rotation with no kind named is a password, which is what one almost always is', async () => {
  const { action, log, generated } = world();

  await action.run(CTX, { statement: STATEMENT });

  assert.ok(log.ran[0].includes(generated));
});
