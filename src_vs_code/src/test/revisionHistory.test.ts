import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_REVISIONS,
  isRevisionList,
  pushRevision,
  revisionHead,
  summarizeRevision,
} from '../revisionHistory';

const rev = (at: number, name = 'prod db') => ({
  at,
  name,
  details: { id: 'e1', name, isSshEnabled: false },
  secrets: { password: `pw-${at}` },
});

test('the newest revision is first, so a viewer reads top-down', () => {
  const list = pushRevision(pushRevision([], rev(1)), rev(2));

  assert.deepEqual(list.map((r) => r.at), [2, 1]);
});

test('only the last three are kept, and it is the OLDEST that goes', () => {
  let list = pushRevision([], rev(1));
  for (const at of [2, 3, 4, 5]) {
    list = pushRevision(list, rev(at));
  }

  assert.equal(list.length, MAX_REVISIONS);
  assert.deepEqual(list.map((r) => r.at), [5, 4, 3]);
});

test('three is the cap the operator asked for', () => {
  assert.equal(MAX_REVISIONS, 3);
});

test('pushing never mutates the list it was given', () => {
  const before = pushRevision([], rev(1));
  const after = pushRevision(before, rev(2));

  assert.equal(before.length, 1);
  assert.equal(after.length, 2);
});

test('a revision is summarized by when and what it was called', () => {
  const text = summarizeRevision(rev(1_700_000_000_000, 'staging db'));

  assert.match(text, /staging db/);
  // A date the reader can act on, not a raw epoch.
  assert.equal(/^\d+$/.test(text), false);
});

test('a stored list that is not a list of revisions is refused, never half-read', () => {
  // This comes back from storage as JSON written by a possibly older version; reading it
  // optimistically is how one bad record takes out the whole history view.
  assert.equal(isRevisionList([rev(1)]), true);
  assert.equal(isRevisionList([]), true);
  assert.equal(isRevisionList('nope'), false);
  assert.equal(isRevisionList([{ at: 'yesterday' }]), false);
  assert.equal(isRevisionList([{ name: 'x' }]), false);
  assert.equal(isRevisionList(null), false);
});

test('attachments are not part of a revision — states the limit rather than hiding it', () => {
  // Three copies of a 4 MB image per entity would multiply the vault by more than the
  // history is worth; the fields a revision carries are the small ones.
  const pushed = pushRevision([], {
    ...rev(1),
    secrets: { password: 'pw', attachment: 'BIG', image: 'BIG' } as never,
  });

  assert.equal('attachment' in pushed[0].secrets, false);
  assert.equal('image' in pushed[0].secrets, false);
  assert.equal(pushed[0].secrets.password, 'pw');
});

test('a replaced TOTP seed is kept — an old seed still produces codes somebody may need', () => {
  const pushed = pushRevision([], {
    ...rev(1),
    secrets: { totp: 'otpauth://totp/code?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30' },
  });

  assert.equal(pushed[0].secrets.totp, 'otpauth://totp/code?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30');
});

test('a head carries everything the tree draws and none of the secrets', () => {
  // The tree caches heads for the whole session so a row can be built synchronously. A
  // cache of full revisions would keep every replaced password resident for hours.
  const head = revisionHead({
    at: 1_700_000_000_000,
    name: 'before',
    details: { id: 'e', name: 'before', isSshEnabled: false, host: 'h' },
    secrets: { password: 'hunter2', notes: 'private' },
  });

  assert.deepEqual(Object.keys(head).sort(), ['at', 'details', 'name']);
  assert.equal('secrets' in head, false);
  assert.equal(JSON.stringify(head).includes('hunter2'), false);
  assert.equal(summarizeRevision(head).includes('"before"'), true, 'a head is enough for the row label');
});
