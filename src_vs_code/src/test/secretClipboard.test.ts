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
