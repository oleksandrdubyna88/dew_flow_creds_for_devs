import { CALLER_MAX_LABEL_CHARS } from './brokerCaller';

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
  /**
   * Which door the call came through.
   *
   * <p>Three of them reach the same machinery — a bearer token a human copied, a CLI alias, and
   * an MCP client naming an entry by id — and until this field existed a finished line could not
   * say which. That mattered the moment there was a view over these files that shows only what
   * an agent did: filtering by the verb is wrong, because `query` is a verb all three can send.</p>
   *
   * <p>Absent in lines written before it existed, and read back that way rather than guessed.</p>
   */
  via?: AuditDoor;
  /**
   * Who called, as the caller REPORTED it — `Claude Code 2.1.268 · session clauderag-d6 (98bf9f23)
   * · in ClaudeRag`. A label the body carried, never an authorisation input; `brokerCaller.ts`
   * strips and caps it before it gets here.
   *
   * <p>Optional, not required, and the asymmetry with `consent` — where the caller is a required
   * parameter — is deliberate: the share mint is a human clicking a menu item and has no caller.
   * Absent in lines written before it existed.</p>
   */
  caller?: string;
}

/**
 * The ways in. Named here because the line format and its reader must agree.
 *
 * <p>`config` is the fourth and the odd one: the other three end in a human answering a consent
 * modal, and this one deliberately does not — an application reading its configuration at startup
 * cannot answer a dialog, and one that appeared on every `dotnet run` would be clicked through
 * blind inside a day. The key IS the authorization there, which is exactly why every use of it
 * has to reach this log.</p>
 */
export type AuditDoor = 'token' | 'alias' | 'mcp' | 'config';

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
  const via = entry.via === undefined ? '' : ` via ${entry.via}`;
  const head = `[${clockOf(entry.at)}] ${seq}${entry.action} ${entry.entityName} (${entry.grant})${via}${bySegment(entry.caller)} → ${entry.outcome}`;
  return entry.detail === undefined ? head : `${head}  ${oneLine(entry.detail)}`;
}

/**
 * ` by <label>`, between the door and the outcome — or nothing.
 *
 * <p>One line and never the field separator, whoever built the label. The sanitiser in
 * `brokerCaller.ts` is the guard; this is the formatter refusing to be the place where a guard
 * bypassed by some future door breaks its own parser's round trip.</p>
 */
function bySegment(caller: string | undefined): string {
  return caller === undefined ? '' : ` by ${oneLine(caller.replace(/→/g, ' '), CALLER_MAX_LABEL_CHARS)}`;
}

/**
 * One line, read back.
 *
 * <p>Written and read in one module on purpose: the format is not a wire contract anybody else
 * implements, it is a shape this product prints and then shows in a filtered view. The guarantee
 * worth having is the round trip, and it is asserted as one — format an entry, parse it, get the
 * entry back — rather than by two regexes maintained apart from each other.</p>
 *
 * <p>A line it cannot read yields `undefined` rather than a half-filled row. These files are
 * swept but not versioned, so a fortnight after any format change the folder holds both; a row
 * showing an entity called `(…)` because a parse half-worked is worse than a line left out.</p>
 */
export function parseAuditLine(line: string): AuditEntry | undefined {
  const match = LINE.exec(line);
  if (match === null) {
    return undefined;
  }
  const [, clock, seq, action, entityName, grant, via, caller, outcome, detail] = match;
  return {
    at: timeOf(clock),
    grant,
    entityName,
    action,
    outcome,
    seq: numberOrNothing(seq),
    via: via as AuditDoor | undefined,
    caller: textOrNothing(caller),
    detail: textOrNothing(detail),
  };
}

// `[12:00:00Z] #3 query orders-db (tok…f2) via mcp by Claude Code 2.1.268 · session x (98bf9f23) · in ClaudeRag → exit 0  SELECT 1`
//
// The caller group is optional, so every line written before it existed still parses (C3). Its
// own parentheses are safe: the `(.*?) \(([^)]*)\)` pair before it backtracks, which the
// `prod (eu-west) db` case already proves — and it can never contain the separator, because the
// formatter above does not let one through.
const LINE =
  /^\[(\d\d:\d\d:\d\dZ)\] (?:#(\d+) )?(\S+) (.*?) \(([^)]*)\)(?: via (token|alias|mcp))?(?: by ([^→]*?))? → ([^ ]+(?: [^ ]+)*?)(?:  (.*))?$/;

/** An absent capture group and an empty one both mean the line did not carry it. */
function numberOrNothing(value: string | undefined): number | undefined {
  return value === undefined || value === '' ? undefined : Number(value);
}

function textOrNothing(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * The clock back into a Date, on today's date.
 *
 * <p>The line carries a time and the FILE carries the day, so a row read on its own knows the
 * hour and not the date. The reader that walks a day folder overwrites this with the folder's
 * date; alone, it is the time of day and nothing is claimed about which one.</p>
 */
function timeOf(clock: string): Date {
  const at = new Date(0);
  at.setUTCHours(Number(clock.slice(0, 2)), Number(clock.slice(3, 5)), Number(clock.slice(6, 8)), 0);
  return at;
}
