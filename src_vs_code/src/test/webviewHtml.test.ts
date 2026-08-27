import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { ENTITY_KINDS } from '../types';
import { FORM_SECTIONS } from '../formSections';
import { escapeHtml, escapeHtmlForHighlighting, jsonForScript } from '../webviewHtml';

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
  /** The options the panel was created WITH — the fourth argument, captured by the stub. */
  options: Record<string, unknown>;
  onDidDispose(): void;
  dispose(): void;
}

function newPanel(): FakePanel {
  return {
    webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} },
    options: {},
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
        window: {
          // The fourth argument is captured rather than ignored: `retainContextWhenHidden`
          // is a property of how the panel was CREATED, and there is no DOM here to observe
          // it through.
          createWebviewPanel: (
            _id: string,
            _title: string,
            _column: unknown,
            options: Record<string, unknown>,
          ): FakePanel => {
            currentPanel.options = options;
            return currentPanel;
          },
        },
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

const folderForm = withVscodeStub(
  () => require('../folderFormPanel') as { showFolderForm(options: Record<string, unknown>): unknown },
);

const recoveryView = withVscodeStub(
  () => require('../recoveryCodeView') as { showRecoveryCodeView(options: Record<string, unknown>): void },
);

/** Render the form for one kind and return the HTML it produced. */
function renderForm(
  lockedKind: string | undefined,
  extra: Record<string, unknown> = {},
): string {
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
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [{ id: 'bastion', name: 'bastion' }],
    // One folder with one entry, so the Depends-on picker renders with something to offer —
    // the escaping and the script-parses checks below cover it like every other field.
    dependencyFolders: [{ id: 'f1', name: 'vpn', entities: [{ id: 'v1', name: 'org meter' }] }],
    dependencyColors: {},
    ...extra,
  });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the form rendered no html');
  return currentPanel.webview.html;
}

function pageScript(html: string): string {
  const match = /<script nonce="[^"]*">([\s\S]*?)<\/script>/.exec(html);
  assert.notEqual(match, null, 'the form rendered no inline script at all');
  return (match as RegExpExecArray)[1];
}

// Driven from the catalog, not typed out here. The hand-written list was missing `config` the
// day that kind was added — and this is the test whose whole job is to catch a page script that
// does not parse, which is a failure that silently leaves every fieldset visible at once.
const KINDS = [undefined, ...ENTITY_KINDS];

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
    // A one-time code row too: the page asks the host for the code after load.
    totp: () =>
      Promise.resolve({
        code: '123456',
        validUntil: 1_700_000_930_000,
        period: 30,
        description: '6 digits · SHA1 · every 30 s',
      }),
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
  assert.ok(currentPanel.webview.html.includes('id="totpCode"'), 'the one-time code row is rendered');
  // The code is delivered by message after load, never baked into the page — so a leaked
  // HTML string holds neither the seed nor a code.
  assert.equal(currentPanel.webview.html.includes('123456'), false);
});

test('the recovery-code page parses, shows the code, and offers no way to copy it', () => {
  currentPanel = newPanel();
  recoveryView.showRecoveryCodeView({
    email: 'me@corp.com',
    code: 'RC1-ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89AB',
    createdAt: 1_700_000_000_000,
    regenerated: true,
  });
  const html = currentPanel.webview.html;
  assert.notEqual(html.length, 0, 'the recovery view rendered no html');
  assert.doesNotThrow(
    () => new Function('acquireVsCodeApi', pageScript(html)),
    'recovery-code page script does not parse',
  );
  // Every group of the code reaches the page — this is the one place it is ever readable.
  for (const group of ['ABCDE', 'FGHJK', 'MNPQR', 'STVWX', 'YZ012', '34567', '89AB']) {
    assert.ok(html.includes(group), `the code group ${group} is missing from the page`);
  }
  assert.ok(html.includes('window.print()'), 'print is the affordance this page exists for');
  // The deliberate exception to the extension's copy-button-everywhere habit: a clipboard is
  // read by more programs than the person expects, and this factor outlives the laptop.
  //
  // The assertion is about a MECHANISM, not a word — the page's own prose explains why there
  // is no copy button, and an earlier version of this check failed on that explanation. What
  // must be absent is a way to copy, not the topic.
  for (const mechanism of ['navigator.clipboard', 'execCommand', "type: 'copy'", 'data-action="copy"']) {
    assert.equal(html.includes(mechanism), false, `the page offers a copy mechanism: ${mechanism}`);
  }
  assert.ok(html.includes('destroy it'), 'a regenerated code must retire its printed predecessor out loud');
});

test('every fieldset the visibility switch touches exists exactly once', () => {
  // The other half of the same failure: the switch hides a section by id, and an id that is in
  // the catalog but not in the markup is a rule that governs nothing.
  //
  // Driven from FORM_SECTIONS rather than from a list typed out here — which is the whole point
  // of the catalog. This test used to name eight ids by hand, and a section added to the page
  // without one would have been invisible to it.
  const html = renderForm('script');
  for (const section of FORM_SECTIONS.filter((s) => s.optional !== true)) {
    const count = html.split(`id="${section.id}"`).length - 1;
    assert.equal(count, 1, `${section.id} appears ${count} times in the rendered form`);
  }
});

test('the one optional section renders when it has something to say, and not before', () => {
  // Dates is absent from a brand-new entry on purpose — "unknown" and "—" are two rows of noise
  // at the moment they mean least. It is the only section allowed to be missing, so its two
  // states are pinned here rather than left to the equality check above.
  assert.ok(!renderForm('script').includes('id="datesSection"'));
  assert.ok(
    renderForm('script', { createdAt: 1_700_000_000_000 }).includes('id="datesSection"'),
    'an entry with a creation date shows the Dates section',
  );
});

test('every section renders inside its own group, and both groups exist', () => {
  const html = renderForm('ssh');
  assert.equal(html.split('id="mainGroup"').length - 1, 1);
  assert.equal(html.split('id="additionalGroup"').length - 1, 1);

  // The border colour is what tells two neighbouring sections apart, so a section rendered
  // without its class is the failure this catches — silently uncoloured, never an error.
  for (const section of FORM_SECTIONS.filter((s) => s.optional !== true)) {
    assert.ok(
      html.includes(`id="${section.id}" class="sec ${section.color}"`),
      `${section.id} carries no colour class`,
    );
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

test('the keyboard reaches the form: Name is focused, Esc cancels, Ctrl+S saves, errors are announced', () => {
  const html = renderForm('credential');
  assert.ok(html.includes('id="name" type="text" autofocus'), 'Name carries autofocus');
  assert.ok(html.includes('role="alert" aria-live="assertive"'), 'the error line is announced to a screen reader');
  const script = pageScript(html);
  assert.ok(script.includes("e.key === 'Escape'"), 'Esc is handled');
  assert.ok(script.includes("e.key === 's' || e.key === 'S'"), 'Ctrl/Cmd+S is handled');
  assert.ok(script.includes("getElementById('name')") && script.includes('.focus()'), 'focus is moved to Name on load');
});

/**
 * A form must survive being hidden.
 *
 * <p>The defect this pins down, as the user met it: type a name into New Entity, go and open a
 * file to look up the password you were about to paste, come back — and the form is blank. Every
 * field, not just the one you left. It reads as the form clearing itself on focus change, which
 * is why it was reported that way.</p>
 *
 * <p>The cause is not a handler. A webview panel created without `retainContextWhenHidden` has
 * its context DESTROYED the moment its tab goes to the background of its editor group, and VS
 * Code re-assigns `webview.html` when it returns. The page is then rebuilt from the options it
 * was opened with — so everything typed since open is gone, and nothing in this codebase ran to
 * erase it.</p>
 *
 * <p>Asserted on the OPTIONS rather than on behaviour, deliberately: the behaviour belongs to VS
 * Code and there is no DOM here to lose. The flag IS the fix, which makes it exactly the kind of
 * thing a later tidy-up of the panel's construction drops without anyone noticing — so it is
 * pinned for both forms, not only the one that was reported.</p>
 *
 * <p>Not asserted for the read-only viewer: it has no unsaved input to lose, and re-rendering it
 * costs a scroll position rather than somebody's work.</p>
 */
test('a form panel is created so that hiding it does not destroy what was typed', () => {
  renderForm('credential');
  assert.equal(
    currentPanel.options.retainContextWhenHidden,
    true,
    'the entity form does not retain its context when hidden',
  );

  currentPanel = newPanel();
  void folderForm.showFolderForm({ name: 'scripts', entryCount: 3, inTrash: false });
  assert.notEqual(currentPanel.webview.html.length, 0, 'the folder form rendered no html');
  assert.equal(
    currentPanel.options.retainContextWhenHidden,
    true,
    'the folder form does not retain its context when hidden',
  );
});

test('the viewer SHOWS a config file, which is the one thing it was opened for', () => {
  // Reported from a live window: opening a config entry showed its name and two dates and
  // nothing else. A config entry whose contents cannot be viewed is a viewer that fails at the
  // only job that entry has.
  //
  // The body is a secret and reaches the viewer the same way `notes` does — a deliberate
  // exception to "the read-only viewer never receives a secret value", and the same exception
  // notes already are: here the secret IS the document somebody opened it to read.
  currentPanel = newPanel();
  viewer.showEntityView({
    details: { name: 'conf1', kind: 'config', isConfig: true, configFormat: 'json', isSshEnabled: false },
    config: '{ "ConnectionStrings": { "Default": "Server=localhost" } }',
    hasPassword: false, hasPrivateKey: false, hasVpnConfig: false, hasDbConnection: false,
    dbPortIsDefault: false, dbHasPassword: false, hasAttachment: false, history: [],
    resolveSecret: () => Promise.resolve(undefined), copyAllText: () => Promise.resolve(''),
    saveVpnConfig: () => Promise.resolve(), saveAttachment: () => Promise.resolve(),
    setEnv: () => Promise.resolve(true), checkEnv: () => {},
  });

  assert.ok(currentPanel.webview.html.includes('Config file'), 'no Config file row is rendered');
  assert.ok(
    currentPanel.webview.html.includes('Server=localhost'),
    'the row is there but empty — which is what the defect looked like',
  );
});

test('the viewer closes on Esc', () => {
  currentPanel = newPanel();
  viewer.showEntityView({
    details: { name: 'probe', isSshEnabled: false },
    hasPassword: false, hasPrivateKey: false, hasVpnConfig: false, hasDbConnection: false,
    dbPortIsDefault: false, dbHasPassword: false, hasAttachment: false, history: [],
    resolveSecret: () => Promise.resolve(undefined), copyAllText: () => Promise.resolve(''),
    saveVpnConfig: () => Promise.resolve(), saveAttachment: () => Promise.resolve(),
    setEnv: () => Promise.resolve(true), checkEnv: () => {},
  });
  const script = pageScript(currentPanel.webview.html);
  assert.ok(script.includes("e.key === 'Escape'"), 'Esc is handled in the viewer');
  assert.ok(script.includes("type: 'close'"), 'and posts close to the host');
});

/**
 * The one HTML escaper (audit A1's tail).
 *
 * <p>It existed three times — byte-identical private copies in `entityFormPanel`,
 * `entityViewPanel` and `scriptRender` — which is the worst shape for a security helper: each
 * file looks self-consistent, so the day one is hardened the other two keep the old behaviour
 * and nothing says so. This file was already NAMED after the shared module before it existed.</p>
 */

test('every character that can break out of markup or an attribute is escaped', () => {
  assert.equal(
    escapeHtml(`<script>alert("x" & 'y')</script>`),
    '&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;',
  );
});

test('the ampersand goes first, so an escape is never double-escaped into nonsense', () => {
  // & -> &amp; must happen before < -> &lt;, or "&lt;" arrives as "&amp;lt;" and the page
  // shows the escape instead of the character.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('a & b < c'), 'a &amp; b &lt; c');
});

test("the single quote is escaped too — the three copies did not", () => {
  // No template interpolates into a single-quoted attribute TODAY. "None of them does today"
  // is exactly the assumption a later edit breaks silently, and the fix costs one replace.
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('ordinary text is returned unchanged', () => {
  assert.equal(escapeHtml('prod.example.com:2222'), 'prod.example.com:2222');
  assert.equal(escapeHtml(''), '');
});

test('the highlighter escaper leaves the apostrophe as data, and says why in its name', () => {
  // scriptRender matches tokens IN the escaped string: a double quote survives as &quot; and
  // it matches on that, while a single quote must stay ' because that is what it recognises a
  // single-quoted string by. Escaping it turned 'v' into &#39;v&#39;, whose # the tokenizer
  // read as a comment — which is what scriptRender's own test caught when the escapers were
  // first unified. This pins the difference so the next unification attempt fails here first.
  assert.equal(escapeHtmlForHighlighting(`x = 'v' & "w" <y>`), 'x = \'v\' &amp; &quot;w&quot; &lt;y&gt;');
  assert.equal(escapeHtml(`x = 'v'`), 'x = &#39;v&#39;', 'the general one still escapes it');
});

test('the connection form offers the D7 fields, each exactly once', () => {
  // A field rendered twice is two inputs writing one value — the failure the fieldset
  // uniqueness check above exists for, applied to the new controls.
  const html = renderForm('ssh');
  for (const id of ['jumpHostEntityId', 'tags', 'agentForward', 'forwardRows', 'addForward']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} is not present exactly once`);
  }
  assert.ok(html.includes('<option value="bastion"'), 'the jump-host picker lists other entities');
});

/**
 * `jsonForScript` — the second escaper this module owns, for a different destination.
 *
 * <p>`escapeHtml` is for text and attributes; this one is for a value interpolated INSIDE a
 * `<script>` element, where the danger is not a quote but the literal sequence `</script>`,
 * which ends the element wherever it appears — inside a JavaScript string included. It lives
 * here for the same reason `escapeHtml` does: there are three interpolation sites, and the
 * escape used to exist at exactly one of them.</p>
 */

test('a value containing </script> is escaped so it cannot close the element', () => {
  const json = jsonForScript(['</script><img src=x onerror=alert(1)>']);

  assert.ok(!json.includes('</script>'), json);
  assert.deepEqual(JSON.parse(json), ['</script><img src=x onerror=alert(1)>'], 'and it is still JSON');
});

test('the escaped form round-trips through JSON.parse unchanged', () => {
  // The page parses these literals as JavaScript; an escape that changed the VALUE would
  // silently corrupt whatever the person had stored.
  for (const value of ['<', '</script>', '<!--', 'a < b && c > d', 'plain']) {
    assert.equal(JSON.parse(jsonForScript(value)), value, value);
  }
});

test('`<!--` is closed at the same time, not left for a second fix', () => {
  assert.ok(!jsonForScript('<!--').includes('<!--'));
});

test('nothing but `<` is touched — quotes and backslashes stay JSON.stringify’s job', () => {
  assert.equal(jsonForScript('he said "hi" \ ok'), JSON.stringify('he said "hi" \ ok'));
});

test('structures, not just strings, are escaped throughout', () => {
  // The form passes arrays of objects; an escape applied only to a top-level string would
  // leave every nested value exposed.
  const json = jsonForScript({ rows: [{ name: '</script>', value: 'ok' }] });

  assert.ok(!json.includes('</script>'));
  assert.deepEqual(JSON.parse(json), { rows: [{ name: '</script>', value: 'ok' }] });
});
