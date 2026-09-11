/**
 * Whether THIS engine names a position for this body at all.
 *
 * <p>V8 has two `JSON.parse` message shapes and only one carries a position; which one you get
 * depends on the engine, and the 2026-09-09 audit watched two assertions fail under Node 20 while
 * passing under Node 24 (finding #8).</p>
 *
 * <p>Relaxing those assertions to "the right line OR none" was the obvious move and the wrong one —
 * a reviewer pointed out it would pass a regression that stopped extracting lines entirely. Asking
 * the engine what it actually said keeps them strict wherever an answer exists and silent only
 * where none does.</p>
 *
 * <p>One copy, imported by both suites: each had its own until the review gate observed that two
 * copies of a regex over an engine's error text is two things to update when that text changes,
 * and nothing notices the one that was missed.</p>
 */
export function enginePositions(body: string): boolean {
  try {
    JSON.parse(body);
    return false;
  } catch (error) {
    return /\bline \d+/i.test((error as Error).message);
  }
}
