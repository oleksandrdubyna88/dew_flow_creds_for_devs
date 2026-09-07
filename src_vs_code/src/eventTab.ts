import { OrgEvent, OrgEventPage, OrgEventQuery } from './eventQuery';
import { EVENT_GROUPS, groupById } from './eventRows';
import { describeError } from './describeError';
import { EventPageState, renderOrgEvents } from './orgEventsPage';
import { OrgEventsClient } from './orgEventsClient';
import { StoredAccount } from './types';

/**
 * One Event log tab's state machine — the half with no `vscode` in it.
 *
 * <p>Separated from `orgEventsPanel.ts` by CLAUDE.md rule 3: the testable half of the extension
 * imports no `vscode`, and everything worth being wrong about here — what is asked for, what a late
 * answer does, what a failure draws — is in this file, so all of it is a unit test. The panel next
 * door is the twenty lines that wire a webview to it.</p>
 */

/**
 * The most rows one tab holds before the oldest are dropped.
 *
 * <p>Twenty pages of the server's own default (100) and four of its maximum: enough that a person
 * reading a week of a busy company never meets it, and small enough that the whole table is one
 * string the webview re-parses without a stutter. It bounds nothing on the SERVER — the rows are
 * still there, and the page says so where it drops any.</p>
 */
export const MAX_ROWS_IN_TAB = 2_000;

/** What the page may ask for. Nothing here carries data — the host holds all of it. */
export interface EventPageMessage {
  readonly type: 'group' | 'more' | 'retry';
  readonly group?: string;
}

const MESSAGE_TYPES: readonly string[] = ['group', 'more', 'retry'];

export function isEventPageMessage(value: unknown): value is EventPageMessage {
  const message = value as Record<string, unknown> | null;
  return typeof message === 'object'
    && message !== null
    && MESSAGE_TYPES.includes(message.type as string)
    && optionalString(message.group);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/**
 * One tab's state machine: a group, the rows read so far, the cursor, and at most one request in
 * flight.
 *
 * <p><b>Every request carries a generation.</b> Two clicks race — a second "load more" before the
 * first answers, a filter change while a page is out — and the answer that arrives late must not
 * append rows from a query nobody is looking at any more. A response whose generation is stale is
 * dropped, which is cheaper and more honest than trying to cancel it.</p>
 */
/**
 * What this tab asks of a client, and nothing more.
 *
 * <p>Depending on the one method it calls rather than on the class keeps the seam honest: a test
 * hands it a small object with no cast, and the day the client grows a method, nothing here
 * pretends to need it.</p>
 */
export type EventsReader = Pick<OrgEventsClient, 'readEvents'>;

export class EventTab {
  private group = EVENT_GROUPS[0].id;

  private rows: OrgEvent[] = [];

  private cursor: string | undefined;

  private loading = false;

  private noLogHere = false;

  private error: string | undefined;

  private dropped = 0;

  /** Bumped on every new question; an answer from an older one is discarded. */
  private generation = 0;

  constructor(
    private readonly client: EventsReader,
    private readonly account: StoredAccount,
    private readonly draw: (html: string) => void,
  ) {}

  start(): Promise<void> {
    return this.load({ fresh: true });
  }

  redraw(): void {
    this.draw(renderOrgEvents(this.state()));
  }

  async handle(message: EventPageMessage): Promise<void> {
    // A GROUP change preempts whatever is in flight: it is a different question, and the answer to
    // the old one is discarded by its generation when it arrives. Asking for MORE while a page is
    // out is the fast double click, and it is dropped rather than queued — the page disables the
    // button, and two identical requests would append the same rows twice.
    if (message.type === 'group') {
      await this.regroup(message.group);
      return;
    }
    if (this.refusable(message)) {
      return;
    }
    await this.load({ fresh: message.type === 'retry' && this.rows.length === 0 });
  }

  /**
   * Messages the tab drops rather than acts on: one while a request is already out — the page
   * disables those buttons, so this is the fast double click — and a "more" with no cursor, which
   * would ask for the FIRST page again and append it under itself.
   */
  private refusable(message: EventPageMessage): boolean {
    return this.loading || (message.type === 'more' && this.cursor === undefined);
  }

  /** A different group is a different question: the rows and the cursor start again. */
  private async regroup(group: string | undefined): Promise<void> {
    const wanted = groupById(group ?? this.group).id;
    if (wanted !== this.group) {
      this.group = wanted;
      await this.load({ fresh: true });
    }
  }

  /** Ask the server, and draw whatever comes back — including the failure. */
  private async load(options: { fresh: boolean }): Promise<void> {
    const mine = ++this.generation;
    this.loading = true;
    this.error = undefined;
    if (options.fresh) {
      this.rows = [];
      this.cursor = undefined;
      this.dropped = 0;
      // Cleared with the rows: a 404 answered once must not outlive the question that got it, or a
      // Try again against a server that is merely unreachable keeps saying "this server keeps no
      // log" — with no error and no way to try once more.
      this.noLogHere = false;
    }
    this.redraw();
    try {
      this.accept(await this.client.readEvents(this.account, this.query()), mine);
    } catch (error) {
      if (mine === this.generation) {
        this.loading = false;
        this.error = describeError(error);
        this.redraw();
      }
    }
  }

  /** Take a page, unless the question it answers is no longer the one being asked. */
  private accept(page: OrgEventPage, generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.loading = false;
    this.noLogHere = page.noLogHere === true;
    this.rows = [...this.rows, ...page.items];
    // A cursor the server hands back unchanged would page for ever; treat it as the end.
    this.cursor = page.nextCursor === this.cursor ? undefined : page.nextCursor;
    this.trim();
    this.redraw();
  }

  /**
   * Keep the tab responsive: past the cap the OLDEST loaded rows go, and the page says how many.
   *
   * <p>From the END of the list, because the rows are newest-first and "load more" APPENDS older
   * pages — taking the tail would have dropped the newest events and kept the oldest, which for an
   * audit log is the wrong half and was the opposite of what the page said it had done.</p>
   */
  private trim(): void {
    if (this.rows.length <= MAX_ROWS_IN_TAB) {
      return;
    }
    this.dropped += this.rows.length - MAX_ROWS_IN_TAB;
    this.rows = this.rows.slice(0, MAX_ROWS_IN_TAB);
  }

  private query(): OrgEventQuery {
    return { kind: groupById(this.group).kind, cursor: this.cursor };
  }

  private state(): EventPageState {
    return {
      rows: this.rows,
      group: this.group,
      loading: this.loading,
      hasMore: this.cursor !== undefined,
      noLogHere: this.noLogHere,
      error: this.error,
      account: this.account.email,
      dropped: this.dropped,
    };
  }
}
