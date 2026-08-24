/**
 * One line per agent call, for the output channel that IS this feature's audit
 * surface. Pure so the one rule worth asserting — the full secret never
 * appears in a line — is a unit test rather than a promise.
 */

export interface AuditEntry {
  /** Wall-clock of the call; passed in so the formatter stays deterministic. */
  at: Date;
  /** Log-safe grant label (`describeSecret`), never the whole secret. */
  grant: string;
  entityName: string;
  action: string;
  /** `allowed`, `denied`, `exit 0`, `timeout`, an error code — the outcome. */
  outcome: string;
  /** Optional one-line detail: the command, a byte count, an error message. */
  detail?: string;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function clockOf(at: Date): string {
  return `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}

/** Collapse newlines so one call is always exactly one line in the channel. */
function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatAuditLine(entry: AuditEntry): string {
  const head = `[${clockOf(entry.at)}] ${entry.action} ${entry.entityName} (${entry.grant}) → ${entry.outcome}`;
  return entry.detail === undefined ? head : `${head}  ${oneLine(entry.detail)}`;
}
