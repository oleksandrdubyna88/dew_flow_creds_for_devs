import { AGENT_FORWARD_REFUSED, type BridgeWallSource } from './bridgeScope';
import type { Refusal } from './brokerRequests';
import { accountOnlyVault } from './mcpAccountVault';
import { type McpVaultSource, visibleConfigDetails, visibleMcpEntries } from './mcpEntries';
import { referenceTextsOf } from './runPlan';
import type { EntityMetadata } from './types';

/**
 * Everything of a {@link BridgeWallSource} that comes from the vault, over one {@link McpVaultSource} (Amendment 2, B.6).
 *
 * <p>Pure: imports no `vscode`. E2 wires `{ scopes, refSource, ...wallSuppliersOf(storage) }`, and the wall world of the
 * scenarios builds its wall from this same function, so a scenario about the listing, the snippet or the refusal runs
 * through what production runs and not a copy of it that could drift. Every supplier narrows to ONE account: `McpEntry`
 * carries no account and an envelope may repeat an id across accounts, so the listing and the snippet are read from
 * {@link accountOnlyVault}.</p>
 */
export function wallSuppliersOf(
  vault: McpVaultSource,
): Pick<BridgeWallSource, 'storedTexts' | 'listEntriesOf' | 'visibleConfigOf' | 'entryRefusal'> {
  return {
    storedTexts: (accountId, entityId) => referenceTextsOf(vault.getNode(accountId, entityId)?.details ?? {}),
    listEntriesOf: (accountId) => visibleMcpEntries(accountOnlyVault(vault, accountId)),
    visibleConfigOf: (accountId, entityId) => visibleConfigDetails(accountOnlyVault(vault, accountId), entityId),
    entryRefusal: (accountId, entityId) => agentForwardRefusal(vault.getNode(accountId, entityId)?.details),
  };
}

/** An entry that forwards the laptop's SSH agent is not used through a bridge: its sentence, or nothing. */
export function agentForwardRefusal(details: EntityMetadata | undefined): Refusal | undefined {
  return details?.agentForward === true ? { code: 'denied', message: AGENT_FORWARD_REFUSED(details.name) } : undefined;
}
