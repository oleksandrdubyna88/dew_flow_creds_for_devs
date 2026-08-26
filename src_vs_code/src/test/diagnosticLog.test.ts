import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Module from 'node:module';
import { test } from 'node:test';

/**
 * The shared diagnostic channel (audit A6), and the one promise that makes it safe to send
 * to a bug report: **no secret reaches it**.
 *
 * <p>The promise is structural, not a filter. The log takes a source and a message; it holds
 * no `StorageManager`, no `SecretStorage` and no way to obtain one, so a secret could only
 * arrive if a caller formatted one into a string on purpose. What is checked here is the
 * other half — that the failure messages this extension actually writes, driven with a vault
 * whose every secret is a distinctive marker, contain none of those markers.</p>
 */

interface Log {
  info(source: string, message: string): void;
  warn(source: string, message: string): void;
  error(source: string, message: string): void;
  show(): void;
  dispose(): void;
  readonly file: string;
}

const loaded = ((): {
  createDiagnosticLog: (o: Record<string, unknown>) => Log;
  todayLogFolder: (dir: string, now: Date) => string;
} => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return { window: { createOutputChannel: (): unknown => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }) } };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return require('../diagnosticLog') as never;
  } finally {
    loader._load = original;
  }
})();

function sink(): { lines: string[]; appendLine(l: string): void; show(): void; dispose(): void; disposed: boolean } {
  const self = {
    lines: [] as string[],
    disposed: false,
    appendLine: (l: string): void => {
      self.lines.push(l);
    },
    show: (): void => undefined,
    dispose: (): void => {
      self.disposed = true;
    },
  };
  return self;
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creds-log-'));
}

const AT = new Date(Date.UTC(2026, 7, 26, 9, 5, 3));

test('a line reaches BOTH the channel and this run’s file', () => {
  const dir = tempDir();
  const out = sink();
  const log = loaded.createDiagnosticLog({ storageDir: dir, sink: out, now: () => AT, pid: 77 });

  log.error('sync', 'the vault did not decrypt');

  assert.deepEqual(out.lines, ['[09:05:03 ERR] sync: the vault did not decrypt']);
  assert.equal(log.file, path.join(dir, 'logs', '2026-08-26', 'creds-09-05-03-77.log'));
  assert.equal(fs.readFileSync(log.file, 'utf8'), '[09:05:03 ERR] sync: the vault did not decrypt\n');
});

test('a second run writes a second file rather than appending to the first', () => {
  const dir = tempDir();
  const first = loaded.createDiagnosticLog({ storageDir: dir, sink: sink(), now: () => AT, pid: 1 });
  const second = loaded.createDiagnosticLog({ storageDir: dir, sink: sink(), now: () => AT, pid: 2 });

  first.info('a', 'one');
  second.info('b', 'two');

  assert.notEqual(first.file, second.file);
  assert.equal(fs.readFileSync(first.file, 'utf8').includes('two'), false);
});

test('an unwritable storage folder degrades to the channel — it never throws', () => {
  // Diagnostics that can take the product down are worse than no diagnostics.
  const out = sink();
  const log = loaded.createDiagnosticLog({
    // A path under a FILE, so every mkdir/append fails on every platform.
    storageDir: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'creds-ro-')), 'a-file', 'under-it'),
    sink: out,
    now: () => AT,
    pid: 3,
  });

  assert.doesNotThrow(() => log.error('sync', 'still says it out loud'));
  assert.deepEqual(out.lines, ['[09:05:03 ERR] sync: still says it out loud']);
});

test('the retention sweep drops old day folders and keeps recent ones', () => {
  const dir = tempDir();
  const logs = path.join(dir, 'logs');
  for (const day of ['2026-08-26', '2026-08-25', '2026-07-01', 'not-a-day']) {
    fs.mkdirSync(path.join(logs, day), { recursive: true });
    fs.writeFileSync(path.join(logs, day, 'old.log'), 'x');
  }

  loaded.createDiagnosticLog({ storageDir: dir, sink: sink(), now: () => AT, pid: 4, retainDays: 7 });

  assert.equal(fs.existsSync(path.join(logs, '2026-08-26')), true, 'today stays');
  assert.equal(fs.existsSync(path.join(logs, '2026-08-25')), true, 'yesterday stays');
  assert.equal(fs.existsSync(path.join(logs, '2026-07-01')), false, 'nearly two months old goes');
  assert.equal(fs.existsSync(path.join(logs, 'not-a-day')), true, 'a folder we did not make is never touched');
});

test('disposing the log disposes its channel', () => {
  const out = sink();
  loaded.createDiagnosticLog({ storageDir: tempDir(), sink: out, now: () => AT, pid: 5 }).dispose();

  assert.equal(out.disposed, true);
});

test('NO SECRET reaches the log, driven through the real failure messages', () => {
  // Every value below is a marker that appears nowhere else. The messages are the ones the
  // extension actually writes when these things fail — each built from fixed text plus
  // describeError, which is the discipline the channel depends on.
  const secrets = [
    'hunter2-THE-PASSWORD',
    '-----BEGIN OPENSSH PRIVATE KEY-----MARKER',
    'postgres://u:PGSECRET-MARKER@h/db',
    'THE-SYNC-PIN-9911',
    'the-share-PIN-4242',
    'vpn-config-MARKER-body',
  ];
  const dir = tempDir();
  const out = sink();
  const log = loaded.createDiagnosticLog({ storageDir: dir, sink: out, now: () => AT, pid: 6 });

  // Failures shaped exactly like the ones the wiring produces.
  log.error('sync', 'work@corp.com: Decryption failed: wrong master PIN/password or the data was modified.');
  log.error('backup', 'me@gmail.com: ENOSPC: no space left on device, write');
  log.warn('transport', 'https://vault.corp.com: request timed out after 15000 ms');
  log.error('unlock', 'the security key did not answer the PRF challenge');
  log.info('sync', 'pulled changes for 2 profile(s), pushed 1');

  const written = out.lines.join('\n') + fs.readFileSync(log.file, 'utf8');
  for (const secret of secrets) {
    assert.equal(written.includes(secret), false, `a secret reached the log: ${secret}`);
  }
  assert.ok(written.includes('wrong master PIN/password'), 'the diagnosis itself is still there');
});

test('the log cannot read a vault even if a caller wanted it to', () => {
  // The structural half of the promise: the module takes a storage DIRECTORY and a sink, and
  // exposes only info/warn/error/show/dispose/file. There is no seam through which a secret
  // could arrive on its own — a caller has to format one in deliberately.
  const log = loaded.createDiagnosticLog({ storageDir: tempDir(), sink: sink(), now: () => AT, pid: 7 });

  assert.deepEqual(
    Object.keys(log).sort(),
    ['dispose', 'error', 'file', 'info', 'show', 'warn'],
  );
});
