import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

/**
 * A second way in to the broker, beside its loopback TCP port.
 *
 * <p><b>Why a second listener rather than a wider first one.</b> `loopbackServer.ts` is shared
 * by three consumers, and one of them is the OAuth redirect catcher — a browser has to be able
 * to reach it, so it genuinely needs TCP on a port. Widening that helper would drag a
 * requirement none of its other callers have into all of them. `http.Server.listen` also binds
 * once, so serving both a port and a pipe means two servers sharing one request handler, which
 * is what this does.</p>
 *
 * <p><b>What it buys, stated exactly.</b> On POSIX the socket is chmod 0600, so the operating
 * system refuses another user before a single byte of ours runs — a real boundary, and the one
 * the loopback port never had (any local process may connect to a port; only the grant token
 * stops it). On Windows a named pipe gets the default DACL, which we do not set and cannot set
 * through Node: `icacls` in `fileAcl.ts` takes a file path and a pipe is not one. So the pipe is
 * a convenience there, not a permission boundary, and this module does not pretend otherwise.</p>
 *
 * <p><b>The token is still required on both.</b> Nothing here authenticates anything; it moves
 * bytes to the same handler. The socket is defence in depth behind the token, never a
 * replacement for it — which also means an alias-based caller reaching the broker through this
 * socket is exactly as authorized as it was before, and still faces the consent modal.</p>
 *
 * <p>It is also what the WSL bridge relays into: a Linux `creds` cannot reach a Windows
 * loopback port without mirrored networking, but it can be handed a stream by a Windows-side
 * process that can.</p>
 */

/** A socket path longer than this is refused by the OS, not by us — see `socketPathFor`. */
export const MAX_UNIX_SOCKET_PATH = 100;

/**
 * Where this window listens, beside its port.
 *
 * <p>Per pid, for the same reason `keys/<pid>/` is: two windows of one profile must not collide,
 * and a window's pid changes on reload, which is exactly the lifetime a grant has.</p>
 *
 * <p>On POSIX this is a real path in the extension's storage directory. Unix socket paths have
 * a hard length limit around 104 bytes — shorter than many real `globalStorage` paths — so a
 * path that would not fit comes back `undefined` rather than failing at `listen()` with an
 * error nobody can act on. The caller then runs with the port alone, which still works.</p>
 */
export function socketPathFor(
  storageDir: string,
  pid: number,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform === 'win32') {
    // Not a filesystem path: the Windows named-pipe namespace.
    return `\\\\.\\pipe\\creds-for-devs-${pid}`;
  }
  const candidate = path.join(storageDir, `broker-${pid}.sock`);
  return candidate.length > MAX_UNIX_SOCKET_PATH ? undefined : candidate;
}

export interface ExtraListener {
  /** What a client connects to. */
  readonly address: string;
  close(): Promise<void>;
}

/**
 * Serve `handler` on the pipe or socket as well as wherever else it is already served.
 *
 * <p>A stale socket file from a window that was killed would make `listen` fail with EADDRINUSE
 * even though nothing holds it, so one is removed first. That is safe precisely because the
 * path carries the pid: the only process that could own it is a dead one.</p>
 */
export async function startExtraListener(
  handler: http.RequestListener,
  address: string,
  platform: NodeJS.Platform,
): Promise<ExtraListener> {
  if (platform !== 'win32') {
    try {
      fs.unlinkSync(address);
    } catch {
      // Nothing there is the normal case.
    }
  }
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(address, () => resolve());
  });
  restrictSocket(address, platform);
  return {
    address,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          removeSocket(address, platform);
          resolve();
        });
      }),
  };
}

/**
 * Take the socket down to owner-only.
 *
 * <p>There is a window between `listen` and this call in which the socket exists with the
 * process umask's permissions. It is not closed by chmod-after-bind and cannot be with Node's
 * API; the honest mitigation is that the token is still required, so the window is an
 * exposure of reachability, not of authority.</p>
 */
function restrictSocket(address: string, platform: NodeJS.Platform): void {
  if (platform === 'win32') {
    return; // a pipe is not a file; see the module note
  }
  try {
    fs.chmodSync(address, 0o600);
  } catch {
    // A socket we cannot narrow is a weaker socket, not a broken broker.
  }
}

function removeSocket(address: string, platform: NodeJS.Platform): void {
  if (platform === 'win32') {
    return;
  }
  try {
    fs.unlinkSync(address);
  } catch {
    // Already gone.
  }
}
