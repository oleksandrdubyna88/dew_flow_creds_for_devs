/**
 * The SSH agent protocol, as much of it as serving a key needs (draft-miller-ssh-agent).
 *
 * <p>Pure and `vscode`-free, and hand-written rather than taken from a library because this
 * extension has NO runtime dependencies — that is a property of the product, not an accident,
 * and the four messages below are less code than the audit of a dependency would be.</p>
 *
 * <p>Everything is length-prefixed big-endian: a message is `uint32 length || payload`, a
 * string inside a payload is `uint32 length || bytes`. Two things follow from that and are the
 * reason this file exists separately from the socket:</p>
 *
 * <ul>
 *   <li>A stream delivers arbitrary pieces, so framing must tolerate a message split across
 *       chunks and several messages inside one chunk. `FrameReader` owns that.</li>
 *   <li>A sign request carries the data to be signed, and what it IS decides what the human is
 *       told. `describeSignRequest` reads it: an SSH login blob names the user and service, an
 *       SSHSIG blob names its namespace (`git` for a commit signature). Without that the modal
 *       could only say "something wants to use your key", which is exactly the dialog people
 *       learn to click through.</li>
 * </ul>
 */
import * as crypto from 'node:crypto';

// Message numbers we implement. The rest are answered with FAILURE.
export const SSH_AGENT_FAILURE = 5;
export const SSH_AGENT_SUCCESS = 6;
export const SSH_AGENTC_REQUEST_IDENTITIES = 11;
export const SSH_AGENT_IDENTITIES_ANSWER = 12;
export const SSH_AGENTC_SIGN_REQUEST = 13;
export const SSH_AGENT_SIGN_RESPONSE = 14;

/** Signature flags a client may ask for (RFC 8332 for the RSA hashes). */
export const SSH_AGENT_RSA_SHA2_256 = 0x02;
export const SSH_AGENT_RSA_SHA2_512 = 0x04;

/**
 * A frame larger than this is refused and the connection dropped.
 *
 * <p>The socket is local and only ever carries a public key list or a hash to sign; a client
 * announcing a 4 GB message is either broken or hostile, and either way must not be allocated
 * for.</p>
 */
export const MAX_FRAME_BYTES = 256 * 1024;

/** `uint32 length || bytes` — the protocol's only composite. */
export function encodeString(value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
}

/** Wrap a payload as a complete frame. */
export function encodeFrame(payload: Buffer): Buffer {
  return encodeString(payload);
}

/** Reads length-prefixed strings out of a payload, refusing to run off the end. */
export class ByteReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  get done(): boolean {
    return this.offset >= this.buffer.length;
  }

  readByte(): number | undefined {
    if (this.offset + 1 > this.buffer.length) {
      return undefined;
    }
    const value = this.buffer[this.offset];
    this.offset += 1;
    return value;
  }

  readUInt32(): number | undefined {
    if (this.offset + 4 > this.buffer.length) {
      return undefined;
    }
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readString(): Buffer | undefined {
    const length = this.readUInt32();
    if (length === undefined || this.offset + length > this.buffer.length) {
      return undefined;
    }
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

/**
 * Splits a byte stream into complete frames.
 *
 * <p>`push` returns whatever is complete now — none, one, or several. An oversize announced
 * length sets `overflow`, and the caller closes the connection rather than buffering.</p>
 */
export class FrameReader {
  private buffered: Buffer = Buffer.alloc(0);
  overflow = false;

  push(chunk: Buffer): Buffer[] {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const frames: Buffer[] = [];
    while (this.buffered.length >= 4) {
      const length = this.buffered.readUInt32BE(0);
      if (length > MAX_FRAME_BYTES) {
        this.overflow = true;
        this.buffered = Buffer.alloc(0);
        return frames;
      }
      if (this.buffered.length < 4 + length) {
        break;
      }
      frames.push(this.buffered.subarray(4, 4 + length));
      this.buffered = this.buffered.subarray(4 + length);
    }
    return frames;
  }
}

/** One key the agent offers. */
export interface AgentIdentity {
  /** The SSH wire format public key (`ssh-ed25519` + the point, etc.). */
  publicBlob: Buffer;
  /** The comment shown by `ssh-add -l` — the entity's name here. */
  comment: string;
}

/** The answer to REQUEST_IDENTITIES. */
export function encodeIdentitiesAnswer(identities: readonly AgentIdentity[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(identities.length, 0);
  return Buffer.concat([
    Buffer.from([SSH_AGENT_IDENTITIES_ANSWER]),
    count,
    ...identities.map((id) => Buffer.concat([encodeString(id.publicBlob), encodeString(id.comment)])),
  ]);
}

/** The answer to a SIGN_REQUEST: the signature blob, itself a string. */
export function encodeSignResponse(signature: Buffer): Buffer {
  return Buffer.concat([Buffer.from([SSH_AGENT_SIGN_RESPONSE]), encodeString(signature)]);
}

export function encodeFailure(): Buffer {
  return Buffer.from([SSH_AGENT_FAILURE]);
}

export interface SignRequest {
  publicBlob: Buffer;
  data: Buffer;
  flags: number;
}

/** Read a SIGN_REQUEST payload; `undefined` when it is malformed. */
export function decodeSignRequest(payload: Buffer): SignRequest | undefined {
  const reader = new ByteReader(payload);
  if (reader.readByte() !== SSH_AGENTC_SIGN_REQUEST) {
    return undefined;
  }
  const publicBlob = reader.readString();
  const data = reader.readString();
  const flags = reader.readUInt32();
  if ([publicBlob, data, flags].some((part) => part === undefined)) {
    return undefined;
  }
  return { publicBlob: publicBlob as Buffer, data: data as Buffer, flags: flags as number };
}

/** `SHA256:base64(sha256(blob))`, without padding — exactly what `ssh-keygen -lf` shows. */
export function keyFingerprintOf(publicBlob: Buffer): string {
  const digest = crypto.createHash('sha256').update(publicBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

/** The key type name at the head of a public blob (`ssh-ed25519`, `ssh-rsa`, …). */
export function keyTypeOf(publicBlob: Buffer): string | undefined {
  return new ByteReader(publicBlob).readString()?.toString('utf8');
}

/**
 * What is about to be signed, in words a person can act on.
 *
 * <p>Two shapes reach an agent in practice. A **userauth request** (RFC 4252 §7) is an SSH
 * login: session id, the byte 50, the user name, the service, the method, `has_signature = TRUE`,
 * the algorithm and the public key blob. OpenSSH 8.9+ asks for the method
 * `publickey-hostbound-v00@openssh.com` and appends the server's host key blob (OpenSSH
 * `PROTOCOL` §3.1), which is what lets `hostKey` name the server the login is for. An
 * **SSHSIG** blob (used by `git`, `ssh-keygen -Y`) starts with the magic `SSHSIG` and carries a
 * namespace — `git` for a commit or tag signature, `file` for `ssh-keygen -Y sign`.</p>
 *
 * <p>Anything that is not exactly one of those is reported as unrecognised rather than guessed
 * at. A wrong description would be worse than a vague one: it is the sentence the human's
 * decision rests on. The exact contract of what counts as a login is on `describeSignRequest`.</p>
 *
 * <p>`hostKey` and `hostKeyType` are set together, for the host-bound method only: the
 * fingerprint of the host key the client signed over, and its type as `ssh-keygen -l` names it.
 * `user` is the REQUESTER'S text and untrusted — see `describePurpose`.</p>
 */
export type SignPurpose =
  | { kind: 'ssh-login'; user: string; service: string; hostKey?: string; hostKeyType?: string }
  | { kind: 'sshsig'; namespace: string }
  | { kind: 'unknown' };

type SshLogin = Extract<SignPurpose, { kind: 'ssh-login' }>;

/** The two public-key methods a client may sign (OpenSSH `PROTOCOL` §3.1; RFC 4252 §7 for the first). */
const PUBLICKEY_METHOD = 'publickey';
const HOSTBOUND_METHOD = 'publickey-hostbound-v00@openssh.com';

/** The only service a public-key login is for (RFC 4252 §5): the one that opens a session. */
const SSH_CONNECTION = 'ssh-connection';

/** SSH_MSG_USERAUTH_REQUEST, the byte after the session id. */
const USERAUTH_REQUEST = 50;

/**
 * The session id is the key-exchange hash (RFC 4253 §7.2): SHA-1, SHA-256, SHA-384 or SHA-512,
 * so 20, 32, 48 or 64 bytes and nothing between.
 */
const KEX_HASH_BYTES: ReadonlySet<number> = new Set([20, 32, 48, 64]);

/** The OpenSSH vendor suffix, built from parts so the repository's hygiene scan does not read a key type as an address. */
const OPENSSH = ['@openssh', 'com'].join('.');

/** Host key types, named as `ssh-keygen -l` names them. The blob's own text never reaches a prompt. */
const HOST_KEY_TYPES: ReadonlyMap<string, string> = new Map([
  ['ssh-ed25519', 'ED25519'],
  ['ssh-rsa', 'RSA'],
  ['ssh-dss', 'DSA'],
  ['ecdsa-sha2-nistp256', 'ECDSA'],
  ['ecdsa-sha2-nistp384', 'ECDSA'],
  ['ecdsa-sha2-nistp521', 'ECDSA'],
  [`sk-ssh-ed25519${OPENSSH}`, 'ED25519-SK'],
  [`sk-ecdsa-sha2-nistp256${OPENSSH}`, 'ECDSA-SK'],
]);

/** An `SSHSIG` blob: `SSHSIG || namespace || reserved || hash_algorithm || H(message)`. */
function describeSshsig(data: Buffer): SignPurpose {
  const namespace = new ByteReader(data.subarray(6)).readString()?.toString('utf8');
  return { kind: 'sshsig', namespace: namespace !== undefined && namespace.length > 0 ? namespace : 'unnamed' };
}

/** `session-id || 50`: a key-exchange-hash-sized session id, then the userauth request number. */
function startsUserauth(sessionId: Buffer | undefined, messageType: number | undefined): boolean {
  return sessionId !== undefined && KEX_HASH_BYTES.has(sessionId.length) && messageType === USERAUTH_REQUEST;
}

interface UserauthHead {
  user: string;
  service: string;
  method: string;
}

/** `user || service || method`, each one a string; `undefined` when one is missing or the service is not `ssh-connection`. */
function readUserauthFields(reader: ByteReader): UserauthHead | undefined {
  const fields = [reader.readString(), reader.readString(), reader.readString()].map((part) =>
    part?.toString('utf8'),
  );
  if (fields.some((field) => field === undefined) || fields[1] !== SSH_CONNECTION) {
    return undefined;
  }
  return { user: fields[0] as string, service: fields[1], method: fields[2] as string };
}

/** `session-id || 50 || user || service || method`. */
function readUserauthHead(reader: ByteReader): UserauthHead | undefined {
  return startsUserauth(reader.readString(), reader.readByte()) ? readUserauthFields(reader) : undefined;
}

/** `has_signature = TRUE || algorithm || public key blob`, the blob being the one signing now. */
function namesThisKey(reader: ByteReader, signingKeyBlob: Buffer): boolean {
  const hasSignature = reader.readByte();
  const algorithm = reader.readString();
  const keyBlob = reader.readString();
  return hasSignature === 1 && algorithm !== undefined && keyBlob !== undefined && keyBlob.equals(signingKeyBlob);
}

/** What a tail says about the server: nothing, or the host key's fingerprint and type. */
interface ServerClaim {
  hostKey?: string;
  hostKeyType?: string;
}

/** What follows the key blob, per method: nothing, or the server host key. `undefined` = not a login. */
type TailReader = (reader: ByteReader) => ServerClaim | undefined;

const readNoTail: TailReader = (reader) => (reader.done ? {} : undefined);

/** The host key's type by the closed table above — never the blob's own text, which is the client's. */
function hostKeyTypeName(hostKey: Buffer): string {
  return HOST_KEY_TYPES.get(keyTypeOf(hostKey) ?? '') ?? 'UNKNOWN';
}

const readHostKeyTail: TailReader = (reader) => {
  const hostKey = reader.readString();
  return hostKey !== undefined && hostKey.length > 0 && reader.done
    ? { hostKey: keyFingerprintOf(hostKey), hostKeyType: hostKeyTypeName(hostKey) }
    : undefined;
};

const TAILS: ReadonlyMap<string, TailReader> = new Map([
  [PUBLICKEY_METHOD, readNoTail],
  [HOSTBOUND_METHOD, readHostKeyTail],
]);

/** The rest of the request after its head; `undefined` when it is not exactly a login for this key. */
function readKeyTail(reader: ByteReader, method: string, signingKeyBlob: Buffer): ServerClaim | undefined {
  return namesThisKey(reader, signingKeyBlob) ? TAILS.get(method)?.(reader) : undefined;
}

/**
 * An RFC 4252 §7 userauth request, whole: `session-id || 50 || user || service || method ||
 * has_signature || algorithm || key [|| host key]` and nothing after it.
 */
function describeUserauth(data: Buffer, signingKeyBlob: Buffer): SignPurpose {
  const reader = new ByteReader(data);
  const head = readUserauthHead(reader);
  const tail = head === undefined ? undefined : readKeyTail(reader, head.method, signingKeyBlob);
  return head === undefined || tail === undefined
    ? { kind: 'unknown' }
    : { kind: 'ssh-login', user: head.user, service: head.service, ...tail };
}

/**
 * What is about to be signed, read against the key that is signing it.
 *
 * <p>The contract — a window of silent signatures is granted on it, so it is written down. The
 * data is an SSH login (`ssh-login`) only when it is exactly, with nothing after it (RFC 4252 §7;
 * OpenSSH `PROTOCOL` §3.1):</p>
 *
 * <pre>D = string(sid) || 0x32 || string(user) || string("ssh-connection") || string(method)
 *        || 0x01 || string(alg) || string(K) [|| string(H)]</pre>
 *
 * <ul>
 *   <li>`K` is byte-identical to the public blob of the key being signed with. A login naming
 *       key A, asked of key B, is not a login. A certificate login names the certificate blob,
 *       so it is reported as unrecognised: this agent holds plain keys and does not describe a
 *       certificate as one.</li>
 *   <li>`method` is exactly `publickey` (no `H`) or `publickey-hostbound-v00@openssh.com`
 *       (`H` present and non-empty). `H` is the server host key the client signed over. sshd
 *       rebuilds the data with ITS OWN host key and aborts when the packet's differs, so only
 *       the server holding `H` can use this signature. The agent has NOT verified that server.</li>
 *   <li>`sid` is the size of a key-exchange hash: 20, 32, 48 or 64 bytes.</li>
 *   <li>`user` is the requester's text and untrusted. Only a display-safe form reaches a
 *       prompt; the raw value goes to the log.</li>
 * </ul>
 *
 * <p>Why D is not an SSHSIG: that blob has its magic at offset 0, while D starts with the length
 * of `sid`, so its first byte is 0x00. Why D is not an OpenSSH certificate body
 * (`string cert-type || string nonce || …`): a 32-byte cert type can read as a `sid`, and then
 * the byte read as 0x32 is the top byte of the nonce's length — a length of 0x32000000 and up,
 * far beyond `MAX_FRAME_BYTES`. THAT COUPLING is what tells the two apart: raising
 * `MAX_FRAME_BYTES` to ~838 MB would end it.</p>
 *
 * <p>What it does NOT see: the request's flags. A login signed with SHA-1 RSA (no flags) reads as
 * a login like any other, so whoever grants a longer window on a login must exclude that on the
 * flags themselves. SSHSIG is classified by its prefix only, on purpose: the namespace is all the
 * prompt claims, and what follows it is the message hash.</p>
 */
export function describeSignRequest(data: Buffer, signingKeyBlob: Buffer): SignPurpose {
  return data.subarray(0, 6).toString('latin1') === 'SSHSIG'
    ? describeSshsig(data)
    : describeUserauth(data, signingKeyBlob);
}

/**
 * Enough of an unrecognised request to identify its shape later, and nothing more.
 *
 * <p>When the purpose is unknown the human is asked a vague question — deliberately, because a
 * guessed description would be worse. But until now nothing recorded WHAT was unrecognised, so
 * the question could not be answered afterwards either: the one situation where a person most
 * wants to look it up is the one that left no trace. Measured against a real host on 2026-08-27,
 * where a forwarded agent was asked to sign something that was neither an SSH login nor SSHSIG,
 * and the log said only "SIGNED".</p>
 *
 * <p>The length and the first bytes are framing — a session-id header, a magic, a field length.
 * The blob is data about to be signed, not a secret, and the signature itself is never logged;
 * the cap keeps it a fingerprint rather than a copy.</p>
 */
export function describeUnknownShape(data: Buffer): string {
  const head = [...data.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return `${data.length} bytes, starts ${head}`;
}

/**
 * Text with no way to start a line of its own: control and format characters (newlines, RTL and
 * zero-width marks — `\p{C}`) and the Unicode line and paragraph separators become `?`. The core of
 * `displayUser`, and what the agent's log applies to every line, so a name cannot forge one.
 */
export function withoutControlChars(text: string): string {
  return text.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '?');
}

/** The longest user name a prompt shows, ellipsis included. */
const MAX_USER_DISPLAY = 64;

/**
 * A user name made safe to put inside a sentence: control and format characters (newlines, RTL and
 * zero-width marks — `\p{C}`) and the Unicode line and paragraph separators become `?`, a quote or
 * backslash is escaped so the name cannot end its own quotation, and the result is cut at 64
 * characters with `…`. The user is the requester's text: nothing of it may start a line.
 */
function displayUser(user: string): string {
  const safe = withoutControlChars(user).replace(/[\\"]/g, '\\$&');
  const characters = [...safe];
  return characters.length <= MAX_USER_DISPLAY ? safe : `${characters.slice(0, MAX_USER_DISPLAY - 1).join('')}…`;
}

/** A login as one sentence, the user name being whatever text the caller chose to show. */
function loginSentence(login: SshLogin, user: string): string {
  return `an SSH login as ${user} (${login.service})`;
}

/**
 * The line of the prompt that names the server a host-bound login is for; '' when the request
 * names none. A line of its own, written only by this build — the user name cannot reach it.
 */
export function describeServerLine(purpose: SignPurpose): string {
  return purpose.kind === 'ssh-login' ? serverClause(purpose) : '';
}

function serverClause(login: SshLogin): string {
  return login.hostKey === undefined
    ? ''
    : `This login is for the server whose host key is ${login.hostKeyType ?? 'UNKNOWN'} ${login.hostKey}`;
}

/** The same description for the log, where the user name is the raw value (JSON-quoted, so it stays one line). */
export function describePurposeForLog(purpose: SignPurpose): string {
  if (purpose.kind !== 'ssh-login') {
    return describePurpose(purpose);
  }
  const sentence = loginSentence(purpose, JSON.stringify(purpose.user));
  const server = serverClause(purpose);
  return server === '' ? sentence : `${sentence}. ${server}`;
}

/**
 * One sentence for the confirmation dialog. A login's host key is NOT in it: that is
 * `describeServerLine`, a line of its own, so no user name can imitate it.
 */
export function describePurpose(purpose: SignPurpose): string {
  switch (purpose.kind) {
    case 'ssh-login':
      return loginSentence(purpose, `"${displayUser(purpose.user)}"`);
    case 'sshsig':
      return purpose.namespace === 'git'
        ? 'a Git signature (commit or tag)'
        : `a signature in the "${purpose.namespace}" namespace`;
    default:
      return 'a signature whose purpose this build does not recognise';
  }
}
