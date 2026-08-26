import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statusCommand, statusText, statusTooltip } from '../lockStatus';

/**
 * The wording is the whole feature — a status item nobody can read is decoration — so it is a
 * test rather than something checked once on a screenshot.
 */

test('locked and open are distinguishable at a glance, by icon and by word', () => {
  assert.equal(statusText(true, false), '$(lock) Vault locked');
  assert.equal(statusText(false, false), '$(unlock) Vault open');
});

test('syncing outranks both — it is the transient state worth showing while it lasts', () => {
  assert.equal(statusText(true, true), '$(sync~spin) CredsForDevs');
  assert.equal(statusText(false, true), '$(sync~spin) CredsForDevs');
});

test('the locked tooltip says the consequence, not just the state', () => {
  // "Locked" alone does not tell anyone that their background sync has stopped.
  assert.match(statusTooltip(true, false), /background sync is paused/);
  assert.match(statusTooltip(true, false), /Click to unlock/);
});

test('the open tooltip offers the opposite action', () => {
  assert.match(statusTooltip(false, false), /Click to lock/);
  assert.match(statusTooltip(false, false), /cached key/);
});

test('while syncing the tooltip says so rather than claiming a lock state', () => {
  assert.match(statusTooltip(true, true), /syncing/);
});

test('clicking does the opposite of the current state — never a menu of one option', () => {
  assert.equal(statusCommand(true), 'credSshManager.unlockWithSecurityKey');
  assert.equal(statusCommand(false), 'credSshManager.lockVaults');
});

// ---- the status-bar ITEM, which needs the editor -----------------------------------------
//
// The wording above is `lockStatus.ts` and pure. What follows is `statusBar.ts`: the two
// decisions that only exist once there is a real item — that reporting the lock state of NO
// accounts is noise, and that only the locked state earns a colour, because that is the one
// where a background timer has quietly stopped and a person can act on it.

import { loadWithVscode } from './vscodeStub';

type Bar = typeof import('../statusBar');

interface FakeItem {
  text?: string;
  tooltip?: string;
  command?: string;
  backgroundColor?: { id: string };
  visible: boolean;
  disposed: boolean;
}

function world(): { mod: Bar; item: FakeItem; captured: { alignment?: unknown; priority?: unknown } } {
  const item: FakeItem = { visible: false, disposed: false };
  Object.assign(item, {
    show: (): void => {
      item.visible = true;
    },
    hide: (): void => {
      item.visible = false;
    },
    dispose: (): void => {
      item.disposed = true;
    },
  });
  const captured: { alignment?: unknown; priority?: unknown } = {};
  const mod = loadWithVscode<Bar>('../statusBar', {
    window: {
      createStatusBarItem: (alignment: unknown, priority: unknown): FakeItem => {
        captured.alignment = alignment;
        captured.priority = priority;
        return item;
      },
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });
  // The object itself, not a snapshot: it is filled when the bar is CONSTRUCTED, which
  // happens after this returns.
  return { mod, item, captured };
}

test('with no accounts the item hides rather than reporting the state of nothing', () => {
  const w = world();
  const bar = new w.mod.LockStatusBar();

  bar.render(false, 0, false);

  assert.equal(w.item.visible, false);
});

test('an unlocked vault shows, with no colour — ambient state, not an alarm', () => {
  const w = world();
  const bar = new w.mod.LockStatusBar();

  bar.render(false, 2, false);

  assert.equal(w.item.visible, true);
  assert.equal(w.item.backgroundColor, undefined);
  assert.ok((w.item.text ?? '').length > 0);
  assert.ok((w.item.command ?? '').length > 0, 'clicking it does something');
});

test('LOCKED earns the warning colour — it is the state a timer has silently stopped in', () => {
  const w = world();
  const bar = new w.mod.LockStatusBar();

  bar.render(true, 1, false);

  assert.equal(w.item.visible, true);
  assert.equal(w.item.backgroundColor?.id, 'statusBarItem.warningBackground');
});

test('going from locked back to unlocked CLEARS the colour', () => {
  // A colour that outlives its reason is a permanent alarm, which is the same as no alarm.
  const w = world();
  const bar = new w.mod.LockStatusBar();

  bar.render(true, 1, false);
  bar.render(false, 1, false);

  assert.equal(w.item.backgroundColor, undefined);
});

test('syncing changes what it says without changing whether it warns', () => {
  const w = world();
  const bar = new w.mod.LockStatusBar();

  bar.render(false, 1, false);
  const idle = w.item.text;
  bar.render(false, 1, true);

  assert.notEqual(w.item.text, idle);
  assert.equal(w.item.backgroundColor, undefined, 'syncing is not a problem');
});

test('it sits on the right at low priority, out of the way of what people read', () => {
  const w = world();
  new w.mod.LockStatusBar();

  assert.equal(w.captured.alignment, 2, 'StatusBarAlignment.Right');
  assert.equal(w.captured.priority, 40);
});

test('disposing the bar disposes its item', () => {
  const w = world();
  new w.mod.LockStatusBar().dispose();

  assert.equal(w.item.disposed, true);
});
