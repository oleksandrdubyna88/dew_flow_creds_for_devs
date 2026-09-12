import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { lockSecret } from '../secretEnvelope';
import { loadWithVscode } from './vscodeStub';

/**
 * Issue #55 — the four boxes that ask for an ENTRY's PIN, driven through their REAL validators.
 *
 * <p>The defect: every one of them handed `showInputBox` the vault's validator, so `1234` was refused
 * with <i>"this PIN guards data stored off your machine"</i> — a sentence about the first lock, shown
 * for the second. The fix is a scope on the validator, and a scope is exactly the kind of decision
 * that gets applied at SOME of its sites: the two boxes in `pinPrompt.ts` are the obvious ones, the
 * sibling checks in `pinCommands.ts` and `pinOnCreate.ts` are the ones a grep for `pinValidator` finds
 * and a reader of `pinPrompt.ts` does not. So each of the four is driven here, and the box's own
 * `validateInput` is what is asked — not the policy function, which is tested in `pinPolicy.test.ts`
 * and says nothing about which box calls it.</p>
 *
 * <p>Every test also asks the same validator about a PIN it MUST refuse. A box with no validator at
 * all answers `undefined` to everything, and a suite of "1234 is accepted" alone would be green over
 * it — the positive assertion is what proves the validator is live.</p>
 */

interface InputBoxOptions {
  readonly title?: string;
  readonly prompt?: string;
  readonly validateInput?: (value: string) => unknown;
}

interface Recorded {
  /** Every `showInputBox` raised, in order, with the options it was handed. */
  readonly boxes: InputBoxOptions[];
  readonly stub: Record<string, unknown>;
}

/** A window whose input boxes are recorded and dismissed, and whose modals agree to everything. */
function recording(): Recorded {
  const boxes: InputBoxOptions[] = [];
  return {
    boxes,
    stub: {
      window: {
        showInputBox: (options: InputBoxOptions): Promise<undefined> => {
          boxes.push(options);
          return Promise.resolve(undefined);
        },
        showWarningMessage: (): Promise<string> => Promise.resolve('Protect the rest'),
        showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
        showErrorMessage: (): Promise<undefined> => Promise.resolve(undefined),
      },
      InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    },
  };
}

/** What the box's own validator says about a value — `undefined` is acceptance. */
function verdict(box: InputBoxOptions | undefined, value: string): unknown {
  assert.ok(box !== undefined, 'no input box was shown');
  const validate = box.validateInput;
  assert.ok(validate !== undefined, 'the box carries no validator at all — it would accept anything');
  return validate(value);
}

/** Accepts `1234`, refuses a three-character PIN: the entry scope, and a validator that is live. */
function assertEntryScope(box: InputBoxOptions | undefined): void {
  assert.equal(verdict(box, '1234'), undefined, `the box refused 1234: ${JSON.stringify(verdict(box, '1234'))}`);
  assert.match(JSON.stringify(verdict(box, '123') ?? ''), /at least 4/, 'a three-character PIN is still refused');
}

const folder = (id: string, parentId: string | null = null): TreeNode =>
  ({ id, name: id, type: 'folder', parentId }) as TreeNode;

const entry = (id: string, parentId: string | null): TreeNode =>
  ({ id, name: id, type: 'entity', parentId, details: { id, name: id } }) as TreeNode;

/**
 * A vault whose passwords are real values — one of them REALLY locked — because both sibling checks
 * decide whether to ask from the WRAP, not from a mark. A fixture with `pinProtected: true` and a
 * plain password would never reach the box under test, and the test would pass against nothing.
 */
function vaultWith(nodes: readonly TreeNode[], passwords: Record<string, string>): never {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getNodes: () => nodes,
    getNode: (_a: string, id: string) => nodes.find((n) => n.id === id),
    getPassword: (_a: string, id: string) => Promise.resolve(passwords[id]),
    getNotes: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: nothing,
    getConfigBody: nothing,
    getDbConnection: nothing,
    getVpnConfig: nothing,
    getTotp: nothing,
    getPrivateKey: nothing,
  } as never;
}

test('the box that OPENS a protected entry accepts 1234', async () => {
  const w = recording();
  const mod = loadWithVscode<typeof import('../pinPrompt')>('../pinPrompt', w.stub);

  await mod.entryPinGate('a1', 'e1', 'prod-db').ask('Type the PIN.', 'prod-db');

  assert.match(String(w.boxes[0]?.title), /PIN for "prod-db"/);
  assertEntryScope(w.boxes[0]);
});

test('the box that CHOOSES a new entry PIN accepts 1234 — the recipient of a protected share reaches this one too', async () => {
  // `shareRecipientPin.ts` goes through `newPin`: the recipient wraps ONE imported entry on their own
  // machine, behind their own open vault. That is an entry PIN by nature, and it is classified so here
  // deliberately (the plan round asked). The share PIN that seals ciphertext IN TRANSIT is a different
  // box — `transitPinPrompt.ts` — and its test watches 1234 refused.
  const w = recording();
  const mod = loadWithVscode<typeof import('../pinPrompt')>('../pinPrompt', w.stub);

  await mod.newPin('prod-db', 'entry');

  assert.match(String(w.boxes[0]?.title), /A PIN for "prod-db"/);
  assertEntryScope(w.boxes[0]);
});

/**
 * The scope is asked for, never assumed (the code round of 2026-09-12).
 *
 * <p>`newPin` is a general helper — two boxes and a mismatch rule — and it used to hardcode the
 * ENTRY scope, because every caller it had was an entry PIN. A caller added later that wanted the
 * vault's floor would have got the four-character one silently, which is the one direction a PIN
 * policy must never drift in. The default is the STRICTER scope, so forgetting it costs a refused
 * PIN rather than an accepted one, and each entry caller now says `'entry'` out loud.</p>
 */
test('newPin asked for no scope guards like the VAULT, not like an entry', async () => {
  const w = recording();
  const mod = loadWithVscode<typeof import('../pinPrompt')>('../pinPrompt', w.stub);

  await mod.newPin('a vault');

  const refusal = JSON.stringify(verdict(w.boxes[0], '1234') ?? '');
  assert.match(refusal, /at least 8|ten options per character/, `the default scope accepted 1234: ${refusal}`);
});

test('the folder run’s "type the PIN the others use" box accepts 1234', async () => {
  // One sibling already locked, one still to protect — the only shape in which `protectFolder`
  // asks for the PIN ONCE and checks it, rather than twice with nothing to check against.
  const nodes = [folder('f1'), entry('locked', 'f1'), entry('open', 'f1')];
  const storage = vaultWith(nodes, { locked: await lockSecret('hunter2', 'a1', 'correct-horse-battery'), open: 'swordfish' });
  const w = recording();
  const mod = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', w.stub);

  await mod.protectFolder(nodes[0], { storage, accountId: 'a1', refresh: () => undefined });

  assert.match(String(w.boxes[0]?.title), /PIN for the entries in "f1"/);
  assertEntryScope(w.boxes[0]);
});

test('the "this folder’s entries are protected" box on Add accepts 1234', async () => {
  const nodes = [folder('f1'), entry('locked', 'f1')];
  const storage = vaultWith(nodes, { locked: await lockSecret('hunter2', 'a1', 'correct-horse-battery') });
  const w = recording();
  const mod = loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', w.stub);

  assert.deepEqual(await mod.pinForNewEntry(storage, 'a1', 'f1'), { kind: 'cancelled' }, 'dismissed, so nothing is created');
  assert.match(String(w.boxes[0]?.title), /entries are protected/);
  assertEntryScope(w.boxes[0]);
});
