/**
 * What a scanned QR code turns out to be — one authenticator seed, or a whole export of them.
 *
 * <p>Two payloads matter, and they are not the same shape at all:</p>
 *
 * <ul>
 *   <li><b>`otpauth://totp/…`</b> — what a service draws at enrolment. One account, already in
 *       the form this extension stores.</li>
 *   <li><b>`otpauth-migration://offline?data=…`</b> — what Google Authenticator draws under
 *       <i>Transfer accounts → Export accounts</i>, and the only way that application will ever
 *       let a seed out. It is a base64 <b>protocol buffer</b> holding every selected account at
 *       once, so one picture can be six logins.</li>
 * </ul>
 *
 * <p>(Microsoft Authenticator exports nothing, in any form. Nothing here can change that: for
 * those entries the only route is to re-enrol the second factor on the service itself.)</p>
 *
 * <p><b>A counter-based entry is refused rather than converted.</b> HOTP codes advance a counter
 * that lives on the server, so a second copy of one does not "also work" — it desynchronises the
 * original. Refusing loudly is the only honest option, and it must say which account it refused.</p>
 *
 * <p>Pure and `vscode`-free. The protobuf reader is thirty lines because the schema is two
 * messages and this only ever reads them — pulling in a code generator to parse six fields would
 * cost more than it saves, and the extension has no runtime dependencies to put it in.</p>
 */

import { describeTotp, encodeBase32, parseTotpSecret } from './totp';

/** One account a picture turned out to contain. */
export interface OtpAccount {
  /** How to name it to somebody choosing between several: `GitHub · me@example.com`. */
  readonly title: string;
  /** The canonical `otpauth://` URI, exactly as it would be stored. */
  readonly uri: string;
  /** Its parameters in words, so they can be compared against the phone showing the same seed. */
  readonly description: string;
}

export interface OtpQrReading {
  readonly accounts: readonly OtpAccount[];
  /** Everything the picture held that could NOT be taken, each with its reason. */
  readonly skipped: readonly string[];
}

const EMPTY: OtpQrReading = { accounts: [], skipped: [] };

/**
 * The text a QR code carried → the accounts in it.
 *
 * <p>A bare base32 string is deliberately NOT accepted here, although the seed field accepts one
 * typed by hand. Half the payloads on a café wall are plain words, and `HELLO WORLD` is a
 * perfectly valid base32 string: accepting it would turn "you pasted the wrong picture" into a
 * stored credential that produces codes nothing will ever accept.</p>
 */
export function parseOtpQrText(text: string): OtpQrReading {
  const trimmed = text.trim();
  if (/^otpauth-migration:/i.test(trimmed)) {
    return readMigration(trimmed);
  }
  if (/^otpauth:/i.test(trimmed)) {
    const parsed = parseTotpSecret(trimmed);
    return parsed === undefined
      ? { accounts: [], skipped: [`This is a one-time-code QR, but not one this reader understands: ${preview(trimmed)}`] }
      : { accounts: [accountOf(parsed.uri, parsed.config.issuer, parsed.config.label)], skipped: [] };
  }
  return {
    accounts: [],
    skipped: [`That QR code is not an authenticator code. It carries: ${preview(trimmed)}`],
  };
}

function preview(text: string): string {
  return text.length <= 60 ? text : `${text.slice(0, 57)}…`;
}

function accountOf(uri: string, issuer: string | undefined, label: string | undefined): OtpAccount {
  const parsed = parseTotpSecret(uri);
  const title = [issuer, label].filter((part) => part !== undefined && part.length > 0).join(' · ');
  return {
    title: title.length > 0 ? title : 'One-time code',
    uri,
    description: parsed === undefined ? '' : describeTotp(parsed.config),
  };
}

// ---- the Google Authenticator export --------------------------------------------------------

/**
 * The protobuf schema, in full, because it is small and because reading the field numbers out of
 * the code below would otherwise be archaeology:
 *
 * ```
 * message MigrationPayload {
 *   repeated OtpParameters otp_parameters = 1;   // and 2..5 are batch bookkeeping
 * }
 * message OtpParameters {
 *   bytes  secret    = 1;   string name = 2;   string issuer = 3;
 *   enum   algorithm = 4;   // 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5
 *   enum   digits    = 5;   // 1 six, 2 eight
 *   enum   type      = 6;   // 1 HOTP, 2 TOTP
 *   int64  counter   = 7;
 * }
 * ```
 */
interface OtpParameters {
  secret?: Buffer;
  name?: string;
  issuer?: string;
  algorithm?: number;
  digits?: number;
  type?: number;
}

// eslint-disable-next-line complexity -- reading one export end to end: the four ways it can be unusable, then its accounts
function readMigration(text: string): OtpQrReading {
  const encoded = /[?&]data=([^&]+)/.exec(text)?.[1];
  if (encoded === undefined) {
    return { ...EMPTY, skipped: ['This export QR code carries no data at all.'] };
  }
  const payload = decodeBase64Url(decodeURIComponent(encoded));
  if (payload === undefined) {
    return { ...EMPTY, skipped: ['This export QR code is damaged: its payload is not readable.'] };
  }
  const entries = readEntries(payload);
  if (entries === undefined) {
    return { ...EMPTY, skipped: ['This export QR code is damaged: it ends mid-account.'] };
  }
  const accounts: OtpAccount[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    const account = toAccount(entry);
    if (typeof account === 'string') {
      skipped.push(account);
    } else {
      accounts.push(account);
    }
  }
  return { accounts, skipped };
}

function decodeBase64Url(text: string): Buffer | undefined {
  const normalised = text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    return undefined;
  }
  const bytes = Buffer.from(padded, 'base64');
  return bytes.length === 0 ? undefined : bytes;
}

/** Every `otp_parameters` message in the payload, or `undefined` if the bytes ran out. */
// eslint-disable-next-line complexity -- the top-level protobuf walk, whose branches are the wire format itself
function readEntries(payload: Buffer): OtpParameters[] | undefined {
  const entries: OtpParameters[] = [];
  const reader = new WireReader(payload);
  while (reader.hasMore) {
    const field = reader.field();
    if (field === undefined) {
      return undefined;
    }
    if (field.number === 1 && field.wire === 2) {
      const inner = reader.take(field);
      if (inner === undefined) {
        return undefined;
      }
      const entry = readParameters(inner);
      if (entry === undefined) {
        return undefined;
      }
      entries.push(entry);
    } else if (reader.skip(field) === false) {
      // `=== false` and not `!`: skipping a field answers the varint it stepped over, and the
      // batch bookkeeping this payload ends with legitimately holds zero.
      return undefined;
    }
  }
  return entries;
}

// eslint-disable-next-line complexity -- the same walk one level down, over a message of six fields
function readParameters(bytes: Buffer): OtpParameters | undefined {
  const reader = new WireReader(bytes);
  const entry: OtpParameters = {};
  while (reader.hasMore) {
    const field = reader.field();
    if (field === undefined) {
      return undefined;
    }
    if (field.wire === 2) {
      const value = reader.take(field);
      if (value === undefined) {
        return undefined;
      }
      assignBytes(entry, field.number, value);
    } else {
      const value = reader.skip(field);
      if (value === false) {
        return undefined;
      }
      assignNumber(entry, field.number, value);
    }
  }
  return entry;
}

function assignBytes(entry: OtpParameters, field: number, value: Buffer): void {
  if (field === 1) {
    entry.secret = value;
  } else if (field === 2) {
    entry.name = value.toString('utf8');
  } else if (field === 3) {
    entry.issuer = value.toString('utf8');
  }
}

function assignNumber(entry: OtpParameters, field: number, value: number): void {
  if (field === 4) {
    entry.algorithm = value;
  } else if (field === 5) {
    entry.digits = value;
  } else if (field === 6) {
    entry.type = value;
  }
}

const ALGORITHMS: Record<number, string> = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };

/** Every refusal names the account it refused, and they all open the same way. */
const QUOTE = '"';

/**
 * Why this entry cannot be taken, or nothing.
 *
 * <p>Every branch here ends in a sentence naming the account, because "3 of 4 imported" with no
 * fourth name is a message that sends somebody back to their phone to work out which one.</p>
 */
// eslint-disable-next-line complexity -- a flat list of the independent reasons one exported entry cannot be taken
function refusalFor(entry: OtpParameters, label: string): string {
  if (entry.secret === undefined || entry.secret.length === 0) {
    return QUOTE + label + '" was skipped: the export carries no seed for it.';
  }
  if (entry.type === 1) {
    return (
      QUOTE + label +
      '" was skipped: it is a counter-based (HOTP) code, and a second copy of one stops the first from working.'
    );
  }
  return ALGORITHMS[entry.algorithm ?? 0] === undefined
    ? QUOTE + label + '" was skipped: it uses an algorithm this extension does not implement (MD5).'
    : '';
}

/** The otpauth URI this entry describes, before canonicalisation. */
// eslint-disable-next-line complexity -- assembling one URI whose optional parts are what make it optional
function uriFor(entry: OtpParameters, label: string, secret: Buffer): string {
  const issuer = entry.issuer ?? '';
  const path = issuer.length > 0 ? issuer + ':' + label : label;
  const parameters = [
    'secret=' + encodeBase32(secret),
    ...(issuer.length > 0 ? ['issuer=' + encodeURIComponent(issuer)] : []),
    'algorithm=' + ALGORITHMS[entry.algorithm ?? 0],
    'digits=' + (entry.digits === 2 ? 8 : 6),
    'period=30',
  ];
  return 'otpauth://totp/' + encodeURIComponent(path) + '?' + parameters.join('&');
}

/** One exported entry → an account, or the sentence explaining why it was left behind. */
// eslint-disable-next-line complexity -- the refusal, the conversion and the canonicalisation, each of which can end the entry
function toAccount(entry: OtpParameters): OtpAccount | string {
  const name = entry.name ?? '';
  const label = name.length > 0 ? name : 'account';
  const refusal = refusalFor(entry, label);
  if (refusal.length > 0 || entry.secret === undefined) {
    return refusal;
  }
  const parsed = parseTotpSecret(uriFor(entry, label, entry.secret));
  const issuer = entry.issuer ?? '';
  return parsed === undefined
    ? QUOTE + label + '" was skipped: its seed is not readable.'
    : accountOf(parsed.uri, issuer.length > 0 ? issuer : undefined, label);
}

// ---- the protobuf wire format ---------------------------------------------------------------

/** Wire types 5 and 1 are the fixed-width ones; 3 and 4 are groups, which this format never uses. */
const FIXED_WIDTHS: Record<number, number> = { 5: 4, 1: 8 };

interface WireField {
  readonly number: number;
  readonly wire: number;
}

/**
 * As much of the wire format as this file needs: varints and length-delimited fields.
 *
 * <p>Unknown fields are skipped rather than refused — that is the whole point of the format, and
 * it is why a newer Google Authenticator adding a field will not break this reader.</p>
 */
class WireReader {
  private position = 0;

  constructor(private readonly bytes: Buffer) {}

  get hasMore(): boolean {
    return this.position < this.bytes.length;
  }

  field(): WireField | undefined {
    const key = this.varint();
    return key === undefined ? undefined : { number: key >>> 3, wire: key & 7 };
  }

  /** The bytes of a length-delimited field. */
  take(field: WireField): Buffer | undefined {
    if (field.wire !== 2) {
      return undefined;
    }
    const length = this.varint();
    if (length === undefined || this.position + length > this.bytes.length) {
      return undefined;
    }
    const value = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return value;
  }

  /** Step over a field this reader does not use; answers its value when it is a varint. */
  // eslint-disable-next-line complexity -- a dispatch over the wire types, which is what the format's skip rule is
  skip(field: WireField): number | false {
    if (field.wire === 0) {
      return this.varint() ?? false;
    }
    if (field.wire === 2) {
      return this.take(field) === undefined ? false : 0;
    }
    return this.stepOver(FIXED_WIDTHS[field.wire] ?? 0);
  }

  private stepOver(width: number): number | false {
    if (width === 0 || this.position + width > this.bytes.length) {
      return false;
    }
    this.position += width;
    return 0;
  }

  private varint(): number | undefined {
    let value = 0;
    let shift = 0;
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position++];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return value;
      }
      shift += 7;
      if (shift > 56) {
        return undefined;
      }
    }
    return undefined;
  }
}
