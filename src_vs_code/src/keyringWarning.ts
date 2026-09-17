/**
 * Whether to warn that this machine may have no real keychain behind
 * `SecretStorage` — and the wording, which matters as much as the decision.
 *
 * <p><b>What is actually true.</b> VS Code's `SecretStorage` is Electron's
 * `safeStorage`, which is Chromium's `os_crypt`. On Linux it SELECTS a backend
 * first and only then tries it: the selection reads the desktop environment
 * (`XDG_CURRENT_DESKTOP`, `DESKTOP_SESSION`) and picks libsecret for a GNOME-like
 * session, kwallet for KDE, and `BASIC_TEXT` for anything else — including a
 * session that advertises no desktop at all. Whatever it picks, a backend that
 * fails to initialise falls back to `BASIC_TEXT` too. That store is obfuscation
 * rather than encryption: PBKDF2-HMAC-SHA1 with the literal salt "saltysalt", one
 * iteration, and a password that is a constant in Chromium's own source. Anyone
 * who can read the file can reverse it.</p>
 *
 * <p><b>And VS Code says nothing when it happens</b> (microsoft/vscode#204552) —
 * the downgrade is visible only in verbose logs. This product's listing claims
 * secrets live in the OS keychain, so on those machines the claim is false and the
 * person is never told. That is the gap this closes.</p>
 *
 * <p><b>Why the first version of this check was not enough — measured 2026-09-17.</b>
 * It asked one question: is there a D-Bus session address? On a WSL distribution
 * with `systemd=true` the answer is YES, so it stayed silent — while that same
 * distribution had no `org.freedesktop.secrets` on the bus (not even activatable),
 * no libsecret anywhere on disk, no kwalletd, and an empty `XDG_CURRENT_DESKTOP`.
 * Chromium picks `BASIC_TEXT` there with certainty, and the check said nothing. A
 * false negative in a security warning is worse than no warning, because the silence
 * reads as an answer. So the one question is now three, reported together the way a
 * connect refusal reports every reason.</p>
 *
 * <p><b>Why this is still a heuristic and is still described as one.</b> Nothing
 * exposes which backend was chosen — `safeStorage.getSelectedStorageBackend()` exists
 * in Electron and not in the extension API — and `--password-store=` on the command
 * line bypasses the detection entirely. So the message says "may" and names what is
 * missing, rather than asserting a fault it cannot see.</p>
 *
 * <p>The FULL diagnosis — asking the bus whether the service is absent, present but
 * locked, or open, and offering the distribution's install command — belongs to
 * `PLAN_tails_2.md` §2 and is deliberately not attempted here. This module decides
 * whether there is reason to doubt, which is what that plan builds on.</p>
 *
 * <p>Pure and `vscode`-free: the decision and the text are unit tests.</p>
 */

/** Each reason to doubt, ordered by what has to be fixed FIRST. */
export const KEYRING_DOUBTS = [
  'no-secret-service-client',
  'no-session-bus',
  'no-desktop-environment',
] as const;

export type KeyringDoubt = (typeof KEYRING_DOUBTS)[number];

export interface KeyringProbe {
  platform: NodeJS.Platform;
  /** `process.env.DBUS_SESSION_BUS_ADDRESS`. */
  dbusAddress: string | undefined;
  /** `process.env.XDG_CURRENT_DESKTOP`. */
  desktop: string | undefined;
  /** `process.env.DESKTOP_SESSION` — the older spelling of the same fact. */
  desktopSession: string | undefined;
  /**
   * Whether ANY Secret Service client is installed — see `SECRET_SERVICE_CLIENTS`.
   *
   * <p>A boolean rather than a path list, because the decision has no use for which
   * one: Chromium reaches libsecret by `dlopen` and kwallet over the bus, and with
   * neither present there is nothing for it to reach.</p>
   */
  secretServiceClientInstalled: boolean;
}

/**
 * Where a Secret Service client lives, if one is installed.
 *
 * <p>Multiarch (Debian/Ubuntu), `lib64` (Fedora/RHEL) and plain `lib` (Arch), plus the
 * two kwallet daemons. Exported so the list is readable and testable rather than buried
 * in the host — and so a distribution that keeps them elsewhere is a line to add rather
 * than a rewrite. Being generous here is the safe direction: a path this list misses
 * produces a warning nobody needed, never a silence somebody did.</p>
 */
export const SECRET_SERVICE_CLIENTS: readonly string[] = [
  '/usr/lib/x86_64-linux-gnu/libsecret-1.so.0',
  '/usr/lib/aarch64-linux-gnu/libsecret-1.so.0',
  '/usr/lib64/libsecret-1.so.0',
  '/usr/lib/libsecret-1.so.0',
  '/usr/bin/kwalletd5',
  '/usr/bin/kwalletd6',
];

/**
 * Every reason to doubt this machine's keychain, ordered — or empty, meaning none.
 *
 * <p>Only Linux: macOS always has the Keychain and Windows always has DPAPI, so a
 * warning there would be noise that teaches people to dismiss warnings.</p>
 *
 * <p>ALL of them, not the first, and that is the rule the connect refusals already
 * follow: somebody who installs gnome-keyring and is only THEN told that their session
 * advertises no desktop is somebody who stops reading. On the measured WSL distribution
 * two of the three hold at once, and either alone sends the reader somewhere that does
 * not fix it.</p>
 */
export function keyringDoubts(probe: KeyringProbe): readonly KeyringDoubt[] {
  if (probe.platform !== 'linux') {
    return [];
  }
  return KEYRING_DOUBTS.filter((doubt) => doubtHolds(doubt, probe));
}

/** The question callers actually ask, now answered by the list above. */
export function keyringMayBeUnprotected(probe: KeyringProbe): boolean {
  return keyringDoubts(probe).length > 0;
}

function doubtHolds(doubt: KeyringDoubt, probe: KeyringProbe): boolean {
  if (doubt === 'no-secret-service-client') {
    return !probe.secretServiceClientInstalled;
  }
  if (doubt === 'no-session-bus') {
    return isBlank(probe.dbusAddress);
  }
  // Chromium SELECTS the store from the desktop environment before it tries anything, so
  // a session advertising none never reaches a keyring however much is installed.
  return isBlank(probe.desktop) && isBlank(probe.desktopSession);
}

const isBlank = (value: string | undefined): boolean => value === undefined || value.length === 0;

const CLAUSES: Readonly<Record<KeyringDoubt, string>> = {
  'no-secret-service-client':
    'no Secret Service client is installed — neither libsecret nor kwallet is on it',
  'no-session-bus': 'no D-Bus session was found, and both backends are reached over one',
  'no-desktop-environment':
    'no desktop environment is advertised, and VS Code picks the store from that BEFORE it tries ' +
    'anything, so a session without one gets the basic store however much is installed',
};

/**
 * What to say. Names what is missing, admits the uncertainty, says WHICH machine, and ends
 * with the fix — a warning that leaves someone unable to act is a warning they learn to
 * ignore.
 *
 * <p><b>Which machine is not a detail</b> (`PLAN_tails_2.md` §2.3). The extension is
 * `extensionKind: ["ui"]`, so its host stays on the computer running the VS Code window
 * even when that window is attached to WSL or a Remote-SSH host — and a reader who installs
 * gnome-keyring on the machine they connected TO will find it did not help. This names the
 * machine; the live diagnosis and the install command are still that plan's.</p>
 *
 * <p>An empty list still produces a sentence rather than nothing. A message function that
 * returns `''` invites a caller that shows an empty warning and never notices; saying
 * "nothing specific was detected" makes a wrong call visible in the one place it would
 * otherwise hide.</p>
 */
export function keyringWarningMessage(doubts: readonly KeyringDoubt[]): string {
  return [
    'The computer running this VS Code window — not a machine you are connected to — may have',
    `no OS keyring for VS Code to use: ${reasons(doubts)}.`,
    'When none is reachable, VS Code silently falls back to a basic store that is obfuscated',
    'rather than encrypted — your saved passwords and keys would then be recoverable by anyone',
    'who can read the file, and nothing else would tell you. Install gnome-keyring or kwallet on',
    'that computer, make sure it is running in the session VS Code was started from, and sign in',
    'again — or treat this vault as unprotected at rest.',
  ].join(' ');
}

function reasons(doubts: readonly KeyringDoubt[]): string {
  return doubts.length === 0
    ? 'nothing specific was detected'
    : doubts.map((doubt) => CLAUSES[doubt]).join('; and ');
}
