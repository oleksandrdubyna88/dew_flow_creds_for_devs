import { EntityMetadata, TreeNode } from './types';
import { commandRefusal, resolveCommand } from './commandLine';
import { resolveKind } from './entityKind';
import { HostShell, asOsName, isWindowsPowerShell51, quoteFor } from './hostShell';
import { buildSshExecArgv } from './sshExecCommand';
import { RefPlan, rewriteRefs } from './runPlan';
import { shortValuesCaveat } from './outputMask';
import { SshCommandOptions, buildSshCommand, isSafeSshTarget, noHostSentence, portArgv, sshDestination, withAcceptNew } from './sshCommand';
import { resolveJumpChain, sshOptionArgv } from './sshOptions';
import { isInTrash } from './trash';

/**
 * The ONE road from a Terminal entry and its SSH link to a launch (E1.S2 of PLAN_terminal_command_over_ssh.md; spec
 * `research/PLAN_terminal_command_over_ssh_E1_S2_spec.md`). Pure (it imports no editor API), so every row of the decision tables is a unit
 * test, and `launchRoadScan.test.ts` pins who may reach a terminal or a child without it.
 *
 * <p>Three questions, asked in this order by every road that runs a Terminal entry:</p>
 * <ol>
 *   <li>`sshLinkOf` — does the entry run over an SSH entry, and is that entry usable? (rows L1-L7)</li>
 *   <li>`planLaunch` — what is launched: nothing, a refusal, the local line, or the line as ONE remote command? (P1-P7)</li>
 *   <li>`typedLine` — for a road that types into a terminal: the line, from the PREPARED snapshot. (T1-T3)</li>
 * </ol>
 *
 * <p><b>The remote command is ONE argument.</b> The person's line is never split, escaped or re-joined here; it is
 * quoted for the LOCAL parse only (`sshCommand.ts`, `quoteFor`) and the remote shell parses its content. The stay-open
 * wrapper is `eval '<line>'` for that reason: a trailing comment or `&` in the line cannot swallow or break what follows.</p>
 *
 * <p><b>One snapshot.</b> The plan carries the SSH entry as READ here; the road prepares the session
 * (`prepareSshSession`) and then builds both the trust line and the typed line from the PREPARED entity. Two texts from
 * two reads is the defect the parent plan §4.4 forbids, so the plan holds no trust line.</p>
 */

/** What the composer reads of a Terminal entry. `id` for the self check; `terminalOs` for D9. */
export type LaunchEntry = Pick<EntityMetadata, 'id' | 'name' | 'command' | 'commandArgs' | 'terminalOs' | 'sshEntityId'>;

/** The vault as the composer may see it: one node by id. The same shape `isInTrash` takes. */
export type NodeLookup = (id: string) => TreeNode | undefined;

export type SshLink =
  | { readonly kind: 'none' }
  | { readonly kind: 'linked'; readonly ssh: EntityMetadata; readonly sshName: string }
  | { readonly kind: 'refused'; readonly reason: string };

const UNLINK = 'set "Runs over SSH" to "Do not use".';
const CHOOSE = 'Edit it and choose an SSH connection';

function refusedLink(reason: string): SshLink {
  return { kind: 'refused', reason };
}

type UsableNode = TreeNode & { readonly details: EntityMetadata };

function isUsable(node: TreeNode | undefined): node is UsableNode {
  return node !== undefined && node.type === 'entity' && node.details !== undefined;
}

function trashRefusal(name: string, node: UsableNode, lookup: NodeLookup): string | undefined {
  return isInTrash(node, lookup) ? `"${name}" runs over the SSH connection "${node.name}", which is in the Trash. Restore it first.` : undefined;
}

function kindRefusal(name: string, node: UsableNode): string | undefined {
  return resolveKind(node.details) === 'ssh' ? undefined : `"${name}" runs over "${node.name}", which is not an SSH connection entry. ${CHOOSE}.`;
}

function hostRefusal(name: string, node: UsableNode): string | undefined {
  return isSafeSshTarget(node.details) ? undefined : `"${name}" runs over the SSH connection "${node.name}", whose address is not a valid host and user.`;
}

/** Rows L4-L6 for a node that exists: why it cannot be the target of `name`'s link (trashed, not SSH, unsafe address), or nothing. */
function targetRefusal(name: string, node: UsableNode, lookup: NodeLookup): string | undefined {
  return trashRefusal(name, node, lookup) ?? kindRefusal(name, node) ?? hostRefusal(name, node);
}

/**
 * Whether a node can be the target of a link at all (rows L4-L6): a live SSH entry with a safe address. The decision
 * `sshLinkOf` takes, asked without an entry, so the field's candidate list (`commandTargets.collectSshCandidates`) offers
 * exactly the entries the composer will accept and a change to the decision changes both. Self is the caller's check (row
 * L2 is by id).
 */
export function isLinkTarget(node: TreeNode | undefined, lookup: NodeLookup): boolean {
  return isUsable(node) && targetRefusal('', node, lookup) === undefined;
}

function linkToNode(entry: LaunchEntry, node: UsableNode, lookup: NodeLookup): SshLink {
  const reason = targetRefusal(entry.name, node, lookup);
  return reason === undefined ? { kind: 'linked', ssh: node.details, sshName: node.name } : refusedLink(reason);
}

function linkTo(entry: LaunchEntry, id: string, lookup: NodeLookup): SshLink {
  if (id === entry.id) {
    return refusedLink(`"${entry.name}" is set to run over itself. ${CHOOSE}, or ${UNLINK}`);
  }
  const node = lookup(id);
  return isUsable(node)
    ? linkToNode(entry, node, lookup)
    : refusedLink(`"${entry.name}" runs over an SSH connection that is no longer in this vault. ${CHOOSE}, or ${UNLINK}`);
}

/**
 * Rows L1-L7, in that order: none, self (by id, with no lookup), missing, trashed, not an SSH entry, unsafe address,
 * linked. Never throws; a lookup that throws is the caller's bug, not caught here.
 */
export function sshLinkOf(entry: LaunchEntry, lookup: NodeLookup): SshLink {
  const id = entry.sshEntityId;
  if (id === undefined || id === '') {
    return { kind: 'none' };
  }
  return linkTo(entry, id, lookup);
}

/** What the E1.S1 refusal reads. */
export type LinkedEntry = Pick<EntityMetadata, 'id' | 'name' | 'sshEntityId'>;

/**
 * The sentence every road says instead of running a linked entry (E1.S1, D8).
 *
 * <p>`undefined` means exactly one thing: THIS ENTRY HAS NO SSH LINK (row L1: `sshEntityId` is absent or empty). Any other
 * answer is the sentence, and that includes an entry that is linked to a valid, live SSH target: a road that calls this
 * function does not run a linked entry over SSH, so even a perfectly good link gets the sentence. The decision is made WITHOUT a lookup
 * (`sshLinkOf` is asked with one that finds nothing), so it never depends on whether the target exists; "is this entry
 * linked" has ONE reader, and `undefined` is never "linked but fine".</p>
 *
 * <p>Moved here from `sshLinkGate.ts` with its name and signature unchanged (S2-D7). E2 replaced the person's roads by
 * `planLaunch` (the arrow, the folder run, a VPN's Start on the person's click, a chain step with a road). It is still
 * called by the roads that have no SSH road: Run with Secrets for a SCRIPT that a sync linked (a linked command runs over SSH
 * since E3.S1), an agent's VPN start, and a dependency chain with no road (`launchRoadScan.test.ts` lists the
 * callers); a road that moves to `planLaunch` leaves that list.</p>
 */
export function sshLinkRefusal(entry: LinkedEntry): string | undefined {
  return sshLinkOf(entry, () => undefined).kind === 'none'
    ? undefined
    : `"${entry.name}" is set to run over SSH, which this version cannot do yet. To run it on this machine, edit it and ${UNLINK}`;
}

/**
 * The details with the link taken off (D4): what an import and an accepted share write. The id names an entity of the
 * SENDER's vault, so a received entry never arrives linked. The key stays present as `undefined`, as `exportedNode` leaves it.
 * Moved here from `sshLinkGate.ts` unchanged.
 */
export function withoutSshLink<T extends Pick<EntityMetadata, 'sshEntityId'>>(details: T): T {
  return { ...details, sshEntityId: undefined };
}

/**
 * The details of an *Update it* on a received share: the RECIPIENT's own link, never the payload's (D4, epoch 2). The
 * link names an entity of ONE vault, so the sender's id means nothing here (it is dropped even when a hand-made payload
 * carries one) and the recipient's own id must not be erased by an update that cannot carry it. Without an existing
 * entry there is no link. The key stays present as `undefined`, as `withoutSshLink` leaves it.
 */
export function keepingSshLink<T extends Pick<EntityMetadata, 'sshEntityId'>>(incoming: T, existing: Pick<EntityMetadata, 'sshEntityId'> | undefined): T {
  return { ...incoming, sshEntityId: existing?.sshEntityId };
}

// ---- the plan -------------------------------------------------------------------------------------------------------

export type LaunchPlan =
  | { readonly kind: 'empty' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'local'; readonly line: string }
  | {
      readonly kind: 'remote';
      /** The link's entity AS READ HERE — the road replaces it by the prepared snapshot. */
      readonly ssh: EntityMetadata;
      readonly sshName: string;
      /** The Terminal entry's name, for a sentence that must name it (`typedLine` row T1). */
      readonly entryName: string;
      /** The person's line, `{name}` filled — what the trust line quotes. */
      readonly line: string;
      /** The ONE remote argument: the bare line or the stay-open wrapper, run by the server's login shell (`loginShellCommand`). */
      readonly remoteCommand: string;
    };

export interface PlanOptions {
  /** Interactive roads (arrow, folder run, VPN launcher) pass true; the chain step, Run with Secrets and the agent pass false. */
  readonly stayOpen: boolean;
}

function windowsRefusal(entry: LaunchEntry): string | undefined {
  return asOsName(entry.terminalOs) === 'windows'
    ? `"${entry.name}" is written for Windows and is set to run over SSH. A Windows remote is not supported yet. Change "Runs on" to Linux or macOS, or ${UNLINK}`
    : undefined;
}

function lineBreakRefusal(name: string, line: string): string | undefined {
  return /[\n\r\0]/.test(line)
    ? `"${name}" has a line break in its command, which cannot be sent over SSH as one command. Put the steps on one line, joined with ";" or "&&".`
    : undefined;
}

function planRemote(entry: LaunchEntry, link: Extract<SshLink, { kind: 'linked' }>, line: string, options: PlanOptions): LaunchPlan {
  const reason = windowsRefusal(entry) ?? lineBreakRefusal(entry.name, line);
  if (reason !== undefined) {
    return { kind: 'refused', reason };
  }
  return { kind: 'remote', ssh: link.ssh, sshName: link.sshName, entryName: entry.name, line, remoteCommand: loginShellCommand(options.stayOpen ? stayOpenWrapper(line) : line) };
}

function planReady(entry: LaunchEntry, link: SshLink, line: string, options: PlanOptions): LaunchPlan {
  if (link.kind === 'refused') {
    return { kind: 'refused', reason: link.reason };
  }
  return link.kind === 'none' ? { kind: 'local', line } : planRemote(entry, link, line, options);
}

/**
 * Rows P1-P7: nothing to run (checked first: an empty entry runs nowhere, linked or not), the line's own refusal (the
 * `{name}` refusal, unchanged), the link's refusal, no link (the local line), a Windows remote, a line break, remote.
 */
export function planLaunch(entry: LaunchEntry, link: SshLink, options: PlanOptions): LaunchPlan {
  const resolved = resolveCommand(entry);
  switch (resolved.kind) {
    case 'empty':
      return { kind: 'empty' };
    case 'refused':
      return { kind: 'refused', reason: resolved.reason };
    default:
      return planReady(entry, link, resolved.line, options);
  }
}

/** `'` → `'\''`: the body of ONE POSIX single-quoted word. Shared by the stay-open wrapper and the login builder (L4). */
function singleQuotedBody(text: string): string {
  return text.replace(/'/g, `'\\''`);
}

/**
 * `exec ${SHELL:-sh} -l -c '<inner>'` (L2 of PLAN_ssh_line_runs_in_login_shell.md): sshd runs the remote command as its own non-login
 * `$SHELL -c`, which reads no profile, so that shell replaces itself (`exec`: one process, the line's exit code kept, the folder and
 * the variables kept for the stay-open shell) by a LOGIN shell that runs `inner`. The login shell is not interactive (no `-i`).
 * `${SHELL:-sh}` stays unquoted, and the single quotes of `inner` are written `'\''` (`singleQuotedBody`), so the text adds no `"`:
 * a double quote would meet the Windows PowerShell 5.1 refusal on every launch. The text ends with `'`, whatever `inner` is.
 */
export function loginShellCommand(inner: string): string {
  return `exec \${SHELL:-sh} -l -c '${singleQuotedBody(inner)}'`;
}

/**
 * `line` run as ONE script by the remote shell's `-c`, then the failure said and a login shell started: `eval 'L'` with every `'` of the
 * line written `'\''`. The text holds NO `"` of its own (a double quote would meet the Windows PowerShell 5.1 refusal on every
 * launch), and a trailing `# comment` or `&` in the line ends with the eval, not the wrapper. `exit` in the line ends the session
 * (accepted, as in the parent plan). It is the `inner` of `loginShellCommand` on the interactive roads, so the profile is read twice there:
 * once for the line, once for the shell that stays open (L6).
 */
export function stayOpenWrapper(line: string): string {
  const quoted = singleQuotedBody(line);
  return `eval '${quoted}'; s=$?; test $s -eq 0 || printf 'creds: the command ended with exit code %s\\n' $s >&2; exec \${SHELL:-sh} -l`;
}

// ---- the trust line -------------------------------------------------------------------------------------------------

/**
 * The canonical approval text: `ssh[ -p <port>][ -J <jump>][ -A][ -L|-R …] -- <user@host|host> '<line>'`. Posix quoting on
 * every OS, so one entry gives one text everywhere. The jump, `-A` and every enabled forward are what `sshOptionArgv`
 * composes for the launch (that function's output, not a second composer): a forward or agent forwarding applies to the
 * launch, so a synced change that adds one must ask again. The key, the pin file, the program word, `-t`, `-o` and any
 * prefix are NOT in it: it is the approval key (`commandFingerprint(terminalEntry.id, trustLine)`), and what the person
 * approves is where the command runs and what it is. `jump` is the resolved `-J` value, or undefined.
 */
export function trustLineFor(ssh: EntityMetadata, jump: string | undefined, line: string): string {
  return ['ssh', ...portArgv(ssh.port, 'linux'), ...sshOptionArgv(ssh, jump), '--', sshDestination(ssh), quoteFor('posix', line)].join(' ');
}

// ---- the typed line -------------------------------------------------------------------------------------------------

/**
 * What `typedLine` needs of `prepareSshSession`'s `ReadySsh`: structural, so a `ReadySsh` is assignable with no adapter
 * (`sshSession.test.ts` pins it) and this file imports no editor API.
 */
export interface PreparedForTyping {
  /** The snapshot with `sshKeyPath` set to the materialised file or cleared. */
  readonly entity: EntityMetadata;
  /** Jump, knownHostsFile, program — as `connectionOptions` resolved them. */
  readonly options: SshCommandOptions;
  /** `terminalPlatform(side, hostPlatform)`: the shell that parses the line. */
  readonly platform: NodeJS.Platform;
  /** The relay prefix, or undefined on every other route. */
  readonly prefix: string | undefined;
  /** The password branch without a pin (`passwordBranch` of `sshSession.ts`): `-o StrictHostKeyChecking=accept-new`. */
  readonly acceptNew: boolean;
}

export type TypedLine =
  | { readonly kind: 'typed'; readonly line: string }
  | { readonly kind: 'refused'; readonly reason: string };

export type RemotePlan = Extract<LaunchPlan, { kind: 'remote' }>;

/**
 * Windows PowerShell 5.1 wraps a native argument with a space in `"…"` and escapes no inner `"`: a known-wrong parse is refused. Only a
 * double quote is refused (L12): the Windows argument rules read `\` as special only before a `"`, and the remote command of every plan
 * ends with `'` (`loginShellCommand`), so a line that ends in `\` is safe to type, and a check for it could never fire.
 */
function powerShell51Refusal(plan: RemotePlan, localShell: HostShell): string | undefined {
  return plan.remoteCommand.includes('"') && isWindowsPowerShell51(localShell.shellPath)
    ? `This terminal is Windows PowerShell 5.1, which cannot pass a double quote to ssh correctly. Install PowerShell 7 (pwsh) and run "${plan.entryName}" again.`
    : undefined;
}

/**
 * Rows T1-T3: the PowerShell 5.1 refusal, then `prefix + buildSshCommand(prepared.entity, prepared.platform, { ...options,
 * remote })`. It reads `prepared.entity`, NEVER `plan.ssh` (one snapshot). `tty` is true on every terminal road.
 */
export function typedLine(plan: RemotePlan, prepared: PreparedForTyping, localShell: HostShell): TypedLine {
  const reason = powerShell51Refusal(plan, localShell);
  if (reason !== undefined) {
    return { kind: 'refused', reason };
  }
  const command = buildSshCommand(prepared.entity, prepared.platform, { ...prepared.options, remote: { command: plan.remoteCommand, tty: true } });
  return command === undefined
    ? { kind: 'refused', reason: noHostSentence(plan.sshName) }
    : { kind: 'typed', line: (prepared.prefix ?? '') + withAcceptNew(command, prepared.acceptNew) };
}

// ---- the secrets script ---------------------------------------------------------------------------------------------

/** The first and the last line of the script of Run with Secrets: shell comments that do nothing when it runs, and that tell the remote command the script arrived whole. */
export const SECRETS_SCRIPT_FIRST = '#creds-secrets-1';
export const SECRETS_SCRIPT_LAST = '#creds-secrets-end';

/**
 * What the remote command says on standard error, with status 1, when the script did not arrive whole. It stands inside `"…"` in the
 * command, so it holds none of `"`, `$`, a backtick, `\` and `'` (a unit test pins that).
 */
export const SECRETS_NOT_WHOLE =
  'creds: the script with the values did not arrive whole, and nothing was run. A startup file on the server, such as ~/.bashrc, possibly read the standard input.';

/**
 * What the login shell runs for Run with Secrets (L5; the measured reason of each word is in the plan, §3.3). sshd's shell moved the
 * script to file descriptor 3 and gave the login shell an empty input, so the profile reads nothing. `set +avx` turns off what a profile
 * could have turned on (every variable exported, a trace or an echo that prints the values); `unset` removes a variable of the same name;
 * `command cat` is the real `cat`, not an alias or a function; the script runs only when its first and its last line are there, in a
 * subshell (no `exit` reaches the login shell, so no logout file runs and the status is the line's) with fd 3 closed. A refusal ends with
 * `false`, not `exit 1`, so a logout file cannot hide it. It holds no `'`.
 */
const SECRETS_INNER =
  'set +avx; unset creds_script && creds_script=$(command cat <&3) && ' +
  `case $creds_script in "${SECRETS_SCRIPT_FIRST}"*"${SECRETS_SCRIPT_LAST}") (eval "$creds_script") 3<&- ;; ` +
  `*) echo "${SECRETS_NOT_WHOLE}" >&2; false ;; esac`;

/**
 * The ONE remote command of Run with Secrets: the remote LOGIN shell reads the script from file descriptor 3 (D12, epoch 2; L5 of
 * PLAN_ssh_line_runs_in_login_shell.md). It is the shell that parses the line on every other road, so a line written for the person's own
 * shell (bash `[[ ]]`, `$'…'`) parses here as it does there. The text holds `"`: a road that types it into Windows PowerShell 5.1 meets
 * that refusal, and the secrets road spawns ssh with no shell (D12).
 */
export const SECRETS_REMOTE_COMMAND = `${loginShellCommand(SECRETS_INNER)} 3<&0 </dev/null`;

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function exportLine(name: string, value: string): string {
  if (!ENV_NAME.test(name)) {
    throw new Error('secretsStdin: a name is not a valid variable name (letters, digits and underscore, not starting with a digit)');
  }
  return `${name}=${quoteFor('posix', value)}; export ${name}`;
}

/**
 * The script `SECRETS_REMOTE_COMMAND` reads for Run with Secrets: `SECRETS_SCRIPT_FIRST`, each value assigned and exported in two steps (so
 * a value is never parsed as syntax), the line in a `{ … } </dev/null` group (a command that reads stdin reads end of input, not the rest of
 * this script), `exit $?`, and `SECRETS_SCRIPT_LAST`. The blank line after the line is deliberate: a line ending in `\` continues onto it,
 * not onto `}`. A name is never quoted, so one that is not `^[A-Za-z_][A-Za-z0-9_]*$` throws.
 */
export function secretsStdin(env: Readonly<Record<string, string>>, line: string): string {
  const assigned = Object.entries(env).map(([name, value]) => exportLine(name, value));
  return [SECRETS_SCRIPT_FIRST, ...assigned, '{', line, '', '} </dev/null', 'exit $?', SECRETS_SCRIPT_LAST, ''].join('\n');
}

// ---- the copies (E2.S1) -----------------------------------------------------------------------------------------------

/**
 * The trust line a person is SHOWN before any preparation (Copy Command, the viewer, Copy All, the folder's modal), from
 * storage's read of the SSH entry and its jump chain: the same read `connectionOptions` makes. A road that prepares
 * rebuilds it from the snapshot (`trustLineFor(ready.entity, ready.jump, …)`, E2-D5). A jump chain that cannot be
 * resolved (a loop, a missing hop) is a refusal, as it is on every road.
 */
export function shownTrustLine(plan: RemotePlan, lookup: NodeLookup): { kind: 'shown'; line: string } | { kind: 'refused'; reason: string } {
  const chain = resolveJumpChain(plan.ssh, (id) => lookup(id)?.details);
  return chain.ok ? { kind: 'shown', line: trustLineFor(plan.ssh, chain.value, plan.line) } : { kind: 'refused', reason: chain.reason };
}

/** What every copy of a linked line says beside it (parent §4.4 "Copy Command / viewer"). */
export const COPY_NOTE =
  "This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are not in it, and on the server it does not start your login shell — use Run to connect with them.";

/**
 * What a copy shows for a Terminal entry: `local` (no link, or no command: the caller's own words), `linked` (the trust
 * line from storage's read, and `COPY_NOTE`), or `refused` (why nothing is shown).
 */
export type CopiedLine =
  | { readonly kind: 'local' }
  | { readonly kind: 'linked'; readonly line: string; readonly note: string }
  | { readonly kind: 'refused'; readonly reason: string };

/** The ONE reader of "what do the copies of this entry show": Copy Command, the viewer's row and copy, and Copy All. */
export function copiedLineOf(entry: LaunchEntry, lookup: NodeLookup): CopiedLine {
  const link = sshLinkOf(entry, lookup);
  return link.kind === 'none' ? { kind: 'local' } : copyOfPlan(entry, planLaunch(entry, link, { stayOpen: false }), lookup);
}

function copyOfPlan(entry: LaunchEntry, plan: LaunchPlan, lookup: NodeLookup): CopiedLine {
  switch (plan.kind) {
    case 'remote':
      return copyOfTrustLine(shownTrustLine(plan, lookup));
    case 'refused':
      return { kind: 'refused', reason: refusalSaid(entry, plan.reason) };
    default:
      return { kind: 'local' };
  }
}

function copyOfTrustLine(shown: ReturnType<typeof shownTrustLine>): CopiedLine {
  return shown.kind === 'shown' ? { kind: 'linked', line: shown.line, note: COPY_NOTE } : { kind: 'refused', reason: shown.reason };
}

/**
 * A `{name}` refusal reads as the arrow says it (`runCommands.ts`); every other reason is `planLaunch`'s own sentence. The one reader of a
 * `refused` plan's reason: the copies and the agent's run say it the same way (E3.S2).
 */
export function refusalSaid(entry: LaunchEntry, reason: string): string {
  return reason === commandRefusal(entry) ? `"${entry.name}" will not run: ${reason}` : reason;
}

// ---- Run with Secrets over SSH (E3.S1) --------------------------------------------------------------------------------

/**
 * What `secretsLaunch` needs of `prepareSshSession`'s `ReadySsh`: structural, so a `ReadySsh` is assignable with no adapter, and it
 * reads the SNAPSHOT only (the entity, the options, the jump, the target) — never the plan's own copy of the SSH entry.
 */
export interface PreparedForSpawn {
  /** The snapshot with `sshKeyPath` set to the materialised file (a spawn always has one, E3-D4) or cleared. */
  readonly entity: EntityMetadata;
  readonly options: Pick<SshCommandOptions, 'knownHostsFile' | 'program'>;
  /** The resolved `-J` value, or undefined. */
  readonly jump: string | undefined;
  /** The relay prefix: a spawn has none, so a session that has one is not for this road. */
  readonly prefix: string | undefined;
  /** The askpass environment of a password session; `undefined` for a key. */
  readonly env: Readonly<Record<string, string>> | undefined;
  /** `describeSshTarget`; `undefined` when the entity has no host. */
  readonly target: string | undefined;
}

export type SecretsLaunch =
  | { readonly kind: 'spawn'; readonly argv: readonly string[]; readonly target: string }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * The sentence for a Run with Secrets over SSH started from a window that is not a local one (E3-D6): the extension host spawns
 * on THIS machine, and a WSL or Remote-SSH window's preparation is composed for another shell.
 */
export function secretsLocalOnly(name: string): string {
  return `Run with Secrets over SSH works only in a local VS Code window, and this window is not one. Nothing was run: open "${name}" from a local window.`;
}

/**
 * The argv of the `ssh` child of Run with Secrets (E3.S1, rows K1-K3), after its program word: `buildSshExecArgv` with the remote
 * login shell reading the script (`SECRETS_REMOTE_COMMAND`, last, after `--` and the destination), `-T` as its first word (ssh asks for no pty,
 * also when the person's config says `RequestTTY force`: D16), no `-t`, and no value anywhere in it (D12). `ownAgent` is
 * `SpawnLaunch.ownAgent`: whether the extension's own agent serves the run; an entry that forwards with no agent of ours sends no `-A`
 * and `-o ForwardAgent=no` (D17 (b)), so the banner that says nothing is forwarded is true. The key branch says `-o BatchMode=yes`, the password branch `-o NumberOfPasswordPrompts=1` (askpass answers, nothing is
 * read from stdin), and both `-o ConnectTimeout=10` (E3-D11 (a): what we ASK ssh; hand check 3 observes the effect).
 *
 * <p>A prepared session with a relay `prefix` or a client `program` was composed for another shell (a WSL or Remote-SSH window):
 * it is refused as not local (K1), fail closed, though a local window never produces one. It reads the prepared snapshot only (one
 * snapshot): the trust line, this argv, the spawn program's folder and the banner's target all come from the same `ready`.</p>
 */
export function secretsLaunch(plan: RemotePlan, prepared: PreparedForSpawn, ownAgent: boolean): SecretsLaunch {
  if (composedForAnotherShell(prepared)) {
    return { kind: 'refused', reason: secretsLocalOnly(plan.entryName) };
  }
  const argv = secretsArgv(prepared, ownAgent);
  return argv === undefined || prepared.target === undefined ? { kind: 'refused', reason: noHostSentence(plan.sshName) } : { kind: 'spawn', argv, target: prepared.target };
}

/** A relay prefix or a client program word: what a WSL or Remote-SSH window's preparation adds. */
function composedForAnotherShell(prepared: PreparedForSpawn): boolean {
  return prepared.prefix !== undefined || prepared.options.program !== undefined;
}

function secretsArgv(prepared: PreparedForSpawn, ownAgent: boolean): string[] | undefined {
  const auth = prepared.env === undefined ? 'key' : 'askpass';
  return buildSshExecArgv(prepared.entity, prepared.entity.sshKeyPath, SECRETS_REMOTE_COMMAND, auth, {
    jump: prepared.jump,
    knownHostsFile: prepared.options.knownHostsFile,
    ownAgent,
    noTty: true,
  });
}

/**
 * The line the remote login shell runs, with each `creds://` reference read from the POSIX environment (`"$CREDS_REF_n"`; the remote
 * shell is POSIX, D9). It is the trust line's line (`plan.line`, E3-D2): what the person approved is what runs, except that each
 * reference became its read.
 */
export function secretsRemoteLine(plan: RemotePlan, refs: RefPlan): string {
  return rewriteRefs(plan.line, refs, 'linux');
}

/**
 * What the masked terminal of Run with Secrets over SSH says before any output (E3.0 texts). `shortValuesCaveat` names the values
 * too short to mask, as the local banner does.
 */
export function secretsOverSshBanner(target: string, secrets: readonly { value: string; label: string }[]): string {
  return (
    `Over SSH to ${target}. The values go to the remote login shell on its standard input, never on a command line, and are replaced with ` +
    `<CREDS_MASKED:NAME> in what it prints here.${shortValuesCaveat(secrets)} This run is not interactive: there is no terminal, and the command reads an empty ` +
    'input, so a command that asks a question usually stops. To answer questions, use Run in Terminal instead; the values are not injected there.'
  );
}

/**
 * The whole banner (E3-D12): `described` (which reference is which), then `Note: <warning>.` only when the launch has a warning
 * (a toast would race the run and could be closed unread), then the secrets text, joined with CRLF and with no trailing break.
 */
export function maskedOverSshBanner(described: string, warning: string | undefined, target: string, secrets: readonly { value: string; label: string }[]): string {
  const note = warning === undefined ? [] : [`Note: ${warning}.`];
  return [described, ...note, secretsOverSshBanner(target, secrets)].join('\r\n');
}
