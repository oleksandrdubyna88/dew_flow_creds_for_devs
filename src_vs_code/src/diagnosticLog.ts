import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { LogLevel, dayFolder, formatLine, isExpiredLogDay, logFilePath } from './logFormat';

/**
 * One diagnostic channel for the whole extension, and a file on disk beside it (audit A6).
 *
 * <p>Until now the only output channel was the agent broker's, and every other failure — a
 * sync that could not decrypt, a backup that could not write, a transport that timed out —
 * was a toast. A toast disappears, so a bug report arrived with nothing attached and the
 * question "what did it say?" had no answer. The toast is still right for interrupting a
 * person; this is what they can send afterwards.</p>
 *
 * <h3>No secret reaches it, and that is a property of the API</h3>
 * <p>The only things this takes are a `source` (a module name, written by us) and a `message`.
 * Callers pass either fixed text or `describeError(...)`, and nothing here ever reads a vault:
 * it has no `StorageManager`, no `SecretStorage` and no way to obtain one, so a secret could
 * only arrive if a caller deliberately formatted one into a string. `diagnosticLog.test.ts`
 * drives the real failure paths against a fixture whose secrets are distinctive and greps the
 * output for every one of them.</p>
 *
 * <h3>Failing to log never fails the feature</h3>
 * <p>Every write is guarded. A read-only storage folder, a full disk or a file locked by
 * another window must not turn a working sync into a broken one — the channel is diagnostics,
 * and diagnostics that can take the product down are worse than no diagnostics.</p>
 */

export interface DiagnosticLog extends vscode.Disposable {
  info(source: string, message: string): void;
  warn(source: string, message: string): void;
  error(source: string, message: string): void;
  /** Bring the channel forward — what the "Show Diagnostics" command calls. */
  show(): void;
  /** Absolute path of this run's file, for the message that tells a reporter where to look. */
  readonly file: string;
}

/** Just the part of an output channel this uses, so a test can supply one. */
export interface OutputSink {
  appendLine(line: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
}

export interface DiagnosticLogOptions {
  /** The extension's `globalStorageUri.fsPath`. */
  storageDir: string;
  /** Injected in tests; defaults to the real channel. */
  sink?: OutputSink;
  now?: () => Date;
  pid?: number;
  /** Days of run files to keep; 0 disables the sweep. */
  retainDays?: number;
}

const DEFAULT_RETAIN_DAYS = 14;

function ensureFolder(folder: string): boolean {
  try {
    fs.mkdirSync(folder, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** A disposed channel during shutdown must not become an exception in a caller. */
function say(sink: OutputSink, line: string): void {
  try {
    sink.appendLine(line);
  } catch {
    // The file still has the line.
  }
}

/** Returns whether the file is still usable; a failed write goes quiet rather than throwing. */
function append(file: string, line: string): boolean {
  try {
    fs.appendFileSync(file, `${line}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** A supplied value, or the fallback — built lazily, so an injected sink costs no channel. */
function or<T>(value: T | undefined, fallback: () => T): T {
  return value ?? fallback();
}

/** The defaults, resolved in one place so the builder below reads as what it does. */
function settled(options: DiagnosticLogOptions): {
  now: () => Date;
  sink: OutputSink;
  pid: number;
  retainDays: number;
} {
  return {
    now: or(options.now, () => (): Date => new Date()),
    sink: or(options.sink, () => vscode.window.createOutputChannel('CredsForDevs')),
    pid: or(options.pid, () => process.pid),
    retainDays: or(options.retainDays, () => DEFAULT_RETAIN_DAYS),
  };
}

export function createDiagnosticLog(options: DiagnosticLogOptions): DiagnosticLog {
  const { now, sink, pid, retainDays } = settled(options);
  const startedAt = now();
  const file = path.join(options.storageDir, logFilePath(startedAt, pid));

  // Best effort, always: a diagnostics channel that can throw is a liability.
  let fileUsable = ensureFolder(path.dirname(file));
  sweepOldLogs(options.storageDir, startedAt, retainDays);

  const write = (level: LogLevel, source: string, message: string): void => {
    const line = formatLine(now(), level, source, message);
    say(sink, line);
    if (fileUsable) {
      fileUsable = append(file, line);
    }
  };

  return {
    file,
    info: (source, message) => write('info', source, message),
    warn: (source, message) => write('warn', source, message),
    error: (source, message) => write('error', source, message),
    show: () => sink.show(true),
    dispose: () => sink.dispose(),
  };
}

/**
 * Delete run files older than the retention window.
 *
 * <p>A file per run means a busy week is a lot of files, and nobody prunes a folder they never
 * open. Whole day folders are removed rather than individual files, so the sweep cannot leave
 * an empty directory behind for every day the extension ever ran.</p>
 */
function sweepOldLogs(storageDir: string, now: Date, retainDays: number): void {
  const root = path.join(storageDir, 'logs');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return; // nothing logged yet, or the folder is unreadable — neither is an error here
  }
  const expired = entries.filter(
    (entry) => entry.isDirectory() && isExpiredLogDay(entry.name, now, retainDays),
  );
  for (const entry of expired) {
    removeQuietly(path.join(root, entry.name));
  }
}

/** A folder held open by another window is left for the next run, never reported. */
function removeQuietly(folder: string): void {
  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch {
    // Try again next run.
  }
}

/** Today's folder, for a message that points a reporter at the right place. */
export function todayLogFolder(storageDir: string, now: Date): string {
  return path.join(storageDir, 'logs', dayFolder(now));
}
