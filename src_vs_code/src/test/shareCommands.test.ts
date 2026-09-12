import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityFormOptions } from '../entityFormPanel';
import { ENTITY_KINDS, StoredAccount, TeamMember } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Issue #57 — "Create Entity for…" asks the KIND first.
 *
 * <p>The command picked the sender, picked the recipients, and opened the form with no `lockedKind`
 * — so the form opened on `resolveKind(undefined)`, which is `credential`, and the heading read
 * <i>New entity [credential]</i>. Not a restriction: the selector was alive over all nine kinds. But
 * the normal flow never shows that default (it creates inside a TYPED folder), so from a Team row
 * the kind was a silent default mis-read as "creates only a password".</p>
 *
 * <p>Two decisions are pinned. The kind pick is the FIRST prompt — before the account and the
 * recipients — so a dismissed pick costs nothing, the same shape `pinForNewEntry` has on Add. And
 * the picked kind reaches the form as `initialKind`, not `lockedKind`: `lockedKind` disables the
 * selector and prints <i>"Type is fixed by the folder's type"</i>, which is false here and would force
 * a wrong pick back through account and recipients. The prompt ORDER is recorded in the stub as a
 * person would meet it, so the test says what happened first rather than only what happened.</p>
 */

type Handler = (...args: unknown[]) => unknown;

interface Pick {
  label: string;
  value?: unknown;
  account?: StoredAccount;
}

interface QuickPickOptions {
  readonly title?: string;
  readonly placeHolder?: string;
}

/** A QuickPick's title, or its placeholder when it has none — `pickAccount` sets only the latter. */
const titled = (options?: QuickPickOptions): string | undefined => options?.title ?? options?.placeHolder;

const promptName = (options?: QuickPickOptions): string => titled(options) ?? '(untitled quick pick)';

interface World {
  run(command: string, ...args: unknown[]): Promise<unknown>;
  /** Every prompt a person met, in order: QuickPicks by their title or placeholder, the rest by name. */
  readonly prompts: string[];
  /** The values each QuickPick offered, in the order the picks were raised. */
  readonly offered: unknown[][];
  readonly forms: EntityFormOptions[];
  readonly deliveries: number[];
}

function account(accountId: string, email: string): StoredAccount {
  return { accountId, email, provider: 'google' } as StoredAccount;
}

/** Two accounts, so the sender is ASKED — with one, `pickAccount` answers without a prompt. */
const ACCOUNTS: StoredAccount[] = [account('a1', 'me@example.com'), account('a2', 'also-me@example.com')];

const TEAMMATE = {
  account: account('t1', 'teammate@example.com'),
  location: '/team',
  shareKeyId: 't1',
  isSelf: false,
} as TeamMember;

/**
 * The share commands, registered against a recording host.
 *
 * <p>`kindAnswer` is what the person does at the KIND pick; every other QuickPick takes its first
 * item. The form is a mock reached through the module's own `'../entityFormPanel'` request, so what
 * it records is exactly what the real form would have been handed.</p>
 */
function world(kindAnswer: (items: Pick[]) => Pick | undefined): World {
  const handlers = new Map<string, Handler>();
  const w: World = {
    prompts: [],
    offered: [],
    forms: [],
    deliveries: [],
    run: (command, ...args) => {
      const handler = handlers.get(command);
      assert.ok(handler !== undefined, `${command} is not registered — this test would drive nothing`);
      return Promise.resolve(handler(...args));
    },
  };
  const stub = {
    window: {
      showQuickPick: (items: Pick[], options?: QuickPickOptions): Promise<Pick | undefined> => {
        w.prompts.push(promptName(options));
        w.offered.push(items.map((i) => i.value));
        return Promise.resolve(options?.title === 'Entity type' ? kindAnswer(items) : items[0]);
      },
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
    },
  };
  const mod = loadWithVscode<typeof import('../commands/shareCommands')>('../commands/shareCommands', stub, {
    '../entityFormPanel': {
      showEntityForm: (options: EntityFormOptions): Promise<undefined> => {
        w.prompts.push('entity form');
        w.forms.push(options);
        // Cancelled at the form: what this file tests is everything BEFORE it.
        return Promise.resolve(undefined);
      },
    },
  });
  mod.registerShareCommands({
    register: (command, handler) => handlers.set(command, handler),
    shareInbox: {
      pickRecipients: (): Promise<TeamMember[]> => {
        w.prompts.push('recipients');
        return Promise.resolve([TEAMMATE]);
      },
      deliver: (): Promise<void> => {
        w.deliveries.push(1);
        return Promise.resolve();
      },
    } as never,
    sharing: {} as never,
    storage: {
      getAccounts: () => ACCOUNTS,
      getAccount: (id: string) => ACCOUNTS.find((a) => a.accountId === id),
    } as never,
  });
  return w;
}

const pickDb = (items: Pick[]): Pick | undefined => items.find((i) => i.value === 'db');

test('the kind is asked FIRST — before the account and the recipients — and reaches the form as initialKind', async () => {
  const w = world(pickDb);

  await w.run('credSshManager.createForUser', undefined);

  assert.equal(w.prompts[0], 'Entity type', `the prompts came in this order: ${w.prompts.join(' → ')}`);
  assert.deepEqual(w.prompts, ['Entity type', 'Share from which of your profiles?', 'recipients', 'entity form']);
  assert.equal(w.forms.length, 1, 'the form opened once');
  assert.equal(w.forms[0].initialKind, 'db', 'opened on the picked kind');
  assert.equal(w.forms[0].mode, 'create');
});

test('the picked kind is a suggestion, not a lock — the selector must stay editable', async () => {
  // `lockedKind` prints "Type is fixed by the folder's type", and there is no folder here.
  const w = world(pickDb);

  await w.run('credSshManager.createForUser', undefined);

  assert.equal(w.forms[0]?.lockedKind, undefined, 'no folder dictated this kind');
});

test('the kind list is THE kind list — every entity kind, derived, nothing else', async () => {
  // `dialogs.ts` records what a hand-written kind list cost last time. This proves the command
  // uses the shared picker rather than a copy of its rows.
  const w = world(pickDb);

  await w.run('credSshManager.createForUser', undefined);

  assert.deepEqual(w.offered[0], [...ENTITY_KINDS]);
});

test('a dismissed kind pick creates nothing — no account pick, no recipients, no form, no delivery', async () => {
  const w = world(() => undefined);

  await w.run('credSshManager.createForUser', undefined);

  assert.deepEqual(
    w.prompts,
    ['Entity type'],
    `after the dismissal these still ran: ${w.prompts.slice(1).join(', ') || '(none)'}`,
  );
  assert.equal(w.forms.length, 0, 'no form');
  assert.equal(w.deliveries.length, 0, 'nothing delivered');
});
