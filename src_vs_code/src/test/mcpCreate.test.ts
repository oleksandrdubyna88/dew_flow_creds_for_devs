import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseTarget, creatableFolders, detailsFor, summarizeCreate } from '../mcpCreate';
import type { TreeNode } from '../types';

/**
 * Level 4: where an agent may put something, and what it may say about it.
 *
 * <p>The whole risk of this level is the destination. Given a free choice an agent would make
 * one, and the one it made would be wherever seemed convenient — so it has no free choice: a
 * folder is open only if somebody turned its switch on, and the set of open folders is the whole
 * of what an agent may choose between. These tests are mostly about that set being right.</p>
 *
 * <p>The second thing worth pinning is the mark. An entry created this way carries
 * `mcpCreatedByAgent`, and the narrow delete permission — "what they created themselves" — keys
 * on it. If creation forgot to set it, that permission would cover nothing at all and the
 * failure would be silent in the safe direction, which is the kind that survives for months.</p>
 */

function folder(id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name, type: 'folder', parentId: null, ...extra };
}

function vaultOf(nodes: readonly TreeNode[]): Parameters<typeof creatableFolders> {
  return [
    [{ accountId: 'a1' }],
    () => nodes,
    (_a: string, id: string) => nodes.find((n) => n.id === id),
  ];
}

const REQUEST = { name: 'app-03', kind: 'ssh', secret: 'k' };

test('a vault with no folder opened to creation offers none', () => {
  const nodes = [folder('f1', 'Servers'), folder('f2', 'Databases')];

  assert.deepEqual(creatableFolders(...vaultOf(nodes)), []);
});

test('a folder opened to creation is offered, and nothing else is', () => {
  const nodes = [
    folder('f1', 'Servers', { mcp: { create: true } }),
    folder('f2', 'Databases'),
    { id: 'e1', name: 'prod', type: 'entity' as const, parentId: 'f1' },
  ];

  const targets = creatableFolders(...vaultOf(nodes));

  assert.equal(targets.length, 1);
  assert.equal(targets[0].folderName, 'Servers');
});

test('creation DOES inherit down the tree, like everything else', () => {
  // Reversed deliberately, on the owner's decision of 2026-08-28. It used to stop at one level,
  // with the reasoning that opening one folder says one thing and "everything under it" says
  // another. What that produced was two rules on one screen: `creds_list` handed an agent an
  // entry with `can.create: true` — resolved by climbing — and `creds_create` then refused it,
  // because the destination set was not. One rule now: an answer given above applies below until
  // a folder gives its own.
  const nodes = [
    folder('f1', 'Servers', { mcp: { create: true } }),
    { ...folder('f2', 'EU'), parentId: 'f1' },
  ];

  assert.deepEqual(
    creatableFolders(...vaultOf(nodes)).map((t) => t.folderName),
    ['Servers', 'EU'],
  );
});

test('a sub-folder closed on purpose is not offered, however open its parent is', () => {
  // The other half of the same rule, and what makes the reversal safe: an explicit empty object
  // is an ANSWER, and answers stop the climb.
  const nodes = [
    folder('f1', 'Servers', { mcp: { create: true } }),
    { ...folder('f2', 'EU', { mcp: {} }), parentId: 'f1' },
    { ...folder('f3', 'Frankfurt'), parentId: 'f2' },
  ];

  assert.deepEqual(
    creatableFolders(...vaultOf(nodes)).map((t) => t.folderName),
    ['Servers'],
  );
});

test('nothing in the Trash is offered, whatever its switch says', () => {
  // An entry created there would be invisible the moment it existed.
  const nodes = [
    folder('t', 'Trash', { isTrash: true, mcp: { create: true } }),
    { ...folder('f1', 'Servers', { mcp: { create: true } }), parentId: 't' },
  ];

  assert.deepEqual(creatableFolders(...vaultOf(nodes)), []);
});

test('with no open folder the refusal names the switch to turn on', () => {
  const chosen = chooseTarget([], REQUEST);

  assert.equal(chosen.ok, false);
  assert.ok(!chosen.ok && chosen.message.includes('Agents may create entries'));
});

test('with exactly one open folder, no choice is asked for', () => {
  const targets = creatableFolders(...vaultOf([folder('f1', 'Servers', { mcp: { create: true } })]));

  const chosen = chooseTarget(targets, REQUEST);

  assert.ok(chosen.ok);
  assert.equal(chosen.ok && chosen.target.folderName, 'Servers');
});

test('with several, one must be named — and the answer lists them', () => {
  const targets = creatableFolders(
    ...vaultOf([
      folder('f1', 'Servers', { mcp: { create: true } }),
      folder('f2', 'Databases', { mcp: { create: true } }),
    ]),
  );

  const unchosen = chooseTarget(targets, REQUEST);
  const chosen = chooseTarget(targets, { ...REQUEST, folder: 'databases' });

  assert.equal(unchosen.ok, false);
  assert.ok(!unchosen.ok && unchosen.message.includes('"Servers"'));
  assert.ok(!unchosen.ok && unchosen.message.includes('"Databases"'));
  assert.ok(chosen.ok, 'the name matches case-insensitively — a person typed it, not a machine');
  assert.equal(chosen.ok && chosen.target.folderId, 'f2');
});

test('a folder that is not open is refused without saying whether it exists', () => {
  // Whether a given folder exists is not something an agent may enumerate by guessing at names.
  const targets = creatableFolders(...vaultOf([folder('f1', 'Servers', { mcp: { create: true } })]));

  const chosen = chooseTarget(targets, { ...REQUEST, folder: 'Production' });

  assert.equal(chosen.ok, false);
  assert.ok(!chosen.ok && chosen.message.includes('not open'));
});

test('a typed folder dictates the kind, whatever the agent asked for', () => {
  // A typed folder holds one kind and refuses the others, so an agent naming a different one is
  // making an entry the folder would not accept from a person either.
  const targets = creatableFolders(
    ...vaultOf([folder('f1', 'Databases', { mcp: { create: true }, folderType: 'db' })]),
  );

  const chosen = chooseTarget(targets, { ...REQUEST, kind: 'ssh' });

  assert.ok(chosen.ok);
  assert.equal(chosen.ok && chosen.kind, 'db');
});

test('an untyped folder takes the kind the agent named, and refuses a word that is not one', () => {
  const targets = creatableFolders(...vaultOf([folder('f1', 'Anything', { mcp: { create: true } })]));

  assert.equal(chooseTarget(targets, { ...REQUEST, kind: 'ssh' }).ok, true);
  const bad = chooseTarget(targets, { ...REQUEST, kind: 'sudo' });
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.message.includes('sudo'));
});

test('the new entry is MARKED as agent-created', () => {
  // The narrow delete permission keys on this. Forgetting it would make that permission cover
  // nothing at all — a silent failure in the safe direction, which is the kind that survives.
  const details = detailsFor('new-1', 'ssh', { name: 'app-03', kind: 'ssh', host: 'app-03.internal' });

  assert.equal(details.mcpCreatedByAgent, true);
  assert.equal(details.name, 'app-03');
  assert.equal(details.host, 'app-03.internal');
  assert.equal(details.isSshEnabled, true);
});

test('a field the agent did not send is absent, not empty', () => {
  const details = detailsFor('new-1', 'credential', { name: 'token', kind: 'credential', host: '   ' });

  assert.equal(details.host, undefined);
  assert.equal(details.user, undefined);
  assert.equal(details.isSshEnabled, false);
});

test('the prompt says what is being made and where', () => {
  const target = { accountId: 'a1', folderId: 'f1', folderName: 'Servers' };

  assert.equal(summarizeCreate(REQUEST, target, 'ssh'), 'app-03 (ssh) in "Servers"');
});

/**
 * Two folders with one name, found in a security pass on 2026-08-27.
 *
 * <p>Entity and folder names carry no uniqueness rule anywhere in this product — `secretRef.ts`
 * says so in its own header and REFUSES an ambiguous reference for exactly this reason, naming
 * both candidates. This picked the first match instead, silently. Two accounts each with a
 * "Servers" folder open to creation, or one account with a folder of that name at two depths,
 * and an agent's `folder: "Servers"` lands in whichever the scan reached first — which works
 * until the day it chooses the other one, and the credential for a production host is filed
 * under someone's scratch account.</p>
 */

test('two open folders sharing a name are refused, not guessed between', () => {
  const nodes = [
    folder('f1', 'Servers', { mcp: { create: true } }),
    folder('f2', 'Servers', { mcp: { create: true } }),
  ];

  const chosen = chooseTarget(creatableFolders(...vaultOf(nodes)), { ...REQUEST, folder: 'Servers' });

  assert.equal(chosen.ok, false);
  assert.ok(!chosen.ok && chosen.message.includes('More than one'), chosen.ok ? '' : chosen.message);
  assert.ok(!chosen.ok && chosen.message.includes('Servers'));
});

test('the ambiguity is by NAME, so a differently named pair still resolves', () => {
  const nodes = [
    folder('f1', 'Servers', { mcp: { create: true } }),
    folder('f2', 'Databases', { mcp: { create: true } }),
  ];

  const chosen = chooseTarget(creatableFolders(...vaultOf(nodes)), { ...REQUEST, folder: 'Servers' });

  assert.ok(chosen.ok);
  assert.equal(chosen.ok && chosen.target.folderId, 'f1');
});

test('a name is bounded, because it reaches a consent prompt and a tree row', () => {
  // The body is capped at 64 KB, so without this a name could be sixty thousand characters —
  // a prompt nobody can read the buttons of, and a row that ruins the tree it lands in.
  const nodes = [folder('f1', 'Servers', { mcp: { create: true } })];

  const chosen = chooseTarget(creatableFolders(...vaultOf(nodes)), { ...REQUEST, name: 'x'.repeat(300) });

  assert.equal(chosen.ok, false);
  assert.ok(!chosen.ok && chosen.message.includes('too long'));
});
