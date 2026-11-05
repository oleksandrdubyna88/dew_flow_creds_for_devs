import type { AuditDoor } from './agentAuditLog';
import type { BridgeContext, BridgeGrant } from './bridgeContext';
import type { ReadRouteSources } from './brokerReadRoutes';
import { McpUseLookup, McpUseTarget, Refusal, UNKNOWN_TOKEN, aliasTarget, grantForToken, refusalFor } from './brokerRequests';
import type { Grant, GrantLimits, GrantRegistry } from './grantRegistry';
import type { McpEntry } from './mcpEntries';
import type { ConsentStampStore } from './mcpConsentPolicy';
import { planRefs } from './runPlan';
import { RefSource, locateRef } from './secretRef';
import { SerialQueue } from './serialQueue';
import { parseBearer } from './brokerProtocol';

/**
 * The wall of a Remote Bridge: which entries a server's agent may reach, and the one place that decides it.
 *
 * <p>Pure: imports no `vscode`. A bridge door hands the router a trusted {@link BridgeContext}; this module turns
 * that into a {@link DoorView} that wraps every way the router looks something up, so a lookup that is not in the
 * scope of THAT server answers exactly as a lookup that found nothing. The same scope is read again at the moment
 * an action starts ({@link launchRefusal}), because a modal can be open for a minute and the person may narrow the
 * scope, or edit the line, in the meantime.</p>
 *
 * <p><b>The scope is read where it is used, never held.</b> Every wrapped function calls
 * {@link BridgeScopes.read} itself, so narrowing a scope takes effect on the next request without a reconnect and
 * a {@link Scope} is never carried across an `await`.</p>
 */

/** Where the scopes live: this machine's `globalState`, never the vault (parent plan §4.2). */
export const SCOPES_KEY = 'credSshManager.bridgeScopes';
/** Records kept; past it the oldest `at` goes. */
export const MAX_SCOPES = 64;
/** Entries in one scope. No picker offers that many, so `set` refuses past it. */
export const MAX_SCOPE_ENTRIES = 256;

export interface ScopeRecord {
  readonly entries: readonly string[];
  readonly quiet: boolean;
  readonly at: number;
}

/** Length-prefixed like `stampKey`, so `a:b` + `c` and `a` + `b:c` are two keys. */
export function scopeKey(accountId: string, serverEntityId: string): string {
  return `${accountId.length}:${accountId}:${serverEntityId}`;
}

/** One server's scope as it was when it was read. */
export interface Scope {
  readonly entries: ReadonlySet<string>;
  readonly quiet: boolean;
  /** The account is part of the question: an entity id of another account is not in scope. */
  admits(accountId: string, entityId: string): boolean;
}

const NOTHING: ScopeRecord = { entries: [], quiet: false, at: 0 };

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

function hasRecordShape(record: Record<string, unknown>): boolean {
  return typeof record.quiet === 'boolean' && typeof record.at === 'number' && isIdList(record.entries);
}

/** A record we wrote: ids, a switch and a time. Anything else (a hand edit, an older build) reads as nothing. */
function isRecord(value: unknown): value is ScopeRecord {
  return typeof value === 'object' && value !== null && hasRecordShape(value as Record<string, unknown>);
}

/** The whole store as a map of records, or an empty one when it is not what we wrote. */
function recordsOf(stored: unknown): Readonly<Record<string, unknown>> {
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
}

function scopeOf(record: ScopeRecord, accountId: string): Scope {
  const entries: ReadonlySet<string> = new Set(record.entries);
  return { entries, quiet: record.quiet, admits: (account, entityId) => account === accountId && entries.has(entityId) };
}

/**
 * The scope of each server, per account: what its agent may reach, and whether it is asked each time.
 *
 * <p>Over the `Memento` subset of the consent stamps. Reads go to the store every time and read defensively: a
 * missing or malformed record is an empty scope that is not quiet, which is "a new server starts empty" and
 * also what a corrupted file should mean. Writes queue, because two concurrent read-modify-writes compose onto the
 * map they read and one of them is lost.</p>
 */
export class BridgeScopes {
  private readonly writes = new SerialQueue();

  constructor(
    private readonly store: ConsentStampStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** Synchronous and fresh: the store is asked on every call. */
  read(accountId: string, serverEntityId: string): Scope {
    const records = this.records();
    const key = scopeKey(accountId, serverEntityId);
    const stored = Object.prototype.hasOwnProperty.call(records, key) ? records[key] : undefined;
    return scopeOf(isRecord(stored) ? stored : NOTHING, accountId);
  }

  /** Replace one server's scope. Refuses a scope no picker could have offered. */
  set(accountId: string, serverEntityId: string, entries: readonly string[], quiet: boolean): Promise<void> {
    if (entries.length > MAX_SCOPE_ENTRIES) {
      return Promise.reject(new Error(`A Remote Bridge scope holds at most ${MAX_SCOPE_ENTRIES} entries.`));
    }
    const key = scopeKey(accountId, serverEntityId);
    return this.writes.run(() => this.write(key, { entries: [...new Set(entries)], quiet, at: this.now() }));
  }

  /** Take one server's record away (Close and forget). */
  forget(accountId: string, serverEntityId: string): Promise<void> {
    return this.writes.run(async () => {
      const rest = { ...this.records() };
      delete rest[scopeKey(accountId, serverEntityId)];
      await this.store.update(SCOPES_KEY, rest);
    });
  }

  private records(): Readonly<Record<string, unknown>> {
    return recordsOf(this.store.get<unknown>(SCOPES_KEY));
  }

  /** Inside the queue: read what is there now, add this, drop the oldest past the cap, store. */
  private async write(key: string, record: ScopeRecord): Promise<void> {
    const all = { ...this.records(), [key]: record };
    const doomed = Object.entries(all)
      .filter(([other]) => other !== key)
      .map(([other, value]) => [other, isRecord(value) ? value.at : 0] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.max(0, Object.keys(all).length - MAX_SCOPES));
    for (const [other] of doomed) {
      delete all[other];
    }
    await this.store.update(SCOPES_KEY, all);
  }
}

/** What the wall needs from the vault side. Wired by E2.2 (`extension.ts`); a build without it opens no bridge. */
export interface BridgeWallSource {
  readonly scopes: BridgeScopes;
  /** The texts a stored command or script would be searched in — `referenceTextsOf(details)` of the LIVE entity. */
  storedTexts(accountId: string, entityId: string): readonly string[];
  readonly refSource: Pick<RefSource, 'accounts' | 'entities'>;
}

/** Resolve an entry id for one action; the third argument is what a bridge's view adds. */
export type ResolveUse = (
  entryId: string,
  action: string,
  server?: { accountId: string; serverEntityId: string },
) => McpUseLookup;
export type AliasResolver = (name: string) => McpUseTarget | undefined;

/** Every way the router looks something up, behind one object. */
export interface DoorView {
  readonly bridge: BridgeContext | undefined;
  sources(real: ReadRouteSources, resolveAlias: AliasResolver | undefined): ReadRouteSources;
  resolveUse(real: ResolveUse | undefined): ResolveUse | undefined;
  resolveAlias(real: AliasResolver | undefined): AliasResolver | undefined;
  /** What a grant minted on this door carries. `undefined` on the two existing doors. */
  grantFor(): BridgeGrant | undefined;
  /** `grantForToken` behind the wall: an out-of-scope token is `UNKNOWN_TOKEN`, decided by `get` before any `lookup`. */
  grantForToken(
    authorization: string | undefined,
    grants: Pick<GrantRegistry, 'get' | 'lookup'>,
    limits: GrantLimits,
  ): { ok: true; grant: Grant } | { ok: false; message: string };
}

/** The existing doors' view: every method hands back the function it was given, so their code path is today's. */
export const OPEN_VIEW: DoorView = {
  bridge: undefined,
  sources: (real) => real,
  resolveUse: (real) => real,
  resolveAlias: (real) => real,
  grantFor: () => undefined,
  grantForToken,
};

const NOWHERE: ReadRouteSources = { aliases: () => [], mcpEntries: () => Promise.resolve([]), visibleConfig: () => undefined, folders: () => [] };

/** A bridge with no wall is unreachable and still fails closed: every lookup answers nothing. */
export const CLOSED_VIEW: DoorView = {
  bridge: undefined,
  sources: () => NOWHERE,
  resolveUse: () => () => undefined,
  resolveAlias: () => () => undefined,
  grantFor: () => undefined,
  grantForToken: () => ({ ok: false, message: UNKNOWN_TOKEN }),
};

export function doorView(bridge: BridgeContext | undefined, wall: BridgeWallSource | undefined): DoorView {
  if (bridge === undefined) {
    return OPEN_VIEW;
  }
  return wall === undefined ? CLOSED_VIEW : bridgedView(bridge, wall);
}

/** The target if the scope reads it as admitted, else nothing. */
function admitted(scope: Scope, target: McpUseTarget | undefined): McpUseTarget | undefined {
  return target !== undefined && scope.admits(target.accountId, target.entityId) ? target : undefined;
}

/** A row a bridge may list: what this door permits (`use` only), and no dependency on a row not listed. */
function narrowed(row: McpEntry, kept: ReadonlySet<string>): McpEntry {
  return {
    ...row,
    can: { use: row.can.use, edit: false, create: false, delete: false },
    dependsOn: row.dependsOn.filter((name) => kept.has(name)),
  };
}

function entriesIn(scope: Scope, rows: readonly McpEntry[]): readonly McpEntry[] {
  const kept = rows.filter((row) => scope.entries.has(row.id));
  const names = new Set(kept.map((row) => row.name));
  return kept.map((row) => narrowed(row, names));
}

/** The real answer to a use lookup, kept only as far as the scope reads it. */
function scopedLookup(scope: Scope, id: string, found: McpUseLookup): McpUseLookup {
  if (found === undefined) {
    return undefined;
  }
  return found.kind === 'closed' ? closedIn(scope, id, found) : usableIn(scope, found);
}

/** `closed` names the entry and the switch to turn on, which is a disclosure for an entry out of scope: nothing instead. */
function closedIn(scope: Scope, id: string, found: McpUseLookup): McpUseLookup {
  return scope.entries.has(id) ? found : undefined;
}

/** Never quiet on a bridge until E1.4 decides what silences it: no stamp is read, none is written. */
function usableIn(scope: Scope, found: Extract<McpUseLookup, { kind: 'usable' }>): McpUseLookup {
  return admitted(scope, found.target) === undefined ? undefined : { ...found, preConsented: false, rungs: '' };
}

function bridgedView(bridge: BridgeContext, wall: BridgeWallSource): DoorView {
  const scope = (): Scope => wall.scopes.read(bridge.accountId, bridge.serverEntityId);
  const server = { accountId: bridge.accountId, serverEntityId: bridge.serverEntityId };
  return {
    bridge,
    sources: (real, resolveAlias) => ({
      aliases: () => (real.aliases?.() ?? []).filter((row) => admitted(scope(), resolveAlias?.(row.name)) !== undefined),
      mcpEntries: async () => entriesIn(scope(), (await real.mcpEntries?.()) ?? []),
      visibleConfig: (id) => (scope().entries.has(id) ? real.visibleConfig?.(id) : undefined),
      folders: () => [],
    }),
    // The real lookup runs for EVERY id, in scope or not, and the scope decides afterwards: an id that is out of
    // scope must do the same work as one that does not exist, or the time it takes is an answer.
    resolveUse: (real) => (real === undefined ? undefined : (id, action) => scopedLookup(scope(), id, real(id, action, server))),
    resolveAlias: (real) => (real === undefined ? undefined : (name) => admitted(scope(), real(name))),
    grantFor: () => ({ context: bridge, quiet: scope().quiet }),
    grantForToken: (authorization, grants, limits) => bridgedToken(scope, authorization, grants, limits),
  };
}

/**
 * A token behind the wall. Peeked with `get`, which applies no expiry, so a token out of scope is unknown whether it
 * is live or expired: `lookup` would delete an expired grant and say `expired`, which an unknown token never does.
 */
function bridgedToken(
  scope: () => Scope,
  authorization: string | undefined,
  grants: Pick<GrantRegistry, 'get' | 'lookup'>,
  limits: GrantLimits,
): { ok: true; grant: Grant } | { ok: false; message: string } {
  const secret = parseBearer(authorization);
  const peek = secret === undefined ? undefined : grants.get(secret);
  if (peek !== undefined && !scope().admits(peek.accountId, peek.entityId)) {
    return { ok: false, message: UNKNOWN_TOKEN };
  }
  return grantForToken(authorization, grants, limits);
}

/**
 * The route's own not-found sentence, built by the route's own function so it cannot drift: an entry out of scope
 * must read as an entry that is not there.
 */
export function outOfScopeAnswer(via: AuditDoor, body: Record<string, unknown>): Refusal {
  if (via === 'mcp') {
    return refusalFor(undefined);
  }
  if (via === 'alias') {
    const found = aliasTarget(undefined, String(body.alias));
    return found.ok ? refusalFor(undefined) : { code: found.code, message: found.message };
  }
  return { code: 'unauthorized', message: UNKNOWN_TOKEN };
}

/**
 * The one sentence for every reference that cannot be served. Four failures (no such account, no such entity,
 * ambiguous, out of scope) and a throw all say this, because a sentence that told them apart would tell a bridge
 * what is in a vault it may not see. `denied`, not `not_found`: the MCP client's walk moves on from a `not_found`,
 * and this call has to stop.
 */
export function REFERENCE_REFUSED(entityName: string, ref: string): string {
  return `"${entityName}" uses ${ref}, which this Remote Bridge does not serve. Add that entry to this bridge's scope, or take the reference out of the stored command or script.`;
}

/** Stands in for the reference when none could be read: the texts could not be listed, or there is no wall. */
const UNREADABLE = 'a creds:// reference';

function serves(ref: string, wall: BridgeWallSource, scope: Scope): boolean {
  try {
    const located = locateRef(ref, wall.refSource);
    return located.ok && scope.admits(located.accountId, located.entityId);
  } catch {
    return false;
  }
}

/** The first reference of this entity's stored command or script that the scope does not serve; `UNREADABLE` when none could be listed. */
function unservedReference(grant: Grant, context: BridgeContext, wall: BridgeWallSource): string | undefined {
  try {
    const scope = wall.scopes.read(context.accountId, context.serverEntityId);
    return planRefs(wall.storedTexts(grant.accountId, grant.entityId)).refs.find((ref) => !serves(ref, wall, scope));
  } catch {
    return UNREADABLE;
  }
}

/** Every `creds://` target of the grant's entity admitted by a fresh scope, or the one sentence. `undefined` off a bridge. */
export function referenceRefusal(grant: Grant, wall: BridgeWallSource | undefined): Refusal | undefined {
  if (grant.bridge === undefined) {
    return undefined;
  }
  const ref = wall === undefined ? UNREADABLE : unservedReference(grant, grant.bridge.context, wall);
  return ref === undefined ? undefined : { code: 'denied', message: REFERENCE_REFUSED(grant.entityName, ref) };
}

/**
 * The gate at launch: the grant's account and entity against a fresh scope, then its references. `undefined` off a
 * bridge. A bridged grant with no wall is refused as out of scope (unreachable: no bridge opens without one).
 */
export function launchRefusal(
  grant: Grant,
  wall: BridgeWallSource | undefined,
  via: AuditDoor,
  body: Record<string, unknown>,
): Refusal | undefined {
  const bridge = grant.bridge;
  if (bridge === undefined) {
    return undefined;
  }
  if (wall === undefined || !wall.scopes.read(bridge.context.accountId, bridge.context.serverEntityId).admits(grant.accountId, grant.entityId)) {
    return outOfScopeAnswer(via, body);
  }
  return referenceRefusal(grant, wall);
}

/**
 * The seam a reference is resolved through whenever `ctx.bridge` is set (E3.3): `accounts()` the context's row only,
 * `entities()` that account's FULL list, and `fieldReading` `absent` unless the scope admits the entry.
 *
 * <p>`entities()` is not narrowed to the scope, on purpose: a name that is ambiguous for the person must stay
 * ambiguous for the agent, or a reference would resolve silently to the one in scope "until the day it chose the
 * other". The wall is the reading.</p>
 */
export function scopedRefSource(context: BridgeContext, wall: BridgeWallSource, source: RefSource): RefSource {
  return {
    accounts: () => source.accounts().filter((account) => account.accountId === context.accountId),
    entities: (accountId) => (accountId === context.accountId ? source.entities(accountId) : []),
    fieldReading: (accountId, entityId, field) =>
      wall.scopes.read(context.accountId, context.serverEntityId).admits(accountId, entityId)
        ? source.fieldReading(accountId, entityId, field)
        : Promise.resolve({ kind: 'absent' }),
  };
}
