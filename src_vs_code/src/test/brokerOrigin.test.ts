import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { admitsRequest } from '../brokerOrigin';

/**
 * The broker's door, decided on headers alone.
 *
 * <p>Two jobs, and which check does which is the thing to keep straight — the review gate caught the
 * plan for this change getting it backwards. `Origin` closes the ordinary cross-origin POST: a page
 * can send one without a preflight (a simple request), and the alias door needs no token, so a page
 * the person merely visits could raise a consent dialog in their VS Code. `Host` closes DNS
 * REBINDING, which `Origin` cannot: a browser omits `Origin` on a same-origin GET, and after a
 * rebind the page IS same-origin — but it still sends the name it was loaded from, which is the
 * attacker's.</p>
 */

const AT = { port: 4123 };
function admitted(headers: Record<string, unknown>): boolean {
  return admitsRequest(headers as never, AT) === undefined;
}

test('a real client on this port is admitted', () => {
  // What agentCli.ts and BrokerClient.cs compose: http://127.0.0.1:<port>.
  assert.ok(admitted({ host: '127.0.0.1:4123' }));
  assert.ok(admitted({ host: 'localhost:4123' }));
  assert.ok(admitted({ host: 'LOCALHOST:4123' }), 'a hostname is case-insensitive');
  assert.ok(admitted({ host: '[::1]:4123' }));
  // Brackets are stripped before the comparison: a reviewer asked whether every runtime's `URL`
  // hands back `[::1]` or `::1` from `hostname`, and comparing the bare address removes the question.
  assert.ok(admitted({ host: '::1:4123' }) === false, 'an unbracketed IPv6 host is not a valid Host anyway');
});

test('a rebound page is refused by its Host, with no Origin anywhere in sight', () => {
  // The case `Origin` cannot catch. The attacker's hostname re-resolves to 127.0.0.1, the page is
  // same-origin with us, the browser sends no Origin on its GET — and sends the name it loaded from.
  assert.ok(!admitted({ host: 'evil.example:4123' }));
  assert.ok(!admitted({ host: 'creds.attacker.test:4123' }));
  assert.ok(!admitted({ host: 'localhost.attacker.test:4123' }), 'a suffix is not a match');
});

test('a Host on the wrong port is refused, including the one with no port at all', () => {
  // A browser sends the port it connected to, so a mismatch never comes from a page that reached us.
  // `Host: localhost` means port 80, and nothing of ours listens there.
  assert.ok(!admitted({ host: '127.0.0.1:8080' }));
  assert.ok(!admitted({ host: 'localhost' }));
  assert.ok(!admitted({ host: '127.0.0.1' }));
});

test('a malformed or absent Host is refused rather than parsed hopefully', () => {
  assert.ok(!admitted({}));
  assert.ok(!admitted({ host: '' }));
  assert.ok(!admitted({ host: '127.0.0.1:evil' }));
  assert.ok(!admitted({ host: '  ' }));
});

test('any Origin at all is refused — presence, not truthiness', () => {
  // `Origin:` with an empty value is a header a browser sent, and '' is falsy. A truthiness check
  // would route it.
  assert.ok(!admitted({ host: '127.0.0.1:4123', origin: 'http://evil.example' }));
  assert.ok(!admitted({ host: '127.0.0.1:4123', origin: 'null' }));
  assert.ok(!admitted({ host: '127.0.0.1:4123', origin: '' }));
  assert.ok(
    !admitted({ host: '127.0.0.1:4123', origin: 'http://127.0.0.1:4123' }),
    'even our own address: nothing of ours is a page',
  );
});

test('Sec-Fetch-Site refuses every value but "none", and its absence admits', () => {
  // Absence has to admit: no command-line client sends fetch metadata at all, so requiring it would
  // refuse every real caller. `none` is a person typing an address, not a page acting on its own.
  for (const site of ['cross-site', 'same-site', 'same-origin']) {
    assert.ok(!admitted({ host: '127.0.0.1:4123', 'sec-fetch-site': site }), site);
  }
  assert.ok(admitted({ host: '127.0.0.1:4123', 'sec-fetch-site': 'none' }));
  assert.ok(admitted({ host: '127.0.0.1:4123' }));
});

test('a repeated header is read, not ignored', () => {
  // Node collapses repeats, but the type admits an array and a hand-rolled client could produce one.
  assert.ok(!admitted({ host: '127.0.0.1:4123', 'sec-fetch-site': ['cross-site', 'none'] }));
});

test('the refusal says what this is, so a person reading a log knows why', () => {
  const message = admitsRequest({ host: 'evil.example' } as never, AT)?.message ?? '';
  assert.match(message, /not a web service/);
  assert.match(message, /command-line tools/);
});
