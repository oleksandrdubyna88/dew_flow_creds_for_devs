import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { CorpPolicyState, MOST_RESTRICTIVE_POLICY } from '../corpPolicy';

/**
 * The "My role and policy" page.
 *
 * <p>It exists for the reason the corporate-recovery page does: a policy nobody can see reads
 * as a broken product — an export that one day refuses with no page that ever said it would.
 * And everything on it arrives from a SERVER: a role string a newer server may spell any way it
 * likes, project ids an admin typed. That is the provenance behind this repository's 2026-08-26
 * HIGH finding, so the escaping is a test rather than a habit.</p>
 */

interface FakePanel {
  webview: { html: string };
  dispose(): void;
}

let currentPanel: FakePanel = { webview: { html: '' }, dispose: () => {} };
let panelOptions: Record<string, unknown> = {};

function withVscodeStub<T>(load: () => T): T {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        window: {
          createWebviewPanel: (_id: string, _title: string, _column: number, options: Record<string, unknown>): FakePanel => {
            panelOptions = options;
            return currentPanel;
          },
        },
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
  () => require('../orgMemberPolicyPanel') as {
    showMemberPolicyView(options: Record<string, unknown>): void;
  },
);

function state(overrides: Partial<CorpPolicyState> = {}): CorpPolicyState {
  return {
    corpMode: true,
    role: 'member',
    isOfficer: false,
    isAdmin: false,
    active: true,
    policy: { export: true, share: 'any', moveOutOfProject: true },
    policyFromServer: true,
    projects: [],
    leaseHours: 24,
    fetchedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function render(overrides: Partial<CorpPolicyState> = {}): string {
  currentPanel = { webview: { html: '' }, dispose: () => {} };
  panel.showMemberPolicyView({
    accountEmail: 'me@corp.com',
    location: 'https://vault.corp.com',
    state: state(overrides),
  });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the page rendered nothing');
  return currentPanel.webview.html;
}

test('the page runs no script and loads nothing — a read-only page for a read-only fact', () => {
  render();
  assert.equal(panelOptions.enableScripts, false);
  assert.deepEqual(panelOptions.localResourceRoots, []);
  assert.match(currentPanel.webview.html, /default-src 'none'/);
});

test('a member is told their role and what the policy allows', () => {
  const html = render();
  assert.match(html, /You are a <strong>member<\/strong>/);
  assert.match(html, /me@corp\.com/);
  assert.match(html, /vault\.corp\.com/);
  assert.match(html, /Export.*allowed/s);
});

test('a dev sees the restrictions the policy names — and that this version only SHOWS them', () => {
  // Honesty about enforcement: the bans land in a later version. A page that read as "you cannot
  // export" beside an Export menu entry that works would be the broken product the page exists
  // to prevent, so it says which of the two states it is in.
  const html = render({ role: 'dev', policy: { export: false, share: 'project', moveOutOfProject: false } });
  assert.match(html, /You are a <strong>dev<\/strong>/);
  assert.match(html, /not allowed/);
  assert.match(html, /inside your projects/);
  assert.match(html, /later version/);
});

test('a policy this build could not read says so, instead of reading as a decision about the person', () => {
  // The fallback is the most restrictive one, deliberately — guessing "everything" on a parse error
  // hands a developer an export. But the RESULT is indistinguishable from a legitimately restricted
  // account, and somebody reading "no" beside every row cannot tell a company's decision from a
  // version mismatch. The page says which, and only when it is the second.
  // The flag, not the value: a server may legitimately send the same restrictive policy, and the
  // notice must not fire on it. What it fires on is this build having failed to read what arrived.
  const html = render({ role: 'member', policy: MOST_RESTRICTIVE_POLICY, policyFromServer: false });

  assert.match(html, /could not read the policy the server sent/);
  assert.match(html, /version mismatch to report, not a decision/);
});

test('an ordinary restricted policy carries no such notice — it IS a decision about the person', () => {
  const html = render({ role: 'dev', policy: { export: false, share: 'none', moveOutOfProject: false } });

  assert.equal(/could not read the policy/.test(html), false);
});

test('an officer with a member record is called an officer and told they administer', () => {
  const html = render({ role: 'member', isOfficer: true, isAdmin: true });
  assert.match(html, /recovery officer/);
  assert.match(html, /administer/);
  assert.equal(/You are a <strong>member<\/strong>/.test(html), false, 'the CTO is not shown as a plain member');
});

test('an admin is pointed at where the actions are', () => {
  const html = render({ role: 'admin', isAdmin: true });
  assert.match(html, /Set Role…/);
});

test('corp mode off says so instead of drawing a member', () => {
  const html = render({ corpMode: false });
  assert.match(html, /no corporate roles/);
  assert.equal(/You are a <strong>/.test(html), false);
});

test('the lease is written in words, and zero is strictly online', () => {
  assert.match(render({ leaseHours: 24 }), /24 hours/);
  assert.match(render({ leaseHours: 0 }), /strictly online/);
});

test('projects are listed with their share setting, and none is said plainly', () => {
  assert.match(render(), /no project/);
  const html = render({ projects: [{ projectId: 'p-alpha', share: 'deny' }] });
  assert.match(html, /p-alpha/);
  assert.match(html, /deny/);
});

test('an inactive account is warned, not hidden', () => {
  assert.match(render({ active: false }), /inactive/);
  assert.equal(/inactive/.test(render()), false);
});

test('a role or project id a server spells with markup is escaped, never parsed', () => {
  const html = render({
    role: '<img src=x onerror=alert(1)>',
    projects: [{ projectId: '</table><script>alert(1)</script>', share: '<b>' }],
  });
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});
