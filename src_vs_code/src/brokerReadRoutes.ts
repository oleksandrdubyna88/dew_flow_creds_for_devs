import {
  AliasListBody,
  AliasListEntry,
  HealthBody,
  SERVICE_NAME,
  isAliasListRoute,
  isMcpEntriesRoute,
} from './brokerProtocol';
import { McpEntriesBody, McpEntry } from './mcpEntries';

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
 * appears in it until somebody turns a switch on for that entry (`isMcpEntriesRoute`).</p>
 *
 * <p>Out of `credsAgentServer.ts` because that file is at its line ceiling and these three do
 * not need anything on it: they take their suppliers as arguments, which also means the routing
 * can be tested without starting a listener.</p>
 */

/** Where the two non-trivial answers come from. Absent means this window has none. */
export interface ReadRouteSources {
  aliases?: () => readonly AliasListEntry[];
  mcpEntries?: () => Promise<readonly McpEntry[]>;
}

/** The body a GET route answers with, or `undefined` when the path is not one of them. */
export async function readRouteBody(
  pathname: string,
  sources: ReadRouteSources,
): Promise<HealthBody | AliasListBody | McpEntriesBody | undefined> {
  if (pathname === '/v1/health') {
    return { ok: true, service: SERVICE_NAME };
  }
  if (isAliasListRoute(pathname)) {
    return { aliases: aliasesFrom(sources) };
  }
  return isMcpEntriesRoute(pathname) ? { entries: await entriesFrom(sources) } : undefined;
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
