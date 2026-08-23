import * as vscode from 'vscode';
import { FolderTransport } from './folderTransport';
import { GoogleAuthProvider } from './googleAuthProvider';
import { nasPathFor } from './nasPaths';
import { ServerTransport } from './serverTransport';
import { StorageManager } from './storageManager';
import { StoredAccount } from './types';
import { VaultTransport, isServerLocation } from './vaultTransport';

/**
 * Resolves the transport for an account's configured location: a folder
 * path stays on the file transport, an `http(s)://` location goes to the
 * Cred Vault Server. Instances are cached per location so a single sync
 * cycle reuses one client.
 */
export class TransportFactory {
  private readonly cache = new Map<string, VaultTransport>();

  constructor(
    private readonly storage: StorageManager,
    private readonly googleAuth: GoogleAuthProvider,
  ) {
    // Locations come from settings; drop the cache when they change.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('credSshManager')) {
        this.cache.clear();
      }
    });
  }

  /** The transport for this account, or undefined when unconfigured. */
  forAccount(account: StoredAccount): VaultTransport | undefined {
    const location = nasPathFor(account);
    return location === undefined ? undefined : this.forLocation(location);
  }

  forLocation(location: string): VaultTransport {
    const existing = this.cache.get(location);
    if (existing !== undefined) {
      return existing;
    }
    const transport: VaultTransport = isServerLocation(location)
      ? new ServerTransport(location, (a) => this.tokenFor(a))
      : new FolderTransport(location, () => this.storage.getAccounts());
    this.cache.set(location, transport);
    return transport;
  }

  /** Distinct locations across all account profiles. */
  locations(): string[] {
    const set = new Set<string>();
    for (const account of this.storage.getAccounts()) {
      const location = nasPathFor(account);
      if (location !== undefined) {
        set.add(location);
      }
    }
    return [...set];
  }

  /**
   * Bearer token for a server transport. Microsoft: the access token of the
   * existing session. Google: the id_token kept by our own provider (the
   * server validates Google **id** tokens; Google access tokens are opaque).
   */
  private async tokenFor(account: StoredAccount): Promise<string | undefined> {
    if (account.provider === 'google') {
      return this.googleAuth.getIdToken(account.accountId);
    }
    try {
      const session = await vscode.authentication.getSession(
        account.provider,
        ['user.read'],
        { createIfNone: false, account: { id: account.accountId, label: account.email } },
      );
      return session?.accessToken;
    } catch {
      return undefined;
    }
  }
}
