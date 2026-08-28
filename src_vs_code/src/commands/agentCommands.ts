/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { Machine } from '../installCommand';
import { anyAgentAccess } from '../mcpAccess';
import { CredsAgentServer } from '../credsAgentServer';
import { AliasMap } from '../cliAliases';
import { SshBridgeManager } from '../sshBridgeManager';
import { createDiagnosticLog } from '../diagnosticLog';
import { CredsProduct } from '../credsInstall';
import { CredTreeDataProvider } from '../treeDataProvider';
import { SshAgentManager } from '../sshAgentManager';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import * as vscode from 'vscode';
import { installScript } from '../installCommand';
import { InstallTarget } from '../installCommand';
import { EntityMetadata } from '../types';
import { SshExecAuth } from '../sshExecCommand';
import { buildSshExecArgv } from '../sshExecCommand';
import { sweepCommand } from '../sshBridge';
import { runSshExec } from '../sshExecRunner';
import { describeError } from '../describeError';
import { resolveExecAuth } from '../sshExecAuth';
import { modeCheckCommand } from '../sshBridge';
import { interpretSocketProbe } from '../sshBridge';
import { describeMissingSocket } from '../sshBridge';
import { isOwnerOnlyMode } from '../sshBridge';
import { describeWideSocket } from '../sshBridge';
import { probeCommand } from '../remoteCliInstall';
import { blockerFor } from '../remoteCliInstall';
import { interpretProbe } from '../remoteCliInstall';
import { confirmationFor } from '../remoteCliInstall';
import { installCommand } from '../remoteCliInstall';
import { interpretInstall } from '../remoteCliInstall';
import { entityKey } from '../entityFlags';
import { parseToken } from '../grantToken';
import { remoteSocketPath } from '../sshBridge';
import { bridgeId } from '../sshBridge';
import { buildBridgeArgv } from '../sshBridge';
import { isSafeSshTarget } from '../sshCommand';
import { remoteInstructions } from '../sshBridge';
import { aliasFor } from '../cliAliases';
import { withoutAlias } from '../cliAliases';
import { describeAliasProblem } from '../cliAliases';
import { resolveKind } from '../entityKind';
import { withAlias } from '../cliAliases';
import { asElement } from '../commandTargets';
import { connectEntity } from '../sshConnect';
import * as path from 'node:path';
import { describeSshTarget } from '../sshCommand';
import { buildAgentSnippet } from '../agentShareSnippet';
import { buildKindSnippet } from '../agentShareSnippet';
import { copySecret } from '../secretClipboard';
import { copiedMessage } from '../secretClipboard';
import { parseSshPrivateKey } from '../sshKeyParse';
import { gitSigningConfig } from '../gitSigningConfig';
import { gitSigningClipboardText } from '../gitSigningConfig';
import { showMcpLog } from '../mcpLogPanel';
import { CREDS_MCP } from '../credsInstall';
import { CREDS_CLI } from '../credsInstall';
export interface AgentCommandsHost {
  readonly MACHINES: ReadonlyArray<{ label: string; description: string; machine: Machine }>;
  readonly agentServer: CredsAgentServer;
  readonly aliasMap: () => AliasMap;
  readonly bridges: SshBridgeManager;
  readonly log: ReturnType<typeof createDiagnosticLog>;
  readonly mutated: () => void;
  readonly offerInstall: (product: CredsProduct) => Promise<void>;
  readonly provider: CredTreeDataProvider;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly setAliasMap: (next: AliasMap) => Thenable<void>;
  readonly sshAgent: SshAgentManager;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
}

export function registerAgentCommands(host: AgentCommandsHost): void {
  const { MACHINES, agentServer, aliasMap, bridges, log, mutated, offerInstall, provider, register, setAliasMap, sshAgent, storage, storageDir, vaultKeys } = host;

  /**
   * Point a WSL shell at the relay, once, and turn the relay on.
   *
   * <p>The one part the extension cannot do for you. VS Code's environment collection is a single
   * namespace for every terminal of a window, and a Windows terminal needs the agent's named pipe
   * where a WSL one needs this relay's unix path; there is no per-shell scope. A Windows variable
   * does not even reach the distribution unless it is named in `WSLENV`. So the export belongs in
   * the shell's own rc, and this offers to put it there rather than shipping a mechanism that
   * half-works.</p>
   */
  /**
   * The install command for a machine this extension is NOT running on.
   *
   * <p>The two buttons above it install here. This is for a colleague's laptop, a jump box, a
   * fresh container — anywhere a person has a terminal and no VS Code. The script resolves the
   * newest release itself and verifies the checksum, so what gets pasted stays correct after this
   * extension has moved on: see `installCommand.ts`.</p>
   */
  // A window with entries open to agents must be FINDABLE by one. The listener used to open on
  // the first `share()`, which is a door nobody uses when the agent arrives over MCP: it starts
  // `creds-mcp` itself and looks for the announcement this listener writes. So a reload left the
  // switches on, the vault unlocked, and every agent told no window answered.
  void openAgentDoorIfAsked(agentServer, storage);

  register('credSshManager.copyInstallCommand', () => copyInstallScript());

  async function copyInstallScript(): Promise<void> {
    const target = await vscode.window.showQuickPick(
      [
        { label: 'creds', description: 'the terminal CLI' },
        { label: 'creds-mcp', description: 'the MCP server' },
      ],
      { placeHolder: 'Which binary should the command install?' },
    );
    if (target === undefined) {
      return;
    }
    const machine = await vscode.window.showQuickPick(MACHINES, {
      placeHolder: 'Which machine will run it?',
    });
    if (machine === undefined) {
      return;
    }
    await vscode.env.clipboard.writeText(
      installScript(target.label as InstallTarget, machine.machine),
    );
    void vscode.window.showInformationMessage(
      `Copied a ${machine.description.startsWith('bash') ? 'bash' : 'PowerShell'} command for ` +
        `${target.label} on ${machine.label}. It finds the newest release itself and checks the ` +
        'download before installing.',
    );
  }

  /**
   * Give an entry a name a terminal can use — or take it away again.
   *
   * <p>The name is all that is stored. It is not a credential and confers nothing: the first
   * `creds` call under it still raises the same consent modal as a pasted token would, and the
   * grant it mints still dies with this window.</p>
   */
  /**
   * Hold an `ssh -R` open to this host so `creds` works there.
   *
   * <p>The direction is the whole feature: VS Code's own forwarding shows a LOCAL client a
   * REMOTE service, and this needs the opposite — the remote host reaching the broker on THIS
   * machine. Nothing is copied over: no key, no password, no vault. The remote gets a socket
   * that speaks to a broker here, the consent modal appears here, and only the output of an
   * action travels back.</p>
   *
   * <p>The grant is minted first because it is what starts the broker and names its port, and
   * because the person needs a token on the far side anyway — so one action produces both
   * halves of what makes the remote useful.</p>
   */
  /**
   * Look at what the forwarded socket's permissions actually are.
   *
   * <p>They are the boundary on that host and this end cannot set them: for a `-R` forward the
   * socket is created by sshd, so the SERVER's `StreamLocalBindMask` decides. Measured on a real
   * host — a client asking for mode 0000 still got `srw-------`, because the client's copy of
   * that option is ignored for a remote forward. So the honest thing is to observe and say when
   * it is wrong, rather than ship a flag that reads like a guarantee.</p>
   *
   * <p>Best-effort and never fatal: a host without `stat`, or one that has not finished binding
   * yet, simply produces no claim either way. Silence here means "not observed", never "safe".</p>
   */
  /**
   * Remove this user's dead bridge sockets on the remote host.
   *
   * <p>Best-effort and quiet: litter is a tidiness problem, and a host where the sweep cannot
   * run is a host with some extra inert files, not a broken bridge. The command itself refuses
   * to do anything when `ss` is missing — without it the liveness test would answer "nobody
   * listening" for every socket and the sweep would delete every live bridge on the machine.</p>
   */
  async function sweepDeadSockets(
    entity: EntityMetadata,
    keyPath: string | undefined,
    user: string,
    auth: SshExecAuth = 'key',
    sweepEnv: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    const argv = buildSshExecArgv(entity, keyPath, sweepCommand(user), auth);
    if (argv === undefined) {
      return;
    }
    try {
      await runSshExec(argv, { env: sweepEnv, timeoutMs: 15_000, signal: agentServer.signal });
    } catch (error) {
      log.info('bridge', `socket sweep did not run: ${describeError(error)}`);
    }
  }

  async function verifyBridgeSocket(
    accountId: string,
    entity: EntityMetadata,
    remote: { path: string },
  ): Promise<void> {
    try {
      if (storageDir === undefined) {
        return;
      }
      const credential = await resolveExecAuth(storage, accountId, entity, storageDir);
      if (!credential.ok) {
        return; // the bridge itself already reported this
      }
      const keyPath = credential.keyPath;
      const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote), credential.auth);
      if (argv === undefined) {
        return;
      }
      // sshd does not unlink a `-R` socket when its session ends — measured on a real host —
      // and nothing else does, so every dropped bridge leaves one behind. Swept here, AFTER the
      // new one is up: it is then live, and the sweep keeps anything still being listened on,
      // which is what stops it removing another window's working bridge.
      await sweepDeadSockets(entity, keyPath, entity.user ?? '', credential.auth, credential.env);
      // A moment for sshd to bind before asking about the file.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const outcome = await runSshExec(argv, {
        env: credential.env,
        timeoutMs: 15_000,
        signal: agentServer.signal,
      });
      const probe = interpretSocketProbe(outcome.stdout ?? '');
      if (probe.kind === 'missing') {
        // The bridge is NOT up. This used to share a branch with "no stat on this host" and go
        // to an info log, so a dead bridge was announced as open and the only record of the
        // failure was a line in a file nobody had a reason to open.
        const text = describeMissingSocket(remote, entity.name ?? 'this entry');
        log.info('bridge', text);
        void vscode.window.showErrorMessage(text);
        return;
      }
      if (probe.kind === 'unreadable') {
        log.info('bridge', `${remote.path} is there, but its mode could not be read on that host`);
        return;
      }
      const mode = probe.mode;
      if (!isOwnerOnlyMode(mode)) {
        log.warn('bridge', `${remote.path} is mode ${mode}, not 600`);
        void vscode.window.showWarningMessage(describeWideSocket(mode, remote));
      }
    } catch (error) {
      log.info('bridge', `socket check did not complete: ${describeError(error)}`);
    }
  }

  /**
   * Install `creds` on the host this entity points at.
   *
   * <p>The bridge asks a person to run `creds` on a machine that may never have had it, and the
   * honest answer to "how does it get there" used to be: build it and copy it yourself. This is
   * the same SSH connection the entity already describes, used twice — once to ask what the host
   * is, once to run the published installer on it.</p>
   *
   * <p>It goes through `resolveExecAuth` like every other non-interactive `ssh` here, so it works
   * for a password entity and not only a key one — the distinction that made the bridge silently
   * unusable for exactly the hosts it was for.</p>
   */
  register('credSshManager.installRemoteCli', async (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined || storageDir === undefined) {
      return;
    }
    const details = storage.getNode(accountId, node.id)?.details;
    if (details === undefined || (details.host ?? '') === '') {
      void vscode.window.showWarningMessage(`"${node.name}" has no host configured.`);
      return;
    }

    const credential = await resolveExecAuth(storage, accountId, details, storageDir);
    if (credential.warning !== undefined) {
      void vscode.window.showWarningMessage(credential.warning);
    }
    if (!credential.ok) {
      void vscode.window.showErrorMessage(`Cannot reach "${node.name}": ${credential.message}`);
      return;
    }

    const facts = await runRemote(details, credential, probeCommand(), 20_000);
    if (facts.timedOut) {
      void vscode.window.showWarningMessage(
        `"${node.name}" did not answer within 20 seconds — the host may be unreachable.`,
      );
      return;
    }
    const blocker = blockerFor(interpretProbe(facts.stdout));
    if (blocker.length > 0) {
      void vscode.window.showWarningMessage(`Cannot install on "${node.name}": ${blocker}`);
      return;
    }

    // Asked BEFORE anything runs, and showing the command itself rather than a description of
    // it: this downloads a binary onto a machine that is not this one.
    const ask = confirmationFor(interpretProbe(facts.stdout), node.name);
    const answer = await vscode.window.showInformationMessage(
      ask.message,
      { modal: true, detail: ask.detail },
      ask.action,
    );
    if (answer !== ask.action) {
      return;
    }

    const outcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `CredsForDevs: installing creds on "${node.name}"…`,
        cancellable: false,
      },
      async () => {
        const run = await runRemote(details, credential, installCommand(), 180_000);
        return run.timedOut
          ? ({ kind: 'failed', reason: 'the install did not finish within three minutes.' } as const)
          : interpretInstall(run.stdout, run.stderr, run.exitCode);
      },
    );

    if (outcome.kind === 'installed') {
      void vscode.window.showInformationMessage(
        `\`creds\` is installed on "${node.name}" at ${outcome.path}.`,
      );
      return;
    }
    void vscode.window.showErrorMessage(`Could not install on "${node.name}": ${outcome.reason}`);
  });

  /** One non-interactive `ssh` with a resolved credential — the shape every caller here needs. */
  async function runRemote(
    entity: EntityMetadata,
    credential: Extract<Awaited<ReturnType<typeof resolveExecAuth>>, { ok: true }>,
    command: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    const argv = buildSshExecArgv(entity, credential.keyPath, command, credential.auth);
    if (argv === undefined) {
      return { stdout: '', stderr: 'its host is not a shape ssh can be given safely.', exitCode: -1, timedOut: false };
    }
    try {
      const run = await runSshExec(argv, { env: credential.env, timeoutMs, signal: agentServer.signal });
      // A timeout stays its OWN fact rather than folding into a non-zero exit: "the host did
      // not answer in time" and "the command failed" need different words to a person.
      return { stdout: run.stdout, stderr: run.stderr, exitCode: run.exitCode ?? -1, timedOut: run.timedOut };
    } catch (error) {
      return { stdout: '', stderr: describeError(error), exitCode: -1, timedOut: false };
    }
  }

  /**
   * Close the bridge this entry has open.
   *
   * <p>Its own command rather than a second meaning for *Open Remote Bridge…*, because a menu
   * item that toggles silently is one a person cannot read: the title stayed "Open" while a
   * bridge ran, so somebody looking for "close" found nothing and had to click "open" on an
   * open bridge to reach the choice hidden behind it. The row now carries `:bridged` or
   * `:nobridge` and exactly one of the two items is offered.</p>
   *
   * <p>No confirmation: the title says what it does, and a bridge costs one click to reopen.</p>
   */
  register('credSshManager.closeRemoteBridge', (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined) {
      return;
    }
    const closed = bridges.stop(entityKey(accountId, node.id));
    provider.refresh();
    void vscode.window.showInformationMessage(
      closed
        ? `The bridge to "${node.name}" is closed.`
        // The row said "bridged" and the map disagreed — the ssh died between the render and
        // the click. Say so rather than claiming to have closed something that was already gone.
        : `"${node.name}" had no bridge open — it had already ended.`,
    );
  });

  register('credSshManager.openRemoteBridge', async (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined) {
      return;
    }
    const key = entityKey(accountId, node.id);

    if (bridges.isOpen(key)) {
      const answer = await vscode.window.showQuickPick(['Keep it open', 'Close the bridge'], {
        title: `"${node.name}" is bridged at ${bridges.remotePathFor(key)}`,
      });
      if (answer === 'Close the bridge') {
        bridges.stop(key);
        provider.refresh();
        void vscode.window.showInformationMessage(`The bridge to "${node.name}" is closed.`);
      }
      return;
    }

    const details = storage.getNode(accountId, node.id)?.details;
    if (details === undefined || (details.host ?? '') === '') {
      void vscode.window.showWarningMessage(
        `"${node.name}" has no host configured — there is nothing to bridge to.`,
      );
      return;
    }

    // Minting also starts the broker, which is what gives the port the forward needs.
    const token = await agentServer.share(accountId, node.id, node.name, 'ssh');
    const parsed = parseToken(token);
    if (parsed === undefined) {
      return;
    }

    // The SAME resolver an agent exec uses. This block used to handle `storedKey` alone and
    // pass `undefined` for a key file, a password and no-credential-at-all — so a bridge to a
    // password entity spawned an ssh with nothing to authenticate with, and (having no
    // BatchMode) waited at the prompt forever rather than failing.
    if (storageDir === undefined) {
      return;
    }
    const credential = await resolveExecAuth(storage, accountId, details, storageDir);
    if (credential.warning !== undefined) {
      void vscode.window.showWarningMessage(credential.warning);
    }
    if (!credential.ok) {
      void vscode.window.showErrorMessage(`Cannot bridge to "${node.name}": ${credential.message}`);
      return;
    }
    const keyPath = credential.keyPath;

    const remote = { path: remoteSocketPath(details.user ?? '', bridgeId(() => crypto.randomUUID())) };
    const argv = buildBridgeArgv(
      details,
      { port: parsed.port, remote, keyPath, auth: credential.auth },
      isSafeSshTarget,
    );
    if (argv === undefined) {
      void vscode.window.showWarningMessage(
        `"${node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`,
      );
      return;
    }

    // The RESOLVED environment, not the parent’s: a password entity carries its answer in
    // SSH_ASKPASS, and spawning with process.env would drop exactly the thing that lets this
    // connection authenticate at all.
    bridges.start(key, remote.path, 'ssh', argv, credential.env);
    provider.refresh();

    // The socket's permissions are the boundary on that host, and we cannot set them: for a
    // `-R` forward sshd creates the socket, so the SERVER's StreamLocalBindMask governs. So
    // look instead of assuming — measured on a real host after a version of this claimed a
    // client flag did it. A host whose admin widened that mask hands every login there an
    // opening into this machine's broker, and nobody would ever find out.
    void verifyBridgeSocket(accountId, details, remote);

    // The token goes THROUGH `remoteInstructions`, never appended after it: the block is pasted
    // into a shell, and appending prose is what put a bearer token into a remote's history as a
    // failed command.
    const instructions = remoteInstructions(remote, token, node.name);
    const answer = await vscode.window.showInformationMessage(
      `Bridge open to "${node.name}". Open an SSH session there, paste the setup block, and \`creds\` works there.`,
      'Copy the setup block',
    );
    if (answer !== undefined) {
      await vscode.env.clipboard.writeText(instructions);
    }
  });

  register('credSshManager.enableCliAccess', async (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined) {
      return;
    }

    const existing = aliasFor(aliasMap(), accountId, node.id);
    if (existing !== undefined) {
      const answer = await vscode.window.showQuickPick(['Keep it', `Remove "${existing}"`], {
        title: `"${node.name}" is available to the CLI as "${existing}"`,
      });
      if (answer?.startsWith('Remove') === true) {
        await setAliasMap(withoutAlias(aliasMap(), existing));
        void vscode.window.showInformationMessage(`"${existing}" is no longer available to the CLI.`);
      }
      return;
    }

    const name = await vscode.window.showInputBox({
      title: `Name for "${node.name}" in the terminal`,
      prompt: 'Then: creds ssh <name> -- <command>. The name is not a secret; every call still asks you to allow it.',
      value: node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40),
      validateInput: (value) => describeAliasProblem(value.trim()) ?? null,
    });
    if (name === undefined) {
      return;
    }

    const kind = resolveKind(storage.getNode(accountId, node.id)?.details);
    await setAliasMap(withAlias(aliasMap(), name.trim(), { accountId, entityId: node.id, kind }));
    void vscode.window.showInformationMessage(
      `"${node.name}" is now available in the terminal as: creds ${kind === 'db' ? 'db' : 'ssh'} ${name.trim()}`,
    );
  });

  register('credSshManager.connectSsh', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind === 'node' && element.node.details) {
      await connectEntity(
        element.accountId,
        element.node.details,
        storage,
        storageDir,
        sshAgent.servesKeyFor(element.node),
      );
    }
  });

  // Hand a coding agent the ABILITY to use this entity, never the credential.
  register('credSshManager.shareWithAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const kind = resolveKind(details);
    // Next to the RUNNING entry — out/ under tsc, dist/ in the packaged bundle — so the
    // snippet always names a CLI built the same way as the extension that minted the grant.
    const cliPath = path.join(__dirname, 'agentCli.js');

    // SSH keeps its own snippet: it is the only kind whose instructions name a target
    // (`user@host`), and the only one where the agent composes what runs.
    let snippet: string | undefined;
    if (kind === 'ssh') {
      const targetLabel = describeSshTarget(details);
      if (targetLabel === undefined) {
        void vscode.window.showWarningMessage(
          `"${element.node.name}" has no host configured — there is nothing an agent could connect to.`,
        );
        return;
      }
      snippet = buildAgentSnippet({
        entityName: element.node.name,
        target: targetLabel,
        token: await agentServer.share(element.accountId, details.id, element.node.name, 'ssh'),
        cliPath,
      });
    } else {
      const token = await agentServer.share(element.accountId, details.id, element.node.name, kind);
      snippet = buildKindSnippet(kind, { entityName: element.node.name, token, cliPath });
    }
    if (snippet === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has nothing an agent could do with it. SSH keys are deliberately excluded — a key only means anything attached to a host.`,
      );
      return;
    }
    // The token is a bearer capability for as long as this window lives, so it
    // gets the same expiring clipboard every secret here does.
    await copySecret(vscode.env.clipboard, snippet);
    void vscode.window.showInformationMessage(
      copiedMessage(`Claude Code instructions for "${element.node.name}"`),
    );
  });

  // Serve this key through the extension's own SSH agent — the alternative to writing it out
  // as a file, and the only door to Git commit signing with a vault-held key.
  register('credSshManager.addKeyToAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const result = await sshAgent.load(element.accountId, details);
    if (!result.ok) {
      void vscode.window.showWarningMessage(result.reason);
      return;
    }
    await storage.updateNode(element.accountId, {
      ...element.node,
      details: { ...details, sshAgent: true },
    });
    mutated();
    void vscode.window.showInformationMessage(
      `"${element.node.name}" (${result.fingerprint}) is served by the agent. New terminals get ` +
        'SSH_AUTH_SOCK automatically; every use of the key asks first.' +
        (process.platform === 'win32'
          ? ' On Windows the built-in OpenSSH client reaches it; the ssh that ships with Git for Windows cannot.'
          : ''),
    );
  });

  register('credSshManager.removeKeyFromAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    sshAgent.unload(element.node.details.id);
    await storage.updateNode(element.accountId, {
      ...element.node,
      details: { ...element.node.details, sshAgent: undefined },
    });
    mutated();
    void vscode.window.showInformationMessage(
      `"${element.node.name}" is no longer served by the agent.`,
    );
  });

  /**
   * The `git config` lines that make Git sign commits with this key.
   *
   * <p>Reads the public half out of the stored key rather than requiring the key to be loaded
   * first: a person asking how to configure signing has not necessarily loaded it yet, and
   * refusing at that point would be an obstacle with no reason behind it.</p>
   */
  register('credSshManager.copyGitSigningConfig', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const loaded = sshAgent.loadedKeys().find((k) => k.entityId === details.id);
    let publicLine = loaded?.publicLine;
    if (publicLine === undefined) {
      const content = await storage.getPrivateKey(element.accountId, details.id);
      const parsed = content === undefined ? undefined : parseSshPrivateKey(content, element.node.name);
      if (parsed === undefined) {
        void vscode.window.showWarningMessage(
          `"${element.node.name}" has no private key stored, so there is no public half to sign with.`,
        );
        return;
      }
      if (!parsed.ok) {
        void vscode.window.showWarningMessage(`"${element.node.name}": ${parsed.reason}`);
        return;
      }
      publicLine = parsed.key.publicLine;
    }
    const config = gitSigningConfig(
      publicLine,
      process.platform,
      sshAgent.socketPath ?? '(add the key to the agent to start it)',
    );
    await copySecret(vscode.env.clipboard, gitSigningClipboardText(config));
    void vscode.window.showInformationMessage(
      copiedMessage(`Git signing config for "${element.node.name}"`),
    );
  });

  register('credSshManager.showMcpLog', () => showMcpLog(storageDir));

  register('credSshManager.installMcpServer', () => offerInstall(CREDS_MCP));

  register('credSshManager.installCli', () => offerInstall(CREDS_CLI));
}

/**
 * Open the broker's listener when — and only when — something is open to agents.
 *
 * <p>Guarded rather than unconditional: this binds a loopback listener, and a person who has
 * opened nothing to an agent has not asked for one. `anyAgentAccess` asks about answers somebody
 * GAVE, so a folder deliberately set to nothing keeps the door shut.</p>
 *
 * <p>Never throws at the caller. A listener that could not bind is a degraded window, not a
 * broken one — everything except the agent surface still works, and the failure is already
 * written to the agent-access channel.</p>
 */
async function openAgentDoorIfAsked(
  agentServer: AgentCommandsHost['agentServer'],
  storage: AgentCommandsHost['storage'],
): Promise<void> {
  try {
    const opened = storage
      .getAccounts()
      .some((account) => anyAgentAccess(storage.getNodes(account.accountId)));
    if (opened) {
      await agentServer.ensureStarted();
    }
  } catch {
    // Reported by the server's own channel; a window must not fail to activate over this.
  }
}
