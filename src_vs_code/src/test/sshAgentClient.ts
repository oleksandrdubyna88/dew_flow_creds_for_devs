import * as net from 'node:net';
import { FrameReader, SSH_AGENTC_SIGN_REQUEST, encodeFrame, encodeString } from '../sshAgentProtocol';

/**
 * What an SSH client says to the agent, for the suites that talk to a REAL socket (`sshAgentServer.test.ts`, and
 * `sshAgentManagerFlags.test.ts` since #197 E3.3) — one builder of a sign request and one way to send frames, so the
 * suites cannot drift into two ideas of what the wire looks like. Not named `*.test.ts`: the runner never treats it
 * as a suite.
 */

/** `SSH_AGENTC_SIGN_REQUEST`: the key blob, the data to sign, and the flags (`SSH_AGENT_RSA_SHA2_*` bits). */
export const signRequestFor = (publicBlob: Buffer, data: Buffer, flags = 0): Buffer => {
  const flagBytes = Buffer.alloc(4);
  flagBytes.writeUInt32BE(flags, 0);
  return Buffer.concat([
    Buffer.from([SSH_AGENTC_SIGN_REQUEST]),
    encodeString(publicBlob),
    encodeString(data),
    flagBytes,
  ]);
};

/** Send every payload on ONE connection, and read one reply per payload. */
export function askOnOneSocket(socketPath: string, payloads: Buffer[]): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const reader = new FrameReader();
    const replies: Buffer[] = [];
    socket.on('connect', () => payloads.forEach((payload) => socket.write(encodeFrame(payload))));
    socket.on('data', (chunk: Buffer) => {
      replies.push(...reader.push(chunk));
      if (replies.length === payloads.length) {
        socket.end();
        resolve(replies);
      }
    });
    socket.on('error', reject);
  });
}
