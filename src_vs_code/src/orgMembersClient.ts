import { CorpApiClient } from './corpApiClient';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';
import { hasShape } from './shapeGuard';
import { StoredAccount } from './types';

/**
 * The members half of the corporate surface: `GET /api/org/me` for everybody, and the admin's
 * roster and settings routes.
 *
 * <p>A separate client from `ServerTransport` for the reason `orgRecoveryClient.ts` gives: that
 * class implements `VaultTransport`, which a folder and a git remote implement too, and widening
 * it with roles would make them carry a concept they cannot mean. Built on `CorpApiClient` so
 * this file holds only what is specific to these five routes — the shapes, and what each answer
 * means.</p>
 *
 * <p>Every shape is checked at the edge (`shapeGuard.ts`): a server that answers a document this
 * build cannot read produces a sentence here, never an undefined field three layers later where
 * it would be read as "no role" or "no policy".</p>
 */

/** One project assignment as the document carries it; epic 3 adds the project's name. */
export interface ProjectAssignment {
  readonly projectId: string;
  readonly share: string;
}

/**
 * `GET /api/org/me` — the one document every client reads each cycle.
 *
 * <p>`policy` is deliberately `unknown` here. What a malformed policy MEANS (the most restrictive
 * shape) is `corpPolicy.ts`'s decision, and refusing the whole document for it here would make
 * the fetch fail — and a failed fetch keeps the PREVIOUS answer, so the restrictive fallback
 * could never be reached.</p>
 */
export interface MemberSelf {
  readonly corpMode: boolean;
  readonly email: string;
  readonly role: string;
  readonly active: boolean;
  readonly isOfficer: boolean;
  readonly shareDefault: string;
  readonly projects: readonly ProjectAssignment[];
  readonly pendingFolderRemovals: readonly unknown[];
  readonly policy: unknown;
  readonly offlineLeaseHours: number;
  readonly loginKeyVersion: number;
  readonly serverContract: number;
}

/** One row of the admin's roster — `GET /api/org/members`, and what `PUT` answers. */
export interface MemberListEntry {
  readonly email: string;
  readonly role: string;
  readonly active: boolean;
  readonly shareDefault: string;
  readonly projectIds: readonly string[];
  /** From configuration, not the record: an officer cannot be given a registry role. */
  readonly isOfficer: boolean;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

export interface OrgSettings {
  readonly offlineLeaseHours: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

/** What an admin changes; an absent field is left alone by the server. */
export interface MemberChange {
  readonly role?: string;
  readonly shareDefault?: string;
}

/** The roles this build knows; a newer server may add one, and `corpPolicy` shows it as it came. */
export const MEMBER_ROLES = ['admin', 'member', 'dev'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** A developer's share default. `any` exists only inside a policy, never as a default. */
export const SHARE_DEFAULTS = ['project', 'none'] as const;
export type ShareDefault = (typeof SHARE_DEFAULTS)[number];

/**
 * What a server too old to know `/api/org/me` amounts to: no corporate roles here.
 *
 * <p>Mirrors what a corp-off server itself answers — the member default and the permissive
 * policy, computed from constants — so a pre-3 server and a personal one are indistinguishable
 * to the tree, which is what they are.</p>
 */
export const NO_ORG_POLICY: MemberSelf = {
  corpMode: false,
  email: '',
  role: 'member',
  active: true,
  isOfficer: false,
  shareDefault: 'project',
  projects: [],
  pendingFolderRemovals: [],
  policy: { export: true, share: 'any', moveOutOfProject: true },
  offlineLeaseHours: 24,
  loginKeyVersion: 0,
  serverContract: 0,
};

const SELF_SHAPE = {
  corpMode: 'boolean',
  email: 'string',
  role: 'string',
  active: 'boolean',
  isOfficer: 'boolean',
  shareDefault: 'string',
  projects: 'array',
  pendingFolderRemovals: 'array',
  offlineLeaseHours: 'number',
  loginKeyVersion: 'number',
  serverContract: 'number',
} as const;

const ROW_SHAPE = {
  email: 'string',
  role: 'string',
  active: 'boolean',
  shareDefault: 'string',
  projectIds: 'array',
  isOfficer: 'boolean',
  updatedAt: 'number',
  updatedBy: 'string',
} as const;

const SETTINGS_SHAPE = { offlineLeaseHours: 'number', updatedAt: 'number', updatedBy: 'string' } as const;

function isProjectAssignment(value: unknown): value is ProjectAssignment {
  return hasShape(value, { projectId: 'string', share: 'string' });
}

export function isMemberSelf(value: unknown): value is MemberSelf {
  return hasShape(value, SELF_SHAPE) && (value.projects as unknown[]).every(isProjectAssignment);
}

export function isMemberListEntry(value: unknown): value is MemberListEntry {
  return hasShape(value, ROW_SHAPE) && (value.projectIds as unknown[]).every((id) => typeof id === 'string');
}

/** A roster with one row this build cannot read fails whole: a person silently missing is worse than no list. */
function isMemberList(value: unknown): value is MemberListEntry[] {
  return Array.isArray(value) && value.every(isMemberListEntry);
}

export function isOrgSettings(value: unknown): value is OrgSettings {
  return hasShape(value, SETTINGS_SHAPE);
}

export class OrgMembersClient {
  private readonly api: CorpApiClient;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
  }

  /**
   * Who this account is to its server, and what an honest client does about it.
   *
   * <p>A server too old to know the endpoint answers 404, and that means the same thing as a
   * server with no roster: no corporate roles here. Treating it as an error would make every
   * readiness cycle against an older server report a failure about a feature it does not have.</p>
   */
  async readMe(account: StoredAccount): Promise<MemberSelf> {
    const response = await this.api.request(account, '/api/org/me');
    if (response.status === 404) {
      return NO_ORG_POLICY;
    }
    return this.parse(response, isMemberSelf, 'your role and policy');
  }

  /** The admin's roster of their own domain. Anybody else gets the server's 403, in words. */
  async listMembers(account: StoredAccount): Promise<MemberListEntry[]> {
    const response = await this.api.request(account, '/api/org/members');
    return this.parse(response, isMemberList, 'the roster');
  }

  /**
   * Set a role, a share default, or both — for somebody who may not have synced yet.
   *
   * <p>Only the fields the admin changed travel: the server reads an absent field as "keep", and
   * sending the old value back would log a change that never happened.</p>
   */
  async setMember(account: StoredAccount, email: string, change: MemberChange): Promise<MemberListEntry> {
    const response = await this.api.request(account, `/api/org/members/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: JSON.stringify(change),
    });
    return this.parse(response, isMemberListEntry, 'the changed record');
  }

  async readSettings(account: StoredAccount): Promise<OrgSettings> {
    const response = await this.api.request(account, '/api/org/settings');
    return this.parse(response, isOrgSettings, 'the server settings');
  }

  /** `0` is the legal "strictly online" and must travel as a number, never be dropped as falsy. */
  async writeSettings(account: StoredAccount, offlineLeaseHours: number): Promise<OrgSettings> {
    const response = await this.api.request(account, '/api/org/settings', {
      method: 'PUT',
      body: JSON.stringify({ offlineLeaseHours }),
    });
    return this.parse(response, isOrgSettings, 'the server settings');
  }

  /** A refusal becomes the server's own sentence; a success becomes the shape, or a sentence. */
  private async parse<T>(response: Response, guard: (value: unknown) => value is T, what: string): Promise<T> {
    if (!response.ok) {
      throw new Error(await this.api.refusal(response));
    }
    const parsed: unknown = await response.json().catch(() => undefined);
    if (!guard(parsed)) {
      throw new Error(`The server answered ${what} in a shape this build cannot read.`);
    }
    return parsed;
  }
}
