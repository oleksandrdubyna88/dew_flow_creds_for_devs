import { CorpPolicyState } from './corpPolicy';
import { SharingManager } from './sharingManager';
import { SigningKeypair } from './shareSignature';
import { describeError } from './describeError';
import { projectOfNode } from './projectFolders';
import { ShareForm, sealShare } from './shareFormat';
import { refuseShare } from './shareRule';
import { SharePayload, StoredAccount, TeamMember, TreeNode } from './types';

/**
 * The corporate half of the share path: where an entity sits, whether that permits the share, which
 * binding form follows, and one recipient's delivery.
 *
 * <p>Its own module rather than more private methods on `ShareInbox`, which was already at the
 * 800-line ceiling: this is a whole concern, and it is testable without a window, a vault or a
 * server — `deliverToRecipient` takes the two things it needs as an argument rather than reaching
 * for a class.</p>
 */

/** The project folder above each payload's node, in the sender's own tree. */
export function projectsOfPayloads(
  payloads: readonly SharePayload[],
  getNode: (id: string) => TreeNode | undefined,
): (string | undefined)[] {
  return payloads.map((payload) => projectOfNode(payload.node, getNode));
}

/**
 * The first refusal these entities earn for this recipient, or empty.
 *
 * <p>One sentence rather than a list: every row says the same thing when a developer is sharing out
 * of the wrong place, and the person needs to know what to do, not how many entries agree.</p>
 *
 * <p><b>Never an enforcement.</b> The server decides again on every request; this exists so a share
 * that cannot succeed fails before a PIN is typed rather than after, with a sentence that says what
 * to do about it.</p>
 */
export function refuseForRecipient(
  policy: CorpPolicyState | undefined,
  recipientProjectIds: readonly string[] | undefined,
  projects: readonly (string | undefined)[],
): string {
  for (const entityProjectId of projects) {
    const refusal = refuseShare({ policy, entityProjectId, recipientProjectIds });
    if (refusal !== '') {
      return refusal;
    }
  }
  return '';
}

/**
 * The form a share takes once the entity's project is known.
 *
 * <p>The TRANSPORT decides the family — a folder takes the bound form, a vault server the server
 * form, a server too old for `format` none at all — and this is the second question, asked only
 * inside the server family: a share that HAS a project binds it, and one that has none is what it
 * always was. `sharingManager.shareFormFor` says the form is a property of the transport and never
 * of the payload; that stays true of the FAMILY, and this refines it rather than contradicting it.</p>
 */
export function formWithProject(form: ShareForm, projectId?: string): ShareForm {
  return form === 'server' && projectId !== undefined && projectId.length > 0 ? 'project' : form;
}

/** The two collaborators one delivery needs, so this stays callable from a test. */
export interface DeliveryDeps {
  readonly sharing: Pick<SharingManager, 'appendShares'>;
  readonly policyOf?: (accountId: string) => CorpPolicyState | undefined;
}

/** Who is sending what to whom, and how it is to be sealed. */
export interface DeliveryTarget {
  readonly sender: StoredAccount;
  readonly recipient: TeamMember;
  readonly pin: string;
  readonly form: ShareForm;
  readonly signing?: SigningKeypair;
}

/**
 * One recipient's delivery, and what to say about it.
 *
 * <p>A share the server would refuse fails HERE, with the sentence that says what to do, rather
 * than as a failed delivery after a PIN has been typed. Never an enforcement — the server decides
 * again on every request — and never a refusal on facts this window does not hold.</p>
 */
export async function deliverToRecipient(
  deps: DeliveryDeps,
  to: DeliveryTarget,
  payloads: readonly SharePayload[],
  projects: readonly (string | undefined)[],
): Promise<{ ok: boolean; line: string }> {
  const { sender, recipient, pin, form, signing } = to;
  const refusal = refuseForRecipient(deps.policyOf?.(sender.accountId), recipient.projectIds, projects);
  if (refusal !== '') {
    return { ok: false, line: `${recipient.account.email}: ${refusal}` };
  }
  try {
    const items = payloads.map((p, index) =>
      sealShare(p, recipient.shareKeyId, sender, pin, Date.now(), {
        form: formWithProject(form, projects[index]),
        projectId: projects[index],
        signing,
        toEmail: recipient.account.email,
      }),
    );
    await deps.sharing.appendShares(sender, recipient, items);
    return { ok: true, line: recipient.account.email };
  } catch (error) {
    return { ok: false, line: `${recipient.account.email}: ${describeError(error)}` };
  }
}
