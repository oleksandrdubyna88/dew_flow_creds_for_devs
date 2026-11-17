import * as assert from 'node:assert/strict';
import { BRIDGED_ENV_BLANKED_WINDOWS, BRIDGED_ENV_POSIX, BRIDGED_ENV_WINDOWS } from '../bridgedSshEnv';
import { LinksOptions, LinksWorld, linksWorld } from './bridgeLinksWorld';
import { Door, WallOptions, WallWorld, send, wallWorld } from './bridgeWallWorld';

/** What the bridge-links tests share (`bridgeLinks.test.ts`, `bridgeLinksClient.test.ts`): the ask, the two worlds run together, and the allow-listed names. */

/** The names `bridgedSshEnv` ASKS FOR from this process, per platform: those it holds (on win32 under any letter case), and on win32 the three blanked ones, whatever it holds. */
export function allowListedNames(): string[] {
  const names: readonly string[] = process.platform === 'win32' ? BRIDGED_ENV_WINDOWS : BRIDGED_ENV_POSIX;
  const keys = Object.keys(process.env);
  const held = names.filter((name) => keys.some((key) => (process.platform === 'win32' ? key.toUpperCase() === name : key === name)));
  return process.platform === 'win32' ? [...held, ...BRIDGED_ENV_BLANKED_WINDOWS] : held;
}

export const notified = (line: string): string => `prod: ${line} (a Remote Bridge was told only that it could not be used)`;

export const ASK = { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } };

export interface Ran {
  readonly lw: LinksWorld;
  readonly ww: WallWorld;
}

/** A links world and the wall world that runs its action for real; both are torn down whatever `scenario` did. */
export async function both(links: LinksOptions, wall: WallOptions, scenario: (r: Ran) => Promise<void>): Promise<void> {
  const lw = await linksWorld(links);
  const ww = await wallWorld({ ...wall, exec: lw.exec });
  try {
    await scenario({ lw, ww });
  } finally {
    ww.dispose();
    lw.cleanup();
  }
}

export const body = (door: Door, ww: WallWorld): ReturnType<typeof send> => send(door, ASK).then((reply) => reply, () => assert.fail(`no answer through ${ww.main}`));
