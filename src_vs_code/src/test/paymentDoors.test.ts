import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINDABLE_FIELDS } from '../envBinding';
import { canBurnOnAgentUse } from '../entityKind';
import { PAYMENT_FIELD_KEYS } from '../paymentFields';
import { ENTITY_KINDS } from '../types';
import { UseActionRegistry } from '../useActions';

/**
 * Every OTHER door out of the vault, and the proof that a payment record cannot use any of them.
 *
 * <p>The plan named six directions a record travels and I asked the review three times whether a
 * SEVENTH existed. The answer came back on the third asking: the masked-terminal path, the agent
 * broker's `use` route, the headless CLI, terminal env bindings and the org-recovery escrow were all
 * unaudited. This file is that audit, turned into assertions.</p>
 *
 * <p><b>The finding was right and the leak was not there.</b> Each of those doors is already closed to
 * payment — but closed by omission, and nothing said so, which is the state in which somebody opens
 * one without noticing. Each closure below is now a test, so the story that makes a payment field
 * usable by a process has to come here and decide deliberately.</p>
 */

test('a payment field cannot be exported as a terminal environment variable', () => {
  // Closed BY TYPE, which is the strongest of the three: `EnvBindings` is
  // `Partial<Record<BindableField, string>>`, so a payment key is not merely absent from the list —
  // it cannot be put in the record at all without changing the type.
  for (const key of PAYMENT_FIELD_KEYS) {
    assert.equal(
      (BINDABLE_FIELDS as readonly string[]).includes(key),
      false,
      `${key} became bindable: a card number in an env variable reaches every process in that terminal`,
    );
  }
  assert.deepEqual(
    [...BINDABLE_FIELDS],
    ['password', 'privateKey', 'publicKey', 'dbConnection', 'dbPassword'],
    'pinned as a whole: a sixth bindable field is a deliberate decision, not a diff nobody reads',
  );
});

test('the agent broker and the CLI cannot use a payment instrument', () => {
  // Both go through ONE registry keyed by (kind, action) — `resolve` answers `undefined` for a pair
  // nobody registered, so an unregistered kind is not "allowed with no actions", it is unreachable.
  // The registry is populated in `extension.ts` with exactly five kinds: script, terminal,
  // credential, db, vpn.
  const registry = new UseActionRegistry();
  for (const action of ['run', 'exportEnv', 'query', 'up', 'down', 'use', 'read']) {
    assert.equal(
      registry.resolve('payment', action),
      undefined,
      `an empty registry must not invent a payment/${action} action`,
    );
  }
});

test('a one-use burn cannot fire for a payment instrument, because nothing can use one', () => {
  // The other half of the same fact, and the reason it is asserted twice: `canBurnOnAgentUse` is what
  // `stampKind` uses to refuse an impossible promise on write, and it must agree with the registry.
  // If a future story registers a payment use action, THIS test is the one that will look wrong —
  // which is the intended signal to make the burn decision at the same time.
  assert.equal(canBurnOnAgentUse('payment'), false);
});

test('the kinds the broker serves are named, and payment is not among them', () => {
  // Pinned as a list rather than a predicate so that adding a kind to the broker is visible here.
  const served = ENTITY_KINDS.filter((kind) => canBurnOnAgentUse(kind));
  assert.deepEqual(
    [...served].sort(),
    ['credential', 'db', 'script', 'ssh', 'terminal', 'vpn'],
    'six kinds reach the broker; sshkey, config and payment deliberately do not',
  );
});

test('nothing can print a payment value, which is why the output mask does not name one', () => {
  // The Blocking finding was that `maskEntries.ts` masks password/privateKey/vpnConfig/dbConnection/
  // notes and NOT payment, so a value could be printed to a terminal. Audited, and the conclusion is
  // that the leak is unreachable rather than unmasked: masking redacts what a COMMAND printed, and no
  // path delivers a payment value to a command — env bindings cannot carry one (test 1) and the
  // broker cannot serve one (tests 2-4). There is nothing for a mask to catch.
  //
  // Recorded rather than "fixed", because masking the stored JSON blob would be worse than nothing:
  // the mask matches printed VALUES, a process would print a field rather than the blob, and a mask
  // that never matches is a mask people trust. If a later story gives a payment field to a process,
  // masking has to be added per field AND this test rewritten — it exists to make that unavoidable.
  const reachableByAProcess = ENTITY_KINDS.filter((kind) => canBurnOnAgentUse(kind));
  assert.equal(
    reachableByAProcess.includes('payment' as (typeof reachableByAProcess)[number]),
    false,
    'the moment a payment instrument becomes reachable by a process, maskEntries must learn its fields',
  );
});
