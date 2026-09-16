import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINDABLE_FIELDS } from '../envBinding';
import { SecretReader, exportSecretsFor } from '../exportSecrets';
import { McpVaultSource, visibleMcpEntries } from '../mcpEntries';
import { readRouteBody } from '../brokerReadRoutes';
import { pushRevision, type Revision } from '../revisionHistory';
import { RevisionSource, snapshotForRevision } from '../revisionSnapshot';
import { SECOND_KEYS, parseSecondValues, serializeSecondValues, type SecondValues } from '../secondValues';
import type { EntityMetadata, TreeNode } from '../types';

/**
 * S3 — where the second-values record travels OUT of the vault, one direction per test.
 *
 * <p>Backup and sync are covered next door (`storageSecond.test.ts`, `secondSurvival.test.ts`).
 * What is left is the three directions that leave: an external export (whole), the version history
 * (whole), and an agent (not at all). The share is PR B's, because withholding is a decision the
 * save has to make rather than a seam.</p>
 *
 * <p><b>The agent direction is DRIVEN, not scanned.</b> An absent getter proves nothing when a slot
 * is registered with the generic secret maps — a reviewer's point, and a fair one. So the vault
 * handed to the listing below really does hold a second value of every kind, and the assertion is
 * made against the JSON that would go on the wire. A test that asserted "`McpEntry` has no field
 * for it" would pass on an empty listing and tell nobody anything.</p>
 */

/**
 * A value for EVERY kind, built from the catalogue rather than listed beside it.
 *
 * <p>The claim these tests make is "no second value of any kind comes back", and a hand-written six
 * would go on making that claim about six after a seventh weave point arrived. Derived, it cannot:
 * the new kind gets a value here the day it exists.</p>
 */
const SECONDS: SecondValues = Object.fromEntries(SECOND_KEYS.map((key) => [key, `SECOND-VALUE-OF-${key}`]));
const RAW = serializeSecondValues(SECONDS) as string;

/** Only what these two functions read, TYPED — no cast, so a reader added to either is a red build. */
function vault(second: string | undefined): SecretReader & RevisionSource {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getPassword: nothing,
    getPrivateKey: nothing,
    getVpnConfig: nothing,
    getDbConnection: nothing,
    getNotes: nothing,
    getAttachment: nothing,
    getImage: nothing,
    getTotp: nothing,
    getConfigBody: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: nothing,
    getSecondRaw: (): Promise<string | undefined> => Promise.resolve(second),
  };
}

test('the fixture really does hold one of every kind — otherwise the guarantees below shrink silently', () => {
  assert.deepEqual(Object.keys(SECONDS).sort(), [...SECOND_KEYS].sort());
});

test('an external export CARRIES the whole record — a restore that lost half an entry is worse than none', async () => {
  // The decision the payment record settled first, applied to this one: an export is a full,
  // deliberate copy. It already carries passwords, private SSH keys and VPN configs; a second
  // password is not more sensitive than the first, and a special case here would be inconsistency
  // rather than defence.
  const out = await exportSecretsFor(vault(RAW), 'acc-1', ['p1']);

  assert.deepEqual(parseSecondValues(out.p1?.second), SECONDS);
});

test('an export of an entry with no second values carries no second key at all', async () => {
  const out = await exportSecretsFor(vault(undefined), 'acc-1', ['p1']);

  assert.equal('second' in (out.p1 ?? {}), false, 'absent is absent, not an empty string');
});

test('the version history CARRIES the record, so a rollback restores a whole entry', async () => {
  const entity = { id: 'p1', name: 'visa', details: { id: 'p1', name: 'visa', isSshEnabled: false } as EntityMetadata };

  const revision = await snapshotForRevision(vault(RAW), 'acc-1', entity);

  assert.equal(revision.secrets.second, RAW);
});

test('a revision keeps the record through the cap, like every other small secret', () => {
  // pushRevision copies only the fields it knows: one missing from SMALL_FIELDS is dropped on the
  // way into history, silently, and only noticed by somebody rolling back a year later.
  const revision: Revision = {
    at: 1,
    name: 'visa',
    details: { id: 'p1', name: 'visa', isSshEnabled: false },
    secrets: { second: RAW },
  };

  const [kept] = pushRevision([], revision);

  assert.equal(kept?.secrets.second, RAW, 'second must be in SMALL_FIELDS or history loses it');
});

test('an empty record is not written into history as an empty string', () => {
  const revision: Revision = {
    at: 1,
    name: 'visa',
    details: { id: 'p1', name: 'visa', isSshEnabled: false },
    secrets: { second: '' },
  };

  const [kept] = pushRevision([], revision);

  assert.equal(kept?.secrets.second, undefined);
});

/** An entry opened to agents as wide as the ladder goes — so nothing below is true by omission. */
const OPEN: TreeNode = {
  id: 'e1',
  name: 'orders-db',
  type: 'entity',
  parentId: 'f1',
  details: {
    id: 'e1',
    name: 'orders-db',
    isSshEnabled: false,
    kind: 'db',
    host: 'db-01',
    mcp: { view: true, use: true, edit: true, delete: 'any' },
  } as EntityMetadata,
};
const FOLDER: TreeNode = { id: 'f1', name: 'Databases', type: 'folder', parentId: null };

/** A vault that HOLDS every second value — the listing is what must not disclose them. */
function agentVault(): McpVaultSource & { getSecondRaw(a: string, e: string): Promise<string | undefined> } {
  const nodes = [FOLDER, OPEN];
  return {
    getAccounts: () => [{ accountId: 'a1' }],
    getNodes: () => nodes,
    getNode: (_a, id) => nodes.find((n) => n.id === id),
    getPassword: () => Promise.resolve('the first password'),
    getPrivateKey: () => Promise.resolve(undefined),
    getNotes: () => Promise.resolve(undefined),
    getTotp: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve('postgres://app:the-first-password@db-01:5432/orders'),
    // Not part of `McpVaultSource` — present exactly so a listing that reached for it COULD have it,
    // which is what makes the absence below evidence rather than a tautology.
    getSecondRaw: () => Promise.resolve(RAW),
  };
}

/** The check both agent tests make, written once so the teeth test below can run the same one. */
function assertNoSecondValues(wire: string, where: string): void {
  for (const value of Object.values(SECONDS)) {
    assert.ok(!wire.includes(value), `${value} must not be in ${where}`);
  }
  assert.ok(!/"second/.test(wire), `and no field in ${where} is even named for one`);
}

test('the entry listing an agent sees carries no second value of any kind', async () => {
  const entries = await visibleMcpEntries(agentVault());

  assert.equal(entries.length, 1, 'the entry IS visible — otherwise the assertion below is vacuous');
  assert.equal(entries[0]?.hasPassword, true, 'and the listing really did read the vault');
  assertNoSecondValues(JSON.stringify(entries), 'the listing');
});

test('and neither does the route that serves it', async () => {
  const body = await readRouteBody('/v1/mcp/entries', {
    mcpEntries: () => visibleMcpEntries(agentVault()),
  });

  const wire = JSON.stringify(body);
  assert.ok(wire.includes('orders-db'), 'the route answered with the entry');
  assertNoSecondValues(wire, 'the wire');
});

test('and the check would SEE a leak — the same assertion, run against a listing that leaked', async () => {
  // The teeth. A guarantee test that only ever runs against correct code proves nothing about what
  // it would do against incorrect code, and the usual way to find out — break the source, watch it
  // go red, put it back — means writing the leak. This runs the identical check against a payload
  // shaped exactly as that leak would shape it, which answers the same question without one.
  const [entry] = await visibleMcpEntries(agentVault());
  const leaked = JSON.stringify([{ ...entry, second: RAW }]);

  assert.throws(() => assertNoSecondValues(leaked, 'the listing'), /must not be in the listing/);
  assert.throws(
    () => assertNoSecondValues(JSON.stringify([{ ...entry, secondValues: {} }]), 'the listing'),
    /named for one/,
    'and an empty field of that name is caught too — the name is the tell',
  );
});

test('no second value can be bound to an environment variable, so no export writes one', () => {
  // The list assertion that stands BESIDE the two above, never instead of them: the env export is
  // the one agent-reachable path whose whole job is handing a stored VALUE to a process, and it
  // writes only what `BINDABLE_FIELDS` names. A second value is not on that list, which is the
  // decision — a person who wants one in a terminal types it.
  assert.deepEqual([...BINDABLE_FIELDS], ['password', 'privateKey', 'publicKey', 'dbConnection', 'dbPassword']);
  assert.ok(!BINDABLE_FIELDS.some((field) => field.endsWith('2')));
});
