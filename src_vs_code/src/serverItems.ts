import * as vscode from 'vscode';
import { lastRunFailed } from './backupNotice';
import { CorpPolicyState, isCorpAdmin } from './corpPolicy';
import { compareVersions } from './credsInstall';
import { BackupStatus, isNoBackupHere, targetKindsOf } from './orgBackupClient';
import { ServerFailure, ServerRead } from './orgRecoveryClient';
import { ServerMetrics, formatBytes } from './serverMetricsPage';
import { StoredAccount, TreeElement } from './types';

/**
 * The Server section's rows — what the deployment IS, on an administrator's account row.
 *
 * <p>Everything the tree said about a corporate server was about PEOPLE: the Team section and one
 * row per colleague. The three facts an administrator checks most often — what is running, is it
 * current, is it backed up — each cost a deliberate navigation into a tab, and one of the three
 * (*Server Metrics…*) was contributed on an officer's row only, so an admin who is not on the
 * recovery roster could not see it at all.</p>
 *
 * <p>Written the way `teamItems.ts` is, and for the same reason its header gives: everything a row
 * decides is taken as an argument, so the row can be built in a test without the provider. `vscode`
 * is imported for `TreeItem`/`ThemeIcon`/`ThemeColor` and nothing else.</p>
 *
 * <p><b>An icon in this section MEANS something.</b> The version and footprint rows carry none
 * while there is nothing to say; the version row gains one only when a newer release is published,
 * and the backup row always carries one because its whole job is to say which of five states the
 * deployment is in. A row that is always decorated decorates nothing.</p>
 */

/** The Server section is teal — its own colour, so it never reads as the people section. */
export const SERVER_COLOR = new vscode.ThemeColor('credSshManager.serverIcon');

const WARNING_COLOR = new vscode.ThemeColor('problemsWarningIcon.foreground');

/** What a row says when its cache holds nothing yet. Never an empty row, and never a wrong one. */
const CHECKING = 'checking…';

const FAILURE_WORDS: Readonly<Record<ServerFailure, string>> = {
  unreachable: 'unreachable',
  refused: 'refused (403)',
  older: 'older than this section',
};

const FAILURE_REASONS: Readonly<Record<ServerFailure, string>> = {
  unreachable: 'This server could not be reached. The version and footprint below are the last ones it gave.',
  refused: 'This server refused to show its metrics. Either it is older than the change that opened metrics '
    + 'to administrators (it was recovery-officer-only until 2026-09-12), or this deployment has no recovery '
    + 'roster at all — the admin gate sits inside that switch, so a server without one refuses everybody.',
  older: 'This server has no metrics endpoint; it predates the feature.',
};

export interface ServerScopeRowInput {
  readonly account: StoredAccount;
  readonly collapsibleState: vscode.TreeItemCollapsibleState;
  /** The deployed version, for the section's own one-word summary. Empty = not read yet. */
  readonly version: string;
  readonly failure?: ServerFailure;
}

export function serverScopeItem(input: ServerScopeRowInput): vscode.TreeItem {
  const item = new vscode.TreeItem('Server', input.collapsibleState);
  item.id = `serverScope:${input.account.accountId}`;
  item.contextValue = 'serverScope';
  if (input.failure === undefined) {
    item.iconPath = new vscode.ThemeIcon('server', SERVER_COLOR);
    item.description = input.version === '' ? CHECKING : input.version;
  } else {
    // An empty section and a refused one must not look alike — the lesson `teamItems.ts` records.
    item.iconPath = new vscode.ThemeIcon('warning', WARNING_COLOR);
    item.description = FAILURE_WORDS[input.failure];
    item.tooltip = FAILURE_REASONS[input.failure];
  }
  return item;
}

export interface ServerVersionRowInput {
  readonly account: StoredAccount;
  /** What the server reports. `''` = not read yet; `'unknown'` = a build with no version stamp. */
  readonly deployed: string;
  /** The newest published release, or `''` when GitHub could not be asked. */
  readonly latest: string;
}

/**
 * What is deployed, and whether something newer is published.
 *
 * <p>An icon and nothing else: no command, no `contextValue`. The upgrade is a manual
 * `workflow_dispatch` against a host this extension cannot reach, so a row that looked pressable
 * would be a button that does nothing.</p>
 */
export function serverVersionItem(input: ServerVersionRowInput): vscode.TreeItem {
  const item = new vscode.TreeItem('Version', vscode.TreeItemCollapsibleState.None);
  item.id = `serverVersion:${input.account.accountId}`;
  if (input.deployed === '') {
    item.description = CHECKING;
    return item;
  }
  const behind = isBehind(input.deployed, input.latest);
  item.description = behind ? `${input.deployed} → ${input.latest} available` : input.deployed;
  item.iconPath = behind ? new vscode.ThemeIcon('arrow-circle-up', SERVER_COLOR) : undefined;
  return item;
}

/**
 * Whether what is deployed is older than what is published.
 *
 * <p><b>A version that is not a version is never compared.</b> `MetricsDto.Version` falls back to
 * `"unknown"` for a build carrying no informational version — a local `docker compose` from source
 * — and the numeric comparison reads a non-numeric segment as zero, so a naive compare would
 * announce that every development server is out of date.</p>
 */
function isBehind(deployed: string, latest: string): boolean {
  return latest !== '' && /^\d+\.\d+/.test(deployed) && compareVersions(deployed, latest) < 0;
}

export interface ServerVaultsRowInput {
  readonly account: StoredAccount;
  /** The last document, or nothing when none has arrived yet. */
  readonly metrics: ServerMetrics | undefined;
}

/** How many vaults this server holds, and what they weigh. */
export function serverVaultsItem(input: ServerVaultsRowInput): vscode.TreeItem {
  const item = new vscode.TreeItem('Vaults', vscode.TreeItemCollapsibleState.None);
  item.id = `serverVaults:${input.account.accountId}`;
  // `formatBytes`, not a second byte formatter: that one already answers `unknown` for a negative,
  // which is how this server spells "could not tell".
  item.description = input.metrics === undefined
    ? CHECKING
    : `${input.metrics.vaults} · ${formatBytes(input.metrics.vaultBytesOnDisk)}`;
  return item;
}

export interface ServerBackupRowInput {
  readonly account: StoredAccount;
  /** The last status read, or nothing when none has arrived yet. */
  readonly status: BackupStatus | undefined;
  /**
   * The instant, in the reader's own locale.
   *
   * <p>`lastRunAt` is unix MILLISECONDS — a true instant, so it carries no offset and cannot shift.
   * Converted here, once, at the edge, and taken as an argument so a test pins a fixed locale
   * rather than the runner's.</p>
   */
  readonly at: (instant: number) => string;
}

/**
 * Whether this deployment is backed up, in one line — and there are FIVE answers, not two.
 *
 * <p>`configured` is about the KEK ("can this server seal an archive at all"), not about
 * destinations. A deployment can be configured with no destinations (local archive only) or
 * unconfigured with destinations saved and nothing able to use them. Collapsing those would hide
 * the state somebody actually has to fix.</p>
 */
export function serverBackupItem(input: ServerBackupRowInput): vscode.TreeItem {
  const item = new vscode.TreeItem('Backup', vscode.TreeItemCollapsibleState.None);
  item.id = `serverBackup:${input.account.accountId}`;
  item.contextValue = 'serverBackup';
  const drawn = backupState(input.status, input.at);
  item.description = drawn.description;
  item.iconPath = new vscode.ThemeIcon(drawn.icon, drawn.warn ? WARNING_COLOR : SERVER_COLOR);
  // The row answers a left click with the same tab its context menu offers, so selecting it or
  // pressing Enter lands somewhere. The EXISTING command — nothing new was registered for this.
  item.command = {
    command: 'credSshManager.orgBackup',
    title: 'Configure backup…',
    arguments: [{ kind: 'serverBackup', account: input.account }],
  };
  return item;
}

interface BackupDrawing {
  readonly icon: string;
  readonly description: string;
  readonly warn?: boolean;
}

function backupState(
  status: BackupStatus | undefined,
  at: (instant: number) => string,
): BackupDrawing {
  if (status === undefined) {
    return { icon: 'question', description: CHECKING };
  }
  if (isNoBackupHere(status)) {
    return { icon: 'circle-slash', description: 'not available on this server' };
  }
  return status.configured ? configuredBackup(status, at) : unconfiguredBackup(status);
}

/** Destinations saved with no key are the third state, and the row says both halves of it. */
function unconfiguredBackup(status: BackupStatus): BackupDrawing {
  const kinds = targetKindsOf(status);
  return {
    icon: 'warning',
    warn: true,
    description: kinds.length === 0 ? 'not configured' : `not configured · ${kinds.join(', ')}`,
  };
}

function configuredBackup(status: BackupStatus, at: (instant: number) => string): BackupDrawing {
  const kinds = targetKindsOf(status);
  const failed = lastRunFailed(status);
  return {
    icon: failed ? 'warning' : 'check',
    warn: failed,
    // `0` is how "never" is spelled on this contract, and it is not the epoch.
    description: `${kinds.length === 0 ? 'local archive only' : kinds.join(', ')} · ${whenOf(status, at)}`,
  };
}

function whenOf(status: BackupStatus, at: (instant: number) => string): string {
  return status.lastRunAt === 0 ? 'never' : at(status.lastRunAt);
}

export interface CorpSectionsInput {
  /** The VIEWING account's policy — absent means no document yet, or no corporate server. */
  readonly policy: CorpPolicyState | undefined;
  readonly teamCount: number;
}

/**
 * The corporate sections under one account row, in the order they are drawn.
 *
 * <p><b>Server above Team.</b> Server is one row and Team is a list, and a single row above a list
 * is a header; below it, it reads as the list's last member.</p>
 *
 * <p>The Server section exists only for `isCorpAdmin` — the same predicate the backup watch polls
 * on and the menu is gated by. A developer's account row is byte-identical to what it was before
 * this section existed.</p>
 */
export function corpSections(account: StoredAccount, input: CorpSectionsInput): TreeElement[] {
  return [
    ...(isCorpAdmin(input.policy) ? [{ kind: 'serverScope' as const, account }] : []),
    ...(input.teamCount > 0 ? [{ kind: 'teamScope' as const, account }] : []),
  ];
}

/** The three rows under the scope row, always all three — so the section's shape is constant. */
export function serverChildren(account: StoredAccount): TreeElement[] {
  return [
    { kind: 'serverVersion', account },
    { kind: 'serverVaults', account },
    { kind: 'serverBackup', account },
  ];
}

/**
 * The caches a Server row reads — the provider's `ServerSection`, or three plain fields in a test.
 *
 * <p>Structural rather than the class, so this module needs nothing from the refresh that fills
 * them and a test needs nothing from the provider.</p>
 */
export interface ServerSectionReads {
  readonly metrics: ReadonlyMap<string, ServerRead>;
  readonly backup: ReadonlyMap<string, BackupStatus>;
  /** The newest published `server-v*` release, or nothing when GitHub has not been asked. */
  readonly release: { readonly version: string } | undefined;
}

/**
 * UTC on the wire, the reader's own clock here.
 *
 * <p>Converted ONCE, at the edge, and nowhere else — `lastRunAt` is unix MILLISECONDS, a true
 * instant, so it carries no offset and cannot shift. The row builders take the formatter as an
 * argument so a test pins a fixed locale rather than the runner's.</p>
 */
function localInstant(instant: number): string {
  return new Date(instant).toLocaleString();
}

/** Any one row of the Server section — every one of them carries its whole account. */
export type ServerRowElement = Extract<
  TreeElement,
  { kind: 'serverScope' | 'serverVersion' | 'serverVaults' | 'serverBackup' }
>;

/** The four kinds as a set, because `complexity: 4` counts every `||` in a chain. */
const SERVER_KINDS: ReadonlySet<string> = new Set([
  'serverScope', 'serverVersion', 'serverVaults', 'serverBackup',
]);

/** Whether this row belongs to the Server section — a predicate, so the caller narrows. */
export function isServerRow(element: TreeElement): element is ServerRowElement {
  return SERVER_KINDS.has(element.kind);
}

/** Every Server row, dispatched by kind — the shape `teamRowFor` established. */
export function serverRowFor(
  element: ServerRowElement,
  section: ServerSectionReads,
  collapsibleState: vscode.TreeItemCollapsibleState,
): vscode.TreeItem {
  const { account } = element;
  const read = section.metrics.get(account.accountId);
  const metrics = metricsOf(read);
  if (element.kind === 'serverScope') {
    return serverScopeItem({
      account,
      collapsibleState,
      version: versionOf(metrics),
      failure: failureOf(read),
    });
  }
  if (element.kind === 'serverVersion') {
    return serverVersionItem({ account, deployed: versionOf(metrics), latest: latestOf(section) });
  }
  return element.kind === 'serverVaults'
    ? serverVaultsItem({ account, metrics })
    : serverBackupItem({ account, status: section.backup.get(account.accountId), at: localInstant });
}

function latestOf(section: ServerSectionReads): string {
  return section.release?.version ?? '';
}

// Three one-line readers rather than optional chains inside the dispatcher: `complexity: 4` is an
// eslint error here, and every `?.` counts towards it.
function metricsOf(read: ServerRead | undefined): ServerMetrics | undefined {
  return read?.value;
}

function failureOf(read: ServerRead | undefined): ServerFailure | undefined {
  return read?.failure;
}

function versionOf(metrics: ServerMetrics | undefined): string {
  return metrics?.version ?? '';
}
