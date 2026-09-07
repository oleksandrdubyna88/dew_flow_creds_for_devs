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
export function eventQueryPath(query: OrgEventQuery = {}): string {
  const params = new URLSearchParams();
  const put = (name: string, value: string | number | undefined): void => {
    if (value === undefined) {
      return;
    }
    const text = String(value).trim();
    if (text.length > 0) {
      params.set(name, text);
    }
  };
  put('actor', query.actor);
  put('subject', query.subject);
  put('person', query.person);
  put('project', query.project);
  put('kind', query.kind);
  put('since', query.since);
  put('until', query.until);
  put('q', query.text);
  put('cursor', query.cursor);
  put('limit', query.limit);
  const search = params.toString();
  return search.length > 0 ? `${ORG_EVENTS_PATH}?${search}` : ORG_EVENTS_PATH;
}

/** An empty page, for a server that has no log to answer with. */
export const NO_EVENTS: OrgEventPage = { items: [] };

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
