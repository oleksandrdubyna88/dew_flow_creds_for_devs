import { ENTITY_KINDS, EntityKind, EntityMetadata, kindOf } from './types';

/**
 * What kind of thing an entity is — asked in ONE place (audit 2026-08-25, A4).
 *
 * <p>The kind used to be derived every time, from a bag of optional flags
 * (`isSshKey`/`isVpn`/`isDb`/`isTerminal`/`isScript`/`isSshEnabled`) whose priority order
 * lived in `kindOf`. That cost the product two shipped-but-unreachable features: `terminal`
 * in 0.26.0, and `script` missing from the Type selector. An entity now CARRIES its kind, so
 * a new kind is a value in one list rather than a flag every reader must learn about.</p>
 *
 * <h3>Why the flags are still written</h3>
 * <p>A vault syncs to machines that may run an older build, and shares travel to colleagues
 * who certainly do. An older build derives the kind from the flags and knows nothing about
 * `kind` — so dropping the flags would make every synced entity read as a plain credential
 * over there, silently taking away its Connect, its Start, its Run. `stampKind` therefore
 * writes BOTH: the discriminant for us, the flags for them. They are a compatibility shim
 * with a defined end (every machine on a build that reads `kind`), not a second source of
 * truth — `resolveKind` prefers `kind` whenever it is present.</p>
 */

export function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && (ENTITY_KINDS as readonly string[]).includes(value);
}

/**
 * The kind of an entity: what it says it is, or — for a record written before this field
 * existed — what its flags imply. This is the ONLY question-answering path; nothing else may
 * read the flags to decide a kind.
 */
export function resolveKind(details: EntityMetadata | undefined): EntityKind {
  return isEntityKind(details?.kind) ? details.kind : kindOf(details);
}

/**
 * The record as it should be WRITTEN: its kind stated, and the legacy flags set to agree with
 * it so an older build reads the same entity. Idempotent, and never invents a kind — an
 * entity whose flags say nothing is a credential, exactly as `kindOf` has always said.
 */
export function stampKind(details: EntityMetadata): EntityMetadata {
  const kind = resolveKind(details);
  return {
    ...details,
    kind,
    // An unfirable burn never reaches the vault — see `permittedBurnPolicy`.
    burnPolicy: permittedBurnPolicy(kind, details.burnPolicy),
    ...legacyFlags(kind, details.isSshEnabled === true),
  };
}

/**
 * The pre-`kind` flags, rewritten FROM the kind rather than preserved — so the two can never
 * disagree after an edit that changed the type, where a stale flag would win on an older
 * machine and leave the entity being two things at once.
 */
function legacyFlags(kind: EntityKind, wasSshEnabled: boolean): Partial<EntityMetadata> {
  const on = (of: EntityKind): true | undefined => (kind === of ? true : undefined);
  return {
    isSshEnabled: kind === 'ssh' || wasSshEnabled,
    isSshKey: on('sshkey'),
    isVpn: on('vpn'),
    isDb: on('db'),
    isTerminal: on('terminal'),
    isScript: on('script'),
  };
}

/**
 * Whether the tree offers "Connect via SSH" for this entity.
 *
 * <p>Deliberately BROADER than `resolveKind(d) === 'ssh'`, and this is the divergence the
 * audit named (S5): the tree has always keyed its `:ssh` menu on a host being present, while
 * `kindOf` keys the KIND on `isSshEnabled`. They are now one named predicate instead of two
 * spellings, but the breadth is kept on purpose — an entry that carries a host and was never
 * marked ssh-enabled (an import, or an old hand-made credential) can be connected to today,
 * and narrowing this would silently remove that from vaults in the field. Whether to narrow
 * it is a product decision, not a refactor; until it is taken, the difference is stated here
 * and pinned by a test rather than left to be re-discovered.</p>
 */
export function canConnectSsh(details: EntityMetadata | undefined): boolean {
  return resolveKind(details) === 'ssh' || (details?.host ?? '') !== '';
}

/**
 * The kinds the agent broker actually serves — the registries in `sshUseActions.ts` and
 * `agentUseActions.ts`, which is where this list is enforced rather than asserted.
 *
 * <p>`sshkey` is deliberately absent: the broker never serves a key pair, so nothing about a
 * key pair can ever pass through the one place a one-use burn fires.</p>
 */
export type BrokerServedKind = Exclude<EntityKind, 'sshkey'>;

/**
 * Whether a one-use burn could ever fire for this kind.
 *
 * <p>A burn fires only through the broker (a human copying a password deliberately does NOT
 * burn it), so `oneUse` on a kind the broker does not serve is a promise nothing can keep:
 * the entry would sit in the vault forever while the UI said it would vanish after first use.
 * Temporary SSH KEYS for a customer's instance are the first thing anyone reaches for here,
 * which is exactly why the impossible combination has to be refused rather than documented.</p>
 */
export function canBurnOnAgentUse(kind: EntityKind): kind is BrokerServedKind {
  return kind !== 'sshkey';
}

/**
 * The burn policy an entity of this kind may actually carry — `oneUse` dropped where nothing
 * could ever fire it. Applied on WRITE (see `stampKind`), so the impossible state cannot reach
 * the vault even if a form offers it; a form that offers it anyway is a second bug, not a
 * second line of defence.
 */
export function permittedBurnPolicy(
  kind: EntityKind,
  policy: EntityMetadata['burnPolicy'],
): EntityMetadata['burnPolicy'] {
  return policy === 'oneUse' && !canBurnOnAgentUse(kind) ? undefined : policy;
}

/**
 * The compile-time half of "one place of truth": a `switch` over every kind ends here, and
 * adding a kind without teaching that switch about it stops being a runtime surprise and
 * becomes a type error at the call site.
 */
export function assertNever(value: never, what: string): never {
  throw new Error(`${what}: unhandled kind ${JSON.stringify(value)}`);
}
