import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * What a locked vault is OFFERED, and what pressing it does.
 *
 * <p>The offer used to live inside `syncManager`, unreachable from a test, and it drifted
 * away from the readiness icon that answers the same question: a vault locked by a timer was
 * invited to *Set Sync PIN* — which does not unlock anything. It runs `rekeyToNewPin`, so the
 * vault is re-wrapped under a new PIN and written to the sync location, and every other
 * machine stops opening the file. That is the reason the dispatch below is worth a test: the
 * two buttons are not two labels, they are an unlock and a fleet-wide credential rotation.</p>
 */

type Prompt = typeof import('../lockedVaultPrompt');

const A: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'google' };
const B: StoredAccount = { accountId: 'b2', email: 'other@corp.com', provider: 'google' };

interface World {
  mod: Prompt;
  prompts: { message: string; buttons: string[] }[];
  commands: { command: string; args: unknown[] }[];
  quickPickTitles: string[];
  logs: string[];
}

/** `press` is the button label the person clicks, or undefined for a dismissed notification. */
function world(press?: string, quickPick?: 'first' | 'none'): World {
  const w: World = { mod: undefined as never, prompts: [], commands: [], quickPickTitles: [], logs: [] };
  w.mod = loadWithVscode<Prompt>('../lockedVaultPrompt', {
    window: {
      showWarningMessage: (message: string, ...buttons: string[]): Promise<string | undefined> => {
        w.prompts.push({ message, buttons });
        return Promise.resolve(press);
      },
      showQuickPick: (items: { account: StoredAccount }[], options: { title: string }): Promise<unknown> => {
        w.quickPickTitles.push(options.title);
        return Promise.resolve(quickPick === 'first' ? items[0] : undefined);
      },
    },
    commands: {
      executeCommand: (command: string, ...args: unknown[]): Promise<undefined> => {
        w.commands.push({ command, args });
        return Promise.resolve(undefined);
      },
    },
  });
  return w;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

function offer(w: World, parts: { storedPin?: string; throws?: boolean; setPinThrows?: boolean }): {
  offer: Parameters<Prompt['offerUnlock']>[1];
  setPinCalls: string[];
} {
  const setPinCalls: string[] = [];
  return {
    setPinCalls,
    offer: {
      storedPin: (): Promise<string | undefined> =>
        parts.throws === true
          ? Promise.reject(new Error('the keychain refused'))
          : Promise.resolve(parts.storedPin),
      setPin: (account: StoredAccount): Promise<void> => {
        setPinCalls.push(account.email);
        return parts.setPinThrows === true ? Promise.reject(new Error('cancelled')) : Promise.resolve();
      },
      log: (message: string): void => {
        w.logs.push(message);
      },
    },
  };
}

test('pressing Unlock runs the unlock command, and nothing re-keys the vault', async () => {
  const w = world('Unlock…');
  const o = offer(w, { storedPin: '4242' });

  await w.mod.offerUnlock(A, o.offer);

  assert.deepEqual(w.commands.map((c) => c.command), ['credSshManager.unlockWithSecurityKey']);
  assert.deepEqual(w.commands[0].args, [A], 'the account it was raised for, not a picker');
  assert.deepEqual(o.setPinCalls, [], 'a lock is not a PIN problem');
});

test('pressing Set Sync PIN — offered only where there is none — runs setPin', async () => {
  const w = world('Set Sync PIN…');
  const o = offer(w, { storedPin: undefined });

  await w.mod.offerUnlock(A, o.offer);

  assert.deepEqual(o.setPinCalls, ['me@corp.com']);
  assert.deepEqual(w.commands, [], 'and it does not also try to unlock');
});

test('a dismissed notification does nothing at all', async () => {
  const w = world(undefined);
  const o = offer(w, { storedPin: undefined });

  await w.mod.offerUnlock(A, o.offer);

  assert.deepEqual(w.commands, []);
  assert.deepEqual(o.setPinCalls, []);
});

test('a vault with a stored PIN is never offered the re-key button', async () => {
  const w = world(undefined);
  const o = offer(w, { storedPin: '4242' });

  await w.mod.offerUnlock(A, o.offer);

  assert.deepEqual(w.prompts.at(-1)?.buttons, ['Unlock…']);
});

test('a keychain that throws leaves the re-key button off the notification', async () => {
  // "Is a PIN stored" has three answers, and the unknown one must not surface the destructive
  // action: an OS keychain hiccup on a machine whose PIN is fine would otherwise put a
  // fleet-wide rotation one click away.
  const w = world(undefined);
  const o = offer(w, { throws: true });

  await w.mod.offerUnlock(A, o.offer);

  assert.deepEqual(w.prompts.at(-1)?.buttons, ['Unlock…']);
});

test('a failing action is logged, never left as an unhandled rejection', async () => {
  // The offer is raised from a cycle nobody awaits. A rejection escaping here would take
  // down the extension host with a stack nobody can trace back to a notification.
  const w = world('Set Sync PIN…');
  const o = offer(w, { storedPin: undefined, setPinThrows: true });

  w.mod.showUnlockOffer(A, o.offer);
  await settle();

  assert.equal(w.logs.length, 1);
  assert.match(w.logs[0], /me@corp\.com/);
});

test('several locked vaults are one message, and choosing one offers it the same buttons', async () => {
  // The button on the multi-vault message cannot act on "the" account, so it asks which —
  // and that vault then gets exactly the offer a single one would have had.
  const w = world('Unlock…', 'first');
  const o = offer(w, { storedPin: '4242' });

  w.mod.reportLockedVaults([A, B], o.offer);
  await settle();

  assert.equal(w.prompts[0].buttons.length, 1, 'the summary offers only "which one"');
  assert.deepEqual(w.quickPickTitles, ['Unlock a vault']);
  assert.deepEqual(w.prompts.at(-1)?.buttons, ['Unlock…'], 'and the chosen vault gets the real offer');
});

test('an empty locked list says nothing', () => {
  const w = world(undefined);
  const o = offer(w, { storedPin: '4242' });

  w.mod.reportLockedVaults([], o.offer);

  assert.deepEqual(w.prompts, []);
});
