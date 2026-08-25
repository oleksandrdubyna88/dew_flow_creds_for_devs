import * as fs from 'node:fs';
import * as path from 'node:path';
import { planBackupFileNames } from './backupNaming';
import { readBackupAccount } from './cryptoUtils';
import { envelopeWithShares, sharesFromEnvelope } from './shareFormat';
import { OwnedShare, ShareItem, StoredAccount, TeamMember } from './types';
import { VaultTransport } from './vaultTransport';
import {
  GitAuth,
  GitFailure,
  GITATTRIBUTES,
  GIT_BASE_ARGS,
  GitRemote,
  classifyGitError,
  cloneArgv,
  cloneDirName,
  commitArgv,
  describeGitFailure,
  fetchArgv,
  gitEnv,
  initArgv,
  pushArgv,
  resetArgv,
} from './gitRemote';

/**
 * A vault synced through a private git repository.
 *
 * <p>Shaped like {@link FolderTransport} on purpose — a directory of `vault_<hash>.enc` files
 * with pending shares embedded in each envelope — because that is what the merge engine
 * already understands. The clone is a CACHE, never a source of truth: every read fetches and
 * hard-resets onto the remote, so a local edit that never got pushed cannot masquerade as
 * remote state.</p>
 *
 * <p><b>Concurrency.</b> A rejected push is this transport's `412`: someone else wrote in
 * between. It is reported, never forced, and never retried in place — the next cycle re-reads,
 * the causal merge in `syncMerge.ts` reconciles, and the write goes out then. That is the same
 * contract `ServerTransport` has with `If-Match`, and it is why nothing here needs to
 * understand git's own merge.</p>
 *
 * <p><b>What the repository reveals.</b> File contents are ciphertext, but a git log is not:
 * commit times and counts show when and how often a vault changed. Commit messages carry only
 * an account-hash prefix and a timestamp for that reason. Anyone who can read the repository
 * learns activity, never content.</p>
 */

/** Runs a git command. Injected so the transport is testable without a `vscode` runtime. */
export interface GitRunner {
  (
    args: readonly string[],
    options: { cwd?: string; env: NodeJS.ProcessEnv },
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;
}

export class GitError extends Error {
  constructor(
    readonly failure: GitFailure,
    message: string,
  ) {
    super(message);
  }
}

export class GitTransport implements VaultTransport {
  readonly kind = 'git' as const;
  /** Like the folder transport: shares ride inside the envelope, there is no inbox. */
  readonly embedsShares = true;

  private cloned = false;

  constructor(
    readonly location: string,
    private readonly remote: GitRemote,
    private readonly cloneRoot: string,
    private readonly run: GitRunner,
    private readonly auth: () => Promise<GitAuth>,
    private readonly allAccounts: () => readonly StoredAccount[],
  ) {}

  private get dir(): string {
    return path.join(this.cloneRoot, cloneDirName(this.remote));
  }

  private fileNameFor(account: StoredAccount): string | undefined {
    return planBackupFileNames(this.allAccounts()).get(account.accountId);
  }

  /** Run one git command, turning a failure into a classified {@link GitError}. */
  private async git(args: readonly string[], cwd?: string): Promise<string> {
    const result = await this.run([...GIT_BASE_ARGS, ...args], {
      cwd,
      env: gitEnv(await this.auth(), process.env),
    });
    if (result.exitCode === 0) {
      return result.stdout;
    }
    const failure = classifyGitError(result.stderr);
    throw new GitError(failure, describeGitFailure(failure, this.location, result.stderr));
  }

  /**
   * Make sure a working clone exists, then bring it to the remote's current state.
   *
   * <p>An `empty` failure is not an error: a repository whose branch does not exist yet is
   * the first-run case, and it becomes a local branch that the first write publishes.</p>
   */
  private async sync(): Promise<void> {
    if (!this.cloned) {
      await this.ensureClone();
      this.cloned = true;
      return;
    }
    await this.tolerateEmpty(async () => {
      await this.git(fetchArgv(), this.dir);
      await this.git(resetArgv(), this.dir);
    });
  }

  /**
   * Run something, treating "the branch does not exist yet" as success.
   *
   * <p>An empty repository is the first-run case, not a failure: there is simply nothing to
   * fetch until the first write publishes the branch.</p>
   */
  private tolerateEmpty(work: () => Promise<void>): Promise<void> {
    return this.orOnEmpty(work, () => Promise.resolve());
  }

  private async ensureClone(): Promise<void> {
    if (fs.existsSync(path.join(this.dir, '.git'))) {
      await this.fetchAndReset();
      return;
    }
    fs.mkdirSync(this.cloneRoot, { recursive: true, mode: 0o700 });
    // A remote with no branch yet is the first-run case: start one locally instead.
    await this.orOnEmpty(
      () => this.git(cloneArgv(this.remote, this.dir)).then(() => undefined),
      () => this.initLocally(),
    );
  }

  private fetchAndReset(): Promise<void> {
    return this.tolerateEmpty(async () => {
      await this.git(fetchArgv(), this.dir);
      await this.git(resetArgv(), this.dir);
    });
  }

  /** Run `work`; if it fails only because the branch does not exist, run `fallback`. */
  private async orOnEmpty(work: () => Promise<void>, fallback: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof GitError) || error.failure !== 'empty') {
        throw error;
      }
      await fallback();
    }
  }

  /** No branch on the remote yet: start one here; the first write publishes it. */
  private async initLocally(): Promise<void> {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    for (const args of initArgv(this.remote)) {
      await this.git(args, this.dir);
    }
    // Binds every OTHER client too — a colleague's clone, a web UI, a CI job. Our own
    // -c options only bind us, and one client rewriting line endings corrupts the envelope
    // for everyone.
    fs.writeFileSync(path.join(this.dir, '.gitattributes'), GITATTRIBUTES);
    await this.git(['add', '--', '.gitattributes'], this.dir);
  }

  async readVault(account: StoredAccount): Promise<string | undefined> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      return undefined;
    }
    await this.sync();
    try {
      return fs.readFileSync(path.join(this.dir, fileName), 'utf8');
    } catch {
      return undefined; // nothing stored for this account yet
    }
  }

  async writeVault(account: StoredAccount, content: string): Promise<void> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      throw new Error('internal: no vault file name planned for this account');
    }
    await this.sync();
    fs.writeFileSync(path.join(this.dir, fileName), content, { mode: 0o600 });
    await this.commitAndPush(fileName, account);
  }

  private async commitAndPush(fileName: string, account: StoredAccount): Promise<void> {
    await this.git(['add', '--', fileName], this.dir);
    const status = await this.git(['status', '--porcelain'], this.dir);
    if (status.trim().length === 0) {
      return; // byte-identical to what is already committed
    }
    await this.git(commitArgv(account.accountId.slice(0, 8), new Date().toISOString()), this.dir);
    await this.git(pushArgv(), this.dir);
  }

  /** Everyone with a vault file in the repository — the same discovery the folder does. */
  async listTeam(ownAccounts: readonly StoredAccount[]): Promise<TeamMember[]> {
    await this.sync();
    const ownIds = new Set(ownAccounts.map((a) => a.accountId));
    return this.vaultFiles().flatMap((fileName) => {
      const account = this.accountIn(fileName);
      return account === undefined
        ? []
        : [
            {
              account,
              fileName,
              location: this.location,
              // Like the folder transport: a share is bound to the recipient's account id.
              shareKeyId: account.accountId,
              isSelf: ownIds.has(account.accountId),
            },
          ];
    });
  }

  private vaultFiles(): string[] {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.startsWith('vault_') && f.endsWith('.enc'));
    } catch {
      return [];
    }
  }

  /** The plaintext account stamped in an envelope, or undefined when it cannot be read. */
  private accountIn(fileName: string): StoredAccount | undefined {
    try {
      return readBackupAccount(fs.readFileSync(path.join(this.dir, fileName), 'utf8'));
    } catch {
      return undefined;
    }
  }

  async listShares(account: StoredAccount): Promise<OwnedShare[]> {
    const raw = await this.readVault(account);
    if (raw === undefined) {
      return [];
    }
    return sharesFromEnvelope(raw).map((item) => ({
      accountId: account.accountId,
      shareKeyId: account.accountId,
      item,
    }));
  }

  /**
   * Put share items into the recipient's own envelope.
   *
   * <p>Read-modify-write against a file whose owner may be writing it too. A rejected push
   * means they did: re-sync and try again, a bounded number of times, then give up and let the
   * person retry — exactly the shape `FolderTransport` uses for the same race.</p>
   */
  async appendShares(
    _actingAs: StoredAccount,
    recipient: TeamMember,
    items: ShareItem[],
  ): Promise<void> {
    await this.rewriteShares(recipient.account, (existing) => [...existing, ...items]);
  }

  async removeShare(actingAs: StoredAccount, share: OwnedShare): Promise<void> {
    await this.rewriteShares(actingAs, (existing) => existing.filter((s) => s.id !== share.item.id));
  }

  private async rewriteShares(
    account: StoredAccount,
    change: (existing: ShareItem[]) => ShareItem[],
  ): Promise<void> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      throw new Error(`No vault file is planned for ${account.email}.`);
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Someone else's push between our read and our push means re-read and reapply — the
      // change is a set operation, so replaying it on fresher content is always correct.
      if (await this.tryRewrite(account, fileName, change)) {
        return;
      }
    }
    throw new Error(
      `${this.location} kept changing under this update. Nothing was lost; try again.`,
    );
  }

  /** One attempt. `false` means the remote moved under us and it is worth another. */
  private async tryRewrite(
    account: StoredAccount,
    fileName: string,
    change: (existing: ShareItem[]) => ShareItem[],
  ): Promise<boolean> {
    const raw = await this.readVault(account);
    if (raw === undefined) {
      throw new Error(`${account.email} has no vault at ${this.location} yet.`);
    }
    fs.writeFileSync(path.join(this.dir, fileName), envelopeWithShares(raw, change), {
      mode: 0o600,
    });
    return this.pushOrRetry(fileName, account);
  }

  /** `true` when the push landed, `false` when the remote moved and a retry is warranted. */
  private async pushOrRetry(fileName: string, account: StoredAccount): Promise<boolean> {
    try {
      await this.commitAndPush(fileName, account);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.failure === 'rejected') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove this account's vault from the repository.
   *
   * <p>The file goes; its history does not. A git repository keeps every commit, so a
   * deletion here is "no longer current", not "never existed" — which the caller must say to
   * the person rather than implying the secrets are gone from the remote.</p>
   */
  async deleteVault(account: StoredAccount): Promise<void> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      return;
    }
    await this.sync();
    if (!fs.existsSync(path.join(this.dir, fileName))) {
      return;
    }
    await this.git(['rm', '--quiet', '--', fileName], this.dir);
    await this.git(commitArgv(account.accountId.slice(0, 8), new Date().toISOString()), this.dir);
    await this.git(pushArgv(), this.dir);
  }
}
