import { parseForward } from './sshOptions';
import { PortForward } from './types';

/**
 * Rows off the save payload: dependencies and port forwards, each with its own shape check.
 *
 * <p>Moved here VERBATIM when `entityFormPanel.ts` reached the repository's 800-line ceiling and the
 * ninth entry kind needed room. The rule there is to extract rather than suppress — and this family
 * is the natural seam: every function below reads an `unknown` that crossed a `postMessage` boundary
 * and turns it into a typed row, with no view of the panel, the webview or `vscode`.</p>
 *
 * <p>(The first attempt at this extraction rewrote a different block from memory instead of moving
 * it, and invented an API that did not exist. Hence: verbatim.)</p>
 */
/**
 * The agent-access switches as the webview posts them.
 *
 * <p>`undefined` is a real answer here and not a missing one: it means the entry still follows
 * its folder. Anything else is read defensively like every other row on this boundary, and the
 * ladder in `mcpAccess.ts` normalises it afterwards.</p>
 */
export function readDependsOnRows(data: Record<string, unknown>): { targetId: string; color: string }[] {
  const raw = data.dependsOn;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row) => dependencyFromRow(row)).filter((row) => row !== undefined);
}

function dependencyFromRow(row: unknown): { targetId: string; color: string } | undefined {
  const r = asRecord(row);
  const targetId = stringOr(r?.targetId, '');
  return targetId === '' ? undefined : { targetId, color: stringOr(r?.color, '') };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * The forwarding rows as the webview posts them.
 *
 * <p>Read defensively and validated by the same function the command builders use: a row that
 * does not parse is DROPPED rather than stored, because a stored rule that cannot be rendered is
 * a rule that silently does nothing on every future connection.</p>
 */
export function readForwardRows(data: Record<string, unknown>): PortForward[] {
  const raw = data.portForwards;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row) => forwardFromRow(row))
    .filter((forward): forward is PortForward => forward !== undefined);
}

/** One posted row, validated by the same parser the command builders use. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (a webview payload is read defensively, field by field); splitting reads worse
function forwardFromRow(row: unknown): PortForward | undefined {
  if (typeof row !== 'object' || row === null) {
    return undefined;
  }
  const r = row as Record<string, unknown>;
  const kind = r.kind === 'remote' ? 'remote' : 'local';
  const parsed = typeof r.rule === 'string' ? parseForward(kind, r.rule) : undefined;
  return parsed === undefined
    ? undefined
    : { ...parsed, disabled: r.disabled === true ? true : undefined };
}
