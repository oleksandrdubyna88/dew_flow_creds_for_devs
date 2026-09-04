/**
 * `creds://<account>/<entity path>/<field>` — a reference to a secret, written where a value
 * would otherwise be typed.
 *
 * <p>The point is that a script variable or a command argument can NAME a credential instead
 * of holding a copy of it. A name is not a secret, so it syncs, it is shareable, and it is
 * safe in the plaintext metadata a script body already lives in — while the value is fetched
 * at the moment of running and handed only to the child process.</p>
 *
 * <p><b>Addressing by name is a decision with a cost, and the cost is stated rather than
 * hidden.</b> Everything inside this extension is addressed by id; a reference a human types
 * cannot be, because an id is a UUID nobody will write. So an account is matched by email and
 * an entity by name — and entity names carry NO uniqueness rule anywhere in this codebase.
 * Two siblings may be called `prod-db`. An ambiguous reference is therefore REFUSED, with both
 * candidates named, and a folder path (`Servers/EU/gateway`) is the way to disambiguate.
 * Silently picking one would be the worst of the three options: it would work until the day it
 * chose the other.</p>
 *
 * <p>Pure and `vscode`-free: the vault is passed in as `RefSource`.</p>
 */

import { FieldReading } from './fieldReading';

/** The fields a reference may name. Exactly the values a run can put in an environment. */
export const SECRET_REF_FIELDS = [
  'password',
  'privateKey',
  'publicKey',
  'dbConnection',
  'dbPassword',
  'notes',
  'totp',
] as const;

export type SecretRefField = (typeof SECRET_REF_FIELDS)[number];

export interface SecretRef {
  /** The account's email address, as written (matching is case-insensitive). */
  account: string;
  /** Folder names then the entity name; at least one segment. */
  entityPath: string[];
  field: SecretRefField;
}

const SCHEME = 'creds://';

/** Anything that looks like a reference, for scanning a body or an argument row. */
const REF_PATTERN = /creds:\/\/[^\s'"`,;)\]}]+/g;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** account + at least one entity segment + a field this resolver knows. */
function wellFormed(segments: readonly string[]): boolean {
  const field = segments[segments.length - 1];
  return (
    segments.length >= 3 &&
    !segments.some((s) => s.trim().length === 0) &&
    (SECRET_REF_FIELDS as readonly string[]).includes(field)
  );
}

/** One reference, or `undefined` when the text is not one. */
export function parseSecretRef(text: string): SecretRef | undefined {
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith(SCHEME)) {
    return undefined;
  }
  const segments = trimmed.slice(SCHEME.length).split('/').map(decode);
  if (!wellFormed(segments)) {
    return undefined;
  }
  return {
    account: segments[0].trim(),
    entityPath: segments.slice(1, -1).map((s) => s.trim()),
    field: segments[segments.length - 1] as SecretRefField,
  };
}

/** Every distinct reference inside a larger string, in the order they appear. */
export function findSecretRefs(text: string): string[] {
  const found = new Set<string>();
  for (const candidate of text.match(REF_PATTERN) ?? []) {
    if (parseSecretRef(candidate) !== undefined) {
      found.add(candidate);
    }
  }
  return [...found];
}

/** What the resolver needs from the vault — ids stay internal, names come in. */
export interface RefSource {
  accounts(): Array<{ accountId: string; email: string }>;
  /** Every entity of one account, with its folder path (folders first, entity name last). */
  entities(accountId: string): Array<{ id: string; name: string; path: string[] }>;
  /**
   * One field, as one of the three readings.
   *
   * <p>Not `string | undefined`: a woven password is stored and unusable, and this resolver used to
   * report it as <i>"has no password stored"</i> — false in both halves. A reviewer's finding.</p>
   */
  fieldReading(accountId: string, entityId: string, field: SecretRefField): Promise<FieldReading>;
}

export type RefResolution =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string };

function samePath(candidate: readonly string[], wanted: readonly string[]): boolean {
  // A reference names a suffix of the path: `gateway` matches `Servers/EU/gateway`, and
  // `EU/gateway` narrows it. Case-insensitive, because a person typing a name is not
  // transcribing an identifier.
  if (wanted.length > candidate.length) {
    return false;
  }
  const tail = candidate.slice(candidate.length - wanted.length);
  return tail.every((segment, i) => segment.toLowerCase() === wanted[i].toLowerCase());
}

function describePath(path: readonly string[]): string {
  return path.join('/');
}

/** The one entity a reference names, or the reason it names none — or too many. */
function locate(
  raw: string,
  ref: SecretRef,
  source: RefSource,
): { ok: true; accountId: string; entityId: string; path: string[] } | { ok: false; error: string } {
  const account = source.accounts().find((a) => a.email.toLowerCase() === ref.account.toLowerCase());
  if (account === undefined) {
    return { ok: false, error: `No signed-in account with the email "${ref.account}" — ${raw} cannot be resolved.` };
  }
  const matches = source.entities(account.accountId).filter((e) => samePath(e.path, ref.entityPath));
  if (matches.length === 0) {
    return {
      ok: false,
      error: `No entity "${describePath(ref.entityPath)}" in ${account.email} — ${raw} cannot be resolved.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error:
        `"${describePath(ref.entityPath)}" is ambiguous in ${account.email}: ` +
        `${matches.map((m) => `"${describePath(m.path)}"`).join(', ')}. ` +
        'Add the folder to the reference so it names one of them.',
    };
  }
  return { ok: true, accountId: account.accountId, entityId: matches[0].id, path: matches[0].path };
}

type OneResolution = { ok: true; value: string } | { ok: false; error: string };

/** Read the field off the located entity — empty is an error, with the entity named. */
async function readField(
  raw: string,
  ref: SecretRef,
  found: { accountId: string; entityId: string; path: string[] },
  source: RefSource,
): Promise<OneResolution> {
  const reading = await source.fieldReading(found.accountId, found.entityId, ref.field);
  if (reading.kind === 'value') {
    return { ok: true, value: reading.value };
  }
  return {
    ok: false,
    error:
      reading.kind === 'withheld'
        ? `${raw} cannot be resolved automatically. ${reading.reason}`
        : `"${describePath(found.path)}" has no ${ref.field} stored — ${raw} resolves to nothing.`,
  };
}

/** One reference to its value, or the reason it has none. */
async function resolveOne(raw: string, source: RefSource): Promise<OneResolution> {
  const ref = parseSecretRef(raw);
  if (ref === undefined) {
    return { ok: false, error: `"${raw}" is not a valid creds:// reference.` };
  }
  const found = locate(raw, ref, source);
  return found.ok ? readField(raw, ref, found, source) : found;
}

/**
 * Resolve every reference, or fail naming the first problem.
 *
 * <p>All-or-nothing on purpose: a run that started with half its secrets resolved would fail
 * inside the child, where the reason is a tool's own error message instead of ours.</p>
 */
export async function resolveSecretRefs(
  refs: readonly string[],
  source: RefSource,
): Promise<RefResolution> {
  const values: Record<string, string> = {};
  for (const raw of refs) {
    const resolved = await resolveOne(raw, source);
    if (!resolved.ok) {
      return resolved;
    }
    values[raw] = resolved.value;
  }
  return { ok: true, values };
}
