import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import * as world from './pinWorld';
import { EntityMetadata } from '../types';
import { lockSecret } from '../secretEnvelope';
import { automaticPinRefusal, openStored, pinFieldRefusal, pinPromptFor, silentPinGate } from '../pinGate';
import { forgetAllPins, grantCount, grantPin, grantedPin } from '../pinSession';

/**
 * Every row of the reader survey, by name.
 *
 * <p>A reviewer's finding on the first draft of the plan: it said "every read path learns about
 * `locked`" and then tested two of them. The survey that replaced that sentence classifies each
 * call site, and this file is that classification made checkable — because the ONE thing that must
 * not happen is a reader handing envelope JSON to something expecting a password, and the only way
 * to know none does is to ask each one.</p>
 */

const ACCOUNT = 'acct-1';
const PIN = 'correct-horse-battery';

/** A locked value, made once — scrypt costs about a second per wrap and this file needs several. */
let lockedValue: Promise<string> | undefined;
const locked = (): Promise<string> => (lockedValue ??= lockSecret('hunter2', ACCOUNT, PIN));

const details = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'prod-db', isSshEnabled: false, ...over }) as EntityMetadata;

// ---------------------------------------------------------------------------------------------
// The automatic paths: withheld, with a reason, and never a prompt.
// ---------------------------------------------------------------------------------------------

test('an automatic path is REFUSED with a sentence, never a prompt and never an emptiness', async () => {
  const refusal = automaticPinRefusal(await locked(), 'prod-db');

  assert.match(refusal, /prod-db/, 'it names the entry');
  assert.match(refusal, /cannot be used automatically/);
  assert.match(refusal, /remove the PIN protection/, 'and says what to do about it');
  assert.equal(automaticPinRefusal('hunter2', 'prod-db'), '', 'an ordinary value is handed over');
  assert.equal(automaticPinRefusal(undefined, 'prod-db'), '', 'and nothing stored is not a refusal');
});

test('env, the terminal and a creds:// reference all report WITHHELD, not absent', async () => {
  // The distinction the `FieldReading` boundary exists for. "Nothing stored" about a value that is
  // stored is the false answer this repository already fixed once, for the woven password.
  const mod = loadWithVscode<typeof import('../envApply')>('../envApply', {});
  const storage = { getPassword: () => Promise.resolve(lockedValue) } as never;

  const reading = await mod.bindableFieldReading(storage, ACCOUNT, details(), 'password');

  assert.equal(reading.kind, 'withheld');
  assert.match(reading.kind === 'withheld' ? reading.reason : '', /PIN/);
  assert.equal(
    await mod.bindableFieldValue(storage, ACCOUNT, details(), 'password'),
    undefined,
    'and the value-only reader agrees, because it IS the reading narrowed',
  );
});

/**
 * `pinFieldRefusal` — the wrap first, the mark second, one sentence for both. It lived inside
 * `envApply.automaticFieldRefusal` and was extracted (entry-PIN plan §5.4) so the `creds://` reads,
 * the TOTP reading and the SSH broker's key path can ask the SAME question instead of each asking
 * the wrap alone and forgetting the mark — the omission the code round of 2026-09-12 found once.
 */
test('pinFieldRefusal refuses on the WRAP, refuses on the MARK alone, and hands an ordinary value over', async () => {
  const marked = details({ pinProtected: true });

  assert.match(pinFieldRefusal(details(), await locked()), /prod-db.*protected with its own PIN/, 'the wrap is the truth');
  assert.match(pinFieldRefusal(marked, 'hunter2'), /protected with its own PIN/, 'a plaintext value inside a marked entry is still withheld');
  assert.equal(pinFieldRefusal(details(), 'hunter2'), '');
  assert.equal(pinFieldRefusal(details(), undefined), '', 'nothing stored is not a refusal');
});

test('envApply asks pinFieldRefusal — the mark-only case still withholds through the binding reader', async () => {
  // The extraction must not have moved the behaviour out from under its first caller.
  const mod = loadWithVscode<typeof import('../envApply')>('../envApply', {});
  const storage = { getPassword: () => Promise.resolve('hunter2') } as never;

  const reading = await mod.bindableFieldReading(storage, ACCOUNT, details({ pinProtected: true }), 'password');

  assert.equal(reading.kind, 'withheld');
});

/**
 * The prompt names the PURPOSE (entry-PIN plan §5): a box that says what pressing OK will do is a
 * decision; one that says "open this value" for a copy, an export and a save alike is a reflex.
 */
test('a gate with a purpose asks in that purpose\'s words; one without asks the generic question', async () => {
  forgetAllPins();
  const asked: string[] = [];
  const gate = {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: (prompt: string) => {
      asked.push(prompt);
      return Promise.resolve(undefined);
    },
  };

  await openStored(await locked(), { ...gate, purpose: 'copy its password' });
  await openStored(await locked(), gate);

  assert.equal(asked[0], 'This entry is protected with its own PIN. Enter it to copy its password. It is remembered until this window closes or the vault locks.');
  assert.equal(asked[1], pinPromptFor(undefined));
  assert.match(asked[1], /Enter it to open this value/, 'the generic sentence is the one every surface used before');
});

/**
 * The silent gate: opens only with what this window already holds, and never asks. For a path that
 * runs AFTER a door admitted the entry — the share's withheld notice, the export's opener — where a
 * second box would be a second question about an entry the person just answered for.
 */
test('the silent gate opens a granted entry and answers cancelled for one with no grant — it never raises a box', async () => {
  forgetAllPins();
  const value = await locked();

  const unopened = await openStored(value, silentPinGate(ACCOUNT, 'e1', 'prod-db'));
  assert.deepEqual(unopened, { kind: 'cancelled' }, 'no grant, no prompt, no value');

  grantPin(ACCOUNT, 'e1', PIN);
  const opened = await openStored(value, silentPinGate(ACCOUNT, 'e1', 'prod-db'));
  assert.deepEqual(opened, { kind: 'value', value: 'hunter2' });
});

test('the SSH broker refuses a protected password rather than handing ssh an envelope', async () => {
  const value = await locked();
  const mod = loadWithVscode<typeof import('../sshExecAuth')>(
    '../sshExecAuth',
    {},
    {
      './sshCredential': { resolveSshCredential: () => Promise.resolve({ kind: 'password', password: value }) },
      './keyInstaller': { writeAskpassScriptFile: (d: string) => `${d}/askpass.sh`, materializePrivateKey: () => '' },
    },
  );

  const result = await mod.resolveExecAuth({} as never, ACCOUNT, details({ name: 'build box' }), '/store');

  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'no_credential', 'the shape every caller handles');
  assert.match(result.ok ? '' : result.message, /build box/);
  assert.match(result.ok ? '' : result.message, /cannot be used automatically/);
});

// ---------------------------------------------------------------------------------------------
// The readers that must NOT grade or mask what they cannot read.
// ---------------------------------------------------------------------------------------------

test('the hygiene scan SKIPS a protected value rather than grading ciphertext', async () => {
  // It would come back "strong and unique" — the ciphertext of a random data key always does. That
  // is a lie in the direction that matters: somebody told their weakest habit is fine.
  const value = await locked();
  const mod = loadWithVscode<typeof import('../hygieneScan')>('../hygieneScan', {});
  const storage = {
    getAccounts: () => [{ accountId: ACCOUNT, email: 'me@x.io' }],
    getNodes: () => [{ id: 'e1', type: 'entity', name: 'prod-db', details: details() }],
    getPassword: () => Promise.resolve(value),
    getDbConnection: () => Promise.resolve(undefined),
  } as never;

  const entries = await mod.collectPasswords(storage);

  assert.deepEqual(entries, [], 'nothing about it reaches the corpus, the report, or the network');
});

test('an ordinary password is still scanned — the skip is about the wrap, not about scanning', async () => {
  const mod = loadWithVscode<typeof import('../hygieneScan')>('../hygieneScan', {});
  const storage = {
    getAccounts: () => [{ accountId: ACCOUNT, email: 'me@x.io' }],
    getNodes: () => [{ id: 'e1', type: 'entity', name: 'prod-db', details: details() }],
    getPassword: () => Promise.resolve('hunter2'),
    getDbConnection: () => Promise.resolve(undefined),
  } as never;

  const entries = await mod.collectPasswords(storage);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].value, 'hunter2');
});

test('the masker skips a protected value — the ciphertext is a string no tool will ever print', async () => {
  const value = await locked();
  const mod = loadWithVscode<typeof import('../maskEntries')>('../maskEntries', {});
  const source = {
    getNode: () => ({ details: details() }),
    getPassword: () => Promise.resolve(value),
    getPrivateKey: () => Promise.resolve(undefined),
    getVpnConfig: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve(undefined),
    getNotes: () => Promise.resolve(undefined),
    getSecondRaw: () => Promise.resolve(undefined),
  } as never;

  assert.deepEqual(await mod.maskEntriesFor(source, ACCOUNT, 'e1'), []);
});

// ---------------------------------------------------------------------------------------------
// The gate itself: a click may ask, and every miss is SAID.
// ---------------------------------------------------------------------------------------------

test('the right PIN opens the value and is remembered for this window', async () => {
  forgetAllPins();
  const asked: string[] = [];

  const opened = await openStored(await locked(), {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: (prompt) => {
      asked.push(prompt);
      return Promise.resolve(PIN);
    },
  });

  assert.deepEqual(opened, { kind: 'value', value: 'hunter2' });
  assert.equal(asked.length, 1);
  assert.equal(grantedPin(ACCOUNT, 'e1'), PIN, 'so the next field of the same entry asks nothing');
});

test('a remembered PIN opens the next value without asking again', async () => {
  forgetAllPins();
  const value = await locked();
  const gate = {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve(PIN),
  };
  await openStored(value, gate);

  let askedAgain = 0;
  const second = await openStored(value, {
    ...gate,
    ask: () => {
      askedAgain += 1;
      return Promise.resolve(PIN);
    },
  });

  assert.equal(second.kind, 'value');
  assert.equal(askedAgain, 0, 'asking per field is how a prompt becomes a reflex');
});

test('a WRONG pin is said, and is not remembered', async () => {
  forgetAllPins();

  const opened = await openStored(await locked(), {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve('not-the-pin-at-all'),
  });

  assert.equal(opened.kind, 'wrong');
  assert.match(opened.kind === 'wrong' ? opened.reason : '', /does not open this entry/);
  assert.match(opened.kind === 'wrong' ? opened.reason : '', /no recovery/, 'and the stakes are named');
  assert.equal(grantCount(), 0, 'a PIN that did not work is not worth remembering');
});

test('a dismissed box is a DECISION — nothing is said and nothing is wrong', async () => {
  forgetAllPins();

  const opened = await openStored(await locked(), {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve(undefined),
  });

  assert.deepEqual(opened, { kind: 'cancelled' });
});

test('a stale grant that no longer opens the entry is dropped, and the person is asked afresh', async () => {
  // The PIN was changed in another window, or the entry was re-protected. A remembered PIN that
  // keeps failing turns "type your PIN" into "this entry is broken".
  forgetAllPins();
  const value = await locked();
  const gate = {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve(PIN),
  };
  await openStored(value, gate);

  const other = await lockSecret('a different secret', ACCOUNT, 'a-different-pin-x');
  const opened = await openStored(other, { ...gate, ask: () => Promise.resolve('a-different-pin-x') });

  assert.equal(opened.kind, 'value');
  assert.equal(grantedPin(ACCOUNT, 'e1'), 'a-different-pin-x', 'the working one replaced the stale one');
});

test('an unprotected value passes straight through, asking nothing', async () => {
  forgetAllPins();

  const opened = await openStored('hunter2', {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => assert.fail('an unprotected value must never raise a prompt'),
  });

  assert.deepEqual(opened, { kind: 'unprotected', value: 'hunter2' });
});

test('a CORRUPT wrap is named as damage, and nothing offers to overwrite it', async () => {
  const opened = await openStored('{"v":1,"lock":{"wrap":{}}}', {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => assert.fail('a damaged wrap is not a PIN question'),
  });

  assert.equal(opened.kind, 'corrupt');
  assert.match(opened.kind === 'corrupt' ? opened.reason : '', /prod-db/);
  assert.match(opened.kind === 'corrupt' ? opened.reason : '', /Nothing has been changed/);
});

/**
 * §2.5 — sharing a protected entry.
 *
 * <p>The sender types the PIN at share time, which is both the owner's requirement (<i>"и что б
 * пошарить такую запись - нужно тоже в процесе шары ввести пин код"</i>) and a correctness
 * necessity: what is stored is ciphertext under a key only the sender's PIN opens, the recipient
 * does not have that PIN, and the share's own transit PIN is a one-time transfer secret rather
 * than somebody's protection. A payload built from the stored bytes would be gibberish nobody
 * could ever open.</p>
 */
test('a share payload carries the OPENED value, never the wrap', async () => {
  const mod = loadWithVscode<typeof import('../sharePayloadBuild')>('../sharePayloadBuild', {});
  const wrapped = await locked();
  const storage = {
    getNotes: () => Promise.resolve(undefined),
    getTotp: () => Promise.resolve(undefined),
    getPassword: () => Promise.resolve(wrapped),
    getPrivateKey: () => Promise.resolve(undefined),
    getVpnConfig: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve(undefined),
    getConfigBody: () => Promise.resolve(undefined),
    getFieldsRaw: () => Promise.resolve(undefined),
    getSecondRaw: () => Promise.resolve(undefined),
    setSecondRaw: () => Promise.resolve(),
    getPaymentRaw: () => Promise.resolve(undefined),
  } as never;
  const node = { id: 'e1', name: 'prod-db', type: 'entity', details: details() } as never;

  const payload = await mod.buildSharePayload(storage, ACCOUNT, node, false, {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve(PIN),
  });

  assert.equal(payload.secrets.password, 'hunter2', 'the recipient gets a value they can use');
  assert.ok(!String(payload.secrets.password).includes('"v":1'), 'and never the envelope');
});

test('without a gate the payload is what is stored — an unprotected entry is untouched', async () => {
  const mod = loadWithVscode<typeof import('../sharePayloadBuild')>('../sharePayloadBuild', {});
  const storage = {
    getNotes: () => Promise.resolve(undefined),
    getTotp: () => Promise.resolve(undefined),
    getPassword: () => Promise.resolve('hunter2'),
    getPrivateKey: () => Promise.resolve(undefined),
    getVpnConfig: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve(undefined),
    getConfigBody: () => Promise.resolve(undefined),
    getFieldsRaw: () => Promise.resolve(undefined),
    getSecondRaw: () => Promise.resolve(undefined),
    setSecondRaw: () => Promise.resolve(),
    getPaymentRaw: () => Promise.resolve(undefined),
  } as never;
  const node = { id: 'e1', name: 'prod-db', type: 'entity', details: details() } as never;

  const payload = await mod.buildSharePayload(storage, ACCOUNT, node, false);

  assert.equal(payload.secrets.password, 'hunter2');
});

// ---------------------------------------------------------------------------------------------
// Entry-PIN plan, D7: the SSH broker's KEY branch. Only the password branch was gated (`byPassword`),
// so an agent exec on a connection that borrows a protected key entity wrote the envelope to disk as
// an SSH key — reached through `sshKeyEntityId`, which the agent surfaces never hide.
// ---------------------------------------------------------------------------------------------

test('the broker refuses a protected stored KEY, says why, and writes nothing to disk', async () => {
  const s = world.sinks();
  const storage = world.memoryStorage(world.clickVscode([], s));
  const key = { id: 'key1', name: 'deploy key', kind: 'sshkey', isSshEnabled: false, pinProtected: true } as EntityMetadata;
  const connection = { id: 'ssh1', name: 'prod box', host: 'h', user: 'u', isSshEnabled: true, sshKeyEntityId: 'key1' } as EntityMetadata;
  await world.seedEntry(storage, key, { 'private key': await world.locked('-----BEGIN OPENSSH PRIVATE KEY-----\nk\n-----END OPENSSH PRIVATE KEY-----') });
  await world.seedEntry(storage, connection, {});
  const materialized: string[] = [];
  const mod = loadWithVscode<typeof import('../sshExecAuth')>('../sshExecAuth', {}, {
    './keyInstaller': {
      materializePrivateKey: (dir: string, name: string, content: string): string => {
        materialized.push(content);
        return `${dir}/${name}`;
      },
      writeAskpassScriptFile: (dir: string): string => `${dir}/askpass.sh`,
    },
  });

  const auth = await mod.resolveExecAuth(storage, world.ACCOUNT, connection, '/store');

  assert.deepEqual(materialized, [], 'the sealed envelope was written to disk as an SSH key');
  assert.equal(auth.ok, false);
  assert.match(auth.ok ? '' : auth.message, /"deploy key" is protected with its own PIN, so it cannot be used automatically/);
  assert.equal(s.boxes, 0, 'an automatic path never prompts');
});
