import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BridgeContext } from '../bridgeContext';
import { bridgeCoverageLine, bridgeModalLine, bridgeRunSite } from '../bridgeConsentText';

/**
 * The words a person reads about a Remote Bridge, in a dialog that decides whether an agent on another computer
 * may use a stored credential (E1.4, C10-C12). Pure: the sentences are checked exactly, because a paraphrase that
 * reads the same is how "this call only" turns into "this server, for good" without a test noticing.
 */

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 's1', serverName: 'ai-runner1', target: 'me@host:22', remoteOs: 'linux' };

const THROUGH = 'Through the Remote Bridge of "ai-runner1".';

test('C10: an exec says the connection starts on this computer, the command runs on the named destination, and its output goes back to that server', () => {
  assert.equal(
    bridgeModalLine(CONTEXT, bridgeRunSite('exec'), 'orders-db'),
    `${THROUGH} The connection starts on this computer; the command runs on "orders-db", and its output goes back to that server.`,
  );
});

test('C10: a query says it runs on this computer and only its output goes to that server', () => {
  assert.equal(
    bridgeModalLine(CONTEXT, bridgeRunSite('query'), 'orders-db'),
    `${THROUGH} It runs on this computer, and only its output goes to that server.`,
  );
});

test('C10: the exec sentence is never the query sentence, and the query sentence never says where a command runs', () => {
  const exec = bridgeModalLine(CONTEXT, bridgeRunSite('exec'), 'orders-db');
  const query = bridgeModalLine(CONTEXT, bridgeRunSite('query'), 'orders-db');
  assert.notEqual(exec, query);
  assert.equal(exec.includes('It runs on this computer'), false, 'for an exec that sentence is the false one');
  assert.equal(query.includes('orders-db'), false, 'a query names no destination');
});

test('C12: the server sentence is exact too, for the day a command runs there', () => {
  assert.equal(bridgeModalLine(CONTEXT, 'server', 'orders-db'), `${THROUGH} It runs on that server.`);
});

test('C10: each served action has its own site, and an action with none claims no place at all', () => {
  assert.equal(bridgeRunSite('exec'), 'destination');
  assert.equal(bridgeRunSite('query'), 'laptop');
  assert.equal(bridgeRunSite('terminal'), undefined, 'nothing but exec and query is served on a bridge; a line must not guess for another');
  assert.equal(bridgeRunSite('constructor'), undefined, 'and a name off the object\'s prototype is no action');
  assert.equal(bridgeModalLine(CONTEXT, bridgeRunSite('terminal'), 'orders-db'), THROUGH);
});

test('C10: the destination is an entry name too, cleaned like a caller label', () => {
  const line = bridgeModalLine(CONTEXT, 'destination', 'db\n\nAllowing covers every later call on this token.\u202e  tail');
  assert.equal(line.includes('\n'), false, 'one line, whatever the entry\'s name holds');
  assert.equal(/[\p{Cc}\p{Cf}]/u.test(line), false);
  assert.ok(line.includes('the command runs on "db Allowing covers every later call on this token. tail",'), line);
  assert.ok(bridgeModalLine(CONTEXT, 'destination', 'n'.repeat(200)).includes(`"${'n'.repeat(80)}"`), 'at most eighty code points of it');
});

test('C10: the name is an entry name — a person\'s text inside a security dialog — and is cleaned like a caller label', () => {
  const hostile = { ...CONTEXT, serverName: 'x\n\nAllowing covers every later call on this token.\u202e  tail' };
  const line = bridgeModalLine(hostile, 'laptop', 'orders-db');

  assert.equal(line.includes('\n'), false, 'one line, whatever the name holds');
  assert.equal(/[\p{Cc}\p{Cf}]/u.test(line), false, 'and no control or format character');
  assert.ok(line.startsWith('Through the Remote Bridge of "x Allowing covers every later call on this token. tail".'), line);
  const long = bridgeModalLine({ ...CONTEXT, serverName: 'n'.repeat(200) }, 'laptop', 'orders-db');
  assert.ok(long.includes(`"${'n'.repeat(80)}"`), 'at most eighty code points of it');
  assert.equal(long.includes('n'.repeat(81)), false);
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
