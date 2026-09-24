/**
 * "a, b and c" — an Oxford-less list, because these are sentences and not bullet lists.
 *
 * <p>One helper for every sentence that names several things: it was written out three times
 * (`paymentFormSwitch.ts`, `generalNotes.ts`, and #122's `exportScope.ts`), and the reuse-first
 * review of #122 moved it here rather than let a fourth appear.</p>
 */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
