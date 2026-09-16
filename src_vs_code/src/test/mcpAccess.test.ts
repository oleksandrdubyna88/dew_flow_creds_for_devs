import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessMask,
  anyAgentAccess,
  describeAccess,
  entriesUnder,
  grantsAnything,
  ladderKey,
  maskKey,
  mayDelete,
  mayDeleteFolder,
  McpAccess,
  normalizeMcpAccess,
  readMcpAccess,
  resolveMcpInTree,
} from '../mcpAccess';
import { TreeNode } from '../types';
import { isMcpAccess } from '../typeGuards';

/**
 * What an agent is allowed to do, and where the answer came from.
 *
 * <p>Two properties carry the whole design and both are here: everything is off until somebody
 * turns it on, and the ladder makes "may change it but may not see it" unrepresentable rather
 * than merely discouraged.</p>
 */

function folder(id: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'folder', parentId: null, mcp };
}

function entity(id: string, parentId: string | null, mcp?: TreeNode['mcp']): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    parentId,
    details: { id, name: id, isSshEnabled: false, mcp },
  };
}

/** The Trash is an ordinary node with one flag, which is how sync and restore-by-moving work. */
function trashFolder(id: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: 'Trash', type: 'folder', parentId: null, isTrash: true, mcp };
}

test('nothing is allowed until somebody says so', () => {
  const e = entity('e1', 'f1');
  const resolved = resolveMcpInTree(e, tree(folder('f1'), e));
  // The ladder answers nothing; the policy answers the strict value, because that is what the end
  // of a walk that found nothing MEANS. Every answer this resolver gives carries a policy.
  assert.deepEqual(resolved.access, { ask: 'always' });
  assert.equal(resolved.source, 'none');
  assert.equal(resolved.askSource, 'none');
  assert.equal(grantsAnything(resolved.access), false);
});

test('the ladder fills in everything a switch implies', () => {
  // "May delete but may not see" is not a configuration anybody meant.
  assert.deepEqual(normalizeMcpAccess({ delete: 'any' }), {
    view: true,
    use: true,
    edit: true,
    create: true,
    delete: 'any',
    folderCreate: false,
    folderEdit: false,
    folderDelete: undefined,
    ask: undefined,
  });
  assert.deepEqual(normalizeMcpAccess({ edit: true }), {
    view: true,
    use: true,
    edit: true,
    create: false,
    delete: undefined,
    folderCreate: false,
    folderEdit: false,
    folderDelete: undefined,
    ask: undefined,
  });
});

test('the folder ladder fills in the same way, and stops at the rung they share', () => {
  // Two ladders over two objects. They meet at `view` — every folder action is about something
  // an agent must be able to see — and nowhere else: making folders is not permission to store a
  // credential in one.
  assert.deepEqual(normalizeMcpAccess({ folderDelete: 'own' }), {
    view: true,
    use: false,
    edit: false,
    create: false,
    delete: undefined,
    folderCreate: true,
    folderEdit: true,
    folderDelete: 'own',
    ask: undefined,
  });
});

test('renaming folders lights the bottom rung and nothing on the entry ladder', () => {
  const access = normalizeMcpAccess({ folderEdit: true });

  assert.equal(access.view, true, '"may rename it but may not see it" must stay unrepresentable');
  assert.equal(access.use, false);
  assert.equal(access.create, false, 'folders and entries are separate objects');
  assert.equal(access.folderCreate, false, 'the ladder only ever fills downwards');
});

test('an unknown folder delete scope reads as no deleting, exactly like the entry one', () => {
  assert.equal(normalizeMcpAccess({ folderDelete: 'everything' }).folderDelete, undefined);
  assert.equal(normalizeMcpAccess({ folderDelete: 'everything' }).folderCreate, false);
});

test('folder deletion honours its own scope, not the entry one', () => {
  // The blast radius is not the same: a folder takes its whole subtree. Somebody may reasonably
  // let an agent tidy up entries and never let it remove a folder.
  const entriesOnly = normalizeMcpAccess({ delete: 'any' });
  assert.equal(mayDelete(entriesOnly, false), true);
  assert.equal(mayDeleteFolder(entriesOnly, false), false, 'entry deletion leaked into folders');

  const own = normalizeMcpAccess({ folderDelete: 'own' });
  assert.equal(mayDeleteFolder(own, true), true);
  assert.equal(mayDeleteFolder(own, false), false);
});

test('a lone view stays a lone view — the ladder only ever fills DOWNWARDS', () => {
  assert.deepEqual(normalizeMcpAccess({ view: true }), {
    view: true,
    use: false,
    edit: false,
    create: false,
    delete: undefined,
    folderCreate: false,
    folderEdit: false,
    folderDelete: undefined,
    ask: undefined,
  });
});

test('an unknown delete scope reads as no deleting rather than as permission', () => {
  // A record from a newer build could carry a scope this one has never heard of. Refusing is the
  // only safe reading; accepting the record and ignoring the word would be worse than both.
  assert.equal(normalizeMcpAccess({ delete: 'everything' }).delete, undefined);
});

test("the entry's own setting wins, and the folder is inherited when it has none", () => {
  const parent = folder('f1', { use: true });

  const mine = entity('e1', 'f1', { view: true });
  const own = resolveMcpInTree(mine, tree(parent, mine));
  assert.equal(own.source, 'entity');
  assert.equal(own.access.use, false);

  const theirs = entity('e2', 'f1');
  const inherited = resolveMcpInTree(theirs, tree(parent, theirs));
  assert.equal(inherited.source, 'folder');
  assert.equal(inherited.access.use, true);
});

test('an entry closed ON PURPOSE stays closed when its folder is opened up', () => {
  // This is why absence and emptiness are different things. An empty object means "decided here,
  // and the answer is nothing"; removing the field would mean "ask the folder" and quietly
  // re-open the entry the next time somebody widened the folder.
  const closed = entity('e1', 'f1', {});
  const resolved = resolveMcpInTree(closed, tree(folder('f1', { delete: 'any' }), closed));
  assert.equal(resolved.source, 'entity');
  assert.equal(grantsAnything(resolved.access), false);
});

test('nothing in the trash is reachable, and it answers nothing on EITHER axis', () => {
  const deleted = entity('e1', 'trash', { delete: 'any', ask: 'never' });
  const resolved = resolveMcpInTree(deleted, tree(trashFolder('trash', { delete: 'any', ask: 'never' }), deleted));

  assert.deepEqual(resolved.access, { ask: 'always' });
  assert.equal(resolved.source, 'none');
  // A never-ask policy surviving into the Trash would be the sharpest version of the bug the
  // Trash rule exists to prevent: a deleted credential an agent may use WITHOUT anybody being asked.
  assert.equal(resolved.askSource, 'none');
});

test('own-scoped deletion reaches only what the agent made', () => {
  const own = normalizeMcpAccess({ delete: 'own' });
  assert.equal(mayDelete(own, true), true);
  assert.equal(mayDelete(own, false), false);

  const any = normalizeMcpAccess({ delete: 'any' });
  assert.equal(mayDelete(any, false), true);

  assert.equal(mayDelete(normalizeMcpAccess({ create: true }), true), false);
});

test('the icon mask is five bits, and both delete scopes light the same one', () => {
  // Five stripes for six switches: the tree answers "can an agent delete here", and the scope is
  // a question for the form.
  assert.deepEqual(accessMask(normalizeMcpAccess({ view: true })), [true, false, false, false, false]);
  assert.equal(maskKey(normalizeMcpAccess({ delete: 'own' })), '11111');
  assert.equal(maskKey(normalizeMcpAccess({ delete: 'any' })), '11111');
  assert.equal(maskKey(normalizeMcpAccess(undefined)), '00000');
});

test('the words the viewer says distinguish the two delete scopes', () => {
  assert.equal(describeAccess({}), 'not available to agents');
  assert.match(describeAccess(normalizeMcpAccess({ delete: 'own' })), /created/);
  assert.match(describeAccess(normalizeMcpAccess({ delete: 'any' })), /to Trash/);
  assert.equal(describeAccess(normalizeMcpAccess({ view: true })), 'visible');
});

/** A tree as a lookup, so the resolver can walk it the way the real one does. */
function tree(...nodes: TreeNode[]): (id: string) => TreeNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id: string) => byId.get(id);
}

function child(id: string, parentId: string, mcp?: TreeNode['mcp']): TreeNode {
  return { id, name: id, type: 'folder', parentId, mcp };
}

test('a grant on a folder reaches entries in the folders NESTED inside it', () => {
  // What the owner expects and says out loud: "I opened the root folder, so everything inside is
  // open; I can close a part of it afterwards." Resolving only against the immediate parent means
  // a project folder with sub-folders grants nothing at all, which is the opposite.
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root');
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.access.use, true, 'the grandparent grant did not reach a nested entry');
  assert.equal(resolved.source, 'folder');
});

test('a nested FOLDER answers with what it inherits, so its form can say so', () => {
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root');

  const resolved = resolveMcpInTree(mid, tree(root, mid));

  assert.equal(resolved.access.use, true, 'a sub-folder showed "not set" under an open parent');
  assert.equal(resolved.source, 'folder');
});

test('a folder closed on purpose blocks what its parent opened', () => {
  // The other half, and the reason presence is what carries the answer: an explicit empty object
  // means "decided, and the answer is nothing", and it must beat an ancestor that says yes.
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root', {});
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(
    grantsAnything(resolved.access),
    false,
    'a deliberately closed sub-folder still let the grant through',
  );
});

test('an entry still beats every folder above it', () => {
  const root = folder('root', { view: true, use: true, edit: true });
  const mid = child('mid', 'root');
  const leaf = entity('e1', 'mid', {});
  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.source, 'entity');
  assert.equal(grantsAnything(resolved.access), false);
});

test('the blast radius counts the whole subtree, not the direct children', () => {
  // The form says this number out loud. Counting one level made a project folder whose entries
  // all live in sub-folders read "0 entries" — the most reassuring possible wording for the most
  // far-reaching possible click.
  const nodes: TreeNode[] = [
    folder('root'),
    child('db', 'root'),
    child('ssh', 'root'),
    entity('e1', 'db'),
    entity('e2', 'db'),
    entity('e3', 'ssh'),
    entity('elsewhere', null),
  ];

  assert.equal(entriesUnder('root', nodes), 3);
  assert.equal(entriesUnder('db', nodes), 2);
  assert.equal(entriesUnder('ssh', nodes), 1);
});

test('a cycle in the parent chain cannot hang the form', () => {
  // parentId comes off a synced record; a bad merge can make two folders each other's parent.
  const a = child('a', 'b');
  const b = child('b', 'a');

  assert.equal(entriesUnder('a', [a, b, entity('e1', 'b')]), 1);
});

test('the agent door opens only when somebody actually opened something', () => {
  // The trigger for binding a loopback listener at all, so it must key on an answer a person
  // GAVE. A folder set to nothing is an opt-OUT and must leave the door shut.
  assert.equal(anyAgentAccess([folder('root'), entity('e1', 'root')]), false, 'nothing set');
  assert.equal(anyAgentAccess([folder('root', {}), entity('e1', 'root')]), false, 'closed on purpose');
  assert.equal(anyAgentAccess([folder('root', { view: true })]), true, 'a folder was opened');
  assert.equal(anyAgentAccess([entity('e1', null, { use: true })]), true, 'an entry was opened');
});

test('a folder that only INHERITS does not itself open the door', () => {
  // It is already covered by the folder that answered; counting it would make the door depend on
  // where in the tree you look rather than on what anybody decided.
  assert.equal(anyAgentAccess([child('mid', 'root')]), false);
});

/**
 * The ask policy: a second axis on the same record, read and stored apart from the ladder.
 *
 * <p>Everything here is about the two halves not contaminating each other. The failure these
 * pin is not hypothetical: reading them together is how a person who changed only "never ask"
 * on a folder would have had an all-off ladder written for them, closing to agents every entry
 * beneath it that used to inherit its rights from higher up.</p>
 */

/** Every field at a value that is not its default — the fixture the completeness test needs. */
const EVERY_FIELD: McpAccess = {
  view: true,
  use: true,
  edit: true,
  create: true,
  delete: 'any',
  folderCreate: true,
  folderEdit: true,
  folderDelete: 'own',
  ask: 'never',
};

test('a record with every field set keeps the same key set through both closed-world builders', () => {
  // The only guard against the silent vanish: `readMcpAccess` and `climb` each write out their
  // fields by hand, and TypeScript reports nothing when an OPTIONAL one is forgotten in either.
  // A field added to `McpAccess` and to this fixture, but to neither builder, fails here.
  const expected = Object.keys(EVERY_FIELD).sort();
  assert.deepEqual(Object.keys(readMcpAccess(EVERY_FIELD) ?? {}).sort(), expected, 'readMcpAccess dropped a field');
  assert.deepEqual(Object.keys(normalizeMcpAccess(EVERY_FIELD)).sort(), expected, 'climb dropped a field');
});

test('an unrecognised policy word reads as ask-every-time, never as inherit', () => {
  // The opposite direction from an unknown delete scope, and deliberately: absence means "ask the
  // folder", so reading a strange word as absence would let it inherit a folder's "never" — a word
  // this build has never seen would turn the dialog off.
  assert.equal(readMcpAccess({ ask: 'weekly' })?.ask, 'always');
  assert.equal(normalizeMcpAccess({ ask: 'weekly' }).ask, 'always');
  assert.equal(readMcpAccess({ ask: 7 })?.ask, 'always');
});

test('a missing or null policy is no answer here, so the folder still decides', () => {
  assert.equal(readMcpAccess({ view: true })?.ask, undefined);
  // `null` is the form taking its answer back. It has to be a VALUE rather than an omission,
  // because JSON.stringify drops an undefined property and the reader would never see the key.
  assert.equal(readMcpAccess({ view: true, ask: null })?.ask, undefined);
  assert.equal(normalizeMcpAccess({ view: true }).ask, undefined);
});

/** A message that claims something, read. Keeps the assertions below free of optional chains. */
function claimed(raw: unknown): McpAccess {
  const access = readMcpAccess(raw);
  assert.notEqual(access, undefined, 'this message claims something and must read as something');
  return access ?? {};
}

test('a message claiming only a policy stores no ladder, and one claiming only a ladder stores no policy', () => {
  const policyOnly = claimed({ ask: 'never' });
  assert.deepEqual(Object.keys(policyOnly), ['ask'], 'a policy-only save must not write a ladder');
  assert.equal(policyOnly.view, undefined);

  const ladderOnly = claimed({ view: true, use: true });
  assert.equal(ladderOnly.ask, undefined);
  assert.equal(ladderOnly.view, true);
  assert.equal(ladderOnly.folderDelete, undefined);
});

test('a message claiming neither half claims nothing at all', () => {
  assert.equal(readMcpAccess({}), undefined);
  assert.equal(readMcpAccess({ ask: null }), undefined);
  assert.equal(readMcpAccess({ somethingElse: true }), undefined);
});

test('an explicit all-off ladder is still a decision, and says so by carrying its keys', () => {
  // How an entry closed on purpose is stored, and the thing the resolver reads as an ANSWER that
  // stops the climb. Pinned here because the half-aware reader is one wrong predicate away from
  // turning every deliberately closed record back into "ask the folder".
  const closed = readMcpAccess({ view: false, use: false, edit: false, create: false });
  assert.notEqual(closed, undefined);
  assert.equal(closed?.view, false);
  assert.ok('view' in (closed ?? {}), 'the ladder half has to be present for the answer to be readable');
});

test('the ladder never fills the policy in, and the policy never lights a rung', () => {
  assert.equal(normalizeMcpAccess({ delete: 'any' }).ask, undefined, 'a full ladder implies no policy');
  const policy = normalizeMcpAccess({ ask: 'never' });
  assert.equal(policy.view, false);
  assert.equal(policy.use, false);
  assert.equal(policy.delete, undefined);
  assert.equal(policy.ask, 'never');
});

test('the viewer names the two answers that change when a person is asked, and stays silent on the third', () => {
  assert.match(describeAccess(normalizeMcpAccess({ view: true, ask: 'never' })), /never asks/);
  assert.match(describeAccess(normalizeMcpAccess({ view: true, ask: 'every12h' })), /once every 12 hours/);
  // Silence for `always` is what keeps every existing card byte for byte what it was.
  assert.equal(describeAccess(normalizeMcpAccess({ view: true, ask: 'always' })), 'visible');
  assert.equal(describeAccess(normalizeMcpAccess({ view: true })), 'visible');
  // A card with no rungs says one thing and keeps saying it, whatever the policy is.
  assert.equal(describeAccess(normalizeMcpAccess({ ask: 'never' })), 'not available to agents');
});

test('a record whose policy word this build has never seen is still admitted to the vault', () => {
  // `isMcpAccess` gates the WHOLE node: a `false` here makes the entry disappear. A word from a
  // newer build must not do that, which is why the safety lives in `askPolicy` instead.
  assert.equal(isMcpAccess({ view: true, ask: 'weekly' }), true);
  assert.equal(isMcpAccess({ view: true, ask: 'never' }), true);
});

/**
 * Two axes, two walks — and the regression that made them necessary.
 *
 * <p>Inheritance stops at the first node with an answer, which is how a sub-folder closes a branch
 * its parent opened. Once the consent policy rode the same record, a folder given ONLY "never ask"
 * would have stopped the ladder walk too, and every entry beneath it that inherited its rights
 * from higher up would have silently closed to agents: a fatigue setting causing a permission
 * regression, wearing the face of a broken switch.</p>
 */

test('a folder that only sets a policy does not close the branch its parent opened', () => {
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root', { ask: 'never' });
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.access.use, true, 'a consent setting closed a branch it has no business closing');
  assert.equal(resolved.source, 'folder');
  assert.equal(resolved.folder?.id, 'root', 'the ladder came from the folder that ANSWERED it');
  assert.equal(resolved.access.ask, 'never');
  assert.equal(resolved.askFolder?.id, 'mid', 'and the policy from the one that answered THAT');
});

test('an empty object on a folder still closes the branch', () => {
  // The other half of the same predicate, and the reason it is not "does it name any rung": a
  // branch closed on purpose is stored with NO keys at all, so the obvious test would read it as
  // silence and re-open every deliberately closed branch the next time an ancestor was widened.
  const root = folder('root', { view: true, use: true });
  const mid = child('mid', 'root', {});
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(grantsAnything(resolved.access), false, 'an explicit empty object stopped answering');
  assert.equal(resolved.source, 'folder');
});

test('an entry with its own ladder still inherits the folder’s policy', () => {
  const root = folder('root', { ask: 'every12h' });
  const leaf = entity('e1', 'root', { view: true, use: true });

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.source, 'entity');
  assert.equal(resolved.askSource, 'folder', 'ticking a switch must not discard the folder’s policy');
  assert.equal(resolved.access.ask, 'every12h');
});

test('a child’s ask-every-time overrides a folder’s never', () => {
  // The case the first draft of this model could not express at all: with absence meaning "ask
  // every time" there was no way to SAY it, because saying nothing is how you say "inherit".
  const root = folder('root', { view: true, use: true, ask: 'never' });
  const leaf = entity('e1', 'root', { ask: 'always' });

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.access.ask, 'always');
  assert.equal(resolved.askSource, 'entity');
  assert.equal(resolved.access.use, true, 'and it kept the rights it inherited');
});

test('a child with no answer under a policy-set folder resolves to the folder’s, and names it', () => {
  const root = folder('root', { view: true, ask: 'never' });
  const leaf = entity('e1', 'root');

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.access.ask, 'never');
  assert.equal(resolved.askSource, 'folder');
  assert.equal(resolved.askFolder?.id, 'root');
});

test('the two axes may come from two different folders, and both are named', () => {
  // Which is exactly why one folder name would be a lie on the form: half the setting a person is
  // subject to would be decided on a page the name does not point at.
  const root = folder('root', { ask: 'every12h' });
  const mid = child('mid', 'root', { view: true, use: true });
  const leaf = entity('e1', 'mid');

  const resolved = resolveMcpInTree(leaf, tree(root, mid, leaf));

  assert.equal(resolved.folder?.id, 'mid');
  assert.equal(resolved.askFolder?.id, 'root');
  assert.equal(resolved.access.use, true);
  assert.equal(resolved.access.ask, 'every12h');
});

test('nothing anywhere answering the policy resolves to ask-every-time, from nowhere', () => {
  const root = folder('root', { view: true, use: true });
  const leaf = entity('e1', 'root');

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.access.ask, 'always', 'the safe answer belongs at the END of the walk');
  assert.equal(resolved.askSource, 'none');
});

test('a policy-only folder does not open the agent door', () => {
  // `anyAgentAccess` decides whether the broker's loopback listener opens at all. A consent
  // setting grants nothing, so it must not be the thing that starts a server.
  assert.equal(anyAgentAccess([folder('root', { ask: 'never' })]), false);
  assert.equal(anyAgentAccess([folder('root', { ask: 'every12h' }), child('mid', 'root', {})]), false);
  assert.equal(anyAgentAccess([folder('root', { view: true })]), true, 'a real grant still opens it');
});

test('a cycle in the parent chain cannot hang either walk', () => {
  // `parentId` comes off a synced record, so two folders each other's parent after a bad merge is
  // reachable. Both walks are bounded, and neither can be the one that was forgotten.
  const a: TreeNode = { id: 'a', name: 'a', type: 'folder', parentId: 'b' };
  const b: TreeNode = { id: 'b', name: 'b', type: 'folder', parentId: 'a' };
  const leaf = entity('e1', 'a');

  const resolved = resolveMcpInTree(leaf, tree(a, b, leaf));

  assert.equal(resolved.source, 'none');
  assert.equal(resolved.askSource, 'none');
  assert.equal(resolved.access.ask, 'always');
});

test('a policy word this build has never seen stops the climb rather than inheriting a never', () => {
  // The fail-safe direction, observed through the resolver rather than argued about. A record
  // written by a newer build sits under a folder that says "never ask": if the unknown word read as
  // silence, that entry would inherit the folder's silence and an agent would use it unattended.
  const root = folder('root', { view: true, use: true, ask: 'never' });
  const leaf = entity('e1', 'root', synced('{"ask":"quarterly"}'));

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.access.ask, 'always', 'an unrecognised word inherited a never');
  assert.equal(resolved.askSource, 'entity', 'and it stopped the climb where it was written');
  assert.equal(resolved.access.use, true, 'while the ladder still came from the folder');
});

test('a policy stored as null keeps climbing, because it is an answer taken back', () => {
  // The other half of the same predicate. `null` is what the form sends when somebody chooses
  // "inherit from the folder", and a reader that treated it as a value would pin the entry to
  // whatever that value normalised to instead of handing it back to its folder.
  const root = folder('root', { view: true, ask: 'never' });
  const leaf = entity('e1', 'root', synced('{"ask":null}'));

  const resolved = resolveMcpInTree(leaf, tree(root, leaf));

  assert.equal(resolved.access.ask, 'never');
  assert.equal(resolved.askSource, 'folder');
  assert.equal(resolved.askFolder?.id, 'root');
});

/**
 * A record as it arrives from SYNC — written by a build that is not this one.
 *
 * <p>It is JSON because that is literally what it is, which is also what makes the fixture
 * honest without a cast: `McpAccess` describes what such a record OUGHT to carry, and two of the
 * tests above are about words it does not. `isMcpAccess` admits them on purpose — rejecting one
 * would drop the whole node and take a credential with it — so the resolver has to survive them,
 * and a fixture the type system has sanitised could not put that to the test.</p>
 */
function synced(json: string): TreeNode['mcp'] {
  const record = JSON.parse(json);
  // Run the REAL admission check, not a reading of it. `isMcpAccess` is what decides whether a
  // synced record reaches the vault at all, and a fixture it would have rejected proves nothing
  // about the resolver — the test would pass against a node that can never exist.
  assert.equal(isMcpAccess(record), true, `the vault would reject this record: ${json}`);
  return record;
}

test('the ladder key changes when any rung or scope changes, and is stable across key order', () => {
  // A remembered consent covers the grant the dialog described. maskKey is not enough: it merges
  // the two delete scopes for the tree's badge, so a grant widened from own-only to anything would
  // read as unchanged — which is exactly the escalation the comparison exists to catch.
  const base = normalizeMcpAccess({ view: true, use: true });
  assert.equal(ladderKey(base), ladderKey(normalizeMcpAccess({ use: true, view: true })), 'key order changed it');

  assert.notEqual(ladderKey(base), ladderKey(normalizeMcpAccess({ view: true, use: true, edit: true })));
  assert.notEqual(
    ladderKey(normalizeMcpAccess({ delete: 'own' })),
    ladderKey(normalizeMcpAccess({ delete: 'any' })),
    'widening the delete scope must not read as unchanged',
  );
  assert.equal(
    maskKey(normalizeMcpAccess({ delete: 'own' })),
    maskKey(normalizeMcpAccess({ delete: 'any' })),
    'and the badge still merges them, which is why ladderKey is not maskKey',
  );

  // The policy is not part of the grant: changing how often you are asked does not re-ask.
  assert.equal(ladderKey(normalizeMcpAccess({ view: true, ask: 'never' })), ladderKey(normalizeMcpAccess({ view: true })));
});
