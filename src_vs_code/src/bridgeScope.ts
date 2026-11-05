import type { AuditDoor } from './agentAuditLog';
import type { BridgeContext, BridgeGrant } from './bridgeContext';
import type { ReadRouteSources } from './brokerReadRoutes';
import { GRANT_NOT_ALLOWED, McpUseLookup, McpUseTarget, Refusal, UNKNOWN_TOKEN, aliasTarget, grantForToken, refusalFor } from './brokerRequests';
import type { Grant, GrantLimits, GrantRegistry } from './grantRegistry';
import type { McpEntry } from './mcpEntries';
import type { EntityMetadata } from './types';
import { planRefs } from './runPlan';
import { RefSource, locateRef } from './secretRef';
import { BridgeScopes, type Scope } from './bridgeScopeStore';
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
 * a {@link Scope} is never carried across an `await`. The store is a file per server (`bridgeScopeStore.ts`),
 * read fresh on every check.</p>
 */

export {
  BridgeScopes,
  MAX_SCOPES,
  MAX_SCOPE_ENTRIES,
  SCOPES_DIR,
  SCOPES_LOCK_DIR,
  SCOPE_STALE,
  nodeScopeFs,
  scopeFileName,
  scopeKey,
} from './bridgeScopeStore';
export type { Scope, ScopeFile, ScopeFs } from './bridgeScopeStore';

/** What the wall needs from the vault side. Wired by E2.2 (`extension.ts`); a build without it opens no bridge. */
export interface BridgeWallSource {
  readonly scopes: BridgeScopes;
  /** The texts a stored command or script would be searched in — `referenceTextsOf(details)` of the LIVE entity. */
  storedTexts(accountId: string, entityId: string): readonly string[];
  readonly refSource: Pick<RefSource, 'accounts' | 'entities'>;
  /**
   * The listing of ONE account: `visibleMcpEntries(accountOnlyVault(storage, accountId))`. `McpEntry` carries no
   * account and an envelope may repeat an id across accounts, so a wall by id alone over the whole vault's listing is a breach.
   */
  listEntriesOf(accountId: string): Promise<readonly McpEntry[]>;
  /** The snippet's supplier for ONE account: `visibleConfigDetails(accountOnlyVault(storage, accountId), entityId)`. */
  visibleConfigOf(accountId: string, entityId: string): EntityMetadata | undefined;
  /**
   * Why this entry cannot be used through a bridge at all, asked before anybody is: E2 wires
   * `details.agentForward === true ? { code: 'denied', message: AGENT_FORWARD_REFUSED(name) } : undefined`.
   */
  entryRefusal(accountId: string, entityId: string): Refusal | undefined;
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
      // The scope is read AFTER the listing comes back: a narrow that lands while the rows are being read is the scope they are cut by.
      mcpEntries: async () => {
        const rows = await wall.listEntriesOf(bridge.accountId);
        return entriesIn(scope(), rows);
      },
      visibleConfig: (id) => (scope().entries.has(id) ? wall.visibleConfigOf(bridge.accountId, id) : undefined),
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
 * The one sentence for every reference that cannot be served, and it echoes nothing of the stored text.
 *
 * <p>Four failures (no such account, no such entity, ambiguous, out of scope) and a throw all say this, because a
 * sentence that told them apart would tell a bridge what is in a vault it may not see. And the reference itself is not
 * repeated (E1.3 epoch 3): the stored text of an argument or a variable is text no listing shows, so a sentence that
 * quoted it would be a way to read it. `denied`, not `not_found`: the MCP client's walk moves on from a `not_found`, and
 * this call has to stop.</p>
 */
export function REFERENCE_REFUSED(entityName: string): string {
  return `"${entityName}" uses a creds:// reference this Remote Bridge does not serve. Add every entry it names to this bridge's scope, or take the reference out of the stored command or script.`;
}

/**
 * An entry that forwards the laptop's SSH agent is not used through a bridge: the shared agent answers for every loaded
 * key, which is the whole of the laptop's identity, not the one entry in scope. One sentence on both legs of the check
 * (the wall before the dialog, the action against the live entity), so nobody can tell them apart.
 */
export function AGENT_FORWARD_REFUSED(entityName: string): string {
  return `"${entityName}" is set to forward this computer's SSH agent, and the shared agent answers for every loaded key. A Remote Bridge does not use it: turn agent forwarding off on that entry, or use it from this computer.`;
}

/**
 * What an agent on a bridge reads when a use of an in-scope entry fails for a reason that would name something it may not
 * see (a linked key, a jump host, an error with a path in it). The real reason goes to the journal, on the computer that
 * holds the vault. The code of the refusal it replaces is kept.
 */
export function BRIDGE_USE_REFUSED(entityName: string): string {
  return `"${entityName}" could not be used through this Remote Bridge. The reason is in the agent journal on the computer that holds the vault.`;
}

function serves(ref: string, wall: BridgeWallSource, scope: Scope): boolean {
  try {
    const located = locateRef(ref, wall.refSource);
    return located.ok && scope.admits(located.accountId, located.entityId);
  } catch {
    return false;
  }
}

/** Whether this entity's stored command or script holds a reference the scope does not serve; a text that cannot be listed counts as one. */
function unservedReference(grant: Grant, context: BridgeContext, wall: BridgeWallSource): boolean {
  try {
    const scope = wall.scopes.read(context.accountId, context.serverEntityId);
    return planRefs(wall.storedTexts(grant.accountId, grant.entityId)).refs.some((ref) => !serves(ref, wall, scope));
  } catch {
    return true;
  }
}

/** The wall's word on this entry as a whole, before references; a wall that cannot answer is a refusal. */
function entryBarred(grant: Grant, wall: BridgeWallSource): Refusal | undefined {
  try {
    return wall.entryRefusal(grant.accountId, grant.entityId);
  } catch {
    return { code: 'denied', message: REFERENCE_REFUSED(grant.entityName) };
  }
}

/**
 * What stops this grant's entry being used through a bridge at all (`wall.entryRefusal`: an agent-forwarding entry), then
 * every `creds://` target of its entity admitted by a fresh scope — or the one sentence. `undefined` off a bridge.
 */
export function referenceRefusal(grant: Grant, wall: BridgeWallSource | undefined): Refusal | undefined {
  return grant.bridge === undefined ? undefined : walledRefusal(grant, grant.bridge.context, wall);
}

function walledRefusal(grant: Grant, context: BridgeContext, wall: BridgeWallSource | undefined): Refusal | undefined {
  const denied: Refusal = { code: 'denied', message: REFERENCE_REFUSED(grant.entityName) };
  if (wall === undefined) {
    return denied;
  }
  return entryBarred(grant, wall) ?? (unservedReference(grant, context, wall) ? denied : undefined);
}

/**
 * The gate at launch: on a bridge, a token the person has denied since this call was asked, then the grant's account and
 * entity against a fresh scope, then its references. `undefined` off a bridge. A bridged grant with no wall is refused as
 * out of scope (unreachable: no bridge opens without one).
 *
 * <p>`tokenDenied`: a bridged token call rides a grant of its own, and the token only authenticates it, so the token's
 * Deny (made on another door while this call waited) is not seen by anything that reads the call grant. The caller reads
 * the token's status where it can and says so here; the answer is the one a denied token has always got.</p>
 */
export function launchRefusal(
  grant: Grant,
  wall: BridgeWallSource | undefined,
  via: AuditDoor,
  body: Record<string, unknown>,
  tokenDenied?: boolean,
): Refusal | undefined {
  if (grant.bridge === undefined) {
    return undefined;
  }
  if (tokenDenied === true) {
    return { code: 'denied', message: GRANT_NOT_ALLOWED };
  }
  return admitsEntry(grant, grant.bridge.context, wall) ? referenceRefusal(grant, wall) : outOfScopeAnswer(via, body);
}

/** Whether a fresh read of the bridge's scope admits the grant's account and entry; a bridged grant with no wall admits nothing. */
function admitsEntry(grant: Grant, context: BridgeContext, wall: BridgeWallSource | undefined): boolean {
  return wall !== undefined && wall.scopes.read(context.accountId, context.serverEntityId).admits(grant.accountId, grant.entityId);
}

/**
 * The launch gate bound to one call, built once: asked before anything an Allow triggers, and again at the action
 * boundary. The token a bridged token call spends is read from the registry each time the gate is asked, because a Deny
 * can land at any moment while the dialog is open.
 */
export function launchGate(
  grants: Pick<GrantRegistry, 'get'>,
  wall: BridgeWallSource | undefined,
  call: { readonly grant: Grant; readonly via: AuditDoor; readonly body: Record<string, unknown>; readonly spend?: string },
): () => Refusal | undefined {
  return () => launchRefusal(call.grant, wall, call.via, call.body, call.spend !== undefined && grants.get(call.spend)?.status === 'denied');
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
