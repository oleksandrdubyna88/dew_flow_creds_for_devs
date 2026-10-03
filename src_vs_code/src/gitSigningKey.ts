import * as vscode from 'vscode';
import { shellSafeKey } from './gitSigningConfig';
import { SlotRead, clickedSecret } from './pinClick';
import { parseSshPrivateKey } from './sshKeyParse';
import type { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/** A key the SSH agent serves — the one field this reads. */
interface Loaded {
  readonly entityId: string;
  readonly publicLine: string;
}

const readKey: SlotRead = (s, a, e) => s.getPrivateKey(a, e);

/**
 * The public half Git signs with — or nothing, having said why.
 *
 * <p>Reads the public half out of the stored key rather than requiring the key to be loaded
 * first: a person asking how to configure signing has not necessarily loaded it yet, and
 * refusing at that point would be an obstacle with no reason behind it.</p>
 *
 * <p>In the order that asks least (entry-PIN plan, D6/D18): the agent's copy, then the entry's own
 * public key — metadata, never wrapped, so a protected key is not opened just to read the half that
 * is not a secret — and only then the private key, opened for the click. Until 1.12 a protected key
 * was parsed as its envelope and the person was told the key "could not be read".</p>
 */
export async function signingPublicLine(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  loaded: readonly Loaded[],
): Promise<string | undefined> {
  const known = loaded.find((k) => k.entityId === details.id)?.publicLine ?? publishedHalf(details);
  return known ?? fromPrivateKey(storage, accountId, details);
}

/** The entry's own public key — used only when it IS one, so a free-text field cannot become the line. */
function publishedHalf(details: EntityMetadata): string | undefined {
  const publicKey = details.publicKey?.trim();
  return publicKey !== undefined && shellSafeKey(publicKey) !== undefined ? publicKey : undefined;
}

async function fromPrivateKey(storage: StorageManager, accountId: string, details: EntityMetadata): Promise<string | undefined> {
  const opened = await clickedSecret(storage, accountId, details, readKey, 'read its public key', undefined);
  if (opened.kind !== 'open') {
    return undefined;
  }
  if (opened.value === undefined) {
    void vscode.window.showWarningMessage(`"${details.name}" has no private key stored, so there is no public half to sign with.`);
    return undefined;
  }
  return parsedPublicLine(opened.value, details.name);
}

function parsedPublicLine(content: string, name: string): string | undefined {
  const parsed = parseSshPrivateKey(content, name);
  if (!parsed.ok) {
    void vscode.window.showWarningMessage(`"${name}": ${parsed.reason}`);
    return undefined;
  }
  return parsed.key.publicLine;
}
