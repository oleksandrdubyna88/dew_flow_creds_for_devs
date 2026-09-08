import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
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

test('a secret left untouched is wiped when its time is up', async () => {
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 10);
  assert.equal(clipboard.peek(), 'hunter2', 'it must be pastable immediately');

  await delay(40);

  assert.equal(clipboard.peek(), '', 'the secret must not outlive its window');
});

test("a secret the user has replaced is left alone — we never wipe somebody else's data", async () => {
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 10);
  clipboard.setExternally('a paragraph the user copied afterwards');

  await delay(40);

  assert.equal(clipboard.peek(), 'a paragraph the user copied afterwards');
});

test('clearing reports whether it actually cleared', async () => {
  const clipboard = new FakeClipboard();
  await clipboard.writeText('secret');

  assert.equal(await clearIfUnchanged(clipboard, 'secret'), true);
  assert.equal(await clearIfUnchanged(clipboard, 'secret'), false, 'already gone');
});

test('an empty value never triggers a wipe of unrelated clipboard content', async () => {
  const clipboard = new FakeClipboard();
  clipboard.setExternally('something the user copied');

  await copySecret(clipboard, '', 10);
  await delay(40);

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
test('copying the same secret again restarts its window instead of racing the first', async () => {
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'hunter2', 30);
  await delay(20);
  await copySecret(clipboard, 'hunter2', 30); // the re-copy, 20ms into the first window

  await delay(20); // now past the FIRST timer's deadline, well short of the second's
  assert.equal(
    clipboard.peek(),
    'hunter2',
    "the superseded copy's timer must not wipe the window the person was just promised",
  );

  await delay(30);
  assert.equal(clipboard.peek(), '', 'and the new window still ends');
});

test('a superseded timer never wipes a DIFFERENT secret copied after it', async () => {
  const clipboard = new FakeClipboard();

  await copySecret(clipboard, 'first', 30);
  await copySecret(clipboard, 'second', 300);

  await delay(60);
  assert.equal(clipboard.peek(), 'second', "the first copy's deadline is not the second's");
});
