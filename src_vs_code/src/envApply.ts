import * as vscode from 'vscode';
import { parseDbConnectionString } from './dbConnString';
import { BindableField, EnvBindings, staleEnvNames } from './envBinding';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/**
 * Writing bound secret fields into VS Code's environment variable collection — the
 * mechanism that injects variables into every integrated terminal opened afterwards,
 * persisted across reloads.
 *
 * <p>Values come from THIS machine's SecretStorage at the moment of writing. A binding
 * synced from another machine is a name with no value until someone presses `Set env`
 * here or saves the entity — which is also the recovery path the operator asked for
 * when the collection is lost.</p>
 */

/** The current value of one bindable field, or undefined when nothing is stored. */
export async function bindableFieldValue(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
): Promise<string | undefined> {
  switch (field) {
    case 'password':
      return storage.getPassword(accountId, details.id);
    case 'privateKey':
      return storage.getPrivateKey(accountId, details.id);
    case 'publicKey':
      return details.publicKey;
    case 'dbConnection':
      return storage.getDbConnection(accountId, details.id);
    case 'dbPassword': {
      const conn = await storage.getDbConnection(accountId, details.id);
      return conn === undefined ? undefined : parseDbConnectionString(conn).password;
    }
  }
}

/**
 * Apply an entity's bindings: write every bound field that has a value, and delete the
 * names `staleBefore` bound that nothing binds any more. Returns what was written.
 */
export async function applyEnvBindings(
  env: vscode.GlobalEnvironmentVariableCollection,
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  staleBefore?: EnvBindings,
): Promise<string[]> {
  for (const name of staleEnvNames(staleBefore, details.envBindings)) {
    env.delete(name);
  }
  const written: string[] = [];
  const bindings = details.envBindings ?? {};
  for (const [field, name] of Object.entries(bindings)) {
    const value = await bindableFieldValue(storage, accountId, details, field as BindableField);
    if (value !== undefined && value.length > 0) {
      env.replace(name, value);
      env.description = 'CredsForDevs: secrets exposed as terminal variables';
      written.push(name);
    }
  }
  return written;
}
