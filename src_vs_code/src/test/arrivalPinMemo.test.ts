import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FolderQuestion, Landing, arrivalPins } from '../arrivalPin';
import type { CreatePin } from '../pinOnCreate';

/**
 * The arrival memo on its own (`arrivalPin.ts`, free of `vscode`): which folder an arrival is asked in, and
 * which answer a folder the same command CREATED hands on — the second code round's findings on the security
 * review's fixes 3 and 5 (`PLAN_pin_folder_asks_on_accept_and_import.md` §10.1).
 */

const ACCOUNT = 'acc';
const NONE: CreatePin = { kind: 'none' };
const KEYS_PIN: CreatePin = { kind: 'pin', pin: 'keys-pin-1357' };

/** A question that answers from tables and records what it was asked, in order. */
function recorded(answers: { ask?: Record<string, CreatePin>; first?: CreatePin[]; prefers?: readonly string[] } = {}): { question: FolderQuestion; asked: string[] } {
  const asked: string[] = [];
  const firsts = [...(answers.first ?? [])];
  return {
    asked,
    question: {
      ask: (_accountId, folderId) => {
        asked.push(`ask:${folderId}`);
        return Promise.resolve(answers.ask?.[folderId] ?? NONE);
      },
      prefers: (_accountId, folderId) => (answers.prefers ?? []).includes(folderId),
      first: () => {
        asked.push('first');
        return Promise.resolve(firsts.shift() ?? NONE);
      },
    },
  };
}

const landing = (existing: string | null, ...creates: { name: string; folderAsksForPin?: boolean }[]): Landing => ({ accountId: ACCOUNT, existing, creates });

test('a folder the landing creates that asks for a PIN is asked even inside a plain folder the same command created', async () => {
  const { question, asked } = recorded({ first: [KEYS_PIN] });
  const pins = arrivalPins(question);
  const project = landing(null, { name: 'Project' });
  assert.deepEqual(await pins.settledFor(project), NONE, 'precondition: the plain folder asks nothing');
  pins.created(project, ['project-id']);

  const secrets = await pins.settledFor(landing('project-id', { name: 'Secrets', folderAsksForPin: true }));

  assert.deepEqual(secrets, KEYS_PIN, `the folder that asks took its plain parent's "no PIN" — its entries would be written in the clear (asked: ${asked.join(', ')})`);
});

const DECLINED: CreatePin = { kind: 'cancelled' };

/** One landing that creates a plain `Docs` and, inside it, `Keys` — which asks for a PIN. */
const DOCS_THEN_KEYS = landing(null, { name: 'Docs' }, { name: 'Keys', folderAsksForPin: true });

test('the answer of a folder that asks is handed to it and below — not to the plain folder above it', async () => {
  const { question, asked } = recorded({ first: [KEYS_PIN] });
  const pins = arrivalPins(question);
  assert.deepEqual(await pins.settledFor(DOCS_THEN_KEYS), KEYS_PIN, 'precondition: Keys was asked its first PIN');
  pins.created(DOCS_THEN_KEYS, ['docs-id', 'keys-id']);

  assert.deepEqual(await pins.settledFor(landing('keys-id')), KEYS_PIN, 'a later arrival into Keys is Keys\' question, already answered');
  const docs = await pins.settledFor(landing('docs-id'));

  assert.deepEqual(docs, NONE, 'a later arrival into the plain Docs was sealed under the PIN of Keys, the folder below it');
  assert.deepEqual(asked, ['first', 'ask:docs-id'], 'Docs is asked what Add asks there');
});

test('a decline in a folder that asks is not handed to the plain folder above it', async () => {
  const { question } = recorded({ first: [DECLINED] });
  const pins = arrivalPins(question);
  await pins.settledFor(DOCS_THEN_KEYS);
  pins.created(DOCS_THEN_KEYS, ['docs-id', 'keys-id']);

  assert.deepEqual(await pins.settledFor(landing('docs-id')), NONE, 'a later arrival into the plain Docs was blocked by the decline of Keys below it');
});

test('recording what a landing created asks no question of its own — it is called while writing', async () => {
  const { question, asked } = recorded({ prefers: ['top-id'] });
  const pins = arrivalPins(question);

  pins.created(landing('top-id', { name: 'New' }), ['new-id']);

  assert.deepEqual(asked, [], 'created() raised a PIN box in the middle of the writes');
});

test('a decline a created folder inherited names the folder that was asked — not the created one, and not none', async () => {
  const { question } = recorded({ ask: { 'top-id': DECLINED }, prefers: ['top-id'] });
  const pins = arrivalPins(question);
  const intoSub = landing('top-id', { name: 'Sub' });
  assert.deepEqual(await pins.settledFor(intoSub), DECLINED, 'precondition: the folder that asks was declined');
  pins.created(intoSub, ['sub-id']);

  const inside = landing('sub-id');
  const deeper = landing('sub-id', { name: 'Deeper' });

  assert.deepEqual(await pins.settledFor(inside), DECLINED, 'precondition: the decline is inherited');
  assert.deepEqual(pins.askedFolder(inside), { accountId: ACCOUNT, folderId: 'top-id' }, 'the decline names the wrong folder');
  assert.deepEqual(pins.askedFolder(deeper), { accountId: ACCOUNT, folderId: 'top-id' }, 'the decline names no folder');
});
