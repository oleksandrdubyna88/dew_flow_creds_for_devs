import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The bridges the person opened and did not Close (change 11.1, the 72-hour slice, S2, D8): after a window reload or a reboot they come
 * back by themselves once the vault is open, so the old tmux session works with nothing pasted. A Close takes the bridge off this list;
 * a Lock does not (it ends the connection, and the unlock brings it back); a window that closes does not either (a reboot restores it).
 *
 * <p>Only ids are kept: the account and the server entry. The scope stays where E1 keeps it (`bridgeScopeStore.ts`), and the host, the
 * user and the credential are read from the vault at each connect. The file is the person's own (0600, written by a rename); a file that
 * does not parse is an empty list, never an error.</p>
 */

export interface OptIn {
  readonly accountId: string;
  readonly serverId: string;
}

export const OPT_INS_FILE = 'bridge-opt-ins.json';

const isOptIn = (value: unknown): value is OptIn =>
  typeof value === 'object' && value !== null && typeof (value as OptIn).accountId === 'string' && typeof (value as OptIn).serverId === 'string';

const same = (a: OptIn, b: OptIn): boolean => a.accountId === b.accountId && a.serverId === b.serverId;

export class BridgeOptIns {
  private readonly file: string;

  constructor(
    storageDir: string,
    /** Where a write that failed is told; the list is a convenience, so a failure never stops the bridge. */
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    this.file = path.join(storageDir, OPT_INS_FILE);
  }

  list(): OptIn[] {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(isOptIn).map(({ accountId, serverId }) => ({ accountId, serverId })) : [];
    } catch {
      return [];
    }
  }

  add(optIn: OptIn): void {
    const list = this.list();
    if (!list.some((kept) => same(kept, optIn))) {
      this.write([...list, { accountId: optIn.accountId, serverId: optIn.serverId }]);
    }
  }

  remove(optIn: OptIn): void {
    const list = this.list();
    if (list.some((kept) => same(kept, optIn))) {
      this.write(list.filter((kept) => !same(kept, optIn)));
    }
  }

  private write(list: readonly OptIn[]): void {
    const temp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(list), { mode: 0o600 });
      fs.renameSync(temp, this.file);
    } catch (error) {
      this.warn(`the list of bridges to restore could not be written: ${(error as Error).message}`);
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        // the folder itself is not there or not a folder: there is no temp file to remove
      }
    }
  }
}
