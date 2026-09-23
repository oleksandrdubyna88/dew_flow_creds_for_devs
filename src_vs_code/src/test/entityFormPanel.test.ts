import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ENTITY_KINDS, EntityKind, EntityMetadata } from '../types';
import { SHUFFLE_CODES } from '../shuffle';
import { HOST_CHK, chooseAsk, mcpPage } from './mcpFormFixture';
import { runFragment } from './miniDom';
import { mcpSwitchScript } from '../mcpSwitchScript';
import type { McpAccess } from '../mcpAccess';
import type { EntityFormOptions } from '../entityFormShape';

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

/**
 * The cadence round trip on the entity form (#95, S3.2).
 *
 * <p>What the page POSTS is asserted next door, in `mcpSwitchScript.test.ts`. This is what that
 * becomes after `toValues` — the shape written to the vault, which is the only place the per-axis
 * regression is visible: an entry handed an all-off ladder because somebody chose a cadence is an
 * entry that has silently stopped inheriting rights from its folder.</p>
 */
function storedMcp(mcp: McpAccess | undefined, pick: string): unknown {
  const document = mcpPage(mcp);
  const lifted = runFragment(`${HOST_CHK}\n${mcpSwitchScript(mcp)}`, document, ['collectMcp']);
  chooseAsk(document, pick);
  // Through JSON, which is where an `undefined` would vanish on the way to the host.
  const data = JSON.parse(JSON.stringify({ ...posted('credential'), mcp: lifted.collectMcp() }));
  return world().toValues(data, formOptions()).details.mcp;
}

test('saving with only the cadence touched updates ask and leaves the entry ladder ABSENT', () => {
  const stored = storedMcp(undefined, 'never');

  assert.deepEqual(stored, { ask: 'never' }, 'an all-off ladder was written because a cadence was chosen');
});

test('an entry taking its cadence back keeps the switches it had', () => {
  const stored = storedMcp({ view: true, use: true, ask: 'never' }, 'inherit');

  assert.equal((stored as { use?: unknown } | undefined)?.use, true, 'the ladder went with the cadence');
  assert.equal((stored as { ask?: unknown } | undefined)?.ask, undefined, 'and the cadence stayed');
});

/**
 * A real `EntityFormOptions`, with no cast.
 *
 * <p>The file's older tests reach `toValues` with `{ entityId: 'e1' } as never`, which is what the
 * TypeScript rule forbids: a cast is a promise to keep a shape by hand, and it comes due silently
 * when the shape gains a required field. This one is checked, so it breaks instead.</p>
 */
function formOptions(): EntityFormOptions {
  return {
    mode: 'edit',
    entityId: 'e1',
    hasStoredPassword: false,
    hasStoredPrivateKey: false,
    hasStoredAttachment: false,
    hasStoredImage: false,
    hasStoredVpnConfig: false,
    hasStoredDbConnection: false,
    hasStoredTotp: false,
    hasStoredHostKey: false,
    keyCandidates: [],
    jumpCandidates: [],
    dependencyFolders: [],
    dependencyColors: {},
  };
}

test('an entry that touched nothing stores no mcp record at all', () => {
  // The fourth quadrant: no local answer, and Inherit is what the markup already showed — so
  // nothing was touched and nothing was decided, and an untouched save must leave the entry
  // inheriting rather than converting it into one that opted out.
  assert.equal(storedMcp(undefined, 'inherit'), undefined);
});

/* ── the password's own second half is REFUSED, not confirmed (#52, owner decision 4) ──────── */

/**
 * Every dialog the save chain opens, with the buttons it offered. The stub answers each one with
 * "Save anyway" — the worst case: a question with a way through is taken, so only a REFUSAL can
 * stop the save.
 */
interface Dialog {
  readonly text: string;
  readonly buttons: readonly string[];
}

function gatedPanel(): { panel: Panel; dialogs: Dialog[] } {
  const dialogs: Dialog[] = [];
  const panel = loadWithVscode<Panel>('../entityFormPanel', {
    window: {
      createWebviewPanel: () => ({}),
      showErrorMessage: () => Promise.resolve(undefined),
      showWarningMessage: (text: string, ...rest: unknown[]) => {
        const buttons = rest.filter((one): one is string => typeof one === 'string');
        dialogs.push({ text, buttons });
        return Promise.resolve(buttons.includes('Save anyway') ? 'Save anyway' : undefined);
      },
    },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({ fsPath: '' }) },
    ViewColumn: { One: 1 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
      dispose(): void {}
    },
  });
  return { panel, dialogs };
}

/** A password save with weaving on and the person supplying the other half themselves. */
const ownHalf = (password: string, password2: string): Record<string, unknown> =>
  posted('credential', {
    password,
    weavePassword: true,
    weaveMethod: SHUFFLE_CODES[0],
    weaveSecondMode: 'own',
    secondValues: { password2 },
  });

test('a password pair that cannot pair is REFUSED — no "Save anyway", and the save does not happen', async () => {
  // Payment fields have refused a mismatched pair since #52 shipped; the password offered to save
  // itself IN THE CLEAR instead, under a sentence that ended "Nothing has been saved".
  const { panel, dialogs } = gatedPanel();

  const saved = await panel.agreed(ownHalf('hunter2!', 'hunter2x'), formOptions());

  assert.equal(saved, false, 'the save must not happen');
  assert.equal(dialogs.length, 1, 'one message, and it is the refusal');
  assert.match(dialogs[0].text, /different kinds of character/);
  assert.match(dialogs[0].text, /Nothing has been saved/);
  assert.deepEqual(dialogs[0].buttons, [], 'a refusal offers no way through');
});

test('choosing to supply the second password and leaving the box empty is refused the same way', async () => {
  const { panel, dialogs } = gatedPanel();

  const saved = await panel.agreed(ownHalf('hunter2x', ''), formOptions());

  assert.equal(saved, false);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].text, /box is empty/);
  assert.match(dialogs[0].text, /Nothing has been saved/);
  assert.deepEqual(dialogs[0].buttons, []);
});

test('a pair that DOES pair saves, and nothing is asked', async () => {
  // The companion: without it, a gate that refused every own-half save would pass the two above.
  const { panel, dialogs } = gatedPanel();

  assert.equal(await panel.agreed(ownHalf('hunter2x', 'flyfish7'), formOptions()), true);
  assert.deepEqual(dialogs, []);
});

test('a password too short to weave is still a QUESTION, not a refusal — only the pair changed', async () => {
  const { panel, dialogs } = gatedPanel();

  assert.equal(await panel.agreed(ownHalf('a', 'b'), formOptions()), true, '"Save anyway" was taken');
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0].text, /cannot be woven/);
  assert.deepEqual(dialogs[0].buttons, ['Save anyway']);
});

test('editing an entry whose password is already woven, without retyping it, is never refused', async () => {
  // Raised at the plan gate: an edit to the notes must not demand the second half again. The
  // password box is never prefilled, so an untouched password arrives empty — nothing to weave.
  const { panel, dialogs } = gatedPanel();
  // Checked, not cast: a required field added to EntityMetadata breaks this line instead of hiding.
  const initial: EntityMetadata = { id: 'e1', name: 'an entry', isSshEnabled: false, passwordWoven: true };
  const options: EntityFormOptions = { ...formOptions(), initial };

  assert.equal(await panel.agreed(ownHalf('', ''), options), true);
  assert.deepEqual(dialogs, []);
});

test('the #103 fields survive a save WHOLE — the literal toValues writes is what the entry keeps', () => {
  // `toValues` rebuilds `details` from a literal on every save; a field missing from it is deleted
  // by the next unrelated edit. These are the three this issue added, round-tripped.
  const panel = world();

  const terminal = panel.toValues(posted('terminal', { command: 'ls', terminalOs: 'linux' }), { entityId: 't1' } as never);
  assert.equal(terminal.details.terminalOs, 'linux');

  const vpn = panel.toValues(
    posted('vpn', {
      vpnType: 'ikev2',
      vpnLauncherEntityId: 't1',
      dependsOn: [{ targetId: 't1', color: '' }],
      runDependencies: true,
    }),
    { entityId: 'v1' } as never,
  );
  assert.equal(vpn.details.vpnLauncherEntityId, 't1');
  assert.equal(vpn.details.runDependencies, true);
  assert.deepEqual(vpn.details.dependsOn, ['t1']);
});

