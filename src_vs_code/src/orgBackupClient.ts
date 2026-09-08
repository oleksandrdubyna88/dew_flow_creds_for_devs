import { CorpApiClient } from './corpApiClient';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';
import { StoredAccount } from './types';

/**
 * What the server's key file is in, as the status reports it.
 *
 * <p>Four states rather than a boolean, because "minted" and "usable" are different facts and the
 * gap between them is the one that matters: a key minted whose words reached nobody may not seal an
 * archive, and pressing mint again is the safe move. A boolean would make that state invisible and
 * the button wrong.</p>
 */
export type BackupKeyState = 'Absent' | 'AwaitingAcknowledgement' | 'Ready' | 'Unreadable';

/** One destination as the status page may see it — where it is and how it went, never its keys. */
export interface BackupTargetView {
  readonly kind: string;
  readonly where: string;
  readonly result: string;
  readonly error: string;
  /**
   * Whether the retention pass that follows an upload could run.
   *
   * <p>Separate from `error` because they are separate outcomes: an archive that ARRIVED at a
   * destination whose old archives can no longer be listed is a success and an unbounded directory
   * at once, and one field cannot say both.</p>
   */
  readonly retention: string;
  readonly at: number;
}

/** Everything the backup page draws, as `GET /api/org/backup/status` answers it. */
export interface BackupStatus {
  /** Whether this server can seal an archive at all — false when no deployment KEK is configured. */
  readonly configured: boolean;
  readonly keyState: BackupKeyState;
  readonly scheduleHourUtc: number;
  readonly retentionDays: number;
  readonly lastRunAt: number;
  readonly lastResult: string;
  readonly lastError: string;
  /** Derived by the server from the persisted result, never a second stored field. */
  readonly running: boolean;
  readonly localArchiveBytes: number;
  readonly localArchiveName: string;
  readonly targets: readonly BackupTargetView[];
}

/** A destination as an administrator describes it. Credentials omitted keep the ones already sealed. */
export interface BackupTargetInput {
  readonly kind: string;
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly accountName?: string;
  readonly accountKey?: string;
}

/**
 * What a settings save carries.
 *
 * <p><b>`targets` omitted means UNCHANGED; an empty array removes them all.</b> They are different
 * requests, so the field is optional here rather than defaulted — a client that defaulted it to `[]`
 * would silently turn a configured deployment back into a local-only one every time somebody edited
 * the schedule.</p>
 */
export interface BackupSettingsInput {
  readonly scheduleHourUtc: number;
  readonly retentionDays: number;
  readonly targets?: readonly BackupTargetInput[];
}

/** The words a person writes down, handed over the only time anybody can see them. */
export interface MintedBackupKey {
  readonly key: string;
  readonly entropyBits: number;
}

/** What a server too old for this feature answers with, read as a state rather than an error. */
export const NO_BACKUP_HERE: BackupStatus = {
  configured: false,
  keyState: 'Absent',
  scheduleHourUtc: 3,
  retentionDays: 30,
  lastRunAt: 0,
  lastResult: 'no backup here',
  lastError: '',
  running: false,
  localArchiveBytes: 0,
  localArchiveName: '',
  targets: [],
};

/**
 * Drives the six admin-only backup routes — `GET`/`PUT` settings, mint, run, download.
 *
 * <p>On `CorpApiClient` like every corporate client since epic 1, never a fourth copy of the
 * bearer/contract/timeout plumbing. What it adds is the three things the transport cannot know: the
 * shapes, the refusals that are STATES rather than errors, and a download that never holds the
 * archive in memory.</p>
 *
 * <p><b>A `404` is a server too old for the feature, not a failure.</b> The same reading
 * `readEvents` makes: a readiness cycle against an older server must not report an error about a
 * feature that server does not have. Every other refusal throws with the server's own sentence,
 * because the `/api/org/*` surface promises one on every refusal and an admin needs to know WHY.</p>
 *
 * <p>Pure of `vscode`, so what it sends is a unit test.</p>
 */
export class OrgBackupClient {
  private readonly api: CorpApiClient;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
  }

  /** Everything the page draws, or the "no backup here" state for a server that predates it. */
  async readStatus(account: StoredAccount): Promise<BackupStatus> {
    const response = await this.api.request(account, '/api/org/backup/status');
    if (response.status === 404) {
      return NO_BACKUP_HERE;
    }
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!isBackupStatus(body)) {
      throw new Error('The server answered the backup status in a shape this build cannot read.');
    }
    return body;
  }

  /**
   * Save the schedule, the window, and — when given — the destinations.
   *
   * <p>Validated HERE first, with the sentences the server would answer, so a typo does not cost a
   * round trip to a save that also probes every destination over the network.</p>
   */
  async saveSettings(account: StoredAccount, settings: BackupSettingsInput): Promise<void> {
    const problem = settingsProblem(settings);
    if (problem.length > 0) {
      throw new Error(problem);
    }
    const response = await this.api.request(account, '/api/org/backup/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
  }

  /**
   * Mint the key and take its words — the only time anybody can see them.
   *
   * <p>The caller must show them and must not store them: what the server keeps is the HKDF output,
   * and HKDF does not run backwards. A mint whose response never reaches a person leaves the key
   * AWAITING on the server, no run may seal an archive under it, and calling this again replaces the
   * unused one — which is why the safe retry is another mint rather than a locally cached copy.</p>
   */
  async mintKey(account: StoredAccount): Promise<MintedBackupKey> {
    const response = await this.api.request(account, '/api/org/backup/key', { method: 'POST' });
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!isMintedKey(body)) {
      throw new Error('The server answered the new backup key in a shape this build cannot read.');
    }
    return body;
  }

  /**
   * Ask for a backup now. The server answers `202` and carries on, or refuses with the reason.
   *
   * <p>A refusal here is a sentence an administrator can act on — no key yet, a key nobody has
   * acknowledged, a run already live — which is why it is not silence after a cheerful `202`.</p>
   */
  async runNow(account: StoredAccount): Promise<void> {
    const response = await this.api.request(account, '/api/org/backup/run', { method: 'POST' });
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
  }

  /**
   * The newest archive, as a stream and a length — never a buffer.
   *
   * <p>This is the largest thing the extension ever writes to disk; a body read into a string or an
   * `ArrayBuffer` first is an out-of-memory on a machine that was fine a moment ago. What comes back
   * is the response body itself, for the caller to pipe.</p>
   */
  async downloadArchive(account: StoredAccount): Promise<ArchiveDownload> {
    const response = await this.api.request(account, '/api/org/backup/archive');
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    return described(response);
  }
}

/** The response as a download, or a sentence when it carries no body to stream. */
function described(response: Response): ArchiveDownload {
  if (response.body === null) {
    throw new Error('The server answered the archive with no body.');
  }
  return {
    body: response.body,
    bytes: Number(response.headers.get('content-length') ?? 0),
    name: filenameOf(response.headers.get('content-disposition')) ?? 'cred-vault-backup.cvbk',
  };
}

/** An archive on its way: the bytes, how many to expect, and what to call the file. */
export interface ArchiveDownload {
  readonly body: ReadableStream<Uint8Array>;
  readonly bytes: number;
  readonly name: string;
}

/**
 * What is wrong with a settings edit, or nothing — the server's own bounds, checked before sending.
 *
 * <p>Pure and exported so the panel can grey a button out with the same sentence the server would
 * have answered, instead of two wordings for one rule.</p>
 */
export function settingsProblem(settings: BackupSettingsInput): string {
  if (!wholeNumberWithin(settings.scheduleHourUtc, 0, 23)) {
    return 'The hour must be a whole number from 0 to 23, in UTC — the same clock on every machine.';
  }
  return wholeNumberWithin(settings.retentionDays, 1, Number.MAX_SAFE_INTEGER)
    ? ''
    : 'The retention window must be at least one day. A window of zero would ask this server to '
      + 'delete every archive it has.';
}

/** Both bounds are the server's own, and both are inclusive. */
function wholeNumberWithin(value: number, low: number, high: number): boolean {
  return Number.isInteger(value) && value >= low && value <= high;
}

/** The `filename=` of a content-disposition header, or nothing when it does not carry one. */
function filenameOf(disposition: string | null): string | undefined {
  const match = /filename="?([^";]+)"?/.exec(disposition ?? '');
  return match?.[1];
}

/** The fields a status must carry, and what each must be. A table, so the guard is a loop. */
const STATUS_SHAPE: Readonly<Record<string, string>> = {
  keyState: 'string',
  configured: 'boolean',
  scheduleHourUtc: 'number',
  retentionDays: 'number',
  running: 'boolean',
};

function isBackupStatus(body: unknown): body is BackupStatus {
  const status = body as Record<string, unknown> | null;
  return status !== null
    && Array.isArray(status.targets)
    && Object.entries(STATUS_SHAPE).every(([field, kind]) => typeof status[field] === kind);
}

function isMintedKey(body: unknown): body is MintedBackupKey {
  const minted = body as Partial<MintedBackupKey> | null;
  return typeof minted?.key === 'string' && minted.key.length > 0
    && typeof minted.entropyBits === 'number';
}
