import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CapabilityContext, matchesPredicates, parseQuery } from '../searchPredicates';
import { MCP_SWITCHES } from '../mcpSwitches';
import { TreeNode } from '../types';

/**
 * T23b — capability predicates. The guarantees: each predicate reads metadata and only
 * metadata, combinations AND, free text rides beside them, and an unknown predicate is
 * REPORTED — treating `has:ttop` as free text would match nothing and look like an empty
 * vault.
 */

function entity(details: Record<string, unknown> = {}): TreeNode {
  return { id: 'e1', name: 'entry', type: 'entity', parentId: null, details } as never;
}

const caps = (over: Partial<CapabilityContext> = {}): CapabilityContext => ({
  hasAlias: () => false,
  mcpAccess: () => ({}),
  ...over,
});

test('the query splits into terms, predicates and the unknowns it refuses to guess about', () => {
  const parsed = parseQuery('aws has:totp mcp:usable has:nonsense prod');
  assert.deepEqual(parsed.terms, ['aws', 'prod']);
  assert.deepEqual(parsed.predicates, ['totp', 'mcp-usable']);
  assert.deepEqual(parsed.unknown, ['has:nonsense']);
});

test('every has: predicate matches on its flag and only its flag', () => {
  const cases: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['has:totp', { hasTotp: true }],
    ['has:env', { envBindings: { password: 'DB_PASS' } }],
    ['has:code-access', { configKeyHash: 'abc' }],
    ['has:deps', { dependsOn: ['other'] }],
    ['has:attachment', { attachmentFileName: 'a.json' }],
    ['has:image', { imageFileName: 'i.jpg' }],
    ['is:ephemeral', { expiresAt: 123 }],
  ];
  for (const [token, details] of cases) {
    const { predicates } = parseQuery(token);
    assert.equal(predicates.length, 1, token);
    assert.equal(matchesPredicates(entity(details), predicates, caps()), true, `${token} should match`);
    assert.equal(matchesPredicates(entity({}), predicates, caps()), false, `${token} on a bare entry`);
  }
});

test('has:cli asks the alias map, not the node', () => {
  const { predicates } = parseQuery('has:cli');
  assert.equal(matchesPredicates(entity(), predicates, caps({ hasAlias: () => true })), true);
  assert.equal(matchesPredicates(entity(), predicates, caps({ hasAlias: () => false })), false);
});

test('every switch in the catalog has an mcp: predicate, answered by the same on()', () => {
  // Completeness against the catalog: a seventh switch without a predicate name throws at
  // module load; this pins that the six that exist all parse and all answer.
  for (const name of ['visible', 'usable', 'rotate', 'create', 'delete-own', 'delete-any']) {
    const { predicates, unknown } = parseQuery(`mcp:${name}`);
    assert.deepEqual(unknown, [], `mcp:${name} went unrecognised`);
    assert.equal(predicates.length, 1);
  }
  const usable = parseQuery('mcp:usable').predicates;
  assert.equal(
    matchesPredicates(entity(), usable, caps({ mcpAccess: () => ({ use: true }) })),
    true,
  );
  assert.equal(
    matchesPredicates(entity(), usable, caps({ mcpAccess: () => ({ view: true }) })),
    false,
  );
  assert.equal(MCP_SWITCHES.length, 6, 'a new switch needs a predicate name and a test row');
});

test('predicates AND together, and a folder satisfies none of them', () => {
  const both = parseQuery('has:totp is:ephemeral').predicates;
  assert.equal(matchesPredicates(entity({ hasTotp: true, expiresAt: 1 }), both, caps()), true);
  assert.equal(matchesPredicates(entity({ hasTotp: true }), both, caps()), false);

  const folder: TreeNode = { id: 'f', name: 'db', type: 'folder', parentId: null } as never;
  assert.equal(matchesPredicates(folder, parseQuery('has:totp').predicates, caps()), false);
});
