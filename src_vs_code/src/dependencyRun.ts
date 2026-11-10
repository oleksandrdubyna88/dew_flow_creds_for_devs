import { EntityMetadata } from './types';
import { commandRefusal, shownCommandLine } from './commandLine';
import { LaunchPlan, NodeLookup, RemotePlan, SshLink, planLaunch, sshLinkOf, sshLinkRefusal } from './remoteLaunch';
import { escapeControl } from './transitSecretReport';
import { USES_CONFIG, usesConfig } from './vpnLauncher';

/**
 * WHAT runs before an entry is used, in which order, and what each outcome means (issue #103) —
 * the pure half. The host half (`dependencyRunHost.ts`) only opens the terminal and waits.
 *
 * <p>`dependsOn` was an annotation: a tint in the tree, one hop, cycles allowed on purpose
 * (`depGraph.ts`). An entry that ticks *Execute what is executable first* turns its OWN edges into
 * an execution chain, and a chain needs everything an annotation could do without: an order, a
 * cycle refusal, a depth bound, and an answer for an id that no longer exists.</p>
 *
 * <ul>
 *   <li><b>Executable</b> means a Terminal entry with a command. Everything else a dependency list
 *       can name — a VPN, a credential, a host — is still an annotation and is passed over.</li>
 *   <li>A dependency's OWN dependencies are followed only when it asks for the same. That is the
 *       owner's example exactly: VPN → "start openvpn" (execute) → "install openvpn".</li>
 *   <li>Dependencies first (post-order), each entry once, whichever path reached it first.</li>
 *   <li>A cycle, a chain deeper than {@link MAX_CHAIN_DEPTH}, a step that may not run in this window
 *       (its OS), a step whose `{name}` cannot be filled, or a step that asks for `{config}` refuses the WHOLE run before anything starts. A
 *       dangling id is not a refusal — it is reported as missing, and the person decides.</li>
 * </ul>
 */

/**
 * How deep a chain may go. Not a performance bound — the walk is linear — but a statement about
 * people: nobody writes a sixteen-step install chain on purpose, so one that deep is almost
 * certainly a vault that synced into a shape nobody meant, and refusing it costs a real chain nothing.
 * `resolveJumpChain` bounds SSH hops the same way.
 */
export const MAX_CHAIN_DEPTH = 16;

export interface RunStep {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly terminalOs?: string;
  /**
   * Set for a step linked to an SSH entry (E2.S3). `line` stays the person's line until the host replaces it by the
   * trust line (shown and trusted); `remote.line` is always the person's line, `remote.remoteCommand` the BARE line (D11).
   */
  readonly remote?: RemotePlan;
}

export type RunPlan =
  | { ok: true; steps: RunStep[]; missing: string[] }
  | { ok: false; reason: string };

type NodeOf = (id: string) => EntityMetadata | undefined;

/** Why a step may not run in this window (its OS), or `undefined` — the host answers from `entryShell`. */
export type StepRefusal = (name: string, terminalOs: string | undefined) => string | undefined;

interface Walk {
  readonly nodeOf: NodeOf;
  readonly refusalOf: StepRefusal;
  readonly exclude: ReadonlySet<string>;
  readonly steps: RunStep[];
  readonly seen: Set<string>;
  readonly missing: string[];
  /** The vault, for a step's SSH link (E2.S3). Absent for an agent's start: a linked step then refuses the whole chain. */
  readonly lookup?: NodeLookup;
  refusal?: string;
}

/**
 * The steps to run before `roots` are used — `exclude` names entries that will run anyway as the
 * main action (a VPN's launcher), so they are never run twice.
 *
 * <p>Several roots because a VPN with a launcher has two sources of dependencies: its own, when it
 * asks, and its launcher's, when the launcher asks.</p>
 */
export function planDependencyRun(
  roots: readonly EntityMetadata[],
  nodeOf: NodeOf,
  refusalOf: StepRefusal,
  exclude: ReadonlySet<string> = new Set(),
  lookup?: NodeLookup,
): RunPlan {
  const walk: Walk = { nodeOf, refusalOf, exclude, steps: [], seen: new Set(), missing: [], lookup };
  roots.filter((root) => root.runDependencies === true).forEach((root) => visitEdges(walk, root, [root.id]));
  return walk.refusal === undefined ? { ok: true, steps: walk.steps, missing: walk.missing } : { ok: false, reason: walk.refusal };
}

function visitEdges(walk: Walk, from: EntityMetadata, path: readonly string[]): void {
  for (const id of from.dependsOn ?? []) {
    visit(walk, id, path);
  }
}

function visit(walk: Walk, id: string, path: readonly string[]): void {
  if (settled(walk, id)) {
    return;
  }
  walk.refusal = pathRefusal(walk, id, path);
  if (walk.refusal !== undefined) {
    return;
  }
  const node = walk.nodeOf(id);
  if (node === undefined) {
    walk.seen.add(id);
    walk.missing.push(id);
    return;
  }
  visitNode(walk, node, path);
}

/** Nothing more to do for `id`: the run is already refused, or `id` was reached before. */
function settled(walk: Walk, id: string): boolean {
  return walk.refusal !== undefined || walk.seen.has(id);
}

function pathRefusal(walk: Walk, id: string, path: readonly string[]): string | undefined {
  if (path.includes(id)) {
    const names = [...path.slice(path.indexOf(id)), id].map((step) => walk.nodeOf(step)?.name ?? step);
    return `These entries depend on each other in a circle, so there is no order to run them in: ${names.join(' → ')}.`;
  }
  return path.length > MAX_CHAIN_DEPTH
    ? `The chain of dependencies is deeper than ${MAX_CHAIN_DEPTH} steps — refused rather than followed.`
    : undefined;
}

function visitNode(walk: Walk, node: EntityMetadata, path: readonly string[]): void {
  const line = executableLine(node);
  if (line === undefined) {
    walk.seen.add(node.id); // an annotation, not a step: not followed any further
    return;
  }
  if (node.runDependencies === true) {
    visitEdges(walk, node, [...path, node.id]);
  }
  walk.seen.add(node.id);
  addStep(walk, node, line);
}

/**
 * An excluded entry is the caller's main action (a VPN's launcher, which the owner's example ALSO
 * lists as a dependency): its own dependencies still run, but it is neither a step nor judged as one
 * — its `{config}` is exactly what the launcher path fills in.
 */
function addStep(walk: Walk, node: EntityMetadata, line: string): void {
  if (walk.exclude.has(node.id)) {
    return;
  }
  const link = walk.lookup === undefined ? NO_LINK : sshLinkOf(node, walk.lookup);
  if (link.kind === 'none') {
    addLocalStep(walk, node, line);
  } else {
    addLinkedStep(walk, node, link);
  }
}

/** Only a road with a vault to look in (`walk.lookup`) reads a link: an agent's start keeps `stepRefusal`'s E1 sentence. */
const NO_LINK: SshLink = { kind: 'none' };

function addLocalStep(walk: Walk, node: EntityMetadata, line: string): void {
  walk.refusal ??= stepRefusal(walk, node, line);
  walk.steps.push({ id: node.id, name: node.name, line, terminalOs: node.terminalOs });
}

/**
 * A step linked to an SSH entry (E2.S3, lead amendment A3). It runs as the BARE line (`stayOpen: false`, D11), so the step
 * ends and its exit code reaches the chain. Which local checks apply to it, and why:
 *
 * | Check | Linked step | Why |
 * |---|---|---|
 * | the `{name}` rule (`nameStepRefusal`, then `planLaunch`) | applies | it is about the entry's name, not the shell |
 * | a control character or line break in the line (`planLaunch` P6) | applies | one remote command cannot carry it |
 * | a Windows remote (`planLaunch` D9) | applies | a Windows remote is not supported yet |
 * | `{config}` | applies | the config is a file on THIS machine |
 * | `walk.refusalOf`, the local OS and shell (D14) | does NOT apply | *Runs on* names the remote; the local shell is SSH Connect's |
 *
 * The step keeps the person's line in `line` and `remote.line`; the host shows and trusts the trust line instead.
 */
function addLinkedStep(walk: Walk, node: EntityMetadata, link: SshLink): void {
  const plan = planLaunch(node, link, { stayOpen: false });
  walk.refusal ??= nameStepRefusal(node) ?? linkedRefusal(node, plan);
  const step = { id: node.id, name: node.name, terminalOs: node.terminalOs };
  walk.steps.push(plan.kind === 'remote' ? { ...step, line: plan.line, remote: plan } : { ...step, line: '' });
}

function linkedRefusal(node: EntityMetadata, plan: LaunchPlan): string | undefined {
  if (plan.kind === 'refused') {
    return plan.reason;
  }
  return plan.kind === 'remote' && usesConfig(plan.line) ? configRefusal(node) : undefined;
}

function configRefusal(node: EntityMetadata): string {
  return `"${node.name}" ${USES_CONFIG}. Pick it as the VPN's launcher there instead of running it as a dependency.`;
}

/**
 * A step that cannot run here: linked to an SSH entry on a road with no vault to look in (said first), written for another system, or asking for `{config}` — which only a
 * VPN's *Started by* fills in. Run as a plain dependency it would be typed literally (the owner's
 * example entered through Depends on alone), so it is refused with the way to do it instead.
 */
function stepRefusal(walk: Walk, node: EntityMetadata, line: string): string | undefined {
  // The link comes first: a linked step always says the one shared sentence, whatever its line holds (E1 code round 2).
  const linked = sshLinkRefusal(node);
  if (linked !== undefined) {
    return linked;
  }
  if (usesConfig(line)) {
    return configRefusal(node);
  }
  return nameStepRefusal(node) ?? walk.refusalOf(node.name, node.terminalOs);
}

/** A step whose `{name}` cannot be filled refuses the whole chain, with the reason. */
function nameStepRefusal(node: EntityMetadata): string | undefined {
  const reason = commandRefusal(node);
  return reason === undefined ? undefined : `"${node.name}" cannot run as a dependency: ${reason}`;
}

/**
 * The line a dependency runs, or `undefined` when it is not something that runs. `{name}` is resolved; a refused
 * name answers the TEMPLATE, never `undefined`, which means "an annotation", "no command" and "not pickable".
 */
export function executableLine(node: EntityMetadata): string | undefined {
  if (node.isTerminal !== true) {
    return undefined;
  }
  const line = shownCommandLine(node);
  return line.length > 0 ? line : undefined;
}

/** A step whose SSH connection signs in with a password is refused: the chain's one terminal has one environment. */
export function passwordStepRefusal(stepName: string, sshName: string): string {
  return `"${stepName}" runs over the SSH connection "${sshName}", which signs in with a password. A dependency step cannot, because the chain's one terminal has one environment. Use a key for "${sshName}", or run "${stepName}" with its own arrow.`;
}

/** A linked step whose prepared connection no longer gives the line the dialog showed: not run. */
export function changedStepRefusal(stepName: string): string {
  return `The SSH connection of "${stepName}" changed while the dialog was open — run it again.`;
}

/** What every modal that vouches for several lines at once says last. */
export const READ_EACH_LINE =
  'A command can arrive by sync or an accepted share. Read each line — once you run them, these exact lines are not asked about again on this machine.';

/**
 * The pre-run modal: every step in order with its line, the shell they run in, every dependency
 * that no longer exists and how to clear it — and the same two warnings the single-line trust modal
 * gives, because one click here trusts every line in it.
 *
 * <p>`ownerIsFolder`: a folder has no Depends on of its own, so a missing row is cleared in the entry that lists it.</p>
 *
 * <p>A name or a line arrives by sync or share and this one click vouches for all of them, so what is SHOWN goes through
 * `escapeControl`: a name cannot draw a row of its own. What is typed is `step.line`, untouched, on every road that asks here.</p>
 */
export function describeRunPlan(
  ownerName: string,
  steps: readonly RunStep[],
  missing: readonly string[],
  shellName: string,
  ownerIsFolder = false,
): string {
  const lines = steps.map((step, i) => `${i + 1}. ${escapeControl(step.name)}: ${escapeControl(step.line)}`);
  return (
    `Before "${escapeControl(ownerName)}", these run in ${shellName}, in order, each waiting for the one before:\n\n${lines.join('\n')}` +
    missingNote(ownerName, missing, ownerIsFolder) +
    `\n\n${READ_EACH_LINE}`
  );
}

function missingNote(ownerName: string, missing: readonly string[], ownerIsFolder: boolean): string {
  if (missing.length === 0) {
    return '';
  }
  const what = missing.length === 1 ? 'A dependency no longer exists' : `${missing.length} dependencies no longer exist`;
  const fix = ownerIsFolder
    ? 'edit the entry that lists the missing row under Depends on, and remove that row.'
    : `edit "${escapeControl(ownerName)}" and remove the missing row under Depends on.`;
  return `\n\n${what} and cannot run. To stop being asked, ${fix}`;
}

/** What to do after a step: go on, ask the person, or stop. */
export type StepVerdict = { kind: 'next' } | { kind: 'ask'; question: string } | { kind: 'stop'; reason: string };

/**
 * A step's outcome, judged.
 *
 * <p>A non-zero exit ASKS rather than stops: an installer that finds its tool already installed
 * commonly exits non-zero (`winget` does, with "no applicable upgrade"), and a hard stop there
 * would block the owner's own chain on every start after the first. The person sees the code and
 * decides; dismissing the question stops, it never continues.</p>
 */
export function stepVerdict(stepName: string, exitCode: number | undefined | 'closed'): StepVerdict {
  if (exitCode === 0) {
    return { kind: 'next' };
  }
  if (exitCode === 'closed') {
    return { kind: 'stop', reason: `The terminal was closed while "${stepName}" was running — nothing after it ran.` };
  }
  return {
    kind: 'ask',
    question:
      exitCode === undefined
        ? `"${stepName}" finished, but its shell did not report an exit code. Continue if it succeeded.`
        : `"${stepName}" exited with code ${exitCode}. Continue anyway (an installer that finds the tool already there often does this), or stop here?`,
  };
}
