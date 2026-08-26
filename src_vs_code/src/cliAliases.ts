/**
 * The names a terminal may use: `creds ssh prod-db` instead of a token pasted from a snippet.
 *
 * <p><b>A name lives longer than a grant; a secret must not.</b> Grants die with the window,
 * and that is the entire revocation story — a grant cannot outlive the process holding it. An
 * alias therefore stores only <code>name → (accountId, entityId, kind)</code>. There is no token
 * here, no secret, and nothing that could be replayed: an alias is a way of saying WHICH entry,
 * not a right to use it. The right still comes from a live window plus a human answering the
 * consent modal.</p>
 *
 * <p><b>What this deliberately gives up.</b> Before aliases, using a credential required a
 * secret the human had copied. Now it requires knowing a name, and names are not secret. The
 * consent modal becomes the load-bearing guard, backed on POSIX by the broker socket's 0600 —
 * and on Windows the named pipe carries only the default DACL, so there it really is the modal
 * alone. That is why the modal must name the entry and the action, and why an alias is opt-in
 * per entry rather than every entry having one.</p>
 *
 * <p>Pure: the storage is passed in, so the rules are a unit test rather than something you
 * discover by clicking.</p>
 */

export interface CliAlias {
  readonly accountId: string;
  readonly entityId: string;
  /** Recorded so the CLI can refuse a verb the entry cannot serve before any call is made. */
  readonly kind: string;
}

export type AliasMap = Readonly<Record<string, CliAlias>>;

/** Long enough to be deliberate, short enough to type. */
export const MAX_ALIAS_LENGTH = 40;

/**
 * Whether a name may be used as an alias.
 *
 * <p>Deliberately narrow: lowercase letters, digits, dash and underscore. A name goes on a
 * command line, so anything a shell might read as an operator, a path, a flag or a glob is
 * refused outright rather than escaped later by whoever remembers to.</p>
 */
export function isValidAlias(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(name) && name.length <= MAX_ALIAS_LENGTH;
}

/** Why a name was refused, in the words the person needs to fix it. */
export function describeAliasProblem(name: string): string | undefined {
  if (name.trim().length === 0) {
    return 'A name is required.';
  }
  if (name.length > MAX_ALIAS_LENGTH) {
    return `Keep it to ${MAX_ALIAS_LENGTH} characters or fewer.`;
  }
  if (!isValidAlias(name)) {
    return 'Use lowercase letters, digits, dash and underscore only, starting with a letter or digit — the name is typed on a command line.';
  }
  return undefined;
}

/**
 * The map with `name` pointing at this entry.
 *
 * <p>Re-pointing an existing name is allowed and is the expected way to move an alias; silently
 * refusing would leave the person with a name they cannot reuse and no way to see why.</p>
 */
export function withAlias(map: AliasMap, name: string, alias: CliAlias): AliasMap {
  return { ...map, [name]: alias };
}

export function withoutAlias(map: AliasMap, name: string): AliasMap {
  const { [name]: _removed, ...rest } = map;
  return rest;
}

/** The alias for this entry, if it has one — so a command can offer *Disable* instead. */
export function aliasFor(map: AliasMap, accountId: string, entityId: string): string | undefined {
  return Object.entries(map).find(
    ([, a]) => a.accountId === accountId && a.entityId === entityId,
  )?.[0];
}

/** Resolve a name, or `undefined` when nothing is enabled under it. */
export function resolveAlias(map: AliasMap, name: string): CliAlias | undefined {
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined;
}

/**
 * Aliases whose entry no longer exists.
 *
 * <p>An alias pointing at a deleted entry would answer "not found" on every call, which reads
 * as a broken CLI rather than as a stale name. Swept rather than resolved lazily so that
 * `creds ls` never lists something that cannot work.</p>
 */
export function danglingAliases(map: AliasMap, exists: (a: CliAlias) => boolean): string[] {
  return Object.entries(map)
    .filter(([, alias]) => !exists(alias))
    .map(([name]) => name);
}

/** The listing `creds ls` prints, sorted so it is stable between calls. */
export function listAliases(map: AliasMap): { name: string; kind: string }[] {
  return Object.entries(map)
    .map(([name, alias]) => ({ name, kind: alias.kind }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
