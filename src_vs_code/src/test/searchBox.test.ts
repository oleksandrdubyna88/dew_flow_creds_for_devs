import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SearchBoxLike, wireSearchBox } from '../searchBox';

/**
 * T15 — the filter that cancelled itself. The defect was one missing flag: without
 * `ignoreFocusOut`, clicking a search RESULT hid the box, and the hide handler — unable to
 * tell that from Escape — restored the empty filter and took the result away.
 */

class FakeBox implements SearchBoxLike {
  ignoreFocusOut = false;
  title = '';
  value = '';
  placeholder = '';
  prompt = '';
  shown = false;
  disposed = false;
  private changeHandler: (value: string) => void = () => {};
  private acceptHandler: () => void = () => {};
  private hideHandler: () => void = () => {};

  onDidChangeValue(handler: (value: string) => void): void { this.changeHandler = handler; }
  onDidAccept(handler: () => void): void { this.acceptHandler = handler; }
  onDidHide(handler: () => void): void { this.hideHandler = handler; }
  show(): void { this.shown = true; }
  hide(): void { this.hideHandler(); }
  dispose(): void { this.disposed = true; }

  type(value: string): void { this.value = value; this.changeHandler(value); }
  pressEnter(): void { this.acceptHandler(); }
  pressEscape(): void { this.hideHandler(); }
}

function applied(): { terms: string[]; apply: (t: string) => void } {
  const terms: string[] = [];
  return { terms, apply: (t) => terms.push(t) };
}

test('the box survives focus leaving it — the whole defect was this flag', () => {
  const box = new FakeBox();
  wireSearchBox(box, { before: '', apply: () => {} });
  assert.equal(
    box.ignoreFocusOut,
    true,
    'without ignoreFocusOut, clicking a filtered result hides the box and the hide handler ' +
      'restores the previous (empty) filter — the search cancels itself when used',
  );
});

test('typing filters live; Enter keeps the term', () => {
  const box = new FakeBox();
  const log = applied();
  wireSearchBox(box, { before: '', apply: log.apply });
  box.type('aws');
  box.pressEnter();
  assert.deepEqual(log.terms, ['aws'], 'Enter must not restore or re-apply anything');
  assert.equal(box.disposed, true);
});

test('Escape restores what was filtered before — a cancelled search is not a lost one', () => {
  const box = new FakeBox();
  const log = applied();
  wireSearchBox(box, { before: 'old-term', apply: log.apply });
  box.type('aws');
  box.pressEscape();
  assert.deepEqual(log.terms, ['aws', 'old-term']);
  assert.equal(box.disposed, true);
});

test('the box opens holding the current filter, so refining does not start over', () => {
  const box = new FakeBox();
  wireSearchBox(box, { before: 'prod', apply: () => {} });
  assert.equal(box.value, 'prod');
  assert.equal(box.shown, true);
});
