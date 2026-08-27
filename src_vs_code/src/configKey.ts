import * as crypto from 'node:crypto';

/**
 * The long-lived key that lets an application read one config.
 *
 * <p><b>Deliberately not a grant token.</b> Grants die with the window — "that is the entire
 * revocation story" (`grantRegistry.ts`) — and a grant token carries the window's TCP port in its
 * own text, so it stops meaning anything the moment VS Code restarts. A key pasted into
 * `Program.cs` or a `.env` has to survive a year of restarts, which makes it a different thing
 * with a different lifetime and its own revoke.</p>
 *
 * <p><b>Only the HASH is kept.</b> The key is shown once, at the moment it is minted, and the
 * vault stores a SHA-256 of it. Losing it therefore means minting a new one rather than reading
 * the old one back out — which is the property that makes a leaked vault file useless for
 * reaching a config, and it is why the UI has to say "copy this now" rather than offering a
 * Reveal button later.</p>
 *
 * <p>No slow KDF, and that is a decision rather than an omission: scrypt and its relatives exist
 * to make GUESSING affordable-to-defenders and expensive-to-attackers, which matters when the
 * input is a word a person chose. This input is 256 bits from the OS. There is nothing to guess,
 * and a KDF here would cost every application start real time to defend against nothing.</p>
 *
 * <p>Free of `vscode`, so the shape, the hashing and the comparison are unit tests.</p>
 */

/** 256 bits. The same width `grantToken.ts` draws, and for the same reason. */
const KEY_BYTES = 32;

/**
 * The prefix every key carries.
 *
 * <p>Self-identifying on purpose: somebody who pastes a grant token, an API key or half a
 * password into the field gets told what it is not, instead of a failed read they have to guess
 * the cause of. It is also what lets a leak scanner recognise one of ours on sight.</p>
 */
/**
 * The environment variable the .NET provider reads when it is given no key explicitly.
 *
 * <p>Here rather than in `configAccess.ts` because that module imports `vscode` for its
 * dialog and clipboard, and this is a string every page that explains the key has to name —
 * including the read-only viewer, which is otherwise `vscode`-free and testable. Re-exported
 * from `configAccess.ts` so no caller had to change.</p>
 */
export const CONFIG_KEY_ENV = 'CREDSFORDEVS_KEY';

export const CONFIG_KEY_PREFIX = 'cfgk_';

export function newConfigKey(): string {
  return `${CONFIG_KEY_PREFIX}${crypto.randomBytes(KEY_BYTES).toString('base64url')}`;
}

/** Cheap structural reject, before anything is hashed or any vault is walked. */
export function isConfigKeyShape(value: string): boolean {
  return new RegExp(`^${CONFIG_KEY_PREFIX}[A-Za-z0-9_-]{20,}$`).test(value);
}

/** What the vault stores. Never the key itself. */
export function configKeyHash(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('base64');
}

/**
 * Whether a presented key is the one this hash was made from.
 *
 * <p>Compared in constant time. The values are hashes rather than secrets, so a timing leak here
 * would be a slow and unglamorous oracle rather than a break — but the comparison costs the same
 * either way, and "this one was not worth doing properly" is the sentence that ages worst in a
 * file like this.</p>
 */
export function configKeyMatches(key: string, storedHash: string): boolean {
  if (!isConfigKeyShape(key)) {
    return false;
  }
  const presented = Buffer.from(configKeyHash(key), 'base64');
  const stored = Buffer.from(storedHash, 'base64');
  return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
}

/**
 * A short, non-reversible label for the UI and the audit log.
 *
 * <p>Enough to tell two keys apart when deciding which to revoke, never enough to reconstruct
 * one. The prefix is included because it is the part that identifies the KIND, and a label that
 * dropped it would look like every other truncated secret in the log.</p>
 */
export function describeConfigKey(key: string): string {
  return `${key.slice(0, CONFIG_KEY_PREFIX.length + 6)}…`;
}

/** The part of a stored entity this lookup needs, and nothing else. */
export interface ConfigKeyHolder {
  readonly accountId: string;
  readonly entityId: string;
  /** Absent for every entry nobody has opened to code, which is almost all of them. */
  readonly configKeyHash?: string;
}

/**
 * Which entry, if any, this key opens.
 *
 * <p>A walk rather than an index. A vault holds hundreds of entries at most and almost none of
 * them carry a hash at all, so this is a few hundred cheap rejects and at most a handful of
 * SHA-256s — microseconds, once per application start. An index would be a second structure to
 * keep in step with the tree through sync, import, restore and delete, which is a real cost paid
 * against an imaginary one.</p>
 *
 * <p>Returning on the first match leaks which entry matched, by timing — and that is not a leak:
 * whoever presented a key that matched already knows which entry it opens.</p>
 */
export function findConfigKeyHolder<T extends ConfigKeyHolder>(
  key: string,
  holders: readonly T[],
): T | undefined {
  if (!isConfigKeyShape(key)) {
    return undefined;
  }
  return holders.find(
    (holder) => holder.configKeyHash !== undefined && configKeyMatches(key, holder.configKeyHash),
  );
}
