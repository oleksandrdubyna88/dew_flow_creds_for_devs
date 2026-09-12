import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { BINDABLE_FIELDS, heldEnvValues } from '../envBinding';
import { lockSecret } from '../secretEnvelope';
import { EntityMetadata } from '../types';

/**
 * Putting a bound secret into the terminal environment (audit A3).
 *
 * <p>This is the one module whose job is to move a secret OUT of the vault and into every
 * terminal opened afterwards, persisted across reloads — so what it does and does not write
 * is a security property, and it had no test at all.</p>
 *
 * <p>Three promises are pinned here. Each bound field reads from its own source, so a binding
 * never hands out the wrong secret. A name bound to something that is not stored writes
 * NOTHING, rather than an empty variable that reads as "this is set, and empty". And a name
 * that stops being bound is DELETED, because a variable that outlives its binding is a secret
 * in every future terminal that nothing in the UI still mentions.</p>
 */

type EnvApply = typeof import('../envApply');

/** VS Code's environment collection, as much of it as this module touches. */
function envCollection(): {
  replaced: Record<string, string>;
  deleted: string[];
  description?: string;
  replace(name: string, value: string): void;
  delete(name: string): void;
} {
  const self = {
    replaced: {} as Record<string, string>,
    deleted: [] as string[],
    description: undefined as string | undefined,
    replace(name: string, value: string): void {
      self.replaced[name] = value;
    },
    delete(name: string): void {
      self.deleted.push(name);
    },
  };
  return self;
}

/** Just the getters `bindableFieldValue` calls, each answering something distinguishable. */
function storage(over: Record<string, string | undefined> = {}): unknown {
  const values: Record<string, string | undefined> = {
    password: 'THE-PASSWORD',
    privateKey: 'THE-PRIVATE-KEY',
    dbConnection: 'postgresql://user:THE-DB-PASSWORD@host:5432/db',
    ...over,
  };
  return {
    getPassword: () => Promise.resolve(values.password),
    getPrivateKey: () => Promise.resolve(values.privateKey),
    getDbConnection: () => Promise.resolve(values.dbConnection),
  };
}

function details(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'prod', isSshEnabled: false, publicKey: 'THE-PUBLIC-KEY', ...over };
}

const envApply = (): EnvApply => loadWithVscode<EnvApply>('../envApply', {});

test('every bindable field reads from its OWN source', async () => {
  // A field reading the wrong source would put one secret under another's name — the kind of
  // mistake that looks fine until the variable is used somewhere it should not have reached.
  const mod = envApply();
  const got: Record<string, string | undefined> = {};
  for (const field of BINDABLE_FIELDS) {
    got[field] = await mod.bindableFieldValue(storage() as never, 'acc', details(), field);
  }

  assert.deepEqual(got, {
    password: 'THE-PASSWORD',
    privateKey: 'THE-PRIVATE-KEY',
    publicKey: 'THE-PUBLIC-KEY',
    dbConnection: 'postgresql://user:THE-DB-PASSWORD@host:5432/db',
    dbPassword: 'THE-DB-PASSWORD',
  });
});

test('the db password is parsed out of the connection string, not stored separately', async () => {
  const mod = envApply();

  assert.equal(
    await mod.bindableFieldValue(storage({ dbConnection: undefined }) as never, 'acc', details(), 'dbPassword'),
    undefined,
    'no connection string means no db password, rather than a crash',
  );
});

test('a bound field with a value is written, and the collection says who did it', async () => {
  const env = envCollection();

  const { written } = await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
  );

  assert.deepEqual(written, ['PROD_PW']);
  assert.deepEqual(env.replaced, { PROD_PW: 'THE-PASSWORD' });
  assert.equal(env.description, 'CredsForDevs: secrets exposed as terminal variables');
});

test('a name bound to something NOT stored writes nothing at all', async () => {
  // An empty variable reads as "this is set, and the secret is empty" — a shell script that
  // tests `-n "$PW"` then takes the wrong branch silently. Absent is the honest answer.
  const env = envCollection();

  const { written } = await envApply().applyEnvBindings(
    env as never,
    storage({ password: undefined }) as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
  );

  assert.deepEqual(written, []);
  assert.deepEqual(env.replaced, {});
  assert.equal(env.description, undefined, 'and it does not claim to have exposed anything');
});

test('an empty stored value is treated as nothing, not as a value', async () => {
  const env = envCollection();

  await envApply().applyEnvBindings(
    env as never,
    storage({ password: '' }) as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
  );

  assert.deepEqual(env.replaced, {});
});

test('a name that stops being bound is DELETED, so no secret outlives its binding', async () => {
  // The failure this prevents: rename the variable, and the old name keeps injecting the
  // secret into every future terminal while nothing in the UI mentions it any more.
  const env = envCollection();

  await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'NEW_NAME' } }),
    { password: 'OLD_NAME' },
  );

  assert.deepEqual(env.deleted, ['OLD_NAME']);
  assert.deepEqual(env.replaced, { NEW_NAME: 'THE-PASSWORD' });
});

test('a name still bound is not deleted just because it was there before', async () => {
  const env = envCollection();

  await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
    { password: 'PROD_PW' },
  );

  assert.deepEqual(env.deleted, [], 'unchanged bindings are left alone');
  assert.deepEqual(env.replaced, { PROD_PW: 'THE-PASSWORD' });
});

test('removing every binding deletes every name it used to write', async () => {
  const env = envCollection();

  const { written } = await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: undefined }),
    { password: 'PROD_PW', dbPassword: 'PROD_DB' },
  );

  assert.deepEqual(written, []);
  assert.deepEqual(env.deleted.sort(), ['PROD_DB', 'PROD_PW']);
});

test('several bindings are written together, each from its own field', async () => {
  const env = envCollection();

  const { written } = await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'PW', dbPassword: 'DB_PW', publicKey: 'PUB' } }),
  );

  assert.deepEqual([...written].sort(), ['DB_PW', 'PUB', 'PW']);
  assert.deepEqual(env.replaced, {
    PW: 'THE-PASSWORD',
    DB_PW: 'THE-DB-PASSWORD',
    PUB: 'THE-PUBLIC-KEY',
  });
});

/**
 * The three answers, and why two were not enough — a reviewer's finding on the woven-password
 * branch. Every automatic path returned `string | undefined`, so "there is nothing here" and
 * "there is something here and you may not have it" arrived identically, and each caller invented
 * its own sentence. The one that had not been taught about woven passwords invented the wrong one.
 */
test('a withheld field reads as WITHHELD, carrying the reason — never as an absence', async () => {
  const mod = envApply();

  const reading = await mod.bindableFieldReading(
    storage() as never,
    'acc',
    details({ passwordWoven: true }),
    'password',
  );

  assert.equal(reading.kind, 'withheld');
  assert.match(reading.kind === 'withheld' ? reading.reason : '', /cannot be used automatically/);
});

test('an empty field reads as ABSENT, and a stored one as a VALUE', async () => {
  const mod = envApply();

  const nothing = await mod.bindableFieldReading(storage({ password: undefined }) as never, 'acc', details(), 'password');
  const something = await mod.bindableFieldReading(storage() as never, 'acc', details(), 'password');

  assert.equal(nothing.kind, 'absent', 'an entry with no password is not refusing you one');
  assert.deepEqual(something, { kind: 'value', value: 'THE-PASSWORD' });
});

test('the value-only reader is the reading, narrowed — the two cannot disagree', async () => {
  // `bindableFieldValue` stays for `applyEnvBindings`, which writes what it can and skips what it
  // cannot. It must be the SAME decision, not a second one: a withheld field yields no value.
  const mod = envApply();

  assert.equal(
    await mod.bindableFieldValue(storage() as never, 'acc', details({ passwordWoven: true }), 'password'),
    undefined,
  );
  assert.equal(await mod.bindableFieldValue(storage() as never, 'acc', details(), 'password'), 'THE-PASSWORD');
});

// ---------------------------------------------------------------------------------------------
// Issue #48 — a withheld value is REPORTED, never dropped, and the save can hand over the values
// it holds so a binding is applied from the plaintext BEFORE the entry is sealed under its PIN.
// ---------------------------------------------------------------------------------------------

test('a PIN-locked stored value is WITHHELD with the reason, and nothing is written', async () => {
  // D2: the loop read through `valueOf`, which collapses `withheld` into `undefined`, and skipped
  // it in silence — an entry created with a PIN and a binding wrote nothing and said nothing.
  const env = envCollection();
  const locked = await lockSecret('THE-PASSWORD', 'acc', 'correct-horse-battery');

  const result = await envApply().applyEnvBindings(
    env as never,
    storage({ password: locked }) as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
  );

  assert.deepEqual(result.written, []);
  assert.equal(result.withheld.length, 1, `withheld: ${JSON.stringify(result.withheld)}`);
  assert.equal(result.withheld[0].name, 'PROD_PW');
  assert.match(result.withheld[0].reason, /protected with its own PIN/);
  assert.deepEqual(env.replaced, {});
});

test('a woven password is WITHHELD with the woven reason', async () => {
  const env = envCollection();

  const result = await envApply().applyEnvBindings(
    env as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' }, passwordWoven: true }),
  );

  assert.deepEqual(result.written, []);
  assert.equal(result.withheld[0]?.name, 'PROD_PW');
  assert.match(result.withheld[0]?.reason ?? '', /woven with a decoy/);
  assert.deepEqual(env.replaced, {});
});

test('a value the save HOLDS is written even while storage holds a locked one — the create-before-seal shape', async () => {
  // On create the plaintext is in the form's result; the seal follows. Reading storage would be
  // reading the value the seal is about to (or already did) lock.
  const env = envCollection();
  const locked = await lockSecret('THE-PASSWORD', 'acc', 'correct-horse-battery');

  const result = await envApply().applyEnvBindings(
    env as never,
    storage({ password: locked }) as never,
    'acc',
    details({ envBindings: { password: 'PROD_PW' } }),
    undefined,
    { password: 'FROM-THE-FORM' },
  );

  assert.deepEqual(result, { written: ['PROD_PW'], withheld: [] });
  assert.deepEqual(env.replaced, { PROD_PW: 'FROM-THE-FORM' });
});

test('a held connection string feeds the db-password binding, and a held value never overrides a woven refusal', async () => {
  const env = envCollection();
  await envApply().applyEnvBindings(
    env as never,
    storage({ dbConnection: undefined }) as never,
    'acc',
    details({ envBindings: { dbPassword: 'DB_PW' } }),
    undefined,
    { dbConnection: 'postgresql://user:HELD-DB-PW@host:5432/db' },
  );
  assert.deepEqual(env.replaced, { DB_PW: 'HELD-DB-PW' }, 'the password is parsed out of the HELD string');

  // The refusal is about the entry, not about where the value came from.
  const wovenEnv = envCollection();
  const woven = await envApply().applyEnvBindings(
    wovenEnv as never,
    storage() as never,
    'acc',
    details({ envBindings: { password: 'PW' }, passwordWoven: true }),
    undefined,
    { password: 'HELD' },
  );
  assert.deepEqual(wovenEnv.replaced, {});
  assert.equal(woven.withheld[0]?.name, 'PW');
});

test('the values a save holds are the three the form can carry — and only the ones it did carry', () => {
  // The bridge from the form's result to `applyEnvBindings`: an absent field stays absent, so
  // storage is read for it, rather than arriving as `undefined` and reading as "nothing stored".
  assert.deepEqual(
    heldEnvValues({ newPassword: 'typed', newDbConnection: 'postgresql://u:p@h/db' }),
    { password: 'typed', dbConnection: 'postgresql://u:p@h/db' },
  );
  assert.deepEqual(heldEnvValues({}), {});
});
