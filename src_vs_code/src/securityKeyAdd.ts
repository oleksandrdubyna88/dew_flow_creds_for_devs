import * as vscode from 'vscode';
import { KeyWrap, newPrfSalt } from './keyWrap';
import { registerSecurityKey } from './webauthnPrf';
import {
  EnvelopeArgs,
  NextEnvelope,
  RegisteredPrf,
  SecurityKeyRefusal,
  envelopeWithAddedKey,
  envelopeWithMigratedKey,
  isSecurityKeyRefusal,
} from './securityKeyOps';
import type { VaultKey, VaultKeys } from './vaultKeys';
import { StoredAccount } from './types';
import { sharesFromEnvelope } from './shareFormat';
import { describeError } from './describeError';
import { CURRENT_RP_ID, migrationOfferText } from './webauthnRp';

/** The vault transport, by the part of it this flow touches. */
export interface VaultTransportLike {
  readonly embedsShares: boolean;
  readVault(account: StoredAccount): Promise<string | undefined>;
  writeVault(account: StoredAccount, content: string, pendingShares: never[]): Promise<void>;
}

/** What the flow needs from the host — the extension's activate scope, by interface. */
export interface KeyAddHost {
  transportFor(account: StoredAccount): VaultTransportLike | undefined;
  readonly vaultKeys: VaultKeys;
  notifyChange(): void;
  refreshReadiness(): Promise<unknown>;
}

/**
 * Register a security key for an account — or, with `replacing`, re-register one under the
 * current RP ID and retire its legacy wrap in the same envelope (security-tail item 1). A v1
 * (PIN-only) vault is upgraded to a wrapped one in the same step: its payload is re-encrypted
 * under a fresh master key, wrapped for the PIN and for the key.
 */
export async function addSecurityKey(host: KeyAddHost, account: StoredAccount, replacing?: KeyWrap): Promise<void> {
  const prepared = await prepare(host, account, replacing);
  if (prepared === undefined) {
    return;
  }
  try {
    await registerAndWrite(host, account, prepared, replacing);
  } catch (error) {
    void vscode.window.showErrorMessage(`Adding the security key failed: ${describeError(error)}`);
  }
}

/** The vault, the unlocked key and the label — or nothing, with the reason already shown. */
interface Prepared {
  readonly transport: VaultTransportLike;
  readonly raw: string;
  readonly key: VaultKey;
  readonly label: string;
}

async function prepare(host: KeyAddHost, account: StoredAccount, replacing: KeyWrap | undefined): Promise<Prepared | undefined> {
  const ready = await readyVault(host, account);
  if (ready === undefined) {
    return undefined;
  }
  const key = await host.vaultKeys.unlock(account, ready.raw, { interactive: true });
  if (key === undefined) {
    void vscode.window.showErrorMessage('Could not unlock the vault — key not added.');
    return undefined;
  }
  const label = await labelFor(replacing);
  return label === undefined ? undefined : { ...ready, key, label };
}

/** A re-registration keeps the key's name; a new key asks for one. */
function labelFor(replacing: KeyWrap | undefined): Thenable<string | undefined> {
  return replacing === undefined ? askLabel() : Promise.resolve(replacing.label ?? 'YubiKey');
}

async function registerAndWrite(host: KeyAddHost, account: StoredAccount, prepared: Prepared, replacing: KeyWrap | undefined): Promise<void> {
  const { transport, raw, key, label } = prepared;
  const prfSalt = newPrfSalt();
  const prf = await registerSecurityKey(account.email, prfSalt);
  const args: EnvelopeArgs = {
    raw,
    key,
    account,
    storedPin: await host.vaultKeys.storedPin(account),
    now: Date.now(),
    pendingShares: transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
    decrypt: (r, k) => host.vaultKeys.decrypt(r, k),
  };
  const next = await nextEnvelope(args, { credentialId: prf.credentialId, prfSalt, secret: prf.secret }, label, replacing);
  if (isSecurityKeyRefusal(next)) {
    void vscode.window.showErrorMessage('A vault PIN is required before adding a key.');
    return;
  }
  await transport.writeVault(account, next.content, []);
  host.vaultKeys.clearCache(account.accountId);
  void vscode.window.showInformationMessage(doneText(account, label, replacing));
  host.notifyChange();
  // The account row's icon and reason come from the readiness cache, which nothing else
  // refreshes here — the sync cycle repaints the tree from the STALE map.
  await host.refreshReadiness();
}

/**
 * The offer after a legacy key opened a vault: a notification with the one action, never a
 * modal — the person is in the middle of whatever needed the vault open.
 */
export async function offerKeyMigration(host: KeyAddHost, account: StoredAccount, wrap: KeyWrap): Promise<void> {
  const choice = await vscode.window.showInformationMessage(migrationOfferText(account.email, wrap.label), 'Re-register now', 'Later');
  if (choice === 'Re-register now') {
    await addSecurityKey(host, account, wrap);
  }
}

async function readyVault(
  host: KeyAddHost,
  account: StoredAccount,
): Promise<{ transport: VaultTransportLike; raw: string } | undefined> {
  const transport = host.transportFor(account);
  if (transport === undefined) {
    void vscode.window.showErrorMessage(
      `Set a sync location for ${account.email} first — security keys are stored in its vault.`,
    );
    return undefined;
  }
  const raw = await transport.readVault(account);
  if (raw === undefined) {
    void vscode.window.showErrorMessage(`${account.email} has no vault yet — run "Sync Now" once, then add the key.`);
    return undefined;
  }
  return { transport, raw };
}

function askLabel(): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Name this security key',
    prompt: 'Shown when the vault asks for a touch (e.g. "YubiKey 5C — work")',
    value: 'YubiKey',
    ignoreFocusOut: true,
  });
}

function nextEnvelope(
  args: EnvelopeArgs,
  prf: RegisteredPrf,
  label: string,
  replacing: KeyWrap | undefined,
): Promise<NextEnvelope | SecurityKeyRefusal> {
  return replacing === undefined
    ? envelopeWithAddedKey(args, prf, label)
    : Promise.resolve(envelopeWithMigratedKey(args, replacing.id, prf, label.trim()));
}

function doneText(account: StoredAccount, label: string, replacing: KeyWrap | undefined): string {
  return replacing === undefined
    ? `"${label.trim()}" can now unlock ${account.email}. The PIN keeps working as a fallback.`
    : `"${label.trim()}" is re-registered under ${CURRENT_RP_ID}; its old registration no longer opens ${account.email}.`;
}
