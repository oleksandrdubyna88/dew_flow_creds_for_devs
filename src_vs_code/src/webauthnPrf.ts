import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as vscode from 'vscode';
import { webauthnUserHandle } from './cryptoUtils';
import { startLoopbackServer } from './loopbackServer';
import { browserErrorHint } from './webauthnHint';
import { jsonForScript } from './webviewHtml';
import { CURRENT_RP_ID } from './webauthnRp';

/**
 * Security-key unlock via WebAuthn + the **PRF** extension.
 *
 * The extension host has no WebAuthn API, so the flow runs in the user's
 * browser exactly like our Google sign-in: a one-shot loopback page is
 * opened on `http://creds-for-devs.localhost:<port>` — loopback per RFC 6761
 * with no DNS setup, a secure context, and an RP ID no other local page can
 * claim (see `webauthnRp.ts`) — the page asks the platform for the key — the
 * OS shows its native "touch your security key" dialog — and posts the PRF
 * output back. Credentials registered before 0.81 are bound to the bare
 * `localhost`; `authenticateSecurityKey` takes the RP ID so those still open.
 *
 * The PRF output is a stable 32-byte secret per (credential, salt) pair, so
 * the same physical key derives the same wrapping key on any machine.
 */

const RP_NAME = 'CredsForDevs';
/** Parsing base for request paths only — never where the browser is sent. */
const PATH_BASE = 'http://localhost';
const TIMEOUT_MS = 2 * 60_000;

export interface PrfResult {
  /** base64url credential id. */
  credentialId: string;
  /** 32-byte PRF secret. */
  secret: Buffer;
}

export class WebAuthnError extends Error {
  constructor(
    message: string,
    /** The person ended it (cancel, timeout): no other RP ID is tried after this. */
    readonly final: boolean = false,
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

/**
 * Register a NEW security key for an account and return its PRF secret.
 * `prfSalt` must be stored alongside the wrap: the same salt is required to
 * reproduce the secret later.
 */
export function registerSecurityKey(
  userLabel: string,
  prfSalt: string,
): Promise<PrfResult> {
  return runFlow('register', userLabel, prfSalt, [], undefined, CURRENT_RP_ID);
}

/**
 * Ask for one of the already-registered keys and return its PRF secret.
 * `credentialIds` narrows the prompt to the keys this vault knows.
 */
export function authenticateSecurityKey(
  userLabel: string,
  saltsByCredential: Readonly<Record<string, string>>,
  /** The RP ID these credentials were created under — legacy wraps answer only under `localhost`. */
  rpId: string = CURRENT_RP_ID,
): Promise<PrfResult> {
  return runFlow('authenticate', userLabel, '', Object.keys(saltsByCredential), saltsByCredential, rpId);
}

interface FlowPayload {
  credentialId?: string;
  prf?: string;
  error?: string;
}

// eslint-disable-next-line complexity, max-lines-per-function
async function runFlow(
  op: 'register' | 'authenticate',
  userLabel: string,
  prfSalt: string,
  credentialIds: readonly string[],
  saltsByCredential: Readonly<Record<string, string>> | undefined,
  rpId: string,
): Promise<PrfResult> {
  const nonce = crypto.randomBytes(16).toString('hex');
  // Unguessable path segment: another local process cannot even fetch the
  // page (and thus the challenge/nonce) without knowing this secret path.
  const pathToken = crypto.randomBytes(24).toString('base64url');
  const challenge = crypto.randomBytes(32).toString('base64url');
  const page = renderPage({
    op,
    rpId,
    nonce,
    pathToken,
    challenge,
    prfSalt: prfSalt.length > 0 ? Buffer.from(prfSalt, 'base64').toString('base64url') : '',
    userLabel,
    userHandle: webauthnUserHandle(userLabel).toString('base64url'),
    credentialIds: [...credentialIds],
    saltsByCredential: Object.fromEntries(
      Object.entries(saltsByCredential ?? {}).map(([id, salt]) => [
        id,
        Buffer.from(salt, 'base64').toString('base64url'),
      ]),
    ),
  });

  // Bound to loopback only; the browser reaches it through the RP ID's name, which resolves
  // to loopback without touching DNS (`.localhost`, RFC 6761) — the name IS the credential scope.
  const { server, port } = await startLoopbackServer();
  const url = `http://${rpId}:${port}/${pathToken}`;

  try {
    const resultPromise = waitForResult(server, nonce, pathToken, page);
    await vscode.env.openExternal(vscode.Uri.parse(url));
    const payload = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          op === 'register'
            ? 'Touch your security key to register it…'
            : 'Touch your security key to unlock the vault…',
        cancellable: true,
      },
      (_progress, cancel) => {
        cancel.onCancellationRequested(() => server.close());
        return resultPromise;
      },
    );
    if (payload.error !== undefined) {
      throw new WebAuthnError(browserErrorHint(payload.error));
    }
    if (payload.credentialId === undefined || payload.prf === undefined) {
      throw new WebAuthnError('The browser returned no PRF result.');
    }
    const secret = Buffer.from(payload.prf, 'base64');
    if (secret.length !== 32) {
      throw new WebAuthnError('The security key returned an unexpected PRF secret length.');
    }
    return { credentialId: payload.credentialId, secret };
  } finally {
    server.close();
  }
}

function waitForResult(
  server: http.Server,
  nonce: string,
  pathToken: string,
  page: string,
): Promise<FlowPayload> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new WebAuthnError('Timed out waiting for the security key (2 minutes).', true));
    }, TIMEOUT_MS);
    server.on('close', () => {
      clearTimeout(timeout);
      reject(new WebAuthnError('Security-key flow cancelled.', true));
    });
    // eslint-disable-next-line complexity
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', PATH_BASE);
      // Everything is gated behind the secret path token.
      if (url.pathname !== `/${pathToken}` && url.pathname !== `/${pathToken}/result`) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === 'POST' && url.pathname === `/${pathToken}/result`) {
        let body = '';
        req.on('data', (chunk) => {
          body += String(chunk);
        });
        req.on('end', () => {
          res.writeHead(204).end();
          if (url.searchParams.get('nonce') !== nonce) {
            return; // stale/foreign post — keep waiting
          }
          clearTimeout(timeout);
          try {
            resolve(JSON.parse(body) as FlowPayload);
          } catch {
            reject(new WebAuthnError('Malformed result from the browser page.'));
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
    });
  });
}


interface PageOptions {
  op: 'register' | 'authenticate';
  /** The relying-party id for both `create` and `get` — see `webauthnRp.ts`. */
  rpId: string;
  nonce: string;
  pathToken: string;
  challenge: string;
  prfSalt: string;
  /** authenticate only: each credential's OWN salt (base64url), keyed by credential id. */
  saltsByCredential: Record<string, string>;
  userLabel: string;
  /** Stable per account, so re-registering REPLACES this key's slot — see webauthnUserHandle. */
  userHandle: string;
  credentialIds: string[];
}

/**
 * The loopback page. Kept free of backslash escapes on purpose: this string
 * is embedded in a TypeScript template literal, where `\\` collapses and
 * would silently break the script (a lesson learned the hard way).
 */
// eslint-disable-next-line max-lines-per-function
function renderPage(options: PageOptions): string {
  const data = jsonForScript(options);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CredsForDevs — security key</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 12vh auto; max-width: 34rem;
         padding: 0 1.5rem; color: #ddd; background: #1e1e1e; }
  h1 { font-size: 1.3rem; }
  .box { border: 1px solid #444; border-radius: .5rem; padding: 1rem 1.25rem; }
  .ok { color: #3fb950; }
  .err { color: #f85149; white-space: pre-wrap; }
  button { padding: .5rem 1.2rem; border: 0; border-radius: .25rem;
           background: #3b6fb6; color: #fff; cursor: pointer; font-size: 1rem; }
</style>
</head>
<body>
  <h1>CredsForDevs</h1>
  <div class="box">
    <p id="status">Starting…</p>
    <p><button id="retry" style="display:none">Try again</button></p>
  </div>
<script>
  const CONFIG = ${data};
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');

  function b64urlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) { out[i] = raw.charCodeAt(i); }
    return out;
  }
  function bytesToB64(bytes) {
    let s = '';
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) { s += String.fromCharCode(view[i]); }
    return btoa(s);
  }
  function bytesToB64Url(bytes) {
    return bytesToB64(bytes).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  async function post(payload) {
    await fetch('/' + CONFIG.pathToken + '/result?nonce=' + encodeURIComponent(CONFIG.nonce), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function run() {
    retry.style.display = 'none';
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('This browser has no WebAuthn support.');
      }
      const challenge = b64urlToBytes(CONFIG.challenge);
      const salt = b64urlToBytes(CONFIG.prfSalt);
      let credentialId = CONFIG.credentialIds[0];

      if (CONFIG.op === 'register') {
        status.textContent = 'Touch your security key (1 of 2) — registering it…';
        const created = await navigator.credentials.create({
          publicKey: {
            challenge: challenge,
            rp: { id: CONFIG.rpId, name: ${jsonForScript(RP_NAME)} },
            user: {
              // Stable, NOT random. A resident credential is keyed by (rp.id, user.id),
              // so a fresh id every time claimed another of the key's ~25 slots instead
              // of replacing this account's own — and a full key refuses create().
              id: b64urlToBytes(CONFIG.userHandle),
              name: CONFIG.userLabel,
              displayName: CONFIG.userLabel,
            },
            pubKeyCredParams: [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 } ],
            authenticatorSelection: {
              authenticatorAttachment: 'cross-platform',
              residentKey: 'required',
              // 'required', not 'preferred': see the note on browserErrorHint below.
              userVerification: 'required',
            },
            timeout: 90000,
            extensions: { prf: {} },
          },
        });
        if (!created) { throw new Error('Registration returned no credential.'); }
        credentialId = created.id;
      }

      // Two touches when registering, and it cannot be one: create() with the PRF
      // extension only reports whether PRF is AVAILABLE - it does not return a PRF
      // result. The 32 bytes that wrap the master key come from an assertion, so a
      // registration is necessarily create-then-get. Saying so stops the second
      // prompt reading as 'that did not work, try again'.
      status.textContent = CONFIG.op === 'register'
        ? 'Touch your security key (2 of 2) — this one derives the encryption key…'
        : 'Touch your security key…';
      const allow = (CONFIG.op === 'register' ? [credentialId] : CONFIG.credentialIds)
        .filter(Boolean)
        .map((id) => ({ type: 'public-key', id: b64urlToBytes(id) }));
      // Registration evaluates over the one salt just minted. Authentication names
      // each credential's OWN salt - sending one salt for all is the bug where every
      // touch of the 'wrong' key failed forever on a vault with several wraps.
      const prfExt = CONFIG.op === 'register'
        ? { eval: { first: salt } }
        : { evalByCredential: Object.fromEntries(Object.entries(CONFIG.saltsByCredential)
            .map(function (e) { return [e[0], { first: b64urlToBytes(e[1]) }]; })) };
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          rpId: CONFIG.rpId,
          allowCredentials: allow,
          // 'required' — a touch alone is not enough; see browserErrorHint.
          userVerification: 'required',
          timeout: 90000,
          extensions: { prf: prfExt },
        },
      });
      if (!assertion) { throw new Error('No assertion returned.'); }
      const results = assertion.getClientExtensionResults();
      const first = results && results.prf && results.prf.results && results.prf.results.first;
      if (!first) {
        throw new Error('The key did not return a PRF result (needs Chrome/Edge + a FIDO2 key with hmac-secret).');
      }
      await post({ credentialId: assertion.id, prf: bytesToB64(first) });
      status.className = 'ok';
      status.textContent = 'Done — you can close this tab and return to VS Code.';
    } catch (error) {
      status.className = 'err';
      status.textContent = 'Failed: ' + (error && error.message ? error.message : String(error));
      retry.style.display = '';
      await post({ error: (error && error.message) ? error.message : String(error) });
    }
  }

  retry.addEventListener('click', run);
  run();
</script>
</body>
</html>`;
}
