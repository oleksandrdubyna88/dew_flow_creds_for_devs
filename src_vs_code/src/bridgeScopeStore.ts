import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';

/**
 * Where the scope of a Remote Bridge is kept: one small file per server, revisioned, written under the cross-window lock.
 *
 * <p>Pure: imports no `vscode`. Out of `bridgeScope.ts` (which re-exports all of it) because that file decides, and this
 * one stores. <b>A file, not `globalState` (E1.3 epoch 3, parent plan §4.2).</b> Each window holds its own copy of
 * `globalState` and the last write wins, so a scope narrowed in one window could fail to reach the window that owns the
 * bridge, and a stale write could restore what the owner removed. A file is read fresh on every check, so a narrow in any
 * window is the next request's scope everywhere.</p>
 *
 * <p>A write takes the lock (`writes`, a `LeasedQueue` over a `WindowLock` in production), re-reads inside it, and is
 * refused with {@link SCOPE_STALE} when the revision it was made from is no longer the file's. The write itself is
 * temp-and-rename, so a reader sees the whole old file or the whole new one.</p>
 */

/** Where the scope files live, under `globalStorageUri`. */
export const SCOPES_DIR = 'bridges/scopes';
/** The `WindowLock`'s directory, beside it. */
export const SCOPES_LOCK_DIR = 'bridges/scopes.lock';
/** Records kept; past it the oldest `at` goes. */
export const MAX_SCOPES = 64;
/** Entries in one scope. No picker offers that many, so `set` refuses past it. */
export const MAX_SCOPE_ENTRIES = 256;
/** What a write made from an old copy is told. */
/** `set` met a file it could not read, or one that is not this server's record: nothing was written (parent §4.2). */
export const SCOPE_UNREADABLE = 'The scope of this Remote Bridge could not be read, so nothing was changed. Look at it again; if it stays unreadable, close the bridge and open it again.';
export const SCOPE_STALE = 'The scope of this Remote Bridge changed in another window. Look at it again, then save.';

/**
 * The revision of a scope that is not there: no file, a file that does not parse, or one that is somebody else's. It is
 * never written to a file, and a file that carries it is not a scope. A copy taken of the absent scope hands it back to
 * `set`, which then lands only if the file is still absent.
 */
export const NO_SCOPE = 'absent';

/** The file: what we wrote, and whose it is. */
export interface ScopeFile {
  readonly v: 1;
  readonly accountId: string;
  readonly serverEntityId: string;
  readonly entries: readonly string[];
  readonly quiet: boolean;
  /** A fresh random id at every write — never a counter: a counter repeats after a Close (Amendment 2, B.5). */
  readonly revision: string;
  readonly at: number;
}

/** Length-prefixed like `stampKey`, so `a:b` + `c` and `a` + `b:c` are two keys. */
export function scopeKey(accountId: string, serverEntityId: string): string {
  return `${accountId.length}:${accountId}:${serverEntityId}`;
}

/** The key's characters are not legal in a Windows file name, so the file is named by their hash. */
export function scopeFileName(accountId: string, serverEntityId: string): string {
  return `${crypto.createHash('sha256').update(scopeKey(accountId, serverEntityId)).digest('hex')}.json`;
}

/** The filesystem as a port, like `LockFs` (`windowLock.ts`). */
export interface ScopeFs {
  /** `undefined` only when the file is ABSENT (ENOENT); any other error is thrown, so a file that cannot be read is told from one that is not there. */
  readSync(file: string): string | undefined;
  /** Names ending in `.json`; `[]` when the directory is absent. */
  list(dir: string): Promise<readonly string[]>;
  /** `mkdir -p` the parent; write `<file>.<uuid>.tmp`; rename over `file`. */
  write(file: string, text: string): Promise<void>;
  /** ENOENT is success. */
  remove(file: string): Promise<void>;
}

/** One server's scope as it was when it was read. */
export interface Scope {
  readonly entries: ReadonlySet<string>;
  readonly quiet: boolean;
  /** {@link NO_SCOPE} when the file is absent or corrupt; what `set` must be handed back. */
  readonly revision: string;
  /** The account is part of the question: an entity id of another account is not in scope. */
  admits(accountId: string, entityId: string): boolean;
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

const isRevision = (value: unknown): boolean => typeof value === 'string' && value !== '' && value !== NO_SCOPE;

function hasIdentity(record: Record<string, unknown>): boolean {
  return record.v === 1 && typeof record.accountId === 'string' && typeof record.serverEntityId === 'string';
}

function hasBody(record: Record<string, unknown>): boolean {
  return typeof record.quiet === 'boolean' && typeof record.at === 'number' && isRevision(record.revision) && isIdList(record.entries);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parsed(text: string | undefined): unknown {
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A file we wrote: a version, whose it is, ids, a switch, a revision and a time. Anything else reads as nothing. */
function parseScopeFile(text: string | undefined): ScopeFile | undefined {
  const record = asRecord(parsed(text));
  return record !== undefined && hasIdentity(record) && hasBody(record) ? (record as unknown as ScopeFile) : undefined;
}

/** What an absent or unreadable file reads as: nothing, not quiet, no revision. */
const EMPTY: Pick<ScopeFile, 'entries' | 'quiet' | 'revision'> = { entries: [], quiet: false, revision: NO_SCOPE };

function scopeOf(file: ScopeFile | undefined, accountId: string): Scope {
  const { entries: ids, quiet, revision } = file ?? EMPTY;
  const entries: ReadonlySet<string> = new Set(ids);
  return { entries, quiet, revision, admits: (account, entityId) => account === accountId && entries.has(entityId) };
}

/** The record only when it names this account and this server: a file can be moved by hand. */
function ownRecord(file: ScopeFile | undefined, accountId: string, serverEntityId: string): ScopeFile | undefined {
  return file?.accountId === accountId && file.serverEntityId === serverEntityId ? file : undefined;
}

/** What `set` and `forget` run inside: one writer at a time, across windows. */
export interface ScopeWrites {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * The scope of each server, per account: what its agent may reach, and whether it is asked each time.
 *
 * <p>Reads go to the file every time, synchronously, and read defensively: an absent, unparseable or foreign file is an
 * empty scope at {@link NO_SCOPE} that is not quiet, which is "a new server starts empty" and also what a corrupted file
 * should mean. A file can be moved by hand, so a file that names another account or server than the one asked for is
 * empty too.</p>
 */
export class BridgeScopes {
  constructor(
    private readonly dir: string,
    private readonly io: ScopeFs,
    private readonly writes: ScopeWrites,
    private readonly now: () => number = Date.now,
  ) {}

  /** Synchronous and fresh: the file is read on every call. A read that fails is no scope: a check fails closed. */
  read(accountId: string, serverEntityId: string): Scope {
    try {
      return scopeOf(this.fileOf(accountId, serverEntityId), accountId);
    } catch {
      return scopeOf(undefined, accountId);
    }
  }

  /**
   * Replace one server's scope, inside the lock: re-read, refuse a revision that is not `expectedRevision`, write a
   * fresh random revision, prune to {@link MAX_SCOPES} by `at` (never this file). Answers the new revision.
   */
  set(accountId: string, serverEntityId: string, entries: readonly string[], quiet: boolean, expectedRevision: string): Promise<string> {
    if (entries.length > MAX_SCOPE_ENTRIES) {
      return Promise.reject(new Error(`A Remote Bridge scope holds at most ${MAX_SCOPE_ENTRIES} entries.`));
    }
    return this.writes.run(async () => {
      if (this.revisionForSet(accountId, serverEntityId) !== expectedRevision) {
        throw new Error(SCOPE_STALE);
      }
      const written: ScopeFile = { v: 1, accountId, serverEntityId, entries: [...new Set(entries)], quiet, revision: crypto.randomUUID(), at: this.now() };
      const file = this.pathOf(accountId, serverEntityId);
      await this.io.write(file, JSON.stringify(written));
      await this.prune(file);
      return written.revision;
    });
  }

  /** Take one server's file away, inside the lock (Close and forget). */
  forget(accountId: string, serverEntityId: string): Promise<void> {
    return this.writes.run(() => this.io.remove(this.pathOf(accountId, serverEntityId)));
  }

  private pathOf(accountId: string, serverEntityId: string): string {
    return nodePath.join(this.dir, scopeFileName(accountId, serverEntityId));
  }

  /**
   * The revision `set` compares, read STRICTLY: ENOENT is {@link NO_SCOPE}; a read that fails, or a file that exists and is not this
   * server's record, is refused, because `read` answers no scope for both and a write would go over a record that was not read.
   */
  private revisionForSet(accountId: string, serverEntityId: string): string {
    const text = this.strictText(accountId, serverEntityId);
    if (text === undefined) {
      return NO_SCOPE;
    }
    const file = ownRecord(parseScopeFile(text), accountId, serverEntityId);
    if (file === undefined) {
      throw new Error(SCOPE_UNREADABLE);
    }
    return file.revision;
  }

  /** The file's text, `undefined` only when it is absent; a read that fails is refused. */
  private strictText(accountId: string, serverEntityId: string): string | undefined {
    try {
      return this.io.readSync(this.pathOf(accountId, serverEntityId));
    } catch {
      throw new Error(SCOPE_UNREADABLE);
    }
  }

  private fileOf(accountId: string, serverEntityId: string): ScopeFile | undefined {
    return ownRecord(parseScopeFile(this.io.readSync(this.pathOf(accountId, serverEntityId))), accountId, serverEntityId);
  }

  /**
   * Inside the lock: past the cap the oldest `at` goes, a file that reads but does not parse oldest of all, a file that cannot be
   * READ is skipped (it is left alone, not ranked first), and never the file just written.
   */
  private async prune(written: string): Promise<void> {
    const names = await this.io.list(this.dir);
    const others = names
      .map((name) => nodePath.join(this.dir, name))
      .filter((file) => file !== written)
      .flatMap((file) => this.ranked(file))
      .sort((a, b) => a[1] - b[1]);
    for (const [file] of others.slice(0, Math.max(0, names.length - MAX_SCOPES))) {
      await this.io.remove(file);
    }
  }

  /** A neighbour and its `at`; nothing for one that cannot be read. */
  private ranked(file: string): ReadonlyArray<readonly [string, number]> {
    try {
      return [[file, parseScopeFile(this.io.readSync(file))?.at ?? 0]];
    } catch {
      return [];
    }
  }
}

const RENAME_RETRIES = 3;
const RENAME_PAUSE_MS = 50;

/** A rename a reader is holding open (Windows) fails with one of these, and succeeds a moment later. */
const isHeld = (error: unknown): boolean => ['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '');
const givesUp = (attempt: number, error: unknown): boolean => attempt >= RENAME_RETRIES || !isHeld(error);

/** Rename over `to`, retried a few times when a reader holds it (EPERM/EBUSY on Windows). */
async function renameOver(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (error) {
      if (givesUp(attempt, error)) {
        throw error;
      }
      await new Promise<void>((resume) => setTimeout(resume, RENAME_PAUSE_MS));
    }
  }
}

/** The real filesystem. */
export function nodeScopeFs(): ScopeFs {
  return {
    readSync: (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return undefined;
        }
        throw error;
      }
    },
    list: async (dir) => {
      try {
        return (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.json'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },
    write: async (file, text) => {
      await fs.promises.mkdir(nodePath.dirname(file), { recursive: true });
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temp, text, 'utf8');
        await renameOver(temp, file);
      } catch (error) {
        await fs.promises.rm(temp, { force: true });
        throw error;
      }
    },
    remove: (file) => fs.promises.rm(file, { force: true }),
  };
}
