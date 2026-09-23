import { EntityMetadata } from './types';
import { buildCommandLine } from './commandLine';
import { osMismatch } from './hostShell';

/**
 * WHAT runs before an entry is used, and in which order (issue #103) — the pure half.
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
 *   <li>A cycle, a chain deeper than {@link MAX_CHAIN_DEPTH}, or a step written for another OS
 *       refuses the WHOLE run before anything starts. A dangling id is not a refusal — it is
 *       reported as missing, and the person decides (the host asks).</li>
 * </ul>
 */

export const MAX_CHAIN_DEPTH = 16;

export interface RunStep {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly terminalOs?: string;
}

export type RunPlan =
  | { ok: true; steps: RunStep[]; missing: string[] }
  | { ok: false; reason: string };

type NodeOf = (id: string) => EntityMetadata | undefined;

interface Walk {
  readonly nodeOf: NodeOf;
  readonly platform: NodeJS.Platform;
  readonly steps: RunStep[];
  readonly seen: Set<string>;
  readonly missing: string[];
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
  platform: NodeJS.Platform,
  exclude: ReadonlySet<string> = new Set(),
): RunPlan {
  const walk: Walk = { nodeOf, platform, steps: [], seen: new Set(), missing: [] };
  roots.filter((root) => root.runDependencies === true).forEach((root) => visitEdges(walk, root, [root.id]));
  if (walk.refusal !== undefined) {
    return { ok: false, reason: walk.refusal };
  }
  return { ok: true, steps: walk.steps.filter((step) => !exclude.has(step.id)), missing: walk.missing };
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
  walk.refusal ??= osMismatch(node.name, node.terminalOs, walk.platform);
  walk.steps.push({ id: node.id, name: node.name, line, terminalOs: node.terminalOs });
}

/** The line a dependency runs, or `undefined` when it is not something that runs. */
export function executableLine(node: EntityMetadata): string | undefined {
  if (node.isTerminal !== true) {
    return undefined;
  }
  const line = buildCommandLine(node.command ?? '', node.commandArgs);
  return line.length > 0 ? line : undefined;
}

/**
 * The one sentence the pre-run modal shows: every step in order, and every dependency that no
 * longer exists — named, so a missing prerequisite is a decision rather than a silent skip.
 */
export function describeRunPlan(ownerName: string, steps: readonly RunStep[], missing: readonly string[]): string {
  const lines = steps.map((step, i) => `${i + 1}. ${step.name}: ${step.line}`);
  const gone =
    missing.length === 0
      ? ''
      : `\n\nMissing — ${missing.length === 1 ? 'a dependency no longer exists' : `${missing.length} dependencies no longer exist`} and cannot run: ${missing.join(', ')}.`;
  return `Before "${ownerName}", these run in order, each waiting for the one before:\n\n${lines.join('\n')}${gone}`;
}
