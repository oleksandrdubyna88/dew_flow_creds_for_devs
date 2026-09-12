import { CorpApiClient } from './corpApiClient';
import { ServerMetrics, isServerMetrics } from './serverMetricsPage';
import { StoredAccount } from './types';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';

/**
 * Why a metrics read did not answer.
 *
 * <p>`refused` is the interesting one, and on this surface it is a SPLIT RELEASE far more often
 * than a mistake: an extension newer than the server meets `/api/metrics` still gated on
 * `RequireOfficer`, and a deployment with no recovery roster refuses administrators too, because
 * the admin gate sits inside that switch. `older` is a server with no such route at all.</p>
 */
export type ServerFailure = 'unreachable' | 'refused' | 'older';

/** The metrics document, or why there is none. */
export type MetricsProbe =
  | { readonly metrics: ServerMetrics }
  | { readonly failure: ServerFailure };

/**
 * The last answer AND the current standing of the read, as the tree caches it.
 *
 * <p>Two fields rather than one value, because "a failed read keeps the previous entry" and "the
 * scope row shows why it failed" cannot both be true of a bare `ServerMetrics`: the first refusal
 * has no previous value to keep and nowhere to record itself, and after one success a later failure
 * would leave the row looking healthy for ever.</p>
 */
export interface ServerRead {
  /** The last document that arrived, kept through failures. */
  readonly value?: ServerMetrics;
  /** The CURRENT read's outcome — absent when it succeeded. */
  readonly failure?: ServerFailure;
  /** When that outcome was recorded (unix ms, UTC). */
  readonly at: number;
}

/** The two statuses that mean something specific about the SERVER rather than about the network. */
const REFUSAL_BY_STATUS: Readonly<Record<number, ServerFailure>> = {
  403: 'refused',
  404: 'older',
};

/** What each failure is told to a person who asked for the page outright. */
const METRICS_REFUSALS: Readonly<Record<ServerFailure, (email: string, location: string) => string>> = {
  refused: (email, location) =>
    `${email} may not read the metrics of ${location} — an administrator or a recovery officer may. `
    + 'A deployment with no recovery roster refuses everybody, administrators included.',
  older: (_email, location) => `${location} has no metrics endpoint; it is older than the feature.`,
  unreachable: (_email, location) => `Could not read the metrics of ${location}.`,
};

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
  /**
   * The request plumbing — URL, bearer and contract headers, timeout, the unreachable sentence —
   * lives in `CorpApiClient` since epic 1, because every corporate client needs the same block
   * and the second copy is the defect. This class was its first caller and behaves exactly as
   * it did before the move; its suite is the characterization test.
   */
  private readonly api: CorpApiClient;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
  }

  private request(account: StoredAccount, path: string, init: RequestInit = {}): Promise<Response> {
    return this.api.request(account, path, init);
  }

  /**
   * What this server's corporate recovery looks like — or `NO_ORG_RECOVERY` when it has none.
   *
   * <p>A server too old to know the endpoint answers 404, and that means the same thing as a
   * roster nobody configured: no corporate recovery here. Treating it as an error would make
   * every sync against an older server report a failure about a feature nobody asked for.</p>
   */
  /**
   * The administrators' metrics page (server-ops item 5): the server's one JSON document, checked.
   *
   * <p>Officer-only until 2026-09-12; `RequireAdminAsync` now answers it, so a registry
   * administrator reads it too. The sentence a `403` produces says so rather than naming the
   * recovery roster — the roster is one of the two ways in, not the only one.</p>
   */
  async readMetrics(account: StoredAccount): Promise<ServerMetrics> {
    const probe = await this.probeMetrics(account);
    if ('metrics' in probe) {
      return probe.metrics;
    }
    throw new Error(METRICS_REFUSALS[probe.failure](account.email, this.location));
  }

  /**
   * The metrics document, or WHY there is none — classified rather than thrown.
   *
   * <p>The tree's Server section has to DRAW a refusal (a warning row with a reason) where the
   * metrics tab shows a message, so the distinction between "could not reach", "refused" and "this
   * server has no such route" has to survive as a value. `readMetrics` is built on this rather than
   * beside it, so there is one reader and one classification.</p>
   */
  async probeMetrics(account: StoredAccount): Promise<MetricsProbe> {
    const response = await this.request(account, '/api/metrics').catch(() => undefined);
    if (response === undefined) {
      return { failure: 'unreachable' };
    }
    const refused = REFUSAL_BY_STATUS[response.status];
    if (refused !== undefined) {
      return { failure: refused };
    }
    return this.readProbeBody(response);
  }

  private async readProbeBody(response: Response): Promise<MetricsProbe> {
    if (!response.ok) {
      return { failure: 'unreachable' };
    }
    const parsed: unknown = await response.json().catch(() => undefined);
    // A shape this build cannot read is not a reachable server as far as the section is concerned:
    // it has no facts to draw, and inventing a fifth state for it would be a row nobody can act on.
    return isServerMetrics(parsed) ? { metrics: parsed } : { failure: 'unreachable' };
  }

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
