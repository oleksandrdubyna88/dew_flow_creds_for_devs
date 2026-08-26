import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { ENTITY_KINDS, EntityMetadata } from '../types';
import type { EntityFormOptions } from '../entityFormPanel';

/**
 * The entity form's markup (audit A3, covering what A1's split produced).
 *
 * <p>This module turns options into HTML and never learns what a message means, which makes
 * it the one place in the form where a secret would have to be INTERPOLATED to leak. That is
 * the discipline worth pinning: the stored password, private key, VPN config, notes and TOTP
 * seed are never written into the page — an empty field means "keep", a checkbox clears — and
 * the DB connection string is the single deliberate exception, so it stays genuinely
 * editable. A test that only checked "the field is present" would pass either way.</p>
 *
 * <p>There is a second guard underneath, found while proving these tests bite: `EntityMetadata`
 * has no `password`, `privateKey` or `vpnConfig` property at all, so interpolating one does not
 * compile. Writing the leak took an `as unknown as` cast in the fixtures below. The type is the
 * stronger of the two guarantees — but it protects only the fields it knows about, and it says
 * nothing about `initialDbConnection`, `initialNotes` or a future option, which is what these
 * tests are for.</p>
 *
 * <p>The kind selector is pinned for a recorded reason: it was once a hand-written copy of
 * the kind list, so when `script` was added the selector kept offering six. With no option
 * matching, a browser shows the FIRST — and creating an entity inside a script folder
 * announced itself as a Credential.</p>
 */

function options(overrides: Partial<EntityFormOptions> = {}): EntityFormOptions {
  return {
    mode: 'create',
    entityId: 'e1',
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    ...overrides,
  } as EntityFormOptions;
}

const SECRET = 'hunter2-SUPER-SECRET-VALUE';

test('a stored password is NEVER written into the page — only the fact that one exists', () => {
  // The whole discipline. An empty field means "keep"; the value stays in the vault.
  const html = renderHtml(
    options({
      mode: 'edit',
      hasStoredPassword: true,
      initial: { id: 'e1', name: 'prod', kind: 'credential', password: SECRET } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes(SECRET), 'the secret reached the page');
  assert.match(html, /id="password"/, 'the field is still there to type a new one into');
});

test('a stored private key is never written into the page either', () => {
  const html = renderHtml(
    options({
      mode: 'edit',
      hasStoredPrivateKey: true,
      initial: { id: 'e1', name: 'k', kind: 'sshkey', privateKey: SECRET } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes(SECRET));
  assert.match(html, /<textarea id="privateKey"/);
});

test('a stored VPN config is never written into the page', () => {
  const html = renderHtml(
    options({
      mode: 'edit',
      hasStoredVpnConfig: true,
      initial: { id: 'e1', name: 'v', kind: 'vpn', vpnConfig: SECRET } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes(SECRET));
});

test('the DB connection string IS prefilled — the one deliberate exception', () => {
  // Stated as a test rather than a comment, because it is the exception a later reader would
  // otherwise "fix" into consistency and make the field uneditable.
  const connection = 'postgresql://me:hunter2@db.corp.com:5432/app';
  const html = renderHtml(
    options({ mode: 'edit', hasStoredDbConnection: true, initialDbConnection: connection }),
  );

  assert.ok(html.includes(connection), 'otherwise it cannot be edited, only replaced blind');
});

test('a stored TOTP seed is never sent — only how it is configured', () => {
  // The description exists so the person can compare it against their authenticator app
  // WITHOUT the seed leaving the vault.
  const html = renderHtml(
    options({
      mode: 'edit',
      hasStoredTotp: true,
      storedTotpDescription: 'GitHub · 6 digits · SHA1 · every 30 s',
      initial: { id: 'e1', name: 't', kind: 'credential', totpSecret: SECRET } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes(SECRET));
  assert.match(html, /6 digits/);
});

test('EVERY entity kind is offered — the selector is built from the list, not retyped', () => {
  // The `script` defect: a hand-written copy kept offering six kinds, and a browser with no
  // matching option shows the first, so a script entity announced itself as a Credential.
  const html = renderHtml(options());

  for (const kind of ENTITY_KINDS) {
    assert.ok(html.includes(`<option value="${kind}"`), `${kind} is offered`);
  }
});

test('the kind the folder dictates is the one selected', () => {
  const html = renderHtml(options({ lockedKind: 'ssh' } as Partial<EntityFormOptions>));

  assert.match(html, /<option value="ssh" selected>/);
});

test('an entity name containing markup is ESCAPED, not rendered', () => {
  // The name comes from a synced vault, so it is not necessarily this person's own text.
  const html = renderHtml(
    options({
      mode: 'edit',
      initial: { id: 'e1', name: '<script>alert(1)</script>', kind: 'credential' } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes('<script>alert(1)</script>'), 'the tag survived into the page');
  assert.ok(html.includes('&lt;script&gt;'), 'it is shown as text');
});

test('a quote in a field value cannot break out of its attribute', () => {
  // `value="…"` is where an unescaped quote turns a name into an event handler.
  const html = renderHtml(
    options({
      mode: 'edit',
      initial: { id: 'e1', name: 'x" onload="alert(1)', kind: 'credential' } as unknown as EntityMetadata,
    }),
  );

  assert.ok(!html.includes('onload="alert(1)"'), html.slice(0, 200));
});

test('the page carries a CSP that allows only its OWN nonced script', () => {
  const html = renderHtml(options());

  const csp = /content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-([A-Za-z0-9_-]+)';"/.exec(html);
  assert.ok(csp !== null, 'the policy is present');
  assert.ok(html.includes(`nonce="${csp[1]}"`), 'and the one script tag carries that nonce');
});

test('every render gets a FRESH nonce', () => {
  // A reused nonce is not a nonce; it would let a cached or injected script from an earlier
  // render execute in a later one.
  const first = /nonce-([A-Za-z0-9_-]+)/.exec(renderHtml(options()));
  const second = /nonce-([A-Za-z0-9_-]+)/.exec(renderHtml(options()));

  assert.notEqual(first?.[1], second?.[1]);
});

test('there is no unnonced inline script anywhere in the page', () => {
  // One `<script>` without the nonce is a CSP that silently does nothing.
  const html = renderHtml(options());

  const scripts = html.match(/<script[^>]*>/g) ?? [];
  assert.ok(scripts.length > 0, 'the page does have a script');
  for (const tag of scripts) {
    assert.match(tag, /nonce="/, tag);
  }
});

test('an editable entity offers "Keep as is" for its lifetime; a new one does not', () => {
  // Re-saving an entity must not silently reset an expiry the person set earlier.
  const expiring = renderHtml(
    options({
      mode: 'edit',
      initial: { id: 'e1', name: 'x', kind: 'credential', expiresAt: Date.now() + 86_400_000 } as unknown as EntityMetadata,
    }),
  );
  const fresh = renderHtml(options());

  assert.match(expiring, /Keep as is/);
  assert.ok(!fresh.includes('Keep as is'), 'nothing to keep on a new entity');
});

test('a create form and an edit form are distinguishable', () => {
  const created = renderHtml(options({ mode: 'create' }));
  const edited = renderHtml(options({ mode: 'edit', entityId: 'e1' }));

  assert.notEqual(created.length, edited.length);
});

test('a vpn config file name is shown so the person knows what is being replaced', () => {
  const html = renderHtml(
    options({
      mode: 'edit',
      hasStoredVpnConfig: true,
      initial: { id: 'e1', name: 'v', kind: 'vpn', vpnConfigFileName: 'office.ovpn' } as unknown as EntityMetadata,
    }),
  );

  assert.match(html, /office\.ovpn/);
});

test('an entity with no details at all still renders a usable form', () => {
  // The create path passes no initial; a throw here would mean the New Entity command is dead.
  assert.doesNotThrow(() => renderHtml(options()));
  assert.ok(renderHtml(options()).length > 1000);
});
