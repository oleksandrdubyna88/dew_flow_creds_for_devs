import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teamMemberDescription } from '../corpPolicy';

/**
 * What a Team row says about a colleague's projects — the part of epic 3 a person actually sees.
 *
 * <p>The row's job is to name a PERSON; the projects are context. Everything below follows from
 * that: three names then a count, and a count that never lies about how many there are.</p>
 */

test('a row with no role and no projects is the provider alone, exactly as before this epic', () => {
  assert.equal(teamMemberDescription('microsoft', undefined), 'microsoft');
  assert.equal(teamMemberDescription('microsoft', undefined, []), 'microsoft');
});

test('a role alone reads as it did before projects existed', () => {
  assert.equal(teamMemberDescription('microsoft', 'dev'), 'microsoft · dev');
});

test('one project is named', () => {
  assert.equal(teamMemberDescription('microsoft', 'dev', ['Atlas']), 'microsoft · dev · Atlas');
});

test('three projects are all named', () => {
  assert.equal(
    teamMemberDescription('google', 'member', ['Atlas', 'Borealis', 'Cygnus']),
    'google · member · Atlas, Borealis, Cygnus',
  );
});

test('a fourth becomes a count, so the email keeps its room', () => {
  assert.equal(
    teamMemberDescription('google', 'member', ['Atlas', 'Borealis', 'Cygnus', 'Draco']),
    'google · member · Atlas, Borealis, Cygnus +1',
  );
});

test('a project the list cannot name is COUNTED, never dropped', () => {
  // The count has to stay true: a row must not tell somebody they are on fewer projects than they
  // are. An unnamed id happens while the list is still being read, and on a project archived out
  // from under a cached answer.
  assert.equal(
    teamMemberDescription('microsoft', 'dev', ['Atlas', '', 'Cygnus']),
    'microsoft · dev · Atlas, Cygnus +1',
  );
});

test('when nothing can be named, the row says how many there are rather than nothing at all', () => {
  assert.equal(teamMemberDescription('microsoft', 'dev', ['', '']), 'microsoft · dev · 2 projects');
});

test('nine projects with one unnamed reads +6, not +5', () => {
  // The case the code round named: three shown, six left — including the one nothing could name.
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', ''];

  assert.equal(teamMemberDescription('microsoft', 'dev', ids), 'microsoft · dev · A, B, C +6');
});

test('projects without a role still read cleanly', () => {
  // An officer on a server whose roster this window may not read: no role to show, projects yes.
  assert.equal(teamMemberDescription('microsoft', undefined, ['Atlas']), 'microsoft · Atlas');
});
