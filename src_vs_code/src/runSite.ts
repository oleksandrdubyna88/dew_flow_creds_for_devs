import type { ErrorCode } from './brokerProtocol';

/**
 * Where a stored command or script runs when an agent asks for it through a Remote Bridge (parent plan §4.6; change 11.1, the 72-hour
 * slice, S4). Pure: imports no `vscode`, reads no vault.
 *
 * <p>The table, for an entry with no SSH link (a linked Terminal entry is refused on a bridge before this is asked, `linkedCall`):</p>
 * <ul>
 *   <li>"Runs on" Windows: <b>this computer</b>, every `creds://` value in the child's environment only and masked out of what goes back;</li>
 *   <li>"Runs on" not set or Linux, no `creds://` reference and no injected variable: <b>the server</b>, over the bridge's own SSH entry, the
 *       line or the script as written;</li>
 *   <li>"Runs on" not set or Linux with a `creds://` reference: <b>refused</b>, because the value would have to reach the server;</li>
 *   <li>a script that injects a variable, "Runs on" not set or Linux: <b>refused</b>, because nothing marks which variable holds a secret;</li>
 *   <li>"Runs on" macOS: <b>refused</b>; the bridge's server is Linux and this computer is not a Mac that the line was written for.</li>
 * </ul>
 *
 * <p>Off a bridge nobody asks this: the laptop path is unchanged. Adding a reference to a line never moves it silently to another machine:
 * it refuses until the person sets "Runs on" to Windows.</p>
 */
export type BridgedRunSite =
  | { readonly kind: 'server' }
  | { readonly kind: 'laptop' }
  | { readonly kind: 'refused'; readonly code: ErrorCode; readonly message: string };

/** What the decision reads of one stored entry, after `{name}` was filled: the references and the variables are counted on what would run. */
export interface RunSiteInput {
  readonly entityName: string;
  readonly terminalOs: string | undefined;
  /** At least one `creds://` reference in the command, an argument, the script body or a variable's value. */
  readonly hasReferences: boolean;
  /** A script whose enabled named variables would be put in the child's environment (`resolveScriptEnv(…).env` is not empty). */
  readonly injectsVariables: boolean;
}

/** A line with a `creds://` reference whose "Runs on" is not Windows: the value would have to reach the server. */
export function REFERENCE_ON_SERVER(entityName: string): string {
  return `"${entityName}" holds a creds:// reference, and through a Remote Bridge it would run on the server, so the value would have to go there. Nothing ran. To run it on this computer with the value kept here, set its "Runs on" to Windows.`;
}

/** A script that injects a variable, whose "Runs on" is not Windows: any variable may hold a secret, and nothing marks which. */
export function VARIABLES_ON_SERVER(entityName: string): string {
  return `"${entityName}" puts variables into its environment, and through a Remote Bridge it would run on the server, where a variable that holds a secret would go too. Nothing ran. Move a secret value to a creds:// reference and set "Runs on" to Windows, or remove the variables.`;
}

/** A line written for macOS: the bridge's server is Linux and this computer is the person's Windows laptop. */
export function MACOS_ON_BRIDGE(entityName: string): string {
  return `"${entityName}" is written for macOS, and a Remote Bridge runs a stored line on its Linux server or on this Windows computer. Nothing ran. Change its "Runs on".`;
}

/**
 * What the scope pick says under every Terminal and script row (§4.6, Q10): a literal secret typed into a line cannot be told from any other
 * text, so the limit is said where the person chooses. Conditional, because a Windows row runs on this computer and a refused row runs nowhere.
 */
export const SERVER_TEXT_AS_WRITTEN = 'When it runs on the server, its stored command or script goes there as written: keep secrets in creds:// references.';

/** The pick row's detail line for an entry of `kind`: the sentence above for a Terminal or script entry, nothing for any other. */
export function scopePickDetail(kind: string | undefined): string | undefined {
  return kind === 'terminal' || kind === 'script' ? SERVER_TEXT_AS_WRITTEN : undefined;
}

const refused = (message: string): BridgedRunSite => ({ kind: 'refused', code: 'denied', message });

/** The decision of §4.6's table. `denied` for every refusal: a 404 would send the client on to look for the entry in another window. */
export function decideRunSite(input: RunSiteInput): BridgedRunSite {
  if (input.terminalOs === 'windows') {
    return { kind: 'laptop' };
  }
  if (input.terminalOs === 'macos') {
    return refused(MACOS_ON_BRIDGE(input.entityName));
  }
  return serverRow(input);
}

/** "Runs on" not set or Linux: the server, unless a value would have to travel there. */
function serverRow(input: RunSiteInput): BridgedRunSite {
  if (input.hasReferences) {
    return refused(REFERENCE_ON_SERVER(input.entityName));
  }
  return input.injectsVariables ? refused(VARIABLES_ON_SERVER(input.entityName)) : { kind: 'server' };
}
