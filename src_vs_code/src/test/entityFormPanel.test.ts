import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ENTITY_KINDS, EntityKind } from '../types';

/**
 * What the form's posted data becomes — and specifically, which fields survive the entity's KIND.
 *
 * <p>This module had no test at all, in a repository with 267 of them, and it is the one that
 * decides whether a one-time-code seed is kept or thrown away. The rule also existed TWICE: here,
 * and as `totpSection.kinds` in `formSections.ts`, which is a pure module with its own test. The
 * two disagreed — `config` passed this gate and had no section in the form — and nothing could
 * notice, because only one of the two was ever asserted.</p>
 *
 * <p>These tests pin the behaviour that matters when a seed is at stake: it is accepted for the
 * kind, it is not silently dropped, and the two gates cannot drift apart again.</p>
 */

type Panel = typeof import('../entityFormPanel');

function world(): Panel {
  return loadWithVscode<Panel>('../entityFormPanel', {
    window: { createWebviewPanel: () => ({}), showErrorMessage: () => Promise.resolve(undefined) },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({ fsPath: '' }) },
    ViewColumn: { One: 1 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
      dispose(): void {}
    },
  });
}

/** The smallest posted form that names a kind — every other field left at its empty default. */
const posted = (kind: EntityKind, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'an entry',
  entityType: kind,
  lifetime: 'keep',
  ...extra,
});

/** A real base32 seed, so `parseTotpSecret` has something valid to accept. */
const SEED = 'JBSWY3DPEHPK3PXP';

test('a one-time-code seed is accepted for EVERY kind of entry', () => {
  // The feature: a second factor is not the property of a login. A saved terminal command that
  // runs `aws sso login`, a script that deploys, an SSH key behind a hardware token — each can
  // have a code attached to it, and until 0.92 four of the eight kinds silently refused.
  const panel = world();

  for (const kind of ENTITY_KINDS) {
    const values = panel.toValues(posted(kind, { totp: SEED }), { entityId: 'e1' } as never);

    assert.equal(
      values.details.hasTotp,
      true,
      `${kind}: a pasted seed was dropped instead of stored`,
    );
    assert.notEqual(values.newTotp, undefined, `${kind}: nothing was handed to the caller to store`);
  }
});

test('switching an entry to another kind no longer scrubs its stored seed', () => {
  // The behaviour this changes, stated so nobody re-adds the scrub by accident. It used to be
  // deliberate — "a second factor belongs to a login: keys, commands and scripts have none" — so
  // retyping a credential as a script destroyed the seed without saying so. Now no kind drops it,
  // and the only way to remove one is the explicit "Remove the stored seed" box below.
  const panel = world();

  for (const kind of ENTITY_KINDS) {
    const values = panel.toValues(posted(kind), {
      entityId: 'e1',
      hasStoredTotp: true,
    } as never);

    assert.equal(values.details.hasTotp, true, `${kind}: retyping the entry threw the seed away`);
    assert.equal(values.clearTotp, false, `${kind}: the caller was told to delete the seed`);
  }
});

test('the explicit "remove the stored seed" box still removes it, for every kind', () => {
  // The counterpart of the test above: making the seed universal must not make it unremovable.
  const panel = world();

  for (const kind of ENTITY_KINDS) {
    const values = panel.toValues(posted(kind, { clearTotp: true }), {
      entityId: 'e1',
      hasStoredTotp: true,
    } as never);

    assert.equal(values.clearTotp, true, `${kind}: the box did not clear the seed`);
    // Absent rather than `false`: the flag is only written when it is true.
    assert.notEqual(values.details.hasTotp, true, `${kind}: the entry still claims a seed`);
  }
});

test('an entry with no seed and nothing pasted claims none', () => {
  const panel = world();

  const values = panel.toValues(posted('credential'), { entityId: 'e1' } as never);

  assert.notEqual(values.details.hasTotp, true);
  assert.equal(values.newTotp, undefined);
});

/**
 * The woven password's two edges, both found by reviewers on the branch that added it.
 *
 * <p>The first is the mark outliving the value: ticking Clear deletes the secret, and
 * `passwordWoven` went on standing — so the viewer kept offering a two-column row for an entry
 * with nothing in it, every Show answering "not a whole woven pair", and every automatic path
 * refusing a password that no longer existed.</p>
 *
 * <p>The second is a weave that was REFUSED. The password was stored exactly as typed and nothing
 * on screen said so: a ticked box, a saved entry, and a secret in the clear that looks woven.</p>
 */
test('clearing the password clears the woven MARK with it', () => {
  const panel = world();

  const values = panel.toValues(posted('credential', { clearPassword: true }), {
    entityId: 'e1',
    initial: { passwordWoven: true },
    hasStoredPassword: true,
  } as never);

  assert.equal(values.clearPassword, true);
  assert.equal(values.details.passwordWoven, undefined, 'no value, no property of the value');
});

test('a woven password survives an edit that did not touch it', () => {
  // The other side of the same line: only CLEARING drops the mark. An ordinary save of an entry
  // whose password was not retyped must keep it, or every rename unweaves a secret.
  const panel = world();

  const values = panel.toValues(posted('credential'), {
    entityId: 'e1',
    initial: { passwordWoven: true },
  } as never);

  assert.equal(values.details.passwordWoven, true);
});

test('the "show the next code too" box is kept with the seed it belongs to', () => {
  // Binding a virtual MFA device asks for two consecutive codes. The box is a preference on the
  // entry, so it must survive the save that set it — and it must be stored against the seed that
  // was pasted in the SAME save, not only against one that was already there.
  const panel = world();

  const withSeed = panel.toValues(posted('credential', { totp: SEED, totpShowNext: true }), {
    entityId: 'e1',
  } as never);
  assert.equal(withSeed.details.totpShowNext, true, 'a seed and the box in one save');

  const stored = panel.toValues(posted('credential', { totpShowNext: true }), {
    entityId: 'e1',
    hasStoredTotp: true,
  } as never);
  assert.equal(stored.details.totpShowNext, true, 'an edit that did not retype the seed');
});

test('the preference is absent whenever there is no code for it to be about', () => {
  // Two different ways of having no seed, because they fail differently: never had one, and
  // removing the one there was. Either way a preference about a code that does not exist is
  // state nothing will ever read, and leaving it behind is what makes a stale flag.
  const panel = world();

  const unchecked = panel.toValues(posted('credential', { totp: SEED }), { entityId: 'e1' } as never);
  assert.equal(unchecked.details.totpShowNext, undefined, 'the box was not ticked');

  const noSeed = panel.toValues(posted('credential', { totpShowNext: true }), {
    entityId: 'e1',
  } as never);
  assert.equal(noSeed.details.totpShowNext, undefined, 'ticked, but there is no seed at all');

  const removed = panel.toValues(
    posted('credential', { totpShowNext: true, clearTotp: true }),
    { entityId: 'e1', hasStoredTotp: true } as never,
  );
  assert.equal(removed.details.hasTotp, undefined, 'the seed was removed');
  assert.equal(removed.details.totpShowNext, undefined, 'so the preference goes with it');
});
