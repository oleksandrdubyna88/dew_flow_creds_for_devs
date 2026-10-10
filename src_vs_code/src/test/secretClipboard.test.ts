import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  Clipboard,
  clearIfUnchanged,
  copiedMessage,
  copySecret,
  shouldClear,
  SECRET_CLIPBOARD_TTL_MS,
  secretClipboardTtl,
  setSecretClipboardTtl,
} from '../secretClipboard';

class FakeClipboard implements Clipboard {
  private value = '';

  readText(): Thenable<string> {
    return Promise.resolve(this.value);
  }

  writeText(value: string): Thenable<void> {
    this.value = value;
    return Promise.resolve();
  }

  /** What a different application would see right now. */
  peek(): string {
    return this.value;
  }

  /** Simulates the user copying something else. */
  setExternally(value: string): void {
    this.value = value;
  }
}

/**
 * Every timing test here runs on `node:test`'s mocked `setTimeout`, never on the wall clock.
 *
 * <p>They measure windows of tens of milliseconds, and on real timers a loaded machine that overslept one
 * short wait saw a wipe fire early and failed a full run about once (*copying the same secret again…*,
 * queued for PLAN_wsl_bridge_outlives_its_client.md E5). On the mocked clock time moves only when
 * {@link advance} says so, by exactly that much, so each assertion is about the order of deadlines —
 * the thing under test — and never about how busy the machine was.</p>
 */
function mockedClock(t: TestContext): void {
  t.mock.timers.enable({ apis: ['setTimeout'] });
}

/**
 * Move the mocked clock, then let the wipe that fired finish: its callback starts an async
 * read-then-write of the clipboard, which settles on promise callbacks, not on timers.
 */
async function advance(t: TestContext, ms: number): Promise<void> {
  t.mock.timers.tick(ms);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('a secret left untouched is wiped when its time is up', async (t) => {
  mockedClock(t);
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 10);
  assert.equal(clipboard.peek(), 'hunter2', 'it must be pastable immediately');

  await advance(t, 9);
  assert.equal(clipboard.peek(), 'hunter2', 'not a millisecond early');
  await advance(t, 1);

  assert.equal(clipboard.peek(), '', 'the secret must not outlive its window');
});

test("a secret the user has replaced is left alone — we never wipe somebody else's data", async (t) => {
  mockedClock(t);
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 10);
  clipboard.setExternally('a paragraph the user copied afterwards');

  await advance(t, 10);

  assert.equal(clipboard.peek(), 'a paragraph the user copied afterwards');
});

test('clearing reports whether it actually cleared', async () => {
  const clipboard = new FakeClipboard();
  await clipboard.writeText('secret');

  assert.equal(await clearIfUnchanged(clipboard, 'secret'), true);
  assert.equal(await clearIfUnchanged(clipboard, 'secret'), false, 'already gone');
});

test('an empty value never triggers a wipe of unrelated clipboard content', async (t) => {
  mockedClock(t);
  const clipboard = new FakeClipboard();
  clipboard.setExternally('something the user copied');

  await copySecret(clipboard, '', 10);
  await advance(t, 10);

  assert.equal(shouldClear('something the user copied', ''), false);
});

test('the decision is exact-match, not a prefix or a trim', () => {
  assert.equal(shouldClear('hunter2', 'hunter2'), true);
  assert.equal(shouldClear('hunter2 ', 'hunter2'), false);
  assert.equal(shouldClear('hunter2extra', 'hunter2'), false);
  assert.equal(shouldClear('', ''), false);
});

test('the user is told the clipboard will clear, and when', () => {
  assert.equal(copiedMessage('Password', 45_000), 'Password copied — the clipboard clears in 45s.');
});

test('the configured clipboard TTL is used, and nonsense falls back to the default', () => {
  // One settable default instead of a parameter at eight call sites: a missed site would
  // keep the old timeout silently, which is the bug nobody reports.
  setSecretClipboardTtl(10_000);
  assert.equal(secretClipboardTtl(), 10_000);

  for (const bad of [0, -1, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
    setSecretClipboardTtl(bad);
    assert.equal(secretClipboardTtl(), SECRET_CLIPBOARD_TTL_MS, String(bad));
  }
  setSecretClipboardTtl(SECRET_CLIPBOARD_TTL_MS);
});

/**
 * The share PIN is copied twice — once when it is drawn, once when the share lands, so the window
 * the person is promised starts when they actually go to paste. Both writes are the SAME string,
 * which is what makes this subtle: the first copy's timer still finds its own value on the
 * clipboard and wipes it, EARLIER than the message just told them. A copy must therefore cancel
 * the wipe it is superseding.
 */
test('copying the same secret again restarts its window instead of racing the first', async (t) => {
  mockedClock(t);
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 30);
  await advance(t, 20);
  await copySecret(clipboard, 'hunter2', 30); // the re-copy, 20ms into the first window

  await advance(t, 20); // now past the FIRST timer's deadline, well short of the second's
  assert.equal(
    clipboard.peek(),
    'hunter2',
    "the superseded copy's timer must not wipe the window the person was just promised",
  );

  await advance(t, 10); // exactly the second window's end
  assert.equal(clipboard.peek(), '', 'and the new window still ends');
});

test('a superseded timer never wipes a DIFFERENT secret copied after it', async (t) => {
  mockedClock(t);
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'first', 30);
  await copySecret(clipboard, 'second', 300);

  await advance(t, 60);
  assert.equal(clipboard.peek(), 'second', "the first copy's deadline is not the second's");

  await advance(t, 240);
  assert.equal(clipboard.peek(), '', 'and the second keeps its own deadline');
});
