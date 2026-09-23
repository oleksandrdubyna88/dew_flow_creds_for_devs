import { EntityMetadata } from './types';

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
 */
export function cliCommandFor(details: EntityMetadata, alias: string): string {
  // First hit wins, in the order the CLI's own usage text lists the verbs.
  const rules: ReadonlyArray<[boolean, string]> = [
    [details.isSshEnabled === true || details.host !== undefined, 'ssh'],
    [details.isDb === true, 'db'],
    [details.isTerminal === true, 'run'],
    [details.isScript === true, 'script'],
    [details.isVpn === true, 'vpn-up'],
    [details.isConfig === true, 'config'],
  ];
  const verb = rules.find(([applies]) => applies)?.[1] ?? 'env';
  return `creds ${verb} ${alias}`;
}
