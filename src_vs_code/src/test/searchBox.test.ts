import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchBoxOpener, SearchBoxLike, wireSearchBox } from '../searchBox';

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
  constructor(private readonly screen?: FakeScreen) {}
  private changeHandler: (value: string) => void = () => {};
  private acceptHandler: () => void = () => {};
  private hideHandler: () => void = () => {};

  onDidChangeValue(handler: (value: string) => void): void { this.changeHandler = handler; }
  onDidAccept(handler: () => void): void { this.acceptHandler = handler; }
  onDidHide(handler: () => void): void { this.hideHandler = handler; }
  show(): void { this.shown = true; this.screen?.shown(this); }
  hide(): void { this.hideHandler(); }
  dispose(): void { this.disposed = true; }

  type(value: string): void { this.value = value; this.changeHandler(value); }
  pressEnter(): void { this.acceptHandler(); }
  pressEscape(): void { this.hideHandler(); }
}

/**
 * What VS Code does with input boxes: one is on screen, and showing another HIDES the first —
 * which fires the first one's `onDidHide`, exactly as Escape does.
 */
class FakeScreen {
  readonly boxes: FakeBox[] = [];
  private current: FakeBox | undefined;

  readonly create = (): FakeBox => {
    const box = new FakeBox(this);
    this.boxes.push(box);
    return box;
  };

  shown(box: FakeBox): void {
    const previous = this.current;
    this.current = box;
    if (previous !== undefined && previous !== box && !previous.disposed) {
      previous.pressEscape();
    }
  }
}


/** The tree's filter as the box sees it: `apply` sets it and logs it, `current` reads it, and a change from outside goes through `setFromOutside`. */
function applied(initial = ''): {
  terms: string[];
  apply: (t: string) => void;
  current: () => string;
  setFromOutside: (t: string) => void;
} {
  const terms: string[] = [];
  let query = initial;
  return {
    terms,
    apply: (t) => {
      terms.push(t);
      query = t;
    },
    current: () => query,
    setFromOutside: (t) => {
      query = t;
    },
  };
}

test('the box survives focus leaving it — the whole defect was this flag', () => {
  const box = new FakeBox();
  wireSearchBox(box, { before: '', apply: () => {}, current: () => '' });
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
  wireSearchBox(box, { before: '', apply: log.apply, current: log.current });
  box.type('aws');
  box.pressEnter();
  assert.deepEqual(log.terms, ['aws'], 'Enter must not restore or re-apply anything');
  assert.equal(box.disposed, true);
});

test('Escape restores what was filtered before — a cancelled search is not a lost one', () => {
  const box = new FakeBox();
  const log = applied('old-term');
  wireSearchBox(box, { before: 'old-term', apply: log.apply, current: log.current });
  box.type('aws');
  box.pressEscape();
  assert.deepEqual(log.terms, ['aws', 'old-term']);
  assert.equal(box.disposed, true);
});

test('the box opens holding the current filter, so refining does not start over', () => {
  const box = new FakeBox();
  wireSearchBox(box, { before: 'prod', apply: () => {}, current: () => 'prod' });
  assert.equal(box.value, 'prod');
  assert.equal(box.shown, true);
});

test('running Search again while the box is open keeps the live filter and reuses the open box', () => {
  const screen = new FakeScreen();
  const openSearch = searchBoxOpener(screen.create);
  const log = applied();
  openSearch({ before: '', apply: log.apply, current: log.current });
  screen.boxes[0].type('aws');

  openSearch({ before: 'aws', apply: log.apply, current: log.current });

  assert.deepEqual(log.terms, ['aws'], 'the first box was hidden by the second and put the old filter back');
  assert.equal(screen.boxes.length, 1, 'a second box was created while the first was open');
  assert.equal(screen.boxes[0].disposed, false);
});

test('once the box is closed — Enter or Escape — the next Search opens a fresh one', () => {
  for (const close of ['pressEnter', 'pressEscape'] as const) {
    const screen = new FakeScreen();
    const openSearch = searchBoxOpener(screen.create);
    const log = applied();
    openSearch({ before: '', apply: log.apply, current: log.current });
    screen.boxes[0][close]();
    openSearch({ before: '', apply: log.apply, current: log.current });
    assert.equal(screen.boxes.length, 2, `${close}: the closed box was reused`);
  }
});

test('a filter cleared from outside while the box is open stays cleared when the box is then escaped', () => {
  const box = new FakeBox();
  const log = applied('prod');
  wireSearchBox(box, { before: 'prod', apply: log.apply, current: log.current });
  log.setFromOutside(''); // title-bar Clear Filter, goToOriginalFolder or revealById
  box.pressEscape();
  assert.equal(log.current(), '', 'Escape put the old filter back over the one the person just cleared');
  assert.deepEqual(log.terms, [], 'the box applied something it had no right to');
});

test('a filter changed from outside after typing is not overwritten by Escape either', () => {
  const box = new FakeBox();
  const log = applied('prod');
  wireSearchBox(box, { before: 'prod', apply: log.apply, current: log.current });
  box.type('aws');
  log.setFromOutside('');
  box.pressEscape();
  assert.equal(log.current(), '');
});

test('Escape still restores when the tree filter is the one the box itself applied last', () => {
  const box = new FakeBox();
  const log = applied('prod');
  wireSearchBox(box, { before: 'prod', apply: log.apply, current: log.current });
  box.type('aws');
  box.type('aws-1');
  box.pressEscape();
  assert.equal(log.current(), 'prod');
});
