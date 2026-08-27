import { ConfigReadBody, parseBearer } from './brokerProtocol';
import { ConfigKeyHolder, describeConfigKey, findConfigKeyHolder } from './configKey';

/**
 * Serving one config file to the application that holds its key.
 *
 * <p><b>Not in `brokerReadRoutes.ts`</b>, and the reason is that file's own first sentence: none
 * of those authenticates, none performs anything, none returns a secret. This one does all three
 * — it checks a key, it reaches into SecretStorage, and what comes back is a config file entire.
 * Putting it beside them would have made that paragraph false for one route in four, which is how
 * a rule stops being read.</p>
 *
 * <p>Pure: the lookup and the reads are supplied. So "a wrong key gets nothing", "a revoked key
 * gets nothing" and "the answer names the entry it came from" are unit tests rather than
 * something to verify by starting a window and pasting.</p>
 */

/** One entry the route can serve, as this module needs to see it. */
export interface ConfigHolder extends ConfigKeyHolder {
  readonly entityName: string;
  readonly format: string;
}

export interface ConfigRouteSources {
  /** Every entry that carries a config key hash. Absent for a window with no vault open. */
  holders?: () => readonly ConfigHolder[];
  /** The stored body. Separate from the lookup so the keychain is touched only after a match. */
  body?: (holder: ConfigHolder) => Promise<string | undefined>;
  /** Called for every attempt, matched or not — see `agentAuditLog.ts` on the fourth door. */
  audit?: (line: ConfigReadAudit) => void;
}

export interface ConfigReadAudit {
  /** A log-safe label, never the key. */
  readonly key: string;
  readonly entityName: string;
  readonly outcome: 'served' | 'unknown key' | 'gone';
}

export type ConfigRouteResult =
  | { readonly status: 200; readonly body: ConfigReadBody }
  | { readonly status: 401 | 404; readonly error: string };

/**
 * Answer a config read.
 *
 * <p>The refusals are deliberately indistinguishable from outside: a key that matches nothing and
 * a key whose entry has since lost its body both answer 401 with the same sentence. Telling them
 * apart would turn this route into an oracle for which keys are real, which is the one thing an
 * unauthenticated caller could usefully learn from it.</p>
 *
 * <p>The audit line DOES tell them apart, because the person reading it is the owner.</p>
 */
export async function configRouteResult(
  key: string,
  sources: ConfigRouteSources,
): Promise<ConfigRouteResult> {
  const holder = findConfigKeyHolder(key, holdersOf(sources));
  if (holder === undefined) {
    note(sources, key, '', 'unknown key');
    return REFUSED;
  }
  const body = await sources.body?.(holder);
  if (body === undefined) {
    note(sources, key, holder.entityName, 'gone');
    return REFUSED;
  }
  note(sources, key, holder.entityName, 'served');
  return { status: 200, body: { format: holder.format, body } };
}

/**
 * The whole HTTP half, so `credsAgentServer.ts` keeps four lines rather than thirty.
 *
 * <p>Extracted for the reason `brokerReadRoutes.ts` was extracted from the same file: it sits at
 * its line ceiling, and this needs nothing on it. A wrong METHOD answers 404 rather than 405 —
 * the same answer any other unknown path gets, so probing for which paths exist learns nothing
 * from the verb.</p>
 */
export async function answerConfigRead(
  method: string | undefined,
  authorization: string | undefined,
  sources: ConfigRouteSources,
): Promise<ConfigRouteResult> {
  return method === 'POST'
    ? configRouteResult(parseBearer(authorization) ?? '', sources)
    : { status: 404, error: 'No such endpoint.' };
}

/** An absent supplier is a window with no vault open, which is a configuration, not a fault. */
function holdersOf(sources: ConfigRouteSources): readonly ConfigHolder[] {
  return sources.holders?.() ?? [];
}

function note(
  sources: ConfigRouteSources,
  key: string,
  entityName: string,
  outcome: ConfigReadAudit['outcome'],
): void {
  sources.audit?.({ key: describeConfigKey(key), entityName, outcome });
}

/** One sentence for both refusals, so the route cannot be used to tell real keys from invented ones. */
const REFUSED: ConfigRouteResult = {
  status: 401,
  error: 'That key does not open a config in this window.',
};
