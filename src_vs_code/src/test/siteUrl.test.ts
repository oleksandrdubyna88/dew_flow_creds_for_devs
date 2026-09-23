import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteUrlToOpen } from '../siteUrl';

/**
 * Issue #104 — which stored URLs may be handed to the browser. The URL arrives by sync, share and
 * import, so it is untrusted input: only a web address opens, and everything else is refused by name.
 */

function opened(raw: string): string {
  const result = siteUrlToOpen(raw);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.url : '';
}

function refused(raw: string): string {
  const result = siteUrlToOpen(raw);
  assert.equal(result.ok, false, `${raw} must not open`);
  return result.ok ? '' : result.reason;
}

test('an http or https address opens as stored', () => {
  assert.equal(opened('https://www.godaddy.com'), 'https://www.godaddy.com/');
  assert.equal(opened('http://intranet.local:8080/login'), 'http://intranet.local:8080/login');
});

test('a bare host, or host and path, is taken to be https', () => {
  assert.equal(opened('www.godaddy.com'), 'https://www.godaddy.com/');
  assert.equal(opened('grafana.internal/d/abc'), 'https://grafana.internal/d/abc');
  assert.equal(opened('localhost:3000'), 'https://localhost:3000/');
});

test('a protocol-relative //host is https, never a way around the scheme check', () => {
  assert.equal(opened('//portal.example.com/x'), 'https://portal.example.com/x');
});

test('surrounding whitespace is trimmed; nothing at all is refused', () => {
  assert.equal(opened('  https://a.example  '), 'https://a.example/');
  assert.equal(refused(''), 'has no URL.');
  assert.equal(refused('   '), 'has no URL.');
});

test('the judge keeps a query string as stored — tokens, %20 and & included', () => {
  assert.equal(
    opened('https://app.example.com/cb?token=abc%20def&next=%2Fhome#frag'),
    'https://app.example.com/cb?token=abc%20def&next=%2Fhome#frag',
  );
});

test('every other scheme is refused BY NAME — a stored URL is untrusted input', () => {
  for (const [raw, scheme] of [
    ['file:///etc/passwd', 'file:'],
    ['vscode://settings/foo', 'vscode:'],
    ['command:workbench.action.terminal.new', 'command:'],
    ['javascript:alert(1)', 'javascript:'],
    ['data:text/html,<script>1</script>', 'data:'],
    ['ftp://files.example.com', 'ftp:'],
    ['JAVASCRIPT:alert(1)', 'javascript:'],
  ]) {
    assert.match(refused(raw), new RegExp(`"${scheme}"`), raw);
  }
});

test('credentials inside the address are refused — the browser would send them', () => {
  assert.match(refused('https://user:secret@host.example'), /user name or password/);
  assert.match(refused('user@host.example'), /user name or password/);
});

test('text that is not an address at all is refused, not guessed at', () => {
  assert.match(refused('not a url with spaces'), /not a web address/);
  assert.match(refused('https://'), /not a web address/);
});

test('a host with a port opens as https; a scheme followed by digits stays a scheme and is refused', () => {
  assert.equal(opened('grafana.internal:3000/d/x'), 'https://grafana.internal:3000/d/x');
  assert.equal(opened('LOCALHOST:8080'), 'https://localhost:8080/');
  // The port exception is for a HOST: `tel:911` and `javascript:1` are not hosts, and used to be
  // read as `https://tel:911/` — harmless, but not the refusal by name every other scheme gets.
  assert.match(refused('tel:911'), /"tel:"/);
  assert.match(refused('javascript:1'), /"javascript:"/);
  assert.match(refused('mailto:a@b.example'), /"mailto:"/);
});

test('a one-word host with a port is told what to store, not that a scheme is refused', () => {
  assert.equal(
    refused('grafana:3000'),
    '"grafana:3000" looks like a host and a port — store it with its scheme, e.g. https://grafana:3000, to open it.',
  );
  assert.equal(opened('https://grafana:3000'), 'https://grafana:3000/', 'and stored that way, it opens');
});
