import type { BackupTargetInput, BackupTargetSummary } from './orgBackupClient';

/**
 * The destinations as the tab edits them — pure, `vscode`-free, and the server's own rules spelled
 * once on this side so a typo costs no round trip.
 *
 * <p>Every sentence here mirrors one the server would answer (`BackupTargets.Problem`,
 * `ArchiveTargets.EndpointProblem`): the page greys a Save out with the same words the server
 * would have used, instead of two wordings for one rule. What this module cannot know — whether the
 * bucket exists, whether the credentials work — the server proves at save time with a write-and-delete
 * probe, and its sentence comes back verbatim.</p>
 *
 * <p><b>Nothing here holds a credential longer than the call.</b> A `BackupTargetInput` with keys is
 * built for one request and handed over; the helpers that build the list a save sends take the
 * summaries the server returned — which carry no keys — and the one edited input.</p>
 */

/** The two kinds this build can describe. A drive kind is the next plan's, with its own consent flow. */
export const TARGET_KINDS: ReadonlyArray<{ readonly kind: string; readonly label: string }> = [
  { kind: 's3', label: 'S3 (or S3-compatible)' },
  { kind: 'azure-blob', label: 'Azure Blob Storage' },
];

export function isTargetKind(kind: string): boolean {
  return TARGET_KINDS.some((known) => known.kind === kind);
}

/** The words for a destination — the same ones the server's `SealedTarget.Describe` uses. */
export function describeTarget(target: Pick<BackupTargetInput, 'kind' | 'bucket' | 'prefix'>): string {
  const where = `${target.bucket}/${target.prefix}`.replace(/\/+$/, '');
  return `${target.kind === 's3' ? 's3' : 'azure'} ${where}`;
}

/** What makes an edit an EDIT rather than a new destination: the server's identity, spelled the same. */
export function identityOf(target: Pick<BackupTargetInput, 'kind' | 'endpoint' | 'bucket' | 'prefix'>): string {
  return [target.kind, target.endpoint, target.bucket, target.prefix].map(trimmed).join('|');
}

/**
 * A destination as the save sends it: trimmed, the region blank for any kind that is not S3, and
 * every credential field dropped when it is empty — so "left empty" arrives as OMITTED, which is the
 * server's "keep the sealed ones".
 *
 * <p>The region rule is the plan gate's (local): a region typed under S3 survives a switch to Azure
 * in the hidden input, and would otherwise be sent and stored for a kind that has no region.</p>
 */
export function normalizeTarget(input: BackupTargetInput): BackupTargetInput {
  const kind = trimmed(input.kind);
  return {
    kind,
    endpoint: trimmed(input.endpoint),
    region: kind === 's3' ? trimmed(input.region) : '',
    bucket: trimmed(input.bucket),
    prefix: trimmed(input.prefix),
    ...presentCredentials(input),
  };
}

/** The credential fields that carry something, and none of the others. */
function presentCredentials(input: BackupTargetInput): Partial<BackupTargetInput> {
  const kept: Record<string, string> = {};
  for (const field of CREDENTIAL_FIELDS) {
    const value = trimmed(input[field]);
    if (value.length > 0) {
      kept[field] = value;
    }
  }
  return kept;
}

const CREDENTIAL_FIELDS = ['accessKeyId', 'secretAccessKey', 'accountName', 'accountKey'] as const;

/**
 * What the server would refuse about this destination, or nothing — checked before any request.
 *
 * <p>`hasSealed` is whether the server already holds credentials for this identity: leaving both
 * halves out is then "keep them", and otherwise it is the first save, which needs both.</p>
 */
export function targetProblem(input: BackupTargetInput, hasSealed: boolean): string {
  const target = normalizeTarget(input);
  if (!isTargetKind(target.kind)) {
    return `'${target.kind}' is not a kind of destination this server takes. It takes 's3' and 'azure-blob'.`;
  }
  const endpoint = endpointProblem(target.endpoint);
  if (endpoint.length > 0) {
    return endpoint;
  }
  const bucket = bucketProblem(target);
  if (bucket.length > 0) {
    return bucket;
  }
  return credentialsProblem(target, hasSealed);
}

function bucketProblem(target: BackupTargetInput): string {
  if (target.bucket.length > 0) {
    return '';
  }
  return target.kind === 's3' ? 'A bucket name is required.' : 'A container name is required.';
}

/**
 * The endpoint rule, as the server states it: https anywhere, plain http on loopback only.
 *
 * <p>The archive's body is not covered by the request signature, so the transport is what protects
 * it, and a key travelling in clear is the whole deployment. A developer running MinIO on
 * `127.0.0.1` has nothing between — that is the one exception, and it is the only one.</p>
 */
export function endpointProblem(endpoint: string): string {
  const url = parsed(endpoint);
  if (url === undefined) {
    return 'That is not a URL. An endpoint looks like https://s3.eu-central-1.amazonaws.com.';
  }
  if (isProtected(url)) {
    return '';
  }
  return 'The endpoint must be https. The archive body is not covered by the request signature, so the '
    + 'transport is what protects it. Plain http is accepted for loopback only.';
}

/** TLS, or nothing between — the only two transports that protect an account key in flight. */
function isProtected(url: URL): boolean {
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
}

function parsed(endpoint: string): URL | undefined {
  try {
    return new URL(endpoint);
  } catch {
    return undefined;
  }
}

/** What `Uri.IsLoopback` answers on the server: localhost, the v4 loopback block, and `::1`. */
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname.startsWith('127.') || hostname === '[::1]' || hostname === '::1';
}

/**
 * Both halves of a credential, or neither — and neither only where something is already sealed.
 *
 * <p>The message names the FIELD that is missing rather than the pair, exactly as the server does:
 * an administrator who forgot one of two would otherwise have to guess which.</p>
 */
function credentialsProblem(target: BackupTargetInput, hasSealed: boolean): string {
  const missing = missingHalf(halvesOf(target));
  if (missing === NEITHER_HALF) {
    return hasSealed ? '' : firstTime(target.kind);
  }
  return missing.length === 0
    ? ''
    : `${missing} is missing. Both halves of a credential are needed, or neither — leaving both out `
      + 'keeps the ones already sealed for this destination.';
}

/** Neither half was typed: keep the sealed ones, or the first save that needs both. */
const NEITHER_HALF = '(neither)';

/** The name of the ONE half left out, `NEITHER_HALF` when both were, nothing when both are there. */
function missingHalf(halves: readonly Half[]): string {
  const empty = halves.filter((half) => half.value.length === 0);
  if (empty.length === halves.length) {
    return NEITHER_HALF;
  }
  return empty.length === 0 ? '' : empty[0].name;
}

interface Half {
  readonly name: string;
  readonly value: string;
}

/** The two credential fields of this kind, in the order the server names them. */
function halvesOf(target: BackupTargetInput): readonly Half[] {
  return target.kind === 's3'
    ? [half('accessKeyId', target.accessKeyId), half('secretAccessKey', target.secretAccessKey)]
    : [half('accountName', target.accountName), half('accountKey', target.accountKey)];
}

function half(name: string, value: string | undefined): Half {
  return { name, value: trimmed(value) };
}

function firstTime(kind: string): string {
  return kind === 's3'
    ? 'An access key id and a secret access key are required the first time this destination is saved. '
      + 'They are sealed and never shown again, so a later edit that leaves them out keeps the ones already here.'
    : 'An account name and an account key are required the first time this destination is saved. '
      + 'They are sealed and never shown again, so a later edit that leaves them out keeps the ones already here.';
}

/**
 * The destinations the server holds, as the key-less requests a save re-sends them as.
 *
 * <p>A summary carries no credential, so a request built from one carries none either — and the
 * server keeps what is sealed, matched by identity. This is the whole reason a save can send the
 * list WHOLE without anybody retyping a secret they were never shown.</p>
 */
export function toInputs(summaries: readonly BackupTargetSummary[]): BackupTargetInput[] {
  return summaries.map((summary) => ({
    kind: summary.kind,
    endpoint: summary.endpoint,
    region: summary.region,
    bucket: summary.bucket,
    prefix: summary.prefix,
  }));
}

/** The list with `edited` in place of the row at `at`, or appended when there is no such row. A new list. */
export function withTarget(
  list: readonly BackupTargetInput[],
  edited: BackupTargetInput,
  at: number | undefined,
): BackupTargetInput[] {
  return at === undefined || at < 0 || at >= list.length
    ? [...list, edited]
    : list.map((target, index) => (index === at ? edited : target));
}

/** The list without the row at `at`. A new list; an index out of range changes nothing. */
export function withoutTarget(list: readonly BackupTargetInput[], at: number): BackupTargetInput[] {
  return list.filter((_target, index) => index !== at);
}

function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}
