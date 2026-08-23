import * as crypto from 'node:crypto';

/**
 * Pure OAuth 2.0 helpers for the Google sign-in flow (PKCE, URL building,
 * id_token decoding) — kept free of `vscode` imports so they are
 * unit-testable under plain node:test.
 */

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Scopes actually sent to Google, regardless of what VS Code asked for. */
export const GOOGLE_OAUTH_SCOPES = ['openid', 'email', 'profile'] as const;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** RFC 7636 S256 pair: challenge = base64url(sha256(verifier)). */
export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export interface AuthUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function buildGoogleAuthUrl(options: AuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    // Always show the account chooser so a second profile can be added.
    prompt: 'select_account consent',
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  /** Google's stable account id — used as the profile's accountId. */
  sub: string;
  email: string;
}

/**
 * Decode the payload of an id_token received directly from Google's token
 * endpoint over TLS. Signature verification is not required in that trust
 * model (the token was not relayed by a third party).
 */
export function decodeIdToken(idToken: string): GoogleIdentity {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed id_token received from Google.');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Unreadable id_token payload received from Google.');
  }
  const v = payload as Record<string, unknown>;
  if (typeof v.sub !== 'string' || v.sub.length === 0 || typeof v.email !== 'string') {
    throw new Error('id_token is missing the "sub" or "email" claim.');
  }
  return { sub: v.sub, email: v.email };
}
