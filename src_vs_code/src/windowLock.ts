import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as crypto from 'node:crypto';

/**
 * One profile, many windows — a lock built on the one operation that cannot half-happen.
 *
 * <p>VS Code runs an extension host per WINDOW, and every window of a profile shares one
 * `globalState` and one `SecretStorage`. `SerialQueue` serializes this extension's dangerous
 * operations within ONE instance and says so in its own header. Two windows are serialized by
 * nothing, and `crossWindowWrites.test.ts` shows what that costs: an import that SUCCEEDS and is
 * reported as successful, then destroyed by another window's account removal, with no error on
 * either side.</p>
 *
 * <h3>Why a directory and not a key</h3>
 *
 * <p>The first design was a lease record in `globalState` with a write-then-read-back to settle a
 * tie. Its review round returned three Blocking findings from three vendors independently, all the
 * same: `Memento.update` is asynchronous and a foreign write arrives by broadcast with no ordering
 * against a local read, so both windows read empty, both write, and each re-reads its own value. Two
 * enter, and nothing is locked.</p>
 *
 * <p><b>`mkdir` without `recursive` is atomic on every platform this ships to</b> — it creates the
 * directory or it fails because one exists, and there is no read-then-write in between to lose. That
 * is the operation this rests on, named first, per `reliability.md`. The directory lives under the
 * extension's `globalStorageUri`, which every window of the profile already shares — the same sharing
 * that makes the problem exist.</p>
 *
 * <h3>The residual race, stated here rather than in a plan</h3>
 *
 * <p>Breaking a stale lock is a RENAME and then a `mkdir`, and the rename is why the first version of
 * this paragraph described a race that no longer exists. Two windows can both decide a lock is stale;
 * only one rename can succeed, the losers remove nothing, and the winner deletes the directory it
 * renamed rather than whatever now stands in that name. What remains is smaller and worth stating: a
 * window can be broken while it is still working, if it went longer than the TTL without a heartbeat
 * — a host frozen for fifteen seconds, not a slow operation, since work does not block the beat. Then
 * two windows run, and the older one's `release` is fenced so it at least cannot remove the newer
 * one's lock.</p>
 *
 * <p>Pure of `vscode`: the filesystem arrives as a port, so the claim, the stale break and the fenced
 * release are unit tests rather than something only two real windows could show.</p>
 */

/** What the lock needs of a filesystem. `mkdir` MUST reject when the directory exists. */
export interface LockFs {
  /** MUST reject with `code: 'EEXIST'` when it exists, and MUST NOT create parents. */
  mkdir(dir: string): Promise<void>;
  /** Atomic within a directory: the destination is replaced, never briefly absent. */
  rename(from: string, to: string): Promise<void>;
  writeFile(file: string, text: string): Promise<void>;
  /** `undefined` when the file is not there — a claim between its `mkdir` and its write. */
  readFile(file: string): Promise<string | undefined>;
  remove(dir: string): Promise<void>;
  /** When the directory itself was created; the fallback age when no holder file was written. */
  createdAt(dir: string): Promise<number | undefined>;
  now(): number;
}

/**
 * How long a holder may go without writing a heartbeat before another window may break its lock.
 *
 * <p>A heartbeat rather than a renewed deadline, which is the distinction the review round insisted
 * on: a holder that renews a deadline goes on being a holder while wedged, and a holder that stops
 * writing a timestamp stops being one without having to notice. A killed window and a stuck window
 * look the same from outside, and that is the point.</p>
 */
export const LOCK_TTL_MS = 15_000;

/** How often a holder refreshes its timestamp. Comfortably inside the TTL, and not chatty. */
export const HEARTBEAT_MS = 4_000;

/** What a holder was given — the fencing id, unique to this ACQUISITION and not to the window. */
export interface Holding {
  readonly id: string;
}

interface Holder {
  readonly id: string;
  readonly at: number;
}

export class WindowLock {
  private readonly holderFile: string;

  constructor(
    private readonly dir: string,
    private readonly io: LockFs,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {
    this.holderFile = nodePath.join(dir, 'holder.json');
  }

  /**
   * Take the lock, or answer that somebody fresh has it.
   *
   * <p>One retry and no more: the second attempt exists because a stale break makes a `mkdir` that
   * would have failed succeed. A loop here would be a window spinning against a peer that is simply
   * working, which is what `LeasedQueue`'s waiting is for.</p>
   */
  async take(): Promise<Holding | undefined> {
    const claimed = await this.claim();
    if (claimed !== undefined || !(await this.breakIfStale())) {
      return claimed;
    }
    return this.claim();
  }

  /** Refresh our timestamp — and only ours. A broken holder must not resurrect its own claim. */
  async beat(held: Holding): Promise<void> {
    if (await this.isOurs(held)) {
      await this.write(held.id);
    }
  }

  /**
   * Give it up, fenced.
   *
   * <p>Only if the holder file still names THIS acquisition. Without that check, a holder that
   * overran its TTL and was broken would delete the lock of the window that replaced it, and two
   * would run — which is the failure the lock exists to prevent, arriving through its exit.</p>
   */
  async release(held: Holding): Promise<void> {
    if (await this.isOurs(held)) {
      await this.io.remove(this.dir);
    }
  }

  /** The atomic step. Success IS the lock; the holder file is bookkeeping written straight after. */
  private async claim(): Promise<Holding | undefined> {
    try {
      await this.io.mkdir(this.dir);
    } catch (error) {
      // ONLY "it is already there" means another window has it. A missing parent directory, a
      // read-only profile or a permission error are not contention, and treating them as such is an
      // infinite poll behind a notice saying another window is writing — which is the shape a fresh
      // install would have taken, since `globalStorageUri` is created lazily. (Code review, three
      // findings.)
      if (!taken(error)) {
        throw error;
      }
      return undefined;
    }
    const id = this.newId();
    await this.write(id);
    return { id };
  }

  /**
   * True when a lock was there, was too old to count, and has been taken out of the way.
   *
   * <p><b>By RENAME, not by remove.</b> Remove-then-mkdir let two windows both decide a lock was
   * stale: the first removed it and a third claimed the free directory, and then the second executed
   * its already-decided remove and deleted that fresh claim — two windows running, which is the
   * failure this class exists to prevent. A rename can only succeed for ONE of them; the losers get
   * an error and never remove anything, and what the winner deletes is the directory it renamed and
   * not whatever now stands in its place. (Code review, Blocking.)</p>
   */
  private async breakIfStale(): Promise<boolean> {
    const age = await this.heldSince();
    if (age === undefined || this.io.now() - age < LOCK_TTL_MS) {
      return false;
    }
    const aside = `${this.dir}.stale-${this.io.now()}-${this.newId()}`;
    try {
      await this.io.rename(this.dir, aside);
    } catch {
      return false;
    }
    await this.io.remove(aside).catch(() => undefined);
    return true;
  }

  /**
   * When the current holder last said it was alive.
   *
   * <p>The holder file if there is one, and the directory's own creation time if there is not — which
   * is the state a window killed between its `mkdir` and its write leaves behind. Without the
   * fallback that directory would never be stale and the profile would be locked for ever by a claim
   * that never finished.</p>
   */
  private async heldSince(): Promise<number | undefined> {
    const holder = await this.read();
    return holder?.at ?? (await this.io.createdAt(this.dir));
  }

  private async isOurs(held: Holding): Promise<boolean> {
    return (await this.read())?.id === held.id;
  }

  /**
   * Write the holder file so that no reader can ever see it half-written.
   *
   * <p>A plain write TRUNCATES, and the heartbeat rewrites this file every few seconds. A peer
   * reading in that window saw an empty file, read it as "no holder", fell back to the directory's
   * creation time — which for any operation running longer than the TTL is stale — and broke a lock
   * that was alive and working. Two reviewers found this independently and both were right: it made
   * the heartbeat, the mechanism that protects a long operation, the thing that killed it.</p>
   */
  private async write(id: string): Promise<void> {
    const draft = `${this.holderFile}.${id}`;
    await this.io.writeFile(draft, JSON.stringify({ id, at: this.io.now() } satisfies Holder));
    await this.io.rename(draft, this.holderFile);
  }

  /** A holder file that is absent, empty or not JSON is no holder — never a throw. */
  private async read(): Promise<Holder | undefined> {
    const raw = await this.io.readFile(this.holderFile);
    return raw === undefined ? undefined : parseHolder(raw);
  }
}

function parseHolder(raw: string): Holder | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return isHolder(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** "Already there" and nothing else. Anything else is a real filesystem problem, not a peer. */
function taken(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'EEXIST';
}

function isHolder(value: unknown): value is Holder {
  const record = value as Record<string, unknown> | null;
  return record !== null && typeof record === 'object'
    && typeof record.id === 'string' && typeof record.at === 'number';
}

/**
 * The real filesystem, as the port sees it.
 *
 * <p>`mkdir` deliberately without `recursive`: with it, an existing directory is a SUCCESS and the
 * lock would hand itself to everybody. That one option is the whole primitive.</p>
 */
export function nodeLockFs(): LockFs {
  return {
    // The parent first and RECURSIVELY, because `globalStorageUri` is created lazily and does not
    // exist on a fresh profile — then the lock directory itself, non-recursively, which is the
    // atomic step. With `recursive` on that second call an existing directory would be a SUCCESS and
    // the lock would hand itself to everybody.
    mkdir: async (dir) => {
      await fsp.mkdir(nodePath.dirname(dir), { recursive: true });
      await fsp.mkdir(dir);
    },
    rename: (from, to) => fsp.rename(from, to),
    writeFile: (file, text) => fsp.writeFile(file, text, 'utf8'),
    readFile: (file) => fsp.readFile(file, 'utf8').then((text) => text as string | undefined, () => undefined),
    remove: (dir) => fsp.rm(dir, { recursive: true, force: true }),
    createdAt: (dir) => fsp.stat(dir).then((stat) => stat.birthtimeMs || stat.ctimeMs, () => undefined),
    now: () => Date.now(),
  };
}
