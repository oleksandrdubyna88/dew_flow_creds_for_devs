import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityShape, shapeAs, shapeOf } from '../entityShape';
import { assertNever, canConnectSsh, kindOf, resolveKind } from '../entityKind';
import { entityContextValue } from '../treeRowText';
import { ENTITY_KINDS, EntityKind, EntityMetadata } from '../types';

/**
 * Roadmap A4 — the three checks the plan asked for: a kind without a branch does not compile,
 * a pre-0.54 record (no `kind`) narrows to the same shape a stamped one does, and the tree's
 * `:ssh` agrees with the kind machinery on every entity.
 */

/** A record of every kind, as the form writes it (stamped) — and as 0.53 wrote it (flags only). */
function stamped(kind: EntityKind): EntityMetadata {
  return { id: kind, name: kind, kind, isSshEnabled: kind === 'ssh', host: kind === 'ssh' || kind === 'db' ? 'h' : undefined };
}
const LEGACY_FLAG: Record<EntityKind, Partial<EntityMetadata>> = {
  ssh: { isSshEnabled: true },
  sshkey: { isSshKey: true },
  vpn: { isVpn: true },
  db: { isDb: true },
  terminal: { isTerminal: true },
  script: { isScript: true },
  config: { isConfig: true },
  payment: { isPayment: true },
  credential: {},
};
function legacy(kind: EntityKind): EntityMetadata {
  return { id: kind, name: kind, isSshEnabled: false, ...LEGACY_FLAG[kind] };
}

/** Exhaustive by construction: a tenth kind makes this switch a compile error at `assertNever`. */
// eslint-disable-next-line complexity -- the exhaustive switch IS the test
function describe(shape: EntityShape): string {
  switch (shape.kind) {
    case 'ssh':
      return `ssh ${shape.host ?? ''}`;
    case 'sshkey':
      return `key ${shape.publicKey ?? ''}`;
    case 'db':
      return `db ${shape.dbType ?? ''}`;
    case 'vpn':
      return `vpn ${shape.vpnType ?? ''}`;
    case 'terminal':
      return `terminal ${shape.command ?? ''}`;
    case 'script':
      return `script ${shape.scriptLanguage ?? ''}`;
    case 'config':
      return `config ${shape.configFormat ?? ''}`;
    case 'payment':
      return `payment ${shape.paymentForm ?? ''}`;
    case 'credential':
      return 'credential';
    default:
      return assertNever(shape, 'describe');
  }
}

test('every kind narrows to its own shape, stamped or legacy, and the switch over it is exhaustive', () => {
  for (const kind of ENTITY_KINDS) {
    assert.equal(shapeOf(stamped(kind)).kind, kind);
    assert.equal(shapeOf(legacy(kind)).kind, kind, `a 0.53 ${kind} record without a kind still narrows`);
    assert.equal(kindOf(legacy(kind)), kind);
    assert.ok(describe(shapeOf(stamped(kind))).startsWith(kind === 'sshkey' ? 'key' : kind));
  }
});

test('shapeAs answers the one kind a reader serves, and nothing for another', () => {
  const ssh = shapeAs(stamped('ssh'), 'ssh');
  assert.equal(ssh?.host, 'h');
  assert.equal(shapeAs(stamped('db'), 'ssh'), undefined);
  const config = shapeAs({ ...stamped('config'), configFormat: 'json' }, 'config');
  assert.equal(config?.configFormat, 'json');
});

test("the tree's :ssh and the kind machinery agree on every entity — an SSH kind, or a host that ssh can reach", () => {
  for (const kind of ENTITY_KINDS) {
    for (const details of [stamped(kind), legacy(kind)]) {
      const inTree = entityContextValue(details, false, false).includes(':ssh');
      const byKind = canConnectSsh(details);
      assert.equal(inTree, byKind, `${kind}: tree ${inTree} vs kind ${byKind} (resolved ${resolveKind(details)})`);
    }
  }
});
