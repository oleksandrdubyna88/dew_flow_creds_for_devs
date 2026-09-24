import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../entityFormPage';
import { formPageScript } from '../entityFormScript';
import { isEntityMetadata } from '../types';
import type { EntityFormOptions } from '../entityFormShape';
import { loadWithVscode } from './vscodeStub';

/** Issue #122 — the *Not for export* box: drawn in General, posted, kept by the save, admitted by the guard. */

function form(over: Partial<EntityFormOptions> = {}): EntityFormOptions {
  // No cast: a field the real type starts to require fails to compile here.
  return {
    mode: 'edit',
    entityId: 'e1',
    initial: { id: 'e1', name: 'x', isSshEnabled: false },
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
    jumpCandidates: [],
    ...over,
  };
}

/** The General section's markup — from its opening to the section after it. */
function generalSection(html: string): string {
  const start = html.indexOf('id="generalSection"');
  const end = html.indexOf('id="connectionSection"');
  assert.ok(start >= 0 && end > start, 'the General and Connection sections must both be drawn');
  return html.slice(start, end);
}

test('the box is drawn in General, unticked on an unmarked entry and ticked on a marked one', () => {
  const plain = generalSection(renderHtml(form()));
  assert.match(plain, /<input id="notForExport" type="checkbox">/);
  assert.match(plain, /<label for="notForExport">Not for export<\/label>/);

  const marked = generalSection(renderHtml(form({ initial: { id: 'e1', name: 'x', isSshEnabled: false, notForExport: true } })));
  assert.match(marked, /<input id="notForExport" type="checkbox" checked>/);
});

test('the hint says what the mark does NOT stop', () => {
  const general = generalSection(renderHtml(form()));
  assert.match(general, /Agents, backup,\s+sync and your own use are unaffected/);
  assert.match(general, /older version of this extension does not know the\s+mark/);
});

test('an entry authored for someone else has no box — nothing of it stays here to mark', () => {
  const html = renderHtml(form({ mode: 'create', initial: undefined, forSomeoneElse: true }));
  assert.equal(html.includes('id="notForExport"'), false);
});

test('the page posts the box under its own key', () => {
  assert.ok(formPageScript('n', undefined).includes("notForExport: chk('notForExport')"), 'the save payload must carry the box');
});

type Panel = typeof import('../entityFormPanel');

const panel = (): Panel =>
  loadWithVscode<Panel>('../entityFormPanel', {
    window: { createWebviewPanel: () => ({}), showErrorMessage: () => Promise.resolve(undefined) },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({ fsPath: '' }) },
    ViewColumn: { One: 1 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
      dispose(): void {}
    },
  });

const posted = (extra: Record<string, unknown>): Record<string, unknown> => ({
  name: 'an entry',
  entityType: 'credential',
  lifetime: 'keep',
  ...extra,
});

test('the save keeps the mark, and an unticked box REMOVES it — a field missing here is deleted', () => {
  const p = panel();
  assert.equal(p.toValues(posted({ notForExport: true }), form()).details.notForExport, true);
  const marked = form({ initial: { id: 'e1', name: 'x', isSshEnabled: false, notForExport: true } });
  assert.equal(p.toValues(posted({ notForExport: false }), marked).details.notForExport, undefined);
});

test('a posted mark on an entry for someone else is ignored — they never saw the switch', () => {
  const values = panel().toValues(posted({ notForExport: true }), form({ mode: 'create', forSomeoneElse: true }));
  assert.equal(values.details.notForExport, undefined);
});

test('the record guard admits the mark and refuses a non-boolean — sync and import keep it', () => {
  const base = { id: 'e1', name: 'x', isSshEnabled: false };
  assert.equal(isEntityMetadata({ ...base, notForExport: true }), true);
  assert.equal(isEntityMetadata({ ...base, notForExport: 'yes' }), false);
});
