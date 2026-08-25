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
  /** This window's call number. Absent in the older channel-only lines. */
  seq?: number;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * UTC, and the `Z` says so.
 *
 * <p>Local time was fine while this only ever reached an output channel somebody
 * was looking at. It stopped being fine when the same line started going into a
 * file whose NAME is UTC: one file would have carried two timezones, and the one
 * moment anybody reads it is while lining it up against a server log written in a
 * third. The shared logging rule asks for UTC in the folder, the file name and
 * every line for exactly this reason.</p>
 */
function clockOf(at: Date): string {
  return `${two(at.getUTCHours())}:${two(at.getUTCMinutes())}:${two(at.getUTCSeconds())}Z`;
}

/** Collapse newlines so one call is always exactly one line in the channel. */
function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatAuditLine(entry: AuditEntry): string {
  const seq = entry.seq === undefined ? '' : `#${entry.seq} `;
  const head = `[${clockOf(entry.at)}] ${seq}${entry.action} ${entry.entityName} (${entry.grant}) → ${entry.outcome}`;
  return entry.detail === undefined ? head : `${head}  ${oneLine(entry.detail)}`;
}
