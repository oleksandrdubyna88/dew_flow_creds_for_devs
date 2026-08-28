/**
 * A credential's login and URL (the owner, 2026-08-28): stored ENCRYPTED, like the password —
 * in the keychain here, sealed in the vault, the share and the backup — and shown in CLEAR on
 * the card, unlike the password. Identifiers, not credentials: an agent's output is not masked
 * for them, and an agent's listing never carries them.
 *
 * <p>One secret kind rather than two: the record travels as one JSON string under one key, so
 * a third field one day is a key in this object, not another pass through every seam a secret
 * kind touches (storage, bundle, snapshot, merge, share, revision — nine files today).</p>
 */

export interface EntityFields {
  login?: string;
  url?: string;
}

export const FIELD_KEYS = ['login', 'url'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_LABELS: Record<FieldKey, string> = { login: 'Login', url: 'URL' };

/** The stored JSON, or anything else, into a record — a string that does not parse is no fields. */
export function parseFields(raw: string | undefined): EntityFields {
  if (raw === undefined || raw.length === 0) {
    return {};
  }
  try {
    return pickFields(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/** Only the known keys, only non-empty strings. */
export function pickFields(value: unknown): EntityFields {
  const source = isRecord(value) ? value : {};
  const out: EntityFields = {};
  for (const key of FIELD_KEYS) {
    const clean = cleanString(source[key]);
    if (clean !== undefined) {
      out[key] = clean;
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** The JSON to store — `undefined` when there is nothing to store, so an empty record deletes. */
export function serializeFields(fields: EntityFields | undefined): string | undefined {
  const picked = pickFields(fields);
  return Object.keys(picked).length === 0 ? undefined : JSON.stringify(picked);
}
