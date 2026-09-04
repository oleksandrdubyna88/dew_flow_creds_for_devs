import { isLockedSecret } from './secretEnvelope';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  EnvFile,
  Finding,
  KeyFile,
  PasswordEntry,
  breachFinding,
  countInHibpRange,
  findEnvSecrets,
  findReusedPasswords,
  findUnencryptedKeyFiles,
  findWeakPasswords,
  hibpPrefix,
  renderReport,
} from './hygiene';
import { StorageManager } from './storageManager';
import { parseDbConnectionString } from './dbConnString';

/**
 * Gathering what the health report weighs: stored secrets, `~/.ssh`, and the workspace's `.env`
 * files. The judging is all in `hygiene.ts`, which is pure; this is the half that reads.
 *
 * <p><b>The breach check is the only thing that can reach the network, and it is off unless
 * asked for twice</b> — a setting AND a modal that says what will be sent. The README's "no
 * network by default" is a promise about the product, so the one feature that would break it
 * asks rather than assumes.</p>
 */

const HIBP_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 10_000;

/** The files in `~/.ssh` that are definitively NOT private keys. */
const NOT_KEYS = new Set(['known_hosts', 'known_hosts.old', 'config', 'authorized_keys', 'environment']);

/** Files in `~/.ssh` worth reading. A public key and the housekeeping files are skipped. */
function looksLikeKeyFile(name: string): boolean {
  return !name.endsWith('.pub') && !name.startsWith('.') && !NOT_KEYS.has(name);
}

/** Private-key candidates in `~/.ssh`, read best-effort. */
export function readSshDirectory(home = os.homedir()): KeyFile[] {
  const dir = path.join(home, '.ssh');
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter(looksLikeKeyFile);
  } catch {
    return []; // no ~/.ssh at all is a perfectly ordinary state
  }
  return names.flatMap((name) => readKeyFile(path.join(dir, name)));
}

function readKeyFile(full: string): KeyFile[] {
  try {
    // A private key is a few kilobytes; anything larger is not one, and reading it would be
    // pulling an arbitrary file into memory for no reason.
    if (fs.statSync(full).size > 64 * 1024) {
      return [];
    }
    return [{ path: full, content: fs.readFileSync(full, 'utf8') }];
  } catch {
    return []; // unreadable (permissions, a socket, a race) is not a finding
  }
}

/** `.env`-shaped files in the open workspace folders. */
export async function readWorkspaceEnvFiles(): Promise<EnvFile[]> {
  const found = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**', 50);
  const files: EnvFile[] = [];
  for (const uri of found) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      files.push({ path: vscode.workspace.asRelativePath(uri), content: Buffer.from(bytes).toString('utf8') });
    } catch {
      // unreadable — skip it rather than fail the whole scan
    }
  }
  return files;
}

/** Every stored password-shaped secret, with the entity it belongs to. */
export async function collectPasswords(storage: StorageManager): Promise<PasswordEntry[]> {
  const entries: PasswordEntry[] = [];
  for (const account of storage.getAccounts()) {
    for (const node of storage.getNodes(account.accountId)) {
      if (node.type !== 'entity') {
        continue;
      }
      entries.push(...(await entryFor(storage, account.accountId, account.email, node.id, node.name)));
    }
  }
  return entries;
}

/** One entry per non-empty value — an absent field contributes nothing to weigh. */
/**
 * One password for the report, or nothing at all.
 *
 * <p><b>A PIN-protected value is skipped, and skipping it is the only honest answer.</b> What is
 * stored for such an entry is a random data key's ciphertext: long, high-entropy and unlike every
 * other password in the vault — so a scan that read it would report the entry as a strong, unique
 * password. That is a lie in the one direction that matters: somebody would be told their weakest
 * habit is fine because it happens to be encrypted twice.</p>
 *
 * <p>Nor is it a value this could grade if it wanted to: reading it needs a PIN, and the scan runs
 * over the whole vault with no window to ask in.</p>
 */
function present(
  entityName: string,
  accountEmail: string,
  field: string,
  value: string | undefined,
): PasswordEntry[] {
  if (value === undefined || value.length === 0 || isLockedSecret(value)) {
    return [];
  }
  return [{ entityName, accountEmail, field, value }];
}

async function entryFor(
  storage: StorageManager,
  accountId: string,
  accountEmail: string,
  entityId: string,
  entityName: string,
): Promise<PasswordEntry[]> {
  const connection = await storage.getDbConnection(accountId, entityId);
  return [
    ...present(entityName, accountEmail, 'password', await storage.getPassword(accountId, entityId)),
    ...present(
      entityName,
      accountEmail,
      'database password',
      connection === undefined ? undefined : parseDbConnectionString(connection).password,
    ),
  ];
}

/**
 * Ask the corpus about one password, k-anonymously.
 *
 * <p>Five hexadecimal characters go out; a few hundred suffixes come back and are matched here.
 * A failure returns 0 rather than throwing: the report is still worth producing without this
 * one line, and a network error is not evidence of anything about the password.</p>
 */
export async function breachCount(password: string): Promise<number> {
  const { prefix, suffix } = hibpPrefix(password);
  try {
    const response = await fetch(`${HIBP_ENDPOINT}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'CredsForDevs-health-check' },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    return response.ok ? countInHibpRange(await response.text(), suffix) : 0;
  } catch {
    return 0;
  }
}

/** Whether the breach check may run: the setting, and then a modal that states what is sent. */
export async function confirmBreachCheck(count: number): Promise<boolean> {
  const enabled = vscode.workspace
    .getConfiguration('credSshManager')
    .get<boolean>('breachCheck', false);
  if (!enabled) {
    return false;
  }
  const choice = await vscode.window.showWarningMessage(
    `Check ${count} password(s) against Have I Been Pwned?\n\n` +
      'For each one, the FIRST FIVE characters of its SHA-1 are sent — one bucket out of a ' +
      'million, shared by hundreds of thousands of passwords. The password itself, and the rest ' +
      'of its hash, never leave this machine, and the answer is matched here.\n\n' +
      'This is the only part of CredsForDevs that uses the network for anything but your own ' +
      'sync location.',
    { modal: true },
    'Check them',
  );
  return choice === 'Check them';
}

export interface ScanResult {
  markdown: string;
  findings: Finding[];
}

/** Just enough of `vscode.CancellationToken` to be passed one, without importing the type. */
export interface Cancellable {
  readonly isCancellationRequested: boolean;
}

/** Run the whole scan and render the report. */
export async function runHygieneScan(storage: StorageManager, token?: Cancellable): Promise<ScanResult> {
  const passwords = await collectPasswords(storage);
  const keyFiles = readSshDirectory();
  const envFiles = await readWorkspaceEnvFiles();

  const findings: Finding[] = [
    ...findReusedPasswords(passwords),
    ...findWeakPasswords(passwords),
    ...findUnencryptedKeyFiles(keyFiles),
    ...findEnvSecrets(envFiles),
  ];

  const checkBreaches = passwords.length > 0 && (await confirmBreachCheck(passwords.length));
  if (checkBreaches) {
    findings.push(...(await breachFindings(passwords, token)));
  }

  return {
    findings,
    markdown: renderReport(
      findings,
      { entities: passwords.length, files: keyFiles.length + envFiles.length },
      checkBreaches,
    ),
  };
}

/**
 * How many breach lookups run at once.
 *
 * <p>Sequentially, at a 10-second timeout each, a vault of forty passwords could hold the
 * progress notification open for several minutes. Six at a time is polite to a free public API
 * and turns that into seconds; the requests are independent, so there is nothing to order.</p>
 */
const BREACH_CONCURRENCY = 6;

async function breachFindings(
  passwords: readonly PasswordEntry[],
  token?: Cancellable,
): Promise<Finding[]> {
  const found: Finding[] = [];
  const queue = [...passwords];
  const cancelled = (): boolean => token?.isCancellationRequested === true;
  const check = async (entry: PasswordEntry): Promise<void> => {
    const count = await breachCount(entry.value);
    if (count > 0) {
      found.push(breachFinding(entry, count));
    }
  };
  const worker = async (): Promise<void> => {
    // Checked per item rather than per batch: cancelling should stop the NEXT request, not
    // wait for the slowest one already in flight.
    for (let entry = queue.shift(); entry !== undefined && !cancelled(); entry = queue.shift()) {
      await check(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BREACH_CONCURRENCY, queue.length) }, worker));
  return found;
}
