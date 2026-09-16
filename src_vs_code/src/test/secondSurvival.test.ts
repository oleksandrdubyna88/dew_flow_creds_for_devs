import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProfileSnapshot, emptySnapshot, mergeProfiles } from '../syncMerge';
import { SECRET_KINDS } from '../secretMaps';

/**
 * That a sync cannot DELETE a second value — the failure this kind is most likely to have.
 *
 * <p>It is not a hypothetical. The comment on `ProfileSnapshot.payments` records the same bug
 * shipping once: the `SECRET_KINDS` row put payments into the snapshot while the interface did not
 * carry them, so a snapshot coming back from a merge read as an absence and `dropAbsentKinds` deleted
 * the `:payment` key of every entity — "Save a card, let any ordinary change arrive from another
 * machine, lose the card." The sentence under it generalises: a kind added to that table and not to
 * this interface does not fail to sync, it DELETES.</p>
 *
 * <p>So this file asserts the two halves that stop it happening again: the two lists AGREE, and a
 * snapshot from a build that predates the kind contributes nothing rather than erasing.</p>
 */

const NOW = 1_700_000_000_000;

/** One entry, alive on both sides, so the merge has something to carry secrets for. */
function withEntry(extra: Partial<ProfileSnapshot>): ProfileSnapshot {
  return {
    ...emptySnapshot(),
    nodes: [{ id: 'e1', name: 'x', type: 'entity', updatedAt: NOW } as never],
    ...extra,
  };
}

test('the kinds table and the sync snapshot AGREE — the disagreement that deleted payments', () => {
  const snapshot = emptySnapshot() as unknown as Record<string, unknown>;

  for (const kind of SECRET_KINDS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(snapshot, kind.bundleKey),
      `${kind.bundleKey} is a secret kind with no field in ProfileSnapshot — a merge would DELETE it`,
    );
  }
  // The companion: the check is reading a real list, not an empty one.
  assert.ok(SECRET_KINDS.length >= 12, 'every kind was enumerated');
  assert.ok(SECRET_KINDS.some((kind) => kind.bundleKey === 'seconds'), 'including the new one');
});

test('a snapshot from a build that predates the kind does NOT delete the other side’s values', () => {
  // The dangerous direction, and the one the payment bug actually took: the incoming side simply has
  // no `seconds` record at all, which must read as "this peer knows nothing about them", never as
  // "this peer says there are none".
  // The legacy side's edit WINS — a newer node — so it is the snapshot the merge reads first. That
  // is the whole scenario: somebody changes the entry's name on an older machine, its node dominates,
  // and its snapshot has no `seconds` record to offer. Without the fallback, the value is gone.
  const mine = withEntry({ seconds: { e1: '{"password2":"kept"}' } });
  const legacy: ProfileSnapshot = {
    ...emptySnapshot(),
    nodes: [{ id: 'e1', name: 'renamed elsewhere', type: 'entity', updatedAt: NOW + 1000 } as never],
  };
  delete (legacy as { seconds?: unknown }).seconds;

  const merged = mergeProfiles(mine, legacy, NOW).merged;

  assert.equal(merged.nodes[0]?.name, 'renamed elsewhere', 'the legacy side won, which is the setup');
  assert.equal(merged.seconds?.e1, '{"password2":"kept"}', 'and the value it knows nothing about survived');
});

test('and the reverse: a value carried by one side reaches a side that had none', () => {
  const mine = withEntry({});
  const theirs = withEntry({ seconds: { e1: '{"cvv2":"481"}' } });

  const merged = mergeProfiles(mine, theirs, NOW).merged;

  assert.equal(merged.seconds?.e1, '{"cvv2":"481"}', 'it arrives rather than being dropped');
});

test('a second value is not disturbed by an ordinary change arriving from another machine', () => {
  // The shape of the original report: nothing about the second value changed, another edit arrived,
  // and the value was gone.
  const mine = withEntry({ seconds: { e1: '{"pin2":"9137"}' }, notes: { e1: 'mine' } });
  const theirs = withEntry({ seconds: { e1: '{"pin2":"9137"}' }, notes: { e1: 'theirs' } });

  const merged = mergeProfiles(mine, theirs, NOW).merged;

  assert.equal(merged.seconds?.e1, '{"pin2":"9137"}', 'the second value is untouched');
});

test('a self-merge changes nothing, so syncing twice cannot erode a value', () => {
  const mine = withEntry({ seconds: { e1: '{"password2":"kept"}' } });

  const once = mergeProfiles(mine, mine, NOW).merged;
  const twice = mergeProfiles(once, once, NOW).merged;

  assert.deepEqual(twice.seconds, mine.seconds);
});
