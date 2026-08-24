/**
 * Secret fields exported as environment variables in the integrated terminal.
 *
 * <p>The NAME of a variable travels with the entity's metadata — it is not a secret and
 * syncing it means the binding exists on every machine. The VALUE is written only
 * locally, into VS Code's environment variable collection, from this machine's own
 * SecretStorage — so a synced binding on a fresh machine is a name waiting for the
 * `Set env` button, never a secret that travelled in plaintext.</p>
 *
 * <p>The collection injects variables into every integrated terminal opened after the
 * write, and persists across reloads. It can still be lost with the extension's storage
 * — which is why the viewer keeps a manual button alongside the automatic write on
 * save.</p>
 */

/** The fields that can be exported. Exactly the ones the viewer masks, plus the public key. */
export const BINDABLE_FIELDS = ['password', 'privateKey', 'publicKey', 'dbConnection', 'dbPassword'] as const;

export type BindableField = (typeof BINDABLE_FIELDS)[number];

export type EnvBindings = Partial<Record<BindableField, string>>;

/** POSIX-and-Windows-safe: a letter or underscore, then letters, digits, underscores. */
export function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * `git key` + `privateKey` -> `ENV_GITKEY_PRIVATEKEY` — the entity name flattened to
 * the characters a shell accepts, the field appended as-is in caps.
 */
export function defaultEnvName(entityName: string, field: BindableField): string {
  const flat = entityName.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const base = flat.length > 0 ? flat : 'ENTITY';
  return `ENV_${base}_${field.toUpperCase()}`;
}

/**
 * Variable names the save must DELETE from the collection: bound before, and no field
 * binds them any more. Without this a renamed or switched-off binding stays set in every
 * future terminal forever — the collection has no idea the entity moved on.
 */
export function staleEnvNames(
  before: EnvBindings | undefined,
  after: EnvBindings | undefined,
): string[] {
  const keep = new Set(Object.values(after ?? {}));
  return [...new Set(Object.values(before ?? {}))].filter((name) => !keep.has(name));
}
