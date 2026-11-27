import { AGENT_FORWARD_REFUSED, BRIDGE_USE_REFUSED, type BridgeWallSource } from './bridgeScope';
import { type DbPlatform, type DbProfileRow, bridgedDbPair } from './bridgedDbProfile';
import type { Refusal } from './brokerRequests';
import { accountOnlyVault } from './mcpAccountVault';
import { type McpVaultSource, visibleConfigDetails, visibleMcpEntries } from './mcpEntries';
import { referenceTextsOf } from './runPlan';
import type { DbType, EntityMetadata } from './types';

/**
 * Everything of a {@link BridgeWallSource} that comes from the vault, over one {@link McpVaultSource} (Amendment 2, B.6).
 *
 * <p>Pure: imports no `vscode`. E2 wires `{ scopes, refSource, ...wallSuppliersOf(storage, { profiles: BRIDGED_DB_PROFILES, platform: process.platform }) }`, and the wall world of the
 * scenarios builds its wall from this same function, so a scenario about the listing, the snippet or the refusal runs
 * through what production runs and not a copy of it that could drift. Every supplier narrows to ONE account: `McpEntry`
 * carries no account and an envelope may repeat an id across accounts, so the listing and the snippet are read from
 * {@link accountOnlyVault}.</p>
 */
export function wallSuppliersOf(
  vault: McpVaultSource,
  gate: DbGate,
): Pick<BridgeWallSource, 'storedTexts' | 'listEntriesOf' | 'visibleConfigOf' | 'entryRefusal'> {
  return {
    storedTexts: (accountId, entityId) => referenceTextsOf(vault.getNode(accountId, entityId)?.details ?? {}),
    listEntriesOf: (accountId) => visibleMcpEntries(accountOnlyVault(vault, accountId)),
    visibleConfigOf: (accountId, entityId) => visibleConfigDetails(accountOnlyVault(vault, accountId), entityId),
    entryRefusal: (accountId, entityId) => entryRefusalOf(vault.getNode(accountId, entityId)?.details, gate),
  };
}

/** An entry that forwards the laptop's SSH agent is not used through a bridge: its sentence, or nothing. */
export function agentForwardRefusal(details: EntityMetadata | undefined): Refusal | undefined {
  return details?.agentForward === true ? { code: 'denied', message: AGENT_FORWARD_REFUSED(details.name) } : undefined;
}

/**
 * The table and the system a database entry's pair is asked of before anybody is (E1.7 spec §S7.8). BOTH ARE REQUIRED, so a wiring that forgets them does not compile: a wall whose
 * `entryRefusal` is written by hand would compile and would lose the refusal. E2 hands it `BRIDGED_DB_PROFILES` and `process.platform`.
 */
export interface DbGate {
  readonly profiles: readonly DbProfileRow[];
  readonly platform: DbPlatform;
}

/** The database type of a database entry, or nothing for an entry of another kind and a database entry with no type. */
const dbTypeOf = (details: EntityMetadata | undefined): DbType | undefined => (details?.kind === 'db' ? details.dbType : undefined);

/**
 * A database entry whose client has no served row on this system is refused before the dialog: the code `not_supported` and the generic sentence for the agent, DR1 as the journal's detail.
 * It reads the entry's details and never the stored connection. `undefined` for an entry of another kind, one with no database type and a pair the table serves.
 */
export function dbGateRefusal(details: EntityMetadata | undefined, gate: DbGate): Refusal | undefined {
  const dbType = dbTypeOf(details);
  if (details === undefined || dbType === undefined) {
    return undefined;
  }
  const pair = bridgedDbPair(gate.profiles, dbType, gate.platform);
  return pair.served ? undefined : { code: 'not_supported', message: BRIDGE_USE_REFUSED(details.name), detail: pair.sentence };
}

/** The wall's word on one entry, before anybody is asked: the agent-forwarding refusal first, as before, then the database gate. */
function entryRefusalOf(details: EntityMetadata | undefined, gate: DbGate): Refusal | undefined {
  return agentForwardRefusal(details) ?? dbGateRefusal(details, gate);
}
