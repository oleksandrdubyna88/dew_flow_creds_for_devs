import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_FOLDERS } from '../defaultFolders';
import {
  canBurnOnAgentUse,
  canConnectSsh,
  isEntityKind,
  keepsPassword,
  kindOf,
  resolveKind,
  stampKind,
} from '../entityKind';
import { shapeAs, shapeOf } from '../entityShape';
import { entityContextValue } from '../treeRowText';
import { ENTITY_KINDS, ENTITY_KIND_LABELS, EntityMetadata, isTreeNode } from '../types';

/**
 * S1.1 — the `payment` kind exists, and every seam that must know about it does.
 *
 * <p>The four compiler-enforced maps (`ENTITY_KIND_LABELS`, `EVERY_KIND_HAS_A_SHAPE`,
 * `kindIcon`, `KIND_HINT`) fail the BUILD when a kind is missing, so they are not asserted
 * here — a type error is a better test than a runtime one. What this file covers is
 * everything the compiler cannot see: the flag ladder, the predicates whose default is the
 * wrong answer, the context token the menu keys off, and the seeded folder.</p>
 *
 * <p>The predicates are the point. `keepsPassword` and `canBurnOnAgentUse` are both written
 * as `kind !== 'x'`, so a new kind defaults to TRUE in each — a payment record would have
 * silently gained an invisible password slot and a one-use burn that nothing could ever
 * fire.</p>
 */

const payment: EntityMetadata = { id: 'p1', name: 'Visa', isSshEnabled: false, kind: 'payment' };

test('payment is a kind, and it is the ninth', () => {
  assert.ok(isEntityKind('payment'), 'isEntityKind must admit payment');
  assert.ok(ENTITY_KINDS.includes('payment'), 'ENTITY_KINDS must carry payment');
  assert.equal(ENTITY_KINDS.length, 9, 'nine kinds — adding a tenth means updating this count deliberately');
});

test('payment is named and iconed for the UI', () => {
  assert.deepEqual(ENTITY_KIND_LABELS.payment, { label: 'Payment instrument', icon: 'credit-card' });
});

test('every kind has a distinct icon, payment included', () => {
  const icons = ENTITY_KINDS.map((k) => ENTITY_KIND_LABELS[k].icon);
  assert.equal(new Set(icons).size, icons.length, 'two kinds sharing an icon are two kinds nobody can tell apart');
});

test('a payment record narrows to its own shape and carries paymentForm', () => {
  const withForm: EntityMetadata = { ...payment, paymentForm: 'card' };
  assert.equal(shapeOf(withForm).kind, 'payment');
  assert.equal(shapeAs(withForm, 'payment')?.paymentForm, 'card');
  assert.equal(shapeAs(withForm, 'credential'), undefined, 'a payment record is not a credential');
});

test('a record written by an older build resolves to payment from its flag alone', () => {
  const legacy: EntityMetadata = { id: 'p2', name: 'old', isSshEnabled: false, isPayment: true };
  assert.equal(kindOf(legacy), 'payment', 'the flag ladder must know isPayment');
  assert.equal(resolveKind(legacy), 'payment');
});

test('stamping a payment record writes the compatibility flag and no other kind flag', () => {
  const stamped = stampKind(payment);
  assert.equal(stamped.kind, 'payment');
  assert.equal(stamped.isPayment, true, 'an older build reads the flag, not the discriminant');
  assert.equal(stamped.isConfig, undefined);
  assert.equal(stamped.isScript, undefined);
  assert.equal(stamped.isDb, undefined);
  assert.equal(stamped.isVpn, undefined);
  assert.equal(stamped.isSshKey, undefined);
  assert.equal(stamped.isTerminal, undefined);
});

test('retyping a payment record to another kind clears its flag', () => {
  const retyped = stampKind({ ...payment, isPayment: true, kind: 'credential' });
  assert.equal(retyped.kind, 'credential');
  assert.equal(retyped.isPayment, undefined, 'a stale flag would win on an older machine');
});

test('a payment record holds no password slot', () => {
  assert.equal(
    keepsPassword('payment'),
    false,
    'the card and bank fields are one JSON record; a password slot beside them is invisible and uneditable',
  );
});

test('a one-use burn can never fire for a payment record, so it is refused on write', () => {
  assert.equal(
    canBurnOnAgentUse('payment'),
    false,
    'the broker does not serve payment fields, so oneUse would be a promise nothing keeps',
  );
  assert.equal(
    stampKind({ ...payment, burnPolicy: 'oneUse' }).burnPolicy,
    undefined,
    'the impossible combination must not reach the vault',
  );
});

test('a payment record offers no SSH connection', () => {
  assert.equal(canConnectSsh(payment), false);
});

test('the tree row carries a :payment token for the menu to key off', () => {
  const value = entityContextValue({ ...payment, isPayment: true }, false);
  assert.ok(value.includes(':payment'), `expected a :payment token, got ${value}`);
});

test('a payment record is shareable', () => {
  const value = entityContextValue({ ...payment, isPayment: true }, false);
  assert.ok(
    value.includes(':shareable'),
    'a card is exactly the thing somebody sends to a colleague — and the CVV is stripped on the way (S1.3)',
  );
});

test('a folder can be typed payment, for free', () => {
  assert.ok(
    isTreeNode({
      id: 'f1',
      type: 'folder',
      name: 'payments',
      folderType: 'payment',
      isSshEnabled: false,
    }),
    'FolderType is EntityKind | any | project, so the folder type arrives with the kind',
  );
});

test('a new account is seeded a payments folder', () => {
  const seeded = DEFAULT_FOLDERS.find((f) => f.folderType === 'payment');
  assert.ok(seeded, 'config was an entity kind for two releases with nowhere typed to put one');
  assert.equal(seeded?.name, 'payments');
});
