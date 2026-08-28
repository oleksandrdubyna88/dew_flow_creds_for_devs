import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityClicks } from '../entityClick';
import { TreeElement } from '../types';

/**
 * T11 — the whole sequence, driven: one click selects, two open the viewer, and the twisty
 * ends where it started even when the workbench flipped it in between.
 */

function element(id = 'e1'): Extract<TreeElement, { kind: 'node' }> {
  return { kind: 'node', accountId: 'a1', node: { id, name: id, type: 'entity', parentId: null, details: { id, name: id } } } as never;
}

function world(opts: { open: boolean; toggles: boolean; collapsible?: boolean }) {
  const state = { open: opts.open };
  const log: string[] = [];
  const later: Array<() => void> = [];
  const clicks = new EntityClicks({
    isOpen: () => state.open,
    setOpen: (_key, open) => { state.open = open; log.push(`set:${open}`); },
    collapsible: () => opts.collapsible ?? true,
    repaint: () => log.push('repaint'),
    open: async () => {
      log.push('viewer');
      if (opts.toggles) { state.open = !state.open; } // the workbench's own double-click toggle
    },
    later: (fn) => later.push(fn),
  });
  return { clicks, state, log, runLater: () => later.splice(0).forEach((fn) => fn()) };
}

test('one click only selects; the second within the window opens the viewer', async () => {
  const w = world({ open: false, toggles: false });
  await w.clicks.click(element(), 1_000);
  assert.deepEqual(w.log, []);
  await w.clicks.click(element(), 1_200);
  assert.deepEqual(w.log, ['viewer']);
});

test('opening an entry does not change what is expanded — the toggle is undone', async () => {
  const w = world({ open: false, toggles: true });
  await w.clicks.click(element(), 1_000);
  await w.clicks.click(element(), 1_200);
  assert.equal(w.state.open, true, 'the workbench flipped it open');
  w.runLater();
  assert.equal(w.state.open, false, 'and the handler put it back');
  assert.deepEqual(w.log, ['viewer', 'set:false', 'repaint']);
});

test('when nothing flipped, nothing is repainted', async () => {
  const w = world({ open: true, toggles: false });
  await w.clicks.click(element(), 1_000);
  await w.clicks.click(element(), 1_200);
  w.runLater();
  assert.deepEqual(w.log, ['viewer']);
});

test('a row with no twisty is never "restored"', async () => {
  const w = world({ open: false, toggles: true, collapsible: false });
  await w.clicks.click(element(), 1_000);
  await w.clicks.click(element(), 1_200);
  w.runLater();
  assert.deepEqual(w.log, ['viewer']);
});
