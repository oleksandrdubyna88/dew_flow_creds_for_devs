import { hasShape } from './shapeGuard';

/**
 * The corporate event log as this client asks for it: the query string, the page it gets back, and
 * the guards that turn a document this build cannot read into a sentence at the edge.
 *
 * <p>Pure and `vscode`-free (CLAUDE.md rule 3), so every character of the query string and every
 * refusal of a malformed page is a unit test rather than a hopeful comment.</p>
 *
 * <p>The other implementation of this contract is the server's `OrgEventsEndpoints`, and the two
 * cannot be proved consistent by two suites that each read their own copy of the names — so the
 * parameter names below are written once, here, and `eventQuery.test.ts` asserts the string they
 * produce against the one the server's own `.http` file sends.</p>
 */

/** One row of the log. Metadata only — the server never puts a payload in one. */
export interface OrgEvent {
  /** UTC milliseconds. */
  readonly at: number;
  readonly kind: string;
  readonly actor: string;
  readonly subject?: string;
  readonly project?: string;
  readonly shareId?: string;
  readonly entityName?: string;
  readonly entityKind?: string;
  readonly outcome?: string;
  readonly detail?: string;
}

/**
 * A page of rows, newest first, and where to carry on from.
 *
 * <p>`nextCursor` absent means the end. An EMPTY page with a cursor does not: the server bounds
 * what one request may scan, so an empty page carrying a cursor means "nothing yet, keep going".
 * A caller pages while the cursor is there, never while the page is non-empty.</p>
 */
export interface OrgEventPage {
  readonly items: readonly OrgEvent[];
  readonly nextCursor?: string;
  /**
   * Set only when the SERVER has no such route — one too old to keep an event log at all.
   *
   * <p>An empty page and "this server does not keep one" are different facts, and a viewer that
   * showed the first for the second would tell somebody their company's history is empty when it
   * is merely unreachable. The polling callers treat it as an empty page, which is why the absence
   * is a flag rather than a throw; the viewer says the sentence.</p>
   */
  readonly noLogHere?: boolean;
}

/** What a person may narrow the log by. Every field is optional and they are ANDed by the server. */
export interface OrgEventQuery {
  readonly actor?: string;
  readonly subject?: string;
  /** Actor OR subject — the one field that asks about a person rather than a side. */
  readonly person?: string;
  readonly project?: string;
  /** An exact kind, or a group when it ends in a dot: `share.` is every share kind. */
  readonly kind?: string;
  /** UTC milliseconds, inclusive. */
  readonly since?: number;
  readonly until?: number;
  /** A substring, matched case-insensitively across every field a row carries. */
  readonly text?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export const ORG_EVENTS_PATH = '/api/org/events';

/**
 * The path with its query string — and nothing for a filter nobody set.
 *
 * <p>An absent field is OMITTED rather than sent empty: `?actor=` is a filter the server would
 * apply to the empty string, and `undefined` interpolated into a template is the literal word
 * "undefined", which is a filter that matches nothing and looks like a bug in the server.</p>
 */
/**
 * Every filter, and the name it travels under. ONE table: the builder reads it and so does its
 * test, so a parameter added here cannot be silently missed by a test that retyped the list.
 */
export const EVENT_QUERY_PARAMS: Readonly<Record<keyof OrgEventQuery, string>> = {
  actor: 'actor',
  subject: 'subject',
  person: 'person',
  project: 'project',
  kind: 'kind',
  since: 'since',
  until: 'until',
  text: 'q',
  cursor: 'cursor',
  limit: 'limit',
};

export function eventQueryPath(query: OrgEventQuery = {}): string {
  const pairs = Object.entries(EVENT_QUERY_PARAMS)
    .map(([field, name]) => [name, sendable(query[field as keyof OrgEventQuery])] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== undefined);
  const search = new URLSearchParams(pairs.map(([name, value]): [string, string] => [name, value])).toString();
  return search.length > 0 ? `${ORG_EVENTS_PATH}?${search}` : ORG_EVENTS_PATH;
}

/**
 * The value as it goes on the wire, or nothing when it must not travel.
 *
 * <p>A number that is not FINITE is dropped rather than sent: `since=NaN` — an invalid
 * `Date.parse`, an arithmetic slip — reaches the server as a word it refuses with a `400`, so the
 * caller meets a failure about their own bad arithmetic dressed as a server refusal. An absent or
 * blank filter is dropped for the same class of reason: `?actor=` filters on the empty string.</p>
 */
function sendable(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined || unusableNumber(value)) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/** A number no clock and no counter can hold: NaN from a bad `Date.parse`, an Infinity from a slip. */
function unusableNumber(value: string | number | boolean): boolean {
  return typeof value === 'number' && !Number.isFinite(value);
}

/** An empty page, for a server that has no log to answer with. */
export const NO_EVENTS: OrgEventPage = { items: [] };

/** What a server too old to have the route answers with — an absence a viewer can put into words. */
export const NO_LOG_HERE: OrgEventPage = { items: [], noLogHere: true };

/**
 * A row this build can read: the three fields every kind carries, and nothing assumed about the
 * rest. A kind this build does not know is still a row — an older client must SHOW a newer
 * server's history rather than hiding it.
 */
const ROW_SHAPE = { at: 'number', kind: 'string', actor: 'string' } as const;

/** Everything else a row may carry: a string, or absent. A table rather than a chain of `&&`. */
const ROW_OPTIONAL = ['subject', 'project', 'shareId', 'entityName', 'entityKind', 'outcome', 'detail'] as const;

export function isOrgEvent(value: unknown): value is OrgEvent {
  return hasShape(value, ROW_SHAPE)
    // An instant a clock cannot hold — NaN, Infinity — is not a row: it renders as "Invalid Date"
    // and sorts unpredictably, three layers from whatever produced it.
    && Number.isFinite((value as { at: number }).at)
    && ROW_OPTIONAL.every((field) => optionalString((value as Record<string, unknown>)[field]));
}

/**
 * A whole page, checked before a caller iterates it.
 *
 * <p>The array and the cursor are checked, not only the rows: a server answering
 * `{items: "none", nextCursor: 7}` would otherwise fail inside whatever renders it, three layers
 * from the thing that was wrong. One bad row fails the page for the reason the roster does — a row
 * silently missing from a history is worse than an error.</p>
 */
const PAGE_SHAPE = { items: 'array' } as const;

export function isOrgEventPage(value: unknown): value is OrgEventPage {
  return hasShape(value, PAGE_SHAPE)
    && (value as { items: unknown[] }).items.every(isOrgEvent)
    && optionalString((value as Record<string, unknown>).nextCursor);
}

/** The page as this client holds it: a `null` cursor from the server is simply the end. */
export function pageOf(value: OrgEventPage): OrgEventPage {
  return {
    items: value.items,
    nextCursor: typeof value.nextCursor === 'string' && value.nextCursor.length > 0 ? value.nextCursor : undefined,
  };
}

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}
