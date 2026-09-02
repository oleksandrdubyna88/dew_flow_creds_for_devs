import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAdditions, applyRemovals } from '../applyFormSecrets';
import { loadWithVscode } from './vscodeStub';
import type { EntityFormValues } from '../entityFormPanel';

/** `importCommands` reaches `vscode` through `dialogs`, so it loads against the shared stub. */
const { importEntities } = loadWithVscode<typeof import('../importCommands')>('../importCommands', {
  window: { showQuickPick: () => Promise.resolve(undefined), showInputBox: () => Promise.resolve(undefined) },
  Uri: { file: (p: string): object => ({ fsPath: p }) },
});

/**
 * The ORDER, asserted — which nothing did until this file existed.
 *
 * <p>Three reviewers said the same thing about S1.4: the invariant was written down, the paths were
 * reordered, and **no test asserted the order on any path**. One of them noticed that a comment in
 * `applyFormSecrets.ts` claimed `entityWriteOrder.test.ts` held it, when that file only tests the
 * sweep's pure arithmetic. A rule with no test is a comment, and this feature's whole history is
 * comments that stopped being true.</p>
 *
 * <p>So these tests record the SEQUENCE of storage calls and assert what came before what. The
 * invariant, once more:</p>
 *
 * <blockquote>An orphaned secret is the only torn state allowed to exist. Adding a reference writes
 * the referent first (secret, then node); removing one writes the referrer first (node, then
 * secret).</blockquote>
 */

/**
 * The setters that DELETE when handed nothing — as opposed to the one that keeps.
 *
 * <p>Written down here because it is genuinely confusing and it is what the whole additions/removals
 * split turns on. `setPassword(undefined)` means *"keep whatever is stored"* and returns without
 * touching the keychain (`storageManager.ts`, and the reason is recorded there: an entity converted
 * between kinds must not lose a password it still needs). Every setter below does the opposite and
 * DELETES, which makes calling it with nothing a removal — and removals belong after the node write.</p>
 *
 * <p>Verified against the implementations rather than assumed, after a test in this very file
 * mislabelled `setPassword` and sent me looking.</p>
 */
const DELETES_WHEN_EMPTY = new Set(['setNotes', 'setFields', 'setConfigBody', 'setPaymentRaw', 'setAttachment', 'setImage']);

/**
 * How one call is recorded. A `deleteX` verb is always a removal and needs no marking; a
 * dual-purpose setter is one only when handed nothing, and `setPassword` never is, because it keeps.
 */
function label(verb: string, value: unknown): string {
  if (verb.startsWith('delete')) {
    return verb;
  }
  return DELETES_WHEN_EMPTY.has(verb) && value === undefined ? `${verb}(delete)` : verb;
}

/** Every storage call, in order, as `verb` strings — the only thing these tests look at. */
function recorder(): { calls: string[]; storage: Record<string, unknown> } {
  const calls: string[] = [];
  const note = (verb: string) => (...args: unknown[]): Promise<void> => {
    calls.push(label(verb, args[2]));
    return Promise.resolve();
  };
  const storage: Record<string, unknown> = {
    addNode: (...a: unknown[]) => note('addNode')(...a, 'node'),
    updateNode: (...a: unknown[]) => note('updateNode')(...a, 'node'),
    setPassword: note('setPassword'),
    deletePassword: note('deletePassword'),
    setPrivateKey: note('setPrivateKey'),
    deletePrivateKey: note('deletePrivateKey'),
    setVpnConfig: note('setVpnConfig'),
    deleteVpnConfig: note('deleteVpnConfig'),
    setDbConnection: note('setDbConnection'),
    deleteDbConnection: note('deleteDbConnection'),
    setNotes: note('setNotes'),
    setFields: note('setFields'),
    setConfigBody: note('setConfigBody'),
    setAttachment: note('setAttachment'),
    setImage: note('setImage'),
    setTotp: note('setTotp'),
    deleteTotp: note('deleteTotp'),
    getNodes: () => [],
    getNode: () => undefined,
  };
  return { calls, storage };
}

/** A form result with nothing set — each test turns on only what it is about. */
function values(over: Partial<EntityFormValues>): EntityFormValues {
  return { details: { id: 'e1', name: 'x', isSshEnabled: false }, ...over } as EntityFormValues;
}

test('the additions pass writes values and never deletes anything', async () => {
  const { calls, storage } = recorder();
  await applyAdditions(storage as never, 'a1', 'e1', values({
    newPassword: 'pw',
    newPrivateKey: 'key',
    newNotes: 'note',
    newTotp: 'otpauth://x',
    clearPrivateKey: true,
    clearTotp: true,
    clearPassword: false,
  }));

  assert.deepEqual(
    calls.filter((c) => c.includes('delete')),
    [],
    'a delete in the additions pass happens BEFORE the node write, which is the torn state Rule A forbids',
  );
  assert.ok(calls.includes('setPassword'));
  assert.ok(calls.includes('setPrivateKey'), 'a clear flag must not suppress a value in this pass');
});

test('the removals pass deletes and never writes a value', async () => {
  const { calls, storage } = recorder();
  await applyRemovals(storage as never, 'a1', 'e1', values({
    newPassword: 'pw',
    newPrivateKey: 'key',
    clearPassword: true,
    clearPrivateKey: true,
    clearTotp: true,
  }));

  assert.deepEqual(calls, ['deletePassword', 'deletePrivateKey', 'deleteTotp', 'setNotes(delete)', 'setFields(delete)', 'setConfigBody(delete)']);
});

test('clearing notes deletes AFTER the node write, not before it', async () => {
  // The review's finding on my own split: `setNotes(undefined)` DELETES, so it is a removal. I had it
  // in the additions pass, arguing the node written afterwards would agree — but the crash happens
  // BEFORE that write, so the node still live at that moment is the OLD one, left claiming a note the
  // keychain no longer has. Exactly the failure Rule A exists to prevent, introduced by its own fix.
  const add = recorder();
  await applyAdditions(add.storage as never, 'a1', 'e1', values({ newNotes: undefined }));
  // `setPassword` is always called and is a no-op when handed nothing — it KEEPS rather than deletes,
  // which is why it is safe on this side of the node write. Filtered out so the assertion is about
  // notes and nothing else.
  assert.deepEqual(add.calls.filter((c) => c !== 'setPassword'), [], 'no deletion in the additions pass');

  const remove = recorder();
  await applyRemovals(remove.storage as never, 'a1', 'e1', values({ newNotes: undefined }));
  assert.ok(remove.calls.includes('setNotes(delete)'), 'the deletion happens in the removals pass');
});

test('a note WITH a value is written in the additions pass and not touched in removals', async () => {
  const add = recorder();
  await applyAdditions(add.storage as never, 'a1', 'e1', values({ newNotes: 'keep me' }));
  assert.deepEqual(add.calls.filter((c) => c !== 'setPassword'), ['setNotes']);

  const remove = recorder();
  await applyRemovals(remove.storage as never, 'a1', 'e1', values({ newNotes: 'keep me' }));
  // Scoped to notes: this fixture leaves `newFields` and `newConfigBody` undefined, and for those two
  // the removals pass correctly deletes — which is the behaviour the test above asserts.
  assert.deepEqual(remove.calls.filter((c) => c.startsWith('setNotes')), [], 'the note is not deleted a moment later');
});

test('importing entries writes every secret BEFORE the node that claims it', async () => {
  // One of three paths my own reviewers found with the order reversed — and the one whose window is
  // per-entity, so a five-entry import had five chances to leave a synced entry claiming a password,
  // notes, a key, a connection string and a one-time-code seed that nobody wrote.
  const { calls, storage } = recorder();

  const count = await importEntities(
    storage as never,
    { accountId: 'a1', parentId: null },
    [
      {
        name: 'prod',
        details: { name: 'prod', isSshEnabled: false },
        secrets: { password: 'pw', notes: 'n', privateKey: 'k', dbConnection: 'c', totp: 'otpauth://x' },
      } as never,
    ],
  );

  assert.equal(count, 1);
  const node = calls.indexOf('addNode');
  assert.ok(node >= 0, 'the node was written');
  for (const secret of ['setPassword', 'setNotes', 'setPrivateKey', 'setDbConnection', 'setTotp']) {
    const at = calls.indexOf(secret);
    assert.ok(at >= 0, `${secret} was written`);
    assert.ok(at < node, `${secret} must come before addNode — it came after (${calls.join(' → ')})`);
  }
});

test('importing writes no deletions at all, because an import has nothing to delete', async () => {
  // The reason each write became conditional: `setPassword(undefined)` DELETES, and calling it on a
  // brand-new entry is a removal on the wrong side of the node write for no benefit.
  const { calls, storage } = recorder();
  await importEntities(storage as never, { accountId: 'a1', parentId: null }, [
    { name: 'bare', details: { name: 'bare', isSshEnabled: false }, secrets: {} } as never,
  ]);
  assert.deepEqual(calls, ['addNode'], 'a bare entry writes its node and nothing else');
});
