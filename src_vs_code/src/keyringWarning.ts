/**
 * Whether to warn that this machine may have no real keychain behind
 * `SecretStorage` — and the wording, which matters as much as the decision.
 *
 * <p><b>What is actually true.</b> VS Code's `SecretStorage` is Electron's
 * `safeStorage`, which is Chromium's `os_crypt`. On Linux that picks a backend by
 * probing for a reachable Secret Service. When none answers — a headless box, a
 * minimal container, WSL used as a plain shell, an SSH session with no D-Bus, or
 * simply a desktop-environment detection miss — it silently selects `BASIC_TEXT`,
 * which is obfuscation rather than encryption: PBKDF2-HMAC-SHA1 with the literal
 * salt "saltysalt", one iteration, and a password that is a constant in Chromium's
 * own source. Anyone who can read the file can reverse it.</p>
 *
 * <p><b>And VS Code says nothing when it happens</b> (microsoft/vscode#204552) —
 * the downgrade is visible only in verbose logs. This product's listing claims
 * secrets live in the OS keychain, so on those machines the claim is false and the
 * person is never told. That is the gap this closes.</p>
 *
 * <p><b>Why this is a heuristic and is described as one.</b> Nothing exposes which
 * backend was chosen. The strongest cheap signal is the absence of a D-Bus session
 * address, because the Secret Service is reached over D-Bus — but a working
 * keyring behind an unusual setup would trip it, so the message says "may" and
 * tells the reader how to check, rather than asserting a fault it cannot see.</p>
 *
 * <p>Pure and `vscode`-free: the decision and the text are unit tests.</p>
 */

export interface KeyringProbe {
  platform: NodeJS.Platform;
  /** `process.env.DBUS_SESSION_BUS_ADDRESS`. */
  dbusAddress: string | undefined;
  /** `vscode.env.remoteName` — set when the extension host is not local. */
  remoteName: string | undefined;
}

/**
 * Whether the keychain behind SecretStorage is in doubt on this machine.
 *
 * <p>Only Linux: macOS always has the Keychain and Windows always has DPAPI, so a
 * warning there would be noise that teaches people to dismiss warnings.</p>
 */
export function keyringMayBeUnprotected(probe: KeyringProbe): boolean {
  if (probe.platform !== 'linux') {
    return false;
  }
  return probe.dbusAddress === undefined || probe.dbusAddress.length === 0;
}

/**
 * What to say. Names the mechanism, admits the uncertainty, and ends with the fix
 * — a warning that leaves someone unable to act is a warning they learn to ignore.
 */
export function keyringWarningMessage(): string {
  return (
    'No D-Bus session was found, so this machine may have no OS keyring for VS Code to use. ' +
    'When none is reachable, VS Code silently falls back to a basic store that is obfuscated ' +
    'rather than encrypted — your saved passwords and keys would then be recoverable by anyone ' +
    'who can read the file, and nothing else would tell you. ' +
    'Install gnome-keyring or kwallet and sign in again, or treat this vault as unprotected at rest.'
  );
}
