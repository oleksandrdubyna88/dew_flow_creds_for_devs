import { VpnType } from './types';

/**
 * Finding the binary that can actually start a VPN on this machine.
 *
 * <p>Exists because the composed command assumed `openvpn.exe` was on PATH, and on a
 * default Windows install it never is: the community edition puts itself in
 * `Program Files\\OpenVPN\\bin` without touching PATH, and half the machines that "have
 * OpenVPN" actually have <b>OpenVPN Connect</b> — a different product that neither takes
 * `--config` nor belongs on a command line, and that may already be holding the tunnel
 * up. `Start-Process : cannot find the file` was the whole user experience.</p>
 *
 * <p>Pure: the PATH lookup and the filesystem are injected, so every branch is a unit
 * test rather than a machine configuration.</p>
 */

export type VpnLauncher =
  /** A CLI that takes the config on its command line — bare name or full path. */
  | { kind: 'cli'; exe: string }
  /** OpenVPN Connect, the GUI. Can import a profile; cannot be driven like the CLI. */
  | { kind: 'openvpn-connect'; exe: string }
  /** Nothing usable. `looked` names every place that was tried. */
  | { kind: 'missing'; looked: string[] };

function programDirs(env: Readonly<Record<string, string | undefined>>): string[] {
  const dirs = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432];
  return [...new Set(dirs.filter((d): d is string => d !== undefined && d.length > 0))];
}

// eslint-disable-next-line complexity
export function resolveVpnLauncher(
  type: VpnType,
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  onPath: (name: string) => boolean,
  exists: (absolutePath: string) => boolean,
): VpnLauncher {
  const bare = platform === 'win32'
    ? (type === 'wireguard' ? 'wireguard.exe' : 'openvpn.exe')
    : (type === 'wireguard' ? 'wg-quick' : 'openvpn');

  if (onPath(bare)) {
    return { kind: 'cli', exe: bare };
  }

  const looked: string[] = [bare + ' (on PATH)'];
  if (platform !== 'win32') {
    return { kind: 'missing', looked };
  }

  const sub = type === 'wireguard' ? 'WireGuard\\wireguard.exe' : 'OpenVPN\\bin\\openvpn.exe';
  for (const dir of programDirs(env)) {
    const candidate = dir + '\\' + sub;
    looked.push(candidate);
    if (exists(candidate)) {
      return { kind: 'cli', exe: candidate };
    }
  }

  // Second-best, checked only after every real CLI location: the GUI product.
  if (type === 'openvpn') {
    for (const dir of programDirs(env)) {
      const candidate = dir + '\\OpenVPN Connect\\OpenVPNConnect.exe';
      looked.push(candidate);
      if (exists(candidate)) {
        return { kind: 'openvpn-connect', exe: candidate };
      }
    }
  }

  return { kind: 'missing', looked };
}
