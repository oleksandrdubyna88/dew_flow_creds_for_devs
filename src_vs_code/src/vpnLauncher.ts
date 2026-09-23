import { EntityMetadata } from './types';
import { ShellFamily, quoteFor } from './hostShell';
import { isVpnStartable, vpnTunnelName } from './vpnCommand';

/**
 * A VPN started by a Terminal entry the person wrote (issue #103) — the pure half.
 *
 * <p>The built-in launcher knows two tools on three platforms. Everything else — an IKEv2 profile
 * brought up with `rasdial`, a corporate client with its own CLI, OpenVPN from a path nobody
 * probes — is knowledge only the person has, so they write it once as a Terminal entry and name it
 * as this VPN's launcher. The one thing the entry cannot know is where the stored config lands on
 * THIS machine, and `{config}` is how it asks.</p>
 */

/** Where the materialized config path goes in the launcher's command. */
export const CONFIG_TOKEN = '{config}';

export function usesConfig(line: string): boolean {
  return line.includes(CONFIG_TOKEN);
}

/**
 * The launcher's line with every `{config}` replaced by the path, quoted for the shell that will
 * read it. The path is the extension's own (`keys/<pid>/<sanitised name><ext>`), never text from
 * the entry — and it is quoted anyway, because a storage directory can contain a space or an
 * apostrophe (`C:\Users\o'brien\…`).
 */
export function substituteConfig(line: string, configPath: string, family: ShellFamily): string {
  return line.split(CONFIG_TOKEN).join(quoteFor(family, configPath));
}

/**
 * The file name the config is materialized under. The extension of the file the person uploaded
 * is kept when it is a plain one — a launcher for `.pbk` or `.xml` expects that, not `.conf` — and
 * falls back to what the built-in tools expect. The base is `vpnTunnelName`'s allow-list, so no
 * part of the name reaches a path unsanitised.
 */
export function launcherConfigFileName(details: EntityMetadata): string {
  const uploaded = /\.([a-z0-9]{1,10})$/i.exec(details.vpnConfigFileName ?? '');
  const extension = uploaded === null ? (details.vpnType === 'openvpn' ? 'ovpn' : 'conf') : uploaded[1].toLowerCase();
  return `${vpnTunnelName(details.name)}.${extension}`;
}

/**
 * Whether *Start VPN* can do anything for this entry: a built-in tool, or a launcher the person
 * named — which is exactly how an IKEv2 or L2TP entry becomes startable at all.
 */
export function canStartVpn(details: EntityMetadata): boolean {
  return isVpnStartable(details.vpnType) || (details.vpnLauncherEntityId ?? '') !== '';
}

/** Stop with a launcher: this extension did not start the process and has no business guessing it. */
export function launcherStopNote(launcherName: string): string {
  return `This VPN is started by "${launcherName}", so it is stopped where that runs — in its own window or terminal. CredsForDevs does not guess which process to end.`;
}
