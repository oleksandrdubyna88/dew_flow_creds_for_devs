import * as net from 'node:net';
import * as path from 'node:path';
import {
  AgentIdentity,
  FrameReader,
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  SignPurpose,
  SignRequest,
  decodeSignRequest,
  describeSignRequest,
  encodeFailure,
  encodeFrame,
  encodeIdentitiesAnswer,
  encodeSignResponse,
} from './sshAgentProtocol';
import { describeError } from './describeError';

/**
 * The agent itself: a local socket that answers the SSH agent protocol, serving keys held in
 * the vault and asking a person before it signs, unless a 10-minute window they opened covers the key.
 *
 * <p>`vscode`-free on purpose — the socket, the framing and the decision to refuse are testable
 * without an editor, and the only thing the editor contributes is the dialog, which arrives as
 * the `confirm` callback.</p>
 *
 * <p><b>Why a socket of our own rather than `ssh-add` into the system agent.</b> Confirmation in front of the
 * signature is the whole feature, and `ssh-add -c` delegates that to an askpass program the
 * Windows service agent cannot display — and it would also mean writing the key out for
 * `ssh-add` to read, which is precisely what this removes. Serving it ourselves keeps the key in
 * this process's memory and puts the dialog where the decision is made.</p>
 *
 * <p><b>Measured on Windows before it was designed (2026-08-25).</b> A Node named-pipe server
 * answers `C:\Windows\System32\OpenSSH\ssh-add.exe` correctly. The MSYS `ssh-add` that ships
 * with Git for Windows CANNOT connect to a named pipe (`Bad file descriptor`) — it wants a
 * cygwin socket, which is a different thing entirely. So on Windows this serves the built-in
 * OpenSSH client, and the extension says so rather than letting it look broken.</p>
 */

/** A key the agent can offer, with the signing operation kept behind a callback. */
export interface AgentKey {
  /** The vault entity this key came from — what the dialog names and the audit records. */
  entityId: string;
  name: string;
  identity: AgentIdentity;
  fingerprint: string;
  /** Produce the signature blob, or undefined when this key cannot sign that request. */
  sign(data: Buffer, flags: number): Buffer | undefined;
}

export interface SshAgentServerOptions {
  /** Unix socket path, or `\\.\pipe\…` on Windows. */
  socketPath: string;
  /** The keys to serve, re-read on every request so an unload takes effect immediately. */
  keys(): AgentKey[];
  /**
   * Ask the human. `false` refuses this one signature; it is asked EVERY time it returns false. `signal` aborts when
   * the connection the request came in on closes: a program that has gone away must not keep a prompt in the
   * queue, or be shown one (#197, E2.3).
   */
  confirm(key: AgentKey, purpose: SignPurpose, data: Buffer, signal: AbortSignal): Promise<boolean>;
  /** One line per request, for the audit channel. */
  log(message: string): void;
}

/** `keys/<pid>/agent.sock`, or a per-window named pipe on Windows. */
export function agentSocketPath(storageDir: string, platform: NodeJS.Platform, pid: number): string {
  if (platform === 'win32') {
    // A pipe name, not a path: the pid keeps two windows from claiming one agent, exactly as
    // `keys/<pid>/` does for materialized files.
    return `\\\\.\\pipe\\creds-for-devs-agent-${pid}`;
  }
  // Beside the materialized-key directory, so the existing purge covers a stale socket file.
  return path.join(storageDir, 'keys', String(pid), 'agent.sock');
}

/**
 * How many replies one connection may have outstanding (dispatched, not yet written) before it is closed. OpenSSH is
 * strictly request/response — it never sends a second request before the first is answered — so the honest depth is
 * 1; a few more cover a client that pipelines identities. Frames are dispatched at once and their replies are held
 * back to keep arrival order, so without a cap one open prompt plus a flood of 5-byte requests grew the held replies
 * without limit (#197, E2.3 security judgement F1).
 */
export const MAX_PIPELINED_REPLIES = 32;

/**
 * One client connection: the signal that says its program has gone, and the replies still owed to it. Frames are
 * dispatched at once (two prompts on one socket open together), but a client matches replies to requests by
 * position, so the replies are WRITTEN in arrival order — a chain whose length is `outstanding`.
 */
class Connection {
  /** Aborted when this connection closes: a request whose program has gone must not keep a prompt queued. */
  readonly client = new AbortController();

  private tail: Promise<void> = Promise.resolve();

  private outstanding = 0;

  constructor(readonly socket: net.Socket) {}

  /** Too many replies are held behind one that is not ready: the connection is flooding, not asking. */
  get full(): boolean {
    return this.outstanding >= MAX_PIPELINED_REPLIES;
  }

  /**
   * Write `answer` after every earlier reply of this connection. The chain ends in a catch that closes the
   * connection: a reply that cannot be produced or written (a log sink that throws inside `failed`) must neither
   * reject into nothing nor leave the client waiting for a reply that will never come.
   */
  reply(answer: Promise<Buffer>, write: (reply: Buffer) => void): void {
    this.outstanding += 1;
    // Observed at once: `answer` may reject while an earlier reply still holds the chain, and the chain below is
    // what decides what that means (it closes the connection).
    answer.catch(() => undefined);
    this.tail = this.tail
      .then(() => answer)
      .then(write)
      .catch(() => {
        this.socket.destroy();
      })
      .finally(() => {
        this.outstanding -= 1;
      });
  }
}

export class SshAgentServer {
  private server: net.Server | undefined;
  private readonly sockets = new Set<net.Socket>();

  constructor(private readonly options: SshAgentServerOptions) {}

  get socketPath(): string {
    return this.options.socketPath;
  }

  get listening(): boolean {
    return this.server?.listening === true;
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.serve(socket));
      server.on('error', reject);
      server.listen(this.options.socketPath, () => {
        this.server = server;
        server.off('error', reject);
        // A later error must not take the extension host down with it.
        server.on('error', (error) => this.options.log(`agent socket error: ${error.message}`));
        resolve();
      });
    });
  }

  private serve(socket: net.Socket): void {
    this.sockets.add(socket);
    const reader = new FrameReader();
    const connection = new Connection(socket);
    socket.on('error', () => socket.destroy());
    // A client that stopped reading paused us (`write`); once it has taken what we wrote, read its requests again.
    socket.on('drain', () => socket.resume());
    socket.on('close', () => {
      this.sockets.delete(socket);
      connection.client.abort();
    });
    socket.on('data', (chunk: Buffer) => this.received(connection, reader, chunk));
  }

  /** Bytes from a client: whole frames are dispatched at once, until the connection holds too many replies. */
  private received(connection: Connection, reader: FrameReader, chunk: Buffer): void {
    const frames = reader.push(chunk);
    if (reader.overflow) {
      this.hangUp(connection, 'refused an oversize agent frame and closed the connection');
      return;
    }
    for (const frame of frames) {
      if (connection.full) {
        this.hangUp(connection, 'refused a pipelined backlog and closed the connection');
        return;
      }
      this.dispatch(frame, connection);
    }
  }

  /** Refuse the connection: the reason in the log, the socket closed — which also abandons its open prompts. */
  private hangUp(connection: Connection, reason: string): void {
    this.options.log(reason);
    connection.socket.destroy();
  }

  private dispatch(frame: Buffer, connection: Connection): void {
    // Caught where it is DISPATCHED: a rejection behind a held reply must never be unhandled, and must not stop
    // the replies after it.
    const answer = this.handle(frame, connection.client.signal).catch((error: unknown) => this.failed(error));
    connection.reply(answer, (reply) => this.write(connection.socket, reply));
  }

  /** The reply to one frame; the caller writes it, in order. */
  private async handle(frame: Buffer, signal: AbortSignal): Promise<Buffer> {
    if (frame[0] === SSH_AGENTC_REQUEST_IDENTITIES) {
      return encodeIdentitiesAnswer(this.options.keys().map((k) => k.identity));
    }
    if (frame[0] !== SSH_AGENTC_SIGN_REQUEST) {
      // Everything else — add, remove, lock, extensions. A read-only agent by construction:
      // nothing a client sends can change what it serves.
      return encodeFailure();
    }
    return this.answerSign(frame, signal);
  }

  /** A request the agent could not answer (a gate that threw): FAILURE, and the reason in the log. */
  private failed(error: unknown): Buffer {
    return this.refused(`the agent could not answer a request: ${describeError(error)}`);
  }

  /** Resolve a SIGN_REQUEST to its reply — the signature blob, or FAILURE with a reason logged. */
  private async answerSign(frame: Buffer, signal: AbortSignal): Promise<Buffer> {
    const request = decodeSignRequest(frame);
    // A malformed request, or a client offering a key we no longer hold — the normal way a
    // client walks the identities it knows about. Refuse quietly, without a dialog.
    const key = request === undefined ? undefined : this.keyFor(request.publicBlob);
    if (key === undefined || request === undefined) {
      return encodeFailure();
    }
    return this.confirmAndSign(key, request, signal);
  }

  private async confirmAndSign(key: AgentKey, request: SignRequest, signal: AbortSignal): Promise<Buffer> {
    const allowed = await this.options.confirm(key, describeSignRequest(request.data, request.publicBlob), request.data, signal);
    if (!allowed) {
      return this.refused(`REFUSED a signature with "${key.name}"`);
    }
    // The prompt can stay open for minutes, and the key may have been removed or replaced meanwhile. An
    // "Allow" is an answer about the object that was asked about: object identity, not the public bytes,
    // so a key re-loaded with identical bytes is refused too (#197, I1/I2).
    if (!this.options.keys().includes(key)) {
      return this.refused(`REFUSED a signature with "${key.name}" — the key was removed or replaced while its prompt was open`);
    }
    return this.signed(key, request.data, request.flags);
  }

  private refused(line: string): Buffer {
    this.options.log(line);
    return encodeFailure();
  }

  private keyFor(publicBlob: Buffer): AgentKey | undefined {
    return this.options.keys().find((k) => k.identity.publicBlob.equals(publicBlob));
  }

  private signed(key: AgentKey, data: Buffer, flags: number): Buffer {
    const signature = key.sign(data, flags);
    if (signature === undefined) {
      this.options.log(`could not sign with "${key.name}" (unsupported request)`);
      return encodeFailure();
    }
    this.options.log(`SIGNED with "${key.name}" (${key.fingerprint})`);
    return encodeSignResponse(signature);
  }

  /** Write a reply; when the socket's buffer is full, stop reading requests until it drains (the 'drain' handler). */
  private write(socket: net.Socket, payload: Buffer): void {
    if (!socket.destroyed && !socket.write(encodeFrame(payload))) {
      socket.pause();
    }
  }

  /** Close the socket and drop every connection — the key material goes with the process. */
  dispose(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    this.server?.close();
    this.server = undefined;
  }
}
