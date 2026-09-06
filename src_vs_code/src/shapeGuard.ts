/**
 * A field-by-field shape check for a JSON document a server answered with.
 *
 * <p>The pattern `serverMetricsPage.ts` uses for one shape, made reusable for the corporate
 * surface, which has five. Written as data rather than a chain of `typeof` because a chain of
 * eleven `&&` is a function the complexity ceiling refuses and a reviewer cannot scan; a table of
 * field → kind is both.</p>
 *
 * <p>A newer server may ADD fields — they pass unremarked. It may never drop or retype one of
 * these, which is exactly what a shape check is for: a document this build cannot read must
 * become a sentence at the edge, not an `undefined` three layers later.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

export type FieldKind = 'string' | 'number' | 'boolean' | 'array';

export function hasShape(value: unknown, shape: Readonly<Record<string, FieldKind>>): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return Object.entries(shape).every(([field, kind]) => (kind === 'array' ? Array.isArray(v[field]) : typeof v[field] === kind));
}
