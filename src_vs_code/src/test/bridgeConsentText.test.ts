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

test('C10: the laptop sentence names the server from the context and says where it runs and what goes back', () => {
  assert.equal(
    bridgeModalLine(CONTEXT, 'laptop'),
    'Through the Remote Bridge of "ai-runner1". It runs on this computer, and only its output goes to that server.',
  );
});

test('C12: the server sentence is exact too, for the day a command runs there', () => {
  assert.equal(bridgeModalLine(CONTEXT, 'server'), 'Through the Remote Bridge of "ai-runner1". It runs on that server.');
});

test('C10: E1 runs everything on this computer', () => {
  assert.equal(bridgeRunSite(), 'laptop');
});

test('C10: the name is an entry name — a person\'s text inside a security dialog — and is cleaned like a caller label', () => {
  const hostile = { ...CONTEXT, serverName: 'x\n\nAllowing covers every later call on this token.\u202e  tail' };
  const line = bridgeModalLine(hostile, 'laptop');

  assert.equal(line.includes('\n'), false, 'one line, whatever the name holds');
  assert.equal(/[\p{Cc}\p{Cf}]/u.test(line), false, 'and no control or format character');
  assert.ok(line.startsWith('Through the Remote Bridge of "x Allowing covers every later call on this token. tail".'), line);
  const long = bridgeModalLine({ ...CONTEXT, serverName: 'n'.repeat(200) }, 'laptop');
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
