import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { BRIDGED_DB_PROFILES, type DbPlatform } from './bridgedDbProfile';
import { SQLCMD_CONTAINERFILE, imageTagOf, sweepEnvFiles, wslcPath } from './containerDb';
import type { ContainerDeps } from './containerDbQuery';
import type { BridgeWallSource } from './bridgeScope';
import { BridgeScopes, SCOPES_DIR, SCOPES_LOCK_DIR, nodeScopeFs } from './bridgeScopeStore';
import { wallSuppliersOf } from './bridgeWallSource';
import { BridgeSessions, type BridgeSessionsDeps, windowOwnership } from './bridgeSessions';
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
    ...wallSuppliersOf(vault, { profiles: BRIDGED_DB_PROFILES, platform: dbPlatformOf(process.platform) }),
  };
}

/** Where the owner locks of this machine's bridges live: one folder per bridge, shared by every window of the profile. */
export const BRIDGE_OWNERS_DIR = 'bridge-owners';

/** The bridges of this window, each kept by a session and owned by one window (change 11.1, S2). */
export function bridgeSessionsOf(storageDir: string, unlocked: () => boolean, onState: BridgeSessionsDeps['onState']): BridgeSessions {
  return new BridgeSessions({ takeOwnership: windowOwnership(nodePath.join(storageDir, BRIDGE_OWNERS_DIR)), unlocked, onState });
}

/** Where a bridged database client runs on this system (S3): on Windows in the Linux container, elsewhere on the system itself. */
export function dbPlatformOf(platform: NodeJS.Platform): DbPlatform {
  return platform === 'win32' ? 'container' : platform;
}

/**
 * The database container of this window (S3), at activation: the env files a killed run left are removed first, whatever the system; then,
 * on Windows, the tool and the image named by the shipped recipe. `runtime` is `undefined` when the tool or the recipe is not there (a query
 * is then refused with the words that say how to prepare it). `undefined` elsewhere: the client runs on the system's own row.
 */
export function dbContainerAtActivation(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, extensionPath: string, storageDir: string): ContainerDeps | undefined {
  sweepEnvFiles(storageDir);
  if (platform !== 'win32') {
    return undefined;
  }
  const recipe = nodePath.join(extensionPath, 'containers', SQLCMD_CONTAINERFILE);
  const tool = wslcPath(env);
  return { runtime: tool === undefined || !fs.existsSync(recipe) ? undefined : { tool, image: imageTagOf(fs.readFileSync(recipe, 'utf8')) } };
}
