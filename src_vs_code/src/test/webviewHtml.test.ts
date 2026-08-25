import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { ENTITY_KINDS } from '../types';

/**
 * The entity form's page script must PARSE, for every entity kind.
 *
 * <p>This test exists because of a shipped defect, and the defect is worth stating: a
 * single broken string literal in the webview's inline script — one escaped newline that
 * collapsed while the file was being edited — made the whole script die on load. Nothing
 * errored visibly. What the user saw was every fieldset at once (Connection, SSH key,
 * VPN, Database, Secret… all of it) and the Type selector ignoring the folder's type,
 * because `updateVisibility()` and the type assignment both live after the point where
 * the parse failed. It went out in a release and survived several more.</p>
 *
 * <p>A webview script fails SILENTLY: there is no compiler between the template string
 * and the browser, and TypeScript happily emits a string containing a syntax error. This
 * is the only thing standing between that class of mistake and a user, so it renders the
 * real form and parses the real script rather than asserting anything about the source.</p>
 */

interface FakePanel {
  webview: {
    html: string;
    onDidReceiveMessage(): void;
    postMessage(): void;
  };
  onDidDispose(): void;
  dispose(): void;
}

function newPanel(): FakePanel {
  return {
    webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} },
    onDidDispose: () => {},
    dispose: () => {},
  };
}

/**
 * The panel the next render will write into.
 *
 * <p>One stub, not one per call: the form module is cached after its first load and keeps
 * whatever `vscode` object it was given then, so a second stub is simply never consulted —
 * a per-call panel stays empty while the render lands in the first call's panel.</p>
 */
let currentPanel = newPanel();

/** Load a panel module against the stub. Both webviews share one `vscode` fake. */
function withVscodeStub<T>(load: () => T): T {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        window: { createWebviewPanel: (): FakePanel => currentPanel },
        Uri: { joinPath: (): object => ({}) },
        ViewColumn: { Active: 1 },
        workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
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

const form = withVscodeStub(
  () => require('../entityFormPanel') as { showEntityForm(options: Record<string, unknown>): unknown },
);

const viewer = withVscodeStub(
  () => require('../entityViewPanel') as { showEntityView(options: Record<string, unknown>): void },
);

/** Render the form for one kind and return the HTML it produced. */
function renderForm(lockedKind: string | undefined): string {
  currentPanel = newPanel();
  // The promise settles when the panel closes, which a stub never does; the html is
  // assigned synchronously before that promise is even constructed.
  void form.showEntityForm({
    mode: 'create',
    entityId: 'e1',
    lockedKind,
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    keyCandidates: [],
  });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the form rendered no html');
  return currentPanel.webview.html;
}

function pageScript(html: string): string {
  const match = /<script nonce="[^"]*">([\s\S]*?)<\/script>/.exec(html);
  assert.notEqual(match, null, 'the form rendered no inline script at all');
  return (match as RegExpExecArray)[1];
}

const KINDS = [undefined, 'credential', 'ssh', 'sshkey', 'vpn', 'db', 'terminal', 'script'];

test('the form page script parses for every kind', () => {
  for (const kind of KINDS) {
    const script = pageScript(renderForm(kind));
    assert.doesNotThrow(
      // Parsing is the whole assertion: a script that does not parse never runs, and a
      // script that never runs leaves every fieldset visible and the type unset.
      () => new Function('acquireVsCodeApi', script),
      `page script does not parse for kind ${String(kind)}`,
    );
  }
});

test('the viewer page script parses too', () => {
  // The other webview in the extension, checked by the same measure. It renders whatever
  // an entity happens to hold, so it is given a metadata blob that lights up every branch
  // it has — script variables, command arguments, env bindings, history.
  currentPanel = newPanel();
  viewer.showEntityView({
    details: {
      name: 'probe',
      isScript: true,
      scriptLanguage: 'bash',
      script: 'echo ${GREETING}',
      scriptVars: [{ name: 'GREETING', value: 'hi' }],
      command: 'aws',
      commandArgs: [{ value: '--profile', note: 'which account' }],
      envBindings: { password: 'ENV_PROBE_PASSWORD' },
      notes: 'a note',
    },
    hasPassword: true,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_900_000,
    history: [
      { at: 1_699_999_000_000, name: 'probe (before)', details: { name: 'probe (before)' }, secrets: {} },
    ],
    resolveSecret: () => Promise.resolve(undefined),
    copyAllText: () => Promise.resolve(''),
    saveVpnConfig: () => Promise.resolve(),
    saveAttachment: () => Promise.resolve(),
    setEnv: () => Promise.resolve(true),
    checkEnv: () => {},
  });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the viewer rendered no html');
  assert.doesNotThrow(
    () => new Function('acquireVsCodeApi', pageScript(currentPanel.webview.html)),
    'viewer page script does not parse',
  );
});

test('every fieldset the visibility switch touches exists exactly once', () => {
  // The other half of the same failure: `show()` on a missing id throws, which kills the
  // switch just as dead as a parse error does.
  const html = renderForm('script');
  for (const id of [
    'connectionSection',
    'keySection',
    'vpnSection',
    'dbSection',
    'terminalSection',
    'scriptSection',
    'passwordSection',
  ]) {
    const count = html.split(`id="${id}"`).length - 1;
    assert.equal(count, 1, `${id} appears ${count} times`);
  }
});

test('the Type selector offers every kind, and pre-selects a locked one', () => {
  // The user-visible failure this pins down: adding `+` inside a script folder opened a
  // form whose Type read "Credential — name + secret value". No option carried the
  // `script` value at all, and a select with nothing selected shows its first option — so
  // the folder's own type silently became the wrong one.
  for (const kind of ENTITY_KINDS) {
    const html = renderForm(kind);
    for (const other of ENTITY_KINDS) {
      assert.ok(html.includes(`value="${other}"`), `Type selector has no option for ${other}`);
    }
    assert.ok(
      html.includes(`value="${kind}" selected`),
      `locking the form to ${kind} did not select that option`,
    );
  }
});

test('an env-binding row names the field it belongs to', () => {
  // Two rows reading "Expose in terminals as env variable" under one another, one for the
  // connection string and one for the DB password, is indistinguishable from a duplicate.
  const html = renderForm('db');
  const labels = html.match(/Expose [^<]*as env variable/g) ?? [];

  assert.ok(labels.length >= 2, 'the db form should offer both bindings');
  assert.equal(new Set(labels).size, labels.length, `identical labels: ${labels.join(' | ')}`);
});
