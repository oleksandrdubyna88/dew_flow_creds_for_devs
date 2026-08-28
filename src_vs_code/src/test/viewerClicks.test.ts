import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ViewerClicks, ViewerTab, clickToView } from '../viewerClicks';

/**
 * The owner's model (2026-08-28): one click previews in the shared tab, a double click pins —
 * driven through every ordering a slow keychain can produce.
 */

function world() {
  const log: string[] = [];
  const clicks = new ViewerClicks();
  const pending: Array<() => ViewerTab | 'stale'> = [];
  let previewShows = '';
  const pin = (): boolean => {
    if (previewShows === '') {
      return false;
    }
    log.push(`pin:${previewShows}`);
    previewShows = '';
    return true;
  };
  const click = (key: string, now: number): Promise<void> =>
    clickToView(clicks, key, now, pin, (tab) => {
      pending.push(() => {
        const where = tab();
        log.push(`${where}:${key}`);
        if (where === 'preview') {
          previewShows = key;
        }
        return where;
      });
      return Promise.resolve();
    });
  const arrive = (): void => {
    pending.shift()?.();
  };
  return { click, arrive, log };
}

test('ten single clicks, one tab — each arrival replaces the preview', async () => {
  const w = world();
  for (let i = 0; i < 10; i++) {
    await w.click(`e${i}`, 1_000 + i * 700);
    w.arrive();
  }
  assert.equal(w.log.filter((line) => line.startsWith('preview:')).length, 10);
  assert.equal(w.log.filter((line) => line.startsWith('pinned:')).length, 0);
});

test('a double click on an entry the preview shows pins that tab — nothing is loaded twice', async () => {
  const w = world();
  await w.click('e1', 1_000);
  w.arrive();
  await w.click('e1', 1_200);
  assert.deepEqual(w.log, ['preview:e1', 'pin:e1']);
});

test('a double click that lands while the preview is still loading arrives pinned', async () => {
  const w = world();
  await w.click('e1', 1_000);
  await w.click('e1', 1_200); // the keychain has not answered yet
  w.arrive();
  assert.deepEqual(w.log, ['pinned:e1']);
});

test('a later single click supersedes one that has not arrived — the stale load shows nothing', async () => {
  const w = world();
  await w.click('e1', 1_000);
  await w.click('e2', 1_800);
  w.arrive(); // e1, too late
  w.arrive(); // e2
  assert.deepEqual(w.log, ['stale:e1', 'preview:e2']);
});

test('after a pin the next single click starts a fresh preview, and a double click elsewhere opens its own tab', async () => {
  const w = world();
  await w.click('e1', 1_000);
  w.arrive();
  await w.click('e1', 1_200); // pinned
  await w.click('e2', 5_000);
  w.arrive();
  await w.click('e3', 9_000);
  await w.click('e3', 9_100);
  w.arrive(); // e3 arrives pinned
  assert.deepEqual(w.log, ['preview:e1', 'pin:e1', 'preview:e2', 'pinned:e3']);
});

test('two clicks farther apart than the window are two single clicks', async () => {
  const w = world();
  await w.click('e1', 1_000);
  w.arrive();
  await w.click('e1', 1_600);
  w.arrive();
  assert.deepEqual(w.log, ['preview:e1', 'preview:e1']);
});
