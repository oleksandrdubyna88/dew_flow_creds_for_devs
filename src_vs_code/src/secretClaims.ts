import type { EntityMetadata } from './types';

/**
 * The metadata fields that ASSERT a secret exists — and must never be copied without it.
 *
 * <p>The write-order invariant is about a node claiming a record that is not there. Ordering handles
 * the TORN version of that state, the one a crash leaves for a moment. This list is about the
 * PERMANENT version, which is worse and had no name until an audit of the write paths found it in
 * two places: a claim copied onto a node whose secret was never written stays wrong forever, and it
 * syncs.</p>
 *
 * <p>Both cases were the same mistake — spreading `details` and fixing up the id — so the fix is one
 * table rather than two lists that would drift. What each field promises:</p>
 *
 * <ul>
 *   <li><b>hasTotp</b> — the tree row offers <i>Copy One-Time Code</i> on an entry with no seed.</li>
 *   <li><b>configKeyHash</b> — the entry answers to an application's config key. Two entries with
 *       one hash make `findConfigKeyHolder`'s `.find()` a race the wrong copy can win, and the live
 *       application then reads a config body that is not there. The worst of the seven.</li>
 *   <li><b>attachmentFileName / attachmentSize / attachmentChangedAt / attachmentChangedBy</b> — a
 *       download row, a size, and an attribution for a file nobody sent.</li>
 *   <li><b>imageFileName / imageSize / imageWidth / imageHeight</b> — the same, for an image.</li>
 *   <li><b>envBindings</b> — names an environment variable to be filled from a secret that is not
 *       there, so the shell gets an empty value where a credential was promised.</li>
 *   <li><b>pinProtected</b> — says the entry's values are wrapped under a PIN. A share unwraps them
 *       first (the recipient never gets the sender's PIN) and a clone copies no secrets at all, so
 *       at the far end the mark is false — and every consequence of it fires against nothing: the
 *       entry is hidden from that person's agent surfaces, the form says <i>PIN — on</i>, and the
 *       command it points at reads the values, finds nothing locked, and contradicts it. Shipped as
 *       a defect in 0.99.0. What travels instead is `pinAskOnImport`, which is an instruction to
 *       ask rather than a claim about a value.</li>
 * </ul>
 *
 * <p>`has:totp`, `has:attachment`, `has:image`, `has:env` and `has:code-access` all match on these,
 * so a false claim is not only a broken action — it is a search result that lies.</p>
 */
export const SECRET_CLAIM_FIELDS = [
  'hasTotp',
  'configKeyHash',
  'attachmentFileName',
  'attachmentSize',
  'attachmentChangedAt',
  'attachmentChangedBy',
  'imageFileName',
  'imageSize',
  'imageWidth',
  'imageHeight',
  'envBindings',
  'pinProtected',
] as const satisfies readonly (keyof EntityMetadata)[];

/** The same metadata with every claim about a stored secret dropped. */
export function withoutSecretClaims(details: EntityMetadata): EntityMetadata {
  const stripped = { ...details };
  for (const field of SECRET_CLAIM_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}
