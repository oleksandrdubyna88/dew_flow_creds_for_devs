import * as vscode from 'vscode';
import { AuthProvider, StoredAccount } from './types';

/**
 * OAuth session handling via the native VS Code Authentication API.
 * `microsoft` is a built-in provider; `google` requires an extension that
 * contributes a "google" authentication provider — without one,
 * getSession throws and we surface a clear authorization failure.
 */

const SCOPES: Record<AuthProvider, readonly string[]> = {
  microsoft: ['user.read'],
  google: ['profile', 'email'],
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Interactive sign-in for a new (or existing) account profile.
 * `clearSessionPreference` lets the user pick a different account of the
 * same provider instead of silently reusing the last one.
 */
export async function signIn(provider: AuthProvider): Promise<StoredAccount> {
  let session: vscode.AuthenticationSession;
  try {
    session = await vscode.authentication.getSession(provider, [...SCOPES[provider]], {
      createIfNone: true,
      clearSessionPreference: true,
    });
  } catch (error) {
    throw new AuthError(
      `Sign-in with ${provider} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    accountId: session.account.id,
    email: session.account.label,
    provider,
  };
}

/**
 * Verify there is an active authentication session for exactly this
 * account. Tries silently first; when the silent session belongs to a
 * different account (or none exists), offers an interactive sign-in and
 * re-checks the account id.
 */
export async function verifyAccountSession(account: StoredAccount): Promise<boolean> {
  const scopes = [...SCOPES[account.provider]];
  try {
    // The silent probe gets its own try: the Google provider THROWS here when its
    // client id is not configured on this machine, and letting that reach the outer
    // catch skipped the "Sign in now?" offer entirely — the user was told to sign in
    // and retry, by a command that could have signed them in.
    let silent;
    try {
      silent = await vscode.authentication.getSession(account.provider, scopes, {
        createIfNone: false,
      });
    } catch {
      silent = undefined;
    }
    if (silent?.account.id === account.accountId) {
      return true;
    }
    const choice = await vscode.window.showWarningMessage(
      `No active ${account.provider} session for ${account.email}. Sign in now?`,
      { modal: true },
      'Sign in',
    );
    if (choice !== 'Sign in') {
      return false;
    }
    const interactive = await vscode.authentication.getSession(account.provider, scopes, {
      createIfNone: true,
      clearSessionPreference: true,
    });
    return interactive.account.id === account.accountId;
  } catch {
    return false;
  }
}
