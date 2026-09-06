import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { SHARE_FORMAT_PROJECT, SHARE_FORMAT_SERVER, openShare } from '../shareFormat';
import { deliverToRecipient, formWithProject, projectsOfPayloads, refuseForRecipient } from '../shareDelivery';
import { SharePayload, ShareItem, StoredAccount, TeamMember, TreeNode } from '../types';

const ATLAS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const sender: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };

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

function recipient(over: Partial<TeamMember> = {}): TeamMember {
  return {
    account: { accountId: 'bob@example.com', email: 'bob@example.com', provider: 'microsoft' },
    location: 'https://vault.example.com',
    shareKeyId: 'bob@example.com',
    isSelf: false,
    ...over,
  };
}

function payload(name: string, parentId: string | null): SharePayload {
  return {
    node: {
      id: `id-${name}`,
      name,
      type: 'entity',
      parentId,
      details: { id: `id-${name}`, name, isSshEnabled: false, isDb: true, dbType: 'mysql' },
    },
    secrets: { dbConnection: 'mysql://u:p@h/db' },
  };
}

const tree: Record<string, TreeNode> = {
  'folder-atlas': { id: 'folder-atlas', name: 'Atlas', type: 'folder', parentId: null, projectId: ATLAS },
  'folder-sub': { id: 'folder-sub', name: 'keys', type: 'folder', parentId: 'folder-atlas' },
  'folder-mine': { id: 'folder-mine', name: 'Mine', type: 'folder', parentId: null },
};

const getNode = (id: string): TreeNode | undefined => tree[id];

test('an entity inherits the project of the folder above it, however deep', () => {
  const found = projectsOfPayloads(
    [payload('a', 'folder-atlas'), payload('b', 'folder-sub'), payload('c', 'folder-mine'), payload('d', null)],
    getNode,
  );

  assert.deepEqual(found, [ATLAS, ATLAS, undefined, undefined]);
});

test('the project form is chosen only inside the server family, and only with a project', () => {
  assert.equal(formWithProject('server', ATLAS), 'project');
  assert.equal(formWithProject('server', undefined), 'server');
  assert.equal(formWithProject('server', ''), 'server');
  // A folder or a git remote keeps its own family whatever the entity sits in.
  assert.equal(formWithProject('bound', ATLAS), 'bound');
  assert.equal(formWithProject('legacy', ATLAS), 'legacy');
});

test('a developer sharing from outside a project is refused before anything is sealed', async () => {
  let appended = 0;
  const outcome = await deliverToRecipient(
    { sharing: { appendShares: async () => void (appended += 1) }, policyOf: () => policy() },
    { sender, recipient: recipient(), pin: '1234', form: 'server' },
    [payload('a', 'folder-mine')],
    [undefined],
  );

  assert.equal(outcome.ok, false);
  assert.match(outcome.line, /only from inside a project folder/);
  assert.equal(appended, 0, 'nothing was sealed and nothing was sent');
});

test('a developer sharing inside their project seals the project form and delivers', async () => {
  const sent: ShareItem[] = [];
  const outcome = await deliverToRecipient(
    {
      sharing: { appendShares: async (_s, _r, items) => void sent.push(...items) },
      policyOf: () => policy(),
    },
    { sender, recipient: recipient({ projectIds: [ATLAS] }), pin: '1234', form: 'server' },
    [payload('a', 'folder-atlas')],
    [ATLAS],
  );

  assert.equal(outcome.ok, true);
  assert.equal(sent[0].format, SHARE_FORMAT_PROJECT);
  assert.equal(sent[0].projectId, ATLAS);
  assert.equal(openShare(sent[0], 'bob@example.com', '1234', '0.0.0', true).node.name, 'a');
});

test('a member sharing the same entity gets the ordinary server form', async () => {
  const sent: ShareItem[] = [];
  const member = policy({ role: 'member', policy: { export: true, share: 'any', moveOutOfProject: true } });
  await deliverToRecipient(
    {
      sharing: { appendShares: async (_s, _r, items) => void sent.push(...items) },
      policyOf: () => member,
    },
    { sender, recipient: recipient(), pin: '1234', form: 'server' },
    [payload('a', 'folder-mine')],
    [undefined],
  );

  assert.equal(sent[0].format, SHARE_FORMAT_SERVER);
  assert.equal(sent[0].projectId, undefined);
});

test('a recipient the client can see is off the project is refused with a sentence, not an error', async () => {
  const outcome = await deliverToRecipient(
    { sharing: { appendShares: async () => undefined }, policyOf: () => policy() },
    { sender, recipient: recipient({ projectIds: [OTHER] }), pin: '1234', form: 'server' },
    [payload('a', 'folder-atlas')],
    [ATLAS],
  );

  assert.equal(outcome.ok, false);
  assert.match(outcome.line, /not on this project/);
});

test('a transport failure comes back as a failed line, never as a throw', async () => {
  const outcome = await deliverToRecipient(
    {
      sharing: {
        appendShares: async () => {
          throw new Error('the server said no');
        },
      },
      policyOf: () => undefined,
    },
    { sender, recipient: recipient(), pin: '1234', form: 'server' },
    [payload('a', 'folder-mine')],
    [undefined],
  );

  assert.equal(outcome.ok, false);
  assert.match(outcome.line, /the server said no/);
});

test('the first refusal wins when several entities are going at once', () => {
  // They all say the same thing when a developer is sharing out of the wrong place, and the person
  // needs to know what to do, not how many rows agree.
  const refusal = refuseForRecipient(policy(), [ATLAS], [ATLAS, undefined, ATLAS]);

  assert.match(refusal, /only from inside a project folder/);
});
