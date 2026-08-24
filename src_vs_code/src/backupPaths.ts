import * as vscode from 'vscode';
import { StoredAccount } from './types';

const CONFIG_SECTION = 'credSshManager';
const BACKUP_PATH_SETTING = 'backupLocation';
const ACCOUNT_PATHS_SETTING = 'accountBackupPaths';

/**
 * Where dated snapshots go — a SEPARATE setting from the sync location, deliberately.
 *
 * <p>Sync keeps one live file and merges: a deletion travels to every machine. That is
 * right for a vault and useless as a safety net. Snapshots are the safety net, and
 * pointing them at the same place by default would put both on one disk, where one
 * ransomware run or one bad merge takes the vault and its history together.</p>
 *
 * <p>Shaped exactly like `nasPaths.ts`, down to the per-account override, because an
 * operator who has learned one of these has learned both — and the two settings are read
 * side by side in the same menu.</p>
 */

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function globalBackupPath(): string | undefined {
  const p = config().get<string>(BACKUP_PATH_SETTING, '').trim();
  return p.length > 0 ? p : undefined;
}

export function accountBackupPaths(): Record<string, string> {
  const raw = config().get<Record<string, string>>(ACCOUNT_PATHS_SETTING, {});
  const out: Record<string, string> = {};
  for (const [email, p] of Object.entries(raw)) {
    if (typeof p === 'string' && p.trim().length > 0) {
      out[email.toLowerCase()] = p.trim();
    }
  }
  return out;
}

/** The folder this account snapshots into (per-account mapping, else global). */
export function backupPathFor(account: StoredAccount): string | undefined {
  return accountBackupPaths()[account.email.toLowerCase()] ?? globalBackupPath();
}

export function backupDirFor(account: StoredAccount): vscode.Uri | undefined {
  const p = backupPathFor(account);
  return p !== undefined ? vscode.Uri.file(p) : undefined;
}

/** Persist a per-account mapping (undefined clears it back to the global). */
export async function setAccountBackupPath(email: string, p: string | undefined): Promise<void> {
  const raw = { ...config().get<Record<string, string>>(ACCOUNT_PATHS_SETTING, {}) };
  const key =
    Object.keys(raw).find((k) => k.toLowerCase() === email.toLowerCase()) ?? email.toLowerCase();
  if (p === undefined) {
    delete raw[key];
  } else {
    raw[key] = p;
  }
  await config().update(ACCOUNT_PATHS_SETTING, raw, vscode.ConfigurationTarget.Global);
}

export function backupIntervalHours(): number {
  return config().get<number>('backupIntervalHours', 24);
}

const ACCOUNT_INTERVALS_SETTING = 'accountBackupIntervals';

/**
 * How often THIS account snapshots. Per-account for the same reason the folder is:
 * the menu item sits on an account, and a schedule set there that silently changed
 * every other account would be a worse surprise than no menu item at all.
 */
export function backupIntervalHoursFor(account: StoredAccount): number {
  const raw = config().get<Record<string, number>>(ACCOUNT_INTERVALS_SETTING, {});
  const key = Object.keys(raw).find((k) => k.toLowerCase() === account.email.toLowerCase());
  const own = key === undefined ? undefined : raw[key];
  return typeof own === 'number' && own >= 0 ? own : backupIntervalHours();
}

/** Persist a per-account schedule (undefined clears it back to the global default). */
export async function setAccountBackupInterval(
  email: string,
  hours: number | undefined,
): Promise<void> {
  const raw = { ...config().get<Record<string, number>>(ACCOUNT_INTERVALS_SETTING, {}) };
  const key =
    Object.keys(raw).find((k) => k.toLowerCase() === email.toLowerCase()) ?? email.toLowerCase();
  if (hours === undefined) {
    delete raw[key];
  } else {
    raw[key] = hours;
  }
  await config().update(ACCOUNT_INTERVALS_SETTING, raw, vscode.ConfigurationTarget.Global);
}

export function backupRetainDays(): number {
  return config().get<number>('backupRetainDays', 30);
}
