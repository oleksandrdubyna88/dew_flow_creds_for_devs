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
  SignPurpose,
  encodeFrame,
  encodeString,
  keyFingerprintOf,
} from '../sshAgentProtocol';
import { AgentKey, SshAgentServer, agentSocketPath } from '../sshAgentServer';
import { parseSshPrivateKey } from '../sshKeyParse';
import { signForAgent } from '../sshAgentSign';
import { HOSTBOUND_METHOD, userauth } from './sshUserauth';
import { assertNoKeyMaterialLogged, watchLogs, watchSecret } from './sshAgentWorld';

/**
 * The agent over a REAL socket, driven with hand-built frames — the closest a unit test gets to
 * what `ssh` does, without needing `ssh` on the machine running the suite.
 */

function newKey(name: string): { key: AgentKey; publicKey: crypto.KeyObject } {
  const pem = watchSecret(
    crypto
      .generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      })
      .privateKey.toString(),
  );
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
  confirm: (key: AgentKey, purpose: SignPurpose) => Promise<boolean> = () => Promise.resolve(true),
): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-agent-'));
  const socketPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\creds-agent-test-${process.pid}-${Math.floor(process.hrtime()[1])}`
      : path.join(dir, 'agent.sock');
  const logs = watchLogs([]);
  const server = new SshAgentServer({
    socketPath,
    keys: () => keys,
    confirm: (key, purpose) => confirm(key, purpose),
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

test('the server checks the purpose against the key it was asked for: a host-bound login of the served key', async () => {
  // What the dialog says is decided here, from the bytes AND the key the request names — the
  // request below is what a current OpenSSH client sends, and it used to read as "unrecognised".
  const a = newKey('prod key');
  const hostKey = Buffer.concat([encodeString('ssh-ed25519'), encodeString('the server host key')]);
  let seen: SignPurpose | undefined;
  const h = await harness([a.key], (_key, purpose) => {
    seen = purpose;
    return Promise.resolve(true);
  });
  try {
    const data = userauth({ blob: a.key.identity.publicBlob, method: HOSTBOUND_METHOD, hostKey });
    await h.request(signRequestFor(a.key.identity.publicBlob, data));

    assert.deepEqual(seen, {
      kind: 'ssh-login',
      user: 'git',
      service: 'ssh-connection',
      hostKey: keyFingerprintOf(hostKey),
      hostKeyType: 'ED25519',
    });
  } finally {
    h.dispose();
  }
});

test('a login that names key A, sent as a sign request for key B, is not a login', async () => {
  // Both keys are really held. The bytes say "log in with A"; the request asks B to sign them.
  // Reading that as a login would put a login's name on a signature nobody logged in with.
  const a = newKey('key A');
  const b = newKey('key B');
  let seen: SignPurpose | undefined;
  const h = await harness([a.key, b.key], (_key, purpose) => {
    seen = purpose;
    return Promise.resolve(true);
  });
  try {
    const data = userauth({ blob: a.key.identity.publicBlob });
    await h.request(signRequestFor(b.key.identity.publicBlob, data));

    assert.deepEqual(seen, { kind: 'unknown' });
  } finally {
    h.dispose();
  }
});

/** A confirm the test answers by hand: `asked` settles when the prompt is open, `answer` is the human's click. */
function heldPrompt(): {
  confirm: (key: AgentKey, purpose: SignPurpose) => Promise<boolean>;
  asked: Promise<void>;
  answer: (allow: boolean) => void;
} {
  let answer: (allow: boolean) => void = () => undefined;
  let opened: () => void = () => undefined;
  const asked = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const click = new Promise<boolean>((resolve) => {
    answer = resolve;
  });
  return {
    asked,
    answer: (allow) => answer(allow),
    confirm: () => {
      opened();
      return click;
    },
  };
}

/** The same key as `served`, signing through it — and counting, so a test can say it never signed. */
function countingCopy(served: AgentKey): { key: AgentKey; signed: () => number } {
  let signed = 0;
  return {
    signed: () => signed,
    key: {
      ...served,
      sign: (data, flags) => {
        signed += 1;
        return served.sign(data, flags);
      },
    },
  };
}

test('a key removed while its prompt is open does not sign, whatever the answer', async () => {
  // The prompt can stay open for minutes (a modal cannot be closed), and the person can remove the key
  // from the agent meanwhile. "Allow" on a prompt about a key that is gone must not sign with it.
  const a = newKey('prod key');
  const held = countingCopy(a.key);
  const keys: AgentKey[] = [held.key];
  const prompt = heldPrompt();
  const h = await harness(keys, prompt.confirm);
  try {
    const reply = h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('data')));
    await prompt.asked;
    keys.length = 0; // Remove from SSH Agent, while the prompt is still on screen
    prompt.answer(true);

    assert.equal(new ByteReader(await reply).readByte(), SSH_AGENT_FAILURE);
    assert.equal(held.signed(), 0, 'the removed key never signed');
    assert.match(h.logs.join('\n'), /REFUSED a signature with "prod key" — the key was removed or replaced while its prompt was open/);
  } finally {
    h.dispose();
  }
});

test('a key re-loaded while its prompt is open signs with neither the old nor the new material', async () => {
  // Same public bytes, a new object: the answer was given about the old one. Identity is the check —
  // bytes would pass a replacement that was loaded from a different (or revoked) source.
  const a = newKey('prod key');
  const old = countingCopy(a.key);
  const reloaded = countingCopy(a.key);
  const keys: AgentKey[] = [old.key];
  const prompt = heldPrompt();
  const h = await harness(keys, prompt.confirm);
  try {
    const reply = h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('data')));
    await prompt.asked;
    keys.splice(0, 1, reloaded.key); // the key was loaded again under the same entity
    prompt.answer(true);

    assert.equal(new ByteReader(await reply).readByte(), SSH_AGENT_FAILURE);
    assert.equal(old.signed() + reloaded.signed(), 0, 'neither object signed');
    assert.match(h.logs.join('\n'), /REFUSED a signature with "prod key" — the key was removed or replaced while its prompt was open/);
  } finally {
    h.dispose();
  }
});

test('a key replaced inside the covered-window path is refused: the check is after the await even with no prompt', async () => {
  // A confirm that never opens a modal (a signature inside the ten-minute window) still returns a promise,
  // and the keys can change before it settles. The check must run after that await, not before it.
  const a = newKey('prod key');
  const old = countingCopy(a.key);
  const reloaded = countingCopy(a.key);
  const keys: AgentKey[] = [old.key];
  const h = await harness(keys, () => {
    keys.splice(0, 1, reloaded.key); // replaced synchronously, no prompt anywhere
    return Promise.resolve(true);
  });
  try {
    const reply = await h.request(signRequestFor(a.key.identity.publicBlob, Buffer.from('data')));

    assert.equal(new ByteReader(reply).readByte(), SSH_AGENT_FAILURE);
    assert.equal(old.signed() + reloaded.signed(), 0, 'neither object signed');
  } finally {
    h.dispose();
  }
});

/** Send every payload on ONE connection, and read one reply per payload. */
function askOnOneSocket(socketPath: string, payloads: Buffer[]): Promise<Buffer[]> {
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

test('every prompt open for a removed key is refused — two on one socket and one on another', async () => {
  const a = newKey('prod key');
  const held = countingCopy(a.key);
  const keys: AgentKey[] = [held.key];
  const releases: ((allow: boolean) => void)[] = [];
  let allOpen: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    allOpen = resolve;
  });
  const h = await harness(keys, () => {
    const click = new Promise<boolean>((resolve) => releases.push(resolve));
    if (releases.length === 3) {
      allOpen();
    }
    return click;
  });
  try {
    const request = signRequestFor(a.key.identity.publicBlob, Buffer.from('data'));
    const sameSocket = askOnOneSocket(h.server.socketPath, [request, request]);
    const otherSocket = askOnOneSocket(h.server.socketPath, [request]);
    await opened;
    keys.length = 0; // Remove from SSH Agent, with three prompts on screen
    releases.forEach((release) => release(true));

    const replies = [...(await sameSocket), ...(await otherSocket)];
    assert.deepEqual(
      replies.map((reply) => new ByteReader(reply).readByte()),
      [SSH_AGENT_FAILURE, SSH_AGENT_FAILURE, SSH_AGENT_FAILURE],
    );
    assert.equal(held.signed(), 0, 'the removed key never signed');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-agent-'));
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

test('nothing this suite logged carries key material', () => {
  // The last test of the file: every harness's log, against every key the file generated.
  assertNoKeyMaterialLogged();
});
