import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AUDIT_RETAIN_DAYS,
  auditDayFolder,
  auditFileName,
  auditLogsToPrune,
} from './agentAuditFile';

/**
 * The durable half of the broker's audit: one file per run, swept after a fortnight.
 *
 * <p>Split out of `credsAgentServer.ts` when that file reached its 800-line limit. It is a
 * clean seam rather than an arbitrary one — nothing here needs a grant, a socket or an editor,
 * only a place to write — and it is also the half worth testing on its own, since every one of
 * its failure paths is a path that must NOT take the broker down with it.</p>
 *
 * <p><b>Best-effort in every direction, deliberately.</b> An unwritable storage directory must
 * not stop the broker serving: a missing audit line is a smaller harm than a credential feature
 * that refuses to work. The pairing with `agentAuditFile.ts` is the usual one here — that
 * module decides names and what has aged out, this one touches the disk.</p>
 *
 * <p>The output channel is not a substitute for this and never was: closing the window is ALSO
 * how a grant is revoked, so a record that lived only in the channel died at the exact moment
 * it became history.</p>
 */
export class BrokerAuditWriter {
  private target: string | undefined;

  /**
   * Appends are chained rather than fired and forgotten.
   *
   * <p>Two reasons, and the second is the one that bites: they no longer block the extension
   * host on every broker call — a busy agent loop was a steady drip of synchronous disk I/O on
   * the UI thread — and chaining onto the previous write preserves line order, which parallel
   * appends do not.</p>
   */
  private queue: Promise<void> = Promise.resolve();

  /** Where this run is being written, if anywhere. */
  get file(): string | undefined {
    return this.target;
  }

  /** Open this run's file and sweep whatever has aged out. Never throws. */
  open(storageDir: string | undefined, startedAt: Date, pid: number): void {
    if (storageDir === undefined) {
      return;
    }
    const root = path.join(storageDir, 'logs');
    try {
      fs.mkdirSync(path.join(root, auditDayFolder(startedAt)), { recursive: true });
      this.target = path.join(root, auditDayFolder(startedAt), auditFileName(startedAt, pid));
      this.sweep(root, startedAt);
    } catch {
      this.target = undefined;
    }
  }

  append(line: string): void {
    const target = this.target;
    if (target === undefined) {
      return;
    }
    this.queue = this.queue.then(() =>
      fs.promises.appendFile(target, `${line}\n`, 'utf8').then(undefined, () => undefined),
    );
  }

  /** Everything already queued has reached the disk. For tests and for an orderly shutdown. */
  flush(): Promise<void> {
    return this.queue;
  }

  private sweep(root: string, now: Date): void {
    try {
      const found = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((dir) =>
          fs.readdirSync(path.join(root, dir.name)).map((fileName) => ({ day: dir.name, fileName })),
        );
      for (const stale of auditLogsToPrune(found, AUDIT_RETAIN_DAYS, now)) {
        fs.rmSync(path.join(root, stale.day, stale.fileName), { force: true });
      }
    } catch {
      // A folder we cannot read is a folder we do not prune.
    }
  }
}
