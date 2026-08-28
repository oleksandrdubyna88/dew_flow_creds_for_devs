import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EntityViewOptions,
  cliCommandFor,
  copyValueFor,
  portableSshCommand,
  renderEntityViewHtml,
} from '../entityViewPage';
import { EntityMetadata } from '../types';
import { PAGE_MAX_WIDTH_PX, TWO_COLUMN_AT } from '../webviewHtml';
import { snippetFor } from '../configSnippet';
import { FORM_SECTIONS } from '../formSections';
import { CONFIG_KEY_ENV } from '../configKey';

/**
 * The read-only viewer's markup.
 *
 * <p>These are layout assertions, which is unusual and deliberate. The viewer grew a second column
 * in 0.77.0 for the "Read this from code" panel and kept the body width it had chosen when it was
 * one column, so both columns rendered at roughly half the old width and a config body wrapped
 * mid-word. Nothing could see that: the page was built inside a `vscode`-importing module, so no
 * test could reach it, and the defect survived until somebody looked at a screenshot.</p>
 *
 * <p>So what is pinned here is not pixels but two RELATIONS that carry the intent — the viewer is
 * at least as wide as the form it mirrors, and the page's one whole-entity action is reachable
 * before the long content rather than after it. Both survive restyling; a hard-coded pixel count
 * would not, and would be deleted the first time it got in the way.</p>
 */

function metadata(overrides: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'conf1', ...overrides } as EntityMetadata;
}

function options(overrides: Partial<EntityViewOptions> = {}): EntityViewOptions {
  return {
    details: metadata(),
    hasPassword: false,
    hasPrivateKey: false,
    hasVpnConfig: false,
    hasDbConnection: false,
    dbPortIsDefault: false,
    dbHasPassword: false,
    hasAttachment: false,
    history: [],
    resolveSecret: async () => undefined,
    copyAllText: async () => '',
    saveVpnConfig: async () => {},
    saveAttachment: async () => {},
    setEnv: async () => true,
    checkEnv: () => {},
    ...overrides,
  } as EntityViewOptions;
}

/** The `max-width` the page gives its `body`, in pixels. */
function bodyMaxWidth(html: string): number {
  const body = /body\s*\{[^}]*\}/.exec(html);
  assert.ok(body !== null, 'the page has a body rule');
  const width = /max-width:\s*(\d+)px/.exec(body[0]);
  assert.ok(width !== null, `the body rule sets no max-width: ${body[0]}`);
  return Number(width[1]);
}

test('the viewer takes its width from the shared constant, not a number of its own (T9)', () => {
  const viewer = bodyMaxWidth(renderEntityViewHtml(options()));
  assert.equal(
    viewer,
    PAGE_MAX_WIDTH_PX,
    `the viewer caps its body at ${viewer}px instead of the shared ${PAGE_MAX_WIDTH_PX}px — ` +
      'a private number is how it sat at 640px for four months while the form used 1280px, ' +
      'halving every column',
  );
  assert.ok(
    PAGE_MAX_WIDTH_PX >= TWO_COLUMN_AT,
    'the shared constants themselves disagree: the page splits into two columns before it is ' +
      'allowed to be wide enough to hold them',
  );
});

test('the page cannot ask for two columns it has no room for', () => {
  const html = renderEntityViewHtml(options());
  const breakpoint = /@media\s*\(min-width:\s*(\d+)px\)/.exec(html);
  assert.ok(breakpoint !== null, 'the page has a two-column breakpoint');
  assert.ok(
    bodyMaxWidth(html) >= Number(breakpoint[1]),
    `the layout switches to two columns at ${breakpoint[1]}px of WINDOW while the container is ` +
      `capped at ${bodyMaxWidth(html)}px — it splits exactly where it cannot fit`,
  );
});

test('Copy All is reachable before the content, not below it', () => {
  const html = renderEntityViewHtml(options({ details: metadata({ isConfig: true } as never) }));
  const copyAll = html.indexOf('data-field="all"');
  const grid = html.indexOf('class="viewGroups"');
  assert.ok(copyAll !== -1, 'the page offers Copy All');
  assert.ok(grid !== -1, 'the page has its content grid');
  assert.ok(
    copyAll < grid,
    'Copy All is emitted after the content grid, so on a config entry it sits below a code ' +
      'panel up to 320px tall and off the screen the reader is looking at',
  );
});

// ---------------------------------------------------------------------------
// T18 — the snippet copy button. It shipped posting `field: "snippet"` to a
// switch with no case of that name, so it copied nothing and the page answered
// "Nothing to copy — the field is empty" beside a visibly non-empty snippet.
// ---------------------------------------------------------------------------

test('copying the snippet resolves the exact text shown for the chosen language', async () => {
  const opts = options({ details: metadata({ isConfig: true } as never) });
  const shown = snippetFor('csharp', 'aspnet', {
    envVar: CONFIG_KEY_ENV,
    fileName: 'appsettings.Development.json',
  });
  const copied = await copyValueFor(opts, 'snippet|csharp|aspnet');
  assert.ok(copied !== undefined && copied.length > 0, 'the snippet field resolves to text');
  assert.equal(
    copied,
    shown.code,
    'the copy must be the snippet as SHOWN — same language, same variant — not a default',
  );
});

test('a bare snippet field still copies something rather than nothing', async () => {
  const copied = await copyValueFor(options({ details: metadata({ isConfig: true } as never) }), 'snippet');
  assert.ok(
    copied !== undefined && copied.length > 0,
    'field "snippet" with no language resolved to nothing — the shipped defect: no case ' +
      'answered to the name every copy button on the panel posts',
  );
});

test('the snippet panel and the viewer share one copy icon', () => {
  const html = renderEntityViewHtml(options({ details: metadata({ isConfig: true } as never) }));
  const icons = html.match(/<svg[^>]*>/g) ?? [];
  const copyButtons = html.match(/aria-label="Copy [^"]*"/g) ?? [];
  assert.ok(copyButtons.length >= 2, 'the page has several copy buttons');
  const glyphs = new Set(
    (html.match(/aria-label="Copy [^"]*">(<svg.*?<\/svg>)/g) ?? []).map((m) =>
      m.slice(m.indexOf('<svg')),
    ),
  );
  assert.equal(
    glyphs.size,
    1,
    `the page draws ${glyphs.size} different copy glyphs — the snippet panel re-drew its own, ` +
      'which is what made its button read as "not a copy button"',
  );
  assert.ok(icons.length > 0);
});

// ---------------------------------------------------------------------------
// T19 — the viewer's three framed groups, coloured from the FORM's catalog so
// the two pages cannot describe one section in two colours.
// ---------------------------------------------------------------------------

test('a config entry shows three frames, in order: main, dates, code', () => {
  const html = renderEntityViewHtml(
    options({
      details: metadata({ isConfig: true } as never),
      createdAt: 1756300000000,
    }),
  );
  const frames = [...html.matchAll(/<fieldset class="sec (depColor\d+)"><legend>([^<]*)<\/legend>/g)];
  assert.deepEqual(
    frames.map((m) => m[2]),
    ['Main', 'Dates &amp; history', 'Read this from code'],
    'the viewer renders a flat run of rows where the owner asked for three framed groups',
  );
});

test('a kind with no code story shows two frames, not an empty third', () => {
  const html = renderEntityViewHtml(options({ createdAt: 1756300000000 }));
  const frames = [...html.matchAll(/<fieldset class="sec /g)];
  assert.equal(frames.length, 2, 'an empty code frame is a frame around nothing');
});

test('dates and history live inside the dates frame, not the main one', () => {
  const html = renderEntityViewHtml(options({ createdAt: 1756300000000 }));
  const main = html.indexOf('<legend>Main</legend>');
  const dates = html.indexOf('<legend>Dates &amp; history</legend>');
  const created = html.indexOf('>Created<');
  assert.ok(main !== -1 && dates !== -1 && created !== -1);
  assert.ok(created > dates, 'Created renders before the dates frame opens — it is in Main');
});

test("the frame colours are the form catalog's own, by identity", () => {
  const html = renderEntityViewHtml(
    options({ details: metadata({ isConfig: true } as never), createdAt: 1756300000000 }),
  );
  const byId = (id: string): string => {
    const section = FORM_SECTIONS.find((s) => s.id === id);
    assert.ok(section !== undefined, `the form catalog lost section "${id}"`);
    return section.color;
  };
  assert.ok(html.includes(`class="sec ${byId('generalSection')}"><legend>Main<`));
  assert.ok(html.includes(`class="sec ${byId('datesSection')}"><legend>Dates &amp; history<`));
  assert.ok(html.includes(`class="sec ${byId('configSection')}"><legend>Read this from code<`));
});

// ---------------------------------------------------------------------------
// T20 — the portable ssh line; T26 — the image zoom that letterboxed.
// ---------------------------------------------------------------------------

test('a full-path ssh command grows a portable twin; a bare one does not', () => {
  const full = 'C:/Windows/System32/OpenSSH/ssh.exe -A -p 2222 root@host';
  assert.equal(portableSshCommand(full), 'ssh -A -p 2222 root@host');
  assert.equal(portableSshCommand('ssh root@host'), undefined);
  assert.equal(portableSshCommand(undefined), undefined);

  const withRow = renderEntityViewHtml(options({ sshCommand: full }));
  assert.ok(withRow.includes('SSH command (any machine)'), 'the portable row is missing');
  const withoutRow = renderEntityViewHtml(options({ sshCommand: 'ssh root@host' }));
  assert.ok(
    !withoutRow.includes('SSH command (any machine)'),
    'a second row identical to the first is noise',
  );
});

test('the image zoom drives width only — height follows the picture', () => {
  const html = renderEntityViewHtml(options({ imageDataUri: 'data:image/png;base64,AAAA' }));
  assert.ok(html.includes('height: auto'), 'the preview pins a height, so a clamped width letterboxes');
  assert.ok(
    !/preview\.style\.height/.test(html),
    'the zoom script sets height — a square box in a narrower column reads as height-only zoom',
  );
});

test('an entry with an image shows the Additional frame on the right, before the code panel', () => {
  const html = renderEntityViewHtml(
    options({
      details: metadata({ isConfig: true } as never),
      imageDataUri: 'data:image/png;base64,AAAA',
      createdAt: 1756300000000,
    }),
  );
  const frames = [...html.matchAll(/<legend>([^<]*)<\/legend>/g)].map((m) => m[1]);
  assert.deepEqual(frames, ['Main', 'Dates &amp; history', 'Additional', 'Read this from code']);
});

test('a revision subtitle is its own line, never glued to the name', () => {
  const html = renderEntityViewHtml(
    options({ subtitle: 'version replaced at 8/27/2026, 8:43:32 PM' }),
  );
  assert.ok(html.includes('<p class="subtitle">version replaced at 8/27/2026'), 'the subtitle line is missing');
  assert.ok(
    !/<h2>[^<]*version replaced/.test(html),
    'the date is inside the h2 — it reads as part of the name',
  );
  const plain = renderEntityViewHtml(options());
  assert.ok(!plain.includes('class="subtitle"'), 'no subtitle row when there is nothing to say');
});

// ---------------------------------------------------------------------------
// T23a — "Enable CLI Access" finally leads somewhere you can see.
// ---------------------------------------------------------------------------

test('an entry with CLI aliases shows the copyable command, verb by kind', async () => {
  const html = renderEntityViewHtml(
    options({ details: metadata({ isDb: true } as never), cliAliases: ['prod-db'] }),
  );
  assert.ok(html.includes('CLI access'), 'the CLI row is missing');
  assert.ok(html.includes('creds db prod-db'), 'the command must carry the kind verb');

  const copied = await copyValueFor(
    options({ details: metadata({ isDb: true } as never), cliAliases: ['prod-db'] }),
    'cli0',
  );
  assert.equal(copied, 'creds db prod-db');
});

test('the verb follows the kind: ssh, run, script, vpn-up, config, env', () => {
  const cases: ReadonlyArray<[Record<string, unknown>, string]> = [
    [{ isSshEnabled: true, host: 'h' }, 'creds ssh a'],
    [{ isTerminal: true }, 'creds run a'],
    [{ isScript: true }, 'creds script a'],
    [{ isVpn: true }, 'creds vpn-up a'],
    [{ isConfig: true }, 'creds config a'],
    [{}, 'creds env a'],
  ];
  for (const [details, expected] of cases) {
    assert.equal(cliCommandFor(metadata(details as never), 'a'), expected, JSON.stringify(details));
  }
});

test('agent access is its own frame in the agent column — with the CLI row and the other live doors (T24/T24b)', () => {
  const html = renderEntityViewHtml(
    options({
      cliAliases: ['prod-db'],
      agentDoors: { cliAliases: ['prod-db'], codeAccess: false, bridgeOpen: true, wslRelay: false },
    }),
  );
  const agent = html.indexOf('id="agentGroup"');
  const main = html.indexOf('id="mainGroup"');
  assert.ok(agent > main && main !== -1, 'the agent group follows main and additional in source order');
  const frame = html.slice(agent);
  assert.ok(frame.includes('<legend>Agent access</legend>'), 'the frame carries the agent legend');
  assert.ok(frame.includes('CLI access'), 'the CLI row moved into the agent frame');
  assert.ok(frame.includes('Remote Bridge open'), 'the live door is listed');
  assert.ok(!frame.includes('Code access key'), 'a door that is not live is not listed');
  assert.ok(!html.slice(main, agent).includes('CLI access'), 'and it left Main');
  assert.ok(html.includes("#agentGroup { grid-column: 3;"), 'the viewer shares the three-column grid');
});

test('no aliases, no row — a capability line about nothing is noise', () => {
  const html = renderEntityViewHtml(options());
  assert.ok(!html.includes('CLI access'));
});

// ---------------------------------------------------------------------------
// T27 — a stored file is a described row, not a masked secret.
// ---------------------------------------------------------------------------

test('a stored file shows its name and what is known — never a password box', () => {
  const html = renderEntityViewHtml(
    options({
      details: metadata({
        attachmentFileName: 'export.json',
        attachmentSize: 3300,
        attachmentChangedAt: 1756300000000,
        attachmentChangedBy: 'a@b.c',
      } as never),
      hasAttachment: true,
    }),
  );
  assert.ok(html.includes('class="fileName">export.json<'), 'the name wears the highlight class');
  assert.ok(html.includes('3.2 KB'), 'the size is shown');
  assert.ok(html.includes('by a@b.c'), 'who changed it is shown');
  const fileRow = html.slice(html.indexOf('Additional file'), html.indexOf('</fieldset>', html.indexOf('Additional file')));
  assert.ok(!fileRow.includes('type="password"') && !fileRow.includes('value="•"'),
    'the file row dressed as a secret again');
});

test('a legacy entry says "not recorded" — never a guess', () => {
  const html = renderEntityViewHtml(
    options({ details: metadata({ attachmentFileName: 'old.pdf' } as never), hasAttachment: true }),
  );
  assert.ok(html.includes('size not recorded'));
  assert.ok(html.includes('last change not recorded'));
});

test('an image carries its dimensions when stamped, and its metadata line', () => {
  const html = renderEntityViewHtml(
    options({
      details: metadata({
        imageFileName: 'shot.png', imageSize: 2048, imageWidth: 1920, imageHeight: 1080,
        imageChangedAt: 1756300000000,
      } as never),
      imageDataUri: 'data:image/png;base64,AAAA',
    }),
  );
  assert.ok(html.includes('1920×1080'));
  assert.ok(html.includes('class="fileName">shot.png<'));
});

// T31 — the checkbox contrast rule is pinned so a restyle cannot silently drop it.
test('every page paints checkboxes with the action colour (T31)', () => {
  const html = renderEntityViewHtml(options());
  assert.ok(html.includes('input[type=checkbox] { accent-color: var(--vscode-button-background)'));
});
