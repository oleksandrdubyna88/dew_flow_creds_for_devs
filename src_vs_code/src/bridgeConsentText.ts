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

/** Where a bridged command starts: on this computer, or on the server that asked. */
export type RunSite = 'laptop' | 'server';

/**
 * E1 serves `exec` and `query` only, and both start on this computer, so the answer is a constant. E3.1 replaces the call
 * with `decideRunSite` and keeps both sentences.
 */
export function bridgeRunSite(): RunSite {
  return 'laptop';
}

/**
 * The line after the request time: through which server, where it runs, and what goes back. The name passes the
 * sanitiser of a caller label, because an entry's name is a person's text inside a security dialog.
 */
export function bridgeModalLine(bridge: BridgeContext, site: RunSite): string {
  const through = `Through the Remote Bridge of "${cleanCallerField(bridge.serverName)}".`;
  return site === 'laptop'
    ? `${through} It runs on this computer, and only its output goes to that server.`
    : `${through} It runs on that server.`;
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
