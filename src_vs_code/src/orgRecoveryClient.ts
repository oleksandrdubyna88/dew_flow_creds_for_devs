import { CLIENT_CONTRACT_VERSION, CONTRACT_HEADER } from './contractVersion';
import { describeError } from './describeError';
import { StoredAccount } from './types';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';

/**
 * The corporate-recovery half of the vault server's API.
 *
 * <p>A separate client from `ServerTransport` on purpose. That class implements
 * `VaultTransport` — the interface a folder and a git remote also implement — and corporate
 * recovery exists on the server transport ONLY. Widening the interface with five methods the
 * other two transports must stub out would make every one of them carry a concept it has no
 * way to mean.</p>
 *
 * <p>Every payload here is public or opaque: a roster the operator wrote, a public key, and
 * ciphertext sealed on somebody's machine. Nothing this client sends could help the server
 * decrypt anything.</p>
 */

export interface OrgRecoveryConfigResponse {
  enabled: boolean;
  officerEmails: string[];
  threshold: number;
  setupComplete: boolean;
  orgPublicKey: string;
  orgPublicKeyFingerprint: string;
  rosterFingerprint: string;
  publishedAt: number;
}

export interface EscrowInvite {
  id: string;
  setupId: string;
  fromEmail: string;
  toEmail: string;
  shareIndex: number;
  threshold: number;
  totalShares: number;
  createdAt: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
  kdfN?: number;
  kdfR?: number;
  kdfP?: number;
}

export interface SetupStatus {
  setupId: string;
  total: number;
  pending: string[];
}

/** A break-glass session as the server describes it. The contributions are opaque blobs. */
export interface RecoverySessionView {
  sessionId: string;
  initiatorEmail: string;
  targetEmail: string;
  sessionPublicKey: string;
  status: string;
  threshold: number;
  collected: number;
  contributingOfficers: string[];
  startedAt: number;
  expiresAt: number;
  contributions: {
    officerEmail: string;
    /** The share's x coordinate — not secret, and interpolation is impossible without it. */
    shareIndex: number;
    contributedAt: number;
    ephemeralPublicKey: string;
    salt: string;
    iv: string;
    tag: string;
    data: string;
  }[];
}

export interface AuditEntry {
  sessionId: string;
  kind: string;
  initiatorEmail: string;
  targetEmail: string;
  contributingOfficers: string[];
  startedAt: number;
  completedAt: number;
}

/** Statuses that mean "you are not an officer of this server", including an older one. */
const NOT_AN_OFFICER = new Set([403, 404]);

/** The shape the server answers with when a roster is not configured at all. */
export const NO_ORG_RECOVERY: OrgRecoveryConfigResponse = {
  enabled: false,
  officerEmails: [],
  threshold: 0,
  setupComplete: false,
  orgPublicKey: '',
  orgPublicKeyFingerprint: '',
  rosterFingerprint: '',
  publishedAt: 0,
};

// eslint-disable-next-line complexity
function isConfigResponse(value: unknown): value is OrgRecoveryConfigResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === 'boolean' &&
    Array.isArray(v.officerEmails) &&
    typeof v.threshold === 'number' &&
    typeof v.setupComplete === 'boolean' &&
    typeof v.orgPublicKey === 'string' &&
    typeof v.rosterFingerprint === 'string'
  );
}

// eslint-disable-next-line complexity
function isInvite(value: unknown): value is EscrowInvite {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.setupId === 'string' &&
    typeof v.fromEmail === 'string' &&
    typeof v.shareIndex === 'number' &&
    typeof v.threshold === 'number' &&
    typeof v.totalShares === 'number' &&
    typeof v.salt === 'string' &&
    typeof v.data === 'string'
  );
}

export class OrgRecoveryClient {
  constructor(
    readonly location: string,
    private readonly tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  private url(path: string): string {
    return `${this.location.replace(/\/+$/, '')}${path}`;
  }

  private static headersFor(init: RequestInit, token: string): Headers {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set(CONTRACT_HEADER, String(CLIENT_CONTRACT_VERSION));
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  private async request(
    account: StoredAccount,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.tokenFor(account);
    if (token === undefined) {
      throw new Error(`No usable token for ${account.email} — sign in again.`);
    }
    const headers = OrgRecoveryClient.headersFor(init, token);
    try {
      return await fetch(this.url(path), {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`Vault server unreachable (${this.location}): ${describeError(error)}`);
    }
  }

  /**
   * What this server's corporate recovery looks like — or `NO_ORG_RECOVERY` when it has none.
   *
   * <p>A server too old to know the endpoint answers 404, and that means the same thing as a
   * roster nobody configured: no corporate recovery here. Treating it as an error would make
   * every sync against an older server report a failure about a feature nobody asked for.</p>
   */
  async readConfig(account: StoredAccount): Promise<OrgRecoveryConfigResponse> {
    const response = await this.request(account, '/api/org-recovery/config');
    if (response.status === 404) {
      return NO_ORG_RECOVERY;
    }
    if (!response.ok) {
      throw new Error(`Could not read corporate recovery config: HTTP ${response.status}.`);
    }
    const parsed: unknown = await response.json();
    if (!isConfigResponse(parsed)) {
      throw new Error('The server answered corporate recovery config in a shape this build cannot read.');
    }
    return parsed;
  }

  /** Send one officer their sealed share. */
  async sendInvite(account: StoredAccount, invite: Record<string, unknown>): Promise<void> {
    const response = await this.request(account, '/api/org-recovery/invites', {
      method: 'POST',
      body: JSON.stringify(invite),
    });
    if (response.status !== 201) {
      throw new Error(
        `Could not send the recovery share to ${String(invite.toEmail)}: ` +
          `HTTP ${response.status} ${await response.text().catch(() => '')}`.trim(),
      );
    }
  }

  /** This account's own pending invites. */
  async listInvites(account: StoredAccount): Promise<EscrowInvite[]> {
    const response = await this.request(account, '/api/org-recovery/invites');
    // Not an officer here, or an older server. Neither is an error to report — it is an
    // empty inbox, which is what a non-officer's inbox correctly looks like.
    if (NOT_AN_OFFICER.has(response.status)) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`Could not read recovery invites: HTTP ${response.status}.`);
    }
    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? parsed.filter(isInvite) : [];
  }

  /** Say the share is stored — only after it really is. */
  async acknowledgeInvite(account: StoredAccount, inviteId: string): Promise<boolean> {
    const response = await this.request(
      account,
      `/api/org-recovery/invites/${encodeURIComponent(inviteId)}/ack`,
      { method: 'POST' },
    );
    return response.status === 204;
  }

  async setupStatus(account: StoredAccount, setupId: string): Promise<SetupStatus> {
    const response = await this.request(
      account,
      `/api/org-recovery/invites/status?setupId=${encodeURIComponent(setupId)}`,
    );
    if (!response.ok) {
      throw new Error(`Could not read ceremony status: HTTP ${response.status}.`);
    }
    return (await response.json()) as SetupStatus;
  }

  // ---------- break-glass ----------

  async startSession(
    account: StoredAccount,
    targetEmail: string,
    sessionPublicKey: string,
  ): Promise<RecoverySessionView> {
    const response = await this.request(account, '/api/org-recovery/sessions', {
      method: 'POST',
      body: JSON.stringify({ targetEmail, sessionPublicKey }),
    });
    if (response.status !== 201) {
      throw new Error(
        `Could not start the recovery: ${(await response.text().catch(() => '')) || `HTTP ${response.status}`}`,
      );
    }
    return (await response.json()) as RecoverySessionView;
  }

  async readSession(account: StoredAccount, sessionId: string): Promise<RecoverySessionView> {
    const response = await this.request(
      account, `/api/org-recovery/sessions/${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      throw new Error(`No such recovery session (HTTP ${response.status}).`);
    }
    return (await response.json()) as RecoverySessionView;
  }

  async contribute(
    account: StoredAccount,
    sessionId: string,
    sealed: Record<string, string | number>,
  ): Promise<void> {
    const response = await this.request(
      account,
      `/api/org-recovery/sessions/${encodeURIComponent(sessionId)}/contribute`,
      { method: 'POST', body: JSON.stringify(sealed) },
    );
    if (response.status !== 204) {
      throw new Error(
        `Could not contribute: ${(await response.text().catch(() => '')) || `HTTP ${response.status}`}`,
      );
    }
  }

  /** The target's ciphertext, and the version to write back against. */
  async readTargetVault(
    account: StoredAccount,
    sessionId: string,
  ): Promise<{ content: string; etag: string | undefined }> {
    const response = await this.request(
      account, `/api/org-recovery/sessions/${encodeURIComponent(sessionId)}/target-vault`);
    if (!response.ok) {
      throw new Error(
        `Could not read that vault: ${(await response.text().catch(() => '')) || `HTTP ${response.status}`}`,
      );
    }
    return { content: await response.text(), etag: response.headers.get('ETag') ?? undefined };
  }

  async writeTargetVault(
    account: StoredAccount,
    sessionId: string,
    content: string,
    etag: string | undefined,
  ): Promise<void> {
    const response = await this.request(
      account,
      `/api/org-recovery/sessions/${encodeURIComponent(sessionId)}/target-vault`,
      {
        method: 'PUT',
        body: content,
        headers: etag === undefined ? undefined : { 'If-Match': etag },
      },
    );
    if (response.status !== 204) {
      throw new Error(
        `Could not write the re-keyed vault: ${(await response.text().catch(() => '')) || `HTTP ${response.status}`}`,
      );
    }
  }

  async readAudit(account: StoredAccount): Promise<AuditEntry[]> {
    const response = await this.request(account, '/api/org-recovery/audit');
    if (!response.ok) {
      return [];
    }
    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  }

  /**
   * Publish the public half. Returns the server's own words on a refusal, because the two
   * refusals mean different things to the person running the ceremony — somebody has not
   * acknowledged yet, or this ceremony already published a different key.
   */
  async publishSetup(
    account: StoredAccount,
    setupId: string,
    orgPublicKey: string,
    rosterFingerprint: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const response = await this.request(account, '/api/org-recovery/setup', {
      method: 'POST',
      body: JSON.stringify({ setupId, orgPublicKey, rosterFingerprint }),
    });
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, reason: (await response.text().catch(() => '')) || `HTTP ${response.status}` };
  }
}
