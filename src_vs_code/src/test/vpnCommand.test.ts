import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VPN_STARTABLE,
  vpnConfigFileName,
  vpnStartCommand,
  vpnStopCommand,
  vpnTunnelName,
} from '../vpnCommand';

/**
 * Composing the line that brings a tunnel up. Pure and `vscode`-free, because the
 * interesting part is per-type and per-platform and every branch of it should be
 * assertable without a running editor.
 */

test('a WireGuard tunnel name obeys the kernel interface limit', () => {
  // IFNAMSIZ is 16 including the NUL, so 15 usable — and wg-quick takes the interface
  // name from the file name, which is why this is a naming rule and not cosmetics.
  assert.equal(vpnTunnelName('Work VPN — Frankfurt (prod)').length <= 15, true);
  assert.match(vpnTunnelName('Work VPN — Frankfurt (prod)'), /^[a-zA-Z0-9_=+.-]{1,15}$/);
});

test('a name that sanitizes to nothing still yields a usable interface', () => {
  assert.match(vpnTunnelName('———'), /^[a-zA-Z0-9_=+.-]{1,15}$/);
});

test('the config file name carries the extension each tool expects', () => {
  assert.equal(vpnConfigFileName('wireguard', 'Work VPN'), 'work_vpn.conf');
  assert.equal(vpnConfigFileName('openvpn', 'Work VPN'), 'work_vpn.ovpn');
});

test('WireGuard on Windows installs the tunnel service under UAC', () => {
  const r = vpnStartCommand('wireguard', 'win32', 'C:\\tmp\\work_vpn.conf');

  assert.equal(r.kind, 'run');
  if (r.kind !== 'run') return;
  assert.match(r.command, /installtunnelservice/);
  assert.match(r.command, /RunAs/);
  // The path must survive a space; a VPN whose folder has one is not exotic.
  const spaced = vpnStartCommand('wireguard', 'win32', 'C:\\Program Files\\x.conf');
  assert.equal(spaced.kind === 'run' && spaced.command.includes('"C:\\Program Files\\x.conf"'), true);
});

test('WireGuard on Linux and macOS uses wg-quick with sudo', () => {
  for (const platform of ['linux', 'darwin'] as const) {
    const r = vpnStartCommand('wireguard', platform, '/tmp/work_vpn.conf');
    assert.equal(r.kind, 'run');
    if (r.kind !== 'run') continue;
    assert.match(r.command, /^sudo wg-quick up "\/tmp\/work_vpn\.conf"$/);
  }
});

test('OpenVPN runs the config on every platform', () => {
  const win = vpnStartCommand('openvpn', 'win32', 'C:\\tmp\\a.ovpn');
  const nix = vpnStartCommand('openvpn', 'linux', '/tmp/a.ovpn');

  assert.equal(win.kind === 'run' && /--config/.test(win.command), true);
  assert.equal(nix.kind === 'run' && nix.command === 'sudo openvpn --config "/tmp/a.ovpn"', true);
});

test('IKEv2, L2TP and "other" are refused with a reason, not a broken command', () => {
  // These are OS-level profiles, not a file a binary can be pointed at. Offering a
  // button that always fails is worse than not offering one.
  for (const type of ['ikev2', 'l2tp', 'other'] as const) {
    const r = vpnStartCommand(type, 'linux', '/tmp/x');
    assert.equal(r.kind, 'unsupported');
    if (r.kind !== 'unsupported') continue;
    assert.ok(r.reason.length > 0);
  }
  assert.deepEqual([...VPN_STARTABLE].sort(), ['openvpn', 'wireguard']);
});

test('stopping WireGuard names the tunnel, not the file, on Windows', () => {
  // /uninstalltunnelservice takes the service name; the .conf may be long gone.
  const r = vpnStopCommand('wireguard', 'win32', 'work_vpn', 'C:\\tmp\\work_vpn.conf');

  assert.equal(r.kind, 'run');
  assert.equal(r.kind === 'run' && r.command.includes('/uninstalltunnelservice work_vpn'), true);
});

test('stopping WireGuard on POSIX uses the config path wg-quick brought up', () => {
  const r = vpnStopCommand('wireguard', 'linux', 'work_vpn', '/tmp/work_vpn.conf');

  assert.equal(r.kind === 'run' && r.command === 'sudo wg-quick down "/tmp/work_vpn.conf"', true);
});

test('OpenVPN has no stop command, and says why', () => {
  // It runs in the foreground; killing every openvpn on the box is not a Stop button.
  const r = vpnStopCommand('openvpn', 'linux', 'a', '/tmp/a.ovpn');

  assert.equal(r.kind, 'unsupported');
  assert.equal(r.kind === 'unsupported' && /Ctrl/.test(r.reason), true);
});

test('every startable command explains what to expect before it runs', () => {
  for (const type of VPN_STARTABLE) {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const r = vpnStartCommand(type, platform, '/tmp/x.conf');
      assert.equal(r.kind, 'run');
      if (r.kind !== 'run') continue;
      assert.ok(r.note.length > 0, `no note for ${type}/${platform}`);
      // Both of these need root or Administrator. A note that does not say so is a
      // note that lets somebody file a bug against a UAC prompt.
      assert.match(r.note, /administrator|root|elevat|sudo|UAC/i);
    }
  }
});
