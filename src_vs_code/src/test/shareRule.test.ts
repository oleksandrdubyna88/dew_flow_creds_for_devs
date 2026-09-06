import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { ClientShareFacts, refuseShare } from '../shareRule';

const ATLAS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const THEIRS = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

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

function facts(over: Partial<ClientShareFacts> = {}): ClientShareFacts {
  return { policy: policy(), entityProjectId: ATLAS, recipientProjectIds: [ATLAS], ...over };
}

test('a personal account is fenced by nothing', () => {
  // `undefined` means no corporate document has ever been seen here — not that a fetch failed.
  assert.equal(refuseShare({ policy: undefined, entityProjectId: undefined }), '');
});

test('a member shares exactly as they did before this epic', () => {
  const member = policy({ role: 'member', policy: { export: true, share: 'any', moveOutOfProject: true } });

  assert.equal(refuseShare(facts({ policy: member, entityProjectId: undefined })), '');
  assert.equal(refuseShare(facts({ policy: member, recipientProjectIds: [] })), '');
});

test('an admin and an officer are not fenced either', () => {
  assert.equal(refuseShare(facts({ policy: policy({ role: 'admin', isAdmin: true }), entityProjectId: undefined })), '');
  assert.equal(refuseShare(facts({ policy: policy({ role: 'member', isOfficer: true }), entityProjectId: undefined })), '');
});

test('a corp server that is off fences nobody', () => {
  assert.equal(refuseShare(facts({ policy: policy({ corpMode: false }), entityProjectId: undefined })), '');
});

test('a developer sharing something outside every project folder is told what to do', () => {
  const refusal = refuseShare(facts({ entityProjectId: undefined }));

  assert.match(refusal, /only from inside a project folder/);
  assert.match(refusal, /ask an administrator/);
});

test('a blank project is no project', () => {
  assert.notEqual(refuseShare(facts({ entityProjectId: '   ' })), '');
});

test('a developer sharing inside their project to somebody on it is offered it', () => {
  assert.equal(refuseShare(facts()), '');
});

test('a developer is not offered a colleague the client can SEE is off the project', () => {
  const refusal = refuseShare(facts({ recipientProjectIds: [THEIRS] }));

  assert.match(refusal, /not on this project/);
});

test('a recipient row that carries no project list at all is not refused', () => {
  // An older server, or a client that claimed no contract. Hiding a colleague who is in fact a valid
  // recipient is a worse failure than showing one the server will refuse with its own sentence — and
  // the server is the boundary either way.
  assert.equal(refuseShare(facts({ recipientProjectIds: undefined })), '');
});

test('an empty recipient project list IS a refusal — it is a fact, not an absence', () => {
  assert.notEqual(refuseShare(facts({ recipientProjectIds: [] })), '');
});

test('every refusal is a sentence a person can act on', () => {
  const refusals = [
    refuseShare(facts({ entityProjectId: undefined })),
    refuseShare(facts({ recipientProjectIds: [THEIRS] })),
  ];

  for (const refusal of refusals) {
    assert.ok(refusal.length > 40, refusal);
    assert.match(refusal, /administrator/);
  }
});
