import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnoseTeamFailure, teamFailureIsActionable } from '../teamDiagnosis';

/**
 * The field report this exists for: developers signed in, set the server URL,
 * pressed Sync, saw no error, and never appeared in each other's Team. The
 * server had been answering 401 the whole time — `listTeam` swallowed it and
 * returned an empty list, which looks exactly like a team nobody has joined yet.
 */

const failure = (over: Partial<Parameters<typeof diagnoseTeamFailure>[0]> = {}) => ({
  status: 401,
  hasApiScope: false,
  provider: 'microsoft',
  ...over,
});

test('the Microsoft-without-a-scope case is named exactly, because it is the one we cause ourselves', () => {
  // Without the scope the extension asks for user.read, which mints a Graph
  // token. Microsoft makes those unverifiable by third parties, so no server can
  // ever accept one — this is not a guess about the operator's configuration.
  const message = diagnoseTeamFailure(failure());

  assert.match(message, /microsoftApiScope/);
  assert.match(message, /api:\/\/<client-id>\/vault\.access/);
  assert.match(message, /Graph/);
  assert.match(message, /MS_AUDIENCES/);
});

test('a refusal WITH the scope set does not blame the scope', () => {
  // Repeating advice the person has already followed is how a message loses
  // credibility for the next reader.
  const message = diagnoseTeamFailure(failure({ hasApiScope: true }));

  assert.doesNotMatch(message, /microsoftApiScope/);
  assert.match(message, /different audience|allowed list/);
});

test('Google gets the general refusal, not the Microsoft explanation', () => {
  const message = diagnoseTeamFailure(failure({ provider: 'google' }));

  assert.doesNotMatch(message, /Graph/);
  assert.match(message, /refused this sign-in/);
});

test('no answer at all points at the URL, not at the sign-in', () => {
  const message = diagnoseTeamFailure(failure({ status: undefined }));

  assert.match(message, /did not answer/);
  assert.match(message, /Set Sync Location/);
});

test('an unexpected status says what it was and that the vault is fine', () => {
  const message = diagnoseTeamFailure(failure({ status: 503 }));

  assert.match(message, /503/);
  assert.match(message, /Nothing is wrong with your vault/);
});

test('only a refusal is worth interrupting somebody over', () => {
  // A modal for every transient hiccup is how people learn to dismiss modals,
  // and then the one that matters arrives after the habit is formed.
  assert.equal(teamFailureIsActionable(failure({ status: 401 })), true);
  assert.equal(teamFailureIsActionable(failure({ status: 403 })), true);

  assert.equal(teamFailureIsActionable(failure({ status: 429 })), false);
  assert.equal(teamFailureIsActionable(failure({ status: 503 })), false);
  assert.equal(teamFailureIsActionable(failure({ status: undefined })), false);
});
