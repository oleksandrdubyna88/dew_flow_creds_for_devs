import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { BRIDGE_KEY_HEADER } from '../bridgeNote';
import { BRIDGE_NO_KEY, BRIDGE_WRONG_KEY, admitsBridgeRequest } from '../brokerOrigin';

/**
 * The third door, decided on headers alone (E1.2, scenarios D1, D2, D16 and the break-its K1, K2, K7, K12).
 *
 * <p>`<bp>` is the bridge's port, `<mp>` the main broker's. The same table is run again over real HTTP in
 * `brokerBridgeListeners.test.ts`; this file is the decision, with nothing listening.</p>
 */

const BP = 4123;
const MP = 5000;
const KEY = 'Qm9ndXMta2V5LWZvci10aGUtdGVzdHMtMDEyMzQ1Njc4OTA';
const AT = { port: BP, key: KEY };

type Answer = 'NK' | 'WK' | 'R' | 'ok';

/** Host and browser headers, then the answer for no key, a wrong key, the right key — the E1 door table. */
const TABLE: readonly (readonly [string, Record<string, string>, Answer, Answer, Answer])[] = [
  [`127.0.0.1:${BP}`, {}, 'NK', 'WK', 'ok'],
  [`localhost:${BP}`, {}, 'NK', 'WK', 'ok'],
  [`127.0.0.1:${MP}`, {}, 'NK', 'WK', 'R'],
  ['localhost', {}, 'NK', 'WK', 'R'],
  ['127.0.0.1:1', {}, 'NK', 'WK', 'R'],
  [`evil.example:${BP}`, {}, 'NK', 'WK', 'R'],
  [`127.0.0.1:${BP}`, { origin: 'http://evil.example' }, 'R', 'R', 'R'],
  [`127.0.0.1:${BP}`, { 'sec-fetch-site': 'cross-site' }, 'R', 'R', 'R'],
];

const KEYS: readonly (string | undefined)[] = [undefined, 'not-the-key', KEY];

/** What the door said, as one of the table's four words. */
function wordFor(headers: Record<string, unknown>): Answer {
  const refusal = admitsBridgeRequest(headers as never, AT);
  if (refusal === undefined) {
    return 'ok';
  }
  if (refusal.message === BRIDGE_NO_KEY) {
    assert.equal(refusal.kind, 'key');
    return 'NK';
  }
  if (refusal.message === BRIDGE_WRONG_KEY) {
    assert.equal(refusal.kind, 'key');
    return 'WK';
  }
  assert.match(refusal.message, /not a web service/, 'any other refusal is the browser/Host one');
  assert.equal(refusal.kind, undefined, 'and it has no key note');
  return 'R';
}

function request(host: string, browser: Record<string, string>, key: string | undefined): Record<string, unknown> {
  return { host, ...browser, ...(key === undefined ? {} : { 'x-creds-bridge': key }) };
}

test('D1: the door table, cell by cell', () => {
  for (const [host, browser, ...expected] of TABLE) {
    KEYS.forEach((key, column) => {
      const label = `Host ${host} ${JSON.stringify(browser)} key ${String(key === undefined ? 'absent' : key === KEY ? 'right' : 'wrong')}`;
      assert.equal(wordFor(request(host, browser, key)), expected[column], label);
    });
  }
});

test('D1: the refusal texts are the E1 sentences, verbatim', () => {
  assert.equal(
    BRIDGE_NO_KEY,
    'This is a Remote Bridge listener, and this request carries no bridge key. Update creds on this host: this version cannot use it. Nothing ran.',
  );
  assert.equal(
    BRIDGE_WRONG_KEY,
    'This Remote Bridge listener did not accept that key. The bridge has reconnected or closed. Nothing ran.',
  );
  assert.equal(BRIDGE_KEY_HEADER, 'X-Creds-Bridge');
});

test('D2: key shapes — empty, another length, the last byte, a repeat: all a wrong key, none throws', () => {
  const host = `127.0.0.1:${BP}`;
  const shapes: Record<string, unknown> = {
    empty: '',
    'another length (shorter)': KEY.slice(0, -1),
    'another length (longer)': `${KEY}x`,
    'one byte different': `${KEY.slice(0, -1)}${KEY.endsWith('A') ? 'B' : 'A'}`,
    'twice, as node joins it': `${KEY}, ${KEY}`,
    'twice, as an array': [KEY, KEY],
    'an array of one': [KEY],
    'not a string at all': 42,
  };
  for (const [name, given] of Object.entries(shapes)) {
    assert.equal(wordFor({ host, 'x-creds-bridge': given }), 'WK', name);
  }
});

test('D2: a key with a multi-byte character is compared, not crashed on', () => {
  assert.equal(wordFor({ host: `127.0.0.1:${BP}`, 'x-creds-bridge': 'ключ-Ω' }), 'WK');
});

test('K7: no key is decided before Host — an old creds is told to update, not that it looks like a browser', () => {
  assert.equal(wordFor({ host: '127.0.0.1:1' }), 'NK');
  assert.equal(wordFor({ host: `127.0.0.1:${MP}` }), 'NK');
});

test('K12: a browser mark refuses even the right key', () => {
  assert.equal(wordFor({ host: `127.0.0.1:${BP}`, 'x-creds-bridge': KEY, origin: 'http://evil.example' }), 'R');
  assert.equal(wordFor({ host: `127.0.0.1:${BP}`, 'x-creds-bridge': KEY, 'sec-fetch-site': 'same-origin' }), 'R');
});

test('the key is compared by digest: timingSafeEqual over two SHA-256 digests (checklist pin; no test can time it)', () => {
  // D2 stays green under `===`, so what makes the compare constant-time is pinned in the source. A
  // reviewer-visible control, not proof of timing: the behaviour that CAN be observed (no throw on
  // another length) is D2 above, which fails if the digests are dropped.
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'brokerOrigin.ts'), 'utf8');
  assert.match(source, /timingSafeEqual\(\s*sha256\(/);
  assert.match(source, /createHash\('sha256'\)/);
});
