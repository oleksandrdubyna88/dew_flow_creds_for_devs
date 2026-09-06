import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { parentFolderOf, refuseMove } from '../moveGate';
import { TreeNode } from '../types';

function folder(over: Partial<TreeNode> = {}): TreeNode {
  return { id: 'f1', name: 'Folder', type: 'folder', ...over };
}

function entity(over: Partial<TreeNode> = {}): TreeNode {
  return { id: 'e1', name: 'prod db', type: 'entity', details: { id: 'e1', name: 'prod db', isSshEnabled: false, kind: 'credential' }, ...over };
}

function policy(over: Partial<CorpPolicyState> = {}): CorpPolicyState {
  return {
    corpMode: true,
    role: 'dev',
    isOfficer: false,
    isAdmin: false,
    active: true,
    policy: { export: false, share: 'project', moveOutOfProject: false },
    policyFromServer: true,
    projects: [],
    pendingFolderRemovals: [],
    leaseHours: 24,
    fetchedAt: 1_000_000,
    ...over,
  };
}

const MEMBER = policy({ role: 'member', policy: { export: true, share: 'any', moveOutOfProject: true } });

// ----- the typed-folder rule, as it behaved in BOTH copies before the extraction -----

test('a typed folder refuses an entity of another kind', () => {
  const refusal = refuseMove({ moving: entity(), to: folder({ name: 'Keys', folderType: 'sshkey' }) });

  assert.match(refusal, /holds only sshkey entities/);
  assert.match(refusal, /"prod db" is credential/);
});

test('a typed folder accepts its own kind', () => {
  assert.equal(refuseMove({ moving: entity(), to: folder({ folderType: 'credential' }) }), '');
});

test("an 'any' folder and the root accept anything", () => {
  assert.equal(refuseMove({ moving: entity(), to: folder({ folderType: 'any' }) }), '');
  assert.equal(refuseMove({ moving: entity(), to: undefined }), '');
});

test("folderType 'project' is a template, not a restriction — it accepts every kind", () => {
  // The trap this epic had to work around: `folderType: 'project'` already existed and means a
  // client-side scaffold of default subfolders. Nothing to do with a corporate project.
  assert.equal(refuseMove({ moving: entity(), to: folder({ folderType: 'project' }) }), '');
});

test('a FOLDER is never refused for a kind — only entities have one', () => {
  assert.equal(refuseMove({ moving: folder({ id: 'f2' }), to: folder({ folderType: 'sshkey' }) }), '');
});

// ----- the project lock -----

test('a developer may not move an entry out of a project folder', () => {
  const refusal = refuseMove({
    moving: entity(),
    from: folder({ name: 'Atlas', projectId: 'p1' }),
    to: folder({ name: 'Elsewhere' }),
    policy: policy(),
  });

  assert.match(refusal, /inside the project folder "Atlas"/);
  assert.match(refusal, /Deleting it is still possible/);
});

test('a developer may still move an entry INTO the Trash', () => {
  // A deletion is not a relocation, and the alternative is material nobody can get rid of.
  assert.equal(
    refuseMove({
      moving: entity(),
      from: folder({ name: 'Atlas', projectId: 'p1' }),
      to: folder({ name: 'Trash', isTrash: true }),
      policy: policy(),
    }),
    '',
  );
});

test('a developer may move an entry that is not in a project at all', () => {
  assert.equal(
    refuseMove({ moving: entity(), from: folder({ name: 'Mine' }), to: folder(), policy: policy() }),
    '',
  );
});

test('a developer may not move the project folder itself', () => {
  const refusal = refuseMove({
    moving: folder({ id: 'f2', name: 'Atlas', projectId: 'p1' }),
    to: folder({ name: 'Elsewhere' }),
    policy: policy(),
  });

  assert.match(refusal, /project folder your organisation manages/);
});

test('a member moves whatever they like, project folder or not', () => {
  assert.equal(
    refuseMove({
      moving: entity(),
      from: folder({ name: 'Atlas', projectId: 'p1' }),
      to: folder(),
      policy: MEMBER,
    }),
    '',
  );
});

test('a personal account has no policy and is not fenced', () => {
  assert.equal(
    refuseMove({ moving: entity(), from: folder({ name: 'Atlas', projectId: 'p1' }), to: folder() }),
    '',
  );
});

test('a corporate account whose policy could not be read is fenced, not exempted', () => {
  // MOST_RESTRICTIVE_POLICY arrives here as moveOutOfProject: false, so an unreadable document is a
  // refusal rather than an absence — the reasoning corpExits already records.
  const unread = policy({ policyFromServer: false, policy: { export: false, share: 'none', moveOutOfProject: false } });

  assert.match(
    refuseMove({ moving: entity(), from: folder({ name: 'Atlas', projectId: 'p1' }), to: folder(), policy: unread }),
    /does not allow moving entries out of a project/,
  );
});

test('the kind rule is checked before the project rule, so the more specific sentence wins', () => {
  const refusal = refuseMove({
    moving: entity(),
    from: folder({ name: 'Atlas', projectId: 'p1' }),
    to: folder({ name: 'Keys', folderType: 'sshkey' }),
    policy: policy(),
  });

  assert.match(refusal, /holds only sshkey entities/);
});

// ----- the helper both call sites use -----

test('parentFolderOf answers nothing at the root and the folder otherwise', () => {
  const parent = folder({ id: 'f9', name: 'Atlas' });
  const storage = { getNode: (_a: string, id: string) => (id === 'f9' ? parent : undefined) };

  assert.equal(parentFolderOf(storage, 'acct', entity({ parentId: null })), undefined);
  assert.equal(parentFolderOf(storage, 'acct', entity({ parentId: undefined })), undefined);
  assert.equal(parentFolderOf(storage, 'acct', entity({ parentId: 'f9' })), parent);
});
