import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * Issue #104 — handing a stored URL to the browser, and the PIN-gated context-menu path to it.
 * `openExternal` is the stub's; what is asserted is WHICH address reaches it, and that every other
 * outcome is said rather than swallowed.
 */

interface World {
  vscode: Record<string, unknown>;
  opened: string[];
  warnings: string[];
}

function world(answer: 'open' | 'decline' | 'throw' = 'open'): World {
  const opened: string[] = [];
  const warnings: string[] = [];
  const vscode = {
    env: {
      openExternal: (uri: { value: string }) => {
        if (answer === 'throw') {
          return Promise.reject(new Error('no browser here'));
        }
        opened.push(uri.value);
        return Promise.resolve(answer === 'open');
      },
    },
    Uri: { parse: (value: string) => ({ value }) },
    window: {
      showWarningMessage: (text: string) => {
        warnings.push(text);
        return Promise.resolve(undefined);
      },
    },
  };
  return { vscode, opened, warnings };
}

type OpenSite = typeof import('../openSite');

/**
 * The PIN layer stands in for `pinAdmission`: `admit` answers what the test says, and `openedText`
 * UNSEALS — a stored value starting `SEALED:` comes back without it. So a path that skipped
 * `openedText` would hand `parseFields` the sealed text, find no URL, and fail the test.
 */
function load(w: World, admission: unknown = { kind: 'in' }): OpenSite {
  return loadWithVscode<OpenSite>('../openSite', w.vscode, {
    './pinAdmission': {
      admit: () => Promise.resolve(admission),
      openedText: (stored: string | undefined) => Promise.resolve(stored?.replace(/^SEALED:/, '')),
    },
  });
}

test('a stored https address reaches the browser — in its one serialized form', async () => {
  const w = world();
  assert.equal(await load(w).openSite('godaddy', 'www.godaddy.com'), true);
  assert.deepEqual(w.opened, ['https://www.godaddy.com/']);
  assert.deepEqual(w.warnings, []);
});

test('a refused scheme opens nothing and says why, naming the entry', async () => {
  const w = world();
  assert.equal(await load(w).openSite('odd', 'javascript:alert(1)'), false);
  assert.deepEqual(w.opened, []);
  assert.match(w.warnings[0] ?? '', /^"odd": "javascript:" addresses are not opened/);
});

test('an entry with no URL says so — a click never silently does nothing', async () => {
  const w = world();
  assert.equal(await load(w).openSite('bare', undefined), false);
  assert.deepEqual(w.warnings, ['"bare" has no URL.']);
});

test('an editor that declines, or throws, is a warning naming the address', async () => {
  const declined = world('decline');
  assert.equal(await load(declined).openSite('a', 'https://a.example'), false);
  assert.match(declined.warnings[0] ?? '', /^"a": VS Code did not open https:\/\/a\.example\//);

  const threw = world('throw');
  assert.equal(await load(threw).openSite('a', 'https://a.example'), false);
  assert.match(threw.warnings[0] ?? '', /^"a": could not open https:\/\/a\.example\/ — .*no browser here/);
});

// ---------- the context-menu path, through the PIN gate ----------

const details: EntityMetadata = { id: 'e1', name: 'godaddy', isSshEnabled: false, kind: 'credential', pinProtected: true };

/**
 * Only `getFieldsRaw` is reached — `admit` is the stub above — and it answers ONLY for the entry
 * asked about, so reading the wrong account or id finds nothing. Cast to the storage type because
 * the real one is a class with a keychain behind it; this fake is the one method the path uses.
 */
function storage(fields: string | undefined): never {
  const only = (accountId: string, entityId: string) =>
    Promise.resolve(accountId === 'acc' && entityId === 'e1' ? fields : undefined);
  return { getFieldsRaw: only } as never;
}

test('the menu opens the CURRENT stored url once the entry is admitted', async () => {
  const w = world();
  const sealed = `SEALED:${JSON.stringify({ url: 'https://www.godaddy.com/login' })}`;
  const opened = await load(w).openEntrySite(storage(sealed), 'acc', details);
  assert.equal(opened, true);
  assert.deepEqual(w.opened, ['https://www.godaddy.com/login']);
});

test('a declined PIN opens nothing and says nothing more — the person chose not to', async () => {
  const w = world();
  const opened = await load(w, { kind: 'declined' }).openEntrySite(storage(JSON.stringify({ url: 'https://x.example' })), 'acc', details);
  assert.equal(opened, false);
  assert.deepEqual(w.opened, []);
  assert.deepEqual(w.warnings, []);
});

test('a wrong PIN opens nothing and shows the gate\'s own reason', async () => {
  const w = world();
  const opened = await load(w, { kind: 'refused', reason: 'That PIN does not open "godaddy".' }).openEntrySite(
    storage(JSON.stringify({ url: 'https://x.example' })),
    'acc',
    details,
  );
  assert.equal(opened, false);
  assert.deepEqual(w.opened, []);
  assert.deepEqual(w.warnings, ['That PIN does not open "godaddy".']);
});

test('a PIN-protected entry that turns out to have no URL says so after the PIN', async () => {
  const w = world();
  const opened = await load(w).openEntrySite(storage(`SEALED:${JSON.stringify({ login: 'me' })}`), 'acc', details);
  assert.equal(opened, false);
  assert.deepEqual(w.warnings, ['"godaddy" has no URL.']);
});

// ---------- one door ----------

test('only these files hand anything to openExternal — a STORED url only through openSite.ts', () => {
  // The other three open addresses the extension builds itself (a docs link, an OAuth URL, the
  // security-key page). A new caller is a new door for untrusted text, and has to be added here on
  // purpose.
  // Every source file at every depth except the tests, and any mention of the NAME — a destructured
  // `const { openExternal } = vscode.env` would slip past a match on the call.
  const src = path.resolve(__dirname, '..', '..', 'src');
  const callers = sourceFiles(src)
    .filter((f) => /\bopenExternal\b/.test(withoutComments(fs.readFileSync(path.join(src, f), 'utf8'))))
    .sort();
  assert.deepEqual(callers, ['googleAuthProvider.ts', 'keyringWarningHost.ts', 'openSite.ts', 'webauthnPrf.ts']);
});

/** Code only: a doc comment that NAMES openExternal (siteUrl.ts says why it exists) is not a door. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Relative paths of every `.ts` under `dir`, `test/` excluded — `commands/x.ts` included. */
function sourceFiles(dir: string, prefix = ''): string[] {
  return fs
    .readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .flatMap((entry) => filesOf(dir, prefix === '' ? entry.name : `${prefix}/${entry.name}`, entry.isDirectory()));
}

function filesOf(dir: string, rel: string, isDirectory: boolean): string[] {
  if (isDirectory) {
    return rel === 'test' ? [] : sourceFiles(dir, rel);
  }
  return rel.endsWith('.ts') ? [rel] : [];
}
