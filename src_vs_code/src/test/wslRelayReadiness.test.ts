import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ReadinessCheck,
  failed,
  itDidNotAnswer,
  itWorks,
  whatIsMissing,
} from '../wslRelayReadiness';

// Written because an operator had every piece installed and was told only "communication with
// agent failed" by ssh-add. The command said nothing either way, and the real reason was in a log
// nobody had reason to open.

const check = (label: string, ok: boolean): ReadinessCheck => ({ label, ok, fix: `fix ${label}` });

test('everything missing is named at once, not one failure at a time', () => {
  // Someone who has installed neither half should hear that once, rather than discover the
  // second after fixing the first.
  const said = whatIsMissing('Ubuntu', [check('a', false), check('b', true), check('c', false)]);

  assert.match(said, /2 thing\(s\) missing/);
  assert.match(said, /fix a/);
  assert.match(said, /fix c/);
  assert.doesNotMatch(said, /fix b/);
});

test('the distribution is named, because the answer differs per distribution', () => {
  assert.match(whatIsMissing('Ubuntu-26.04', [check('a', false)]), /in Ubuntu-26\.04/);
});

test('success is reported with the fingerprint, not as a claim about our own actions', () => {
  // "Set up successfully" says what we did. A key listed through the socket is the thing the
  // person came for, observed.
  const said = itWorks('Ubuntu', '/run/user/1000/creds-agent.sock', 'SHA256:abc');

  assert.match(said, /SHA256:abc/);
  assert.match(said, /\/run\/user\/1000\/creds-agent\.sock/);
  assert.match(said, /Ubuntu/);
});

test('a relay that runs but does not answer is a DIFFERENT message', () => {
  // Telling someone to install what they already have sends them in a circle.
  const said = itDidNotAnswer('Ubuntu', 'error fetching identities');

  assert.match(said, /did not answer/);
  assert.doesNotMatch(said, /install/i);
  assert.match(said, /Diagnostics/);
});

test('the default distribution has a name a person recognises', () => {
  assert.match(itWorks('', '/run/x.sock', 'SHA256:abc'), /your default distribution/);
  assert.match(itDidNotAnswer('', 'nope'), /your default distribution/);
});

test('failed reports only what failed, in order', () => {
  const checks = [check('one', false), check('two', true), check('three', false)];

  assert.deepEqual(failed(checks).map((c) => c.label), ['one', 'three']);
});
