import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  ByteReader,
  FrameReader,
  SSH_AGENTC_REQUEST_IDENTITIES,
  SSH_AGENTC_SIGN_REQUEST,
  SSH_AGENT_FAILURE,
  SSH_AGENT_IDENTITIES_ANSWER,
  SSH_AGENT_SIGN_RESPONSE,
  encodeFrame,
  encodeString,
} from '../sshAgentProtocol';
import { AgentKey, SshAgentServer, agentSocketPath } from '../sshAgentServer';
import { parseSshPrivateKey } from '../sshKeyParse';
import { signForAgent } from '../sshAgentSign';

/**
 * The agent over a REAL socket, driven with hand-built frames — the closest a unit test gets to
 * what `ssh` does, without needing `ssh` on the machine running the suite.
 */

function newKey(name: string): { key: AgentKey; publicKey: crypto.KeyObject } {
  const pem = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey.toString();
  const parsed = parseSshPrivateKey(pem, name);
  assert.equal(parsed.ok, true);
  const inner = (parsed as { ok: true; key: { publicBlob: Buffer; fingerprint: string; key: crypto.KeyObject } }).key;
  return {
    publicKey: crypto.createPublicKey(inner.key),
    key: {
      entityId: `e-${name}`,
      name,
      fingerprint: inner.fingerprint,
      identity: { publicBlob: inner.publicBlob, comment: name },
      sign: (data, flags) => signForAgent(inner as never, data, flags),
    },
  };
}

interface Harness {
  server: SshAgentServer;
  request(payload: Buffer): Promise<Buffer>;
  logs: string[];
  dispose(): void;
}

async function harness(
  keys: AgentKey[],
  confirm: (key: AgentKey) => Promise<boolean> = () => Promise.resolve(true),
): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-agent-'));
  const socketPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\creds-agent-test-${process.pid}-${Math.floor(process.hrtime()[1])}`
      : path.join(dir, 'agent.sock');
  const logs: string[] = [];
  const server = new SshAgentServer({
    socketPath,
    keys: () => keys,
    confirm: (key) => confirm(key),
    log: (message) => logs.push(message),
  });
  await server.listen();

  const request = (payload: Buffer): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      const reader = new FrameReader();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('the agent did not answer'));
      }, 5_000);
      socket.on('connect', () => socket.write(encodeFrame(payload)));
      socket.on('data', (chunk: Buffer) => {
        const frames = reader.push(chunk);
        if (frames.length > 0) {
          clearTimeout(timer);
          socket.end();
          resolve(frames[0]);
        }
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

  return {
    server,
    request,
    logs,
    dispose: () => {
      server.dispose();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // a socket file the OS still holds — nothing to do
      }
    },
  };
}

const signRequestFor = (publicBlob: Buffer, data: Buffer, flags = 0): Buffer => {
  const flagBytes = Buffer.alloc(4);
  flagBytes.writeUInt32BE(flags, 0);
  return Buffer.concat([
    Buffer.from([SSH_AGENTC_SIGN_REQUEST]),
    encodeString(publicBlob),
    encodeString(data),
    flagBytes,
  ]);
};

test('the agent lists the keys it holds, with their comments', async () => {
  const a = newKey('prod key');
  const b = newKey('staging key');
  const h = await harness([a.key, b.key]);
  try {
    const reader = new ByteReader(await h.request(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES])));
    assert.equal(reader.readByte(), SSH_AGENT_IDENTITIES_ANSWER);
    assert.equal(reader.readUInt32(), 2);
    assert.ok(reader.readString()?.equals(a.key.identity.publicBlob));
    assert.equal(reader.readString()?.toString('utf8'), 'prod key');
  } finally {
    h.dispose();
  }
});

test('an allowed signature verifies against the key the agent advertised', async () => {
  const a = newKey('prod key');
  const h = await harness([a.key]);
  const data = Buffer.from('bytes a client wants signed');
  try {
    const reply = new ByteReader(await h.request(signRequestFor(a.key.identity.publicBlob, data)));
    assert.equal(reply.readByte(), SSH_AGENT_SIGN_RESPONSE);
    const blob = new ByteReader(reply.readString() as Buffer);
    assert.equal(blob.readString()?.toString('utf8'), 'ssh-ed25519');
    assert.equal(crypto.verify(null, data, a.publicKey, blob.readString() as Buffer), true);
    assert.match(h.logs.join('\n'), /SIGNED with "prod key"/);
  } finally {
    h.dispose();
  }
});

test('a refused signature answers FAILURE and is written down — this is the whole feature', async () => {
  const a = newKey('prod key');
  const h = await harness([a.key], () => Promise.resolve(false));
  try {
    const reply = new ByteReader(
      await h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('data'))),
    );
    assert.equal(reply.readByte(), SSH_AGENT_FAILURE);
    assert.match(h.logs.join('\n'), /REFUSED a signature with "prod key"/);
  } finally {
    h.dispose();
  }
});

test('EVERY signature is confirmed — a second request asks again', async () => {
  // The property that separates this from `ssh-add`: consent is per use, not per session, so
  // an allow cannot be cached anywhere.
  const a = newKey('prod key');
  let asked = 0;
  const h = await harness([a.key], () => {
    asked += 1;
    return Promise.resolve(true);
  });
  try {
    await h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('one')));
    await h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('two')));
    assert.equal(asked, 2);
  } finally {
    h.dispose();
  }
});

test('a key the agent does not hold is refused without asking anybody', async () => {
  const held = newKey('held');
  const other = newKey('not held');
  let asked = 0;
  const h = await harness([held.key], () => {
    asked += 1;
    return Promise.resolve(true);
  });
  try {
    const reply = new ByteReader(
      await h.request(signRequestFor(other.key.identity.publicBlob, Buffer.from('data'))),
    );
    assert.equal(reply.readByte(), SSH_AGENT_FAILURE);
    assert.equal(asked, 0, 'a client walking its known identities must not raise a dialog');
  } finally {
    h.dispose();
  }
});

test('an unimplemented message (add, remove, lock) is refused — the agent is read-only', async () => {
  const a = newKey('prod key');
  const h = await harness([a.key]);
  try {
    for (const type of [17, 18, 22, 25]) {
      const reply = new ByteReader(await h.request(Buffer.from([type])));
      assert.equal(reply.readByte(), SSH_AGENT_FAILURE, `message ${type}`);
    }
  } finally {
    h.dispose();
  }
});

test('a malformed sign request is refused rather than throwing out of the agent', async () => {
  const a = newKey('prod key');
  const h = await harness([a.key]);
  try {
    const reply = new ByteReader(await h.request(Buffer.from([SSH_AGENTC_SIGN_REQUEST, 0, 0])));
    assert.equal(reply.readByte(), SSH_AGENT_FAILURE);
  } finally {
    h.dispose();
  }
});

test('the keys are re-read per request, so unloading one takes effect at once', async () => {
  const a = newKey('prod key');
  const keys: AgentKey[] = [a.key];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-agent-'));
  const socketPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\creds-agent-live-${process.pid}`
      : path.join(dir, 'agent.sock');
  const server = new SshAgentServer({
    socketPath,
    keys: () => keys,
    confirm: () => Promise.resolve(true),
    log: () => undefined,
  });
  await server.listen();
  const ask = (payload: Buffer): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      const reader = new FrameReader();
      socket.on('connect', () => socket.write(encodeFrame(payload)));
      socket.on('data', (chunk: Buffer) => {
        const frames = reader.push(chunk);
        if (frames.length > 0) {
          socket.end();
          resolve(frames[0]);
        }
      });
      socket.on('error', reject);
    });
  try {
    const before = new ByteReader(await ask(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES])));
    before.readByte();
    assert.equal(before.readUInt32(), 1);

    keys.length = 0; // the user removed the key from the agent

    const after = new ByteReader(await ask(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES])));
    after.readByte();
    assert.equal(after.readUInt32(), 0);
  } finally {
    server.dispose();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // nothing to do
    }
  }
});

test('dispose stops the agent answering at all', async () => {
  const a = newKey('prod key');
  const h = await harness([a.key]);
  assert.equal(h.server.listening, true);
  h.dispose();
  assert.equal(h.server.listening, false);

  await assert.rejects(h.request(Buffer.from([SSH_AGENTC_REQUEST_IDENTITIES])));
});

test('the socket is per window: a pipe on Windows, a file beside the purged key directory', () => {
  assert.equal(
    agentSocketPath('/storage', 'win32', 4242),
    '\\\\.\\pipe\\creds-for-devs-agent-4242',
  );
  assert.equal(
    agentSocketPath(path.join('/storage'), 'linux', 4242),
    path.join('/storage', 'keys', '4242', 'agent.sock'),
  );
});
