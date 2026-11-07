import type { BridgeContext, BridgeGrant } from './bridgeContext';
import { cleanCallerField } from './brokerCaller';

/**
 * What the consent dialog says about a Remote Bridge (E1.4).
 *
 * <p>Pure: imports no `vscode`. Two sentences and a coverage line, kept apart from `brokerConsent.ts` because the
 * words are the part a review reads, and because the dialog must say the TRUTH about where a command runs and how far an
 * Allow reaches, neither of which the caller's label may influence. Every name here comes from the bridge's context,
 * handed over by the door; nothing is read from a request body.</p>
 */

/**
 * Where a bridged action's work is done, said to the person who authorises it: at the DESTINATION a stored entry names, after a
 * connection that starts on this computer (`exec`); on this computer, with only its output sent on (`query`); or on the server
 * that asked (E3's `run`, not built).
 */
export type RunSite = 'destination' | 'laptop' | 'server';

/** The served actions and where each does its work. A bridge serves `exec` and `query` only (the allow-list, `bridgeAllowList.ts`). */
const RUN_SITES: ReadonlyMap<string, RunSite> = new Map<string, RunSite>([
  ['exec', 'destination'],
  ['query', 'laptop'],
]);

/**
 * The site of one action, or `undefined` for an action that has none. A line is true per action, because the modal is the
 * authorisation (parent §4.2): `exec` is not `query`, and a sentence that guessed for a third action would be a guess a person
 * authorises. Nothing but `exec` and `query` reaches a bridge's dialog; E3.1 replaces this with `decideRunSite` and keeps every sentence.
 */
export function bridgeRunSite(action: string): RunSite | undefined {
  return RUN_SITES.get(action);
}

/**
 * A name as a bridged dialog shows it between quotes: one line, at most eighty code points (the sanitiser of a caller label), and no `"` of
 * its own, so a name cannot close the quotes it stands in and carry on as a sentence of the dialog. Only a bridged dialog uses it; a local
 * dialog shows the entry's name as it always did.
 */
export function bridgeQuotedName(name: string): string {
  return cleanCallerField(name).replaceAll('"', "'");
}

/** What each site says. The entry's name is a person's text inside a security dialog and is shown through `bridgeQuotedName`. */
const SITE_SENTENCES: Readonly<Record<RunSite, (entryName: string) => string>> = {
  destination: (entryName) => `The connection starts on this computer; the command runs on "${bridgeQuotedName(entryName)}", and its output goes back to that server.`,
  laptop: () => 'It runs on this computer, and only its output goes to that server.',
  server: () => 'It runs on that server.',
};

/**
 * The line after the request time: through which server, and, true for the action, where it runs and what goes back. Both names
 * pass the sanitiser of a caller label. An action with no site names the bridge and claims no place.
 */
export function bridgeModalLine(bridge: BridgeContext, site: RunSite | undefined, entryName: string): string {
  const through = `Through the Remote Bridge of "${bridgeQuotedName(bridge.serverName)}".`;
  return site === undefined ? through : `${through} ${SITE_SENTENCES[site](entryName)}`;
}

/**
 * How far an Allow reaches, in the place of the token sentence, which is false on a bridge (a bridged call is one
 * request's capability, never a token). With the server's `quiet` switch off an Allow is this call; with it on, the entry's
 * own consent setting decides what follows, against this server's stamp alone.
 */
export function bridgeCoverageLine(bridge: BridgeGrant): string {
  return bridge.quiet
    ? "Allowing follows this entry's own consent setting, for this server only: not for another server, and not for this computer."
    : 'Allowing covers this call only.';
}
