import { MaskTable } from './secretMasker';

/** Split on either line ending, spelled from a char code so no editing layer eats the escape. */
const LINE_BREAK = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');

function splitLines(text: string): string[] {
  return text.split(LINE_BREAK);
}

/** Record one needle's occurrences on one line, keeping the FIRST line it was seen on. */
function countOnLine(
  byLabel: Map<string, { line: number; count: number }>,
  lineText: string,
  needle: string,
  label: string,
  lineNumber: number,
): void {
  const count = lineText.split(needle).length - 1;
  if (count === 0) {
    return;
  }
  const seen = byLabel.get(label);
  if (seen === undefined) {
    byLabel.set(label, { line: lineNumber, count });
    return;
  }
  seen.count += count;
}

/**
 * Finding vault secrets in text a person is about to hand somewhere else.
 *
 * <p><b>Why this shape and not a clipboard watcher.</b> The feature originally asked for was
 * a filter over the clipboard: catch a secret on its way into an AI chat. VS Code exposes no
 * clipboard-change event at all — there is nothing to subscribe to — and on Windows the
 * clipboard's contents are captured by Clipboard History at the moment of the copy, before
 * any extension could react. `secretClipboard.ts` already documents that limit for its own
 * TTL clearing. A watcher would therefore be a promise the platform cannot keep, and a
 * security feature that is trusted more than it works is worse than an absent one.</p>
 *
 * <p>So the honest version is on demand: the person asks, and the answer is exact. Two
 * surfaces use it — the clipboard right now, and an open file or selection — both with the
 * same rule as the masker: only real values from the vault, never a guess about what looks
 * secret.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

export interface ScanHit {
  /** The label of the matched secret — never the value. */
  readonly label: string;
  /** 1-based line where it was found, for a file. */
  readonly line: number;
  /** How many times that label matched in total. */
  readonly count: number;
}

export interface ScanReport {
  readonly hits: readonly ScanHit[];
  readonly total: number;
}

export const CLEAN_REPORT: ScanReport = { hits: [], total: 0 };

/**
 * Which secrets appear in `text`, and where.
 *
 * <p>Implemented over `maskText` rather than beside it, so a value the scanner reports is by
 * construction a value the masker would have replaced — one definition of "a secret is in
 * here", not two that could disagree.</p>
 */
export function scanForSecrets(text: string, table: MaskTable): ScanReport {
  if (table.entries.length === 0 || text.length === 0) {
    return CLEAN_REPORT;
  }
  const byLabel = new Map<string, { line: number; count: number }>();

  splitLines(text).forEach((lineText, index) => {
    for (const { needle, label } of table.entries) {
      countOnLine(byLabel, lineText, needle, label, index + 1);
    }
  });

  const hits = [...byLabel].map(([label, where]) => ({
    label,
    line: where.line,
    count: where.count,
  }));
  return { hits, total: hits.reduce((sum, h) => sum + h.count, 0) };
}

/**
 * One sentence for the person, in their terms.
 *
 * <p>Never includes the value — the report exists to say "do not paste this", and printing
 * the secret to make that point would be its own leak, into a notification and the editor's
 * message history.</p>
 */
export function describeScan(report: ScanReport, what: string): string {
  if (report.total === 0) {
    return `No vault secrets found in ${what}.`;
  }
  const named = report.hits
    .map((h) => (h.line > 0 ? `${h.label} (line ${h.line})` : h.label))
    .join(', ');
  return report.total === 1
    ? `1 vault secret is in ${what}: ${named}. Do not paste this into a chat or an issue.`
    : `${report.total} vault secrets are in ${what}: ${named}. Do not paste this into a chat or an issue.`;
}
