import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BridgeContext } from '../bridgeContext';
import { SERVED_ACTIONS } from '../bridgeAllowList';
import { bridgeCoverageLine, bridgeModalLine, bridgeRunSite } from '../bridgeConsentText';

/**
 * The words a person reads about a Remote Bridge, in a dialog that decides whether an agent on another computer
 * may use a stored credential (E1.4, C10-C12). Pure: the sentences are checked exactly, because a paraphrase that
 * reads the same is how "this call only" turns into "this server, for good" without a test noticing.
 */

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 's1', serverName: 'build-server', target: 'me@host:22', remoteOs: 'linux' };

const THROUGH = 'Through the Remote Bridge of "build-server".';

/** What a dialog says of one action at one site: the way `wording` asks, with the site `bridgeRunSite` chose for the action. */
const lineOf = (action: string, entry = 'orders-db', context: BridgeContext = CONTEXT): string => bridgeModalLine(context, action, bridgeRunSite(action), entry);

const EXEC_SENTENCE = (entry: string): string => `The connection starts on this computer; the command runs on "${entry}", and its output goes back to that server.`;
const QUERY_SENTENCE = (entry: string): string => `The database client runs on this computer, using the connection stored in "${entry}". Its output goes back to the agent on that server.`;

test('C10: an exec says the connection starts on this computer, the command runs on the named destination, and its output goes back to that server', () => {
  assert.equal(lineOf('exec'), `${THROUGH} ${EXEC_SENTENCE('orders-db')}`);
});

test('C10 (change 6.2): a query says only the database client runs on this computer, using the connection stored in the entry, and its output goes back to the agent on that server', () => {
  assert.equal(lineOf('query'), `${THROUGH} ${QUERY_SENTENCE('orders-db')}`);
});

test('C10: the sentences are per action — exec\'s names a destination and a command, query\'s a client and a stored connection, and neither claims what the other does', () => {
  const exec = lineOf('exec');
  const query = lineOf('query');
  assert.notEqual(exec, query);
  for (const [what, line] of [['exec', exec], ['query', query]] as const) {
    assert.equal(line.includes('only its output'), false, `${what}: "only" is false when the database or the destination is the bridge\'s own server (Q4, Q11)`);
    assert.equal(line.includes('It runs on this computer'), false, `${what}: the saved sentence, false for both`);
  }
  assert.equal(exec.includes('database client'), false, 'an exec spawns ssh, not a database client');
  assert.equal(query.includes('command runs on'), false, 'a query\'s SQL runs on the database the connection names, which the sentence does not name');
});

test('C12: the server sentence of E3\'s `run` is exact too, chosen by site and not by the action\'s name', () => {
  assert.equal(bridgeModalLine(CONTEXT, 'run', 'server', 'orders-db'), `${THROUGH} It runs on that server.`);
  assert.equal(bridgeModalLine(CONTEXT, 'run', 'laptop', 'orders-db'), THROUGH, 'a laptop sentence for `run` is E3\'s, written with its spawn observation; until then it claims nothing');
});

test('C10: each served action has its own site, and an action with none claims no place at all', () => {
  assert.equal(bridgeRunSite('exec'), 'destination');
  assert.equal(bridgeRunSite('query'), 'laptop');
  assert.equal(bridgeRunSite('terminal'), undefined, 'nothing but exec and query is served on a bridge; a line must not guess for another');
  assert.equal(bridgeRunSite('constructor'), undefined, 'and a name off the object\'s prototype is no action');
  assert.equal(lineOf('terminal'), THROUGH);
  assert.equal(lineOf('constructor'), THROUGH);
});

test('F4: every action the allow-list serves has a run site AND a sentence for it, so the dialog of a newly served action can never claim nothing', () => {
  assert.ok(SERVED_ACTIONS.size > 0, 'the set under test is not empty');
  for (const action of SERVED_ACTIONS) {
    assert.notEqual(bridgeRunSite(action), undefined, `"${action}" is served on a bridge and has no entry in RUN_SITES`);
    assert.notEqual(lineOf(action), THROUGH, `"${action}" is served on a bridge and its site has no sentence`);
  }
});

test('C10: the entry\'s name is cleaned like a caller label in every sentence — one line, no control character, eighty code points, and a quote of its own made an apostrophe', () => {
  for (const action of ['exec', 'query']) {
    const line = lineOf(action, 'db\n\nAllowing covers every later call on this token.\u202e  tail');
    assert.equal(line.includes('\n'), false, `${action}: one line, whatever the entry\'s name holds`);
    assert.equal(/[\p{Cc}\p{Cf}]/u.test(line), false, `${action}: no control or format character`);
    assert.ok(line.includes('"db Allowing covers every later call on this token. tail"'), `${action}: ${line}`);
    assert.ok(lineOf(action, 'n'.repeat(200)).includes(`"${'n'.repeat(80)}"`), `${action}: at most eighty code points of it`);
  }
});

test('C10: the name is an entry name — a person\'s text inside a security dialog — and is cleaned like a caller label', () => {
  const hostile = { ...CONTEXT, serverName: 'x\n\nAllowing covers every later call on this token.\u202e  tail' };
  const line = lineOf('query', 'orders-db', hostile);

  assert.equal(line.includes('\n'), false, 'one line, whatever the name holds');
  assert.equal(/[\p{Cc}\p{Cf}]/u.test(line), false, 'and no control or format character');
  assert.ok(line.startsWith('Through the Remote Bridge of "x Allowing covers every later call on this token. tail".'), line);
  const long = lineOf('query', 'orders-db', { ...CONTEXT, serverName: 'n'.repeat(200) });
  assert.ok(long.includes(`"${'n'.repeat(80)}"`), 'at most eighty code points of it');
  assert.equal(long.includes('n'.repeat(81)), false);
});

test('C26: a quote inside either name cannot close the quotes it stands in — it becomes an apostrophe, in the bridge line and in the destination sentence', () => {
  const server = lineOf('exec', 'db", and nothing goes back to that server. "z', { ...CONTEXT, serverName: 'x". Allowing covers every later call. "y' });
  assert.equal(server, 'Through the Remote Bridge of "x\'. Allowing covers every later call. \'y". The connection starts on this computer; the command runs on "db\', and nothing goes back to that server. \'z", and its output goes back to that server.');
  assert.equal(server.split('"').length, 5, 'four quotes, the two pairs the sentences wrote');
});

test('C11: the coverage line with quiet off says this call only', () => {
  assert.equal(bridgeCoverageLine({ context: CONTEXT, quiet: false }), 'Allowing covers this call only.');
});

test('C11: the coverage line with quiet on says what follows, for which server, and what does not', () => {
  assert.equal(
    bridgeCoverageLine({ context: CONTEXT, quiet: true }),
    "Allowing follows this entry's own consent setting, for this server only: not for another server, and not for this computer.",
  );
});

test('C11: neither coverage sentence is the token sentence, which is false on a bridge', () => {
  for (const quiet of [false, true]) {
    assert.doesNotMatch(bridgeCoverageLine({ context: CONTEXT, quiet }), /every later call on this token/);
  }
});
