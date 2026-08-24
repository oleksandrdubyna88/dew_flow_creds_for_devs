import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import * as vscode from 'vscode';
import {
  GOOGLE_TOKEN_ENDPOINT,
  buildGoogleAuthUrl,
  createPkcePair,
  decodeIdToken,
} from './googleOauth';

/**
 * A real `google` authentication provider for VS Code, since none ships
 * built-in. Implements the OAuth 2.0 authorization-code flow with PKCE:
 * opens the system browser via `vscode.env.openExternal` and receives the
 * redirect on a one-shot loopback HTTP server (127.0.0.1, random port —
 * Google "Desktop app" clients allow any loopback port).
 *
 * Configuration: `credSshManager.googleClientId` (setting) + the client
 * secret, prompted once and kept in SecretStorage (for Google installed-app
 * clients the "secret" is not confidential, but it still doesn't belong in
 * settings files). Sessions (with tokens) are stored in SecretStorage too.
 */

const PROVIDER_ID = 'google';
const CONFIG_SECTION = 'credSshManager';
const CLIENT_ID_SETTING = 'googleClientId';
const CLIENT_SECRET_KEY = 'credSshManager.googleClientSecret';
const SESSIONS_KEY = 'credSshManager.googleSessions';
const AUTH_TIMEOUT_MS = 5 * 60_000;

interface StoredSession {
  id: string;
  accessToken: string;
  refreshToken?: string;
  /** Google id_token — what the vault server validates. */
  idToken?: string;
  /** id_token expiry (ms epoch), used to refresh before use. */
  idTokenExpiresAt?: number;
  account: { id: string; label: string };
  scopes: string[];
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  const account = v.account as Record<string, unknown> | undefined;
  return (
    typeof v.id === 'string' &&
    typeof v.accessToken === 'string' &&
    typeof account?.id === 'string' &&
    typeof account?.label === 'string' &&
    Array.isArray(v.scopes) &&
    v.scopes.every((s) => typeof s === 'string')
  );
}

interface CallbackResult {
  code: string;
}

export class GoogleAuthProvider implements vscode.AuthenticationProvider, vscode.Disposable {
  private readonly emitter =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this.emitter.event;

  private readonly registration: vscode.Disposable;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.registration = vscode.authentication.registerAuthenticationProvider(
      PROVIDER_ID,
      'Google',
      this,
      { supportsMultipleAccounts: true },
    );
  }

  dispose(): void {
    this.registration.dispose();
    this.emitter.dispose();
  }

  async getSessions(
    scopes?: readonly string[],
  ): Promise<vscode.AuthenticationSession[]> {
    const sessions = await this.readSessions();
    if (scopes === undefined) {
      return sessions;
    }
    const wanted = normalizeScopes(scopes);
    return sessions.filter((s) => normalizeScopes(s.scopes) === wanted);
  }

  async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    const clientId = await this.resolveClientId();
    const clientSecret = await this.resolveClientSecret();

    const pkce = createPkcePair();
    const state = crypto.randomBytes(16).toString('base64url');
    const { server, port } = await startLoopbackServer();
    const redirectUri = `http://127.0.0.1:${port}/`;

    let callback: CallbackResult;
    try {
      const authUrl = buildGoogleAuthUrl({
        clientId,
        redirectUri,
        state,
        codeChallenge: pkce.challenge,
      });
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));
      callback = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Waiting for Google sign-in in your browser…',
          cancellable: true,
        },
        (_progress, cancel) => waitForCallback(server, state, cancel),
      );
    } finally {
      server.close();
    }

    const token = await exchangeCode({
      code: callback.code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier: pkce.verifier,
    });
    const identity = decodeIdToken(token.idToken);

    const session: StoredSession = {
      id: crypto.randomUUID(),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      idToken: token.idToken,
      idTokenExpiresAt: Date.now() + 55 * 60_000,
      account: { id: identity.sub, label: identity.email },
      scopes: [...scopes],
    };

    // One session per (account, scope-set): replace instead of accumulating.
    const wanted = normalizeScopes(scopes);
    const existing = await this.readSessions();
    const removed = existing.filter(
      (s) => s.account.id === session.account.id && normalizeScopes(s.scopes) === wanted,
    );
    const next = [
      ...existing.filter((s) => !removed.some((r) => r.id === s.id)),
      session,
    ];
    await this.writeSessions(next);
    this.emitter.fire({ added: [session], removed, changed: [] });
    return session;
  }

  async removeSession(sessionId: string): Promise<void> {
    const sessions = await this.readSessions();
    const removed = sessions.filter((s) => s.id === sessionId);
    if (removed.length === 0) {
      return;
    }
    await this.writeSessions(sessions.filter((s) => s.id !== sessionId));
    this.emitter.fire({ added: [], removed, changed: [] });
  }

  /**
   * A currently-valid id_token for this account, refreshed via the stored
   * refresh token when it has aged out. Undefined when we cannot produce
   * one (no session, or the refresh failed) — callers then ask the user to
   * sign in again.
   */
  async getIdToken(accountId: string): Promise<string | undefined> {
    const sessions = await this.readSessions();
    const session = sessions.find((s) => s.account.id === accountId);
    if (session?.idToken === undefined) {
      return undefined;
    }
    const fresh = (session.idTokenExpiresAt ?? 0) > Date.now() + 60_000;
    if (fresh) {
      return session.idToken;
    }
    if (session.refreshToken === undefined) {
      return undefined;
    }
    const clientId = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<string>(CLIENT_ID_SETTING, '')
      .trim();
    const clientSecret = await this.secrets.get(CLIENT_SECRET_KEY);
    if (clientId.length === 0 || clientSecret === undefined) {
      return undefined;
    }
    try {
      const refreshed = await refreshIdToken(clientId, clientSecret, session.refreshToken);
      const next = sessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              idToken: refreshed.idToken,
              accessToken: refreshed.accessToken ?? s.accessToken,
              idTokenExpiresAt: Date.now() + 55 * 60_000,
            }
          : s,
      );
      await this.writeSessions(next);
      return refreshed.idToken;
    } catch {
      return undefined;
    }
  }

  /** Sign out one Google account: drop every session it owns. */
  async removeSessionsForAccount(accountId: string): Promise<void> {
    const sessions = await this.readSessions();
    const removed = sessions.filter((s) => s.account.id === accountId);
    if (removed.length === 0) {
      return;
    }
    await this.writeSessions(sessions.filter((s) => s.account.id !== accountId));
    this.emitter.fire({ added: [], removed, changed: [] });
  }

  /** Forget the stored client secret and all Google sessions. */
  async reset(): Promise<void> {
    const sessions = await this.readSessions();
    await this.secrets.delete(SESSIONS_KEY);
    await this.secrets.delete(CLIENT_SECRET_KEY);
    if (sessions.length > 0) {
      this.emitter.fire({ added: [], removed: sessions, changed: [] });
    }
  }

  // ---------- internals ----------

  /**
   * Google requires every OAuth login to come from a registered app, so a
   * client id is unavoidable — but instead of sending the user to the
   * Settings UI, ask for it inline once and save it to settings ourselves.
   */
  private async resolveClientId(): Promise<string> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const stored = config.get<string>(CLIENT_ID_SETTING, '').trim();
    if (stored.length > 0) {
      return stored;
    }
    const entered = await vscode.window.showInputBox({
      title: 'Google sign-in — one-time setup (1/2)',
      prompt:
        'Paste your OAuth client id (Google Cloud Console → Credentials → Create OAuth client ID → Desktop app). Saved to settings; you will not be asked again.',
      placeHolder: '1234567890-xxxxxxxx.apps.googleusercontent.com',
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim().length === 0 ? 'Client id must not be empty.' : undefined),
    });
    if (entered === undefined) {
      throw new Error('Google sign-in cancelled.');
    }
    const clientId = entered.trim();
    await config.update(CLIENT_ID_SETTING, clientId, vscode.ConfigurationTarget.Global);
    return clientId;
  }

  private async resolveClientSecret(): Promise<string> {
    const stored = await this.secrets.get(CLIENT_SECRET_KEY);
    if (stored !== undefined && stored.length > 0) {
      return stored;
    }
    const entered = await vscode.window.showInputBox({
      title: 'Google sign-in — one-time setup (2/2)',
      prompt:
        'Paste the client secret of the same Desktop-app OAuth client (kept in VS Code SecretStorage). ' +
        'Run "CredsForDevs: Reset Google OAuth" to change it later.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim().length === 0 ? 'Client secret must not be empty.' : undefined),
    });
    if (entered === undefined) {
      throw new Error('Google sign-in cancelled.');
    }
    const secret = entered.trim();
    await this.secrets.store(CLIENT_SECRET_KEY, secret);
    return secret;
  }

  private async readSessions(): Promise<StoredSession[]> {
    const raw = await this.secrets.get(SESSIONS_KEY);
    if (raw === undefined) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isStoredSession) : [];
    } catch {
      return [];
    }
  }

  private writeSessions(sessions: StoredSession[]): Thenable<void> {
    return this.secrets.store(SESSIONS_KEY, JSON.stringify(sessions));
  }
}

/** Exchange a refresh token for a fresh id_token. */
async function refreshIdToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ idToken: string; accessToken?: string }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.id_token !== 'string') {
    throw new Error(`Google token refresh failed: HTTP ${response.status}`);
  }
  return {
    idToken: payload.id_token,
    accessToken: typeof payload.access_token === 'string' ? payload.access_token : undefined,
  };
}

function normalizeScopes(scopes: readonly string[]): string {
  return [...scopes].sort().join(' ');
}

function startLoopbackServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, port: address.port });
    });
  });
}

/** Resolve with the auth code from Google's loopback redirect. */
function waitForCallback(
  server: http.Server,
  expectedState: string,
  cancel: vscode.CancellationToken,
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for the Google sign-in redirect (5 minutes).'));
    }, AUTH_TIMEOUT_MS);
    const finish = (fn: () => void) => {
      clearTimeout(timeout);
      fn();
    };
    cancel.onCancellationRequested(() =>
      finish(() => reject(new Error('Google sign-in cancelled.'))),
    );

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const respond = (message: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body style="font-family:sans-serif"><h3>${message}</h3>` +
            '<p>You can close this tab and return to VS Code.</p></body></html>',
        );
      };

      const error = url.searchParams.get('error');
      if (error !== null) {
        respond('Sign-in failed.');
        finish(() => reject(new Error(`Google reported an authorization error: ${error}.`)));
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (code === null || state === null) {
        respond('Unexpected request.');
        return; // ignore favicon and stray requests, keep waiting
      }
      if (state !== expectedState) {
        respond('Sign-in failed.');
        finish(() =>
          reject(new Error('State mismatch in the Google redirect — possible interception.')),
        );
        return;
      }
      respond('Signed in with Google.');
      finish(() => resolve({ code }));
    });
  });
}

interface ExchangeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}

interface ExchangeResult {
  accessToken: string;
  refreshToken?: string;
  idToken: string;
}

async function exchangeCode(input: ExchangeInput): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
  });
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (error) {
    throw new Error(
      `Could not reach Google's token endpoint: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail =
      typeof payload.error_description === 'string'
        ? payload.error_description
        : typeof payload.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }
  if (typeof payload.access_token !== 'string' || typeof payload.id_token !== 'string') {
    throw new Error('Google token response is missing access_token or id_token.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
    idToken: payload.id_token,
  };
}
