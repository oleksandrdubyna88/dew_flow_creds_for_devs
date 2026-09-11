import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ServerTransport } from '../serverTransport';
import { CLIENT_CONTRACT_VERSION } from '../contractVersion';
import { StoredAccount } from '../types';

const account: StoredAccount = {
  accountId: 'acct-1',
  email: 'alice@example.com',
  provider: 'microsoft',
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * A server that accepts the connection and then never answers.
 *
 * The keep-alive timer is load-bearing, and its absence is a real trap: a genuine `fetch`
 * holds an open socket, which keeps the event loop alive while the request is in flight,
 * whereas `AbortSignal.timeout()`'s own timer is deliberately **unref'd** and does not.
 * Without a ref'd handle here the loop drains before the timeout can fire and node:test
 * reports `Promise resolution is still pending but the event loop has already resolved` —
 * which passed on one machine and failed in CI.
 */
function installSilentServer(): void {
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const socketStandIn = setInterval(() => {}, 1_000);
      const signal = init?.signal;
      if (signal === undefined || signal === null) {
        // No ceiling: this hangs forever, which is exactly the bug under test. The
        // interval is left running on purpose so the hang is observable.
        return;
      }
      signal.addEventListener('abort', () => {
        clearInterval(socketStandIn);
        reject(signal.reason);
      });
    })) as typeof fetch;
}

test('a server that never answers fails the request instead of hanging forever', async () => {
  installSilentServer();
  const transport = new ServerTransport('https://vault.example.com', async () => 'token', 40);

  await assert.rejects(
    () => transport.readVault(account),
    /did not answer within/,
    'a request with no ceiling would leave this promise pending and the test would time out',
  );
});

test('the timeout message names the server so the operator knows which one is wedged', async () => {
  installSilentServer();
  const transport = new ServerTransport('https://vault.corp.example', async () => 'token', 40);

  await assert.rejects(() => transport.writeVault(account, 'ciphertext'), (error: Error) => {
    assert.match(error.message, /vault\.corp\.example/);
    return true;
  });
});

test('a connection failure is reported as unreachable, not as a timeout', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
  const transport = new ServerTransport('https://vault.example.com', async () => 'token', 40);

  await assert.rejects(() => transport.readVault(account), /unreachable/);
});

test('a missing token is refused before any request is attempted', async () => {
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.reject(new Error('should not be reached'));
  }) as unknown as typeof fetch;
  const transport = new ServerTransport('https://vault.example.com', async () => undefined);

  await assert.rejects(() => transport.readVault(account), /No usable microsoft token/);
  assert.equal(called, false);
});

// --- conditional writes -----------------------------------------------------
//
// Two of one person's machines syncing at once is ordinary. The server refuses a
// write whose precondition no longer holds; the transport's job is to SEND that
// precondition, and to report a refusal as something the sync cycle can act on
// rather than as a generic HTTP failure.

/** Records what the transport actually put on the wire. */
function recordingServer(responses: Array<{ status: number; body?: string; etag?: string }>) {
  const seen: Array<{ method: string; ifMatch: string | null }> = [];
  let i = 0;
  // eslint-disable-next-line complexity
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ method: init?.method ?? 'GET', ifMatch: headers.get('If-Match') });
    const r = responses[Math.min(i++, responses.length - 1)];
    const out = new Headers();
    if (r.etag !== undefined) {
      out.set('ETag', r.etag);
    }
    // 204 and 304 are defined as bodiless; the Response constructor rejects a body
    // with either, even an empty string.
    const bodiless = r.status === 204 || r.status === 304;
    return Promise.resolve(
      new Response(bodiless ? null : (r.body ?? ''), { status: r.status, headers: out }),
    );
  }) as typeof fetch;
  return seen;
}

test('a write after a read carries the version that was read', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 204, etag: '"v2"' },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await transport.writeVault(account, 'new-ciphertext');

  assert.equal(seen[1].method, 'PUT');
  assert.equal(seen[1].ifMatch, '"v1"', 'without this the server cannot detect a stale write');
});

test('a first write, with nothing read, carries no precondition', async () => {
  const seen = recordingServer([{ status: 204 }]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.writeVault(account, 'ciphertext');

  assert.equal(seen[0].ifMatch, null, 'a client with no version must not invent one');
});

test('a refused write is reported as a conflict the sync cycle can recognise', async () => {
  recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 412 },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await assert.rejects(() => transport.writeVault(account, 'new'), (error: Error) => {
    assert.match(error.message, /changed on the server/i);
    return true;
  });
});

test('after a conflict the stale version is dropped, so the retry re-reads', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 412 },
    { status: 204 },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await assert.rejects(() => transport.writeVault(account, 'a'));
  await transport.writeVault(account, 'b');

  assert.equal(seen[2].ifMatch, null, 'holding on to a version the server rejected would deadlock the client');
});

test('a successful write adopts the version the server returned', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 204, etag: '"v2"' },
    { status: 204, etag: '"v3"' },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await transport.writeVault(account, 'a');
  await transport.writeVault(account, 'b');

  assert.equal(seen[2].ifMatch, '"v2"', 'the second write must build on the first, without re-reading');
});

// --- the contract handshake (0.66.0) -------------------------------------------------------
//
// Built before anything is broken, which is the only time it can be: on the day a response shape
// changes, every old extension is already installed and has no way to say what it speaks.

/** A stub that records what was sent and answers with what a test wants back. */
function installServer(status: number, contract: string | undefined, body = ''): { sent: Headers[] } {
  const sent: Headers[] = [];
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    sent.push(new Headers(init?.headers));
    const headers = new Headers();
    if (contract !== undefined) {
      headers.set('X-Creds-Contract', contract);
    }
    return Promise.resolve(new Response(body, { status, headers }));
  }) as typeof fetch;
  return { sent };
}

const transportFor = (warn: (m: string) => void = () => undefined): ServerTransport =>
  new ServerTransport('https://vault.example.com', () => Promise.resolve('a-token'), 5_000, warn);

test('every request says which contract this extension speaks', async () => {
  const { sent } = installServer(200, '1', '[]');

  await transportFor().listShares(account);

  // Against the constant, not a literal: this header exists to say what THIS build speaks, so
  // a bump that forgot to update the request would pass a test pinned to the old number.
  assert.equal(sent[0].get('X-Creds-Contract'), String(CLIENT_CONTRACT_VERSION));
});

test('a server that refuses this version says so in words, not as an auth problem', async () => {
  // The alternative is a 401 about a token that was never the problem — the message that sends
  // someone re-checking their sign-in for an hour.
  installServer(426, '2', 'this server speaks contract 2 and no longer serves 1');

  await assert.rejects(
    () => transportFor().listShares(account),
    (error: Error) => {
      assert.match(error.message, /no longer serves this version/);
      assert.match(error.message, /Update the extension/);
      assert.match(error.message, /no longer serves 1/, 'the server’s own reason is quoted');
      return true;
    },
  );
});

test('a server that has moved ahead is reported ONCE, not per request', async () => {
  // A sync cycle makes several calls, and a notice that appears four times a minute is one people
  // turn off — which is how a warning becomes worse than no warning.
  installServer(200, '7', '[]');
  const said: string[] = [];
  const transport = transportFor((m) => said.push(m));

  await transport.listShares(account);
  await transport.listShares(account);
  await transport.listShares(account);

  assert.equal(said.length, 1, `it said: ${JSON.stringify(said)}`);
  assert.match(said[0], /speaks contract 7/);
  assert.equal(transport.serverContract, 7);
});

test('a server too old to name a version is not a fault', async () => {
  // Every deployment that has not been updated yet sends no header.
  installServer(200, undefined, '[]');
  const said: string[] = [];
  const transport = transportFor((m) => said.push(m));

  await transport.listShares(account);

  assert.deepEqual(said, []);
  assert.equal(transport.serverContract, 0);
});

// --- taking a share back (0.66.0) ----------------------------------------------------------
//
// The server side has its own tests. These are the other half: that this client reads the
// receipts, and — the part that matters — that it does not report success for a share that was
// already accepted. Being told a withdrawal worked when it did not is worse than being told
// nothing, because the point of asking was to stop a secret reaching someone.

/** Like installServer, but it also records the URL each call went to. */
function installRecordingServer(status: number, body = ''): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = ((input: unknown) => {
    urls.push(String(input));
    // 204 has no body by definition, and `new Response('', {status: 204})` THROWS — which the
    // transport would then report as an unreachable server, from a stub that meant to say yes.
    return Promise.resolve(new Response(status === 204 ? null : body, { status }));
  }) as typeof fetch;
  return { urls };
}

test('sent receipts are read back, and a malformed one is dropped rather than trusted', async () => {
  installServer(
    200,
    '1',
    JSON.stringify([
      { id: 'a', toEmail: 'bob@example.com', entityName: 'prod db', entityKind: 'db', createdAt: 1 },
      { id: 'b', toEmail: 'carol@example.com' },
      'not an object',
    ]),
  );

  const sent = await transportFor().listSent(account);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].entityName, 'prod db');
});

test('a server that will not list gives an empty list, not a crash', async () => {
  installServer(500, '1', 'nope');

  assert.deepEqual(await transportFor().listSent(account), []);
});

const peer = {
  account: { accountId: 'acct-2', email: 'bob@example.com', provider: 'microsoft' },
} as never;

const oneShare = [{ entityName: 'prod db', entityKind: 'db' } as never];

test('a refused share says WHY the server refused it, not just the status number', async () => {
  // The corporate server can now refuse a share for a reason the sender can act on — the recipient's
  // account was deactivated — and it says so in the body. What the sender actually read before this was
  // "Vault server refused alice@example.com (403) — outside the allowed domain, or not permitted": a
  // guess, about the wrong person, that sends them to check a domain setting which is fine.
  installServer(403, '3', "Recipient's account has been deactivated.");

  await assert.rejects(
    () => transportFor().appendShares(account, peer, oneShare),
    (error: Error) => {
      assert.match(error.message, /deactivated/);
      assert.doesNotMatch(error.message, /outside the allowed domain/);
      assert.doesNotMatch(
        error.message,
        /refused alice@example\.com/,
        'the refusal is about bob, so it must not name alice as the refused party',
      );
      return true;
    },
  );
});

test('a 403 about the CALLER names the deactivation, not the domain', async () => {
  // The other half of the same status: the server sets X-Creds-Reason when the refusal is about the
  // caller's own account, so the client need not match English to tell the two apart.
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('', { status: 403, headers: { 'X-Creds-Reason': 'account-deactivated' } }),
    )) as typeof fetch;

  await assert.rejects(() => transportFor().readVault(account), (error: Error) => {
    assert.match(error.message, /alice@example\.com has been deactivated/);
    assert.doesNotMatch(error.message, /outside the allowed domain/);
    return true;
  });
});

test('a 403 with neither header nor body still explains itself', async () => {
  // The control, and the case the old sentence was written for: a domain refusal carries no body.
  installServer(403, '3', '');

  await assert.rejects(() => transportFor().readVault(account), /outside the allowed domain/);
});

test('a refused share with no body still names the status', async () => {
  // The control: an older server, a proxy, or a 500 with nothing in it must still produce a usable
  // sentence rather than one that trails off into an empty quote.
  installServer(500, '3', '');

  await assert.rejects(() => transportFor().appendShares(account, peer, oneShare), /HTTP 500/);
});

test('a withdrawal that worked is reported as such', async () => {
  installRecordingServer(204);

  assert.equal(await transportFor().withdrawSent(account, 'abc'), 'withdrawn');
});

test('a share the recipient already took is NOT reported as withdrawn', async () => {
  // 409 is the server saying it is beyond recall. Flattening that into success would tell someone
  // their secret is safe at the exact moment it is not.
  installRecordingServer(409, 'Already accepted or declined');

  assert.equal(await transportFor().withdrawSent(account, 'abc'), 'alreadyTaken');
});

test('an unknown id is neither a success nor an "already taken"', async () => {
  installRecordingServer(404);

  assert.equal(await transportFor().withdrawSent(account, 'abc'), 'notFound');
});

test('a crafted id cannot walk out of the route it belongs to', async () => {
  const { urls } = installRecordingServer(404);

  await transportFor().withdrawSent(account, '../../api/vault');

  assert.equal(urls.length, 1);
  assert.ok(
    urls[0].endsWith('/api/shares/sent/..%2F..%2Fapi%2Fvault'),
    `it asked for ${urls[0]}`,
  );
});

test('a server too old for the route is NOT reported as an empty outbox', async () => {
  // The difference is the whole point: an empty list reads as "nothing of mine is pending", which
  // is the opposite of true when the reason you looked was to take something back. The deployed
  // server WILL be older than this feature until someone runs the deploy, so this is the ordinary
  // case for a while, not an edge one.
  installServer(404, '1', 'Not Found');

  await assert.rejects(
    () => transportFor().listSent(account),
    (error: Error) => {
      assert.match(error.message, /older than this feature/);
      assert.match(error.message, /Update the server/);
      return true;
    },
  );
});

/**
 * The outcome the recipient reports, on the route the server shipped for it.
 *
 * <p>What matters is the URL: the server reads `?outcome=` off the query string, records
 * `share.accepted` or `share.declined` from it, and records `share.unknown` when there is none —
 * which is what every released client sends and what this transport must keep sending when nobody
 * says otherwise.</p>
 */
function recordUrls(urls: string[]): void {
  globalThis.fetch = ((input: unknown) => {
    urls.push(String(input));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
}

const pending = {
  accountId: 'acct-1',
  item: {
    id: '11111111-1111-1111-1111-111111111111',
    fromEmail: 'alice@example.com',
    toEmail: 'bob@example.com',
    entityName: 'prod database',
    entityKind: 'db',
    createdAt: 1,
    salt: '',
    iv: '',
    tag: '',
    data: '',
  },
} as unknown as Parameters<ServerTransport['removeShare']>[1];

test('accepting a share says so on the wire', async () => {
  const urls: string[] = [];
  recordUrls(urls);

  await new ServerTransport('https://vault.example.com', async () => 'token', 500)
    .removeShare(account, pending, 'accepted');

  assert.equal(
    urls[0],
    'https://vault.example.com/api/shares/11111111-1111-1111-1111-111111111111?outcome=accepted',
  );
});

test('declining says the other word', async () => {
  const urls: string[] = [];
  recordUrls(urls);

  await new ServerTransport('https://vault.example.com', async () => 'token', 500)
    .removeShare(account, pending, 'declined');

  assert.match(urls[0], /\?outcome=declined$/);
});

test('saying nothing sends no query at all — never an empty one, never the word undefined', async () => {
  const urls: string[] = [];
  recordUrls(urls);

  await new ServerTransport('https://vault.example.com', async () => 'token', 500)
    .removeShare(account, pending);

  assert.equal(urls[0], 'https://vault.example.com/api/shares/11111111-1111-1111-1111-111111111111');
  assert.equal(urls[0].includes('outcome'), false);
});

test('a removal the server refused is a failure, not a silent success', async () => {
  // Until this check the answer was discarded: an accept imported the secret, dropped the row from
  // the tree, and left the share in the inbox with no share.accepted recorded — the one failure the
  // outcome exists to prevent.
  globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 500 }))) as typeof fetch;

  await assert.rejects(
    new ServerTransport('https://vault.example.com', async () => 'token', 500)
      .removeShare(account, pending, 'accepted'),
    /HTTP 500/,
  );
});

test('a share that is already gone is not a failure — the end state is the one asked for', async () => {
  // Two windows on one inbox is an ordinary Tuesday, and `deleteVault` one method below answers the
  // same question the same way.
  globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 404 }))) as typeof fetch;

  await new ServerTransport('https://vault.example.com', async () => 'token', 500)
    .removeShare(account, pending, 'declined');
});

test('a refused DELETE quotes what the server said, not just the number', async () => {
  // Audit finding #4: a 503 here means the vault file was locked and NOTHING was removed — the login
  // key included, which is the whole point of the refusal. "HTTP 503" alone sends a person looking
  // for a bug in the extension; the server's sentence tells them to try again.
  const said =
    'The vault could not be deleted right now — the file is locked or not writable on the server. '
    + 'Nothing else was removed, including the login key. Try again.';
  globalThis.fetch = (() =>
    Promise.resolve(new Response(said, { status: 503 }))) as unknown as typeof fetch;
  const transport = new ServerTransport('https://vault.example.com', async () => 'token', 40);

  await assert.rejects(transport.deleteVault(account), (e: unknown) => {
    const message = (e as Error).message;
    assert.match(message, /Nothing else was removed, including the login key/);
    assert.match(message, /503/);
    return true;
  });
});
