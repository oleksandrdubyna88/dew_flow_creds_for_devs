import * as path from 'node:path';
import * as vscode from 'vscode';
import { FolderTransport } from './folderTransport';
import { GitTransport } from './gitTransport';
import { GitAuth, parseGitRemote } from './gitRemote';
import { materializePrivateKey } from './keyInstaller';
import { runBounded } from './sshExecRunner';
import { GoogleAuthProvider } from './googleAuthProvider';
import { nasPathFor } from './nasPaths';
import { ServerTransport } from './serverTransport';
import { StorageManager } from './storageManager';
import { StoredAccount } from './types';
import { VaultTransport, isServerLocation } from './vaultTransport';
import { microsoftServerScopes } from './msScopes';
import { ClientConfigCache, defaultConfigFetcher, resolveMicrosoftScope } from './clientConfig';

/** A git operation that has not finished in two minutes is not going to. */
const GIT_TIMEOUT_MS = 120_000;

/**
 * Resolves the transport for an account's configured location: a folder
 * path stays on the file transport, an `http(s)://` location goes to the
 * Cred Vault Server. Instances are cached per location so a single sync
 * cycle reuses one client.
 */
export class TransportFactory {
  /**
   * What each server says a client needs before it can sign in.
   *
   * <p>Asked once per location. Before this, the Microsoft API scope had to be
   * pasted into every developer's settings.json by hand, and the failure when
   * nobody did was an empty Team with no error at all.</p>
   */
  private readonly clientConfigs = new ClientConfigCache(defaultConfigFetcher);

  private readonly cache = new Map<string, VaultTransport>();

  constructor(
    private readonly storage: StorageManager,
    private readonly googleAuth: GoogleAuthProvider,
    /**
     * Where a git clone may live. Absent means git sync is not wired in this build — a git
     * location is then refused with a sentence saying so, rather than silently treated as a
     * folder path, which would create a directory named after a URL and sync nowhere.
     */
    private readonly storageDir?: string,
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
    const transport = this.build(location);
    this.cache.set(location, transport);
    return transport;
  }

  /**
   * Which transport a location names.
   *
   * <p>Git is asked FIRST, and only about shapes that cannot be anything else — an
   * `ssh://`/`git@host:` address, a `git+` prefix, or a `.git` suffix. `https://host/path`
   * stays a server URL, because guessing wrong there would point an account at the wrong
   * backend and sync it nowhere without saying so.</p>
   */
  private build(location: string): VaultTransport {
    const remote = parseGitRemote(location);
    if (remote !== undefined) {
      const storageDir = this.storageDir;
      if (storageDir === undefined) {
        throw new Error(
          `${location} looks like a git remote, but git sync is not available in this build.`,
        );
      }
      return new GitTransport(
        location,
        remote,
        path.join(storageDir, 'git'),
        (args, options) =>
          runBounded('git', [...args], false, {
            env: options.env,
            cwd: options.cwd,
            timeoutMs: GIT_TIMEOUT_MS,
          }).then((outcome) => ({
            exitCode: outcome.exitCode,
            stdout: outcome.stdout,
            stderr: outcome.stderr,
          })),
        () => this.gitAuth(location, storageDir),
        () => this.storage.getAccounts(),
      );
    }
    return isServerLocation(location)
      ? new ServerTransport(location, (a) => this.tokenFor(a))
      : new FolderTransport(location, () => this.storage.getAccounts());
  }

  /**
   * How git authenticates for this remote.
   *
   * <p>A deploy key stored as an ordinary `sshkey` entry is the preferred path: it is
   * materialized into the same `keys/` directory the SSH paths already use and purge, so no
   * new storage axis is needed. Everything else falls back to whatever the machine's own git
   * is already configured to do — which is what most people already have working.</p>
   */
  private async gitAuth(location: string, storageDir: string): Promise<GitAuth> {
    const keyEntityId = vscode.workspace
      .getConfiguration('credSshManager')
      .get<Record<string, string>>('gitDeployKeys', {})[location];
    const key = keyEntityId === undefined ? undefined : await this.findPrivateKey(keyEntityId);
    return key === undefined
      ? { kind: 'inherit' }
      : { kind: 'ssh', keyPath: materializePrivateKey(storageDir, `git-${keyEntityId}`, key) };
  }

  /** The stored private key with this entity id, under whichever account holds it. */
  private async findPrivateKey(entityId: string): Promise<string | undefined> {
    for (const account of this.storage.getAccounts()) {
      const key = await this.storage.getPrivateKey(account.accountId, entityId);
      if (key !== undefined && key.length > 0) {
        return key;
      }
    }
    return undefined;
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
  /** The server this account talks to, if it talks to one at all. */
  private async locationConfig(account: StoredAccount) {
    const location = nasPathFor(account);
    return location === undefined || !isServerLocation(location)
      ? undefined
      : this.clientConfigs.forLocation(location);
  }

  // eslint-disable-next-line complexity
  private async tokenFor(account: StoredAccount): Promise<string | undefined> {
    if (account.provider === 'google') {
      return this.googleAuth.getIdToken(account.accountId);
    }
    try {
      // The API scope of the operator's Entra app registration, when configured — the
      // only kind of Microsoft token a server can validate (see msScopes.ts).
      // The server's answer, with the local setting as an override rather than a
      // requirement: an operator who typed a value keeps it, everyone else needs
      // to have configured nothing.
      const advertised = await this.locationConfig(account);
      const apiScope = resolveMicrosoftScope(
        vscode.workspace.getConfiguration('credSshManager').get<string>('microsoftApiScope', ''),
        advertised?.microsoftScope,
      );
      const session = await vscode.authentication.getSession(
        account.provider,
        microsoftServerScopes(apiScope),
        { createIfNone: false, account: { id: account.accountId, label: account.email } },
      );
      return session?.accessToken;
    } catch {
      return undefined;
    }
  }
}
