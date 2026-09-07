import { OrgEvent } from './eventQuery';

/**
 * One row of the corporate event log, as a person reads it.
 *
 * <p>Pure and `vscode`-free: what a kind is called, what a row says happened, and how an instant is
 * written are decisions, and decisions belong where they are unit tests. The panel next door owns
 * the webview and the page draws what this returns.</p>
 */

/** The groups a person can narrow by — the server's own kind prefixes, plus everything. */
export interface EventGroup {
  readonly id: string;
  readonly label: string;
  /**
   * What goes to the server as `kind`. A trailing dot is the server's group filter; `undefined` is
   * no filter at all.
   *
   * <p>There is deliberately no "everything else" group: it is the COMPLEMENT of three prefixes and
   * the server's filter cannot express one, so offering it would mean filtering in the page — which
   * would narrow the rows this page happens to hold rather than the log, and quietly lie about what
   * it had looked at.</p>
   */
  readonly kind?: string;
  readonly hint: string;
}

export const EVENT_GROUPS: readonly EventGroup[] = [
  { id: 'all', label: 'Everything', hint: 'Every row this server will show you, newest first.' },
  { id: 'shares', label: 'Shares', kind: 'share.', hint: 'Sent, taken, declined, withdrawn, expired.' },
  { id: 'people', label: 'People', kind: 'member.', hint: 'Registered, roles, share defaults, blocked and unblocked.' },
  { id: 'projects', label: 'Projects', kind: 'project.', hint: 'Created, renamed, archived, assigned, unassigned.' },
];

export function groupById(id: string): EventGroup {
  return EVENT_GROUPS.find((group) => group.id === id) ?? EVENT_GROUPS[0];
}

/**
 * What each kind is called on screen.
 *
 * <p>A kind this build does not know is shown AS ITSELF rather than dropped or renamed: an older
 * extension must show a newer server's history, and `backup.run` read as "backup.run" is a row
 * somebody can act on where a blank is not.</p>
 */
const KIND_WORDS: Readonly<Record<string, string>> = {
  'share.sent': 'sent',
  'share.accepted': 'accepted',
  'share.declined': 'declined',
  'share.unknown': 'dealt with',
  'share.withdrawn': 'withdrawn',
  'share.withdrawn_blocked': 'withdrawn (blocked)',
  'share.expired': 'expired',
  'member.registered': 'registered',
  'member.role_changed': 'role changed',
  'member.share_default_changed': 'share default changed',
  'member.blocked': 'blocked',
  'member.unblocked': 'unblocked',
  'project.created': 'project created',
  'project.renamed': 'project renamed',
  'project.archived': 'project archived',
  'project.unarchived': 'project reopened',
  'project.assigned': 'assigned to project',
  'project.unassigned': 'removed from project',
  'settings.changed': 'settings changed',
  'login_key.issued': 'login key issued',
};

export function kindLabel(kind: string): string {
  return KIND_WORDS[kind] ?? kind;
}

/** One row as the table shows it. */
export interface EventLine {
  readonly when: string;
  readonly what: string;
  readonly actor: string;
  readonly subject: string;
  readonly entity: string;
  readonly detail: string;
  readonly kind: string;
}

/**
 * The row's four columns.
 *
 * <p>The instant is rendered in the READER's timezone, which is the one place local time is allowed
 * — the log stores and compares UTC everywhere else. The clock is a parameter so the rendering is a
 * test rather than something that only holds in one office.</p>
 */
export function eventLine(row: OrgEvent, format: (at: number) => string = defaultWhen): EventLine {
  return {
    when: format(row.at),
    what: kindLabel(row.kind),
    actor: row.actor,
    subject: row.subject ?? '',
    entity: entityOf(row),
    detail: row.detail ?? '',
    kind: row.kind,
  };
}

/** What the row was about: the entity's name with its kind, or the project when there is no entity. */
function entityOf(row: OrgEvent): string {
  const name = text(row.entityName);
  const kind = text(row.entityKind);
  if (name === '') {
    return said(text(row.project), (project) => `project ${project}`);
  }
  return said(kind, (of) => `${name} (${of})`) || name;
}

/** A field as text: absent, null and empty are the same thing to a reader. */
function text(value: string | undefined): string {
  return value ?? '';
}

/** `render(value)` when there is one, and nothing when there is not. */
function said(value: string, render: (value: string) => string): string {
  return value === '' ? '' : render(value);
}

function defaultWhen(at: number): string {
  return new Date(at).toLocaleString();
}
