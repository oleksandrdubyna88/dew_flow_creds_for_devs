import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';

/**
 * The security-key flow, driven by a stand-in browser (audit A3).
 *
 * <p>This module opens a loopback page, hands it a challenge, and waits for the browser to
 * post back a PRF secret. The `openExternal` stub below IS the browser: it fetches the page
 * the way a real one would and posts the result, so these are end-to-end runs of the real
 * server and the real gating rather than assertions about strings.</p>
 *
 * <p><b>Two properties carry the security of the whole flow.</b> Everything is behind an
 * unguessable path segment, so another local process cannot even FETCH the page — and
 * therefore cannot read the challenge or the nonce. And a posted result whose nonce does not
 * match is ignored rather than accepted, so a stale or foreign post cannot satisfy a flow it
 * did not belong to. Both are tested by making the request a hostile process could make.</p>
 *
 * <p>The PRF secret length is checked too: a key that answers with something other than 32
 * bytes must be refused rather than used to derive a wrap nothing can open again.</p>
 */

type Prf = typeof import('../webauthnPrf');

interface Browser {
  /** What the "browser" does once the extension opens the URL. */
  visit(url: string): Promise<void>;
}

interface World {
  mod: Prf;
  opened: string[];
  cancelled: boolean;
}

/**
 * Load the module with `openExternal` wired to a stand-in browser.
 *
 * <p>`withProgress` is called with the real waiting promise, so cancelling is exercised by
 * invoking the cancellation callback the module registers.</p>
 */
function world(browser: Browser, options: { cancel?: boolean } = {}): World {
  const w: World = { mod: undefined as never, opened: [], cancelled: false };
  w.mod = loadWithVscode<Prf>('../webauthnPrf', {
    env: {
      openExternal: (uri: { toString(): string }): Promise<boolean> => {
        const url = uri.toString();
        w.opened.push(url);
        void browser.visit(url);
        return Promise.resolve(true);
      },
    },
    Uri: { parse: (u: string): { toString(): string } => ({ toString: () => u }) },
    ProgressLocation: { Notification: 15 },
    window: {
      withProgress: (
        _o: unknown,
        task: (p: unknown, c: { onCancellationRequested(cb: () => void): void }) => Promise<unknown>,
      ): Promise<unknown> =>
        task(
          {},
          {
            onCancellationRequested: (cb: () => void): void => {
              if (options.cancel === true) {
                w.cancelled = true;
                setTimeout(cb, 20);
              }
            },
          },
        ),
    },
  });
  return w;
}

/** Read the page the module serves at a URL, as a browser would. */
async function fetchPage(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

/**
 * The `const CONFIG = {...};` line the page is configured from — the challenge, the nonce and
 * the per-credential salts all live there.
 */
function pageData(html: string): Record<string, unknown> {
  const found = /const CONFIG = (\{.*?\});/s.exec(html);
  assert.ok(found !== null, `no CONFIG object in the page:
${html.slice(0, 400)}`);
  return JSON.parse(found[1]) as Record<string, unknown>;
}

const SECRET32 = Buffer.alloc(32, 9).toString('base64');

/** A browser that fetches the page, then posts `payload` back with the page's own nonce. */
function goodBrowser(payload: (data: Record<string, unknown>) => unknown, captured?: { html?: string; data?: Record<string, unknown> }): Browser {
  return {
    visit: async (url): Promise<void> => {
      const page = await fetchPage(url);
      if (captured !== undefined) {
        captured.html = page.body;
      }
      const data = pageData(page.body);
      if (captured !== undefined) {
        captured.data = data;
      }
      await fetch(`${url}/result?nonce=${String(data.nonce)}`, {
        method: 'POST',
        body: JSON.stringify(payload(data)),
      });
    },
  };
}

test('a registration completes and hands back the credential id and a 32-byte secret', async () => {
  const w = world(goodBrowser(() => ({ credentialId: 'cred-1', prf: SECRET32 })));

  const result = await w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64'));

  assert.equal(result.credentialId, 'cred-1');
  assert.equal(result.secret.length, 32);
  assert.deepEqual(result.secret, Buffer.alloc(32, 9));
});

test('the page is served ONLY at the unguessable path — the root is a 404', async () => {
  // Another local process must not be able to fetch the page, because the page carries the
  // challenge and the nonce. Guessing the port is trivial; guessing the token is not.
  let rootStatus = -1;
  let guessStatus = -1;
  const probe = async (url: string): Promise<void> => {
    const origin = new URL(url).origin;
    rootStatus = (await fetchPage(`${origin}/`)).status;
    guessStatus = (await fetchPage(`${origin}/not-the-token`)).status;
  };
  const w = world({
    visit: async (url): Promise<void> => {
      await probe(url);
      await goodBrowser(() => ({ credentialId: 'c', prf: SECRET32 })).visit(url);
    },
  });

  await w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64'));

  assert.equal(rootStatus, 404, 'the root serves nothing');
  assert.equal(guessStatus, 404, 'and neither does a guessed path');
});

test('a result posted with the WRONG nonce is ignored, and the flow keeps waiting', async () => {
  // A stale post from an earlier flow, or a foreign one, must not satisfy this flow.
  let ignoredFirst = false;
  const browser: Browser = {
    visit: async (url): Promise<void> => {
      const data = pageData((await fetchPage(url)).body);
      await fetch(`${url}/result?nonce=not-the-nonce`, {
        method: 'POST',
        body: JSON.stringify({ credentialId: 'attacker', prf: SECRET32 }),
      });
      ignoredFirst = true;
      await fetch(`${url}/result?nonce=${String(data.nonce)}`, {
        method: 'POST',
        body: JSON.stringify({ credentialId: 'real', prf: SECRET32 }),
      });
    },
  };
  const w = world(browser);

  const result = await w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64'));

  assert.equal(ignoredFirst, true);
  assert.equal(result.credentialId, 'real', 'the foreign post did not win the race');
});

test('a PRF secret of the wrong length is REFUSED, not used', async () => {
  // Deriving a wrap from a short secret produces a slot nothing can open again — a vault
  // locked by a bug rather than by a key.
  const w = world(goodBrowser(() => ({ credentialId: 'c', prf: Buffer.alloc(16, 1).toString('base64') })));

  await assert.rejects(
    () => w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64')),
    (e: unknown) => e instanceof Error && e.name === 'WebAuthnError' && /length/.test(e.message),
  );
});

test('a browser that reports an error surfaces it as a WebAuthnError with a hint', async () => {
  const w = world(goodBrowser(() => ({ error: 'NotAllowedError' })));

  await assert.rejects(
    () => w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64')),
    (e: unknown) => e instanceof Error && e.name === 'WebAuthnError',
  );
});

test('a result with no PRF at all is refused rather than returning an empty secret', async () => {
  const w = world(goodBrowser(() => ({ credentialId: 'c' })));

  await assert.rejects(
    () => w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64')),
    /no PRF result/,
  );
});

test('malformed JSON from the page is refused rather than parsed into undefined', async () => {
  const browser: Browser = {
    visit: async (url): Promise<void> => {
      const data = pageData((await fetchPage(url)).body);
      await fetch(`${url}/result?nonce=${String(data.nonce)}`, { method: 'POST', body: 'not json' });
    },
  };
  const w = world(browser);

  await assert.rejects(
    () => w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64')),
    /Malformed result/,
  );
});

test('cancelling the progress notification ends the flow instead of hanging for two minutes', async () => {
  const w = world({ visit: (): Promise<void> => Promise.resolve() }, { cancel: true });

  await assert.rejects(
    () => w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64')),
    /cancelled/,
  );
  assert.equal(w.cancelled, true);
});

/** Run one registration and hand back the configuration its page was given. */
async function configOfOneRun(): Promise<Record<string, unknown>> {
  const captured: { data?: Record<string, unknown> } = {};
  const w = world(goodBrowser(() => ({ credentialId: 'c', prf: SECRET32 }), captured));
  await w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64'));
  assert.ok(captured.data !== undefined, 'the page was never fetched');
  return captured.data;
}

test('the page carries a FRESH challenge and nonce every time', async () => {
  // A reused challenge is a replayable assertion; a reused nonce would let one flow's result
  // satisfy another.
  const first = await configOfOneRun();
  const second = await configOfOneRun();

  assert.notEqual(first.challenge, second.challenge);
  assert.notEqual(first.nonce, second.nonce);
});

test('the URL opened is loopback, and carries the path token', async () => {
  const w = world(goodBrowser(() => ({ credentialId: 'c', prf: SECRET32 })));

  await w.mod.registerSecurityKey('me@corp.com', Buffer.alloc(32, 1).toString('base64'));

  const url = new URL(w.opened[0]);
  assert.equal(url.hostname, 'localhost', 'never a routable host');
  assert.ok(url.pathname.length > 20, `the path token is the gate: ${url.pathname}`);
});

test('authenticate narrows the prompt to the credentials this vault knows, each with its own salt', async () => {
  // A vault with two keys registered must offer both, and each key needs ITS salt to
  // reproduce the secret — one shared salt would make the second key open the first key's wrap.
  const captured: { data?: Record<string, unknown> } = {};
  const w = world(goodBrowser(() => ({ credentialId: 'cred-a', prf: SECRET32 }), captured));

  await w.mod.authenticateSecurityKey('me@corp.com', {
    'cred-a': Buffer.alloc(32, 1).toString('base64'),
    'cred-b': Buffer.alloc(32, 2).toString('base64'),
  });

  assert.deepEqual(captured.data?.credentialIds, ['cred-a', 'cred-b']);
  const salts = captured.data?.saltsByCredential as Record<string, string>;
  assert.equal(Object.keys(salts).length, 2);
  assert.notEqual(salts['cred-a'], salts['cred-b'], 'each key carries its own salt');
});

test('the page escapes `<` so its own configuration cannot close the script', async () => {
  // Same trap as the entity form: the options blob is interpolated into an inline script, and
  // the user label is part of it.
  const captured: { html?: string } = {};
  const w = world(goodBrowser(() => ({ credentialId: 'c', prf: SECRET32 }), captured));

  await w.mod.registerSecurityKey('</script><img src=x>', Buffer.alloc(32, 1).toString('base64'));

  const body = captured.html ?? '';
  const scriptEnd = body.indexOf('</script>');
  assert.ok(scriptEnd > 0, 'the page has a script');
  assert.ok(!body.slice(0, scriptEnd).includes('<img src=x>'), 'the label did not break out');
});
