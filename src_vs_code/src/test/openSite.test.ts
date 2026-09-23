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

function load(w: World, admission: unknown = { kind: 'in' }): OpenSite {
  return loadWithVscode<OpenSite>('../openSite', w.vscode, {
    './pinAdmission': { admit: () => Promise.resolve(admission), openedText: (stored: string | undefined) => Promise.resolve(stored) },
    './pinPrompt': { entryPinGate: () => ({}) },
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
  assert.match(w.warnings[0] ?? '', /"bare": This entry has no URL/);
});

test('an editor that declines, or throws, is a warning naming the address', async () => {
  const declined = world('decline');
  assert.equal(await load(declined).openSite('a', 'https://a.example'), false);
  assert.match(declined.warnings[0] ?? '', /did not open https:\/\/a\.example\//);

  const threw = world('throw');
  assert.equal(await load(threw).openSite('a', 'https://a.example'), false);
  assert.match(threw.warnings[0] ?? '', /Could not open https:\/\/a\.example\/: .*no browser here/);
});

// ---------- the context-menu path, through the PIN gate ----------

const details: EntityMetadata = { id: 'e1', name: 'godaddy', isSshEnabled: false, kind: 'credential' };

function storage(fields: string | undefined): unknown {
  return { getFieldsRaw: () => Promise.resolve(fields) };
}

test('the menu opens the CURRENT stored url once the entry is admitted', async () => {
  const w = world();
  const opened = await load(w).openEntrySite(storage(JSON.stringify({ url: 'https://www.godaddy.com/login' })) as never, 'acc', details);
  assert.equal(opened, true);
  assert.deepEqual(w.opened, ['https://www.godaddy.com/login']);
});

test('a declined PIN opens nothing and says nothing more — the person chose not to', async () => {
  const w = world();
  const opened = await load(w, { kind: 'declined' }).openEntrySite(storage(JSON.stringify({ url: 'https://x.example' })) as never, 'acc', details);
  assert.equal(opened, false);
  assert.deepEqual(w.opened, []);
  assert.deepEqual(w.warnings, []);
});

test('a wrong PIN opens nothing and shows the gate\'s own reason', async () => {
  const w = world();
  const opened = await load(w, { kind: 'refused', reason: 'That PIN does not open "godaddy".' }).openEntrySite(
    storage(JSON.stringify({ url: 'https://x.example' })) as never,
    'acc',
    details,
  );
  assert.equal(opened, false);
  assert.deepEqual(w.opened, []);
  assert.deepEqual(w.warnings, ['That PIN does not open "godaddy".']);
});

test('a PIN-protected entry that turns out to have no URL says so after the PIN', async () => {
  const w = world();
  const opened = await load(w).openEntrySite(storage(JSON.stringify({ login: 'me' })) as never, 'acc', details);
  assert.equal(opened, false);
  assert.match(w.warnings[0] ?? '', /has no URL/);
});

// ---------- one door ----------

test('only these files hand anything to openExternal — a STORED url only through openSite.ts', () => {
  // The other three open addresses the extension builds itself (a docs link, an OAuth URL, the
  // security-key page). A new caller is a new door for untrusted text, and has to be added here on
  // purpose.
  const src = path.resolve(__dirname, '..', '..', 'src');
  const callers = fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.ts') && fs.readFileSync(path.join(src, f), 'utf8').includes('openExternal('))
    .sort();
  assert.deepEqual(callers, ['googleAuthProvider.ts', 'keyringWarningHost.ts', 'openSite.ts', 'webauthnPrf.ts']);
});

test('the viewer panel opens the STORED url of the entry it shows, never a posted value', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'entityViewPanel.ts'), 'utf8');
  assert.ok(panel.includes("if (message.type === 'open' && message.field === 'url') {"), 'the branch');
  assert.ok(panel.includes('await openSite(d.name, options.fields?.url);'), 'the stored value, from the options');
});
