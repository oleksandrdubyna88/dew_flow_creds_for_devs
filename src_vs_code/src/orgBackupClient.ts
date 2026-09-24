import { describeTarget, targetProblem } from './backupTargets';
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

/**
 * One backup-status read: the last status that ARRIVED, and whether the current read landed.
 *
 * <p>The same envelope `ServerRead` is, for the reason the code round named: a map that only ever
 * took successes left the Backup row showing a green check and yesterday's timestamp while the
 * endpoint was unreachable. The value must survive a failure — losing it would be the other defect
 * — but the row has to be able to SAY that the last attempt did not land.</p>
 */
export interface BackupRead {
  /** The last status that arrived, kept through failures. */
  readonly value?: BackupStatus;
  /** `true` when the CURRENT read did not land; absent when it did. */
  readonly failed?: true;
  /** When that outcome was recorded (unix ms, UTC). */
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
  /**
   * When the last run whose verdict was `ok` finished — a DIFFERENT instant from `lastRunAt`, which
   * a failed run also moves (added 2026-09-24, #134). `0` is "no recorded success".
   *
   * <p>Optional for the reason `configuredTargetKinds` is: an older server omits it, and the shape
   * guard must not reject that server's perfectly good status. Absent means "this server predates the
   * field", and a row then draws as it did before.</p>
   */
  readonly lastSuccessAt?: number;
  readonly lastResult: string;
  readonly lastError: string;
  /** Derived by the server from the persisted result, never a second stored field. */
  readonly running: boolean;
  readonly localArchiveBytes: number;
  readonly localArchiveName: string;
  /**
   * The kinds of destination that are SAVED, as of the server that answers (added 2026-09-12).
   *
   * <p><b>Optional, and deliberately absent from `STATUS_SHAPE`.</b> The guard requires every field
   * it declares to be present, so declaring this one would make a new extension reject an older
   * server's perfectly good status document — the exact asymmetry the `404` handling above exists to
   * avoid. Absent means "this server predates the field", and `targetKindsOf` falls back to the
   * kinds of the last RUN, which is right for a server that has run and honestly empty for one
   * that has not.</p>
   *
   * <p>It is not `targets`: that list is the last run's OUTCOMES, so a deployment that saved an S3
   * destination and has not run yet answers `[]` there while backing up to S3 from tonight.</p>
   */
  readonly configuredTargetKinds?: readonly string[];
  readonly targets: readonly BackupTargetView[];
}

/**
 * The kinds this deployment backs up to — from the server that says so, or from the last run.
 *
 * <p><b>The optional field is checked here rather than in `STATUS_SHAPE`</b>, and the distinction
 * matters: the shape guard requires every field it declares, so declaring this one would make a new
 * extension reject an older server's perfectly good status document. But "not declared" must not
 * mean "not checked" — this value is drawn into a tree row, and a malformed one reached `join` as
 * whatever the server sent. Present and an array of strings, or treated as absent (code round).</p>
 */
export function targetKindsOf(status: BackupStatus): readonly string[] {
  const said = status.configuredTargetKinds;
  return Array.isArray(said) && said.every((kind) => typeof kind === 'string')
    ? said
    : [...new Set(status.targets.map((target) => target.kind))];
}

/** Whether this is the "server too old for the feature" state rather than a real read. */
export function isNoBackupHere(status: BackupStatus): boolean {
  return status.lastResult === NO_BACKUP_HERE.lastResult;
}

/** Whether the server can open what is sealed for a destination. The form says "re-enter" on the other. */
export type TargetCredentials = 'sealed' | 'unopenable';

/**
 * A configured destination as `GET /api/org/backup/targets` lists it: where it is, and whether the
 * server can open its sealed half. Never the sealed half, never a credential.
 *
 * <p>`contract/backup-targets-v1.json` is the sample document both halves assert — the server's
 * endpoint test compares the route's answer to it, and `orgBackupClient.test.ts` feeds it to
 * `readTargets`.</p>
 */
export interface BackupTargetSummary {
  readonly kind: string;
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  readonly credentials: TargetCredentials;
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
  lastSuccessAt: 0,
  lastResult: 'no backup here',
  lastError: '',
  running: false,
  localArchiveBytes: 0,
  localArchiveName: '',
  configuredTargetKinds: [],
  targets: [],
};

/**
 * How long a save that carries destinations may take.
 *
 * <p>The server proves every NEW or CHANGED destination with a write and a delete at the bucket
 * before it answers, each half on a twenty-second deadline, all destinations together — so a save's
 * worst case is forty seconds on the server, behind a reverse proxy, over a corporate VPN. The
 * client's ordinary sixty is a wall one slow bucket walks into, and a wait cut short here leaves the
 * person told "unreachable" about a save that then lands. Three times the server's worst case.</p>
 */
export const TARGET_SAVE_TIMEOUT_MS = 120_000;

/** The deadline a settings save gets: the long one when it carries destinations, `base` otherwise. */
export function saveDeadlineMs(settings: BackupSettingsInput, base: number): number {
  return settings.targets === undefined ? base : Math.max(base, TARGET_SAVE_TIMEOUT_MS);
}

/**
 * Drives the seven admin-only backup routes — status, the destinations, `PUT` settings, mint, run,
 * download, and the one that answers `501`.
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

  private readonly timeoutMs: number;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
    this.timeoutMs = timeoutMs;
  }

  /**
   * The configured destinations — or `undefined` for a server older than destination editing.
   *
   * <p><b>The two answers are opposite facts and must not be flattened into one.</b> An empty list
   * is a server that answered and holds no destination; `undefined` is a server with no such route,
   * and against it the tab must not offer the form at all: `PUT /settings` replaces the whole list,
   * so a save without the list would silently erase the destinations this build cannot see. The
   * page names which side is older.</p>
   *
   * <p>Every row is PROJECTED onto the six fields the contract names, so whatever a server adds to a
   * row — and a compromised one could add anything — never reaches a page.</p>
   */
  async readTargets(account: StoredAccount): Promise<readonly BackupTargetSummary[] | undefined> {
    const response = await this.api.request(account, '/api/org/backup/targets');
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!isTargetSummaries(body)) {
      throw new Error('The server answered the backup destinations in a shape this build cannot read.');
    }
    return body.map(summaryOf);
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
   * round trip to a save that also probes every changed destination over the network. A save that
   * carries destinations waits `TARGET_SAVE_TIMEOUT_MS` for exactly that reason.</p>
   */
  async saveSettings(account: StoredAccount, settings: BackupSettingsInput): Promise<void> {
    const problem = settingsProblem(settings);
    if (problem.length > 0) {
      throw new Error(problem);
    }
    const response = await this.api.request(
      account,
      '/api/org/backup/settings',
      { method: 'PUT', body: JSON.stringify(settings) },
      saveDeadlineMs(settings, this.timeoutMs),
    );
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
  if (!wholeNumberWithin(settings.retentionDays, 1, Number.MAX_SAFE_INTEGER)) {
    return 'The retention window must be at least one day. A window of zero would ask this server to '
      + 'delete every archive it has.';
  }
  return targetsProblem(settings.targets ?? []);
}

/**
 * The first destination the server would refuse, named — checked here so a typo costs no probe.
 *
 * <p>Whether a destination sent WITHOUT credentials is a first save — which needs them — is a fact
 * about the server's list, which the tab holds and this layer does not; a key-less request is
 * therefore accepted here as the "keep the sealed ones" it usually is, and the tab asks the
 * first-save question at the form.</p>
 */
function targetsProblem(targets: readonly BackupTargetInput[]): string {
  for (const target of targets) {
    const problem = targetProblem(target, true);
    if (problem.length > 0) {
      return `${describeTarget(target)}: ${problem}`;
    }
  }
  return '';
}

/** Both bounds are the server's own, and both are inclusive. */
function wholeNumberWithin(value: number, low: number, high: number): boolean {
  return Number.isInteger(value) && value >= low && value <= high;
}

/**
 * The `filename=` of a content-disposition header — as a BASENAME, or nothing.
 *
 * <p><b>The server does not get to choose a path.</b> The name goes to the save dialog as its
 * `defaultUri`, so a hostile or compromised server answering
 * <c>filename="/home/dev/.ssh/config"</c> would put an administrator one Enter away from
 * overwriting their own ssh config with archive bytes. Anything carrying a separator, a traversal
 * component, or nothing at all is refused and the neutral name is used instead — a wrong-looking
 * download name costs a rename; a right-looking one pointed somewhere else costs a file.</p>
 */
function filenameOf(disposition: string | null): string | undefined {
  const match = FILENAME.exec(disposition ?? '');
  const name = (match === null ? '' : match[1]).trim();
  return isBasename(name) ? name : undefined;
}

const FILENAME = /filename="?([^";]+)"?/;

/** A name and nothing else: no separator of either kind, and not a directory of its own. */
function isBasename(name: string): boolean {
  return name.length > 0 && !SEPARATOR.test(name) && !DOTS.has(name);
}

const SEPARATOR = /[\\/]/;

const DOTS = new Set(['.', '..']);

/**
 * The fields a status must carry, and what each must be. A table, so the guard is a loop.
 *
 * <p><b>Every field a CONSUMER reads, not only the interesting ones.</b> It used to check five and
 * that `targets` was an array; the page then measured `localArchiveName.length` and the notice read
 * `lastError.length`, so a truncated answer — an older server, a proxy that mangled a body, a
 * half-written file — became a broken tab instead of the one sentence this client exists to
 * produce.</p>
 */
const STATUS_SHAPE: Readonly<Record<string, string>> = {
  configured: 'boolean',
  keyState: 'string',
  scheduleHourUtc: 'number',
  retentionDays: 'number',
  lastRunAt: 'number',
  lastResult: 'string',
  lastError: 'string',
  running: 'boolean',
  localArchiveBytes: 'number',
  localArchiveName: 'string',
};

/** And the same for one destination row, which the table draws field by field. */
const TARGET_SHAPE: Readonly<Record<string, string>> = {
  kind: 'string',
  where: 'string',
  result: 'string',
  error: 'string',
  retention: 'string',
  at: 'number',
};

/**
 * Every field a consumer reads, of its kind — and every INSTANT within the range a `Date` has.
 *
 * <p>`typeof x === 'number'` accepts `1e100`, and the page then calls
 * `new Date(at).toISOString()`, which throws `RangeError` on anything outside ±8.64e15 ms. A
 * refresh would end with no page drawn at all, which is a worse answer than the shape-mismatch
 * sentence this guard exists to produce. `0` stays legal: it is how "never" is spelled.</p>
 */
function isBackupStatus(body: unknown): body is BackupStatus {
  const status = body as Record<string, unknown> | null;
  return matches(status, STATUS_SHAPE)
    && instantsOk(status)
    && Array.isArray(status.targets)
    && status.targets.every(
      (target: unknown) => matches(target, TARGET_SHAPE)
        && isInstant((target as Record<string, unknown>).at));
}

/** The run's instant, and the success's when the server is new enough to send one. */
function instantsOk(status: Record<string, unknown>): boolean {
  return isInstant(status.lastRunAt) && optionalInstant(status.lastSuccessAt);
}

/** Absent on an older server, and an instant on a newer one — never anything else. */
function optionalInstant(value: unknown): boolean {
  return value === undefined || isInstant(value);
}

function isTargetSummaries(body: unknown): body is unknown[] {
  return Array.isArray(body) && body.every(isTargetSummary);
}

/** The six fields of one configured destination, and what each must be. */
const SUMMARY_SHAPE: Readonly<Record<string, string>> = {
  kind: 'string',
  endpoint: 'string',
  region: 'string',
  bucket: 'string',
  prefix: 'string',
  credentials: 'string',
};

const CREDENTIAL_WORDS: ReadonlySet<string> = new Set<TargetCredentials>(['sealed', 'unopenable']);

function isTargetSummary(row: unknown): boolean {
  return matches(row, SUMMARY_SHAPE) && CREDENTIAL_WORDS.has(row.credentials as string);
}

/** Exactly the contract's six fields, whatever else the row carried. */
function summaryOf(row: unknown): BackupTargetSummary {
  const record = row as Record<string, string>;
  return {
    kind: record.kind,
    endpoint: record.endpoint,
    region: record.region,
    bucket: record.bucket,
    prefix: record.prefix,
    credentials: record.credentials as TargetCredentials,
  };
}

/** The widest instant a `Date` can render, which is what every caller does with these. */
const LATEST_INSTANT = 8.64e15;

function isInstant(value: unknown): boolean {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Math.abs(value) <= LATEST_INSTANT;
}

/** Every field of a shape, present and of its kind. */
function matches(value: unknown, shape: Readonly<Record<string, string>>): value is Record<string, unknown> {
  const record = value as Record<string, unknown> | null;
  return record !== null
    && typeof record === 'object'
    && Object.entries(shape).every(([field, kind]) => typeof record[field] === kind);
}

function isMintedKey(body: unknown): body is MintedBackupKey {
  const minted = body as Partial<MintedBackupKey> | null;
  return typeof minted?.key === 'string' && minted.key.length > 0
    && typeof minted.entropyBits === 'number';
}
