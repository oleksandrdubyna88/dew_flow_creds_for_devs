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
 * connection that starts on this computer (`exec`); on this computer, which for `query` is the database CLIENT alone (the SQL runs on the
 * database the stored connection names); or on the server that asked (E3's `run`, not built).
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
 * authorises. Nothing but `exec` and `query` reaches a bridge's dialog. E3.1 replaces this with `decideRunSite` and chooses each `run`
 * sentence from that result, never from the action's name.
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

/**
 * What each ACTION says at each SITE (parent §4.2, change 6.2). Keyed by both, because the same site means different things for different
 * actions: `exec` at `destination` spawns `ssh` here for the entry's host; `query` at `laptop` spawns the database client here, and what
 * the client talks to is the database the stored connection names, which the sentence deliberately does not name (mysql's `use` and
 * sqlcmd's context switch can leave it behind). Neither says "only its output": the destination, or the database, may be the bridge's own
 * server (Q4, Q11). E3 adds `run`'s `laptop` sentence beside its spawn observation. Each sentence is handed the entry's name ALREADY cleaned (`bridgeModalLine` does it once, for all of them), so a sentence added later cannot forget to.
 */
const SENTENCES: ReadonlyMap<string, (entryName: string) => string> = new Map<string, (entryName: string) => string>([
  ['exec:destination', (entry) => `The connection starts on this computer; the command runs on "${entry}", and its output goes back to that server.`],
  ['query:laptop', (entry) => `The database client runs on this computer, using the connection stored in "${entry}". Its output goes back to the agent on that server.`],
  ['run:server', () => 'It runs on that server.'],
]);

/**
 * The line after the request time: through which server, and, true for the action at its site, where it runs and what goes back. The
 * server's name and the entry's pass `bridgeQuotedName`. An action at a site with no sentence names the bridge and claims no place.
 */
export function bridgeModalLine(bridge: BridgeContext, action: string, site: RunSite | undefined, entryName: string): string {
  const through = `Through the Remote Bridge of "${bridgeQuotedName(bridge.serverName)}".`;
  const sentence = site === undefined ? undefined : SENTENCES.get(`${action}:${site}`);
  return sentence === undefined ? through : `${through} ${sentence(bridgeQuotedName(entryName))}`;
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

/** The consent modal's buttons, in the order VS Code shows them. A local modal is unchanged. */
export const LOCAL_BUTTONS = ['Allow', 'Deny'] as const;

/** A bridged modal puts Deny first (parent Q5), so a stray Enter lands on Deny. */
export const BRIDGED_BUTTONS = ['Deny', 'Allow'] as const;

/** The buttons of one modal: the bridged order through a Remote Bridge, today's order everywhere else. Pure data, so a test reads the lists. */
export function consentButtons(bridged: boolean): readonly string[] {
  return bridged ? BRIDGED_BUTTONS : LOCAL_BUTTONS;
}
