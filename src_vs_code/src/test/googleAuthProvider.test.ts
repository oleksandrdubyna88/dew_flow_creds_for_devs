import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { StubEventEmitter, configStub, loadWithVscode } from './vscodeStub';

/**
 * The Google session store (audit A3).
 *
 * <p>Everything that reaches the vault server carries an id_token from here, so the failure
 * that matters is not "the wrong token" but "no token, and no way to tell why". Every path
 * below returns `undefined` rather than throwing — a broken secret blob, a missing client id,
 * a refresh Google refuses — because an exception here reaches a command the person invoked
 * for an unrelated reason. That is right, and it is exactly why each of those paths needs a
 * test: an `undefined` that means "expired, and I refreshed it" and an `undefined` that means
 * "I could not parse my own storage" are indistinguishable from the outside.</p>
 *
 * <p>`refreshIdToken` calls Google. `fetch` is replaced for the tests that reach it, so a run
 * of this suite makes no network request — and the "fresh token" test asserts that it does not
 * even try, which is the only way to observe the cache working.</p>
 *
 * <p>Sessions are built to satisfy the real `isStoredSession`: a session it rejects is
 * silently dropped, so a sloppy fixture would leave every test asserting against an empty
 * list while appearing to pass.</p>
 */

type Google = typeof import('../googleAuthProvider');

interface StoredSession {
  id: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  idTokenExpiresAt?: number;
  account: { id: string; label: string };
  scopes: string[];
}

/** A session shaped the way `isStoredSession` requires — id, accessToken, account, scopes. */
function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 's1',
    accessToken: 'access-1',
    account: { id: 'acct-1', label: 'me@corp.com' },
    scopes: ['openid', 'email'],
    ...overrides,
  };
}

/**
 * The change event as VS Code declares it: both arrays are OPTIONAL and READONLY. A narrower
 * annotation is not assignable to the listener parameter, and because `npm run bundle` is
 * `compile && esbuild`, a type error here stops anyone in the checkout producing a fresh
 * `dist/` — while `npm test` keeps passing, since tsc still emits into `out/`.
 */
interface SessionsChanged {
  readonly added?: readonly unknown[];
  readonly removed?: readonly unknown[];
}

interface World {
  mod: Google;
  provider: InstanceType<Google['GoogleAuthProvider']>;
  /** What is in SecretStorage, by key. */
  secrets: Map<string, string>;
  events: SessionsChanged[];
  disposed: boolean;
}

/** What SecretStorage holds at the start of a test: the sessions blob, and the client secret. */
function initialSecrets(options: { sessions?: unknown; clientSecret?: string }): Map<string, string> {
  const secrets = new Map<string, string>();
  const blob =
    typeof options.sessions === 'string' ? options.sessions : JSON.stringify(options.sessions);
  if (options.sessions !== undefined) {
    secrets.set('credSshManager.googleSessions', blob);
  }
  if (options.clientSecret !== undefined) {
    secrets.set('credSshManager.googleClientSecret', options.clientSecret);
  }
  return secrets;
}

function world(options: { sessions?: unknown; clientId?: string; clientSecret?: string }): World {
  const secrets = initialSecrets(options);
  const w: World = {
    mod: undefined as never,
    provider: undefined as never,
    secrets,
    events: [],
    disposed: false,
  };
  const config = configStub({ googleClientId: options.clientId ?? '' });
  w.mod = loadWithVscode<Google>('../googleAuthProvider', {
    EventEmitter: StubEventEmitter,
    workspace: { getConfiguration: config.workspace.getConfiguration },
    authentication: {
      registerAuthenticationProvider: (): { dispose(): void } => ({
        dispose: (): void => {
          w.disposed = true;
        },
      }),
    },
    window: { showInputBox: (): Promise<undefined> => Promise.resolve(undefined) },
    ConfigurationTarget: { Global: 1 },
    Uri: { parse: (u: string): unknown => ({ toString: () => u }) },
    env: { openExternal: (): Promise<boolean> => Promise.resolve(true) },
  });
  const storage = {
    get: (key: string): Promise<string | undefined> => Promise.resolve(secrets.get(key)),
    store: (key: string, value: string): Promise<void> => {
      secrets.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Promise<void> => {
      secrets.delete(key);
      return Promise.resolve();
    },
  };
  w.provider = new w.mod.GoogleAuthProvider(storage as never);
  w.provider.onDidChangeSessions((e: SessionsChanged) => {
    w.events.push(e);
  });
  return w;
}

const stored = (w: World): StoredSession[] =>
  JSON.parse(w.secrets.get('credSshManager.googleSessions') ?? '[]') as StoredSession[];

/** The sessions one change event announced as removed — empty when it announced none. */
const removedBy = (w: World, at: number): StoredSession[] =>
  ((w.events[at]?.removed ?? []) as StoredSession[]).slice();

/** Replace global fetch for one test, and always put the real one back. */
async function withFetch<T>(
  answer: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
  body: (calls: string[]) => Promise<T>,
): Promise<T> {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit): Promise<Response> => {
    calls.push(String(url));
    return Promise.resolve(answer(String(url), init));
  }) as typeof fetch;
  try {
    return await body(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('with nothing stored there are no sessions, and no error', async () => {
  const w = world({});

  assert.deepEqual(await w.provider.getSessions(), []);
});

test('a stored session comes back', async () => {
  const w = world({ sessions: [session()] });

  const sessions = await w.provider.getSessions();

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].account.label, 'me@corp.com');
});

test('a CORRUPT sessions blob reads as empty rather than throwing', async () => {
  // The blob lives in the OS keychain and can be truncated by a crash or an OS migration. An
  // exception here would reach whichever command the person happened to run.
  const w = world({ sessions: 'not json at all' });

  assert.deepEqual(await w.provider.getSessions(), []);
});

test('an entry that is not a session is dropped, and the rest survive', async () => {
  // Half a valid list is worth more than none: one malformed entry must not sign the person
  // out of every account.
  const w = world({ sessions: [session(), { id: 'broken' }, session({ id: 's2' })] });

  assert.deepEqual((await w.provider.getSessions()).map((s) => s.id), ['s1', 's2']);
});

test('sessions are filtered by scope, regardless of the order they were asked for', async () => {
  // VS Code asks by scope set, not by order; matching literally would silently create a
  // second session for the same permissions.
  const w = world({ sessions: [session({ scopes: ['openid', 'email'] })] });

  assert.equal((await w.provider.getSessions(['email', 'openid'])).length, 1);
  assert.equal((await w.provider.getSessions(['openid'])).length, 0, 'a different set is a different session');
});

test('a FRESH id token is returned without asking Google at all', async () => {
  // The only way to observe the expiry cache: assert that no request was made.
  const w = world({
    sessions: [session({ idToken: 'still-good', idTokenExpiresAt: Date.now() + 10 * 60_000 })],
  });

  await withFetch(
    () => json({}),
    async (calls) => {
      assert.equal(await w.provider.getIdToken('acct-1'), 'still-good');
      assert.deepEqual(calls, [], 'no network for a token that is still valid');
    },
  );
});

test('a token inside the last minute of its life is refreshed rather than used', async () => {
  // Handing out a token that expires in flight fails at the server, where the error is
  // "unauthorized" and says nothing about expiry.
  const w = world({
    sessions: [session({ idToken: 'about-to-die', idTokenExpiresAt: Date.now() + 30_000, refreshToken: 'r1' })],
    clientId: 'client-1',
    clientSecret: 'secret-1',
  });

  await withFetch(
    () => json({ id_token: 'brand-new', access_token: 'access-2' }),
    async (calls) => {
      assert.equal(await w.provider.getIdToken('acct-1'), 'brand-new');
      assert.equal(calls.length, 1);
    },
  );
});

test('a refreshed token is PERSISTED, so the next call does not refresh again', async () => {
  const w = world({
    sessions: [session({ idToken: 'old', idTokenExpiresAt: 1, refreshToken: 'r1' })],
    clientId: 'client-1',
    clientSecret: 'secret-1',
  });

  await withFetch(
    () => json({ id_token: 'brand-new' }),
    async (calls) => {
      await w.provider.getIdToken('acct-1');
      await w.provider.getIdToken('acct-1');
      assert.equal(calls.length, 1, 'the second call used what the first stored');
    },
  );
  assert.equal(stored(w)[0].idToken, 'brand-new');
});

test('the refresh keeps the OTHER sessions untouched', async () => {
  // A map that rebuilt the list would be an easy place to sign every other account out.
  const w = world({
    sessions: [
      session({ idToken: 'old', idTokenExpiresAt: 1, refreshToken: 'r1' }),
      session({ id: 's2', account: { id: 'acct-2', label: 'other@corp.com' } }),
    ],
    clientId: 'client-1',
    clientSecret: 'secret-1',
  });

  await withFetch(
    () => json({ id_token: 'brand-new' }),
    async () => {
      await w.provider.getIdToken('acct-1');
    },
  );

  assert.deepEqual(stored(w).map((s) => s.id), ['s1', 's2']);
  assert.equal(stored(w)[1].accessToken, 'access-1', 'the other session is byte-identical');
});

test('an expired token with NO refresh token yields undefined instead of a stale one', async () => {
  const w = world({ sessions: [session({ idToken: 'expired', idTokenExpiresAt: 1 })] });

  assert.equal(await w.provider.getIdToken('acct-1'), undefined);
});

test('a refresh with no client id configured yields undefined rather than a bad request', async () => {
  const w = world({
    sessions: [session({ idToken: 'expired', idTokenExpiresAt: 1, refreshToken: 'r1' })],
    clientSecret: 'secret-1',
  });

  await withFetch(
    () => json({}),
    async (calls) => {
      assert.equal(await w.provider.getIdToken('acct-1'), undefined);
      assert.deepEqual(calls, [], 'and it never asked');
    },
  );
});

test('a refresh Google REFUSES yields undefined, not an exception', async () => {
  // A revoked refresh token is the ordinary case after a password change.
  const w = world({
    sessions: [session({ idToken: 'expired', idTokenExpiresAt: 1, refreshToken: 'revoked' })],
    clientId: 'client-1',
    clientSecret: 'secret-1',
  });

  await withFetch(
    () => json({ error: 'invalid_grant' }, 400),
    async () => {
      assert.equal(await w.provider.getIdToken('acct-1'), undefined);
    },
  );
});

test('an unknown account is undefined, not the first session that happens to be there', async () => {
  const w = world({ sessions: [session({ idToken: 'mine', idTokenExpiresAt: Date.now() + 600_000 })] });

  assert.equal(await w.provider.getIdToken('somebody-else'), undefined);
});

test('signing out one account drops ONLY its sessions, and announces them', async () => {
  const w = world({
    sessions: [
      session(),
      session({ id: 's2', account: { id: 'acct-2', label: 'other@corp.com' } }),
      session({ id: 's3' }),
    ],
  });

  await w.provider.removeSessionsForAccount('acct-1');

  assert.deepEqual(stored(w).map((s) => s.id), ['s2']);
  assert.deepEqual(removedBy(w, 0).map((s) => s.id), ['s1', 's3']);
});

test('signing out an account with no sessions announces nothing', async () => {
  // A spurious change event makes VS Code re-query every provider for no reason.
  const w = world({ sessions: [session()] });

  await w.provider.removeSessionsForAccount('acct-9');

  assert.deepEqual(w.events, []);
});

test('reset forgets the sessions AND the client secret', async () => {
  // Leaving the secret behind would make "reset" look like it worked and then reuse the old
  // app credentials on the next sign-in.
  const w = world({ sessions: [session()], clientSecret: 'secret-1' });

  await w.provider.reset();

  assert.equal(w.secrets.has('credSshManager.googleSessions'), false);
  assert.equal(w.secrets.has('credSshManager.googleClientSecret'), false);
  assert.equal(removedBy(w, 0).length, 1);
});

test('disposing unregisters the provider', () => {
  const w = world({});

  w.provider.dispose();

  assert.equal(w.disposed, true);
});
