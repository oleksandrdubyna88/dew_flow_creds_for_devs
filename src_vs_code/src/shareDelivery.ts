import { CorpPolicyState } from './corpPolicy';
import { SharingManager } from './sharingManager';
import { SigningKeypair } from './shareSignature';
import { describeError } from './describeError';
import { describeTransitSecret } from './transitSecretReport';
import { projectOfNode } from './projectFolders';
import { DiagnosticWriter } from './diagnosticWriter';
import { ShareDiagnostic, noteShareSent } from './shareDiagnostics';
import { ShareForm, sealShare, shareAadText } from './shareFormat';
import { refuseShare } from './shareRule';
import { ShareItem, SharePayload, StoredAccount, TeamMember, TreeNode } from './types';

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
  readonly log: DiagnosticWriter;
  readonly sharing: Pick<SharingManager, 'appendShares'>;
  readonly policyOf?: (accountId: string) => CorpPolicyState | undefined;
}

/**
 * What one delivery produced: whether it landed, what to say about it, and the sender's half of
 * the diagnostic pair for every item it sealed.
 */
export interface DeliveryOutcome {
  readonly ok: boolean;
  readonly line: string;
  readonly sent: readonly ShareDiagnostic[];
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
): Promise<DeliveryOutcome> {
  const { sender, recipient, form } = to;
  const refusal = refuseForRecipient(deps.policyOf?.(sender.accountId), recipient.projectIds, projects);
  if (refusal !== '') {
    return { ok: false, line: `${recipient.account.email}: ${refusal}`, sent: [] };
  }
  const sent: ShareDiagnostic[] = [];
  try {
    const items = payloads.map((payload, index) =>
      sealWithDiagnostic(sent, to, payload, formWithProject(form, projects[index]), projects[index]),
    );
    await deps.sharing.appendShares(sender, recipient, items);
    // Recorded HERE, and only past the append: a delivery that threw has sealed items and delivered
    // none of them, and a `share SENT` line for those would claim a pairing the recipient can never
    // make. The caller used to decide this and a review round found it deciding it wrongly.
    noteShareSent(deps.log, recipient.account.email, sent);
    return { ok: true, line: recipient.account.email, sent };
  } catch (error) {
    // `sent` is returned on the failure path too: whatever WAS sealed before the transport gave
    // out is still the sender's half of a pair the recipient may hold.
    return { ok: false, line: `${recipient.account.email}: ${describeError(error)}`, sent };
  }
}

/**
 * Seal one payload, and record beside it what the sender can say about the seal.
 *
 * <p>The fingerprint is taken from the derivation `sealShare` already performed — reported through
 * `SealOptions.report` rather than computed afterwards, because computing it afterwards means a
 * second scrypt per item per recipient, and a folder share to three people would spend seconds
 * producing a value the seal already had.</p>
 *
 * <p>`aad` is read back off the ITEM rather than from the label that went in. That is deliberate:
 * the recipient can only ever compute it from the item, so building the sender's line the same way
 * is what makes a difference between the two lines a real difference.</p>
 */
function sealWithDiagnostic(
  into: ShareDiagnostic[],
  to: DeliveryTarget,
  payload: SharePayload,
  form: ShareForm,
  projectId: string | undefined,
): ShareItem {
  let keyFingerprint = '';
  const item = sealShare(payload, to.recipient.shareKeyId, to.sender, to.pin, Date.now(), {
    form,
    projectId,
    signing: to.signing,
    toEmail: to.recipient.account.email,
    report: (fingerprint) => {
      keyFingerprint = fingerprint;
    },
  });
  into.push({
    keyId: to.recipient.shareKeyId,
    entityName: payload.node.name,
    // Reduced here, at the capture site, so no value this function hands back can carry a secret.
    pinShape: describeTransitSecret(to.pin),
    keyFingerprint,
    blob: item,
    form,
    format: item.format,
    aad: shareAadText(item),
  });
  return item;
}
