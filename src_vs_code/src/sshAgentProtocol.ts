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

/** The key type name at the head of a public blob (`ssh-ed25519`, `ssh-rsa`, …). */
export function keyTypeOf(publicBlob: Buffer): string | undefined {
  return new ByteReader(publicBlob).readString()?.toString('utf8');
}

/**
 * What is about to be signed, in words a person can act on.
 *
 * <p>Two shapes reach an agent in practice. A **userauth request** (RFC 4252 §7) is an SSH
 * login: session id, the byte 50, the user name, the service, the literal `publickey`. An
 * **SSHSIG** blob (used by `git`, `ssh-keygen -Y`) starts with the magic `SSHSIG` and carries a
 * namespace — `git` for a commit or tag signature, `file` for `ssh-keygen -Y sign`.</p>
 *
 * <p>Anything else is reported as unrecognised rather than guessed at. A wrong description
 * would be worse than a vague one: it is the sentence the human's decision rests on.</p>
 */
export type SignPurpose =
  | { kind: 'ssh-login'; user: string; service: string }
  | { kind: 'sshsig'; namespace: string }
  | { kind: 'unknown' };

/** An `SSHSIG` blob: `SSHSIG || namespace || reserved || hash_algorithm || H(message)`. */
function describeSshsig(data: Buffer): SignPurpose {
  const namespace = new ByteReader(data.subarray(6)).readString()?.toString('utf8');
  return { kind: 'sshsig', namespace: namespace !== undefined && namespace.length > 0 ? namespace : 'unnamed' };
}

/** 50 = SSH_MSG_USERAUTH_REQUEST. The session id is 20–64 bytes of hash in practice. */
function startsUserauth(sessionId: Buffer | undefined, messageType: number | undefined): boolean {
  return sessionId !== undefined && sessionId.length >= 16 && messageType === 50;
}

function isPublicKeyLogin(user: string | undefined, service: string | undefined, method: string | undefined): boolean {
  return user !== undefined && service !== undefined && method === 'publickey';
}

/** An RFC 4252 §7 userauth request: `session-id || 50 || user || service || "publickey" || …`. */
function describeUserauth(data: Buffer): SignPurpose {
  const reader = new ByteReader(data);
  if (!startsUserauth(reader.readString(), reader.readByte())) {
    return { kind: 'unknown' };
  }
  const fields = [reader.readString(), reader.readString(), reader.readString()].map((part) =>
    part?.toString('utf8'),
  );
  return isPublicKeyLogin(fields[0], fields[1], fields[2])
    ? { kind: 'ssh-login', user: fields[0] as string, service: fields[1] as string }
    : { kind: 'unknown' };
}

export function describeSignRequest(data: Buffer): SignPurpose {
  return data.subarray(0, 6).toString('latin1') === 'SSHSIG'
    ? describeSshsig(data)
    : describeUserauth(data);
}

/** One sentence for the confirmation dialog. */
export function describePurpose(purpose: SignPurpose): string {
  switch (purpose.kind) {
    case 'ssh-login':
      return `an SSH login as "${purpose.user}" (${purpose.service})`;
    case 'sshsig':
      return purpose.namespace === 'git'
        ? 'a Git signature (commit or tag)'
        : `a signature in the "${purpose.namespace}" namespace`;
    default:
      return 'a signature whose purpose this build does not recognise';
  }
}
