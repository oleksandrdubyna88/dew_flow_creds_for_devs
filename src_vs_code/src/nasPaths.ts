import * as vscode from 'vscode';
import { StoredAccount } from './types';

const CONFIG_SECTION = 'credSshManager';
const NAS_PATH_SETTING = 'nasBackupPath';
const ACCOUNT_PATHS_SETTING = 'accountNasPaths';

/**
 * Per-account NAS folders: `credSshManager.accountNasPaths` maps an account
 * EMAIL to a folder (e.g. corporate account → company NAS, personal account
 * → home NAS). Accounts without a mapping fall back to the global
 * `credSshManager.nasBackupPath`.
 */

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

export function globalNasPath(): string | undefined {
  const p = config().get<string>(NAS_PATH_SETTING, '').trim();
  return p.length > 0 ? p : undefined;
}

export function accountNasPaths(): Record<string, string> {
  const raw = config().get<Record<string, string>>(ACCOUNT_PATHS_SETTING, {});
  const out: Record<string, string> = {};
  for (const [email, p] of Object.entries(raw)) {
    if (typeof p === 'string' && p.trim().length > 0) {
      out[email.toLowerCase()] = p.trim();
    }
  }
  return out;
}

/** The folder this account syncs to (per-account mapping, else global). */
export function nasPathFor(account: StoredAccount): string | undefined {
  return accountNasPaths()[account.email.toLowerCase()] ?? globalNasPath();
}

export function nasDirFor(account: StoredAccount): vscode.Uri | undefined {
  const p = nasPathFor(account);
  return p !== undefined ? vscode.Uri.file(p) : undefined;
}

/** Every distinct configured folder (global + all per-account mappings). */
export function allNasPaths(): string[] {
  const set = new Set<string>();
  const g = globalNasPath();
  if (g !== undefined) {
    set.add(g);
  }
  for (const p of Object.values(accountNasPaths())) {
    set.add(p);
  }
  return [...set];
}

/** Persist a per-account mapping (undefined clears it back to the global). */
export async function setAccountNasPath(email: string, p: string | undefined): Promise<void> {
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
