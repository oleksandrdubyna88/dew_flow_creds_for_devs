import { DEFAULT_PASSPHRASE, DEFAULT_PASSWORD, generatePassphrase, generatePassword } from './secretGenerator';

/**
 * What this extension can make, and what it knows it cannot.
 *
 * <p>The whole point of levels 3 and 4 is that a secret is generated HERE and never passes
 * through an agent's context. That works exactly as far as the generators reach — and it is
 * worth being precise about where they stop, because the alternative is an agent quietly filling
 * the gap. When it does, the value is in its context, and the journal counts it.</p>
 *
 * <p><b>So the unsupported kinds are named rather than left to fall through.</b> "We cannot make
 * an X.509 certificate" is a sentence an agent can act on — it can say so, or offer to make one
 * itself and have the person weigh the trade. A generic "unknown kind" would leave it guessing at
 * a typo. The journal's <i>Could not generate</i> filter is the count of exactly these, which is
 * how the gap stays visible instead of becoming folklore.</p>
 *
 * <p>Pure: no `vscode`, no storage.</p>
 */

/** Every kind this product has a word for, generated here or not. */
export const SECRET_KINDS = ['password', 'passphrase', 'ed25519', 'rsa', 'ecdsa', 'x509', 'totp'] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

export function isSecretKind(value: string): value is SecretKind {
  return (SECRET_KINDS as readonly string[]).includes(value);
}

/**
 * The kinds a rotation or a creation can draw here.
 *
 * <p>Three, and each is a value that fits in one field. An SSH KEYPAIR is deliberately absent
 * even though `generateEd25519` exists: rotating one means installing the public half on the far
 * side, which is a different operation with a different failure mode, not a longer password.
 * Promising it here and half-doing it would be worse than saying no.</p>
 */
const GENERATORS: Partial<Record<SecretKind, () => string>> = {
  password: () => generatePassword(DEFAULT_PASSWORD).value,
  passphrase: () => generatePassphrase(DEFAULT_PASSPHRASE).value,
};

/**
 * Why a kind is not generated here, in words an agent can pass on.
 *
 * <p>Each says what it is and what the person would do instead. None of them apologises: these
 * are deliberate absences, not gaps waiting to be filled by whoever reads this next.</p>
 */
const NOT_GENERATED: Partial<Record<SecretKind, string>> = {
  ed25519:
    'This makes values, not key pairs — rotating an SSH key means installing the public half on the far side, which is a different operation. Generate the key in the entry\'s form and copy the public half yourself.',
  rsa: 'Only ed25519 keys are made here, and only in the entry form. An RSA key is one that already exists somewhere and is pasted in.',
  ecdsa: 'Only ed25519 keys are made here, and only in the entry form.',
  x509: 'Certificates are not generated here at all — they come from a certificate authority, and what that authority requires is not something this can guess.',
  totp: 'A one-time-code seed is issued by the service you are enrolling with. Add it in the entry form from the QR code or the setup key they give you.',
};

export type GenerationOutcome =
  | { ok: true; value: string; kind: SecretKind }
  | { ok: false; kind: SecretKind | undefined; message: string };

/**
 * Draw a secret of this kind, or say why not.
 *
 * <p>The three answers are three different situations. A kind we make is made. A kind we know and
 * do not make is refused with the reason — and that refusal is what the journal counts, because
 * it is the map of where an agent will be tempted to fill in for us. A word that is not a kind at
 * all is a different refusal: it is a typo, and telling somebody the vocabulary is more useful
 * than explaining a policy they did not run into.</p>
 */
export function generateSecret(kind: string): GenerationOutcome {
  if (!isSecretKind(kind)) {
    return {
      ok: false,
      kind: undefined,
      message: `"${kind}" is not a kind of secret. One of: ${SECRET_KINDS.join(', ')}.`,
    };
  }
  const draw = GENERATORS[kind];
  if (draw === undefined) {
    return { ok: false, kind, message: NOT_GENERATED[kind] ?? `${kind} is not generated here.` };
  }
  return { ok: true, value: draw(), kind };
}

/** Can this kind be drawn here? For a tool description that lists them honestly. */
export function canGenerate(kind: SecretKind): boolean {
  return GENERATORS[kind] !== undefined;
}

/** The ones a caller may ask for, in the order a description should list them. */
export function generatableKinds(): SecretKind[] {
  return SECRET_KINDS.filter((kind) => canGenerate(kind));
}

/**
 * The audit outcome for a refusal to generate.
 *
 * <p>One string, used by the writer and by the journal's filter, because two copies of a word
 * that a view greps for is two until somebody edits one of them.</p>
 */
export const NO_GENERATOR_OUTCOME = 'no generator';
