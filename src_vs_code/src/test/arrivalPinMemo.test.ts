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
