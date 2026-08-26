import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { StoredAccount } from '../types';

/**
 * Proving there is still a session for THIS account (audit A3).
 *
 * <p>Everything that reaches the vault server goes through this first, so the property that
 * matters is narrow and absolute: a session for a DIFFERENT account of the same provider is
 * not a session for this one. Accepting it would let a person signed in as someone else read
 * an account that is not theirs, and the mistake is easy to make because the silent probe
 * happily returns whoever is signed in.</p>
 *
 * <p>The second case is a defect this module already carries a comment about: the Google
 * provider THROWS from the silent probe when its client id is not configured, and letting
 * that reach the outer catch skipped the "sign in now?" offer entirely — telling the user to
 * sign in, from the command that could have signed them in.</p>
 */

type Auth = typeof import('../authManager');

const ACCOUNT: StoredAccount = { accountId: 'acct-1', email: 'me@corp.com', provider: 'microsoft' };

interface Calls {
  silent: number;
  interactive: number;
  asked: string[];
}

/** One stubbed `getSession` answer: a session, nothing, or the throw a provider can do. */
function session(which: string, result: { id: string } | 'throw' | undefined): Promise<unknown> {
  if (result === 'throw') {
    return Promise.reject(new Error(`${which} provider not configured`));
  }
  return Promise.resolve(
    result === undefined ? undefined : { account: { id: result.id, label: 'me@corp.com' } },
  );
}

function world(options: {
  silent?: { id: string } | 'throw';
  interactive?: { id: string } | 'throw';
  answer?: string;
}): { mod: Auth; calls: Calls } {
  const calls: Calls = { silent: 0, interactive: 0, asked: [] };
  const mod = loadWithVscode<Auth>('../authManager', {
    authentication: {
      getSession: (
        _provider: string,
        _scopes: string[],
        o: { createIfNone?: boolean },
      ): Promise<unknown> => {
        const which = o.createIfNone === true ? 'interactive' : 'silent';
        calls[which] += 1;
        return session(which, which === 'interactive' ? options.interactive : options.silent);
      },
    },
    window: {
      showWarningMessage: (m: string): Promise<string | undefined> => {
        calls.asked.push(m);
        return Promise.resolve(options.answer);
      },
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });
  return { mod, calls };
}

test('a silent session for THIS account is accepted without troubling anyone', async () => {
  const w = world({ silent: { id: 'acct-1' } });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), true);
  assert.deepEqual(w.calls.asked, [], 'no dialog for the ordinary case');
  assert.equal(w.calls.interactive, 0);
});

test('a session for a DIFFERENT account of the same provider is NOT this account', async () => {
  // The whole point. Accepting it would let whoever is signed in read an account that is
  // not theirs, and the silent probe returns that person quite happily.
  const w = world({ silent: { id: 'someone-else' }, answer: undefined });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), false);
  assert.equal(w.calls.asked.length, 1, 'it offers a sign-in rather than failing mutely');
});

test('signing in as the WRONG account after the offer is still a refusal', async () => {
  const w = world({
    silent: undefined,
    interactive: { id: 'someone-else' },
    answer: 'Sign in',
  });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), false);
});

test('signing in as the right account after the offer succeeds', async () => {
  const w = world({ silent: undefined, interactive: { id: 'acct-1' }, answer: 'Sign in' });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), true);
  assert.equal(w.calls.interactive, 1);
});

test('declining the offer refuses without signing anyone in', async () => {
  const w = world({ silent: undefined, interactive: { id: 'acct-1' }, answer: undefined });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), false);
  assert.equal(w.calls.interactive, 0, 'the dialog is the gate, not a formality');
});

test('a silent probe that THROWS still reaches the sign-in offer', async () => {
  // The recorded defect: Google's provider throws here when its client id is unset, and that
  // used to skip the offer — the user was told to sign in by the command that could do it.
  const w = world({ silent: 'throw', interactive: { id: 'acct-1' }, answer: 'Sign in' });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), true);
  assert.equal(w.calls.asked.length, 1, 'the offer was made despite the throw');
});

test('an interactive sign-in that fails is a refusal, not an exception for the caller', async () => {
  const w = world({ silent: undefined, interactive: 'throw', answer: 'Sign in' });

  assert.equal(await w.mod.verifyAccountSession(ACCOUNT), false);
});

test('signIn reports a provider failure as an AuthError naming the provider', async () => {
  // A missing Google provider extension is the common cause, and "getSession failed" alone
  // tells nobody which of the two providers to install anything for.
  const w = world({ interactive: 'throw' });

  await assert.rejects(
    () => w.mod.signIn('google'),
    (e: unknown) => e instanceof Error && e.name === 'AuthError' && /google/.test(e.message),
  );
});

test('a successful signIn carries the id, the label and the provider through', async () => {
  const w = world({ interactive: { id: 'acct-9' } });

  assert.deepEqual(await w.mod.signIn('microsoft'), {
    accountId: 'acct-9',
    email: 'me@corp.com',
    provider: 'microsoft',
  });
});
