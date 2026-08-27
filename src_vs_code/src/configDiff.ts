import { ConfigFormat } from './configFormat';
import { configFields } from './configFields';

/**
 * What changed between two versions of a config — by KEY, not by line.
 *
 * <p>"The config changed" is the answer a sync gives today, and it is the answer that makes a
 * shared config something you accept rather than something you review. A colleague added a
 * connection string, or moved a port, or removed a feature flag you were relying on; those are
 * three different days, and a line diff of a reformatted document tells you none of them.</p>
 *
 * <p>Keyed on the same `:` paths the Fields tab and the .NET provider use, so what this reports
 * and what an application reads are the same names. Values are compared as text — a config is
 * text, and `5432` becoming `"5432"` is a change worth seeing rather than one to normalise
 * away.</p>
 *
 * <p>Free of `vscode`. A diff whose rules are a unit test is a diff somebody can trust when it
 * says nothing changed.</p>
 */

export type ConfigChangeKind = 'added' | 'removed' | 'changed';

export interface ConfigChange {
  readonly kind: ConfigChangeKind;
  readonly path: string;
  /** Absent for an addition. */
  readonly before?: string;
  /** Absent for a removal. */
  readonly after?: string;
}

/**
 * Every key that differs, in a stable order: additions, removals, then changes.
 *
 * <p>Grouped rather than interleaved because the three are read for different reasons — what is
 * new, what is gone, what moved — and a reader scanning for one of them should not have to
 * filter the other two out by eye.</p>
 *
 * <p>Returns an empty list when either side cannot be parsed. That is deliberate: a diff computed
 * from half a document would report every key as removed, which is a frightening and false way to
 * say "this does not parse". The caller has `describeConfigProblem` for that.</p>
 */
export function diffConfigs(format: ConfigFormat, before: string, after: string): ConfigChange[] {
  const from = valuesByPath(format, before);
  const to = valuesByPath(format, after);
  if (from === undefined || to === undefined) {
    return [];
  }
  return [...added(from, to), ...removed(from, to), ...changed(from, to)];
}

/**
 * One value as the comparison sees it: the text, and how it was written.
 *
 * <p>The encoding is part of the identity, not decoration. `configFields` DECODES a value, so
 * `5432` and `"5432"` both arrive as the text `5432` — and a diff comparing only that reports no
 * change for an edit that turns a number into a string. One binds to an int property and the
 * other may not, so it is exactly the kind of change somebody needs to see. Found by a test that
 * asserted it and went red.</p>
 */
interface Valued {
  readonly value: string;
  readonly encoding: string;
}

type ValueMap = ReadonlyMap<string, Valued>;

function added(from: ValueMap, to: ValueMap): ConfigChange[] {
  return [...to]
    .filter(([path]) => !from.has(path))
    .map(([path, after]) => ({ kind: 'added' as const, path, after: after.value }));
}

function removed(from: ValueMap, to: ValueMap): ConfigChange[] {
  return [...from]
    .filter(([path]) => !to.has(path))
    .map(([path, before]) => ({ kind: 'removed' as const, path, before: before.value }));
}

function changed(from: ValueMap, to: ValueMap): ConfigChange[] {
  return [...from]
    .filter(([path, before]) => differs(before, to.get(path)))
    .map(([path, before]) => ({
      kind: 'changed' as const,
      path,
      before: before.value,
      after: to.get(path)?.value,
    }));
}

function differs(before: Valued, after: Valued | undefined): boolean {
  return after !== undefined && (after.value !== before.value || after.encoding !== before.encoding);
}

/**
 * The document as path → value, or `undefined` when it does not parse.
 *
 * <p>An EMPTY document parses to an empty map rather than to nothing, which is what makes "a
 * config that was filled in" report every key as added instead of reporting nothing at all.</p>
 */
function valuesByPath(format: ConfigFormat, body: string): ValueMap | undefined {
  if (body.trim().length === 0) {
    return new Map();
  }
  const fields = configFields(format, body);
  return fields === undefined
    ? undefined
    : new Map(fields.map((field) => [field.path, { value: field.value, encoding: field.encoding }]));
}

/**
 * One line per change, for a notification or a log.
 *
 * <p>VALUES ARE NOT INCLUDED. A config holds connection strings and passwords, and this text goes
 * to places a config body deliberately does not — a toast, an output channel, a line somebody
 * screenshots. Which keys moved is the reviewable half and carries no secret; what they moved to
 * is in the entry, behind the same door as everything else.</p>
 */
export function describeChanges(changes: readonly ConfigChange[]): string {
  if (changes.length === 0) {
    return 'No keys changed.';
  }
  return changes.map((change) => `${VERB[change.kind]} ${change.path}`).join('\n');
}

const VERB: Readonly<Record<ConfigChangeKind, string>> = {
  added: '+',
  removed: '−',
  changed: '~',
};

/** A one-line summary for a notification, where three counts fit and a list does not. */
export function summarizeChanges(changes: readonly ConfigChange[]): string {
  const counts = (['added', 'removed', 'changed'] as const)
    .map((kind) => [kind, changes.filter((change) => change.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`);
  return counts.length === 0 ? 'no keys changed' : counts.join(', ');
}
