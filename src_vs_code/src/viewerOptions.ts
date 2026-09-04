import { DB_DEFAULT_PORTS, DbConnParts, parseDbConnectionString } from './dbConnString';
import { Revision } from './revisionHistory';
import type { StorageManager } from './storageManager';
import { DbType, TreeNode } from './types';
import { TotpSnapshot, totpSnapshot } from './totp';
import { PaymentFields, parsePaymentFields } from './paymentFields';
import { PinGate, PinOpen, openStored } from './pinGate';
import {
  McpAccess,
  McpSource,
  ResolvedMcpAccess,
  accessMask,
  describeAccess,
  normalizeMcpAccess,
  resolveMcpInTree,
} from './mcpAccess';

/**
 * The shared half of the two entity viewers (audit 2026-08-25, A1).
 *
 * <p>The read-only viewer opens on two things — the LIVE entity, whose secrets live in the
 * keychain, and a kept REVISION, whose secrets ride the revision record — and each used to
 * carry its own copy of the same field-to-secret ladder and the same db-connection display
 * arithmetic. One drifted change (a new field, a changed default) would have made "the same
 * entry, as it was" quietly render differently from "the same entry, now". Both viewers now
 * feed from here; the difference between them collapses to WHERE a secret is read from,
 * which is exactly the `SecretReader` seam.</p>
 *
 * <p>Pure and free of `vscode`, so the mapping is a unit test.</p>
 */

/** The fields the viewer's per-field Copy can ask for (mirrors `EntityViewOptions`). */
export type ViewerSecretField =
  | 'password'
  | 'privateKey'
  | 'vpnConfig'
  | 'dbConnection'
  | 'dbPassword'
  | 'totp';

/** Where a viewer's secrets come from: the keychain (live) or the revision record. */
export interface SecretReader {
  password(): Thenable<string | undefined>;
  privateKey(): Thenable<string | undefined>;
  vpnConfig(): Thenable<string | undefined>;
  dbConnection(): Thenable<string | undefined>;
  /** The stored `otpauth://` seed. The viewer never gets this — only the code below. */
  totpSeed(): Thenable<string | undefined>;
  /**
   * The payment record as stored JSON. The page never gets this either — the card asks per field.
   *
   * <p>Here rather than at the two call sites for the reason this module exists (audit A1): the live
   * viewer and the revision viewer used to carry one field-to-secret ladder twice, and the payment
   * record is the ninth kind's version of exactly that. Adding it here is what makes a card work in
   * the history viewer without a second implementation deciding to differ.</p>
   */
  paymentRaw(): Thenable<string | undefined>;
}

/** The one field-to-secret ladder both viewers share. */
export function secretResolver(read: SecretReader): (field: ViewerSecretField) => Thenable<string | undefined> {
  // eslint-disable-next-line complexity -- one branch per field is the whole job
  return (field) =>
    field === 'password'
      ? read.password()
      : field === 'privateKey'
        ? read.privateKey()
        : field === 'vpnConfig'
          ? read.vpnConfig()
          : field === 'totp'
            ? // The CODE, never the seed — copying a one-time code is copying something that
              // expires, which is the whole point of the field.
              Promise.resolve(read.totpSeed()).then((uri) => totpSnapshot(uri, Date.now())?.code)
            : field === 'dbPassword'
              ? Promise.resolve(read.dbConnection()).then((v) =>
                  v === undefined ? undefined : parseDbConnectionString(v).password,
                )
              : read.dbConnection();
}

/** The live code for a viewer, or undefined when the entry has no seed. */
export function totpViewFor(read: SecretReader): () => Thenable<TotpSnapshot | undefined> {
  return () => Promise.resolve(read.totpSeed()).then((uri) => totpSnapshot(uri, Date.now()));
}

/**
 * The payment record for a viewer, parsed — `totpViewFor`'s shape, and deliberately so.
 *
 * <p>Read at each request rather than once, because the record can be edited while the panel is
 * open; and parsed here so a stored string that no longer parses is an empty record rather than an
 * exception out of a message handler.</p>
 */
export function paymentViewFor(read: SecretReader): () => Thenable<PaymentFields> {
  return () => Promise.resolve(read.paymentRaw()).then((raw) => parsePaymentFields(raw));
}

/** Live secrets: read from the keychain at the moment the Copy button is pressed. */
export function storageSecretReader(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): SecretReader {
  return {
    password: () => storage.getPassword(accountId, entityId),
    privateKey: () => storage.getPrivateKey(accountId, entityId),
    vpnConfig: () => storage.getVpnConfig(accountId, entityId),
    dbConnection: () => storage.getDbConnection(accountId, entityId),
    // Read at each request rather than once: the seed can be edited while the panel is open.
    totpSeed: () => storage.getTotp(accountId, entityId),
    paymentRaw: () => storage.getPaymentRaw(accountId, entityId),
  };
}

/**
 * The same reader, with every value passed through the PIN gate.
 *
 * <p>Wrapped HERE rather than at each of the six getters, because this is the one seam the live
 * viewer reads secrets through — the whole reason `SecretReader` exists. Six separate gates would
 * be six places to add the seventh field and forget one.</p>
 *
 * <p>Every miss is SAID: a cancelled prompt, a wrong PIN and a damaged wrap each produce a sentence
 * through `report`, and only then does the value come back undefined. What this must never be is a
 * silent `undefined` that the viewer renders as "nothing stored" about a value that is stored.</p>
 */
export function gatedSecretReader(
  inner: SecretReader,
  gate: PinGate,
  report: (message: string) => void,
): SecretReader {
  const through = (read: () => Thenable<string | undefined>) => async (): Promise<string | undefined> =>
    told(await openStored(await read(), gate), report);
  return {
    password: through(inner.password),
    privateKey: through(inner.privateKey),
    vpnConfig: through(inner.vpnConfig),
    dbConnection: through(inner.dbConnection),
    totpSeed: through(inner.totpSeed),
    paymentRaw: through(inner.paymentRaw),
  };
}

/** The value, or nothing — and nothing only after the reason has been put in front of somebody. */
function told(opened: PinOpen, report: (message: string) => void): string | undefined {
  if (opened.kind === 'value' || opened.kind === 'unprotected') {
    return opened.value;
  }
  if (opened.kind !== 'cancelled') {
    report(opened.reason);
  }
  return undefined;
}

/** A revision's secrets: whatever the record kept, nothing read from the keychain. */
export function revisionSecretReader(revision: Revision): SecretReader {
  const { password, privateKey, vpnConfig, dbConnection, totp, payment } = revision.secrets;
  return {
    password: () => Promise.resolve(password),
    privateKey: () => Promise.resolve(privateKey),
    vpnConfig: () => Promise.resolve(vpnConfig),
    dbConnection: () => Promise.resolve(dbConnection),
    // A replaced seed still produces codes — that is why history keeps it.
    totpSeed: () => Promise.resolve(totp),
    // The WHOLE record as it was, CVV and PIN included: a rollback that returned a card without
    // half its fields would be a worse defect than having no rollback (revisionHistory.ts).
    paymentRaw: () => Promise.resolve(payment),
  };
}

export interface DbDisplay {
  /** Parts for the viewer, with the password STRIPPED — it renders as a masked row. */
  dbParts: DbConnParts | undefined;
  /** True when the shown port is the type's default rather than the string's. */
  dbPortIsDefault: boolean;
  dbHasPassword: boolean;
}

/**
 * What the viewer shows for a DB connection: always a port (the type's default when the
 * string names none), never the password inline.
 */
// Moved as written from the two viewers (A1); the pre-existing complexity is marked, not hidden.
// eslint-disable-next-line complexity
export function dbDisplay(dbConnection: string | undefined, dbType: DbType | undefined): DbDisplay {
  const parsed = dbConnection !== undefined ? parseDbConnectionString(dbConnection) : undefined;
  let dbPortIsDefault = false;
  if (parsed !== undefined && parsed.port === undefined && dbType !== undefined) {
    parsed.port = DB_DEFAULT_PORTS[dbType];
    dbPortIsDefault = true;
  }
  return {
    dbParts: parsed !== undefined ? { ...parsed, password: undefined } : undefined,
    dbPortIsDefault,
    dbHasPassword: parsed?.password !== undefined,
  };
}

/**
 * The Agent-access summary both viewers show, computed once.
 *
 * <p>Here rather than in either panel because there are two of them — the live card and the
 * card for a version out of history — and the field-to-secret ladder they used to carry twice
 * is why this module exists at all (audit A1). A summary computed in one and not the other is
 * the same defect one layer up.</p>
 *
 * <p>The revision viewer passes `asOfVersion`, which changes the sentence rather than the
 * numbers: a snapshot carries whatever the switches were at the time, and showing that as a
 * current permission would be alarming and wrong.</p>
 */
export function mcpSummary(
  resolved: ResolvedMcpAccess,
  folderName: string | undefined,
  asOfVersion: boolean,
): { summary: string; source: McpSource; folderName?: string; mask: boolean[]; asOfVersion: boolean } {
  return {
    summary: describeAccess(resolved.access),
    source: resolved.source,
    folderName,
    mask: accessMask(resolved.access),
    asOfVersion,
  };
}

/**
 * The card's whole agent-access answer, from a node and a way to look ids up.
 *
 * <p>Here rather than at the call site because the call site got it wrong: it resolved with
 * `inTrash: false` unconditionally, having nothing at hand to answer the question with, so a
 * deleted entry's card advertised permissions the broker would have refused. Taking a lookup
 * instead of a boolean makes the question unavoidable and the answer derived.</p>
 */
export function mcpFor(
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  asOfVersion: boolean,
): ReturnType<typeof mcpSummary> {
  const resolved = resolveMcpInTree(node, byId);
  return mcpSummary(resolved, resolved.folder?.name, asOfVersion);
}

/**
 * What a KEPT version said about agent access — and only when it said it itself.
 *
 * <p>A revision carries the entry's own setting as it was, and nothing about the FOLDER as it
 * was. So a version that inherited its access cannot be reported honestly at all, and this
 * returns nothing rather than borrowing today's folder to fill the gap: a card that answered a
 * question about the past with a fact about the present would be worse than a card that stays
 * quiet.</p>
 */
export function mcpAsOfVersion(mcp: McpAccess | undefined): ReturnType<typeof mcpSummary> | undefined {
  if (mcp === undefined) {
    return undefined;
  }
  return mcpSummary({ access: normalizeMcpAccess(mcp), source: 'entity' }, undefined, true);
}

/** Where the answer came from, in the words the card says out loud. */
export function describeMcpSource(m: {
  source: McpSource;
  folderName?: string;
  asOfVersion?: boolean;
}): string {
  const when = m.asOfVersion === true ? ' — as of this version, not necessarily now' : '';
  return whereFrom(m.source, m.folderName) + when;
}

function whereFrom(source: McpSource, folderName: string | undefined): string {
  if (source === 'entity') {
    return 'set on this entry';
  }
  return source === 'folder'
    ? `inherited from the folder ${folderName ?? ''}`.trimEnd()
    : 'no agent access';
}
