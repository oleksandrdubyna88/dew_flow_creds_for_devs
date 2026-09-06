import { CorpPolicyState } from './corpPolicy';
import { OrgRecoveryClient } from './orgRecoveryClient';
import { OrgRecoveryVerdict } from './orgRecoveryPinning';
import { EscrowEnrolment } from './orgEscrowOps';
import { LoginKeySession } from './devLoginKeySession';
import { BindingContext } from './syncBinding';
import { StoredAccount } from './types';

/**
 * The one place the developer-binding pieces are joined: the session that holds the login key, the
 * unlock path that needs it to open a bound vault, and the sync cycle that decides what this write
 * should bind.
 *
 * <p>Its own module because `extension.ts` is at its size ratchet and because this wiring is worth
 * reading in one piece rather than as six lines threaded between unrelated ones. `vscode`-free, so
 * what it connects is a unit test.</p>
 */

/** The pieces this wiring needs, named structurally so a test can pass three objects. */
export interface BindingWiring {
  /** Where the login key comes from and where it is dropped. */
  readonly session: LoginKeySession;
  /** The unlock path — it asks the session only when a wrap says the vault is bound. */
  readonly keys: { loginKeys: { resolve: (account: StoredAccount) => Promise<{ key: Buffer } | undefined> } | undefined };
  /** The sync cycle — it asks for the whole context once per write. */
  readonly sync: { resolveBinding: ((account: StoredAccount) => Promise<BindingContext | undefined>) | undefined };
  /** This window's view of who each account is to its server. */
  readonly policyOf: (accountId: string) => CorpPolicyState | undefined;
  /** The account's stored sync PIN, when there is one — what decides whether a write can bind. */
  readonly storedPin: (account: StoredAccount) => Promise<string | undefined>;
}

/**
 * Join them.
 *
 * <p><b>The policy comes from the cache, not from a fresh fetch.</b> The readiness loop already
 * reads `GET /api/org/me` once per account per cycle; asking again here would double that traffic
 * and could answer differently within one write. An absent entry is "we do not know", which
 * `loginKeyAction` treats as "change nothing" — the rule that keeps a flaky network from stripping a
 * binding.</p>
 */
export function wireDevBinding(w: BindingWiring): void {
  w.keys.loginKeys = { resolve: (account) => w.session.resolve(account) };
  w.sync.resolveBinding = async (account) => bindingContext(w, account);
}

async function bindingContext(w: BindingWiring, account: StoredAccount): Promise<BindingContext> {
  const policy = w.policyOf(account.accountId);
  const held = await w.session.resolve(account);
  return {
    policy: policy === undefined ? undefined : { role: policy.role, active: policy.active },
    loginKey: held,
    // The PIN is what decides whether THIS write can rewrite the PIN wrap at all. A window with no
    // stored PIN binds at the next unlock that asks for one — never by prompting from a background
    // cycle, which is a modal dialog nobody asked for over a file they are not looking at.
    pin: await w.storedPin(account),
  };
}

/** What the escrow resolver needs to judge a server's published key against what this machine pinned. */
export interface EscrowFacts {
  readonly enabled: boolean;
  readonly setupComplete: boolean;
  readonly orgPublicKeyFingerprint: string;
  readonly rosterFingerprint: string;
  readonly location: string;
}

/**
 * Corporate escrow, attached to the sync cycle.
 *
 * <p>Assigned after construction because the transports have to exist first, and because a
 * `SyncManager` built without it must behave exactly as it did before the feature — which is what
 * every deployment with no corporate recovery is.</p>
 *
 * <p>What it answers is a TRUST decision as much as a configuration one: the judge turns the
 * server's answer into a verdict against what this machine pinned, and `escrowAction` refuses to
 * seal anything to a key the verdict rejects. Returning `undefined` means "could not ask" — an
 * unreachable server, an older one, a folder transport — and the cycle then leaves the wraps
 * exactly as they are.</p>
 */
export function wireCorpEscrow(
  sync: {
    resolveEscrow: ((account: StoredAccount) => Promise<EscrowEnrolment | undefined>) | undefined;
    escrowOfficers: readonly string[];
  },
  clientFor: (account: StoredAccount) => OrgRecoveryClient | undefined,
  judge: (accountId: string, facts: EscrowFacts) => OrgRecoveryVerdict,
): void {
  sync.resolveEscrow = async (account) => {
    const client = clientFor(account);
    if (client === undefined) {
      return undefined;
    }
    const config = await client.readConfig(account);
    sync.escrowOfficers = config.officerEmails;
    return {
      orgPublicKey: Buffer.from(config.orgPublicKey, 'base64'),
      orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
      verdict: judge(account.accountId, {
        enabled: config.enabled,
        setupComplete: config.setupComplete,
        orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
        rosterFingerprint: config.rosterFingerprint,
        location: client.location,
      }),
    };
  };
}
