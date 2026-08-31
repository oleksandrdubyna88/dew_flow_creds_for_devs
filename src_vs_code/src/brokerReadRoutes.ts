import {
  AliasListBody,
  AliasListEntry,
  HealthBody,
  SERVICE_NAME,
  isAliasListRoute,
  isMcpConfigSnippetRoute,
  isMcpEntriesRoute,
  isMcpFoldersRoute,
} from './brokerProtocol';
import { McpEntriesBody, McpEntry } from './mcpEntries';
import { FolderView, FoldersBody } from './mcpFolders';
import { ConfigSnippetBody, configSnippetResult } from './mcpSnippetRoute';
import { EntityMetadata } from './types';

/**
 * The broker's GET routes, in one place because they are one KIND of route.
 *
 * <p>None authenticates, none performs anything, none raises a modal, and therefore none is
 * throttled — the action routes are, because there the modal IS the authorization. Saying that
 * once, here, is worth more than three paragraphs scattered through a dispatcher.</p>
 *
 * <p>What each may disclose is decided elsewhere and for its own reasons. Health says only that
 * this port still belongs to us, which is what lets a client confirm that BEFORE it sends a
 * token. The alias listing gives up inventory — a local process learns which names exist — in
 * exchange for a `creds ls` that works on a Remote-SSH host, where the registry is on the other
 * machine (`isAliasListRoute`). The entries route gives up rather more, which is why nothing
 * appears in it until somebody turns a switch on for that entry (`isMcpEntriesRoute`). The
 * folder listing is the entries route's counterpart over the second object, and is bounded the
 * same way — nothing is listed that was not opened.</p>
 *
 * <p>Out of `credsAgentServer.ts` because that file is at its line ceiling and none of them
 * needs anything on it: they take their suppliers as arguments, which also means the routing can
 * be tested without starting a listener — and `brokerContract.test.ts` now walks the contract's
 * own `reads` table through this function, so a route filed as a read and wired somewhere else
 * is a red test rather than a 404 nobody sees.</p>
 */

/** Where the non-trivial answers come from. Absent means this window has none. */
export interface ReadRouteSources {
  aliases?: () => readonly AliasListEntry[];
  mcpEntries?: () => Promise<readonly McpEntry[]>;
  /** An AGENT-VISIBLE config entry by id, through the same wall the entries route uses —
   * anything else answers undefined, deliberately indistinguishable from absent (T10). */
  visibleConfig?: (entityId: string) => EntityMetadata | undefined;
  /** The folders opened to agents. A read like the entries listing: no token, nothing performed. */
  folders?: () => readonly FolderView[];
}

/** The body a GET route answers with, or `undefined` when the path is not one of them. */
export async function readRouteBody(
  pathname: string,
  sources: ReadRouteSources,
  query: URLSearchParams = new URLSearchParams(),
): Promise<ReadBody | undefined> {
  const routes: ReadonlyArray<[boolean, () => Promise<ReadBody>]> = [
    [pathname === '/v1/health', async () => ({ ok: true, service: SERVICE_NAME })],
    [isAliasListRoute(pathname), async () => ({ aliases: aliasesFrom(sources) })],
    [isMcpConfigSnippetRoute(pathname), async () => snippetBody(sources, query)],
    [isMcpEntriesRoute(pathname), async () => ({ entries: await entriesFrom(sources) })],
    // A READ, and it has to live here rather than in the MCP dispatch: that dispatch is reached
    // only under POST (`credsAgentServer.ts`), while the contract files this route under `reads`
    // beside the three above and every reader therefore GETs it. It spent 0.85.0 through 0.89.0
    // in the POST branch, answering 404 to the only client that asks — reported to the agent as
    // "No CredsForDevs window answered", which is why the whole folder surface was unusable.
    [isMcpFoldersRoute(pathname), async () => ({ folders: foldersFrom(sources) })],
  ];
  const hit = routes.find(([matches]) => matches);
  return hit === undefined ? undefined : hit[1]();
}

/** Anything a GET route answers with. Named so the table above states it once, not twice. */
type ReadBody = HealthBody | AliasListBody | McpEntriesBody | ConfigSnippetBody | FoldersBody;

/**
 * Always 200; a refusal travels as `error` IN the body. The tool reads the JSON either way,
 * and "which ids exist" is the entries route's disclosure, not this one's.
 */
function snippetBody(sources: ReadRouteSources, query: URLSearchParams): ConfigSnippetBody {
  const param = (name: string): string | undefined => query.get(name) ?? undefined;
  return configSnippetResult(
    sources.visibleConfig?.(param('id') ?? ''),
    param('language'),
    param('variant'),
  );
}

/**
 * An absent supplier answers an empty list, never a failure.
 *
 * <p>A build or a test without a registry is a legitimate configuration, and so is a vault that
 * has opened nothing to agents. Neither is a malfunction, and neither should read like one.</p>
 */
function aliasesFrom(sources: ReadRouteSources): AliasListEntry[] {
  return [...(sources.aliases?.() ?? [])];
}

async function entriesFrom(sources: ReadRouteSources): Promise<McpEntry[]> {
  return sources.mcpEntries === undefined ? [] : [...(await sources.mcpEntries())];
}

/**
 * The folders an agent may see.
 *
 * <p>A read, so no prompt and no grant: it performs nothing and reveals nothing secret — a folder
 * holds none. It is the listing an agent needs before it can name one, exactly as
 * `/v1/mcp/entries` is for entries. An absent supplier answers an empty list, for the reason
 * `aliasesFrom` gives.</p>
 */
function foldersFrom(sources: ReadRouteSources): FolderView[] {
  return [...(sources.folders?.() ?? [])];
}
