/**
 * The size ratchet (tails T3): a file exempted from the 800-line ceiling may shrink, never grow.
 *
 * <p>The ceiling failed once at its actual job. It was written to stop the next 3,000-line file,
 * and `extension.ts` — the file it was written about — went from 3,078 lines to 5,684 in two
 * days with the rule's blessing, behind an `eslint-disable` at its own line 1. A limit that can
 * be disabled and then grown behind the disable is advice; this makes the disable a FREEZE. The
 * baseline is checked in; `npm run ratchet` fails when an exempted file is larger than its
 * baseline, and tells you to lower the baseline when it is smaller.</p>
 *
 * <p>Pure: the comparison takes a baseline and measured sizes, and returns verdicts. The script
 * that reads files is `scripts/size-ratchet.mjs`.</p>
 */

export interface RatchetVerdict {
  readonly file: string;
  readonly baseline: number;
  readonly actual: number;
  readonly state: 'ok' | 'grew' | 'shrank' | 'unlisted';
  readonly message: string;
}

export function ratchet(
  baseline: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): RatchetVerdict[] {
  const verdicts: RatchetVerdict[] = [];
  for (const [file, limit] of Object.entries(baseline)) {
    const lines = actual[file];
    if (lines === undefined) {
      verdicts.push({ file, baseline: limit, actual: 0, state: 'unlisted', message: `${file} is in the baseline but was not measured — deleted? remove it from .size-baseline.json` });
    } else {
      verdicts.push(verdictFor(file, limit, lines));
    }
  }
  return verdicts;
}

function verdictFor(file: string, limit: number, lines: number): RatchetVerdict {
  if (lines > limit) {
    return { file, baseline: limit, actual: lines, state: 'grew', message: `${file} grew: ${lines} lines against a baseline of ${limit}. An exempted file may shrink, never grow — extract, do not raise the number.` };
  }
  if (lines < limit) {
    return { file, baseline: limit, actual: lines, state: 'shrank', message: `${file} shrank to ${lines} (baseline ${limit}) — lower the baseline so it cannot grow back: npm run ratchet -- --update` };
  }
  return { file, baseline: limit, actual: lines, state: 'ok', message: `${file}: ${lines} lines, at baseline` };
}

/** The baseline as it should be rewritten after a shrink: the smaller of the two, per file. */
export function tightened(
  baseline: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(baseline).map(([file, limit]) => [file, Math.min(limit, actual[file] ?? limit)]),
  );
}
