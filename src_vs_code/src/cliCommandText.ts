import { EntityMetadata } from './types';
import { canConnectSsh } from './entityKind';

/**
 * What an entry's CLI alias looks like typed into a terminal — its own module since issue #104,
 * when `entityViewPage.ts` reached its line ceiling and needed the room for the URL row.
 */

/**
 * The command a terminal runs for this entry through its CLI alias (T23a).
 *
 * <p>The verb follows the kind, from the CLI's own usage text — `creds ssh` for a host,
 * `creds db` for a database, `run`/`script` for commands, `env` for a bare secret, `vpn-up`
 * for a tunnel. The owner's complaint was exact: *"я сделал enable in CLI — и что теперь? я
 * даже скопировать это не могу"* — the mint succeeded and nothing anywhere showed the
 * result.</p>
 *
 * <p><b>A config entry takes no name.</b> `creds config` has no alias route: its key arrives on
 * stdin (`creds config -`) or in `CREDSFORDEVS_KEY`, and since cli 0.3.1 any argument is refused
 * (`PLAN_config_key_off_the_command_line.md`). The row showed `creds config <alias>` — a line that
 * never worked — so it shows the stdin form every snippet uses instead, and the alias is left out.</p>
 */
export function cliCommandFor(details: EntityMetadata, alias: string): string {
  const verb = cliVerbFor(details);
  return verb === 'config' ? 'creds config -' : `creds ${verb} ${alias}`;
}

/** The CLI verb this entry runs under — ONE decision, read by the command and by the name's note alike. */
function cliVerbFor(details: EntityMetadata): string {
  // First hit wins, in the order the CLI's own usage text lists the verbs.
  const rules: ReadonlyArray<[boolean, string]> = [
    // The tree's own Connect predicate: a host on a Terminal entry is not an ssh target (§4.5).
    [canConnectSsh(details), 'ssh'],
    [details.isDb === true, 'db'],
    [details.isTerminal === true, 'run'],
    [details.isScript === true, 'script'],
    [details.isVpn === true, 'vpn-up'],
    [details.isConfig === true, 'config'],
  ];
  return rules.find(([applies]) => applies)?.[1] ?? 'env';
}

/**
 * What a name does for this entry, said where *Enable in CLI* names one: for a config entry the name
 * is NOT in the command — the key on stdin is what reads it — so the sentence says what the name is for
 * (it lists the entry in `creds ls`) instead of implying it unlocks the config. Empty for every other kind,
 * whose command carries the name. Branches on the verb decision itself, not on the rendered text.
 */
export function cliAliasNote(details: EntityMetadata): string {
  return cliVerbFor(details) === 'config' ? ' — the key goes on stdin; the name only lists this config in creds ls' : '';
}
