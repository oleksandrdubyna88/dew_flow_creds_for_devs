import * as nodePath from 'node:path';
import { BRIDGED_DB_PROFILES } from './bridgedDbProfile';
import type { BridgeWallSource } from './bridgeScope';
import { BridgeScopes, SCOPES_DIR, SCOPES_LOCK_DIR, nodeScopeFs } from './bridgeScopeStore';
import { wallSuppliersOf } from './bridgeWallSource';
import { LeasedQueue } from './leasedQueue';
import type { McpVaultSource } from './mcpEntries';
import type { RefSource } from './secretRef';
import { WindowLock, nodeLockFs } from './windowLock';

/**
 * The wiring of a Remote Bridge's wall (change 11.1, the 72-hour slice, S1; what E2.2 named): the scope store of this machine and the
 * wall's suppliers over the vault. Pure wiring, no `vscode`: every part is E1's and is tested there.
 */

/** The scope of each server: one file per server under the storage folder, written one window at a time. */
export function bridgeScopesOf(storageDir: string): BridgeScopes {
  return new BridgeScopes(
    nodePath.join(storageDir, SCOPES_DIR),
    nodeScopeFs(),
    new LeasedQueue(new WindowLock(nodePath.join(storageDir, SCOPES_LOCK_DIR), nodeLockFs())),
  );
}

/**
 * The wall a bridge door stands behind. The database gate is this system's (E1.7 spec §S7.8): a database entry whose client has no served
 * row here is refused before anybody is asked.
 */
export function bridgeWallOf(vault: McpVaultSource, scopes: BridgeScopes, refSource: Pick<RefSource, 'accounts' | 'entities'>): BridgeWallSource {
  return {
    scopes,
    refSource,
    ...wallSuppliersOf(vault, { profiles: BRIDGED_DB_PROFILES, platform: process.platform }),
  };
}
