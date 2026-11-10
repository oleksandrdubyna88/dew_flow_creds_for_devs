import { EntityMetadata, TreeNode } from './types';
import { resolveCommand } from './commandLine';
import { resolveKind } from './entityKind';
import { HostShell, asOsName, isWindowsPowerShell51, quoteFor } from './hostShell';
import { SshCommandOptions, buildSshCommand, isSafeSshTarget, noHostSentence, portArgv, sshDestination, withAcceptNew } from './sshCommand';
import { sshOptionArgv } from './sshOptions';
import { isInTrash } from './trash';

/**
 * The ONE road from a Terminal entry and its SSH link to a launch (E1.S2 of PLAN_terminal_command_over_ssh.md; spec
 * `todo/PLAN_terminal_command_over_ssh_E1_S2_spec.md`). Pure (it imports no editor API), so every row of the decision tables is a unit
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
 * answer is the sentence, and that includes an entry that is linked to a valid, live SSH target: in E1 no road runs a
 * linked entry over SSH yet, so even a perfectly good link gets the sentence. The decision is made WITHOUT a lookup
 * (`sshLinkOf` is asked with one that finds nothing), so it never depends on whether the target exists; "is this entry
 * linked" has ONE reader, and `undefined` is never "linked but fine".</p>
 *
 * <p>Moved here from `sshLinkGate.ts` with its name and signature unchanged (S2-D7). E2 and E3 replace each caller by
 * `planLaunch`, road by road.</p>
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
      /** The ONE remote argument: the bare line, or the stay-open wrapper. */
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
  return { kind: 'remote', ssh: link.ssh, sshName: link.sshName, entryName: entry.name, line, remoteCommand: options.stayOpen ? stayOpenWrapper(line) : line };
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

/**
 * `line` run as ONE script by the remote login shell's `-c`, then the failure said and that shell started: `eval 'L'`
 * with every `'` of the line written `'\''`. The text holds NO `"` of its own (a double quote would meet the Windows
 * PowerShell 5.1 refusal on every launch), and a trailing `# comment` or `&` in the line ends with the eval, not the
 * wrapper. `exit` in the line ends the session (accepted, as in the parent plan).
 */
export function stayOpenWrapper(line: string): string {
  const quoted = line.replace(/'/g, `'\\''`);
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

type RemotePlan = Extract<LaunchPlan, { kind: 'remote' }>;

/** Windows PowerShell 5.1 wraps a native argument with a space in `"…"` and escapes no inner `"`: a known-wrong parse is refused. */
function powerShell51Refusal(plan: RemotePlan, localShell: HostShell): string | undefined {
  const bad = plan.remoteCommand.includes('"') || plan.remoteCommand.endsWith('\\');
  return bad && isWindowsPowerShell51(localShell.shellPath)
    ? `This terminal is Windows PowerShell 5.1, which cannot pass a double quote or a trailing backslash to ssh correctly. Install PowerShell 7 (pwsh) and run "${plan.entryName}" again.`
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

/**
 * The ONE remote command of Run with Secrets: the remote LOGIN shell reads the script from stdin (D12, epoch 2). It is the
 * shell that parses the line on every other road, so a line written for the person's own shell (bash `[[ ]]`, `$'…'`)
 * parses here as it does there; a plain `sh -s` is dash on Debian and Ubuntu and failed such a line with 127 (measured).
 * The text holds `"`: a road that types it into Windows PowerShell 5.1 meets that refusal, and the secrets road spawns ssh with no shell (D12).
 */
export const SECRETS_REMOTE_COMMAND = '"${SHELL:-sh}" -s';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function exportLine(name: string, value: string): string {
  if (!ENV_NAME.test(name)) {
    throw new Error('secretsStdin: a name is not a valid variable name (letters, digits and underscore, not starting with a digit)');
  }
  return `${name}=${quoteFor('posix', value)}; export ${name}`;
}

/**
 * The script `SECRETS_REMOTE_COMMAND` (the remote login shell's `-s`) reads on stdin for Run with Secrets: each value assigned and exported in two steps (so a
 * value is never parsed as syntax), then the line in a `{ … } </dev/null` group (a command that reads stdin reads end of
 * input, not the rest of this script), then `exit $?`. The blank line after the line is deliberate: a line ending in `\`
 * continues onto it, not onto `}`. A name is never quoted, so one that is not `^[A-Za-z_][A-Za-z0-9_]*$` throws.
 */
export function secretsStdin(env: Readonly<Record<string, string>>, line: string): string {
  const exports = Object.entries(env).map(([name, value]) => exportLine(name, value));
  return [...exports, '{', line, '', '} </dev/null', 'exit $?', ''].join('\n');
}
