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

/**
 * The agent itself: a local socket that answers the SSH agent protocol, serving keys held in
 * the vault and asking a human before every signature.
 *
 * <p>`vscode`-free on purpose — the socket, the framing and the decision to refuse are testable
 * without an editor, and the only thing the editor contributes is the dialog, which arrives as
 * the `confirm` callback.</p>
 *
 * <p><b>Why a socket of our own rather than `ssh-add` into the system agent.</b> Per-use
 * confirmation is the whole feature, and `ssh-add -c` delegates that to an askpass program the
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
  /** Ask the human. `false` refuses this one signature; it is asked EVERY time it returns false. */
  confirm(key: AgentKey, purpose: SignPurpose, data: Buffer): Promise<boolean>;
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
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('data', (chunk: Buffer) => {
      const frames = reader.push(chunk);
      if (reader.overflow) {
        this.options.log('refused an oversize agent frame and closed the connection');
        socket.destroy();
        return;
      }
      for (const frame of frames) {
        void this.handle(frame, socket);
      }
    });
  }

  private async handle(frame: Buffer, socket: net.Socket): Promise<void> {
    if (frame[0] === SSH_AGENTC_REQUEST_IDENTITIES) {
      this.write(socket, encodeIdentitiesAnswer(this.options.keys().map((k) => k.identity)));
      return;
    }
    if (frame[0] !== SSH_AGENTC_SIGN_REQUEST) {
      // Everything else — add, remove, lock, extensions. A read-only agent by construction:
      // nothing a client sends can change what it serves.
      this.write(socket, encodeFailure());
      return;
    }
    this.write(socket, await this.answerSign(frame));
  }

  /** Resolve a SIGN_REQUEST to its reply — the signature blob, or FAILURE with a reason logged. */
  private async answerSign(frame: Buffer): Promise<Buffer> {
    const request = decodeSignRequest(frame);
    // A malformed request, or a client offering a key we no longer hold — the normal way a
    // client walks the identities it knows about. Refuse quietly, without a dialog.
    const key = request === undefined ? undefined : this.keyFor(request.publicBlob);
    if (key === undefined || request === undefined) {
      return encodeFailure();
    }
    return this.confirmAndSign(key, request);
  }

  private async confirmAndSign(key: AgentKey, request: SignRequest): Promise<Buffer> {
    if (await this.options.confirm(key, describeSignRequest(request.data), request.data)) {
      return this.signed(key, request.data, request.flags);
    }
    this.options.log(`REFUSED a signature with "${key.name}"`);
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

  private write(socket: net.Socket, payload: Buffer): void {
    if (!socket.destroyed) {
      socket.write(encodeFrame(payload));
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
