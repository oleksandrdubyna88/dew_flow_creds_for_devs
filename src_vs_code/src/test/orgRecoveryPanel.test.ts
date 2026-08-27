import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { OrgRecoveryConfigResponse } from '../orgRecoveryClient';

/**
 * The corporate-recovery page.
 *
 * <p>Every value it renders arrives from a SERVER — officer addresses, a fingerprint, an audit
 * log of who opened whose vault. That is the same provenance as the entity names which produced
 * this repository's 2026-08-26 HIGH finding, where `</script>` inside a synced value ended the
 * script element early and the rest of the page was parsed as markup. So the escaping here is a
 * test rather than a habit.</p>
 *
 * <p>The page also exists for a reason a test can check: enrolment is automatic and unconsented,
 * so the words that say so must actually be on it.</p>
 */

interface FakePanel {
  webview: { html: string };
  onDidReceiveMessage(): void;
  dispose(): void;
}

let currentPanel: FakePanel = { webview: { html: '' }, onDidReceiveMessage: () => {}, dispose: () => {} };

function withVscodeStub<T>(load: () => T): T {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        window: { createWebviewPanel: (): FakePanel => currentPanel },
        ViewColumn: { Active: 1 },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return load();
  } finally {
    loader._load = original;
  }
}

const panel = withVscodeStub(
  () => require('../orgRecoveryPanel') as {
    showOrgRecoveryView(options: Record<string, unknown>): void;
  },
);

function config(overrides: Partial<OrgRecoveryConfigResponse> = {}): OrgRecoveryConfigResponse {
  return {
    enabled: true,
    officerEmails: ['cto@corp.com', 'lead@corp.com', 'devops@corp.com'],
    threshold: 2,
    setupComplete: true,
    orgPublicKey: 'AAAA',
    orgPublicKeyFingerprint: 'AAAA BBBB CCCC DDDD',
    rosterFingerprint: 'ros-1',
    publishedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function render(overrides: Record<string, unknown> = {}): string {
  currentPanel = { webview: { html: '' }, onDidReceiveMessage: () => {}, dispose: () => {} };
  panel.showOrgRecoveryView({
    accountEmail: 'me@corp.com',
    location: 'https://vault.corp.com',
    config: config(),
    notice: '',
    isOfficer: false,
    holdsShare: false,
    pendingInvites: 0,
    audit: [],
    ...overrides,
  });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the page rendered nothing');
  return currentPanel.webview.html;
}

// ---------------------------------------------------------------- what it must SAY

test('an enrolled account is told plainly that colleagues can open its vault WITHOUT it', () => {
  // The page's whole reason to exist. Enrolment is automatic and nobody asked, so a page that
  // renders a roster without saying what the roster can do is a page that hides the point.
  const html = render();
  assert.match(html, /without you/);
  assert.match(html, /2 of the 3 officers/);
  for (const officer of config().officerEmails) {
    assert.ok(html.includes(officer), `${officer} is not listed`);
  }
  assert.match(html, /AAAA BBBB CCCC DDDD/, 'the fingerprint must be readable');
});

test('a server with recovery off says so, and says what that costs too', () => {
  const html = render({ config: config({ enabled: false }) });
  assert.match(html, /Corporate recovery is off/);
  // The honest other half: nobody else can open it, which also means nobody can rescue it.
  assert.match(html, /nobody can/);
  assert.equal(/officers below/.test(html), false, 'no roster to show');
});

test('configured-but-unfinished is its own state, not "on"', () => {
  // Collapsing the two is how somebody would believe a quorum exists before the ceremony ran.
  const html = render({ config: config({ setupComplete: false, orgPublicKeyFingerprint: '' }) });
  assert.match(html, /configured but not finished/);
  assert.equal(/without you/.test(html), false);
});

test('a trust notice is shown when there is one, and nothing is invented when there is not', () => {
  assert.match(render({ notice: 'The corporate recovery KEY is not the one this machine pinned.' }),
    /not the one this machine pinned/);
  assert.equal(/class="warn"/.test(render()), false, 'no warning block without a notice');
});

test('an officer is told whether THIS machine holds their share', () => {
  // The question item 7 of the manual pass exists to answer: the share is in SecretStorage,
  // which does not sync, so "I am an officer" and "I can help from here" are different facts.
  assert.match(render({ isOfficer: true, holdsShare: true }), /This machine holds your share/);
  assert.match(
    render({ isOfficer: true, holdsShare: false }),
    /does not hold your share/,
  );
  assert.equal(
    /recovery officer/.test(render({ isOfficer: false })),
    false,
    'a non-officer is not shown an officer section',
  );
});

test('the audit is listed, and an empty one says so rather than rendering an empty table', () => {
  const entry = {
    sessionId: 's1',
    kind: 'vault-recovery',
    initiatorEmail: 'cto@corp.com',
    targetEmail: 'departed@corp.com',
    contributingOfficers: ['cto@corp.com', 'lead@corp.com'],
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_300_000,
  };
  const html = render({ isOfficer: true, audit: [entry] });
  assert.match(html, /departed@corp\.com/);
  assert.match(html, /cto@corp\.com, lead@corp\.com/);
  assert.match(html, /<time datetime="/, 'a date is marked up as a date');
  assert.match(render(), /No vault on this server has been recovered/);
});

// ---------------------------------------------------------------- what it must not do

test('every server-supplied value is escaped — this page renders what a server sent', () => {
  // Same provenance as the entity names behind the 2026-08-26 HIGH finding: a value carrying
  // `</script>` ends the script element early wherever an HTML parser meets it, and the rest of
  // the page is parsed as markup. Checked on EVERY field a server controls, not the one that
  // happens to look risky today.
  const evil = '</style><img src=x onerror=alert(1)>';
  const html = render({
    accountEmail: evil,
    location: evil,
    notice: evil,
    config: config({
      officerEmails: [evil, 'lead@corp.com'],
      orgPublicKeyFingerprint: evil,
    }),
    isOfficer: true,
    audit: [
      {
        sessionId: evil,
        kind: 'vault-recovery',
        initiatorEmail: evil,
        targetEmail: evil,
        contributingOfficers: [evil],
        startedAt: 1,
        completedAt: 1,
      },
    ],
  });

  assert.equal(html.includes('<img src=x'), false, 'a tag survived into the markup');
  assert.equal(html.includes('</style>'), true, 'the page has its own style block');
  assert.equal(
    html.includes(evil),
    false,
    'the hostile string appears verbatim somewhere unescaped',
  );
  assert.ok(html.includes('&lt;img src=x'), 'and it is present, escaped, as text');
});

test('the page runs no script at all', () => {
  // It is read-only by design: every action lives behind a command with its own confirmation,
  // so nothing destructive is one stray click inside a page somebody opened to read.
  const html = render({ isOfficer: true });
  assert.equal(/<script/.test(html), false);
  assert.match(html, /default-src 'none'/, 'and the CSP says so as well');
});
