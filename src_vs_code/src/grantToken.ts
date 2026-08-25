import * as crypto from 'node:crypto';

/**
 * The token a "Share with Claude Code" grant hands out.
 *
 * Shape: `<port>.<secret>`. The broker's loopback port rides inside the token
 * so the CLI dials the exact window that minted it — no discovery file, no
 * "which of my open windows owns this token" ambiguity. The secret half is a
 * 256-bit bearer credential; the port half is not a secret and is never used
 * for authorization (the broker authorizes on the secret alone).
 *
 * Pure and `vscode`-free: the mint side (extension) and the parse side (CLI)
 * share one definition of the format, so it can only be wrong in one place.
 */

const SECRET_BYTES = 32;

export interface ParsedToken {
  port: number;
  secret: string;
}

/** A fresh random secret, base64url, no padding. */
export function newSecret(): string {
  return crypto.randomBytes(SECRET_BYTES).toString('base64url');
}

/** Compose the token a snippet shows. `port` must be a bound TCP port. */
export function formatToken(port: number, secret: string): string {
  return `${port}.${secret}`;
}

/**
 * Split a token back into its parts, or `undefined` if it is not well-formed:
 * a decimal port in `[1, 65535]`, a `.`, and a non-empty base64url secret.
 * Deliberately strict — a malformed token is a client error, never a guess.
 */
// eslint-disable-next-line complexity
export function parseToken(token: string): ParsedToken | undefined {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    return undefined;
  }
  const portText = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!/^[0-9]+$/.test(portText) || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    return undefined;
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  return { port, secret };
}

/**
 * A short, non-reversible label for logs and dialogs — enough to tell two
 * grants apart, never enough to reconstruct the secret.
 */
export function describeSecret(secret: string): string {
  return `${secret.slice(0, 6)}…`;
}
