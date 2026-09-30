import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FREE_TRIES } from '../pinAttempts';
import { lockSecret } from '../secretEnvelope';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * D16 at the two SIBLING checks (entry-PIN plan §5.10) — the boxes that take a PIN for a whole folder
 * and try it on the protected entries already there: *Protect Folder with a PIN…* (`pinCommands`) and
 * Add in a folder whose entries are protected (`pinOnCreate`).
 *
 * <p>The rule: a typed PIN that opens NONE of N protected siblings is one wrong attempt on each of
 * them; a PIN that opens SOME of them charges nobody, because a folder may legitimately hold entries
 * under two PINs and the misses there are not guesses; and while any sibling is cooling the check
 * refuses before the box, saying so — a cooling sibling opens for nobody, so the check would
 * otherwise report "opens none" and invite the person to seal a new entry under a PIN nobody
 * verified.</p>
 *
 * <p>Driven through the real modules with real `lockSecret` wraps; the attempt counter is the real
 * one, observed through `cooldownMs` after pre-charging each sibling with one miss short of the wait.
 * It is the INSTANCE the loaded module captured — `loadWithVscode` rebuilds the graph, so a counter
 * imported at the top of this file would be a different map (the trap `editProtected.test.ts` names).</p>
 */

type Attempts = typeof import('../pinAttempts');
/** The counter the module under test was loaded with. */
const attemptsOfLoaded = (): Attempts => require('../pinAttempts') as Attempts;

const ACCOUNT = 'a1';
const PIN_P = 'correct-horse-battery';
const PIN_Q = 'another-pin-entirely';
const WRONG = 'nobody-uses-this-one';

const folder = (id: string): TreeNode => ({ id, name: id, type: 'folder', parentId: null }) as TreeNode;
const entry = (id: string, parentId: string): TreeNode =>
  ({ id, name: id, type: 'entity', parentId, details: { id, name: id, isSshEnabled: false } }) as TreeNode;

const wraps = new Map<string, Promise<string>>();
function locked(value: string, pin: string): Promise<string> {
  const key = `${value}|${pin}`;
  let wrap = wraps.get(key);
  if (wrap === undefined) {
    wrap = lockSecret(value, ACCOUNT, pin);
    wraps.set(key, wrap);
  }
  return wrap;
}

/** A vault of real values keyed by entity id — the sibling checks decide from the WRAP. */
function vaultWith(nodes: readonly TreeNode[], passwords: Record<string, string>): never {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getNodes: () => nodes,
    getNode: (_a: string, id: string) => nodes.find((n) => n.id === id),
    getPassword: (_a: string, id: string) => Promise.resolve(passwords[id]),
    getNotes: nothing,
    getFieldsRaw: nothing,
    getSecondRaw: nothing,
    getPaymentRaw: nothing,
    getConfigBody: nothing,
    getDbConnection: nothing,
    getVpnConfig: nothing,
    getTotp: nothing,
    getPrivateKey: nothing,
    getHistory: () => Promise.resolve([]),
  } as never;
}

interface Window {
  readonly boxes: number;
  readonly warnings: string[];
  readonly stub: Record<string, unknown>;
}

/**
 * Boxes answered from a queue; the "Protect the rest" run question agreed to; the "Use this PIN"
 * question DECLINED — the charge is decided at the check, before that question, and declining keeps
 * the test off the write path.
 */
function windowAnswering(inputs: (string | undefined)[]): Window {
  const said = { boxes: 0, warnings: [] as string[] };
  return {
    get boxes() {
      return said.boxes;
    },
    warnings: said.warnings,
    stub: {
      window: {
        showInputBox: (): Promise<string | undefined> => {
          said.boxes += 1;
          return Promise.resolve(inputs.shift());
        },
        showWarningMessage: (message: string, ...rest: unknown[]): Promise<string | undefined> => {
          said.warnings.push(message);
          return Promise.resolve(rest.includes('Protect the rest') ? 'Protect the rest' : undefined);
        },
        showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
        showErrorMessage: (): Promise<undefined> => Promise.resolve(undefined),
      },
      InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    },
  };
}

/** Each named sibling one miss short of the wait: the next charge, and only a charge, cools it. */
function chargedToTheEdge(...ids: string[]): void {
  const attempts = attemptsOfLoaded();
  attempts.forgetAllAttempts();
  for (const id of ids) {
    for (let i = 0; i < FREE_TRIES - 1; i += 1) {
      attempts.noteWrong(ACCOUNT, id, Date.now());
    }
  }
}

/** One more miss: the sibling is cooling now. */
function cooled(id: string): void {
  attemptsOfLoaded().noteWrong(ACCOUNT, id, Date.now());
}

/** A folder holding `s1` under PIN P, `s2` under PIN Q, and one plain entry still to protect. */
async function twoPinFolder(): Promise<{ nodes: TreeNode[]; storage: never }> {
  const nodes = [folder('f1'), entry('s1', 'f1'), entry('s2', 'f1'), entry('open', 'f1')];
  const storage = vaultWith(nodes, { s1: await locked('pw-1', PIN_P), s2: await locked('pw-2', PIN_Q), open: 'plain' });
  return { nodes, storage };
}

function cooling(id: string): boolean {
  return attemptsOfLoaded().cooldownMs(ACCOUNT, id, Date.now()) > 0;
}

const onCreate = (w: Window): typeof import('../pinOnCreate') => loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', w.stub);
const onFolder = (w: Window): typeof import('../pinCommands') => loadWithVscode<typeof import('../pinCommands')>('../pinCommands', w.stub);

// ---- Add in a protected folder (pinOnCreate) ----

test('Add: a PIN that opens SOME of the protected siblings charges none of them — a folder may hold two PINs', async () => {
  const { storage } = await twoPinFolder();
  const w = windowAnswering([PIN_P]);
  const mod = onCreate(w);
  chargedToTheEdge('s1', 's2');

  await mod.pinForNewEntry(storage, ACCOUNT, 'f1');

  assert.equal(cooling('s2'), false, 'the miss on the sibling under the OTHER PIN was counted as a guess');
  assert.equal(cooling('s1'), false);
});

test('Add: a PIN that opens NONE of the protected siblings is one wrong attempt on EACH', async () => {
  const { storage } = await twoPinFolder();
  const w = windowAnswering([WRONG]);
  const mod = onCreate(w);
  chargedToTheEdge('s1', 's2');

  await mod.pinForNewEntry(storage, ACCOUNT, 'f1');

  assert.deepEqual([cooling('s1'), cooling('s2')], [true, true], 'a PIN that opens nothing here is a guess against every sibling');
});

test('Add: while any protected sibling is cooling, the check refuses BEFORE the box and says so', async () => {
  const { storage } = await twoPinFolder();
  const w = windowAnswering([PIN_P]);
  const mod = onCreate(w);
  chargedToTheEdge('s2');
  cooled('s2');

  const settled = await mod.pinForNewEntry(storage, ACCOUNT, 'f1');

  assert.deepEqual(settled, { kind: 'cancelled' }, 'no entry may be created under an unverified PIN');
  assert.equal(w.boxes, 0, 'the box was raised although the check could not be run');
  assert.match(w.warnings.join(' '), /Too many wrong PINs for "s2"\. Nothing has been changed — try again in \d+ s\./);
});

// ---- Protect Folder with a PIN… (pinCommands) ----

test('Protect Folder: a PIN that opens SOME of the protected siblings charges none of them', async () => {
  const { nodes, storage } = await twoPinFolder();
  const w = windowAnswering([PIN_P]);
  const mod = onFolder(w);
  chargedToTheEdge('s1', 's2');

  await mod.protectFolder(nodes[0], { storage, accountId: ACCOUNT, refresh: () => undefined });

  assert.equal(w.boxes, 1, 'the folder PIN box was reached');
  assert.equal(cooling('s2'), false, 'the miss on the sibling under the OTHER PIN was counted as a guess');
});

test('Protect Folder: a PIN that opens NONE of the protected siblings is one wrong attempt on EACH', async () => {
  const { nodes, storage } = await twoPinFolder();
  const w = windowAnswering([WRONG]);
  const mod = onFolder(w);
  chargedToTheEdge('s1', 's2');

  await mod.protectFolder(nodes[0], { storage, accountId: ACCOUNT, refresh: () => undefined });

  assert.deepEqual([cooling('s1'), cooling('s2')], [true, true]);
});

test('Protect Folder: while any protected sibling is cooling, the run refuses BEFORE the box and protects nothing', async () => {
  const { nodes, storage } = await twoPinFolder();
  const w = windowAnswering([PIN_Q]);
  const mod = onFolder(w);
  chargedToTheEdge('s1');
  cooled('s1');

  await mod.protectFolder(nodes[0], { storage, accountId: ACCOUNT, refresh: () => undefined });

  assert.equal(w.boxes, 0, 'the box was raised although the check could not be run');
  assert.match(w.warnings.join(' '), /Too many wrong PINs for "s1"\. Nothing has been changed/);
});
