import { VpnType } from './types';

/**
 * Composing the line that brings a VPN tunnel up or down.
 *
 * <p>Pure and free of `vscode`: every branch here is per-type and per-platform, and the
 * one thing that must not be discovered by clicking is which of them is wrong.</p>
 *
 * <p>Both supported tools need root or Administrator — they create a network interface,
 * which is not a thing an editor extension can be given permission to do. So the command
 * is <b>shown in a terminal</b> and the elevation prompt is the operating system's, not
 * ours: on Windows through `Start-Process -Verb RunAs` (a UAC dialog), on POSIX through
 * `sudo` (a password prompt in the terminal you are looking at). Nothing is elevated
 * silently, and nothing is hidden.</p>
 */

export type VpnPlatform = 'win32' | 'darwin' | 'linux';

export type VpnLaunch =
  /** A shell line to run, and what the user should expect when it does. */
  | { kind: 'run'; command: string; note: string }
  /** This type cannot be started this way, and here is why. */
  | { kind: 'unsupported'; reason: string };

/**
 * The types that are a FILE a binary can be pointed at. IKEv2 and L2TP are OS-level
 * profiles configured in system settings; a button for them could only ever fail.
 */
export const VPN_STARTABLE: readonly VpnType[] = ['wireguard', 'openvpn'];

export function isVpnStartable(type: VpnType | undefined): boolean {
  return type !== undefined && VPN_STARTABLE.includes(type);
}

/**
 * A WireGuard interface name. `wg-quick` takes the interface from the FILE name, and the
 * kernel's IFNAMSIZ is 16 including the NUL — so this is a hard limit, not a preference,
 * and a tunnel called "Work VPN — Frankfurt (prod)" fails to come up without it.
 */
export function vpnTunnelName(entityName: string): string {
  const cleaned = entityName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_=+.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 15)
    .replace(/[_.-]+$/, '');
  return cleaned.length > 0 ? cleaned : 'vpn';
}

/** The file name each tool expects: wg-quick insists on `.conf`, OpenVPN reads `.ovpn`. */
export function vpnConfigFileName(type: VpnType, entityName: string): string {
  const base = vpnTunnelName(entityName);
  return type === 'openvpn' ? base + '.ovpn' : base + '.conf';
}

/** PowerShell single-quoted string escaping — a path may legitimately contain an apostrophe. */
function psQuote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

/** `Start-Process -Verb RunAs` — the only way to reach Administrator without an elevated shell. */
function elevatedWindows(exe: string, args: string): string {
  return 'Start-Process -Verb RunAs -FilePath ' + psQuote(exe) + ' -ArgumentList ' + psQuote(args);
}

const WG_WINDOWS_NOTE =
  'Windows will show a UAC prompt: WireGuard installs the tunnel as a service, which needs Administrator. ' +
  'The tunnel then stays up until you Stop it — it survives closing VS Code, deliberately.';

const WG_POSIX_NOTE =
  'sudo will ask for your password in the terminal: wg-quick creates a network interface, which needs root. ' +
  'The tunnel stays up until you Stop it.';

const OVPN_WINDOWS_NOTE =
  'Windows will show a UAC prompt, and OpenVPN runs in its OWN elevated window — closing that window is how ' +
  'you disconnect. It needs Administrator to create the TUN adapter.';

const OVPN_POSIX_NOTE =
  'sudo will ask for your password: OpenVPN needs root for the TUN device. It runs in the FOREGROUND of this ' +
  'terminal — press Ctrl+C here to disconnect.';

export function vpnStartCommand(
  type: VpnType,
  platform: VpnPlatform,
  configPath: string,
): VpnLaunch {
  if (type === 'wireguard') {
    return platform === 'win32'
      ? {
          kind: 'run',
          command: elevatedWindows('wireguard.exe', '/installtunnelservice "' + configPath + '"'),
          note: WG_WINDOWS_NOTE,
        }
      : { kind: 'run', command: 'sudo wg-quick up "' + configPath + '"', note: WG_POSIX_NOTE };
  }

  if (type === 'openvpn') {
    return platform === 'win32'
      ? {
          kind: 'run',
          command: elevatedWindows('openvpn.exe', '--config "' + configPath + '"'),
          note: OVPN_WINDOWS_NOTE,
        }
      : { kind: 'run', command: 'sudo openvpn --config "' + configPath + '"', note: OVPN_POSIX_NOTE };
  }

  return {
    kind: 'unsupported',
    reason:
      'A ' +
      type.toUpperCase() +
      ' connection is a profile in the operating system network settings, not a config file a program ' +
      'can be pointed at. Use Save Config to write the file out, then import it where your OS expects it. ' +
      'Only WireGuard and OpenVPN can be started from here.',
  };
}

export function vpnStopCommand(
  type: VpnType,
  platform: VpnPlatform,
  tunnelName: string,
  configPath: string,
): VpnLaunch {
  if (type === 'wireguard') {
    return platform === 'win32'
      ? {
          // The service is named after the tunnel, and by now the .conf may be long gone —
          // this must not depend on a file still being there.
          kind: 'run',
          command: elevatedWindows('wireguard.exe', '/uninstalltunnelservice ' + tunnelName),
          note: 'Windows will show a UAC prompt. This removes the tunnel service, which is what brings it down.',
        }
      : {
          kind: 'run',
          command: 'sudo wg-quick down "' + configPath + '"',
          note: 'sudo will ask for your password. This tears the interface down.',
        };
  }

  if (type === 'openvpn') {
    return {
      kind: 'unsupported',
      reason:
        platform === 'win32'
          ? 'OpenVPN runs in its own elevated window — close that window to disconnect. There is no Stop ' +
            'command here because killing every openvpn process on the machine is not a Stop button.'
          : 'OpenVPN runs in the foreground of the terminal it started in — press Ctrl+C there to disconnect. ' +
            'There is no Stop command here because killing every openvpn process on the machine is not a Stop button.',
    };
  }

  return { kind: 'unsupported', reason: 'Only WireGuard tunnels can be stopped from here.' };
}
