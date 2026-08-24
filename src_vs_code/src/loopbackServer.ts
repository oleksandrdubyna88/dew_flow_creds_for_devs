import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A one-call loopback HTTP listener: bind 127.0.0.1 on an OS-assigned port and
 * resolve once the port is known. Extracted from the Google OAuth redirect
 * catcher when the WebAuthn bridge and the agent broker each needed the same
 * eight lines — three copies of a listen() is how they drift.
 *
 * Loopback-only on purpose: nothing served this way is ever reachable from
 * another machine.
 */
export function startLoopbackServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, port: address.port });
    });
  });
}
