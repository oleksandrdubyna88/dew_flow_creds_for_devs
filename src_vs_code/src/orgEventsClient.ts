import { CorpApiClient } from './corpApiClient';
import { NO_EVENTS, OrgEventPage, OrgEventQuery, eventQueryPath, isOrgEventPage, pageOf } from './eventQuery';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';
import { StoredAccount } from './types';

/**
 * Reads the corporate event log — `GET /api/org/events`.
 *
 * <p>On `CorpApiClient` like every corporate client since epic 1, never a fourth copy of the
 * bearer/contract/timeout plumbing. What it adds is the two things a caller cannot get from the
 * transport: the query string (`eventQuery.ts`) and the refusal to hand back a page this build
 * cannot read.</p>
 *
 * <p><b>The server decides the SCOPE, not this client.</b> An officer or an administrator reads the
 * whole domain; everybody else reads only the rows naming them, and a filter cannot widen that. So a
 * caller may send whatever narrows the view without deciding who may see what.</p>
 */
export class OrgEventsClient {
  private readonly api: CorpApiClient;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
  }

  /**
   * One page, newest first.
   *
   * <p>A server too old to have the route answers `404`, and that means the same thing as a server
   * with no roster: there is no log here. It reads as an EMPTY PAGE rather than an error, the shape
   * `readMe` and `listProjects` already use — a readiness cycle against an older server must not
   * report a failure about a feature that server does not have. Every other refusal throws with the
   * server's own sentence, so a `403` or a `426` is never silent.</p>
   */
  async readEvents(account: StoredAccount, query: OrgEventQuery = {}): Promise<OrgEventPage> {
    const response = await this.api.request(account, eventQueryPath(query));
    if (response.status === 404) {
      return NO_EVENTS;
    }
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    return this.pageFrom(response);
  }

  /** The body as a page, or the one sentence a document this build cannot read may become. */
  private async pageFrom(response: Response): Promise<OrgEventPage> {
    const body: unknown = await response.json().catch(() => undefined);
    if (!isOrgEventPage(body)) {
      throw new Error('The server answered the event log in a shape this build cannot read.');
    }
    return pageOf(body);
  }
}
