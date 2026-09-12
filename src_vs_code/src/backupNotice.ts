import { BackupStatus } from './orgBackupClient';

/**
 * Whether a corporate deployment is backed up, and how loudly to say so.
 *
 * <p>Pure and `vscode`-free, so the wording and the cadence are tests rather than something read off
 * a screenshot at the wrong moment.</p>
 */

/** How often each kind of trouble may interrupt somebody. */
export const NOTICE_WINDOWS = {
  /** Nothing has ever been set up. A day: it is not urgent, and it is not going to fix itself. */
  unconfigured: 24 * 60 * 60 * 1000,
  /** The last run failed. An hour: every hour that passes is an hour with no fresh copy. */
  failing: 60 * 60 * 1000,
} as const;

/** What a deployment's backup is doing, reduced to the only three answers a notice cares about. */
export type BackupHealth = 'healthy' | 'unconfigured' | 'failing';

/** One notice, ready to show — or nothing, which is the answer most of the time. */
export interface BackupNotice {
  readonly message: string;
  readonly health: Exclude<BackupHealth, 'healthy'>;
  /** The window this notice was emitted under, so the caller records the right one. */
  readonly windowMs: number;
}

/** The per-account timestamps a notice has to remember to stay quiet. Persisted by the caller. */
export type NoticeMemory = Readonly<Record<string, number>>;

/**
 * What a status says about a deployment's health.
 *
 * <p><b>A key that nobody has acknowledged counts as unconfigured</b>, because it is: no run may seal
 * an archive under a key whose words reached no person, so the scheduler ticks every five minutes and
 * refuses every time. That is exactly the silent state this notice exists to end.</p>
 *
 * <p>A server too old for the feature (`configured: false`) is not nagged about. It cannot take a
 * backup and there is nothing an administrator can press to change that from here — a nag would be a
 * daily reminder to upgrade somebody else's deployment.</p>
 */
export function healthOf(status: BackupStatus): BackupHealth {
  if (!status.configured) {
    return 'healthy';
  }
  return notSetUp(status) ? 'unconfigured' : ranBadly(status);
}

/** No key that a run may use, or no run yet — the two shapes of "nothing is happening". */
function notSetUp(status: BackupStatus): boolean {
  return status.keyState !== 'Ready' || status.lastRunAt === 0;
}

/** A run that failed outright, and one that reached some destinations — both need saying. */
function ranBadly(status: BackupStatus): BackupHealth {
  return lastRunFailed(status) ? 'failing' : 'healthy';
}

/**
 * Whether the last run left something unfixed.
 *
 * <p>Exported so the tree's Backup row draws from the SAME list rather than a second copy of it:
 * a run that reached some destinations and not others is a success and a gap at once, and two
 * lists of which results mean that is how one of them comes to be missing the third.</p>
 */
export function lastRunFailed(status: BackupStatus): boolean {
  return FAILING_RESULTS.has(status.lastResult);
}

const FAILING_RESULTS: ReadonlySet<string> = new Set(['failed', 'partial']);

/**
 * The notice for ONE account, or nothing.
 *
 * <p>Deduped against what the caller remembers, per account and per window: `shown` is keyed by
 * account id and holds the instant that account last interrupted somebody. It is the caller's job to
 * persist it — in `globalState`, so it survives a window reload rather than nagging on every startup,
 * which is exactly the failure a purely in-memory version has.</p>
 */
export function backupNotice(
  accountId: string,
  email: string,
  status: BackupStatus,
  shown: NoticeMemory,
  now: number,
): BackupNotice | undefined {
  const health = healthOf(status);
  if (health === 'healthy') {
    return undefined;
  }
  const windowMs = NOTICE_WINDOWS[health];
  const last = shown[accountId] ?? 0;
  if (now - last < windowMs) {
    return undefined;
  }
  return { message: messageFor(email, status, health), health, windowMs };
}

/**
 * One message for however many accounts have something to say.
 *
 * <p>The same reading `lockedNotice.ts` makes, and for the same reason: three popups stack in the
 * corner, cover each other's buttons, and each names an account on a different line from the button
 * about to be pressed. With four accounts the last one is off-screen. "These deployments are not
 * backed up" is one fact about this machine, so it is one message — and the names are listed rather
 * than counted away, because the reason for the interruption is precisely that they cannot see it.</p>
 */
export function joinNotices(notices: readonly BackupNotice[]): string {
  if (notices.length === 1) {
    return notices[0].message;
  }
  return `Server backup: ${notices.length} deployments need attention — `
    + notices.map((notice) => notice.message).join(' ');
}

/** What to remember after showing them, so the next window is measured from now. */
export function remember(
  shown: NoticeMemory,
  accountIds: readonly string[],
  now: number,
): NoticeMemory {
  return { ...shown, ...Object.fromEntries(accountIds.map((id) => [id, now])) };
}

/**
 * Forget an account's window on a SUCCESSFUL run, so the next failure is heard at once.
 *
 * <p>Without it, a deployment that failed at 10:00, was fixed at 10:05 and failed again at 10:20
 * would say nothing until 11:00 — the window would be measuring the old trouble.</p>
 */
export function forget(shown: NoticeMemory, accountId: string): NoticeMemory {
  if (!(accountId in shown)) {
    // The SAME object, so a caller can tell "nothing changed" by identity and skip a write. A fresh
    // copy every time made every healthy account persist the map on every policy fetch.
    return shown;
  }
  const next = { ...shown };
  delete next[accountId];
  return next;
}

/** What each key state means for somebody who has to act on it. A lookup, not a ladder. */
const KEY_TROUBLE: Readonly<Record<string, string>> = {
  Absent: 'has no backup key, so nothing is being backed up. Mint one — its words are shown once '
    + 'and nothing can produce them again.',
  AwaitingAcknowledgement: 'has a key nobody has confirmed writing down, so every scheduled run is '
    + 'refusing. Mint again to see a fresh set of words.',
  Unreadable: 'has a key this server cannot open — its KEK changed, or the settings were restored '
    + 'from elsewhere. No archive can be sealed until it is replaced.',
  Ready: 'has never run.',
};

function messageFor(email: string, status: BackupStatus, health: BackupHealth): string {
  return health === 'failing'
    ? `Server backup for ${email} last ${failedHow(status)}`
    : `Server backup for ${email} ${KEY_TROUBLE[status.keyState] ?? 'has never run.'}`;
}

/** How it failed, and why — the reason travels, not only the word. */
function failedHow(status: BackupStatus): string {
  const what = status.lastResult === 'partial' ? 'ran partially' : 'FAILED';
  return status.lastError.length > 0 ? `${what}: ${status.lastError}` : `${what}.`;
}
