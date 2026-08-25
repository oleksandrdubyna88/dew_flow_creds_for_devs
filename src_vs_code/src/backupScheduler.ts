import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import {
  backupDirFor,
  backupIntervalHours,
  backupIntervalHoursFor,
  backupRetainDays,
} from './backupPaths';
import { dueForSnapshot, isSnapshotOf, snapshotFileName, snapshotsToPrune } from './backupSchedule';
import { StorageManager } from './storageManager';
import { TransportFactory } from './transportFactory';
import { StoredAccount } from './types';

const CONFIG_SECTION = 'credSshManager';

/** How often the timer WAKES. Not how often a snapshot is taken — `dueForSnapshot` decides
 *  that, so a machine asleep across its window still snapshots on the next wake rather
 *  than skipping the day. */
const TICK_MS = 15 * 60_000;

/** Where the last run and the last content hash live, per account. */
const STATE_KEY = 'credSshManager.backupState';

interface BackupState {
  lastRunIso?: string;
  lastHash?: string;
}

/**
 * Dated, encrypted snapshots of each account's vault, on a timer, into a folder the
 * operator chooses.
 *
 * <p><b>It copies ciphertext and never touches a key.</b> The snapshot is the same
 * encrypted envelope the sync location already holds, read back through the account's own
 * transport. That is what makes it safe to run unattended: no PIN prompt, no cached master
 * key, no plaintext — and a snapshot is restorable with the existing Import / Restore,
 * because it is byte-for-byte the format that already understands.</p>
 *
 * <p>The consequence worth stating: an account that has never synced has nothing to
 * snapshot, and this says so rather than inventing an export of its own.</p>
 */
export class BackupScheduler implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly configListener: vscode.Disposable;
  private readonly warned = new Set<string>();

  constructor(
    private readonly storage: StorageManager,
    private readonly transports: TransportFactory,
    private readonly memento: vscode.Memento,
    private readonly log: (message: string) => void = () => {},
  ) {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this.restart();
      }
    });
    this.restart();
  }

  dispose(): void {
    this.configListener.dispose();
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private restart(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // The timer runs whenever ANY account wants snapshots. A global 0 used to stop the
    // whole scheduler, which would now also silence an account that had asked for a
    // schedule of its own.
    const wanted = this.storage.getAccounts().some((a) => backupIntervalHoursFor(a) > 0);
    if (!wanted && backupIntervalHours() <= 0) {
      return; // nothing is scheduled anywhere
    }
    this.timer = setInterval(() => void this.runDue(), TICK_MS);
    // One pass now, so a wrong path is discovered immediately rather than in a day.
    void this.runDue();
  }

  /** Snapshot every account whose window has elapsed. Called by the timer and by the command. */
  // eslint-disable-next-line complexity
  async runDue(force = false): Promise<void> {
    if (this.running) {
      return; // a slow network folder must not start a second pass on top of the first
    }
    this.running = true;
    try {
      for (const account of this.storage.getAccounts()) {
        // Per account, so one unreachable folder cannot stop the others. This is the
        // "one failed unit is recorded and skipped" boundary.
        try {
          await this.snapshot(account, force);
        } catch (error) {
          this.warnOnce(account, describe(error));
        }
      }
    } finally {
      this.running = false;
    }
  }

  // eslint-disable-next-line complexity
  private async snapshot(account: StoredAccount, force: boolean): Promise<void> {
    const dir = backupDirFor(account);
    if (dir === undefined) {
      return; // no backup location for this account: nothing was asked for
    }

    const state = this.stateFor(account);
    const last = state.lastRunIso === undefined ? undefined : new Date(state.lastRunIso);
    const hours = backupIntervalHoursFor(account);
    if (!force && hours <= 0) {
      return; // snapshots switched off for this account
    }
    if (!force && !dueForSnapshot(last, new Date(), hours)) {
      return;
    }

    const transport = this.transports.forAccount(account);
    if (transport === undefined) {
      return;
    }

    const content = await transport.readVault(account);
    if (content === undefined || content.length === 0) {
      // Nothing synced yet. Writing an empty snapshot would put a useless file at the
      // TOP of a time-sorted list — the same trap the server's backup hit when it
      // archived an empty data directory after an outage and shadowed the good one.
      this.warnOnce(
        account,
        'nothing has been synced yet, so there is nothing to snapshot. Set a sync location first.',
      );
      return;
    }

    const hash = crypto.createHash('sha256').update(content).digest('hex');
    if (!force && hash === state.lastHash) {
      // Identical bytes. Re-writing them would fill a metered cloud folder with copies
      // of one unchanged vault, one per day, forever.
      await this.remember(account, { lastRunIso: new Date().toISOString(), lastHash: hash });
      return;
    }

    await vscode.workspace.fs.createDirectory(dir);
    const name = snapshotFileName(account.email, account.provider, new Date());
    // Write to a temp name and rename: a cloud-sync client uploads whatever appears the
    // moment it appears, and a half-written file under the final name would be
    // replicated as if it were a snapshot.
    const temp = vscode.Uri.joinPath(dir, `.${name}.part`);
    const target = vscode.Uri.joinPath(dir, name);
    await vscode.workspace.fs.writeFile(temp, Buffer.from(content, 'utf8'));
    await vscode.workspace.fs.rename(temp, target, { overwrite: true });

    this.log(`snapshot written: ${target.fsPath}`);
    await this.remember(account, { lastRunIso: new Date().toISOString(), lastHash: hash });
    this.warned.delete(account.accountId);

    await this.prune(account, dir);
  }

  private async prune(account: StoredAccount, dir: vscode.Uri): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    const mine = entries
      .filter(([, type]) => type === vscode.FileType.File)
      .map(([name]) => name)
      .filter((name) => isSnapshotOf(name, account.email, account.provider));

    for (const name of snapshotsToPrune(mine, backupRetainDays(), new Date())) {
      try {
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, name));
      } catch {
        // A file somebody else has open. It will be a candidate again next time.
      }
    }
  }

  private stateFor(account: StoredAccount): BackupState {
    const all = this.memento.get<Record<string, BackupState>>(STATE_KEY, {});
    return all[account.accountId] ?? {};
  }

  private async remember(account: StoredAccount, state: BackupState): Promise<void> {
    const all = { ...this.memento.get<Record<string, BackupState>>(STATE_KEY, {}) };
    all[account.accountId] = state;
    await this.memento.update(STATE_KEY, all);
  }

  /** One warning per account until it succeeds — a broken folder must not nag every tick. */
  private warnOnce(account: StoredAccount, reason: string): void {
    this.log(`backup skipped for ${account.email}: ${reason}`);
    if (this.warned.has(account.accountId)) {
      return;
    }
    this.warned.add(account.accountId);
    void vscode.window.showWarningMessage(`Vault backup for ${account.email}: ${reason}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
