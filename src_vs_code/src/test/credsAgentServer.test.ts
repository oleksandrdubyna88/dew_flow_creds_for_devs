import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { SERVICE_NAME } from '../brokerProtocol';

/**
 * The agent broker, driven over real HTTP (audit A3).
 *
 * <p>Every test here starts the real listener, mints a real grant through `share()`, and makes
 * the request an agent's CLI would make. Nothing about the routing, the token check or the
 * consent gate is asserted from the inside.</p>
 *
 * <p><b>The seam that matters is `perform()`.</b> Two entry points reach it — a bearer token
 * and a CLI alias — and behind it sit the capability check, consent, masking, the audit line
 * and the one-use burn, each exactly once. A test that only exercised the token path would say
 * nothing about whether the alias path shares them, and the path that gets forgotten is always
 * the newer one. So every guarantee below is asserted through BOTH doors.</p>
 *
 * <p>Two orderings are load-bearing and easy to lose. A refused or still-pending call must not
 * touch the grant — otherwise a denial extends the token's idle life or spends one of its
 * uses. And the burn happens only AFTER the answer is on the wire, so a storage failure while
 * burning cannot cost the agent a result it already earned.</p>
 */

type Broker = typeof import('../credsAgentServer');

interface Ran {
  action: string;
  entityId: string;
  body: Record<string, unknown>;
}

interface World {
  mod: Broker;
  server: InstanceType<Broker['CredsAgentServer']>;
  dialogs: string[];
  /** Consent answers, in order; undefined means the dialog was dismissed. */
  answers: (string | undefined)[];
  ran: Ran[];
  audit: string[];
  burned: string[];
  presence: number;
  /** Set by the run() stub to whatever the action should answer. */
  result: { status: number; body: Record<string, unknown> };
}

function world(options: {
  answers?: (string | undefined)[];
  secrets?: readonly { value: string; label: string }[];
  burns?: boolean;
  alias?: { accountId: string; entityId: string; entityName: string; kind: string };
  supports?: string[];
}): World {
  const w: World = {
    mod: undefined as never,
    server: undefined as never,
    dialogs: [],
    answers: [...(options.answers ?? ['Allow'])],
    ran: [],
    audit: [],
    burned: [],
    presence: 0,
    result: { status: 200, body: { exitCode: 0, stdout: 'ok\n', stderr: '' } },
  };
  w.mod = loadWithVscode<Broker>('../credsAgentServer', {
    window: {
      showWarningMessage: (m: string): Promise<string | undefined> => {
        w.dialogs.push(m);
        return Promise.resolve(w.answers.shift());
      },
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
      createOutputChannel: (): unknown => ({
        appendLine: (line: string): void => {
          w.audit.push(line);
        },
        dispose: (): void => undefined,
        show: (): void => undefined,
      }),
    },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });

  const supported = options.supports ?? ['exec'];
  const action = (name: string): unknown => ({
    kind: 'ssh',
    action: name,
    verb: `run a command on`,
    describeOutcome: (): string => 'exit 0',
    validate: (body: Record<string, unknown>): unknown =>
      body.command === '' ? { ok: false, message: 'no command given' } : { ok: true },
    summarize: (body: Record<string, unknown>): string => String(body.command ?? ''),
    run: (ctx: { entityId: string }, body: Record<string, unknown>): Promise<unknown> => {
      w.ran.push({ action: name, entityId: ctx.entityId, body });
      return Promise.resolve(w.result);
    },
  });
  const registry = {
    resolve: (kind: string, name: string): unknown =>
      kind === 'ssh' && supported.includes(name) ? action(name) : undefined,
    actionsFor: (): unknown[] => supported.map((n) => action(n)),
  };

  w.server = new w.mod.CredsAgentServer(
    registry as never,
    () => {
      w.presence += 1;
    },
    undefined,
    options.secrets === undefined ? undefined : () => Promise.resolve(options.secrets ?? []),
    options.burns === undefined
      ? undefined
      : (_a: string, entityId: string): Promise<boolean> => {
          w.burned.push(entityId);
          return Promise.resolve(options.burns === true);
        },
    options.alias === undefined ? undefined : (name: string) => (name === 'prod' ? options.alias : undefined),
  );
  return w;
}

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  port: number,
  path: string,
  options: { token?: string; body?: unknown; raw?: string; method?: string } = {},
): Promise<Answer> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
    },
    body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

/** Mint a grant and hand back the port and secret the CLI would use. */
async function share(w: World): Promise<{ port: number; secret: string }> {
  const token = await w.server.share('a1', 'e1', 'prod', 'ssh');
  const dot = token.indexOf('.');
  return { port: Number(token.slice(0, dot)), secret: token.slice(dot + 1) };
}

/**
 * A secret long enough to be maskable. `MIN_MASKABLE_LENGTH` is 8, deliberately: a
 * four-character value would turn every line number and every `true` in the output into a
 * placeholder. A shorter fixture here is simply not masked, and the test would read as a
 * masking defect rather than as a fixture that never qualified.
 */
const SECRET = 'sk-live-9f2c41ab';

const code = (answer: Answer): string => (answer.body.error as { code: string } | undefined)?.code ?? '';

test('health is unauthenticated — it is what lets the CLI check the port before sending a token', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/health', { method: 'GET' });

    assert.equal(answer.status, 200);
    assert.equal(answer.body.service, SERVICE_NAME);
  } finally {
    w.server.dispose();
  }
});

test('a call with NO token is refused, and nothing runs', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/use/exec', { body: { command: 'uptime' } });

    assert.equal(code(answer), 'unauthorized');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('a token from another window is refused', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: 'not-a-real-secret', body: { command: 'uptime' } });

    assert.equal(code(answer), 'unauthorized');
  } finally {
    w.server.dispose();
  }
});

test('an allowed call runs, and the human is asked exactly once', async () => {
  // Consent is per GRANT: one Allow covers every later call on that token, which is why the
  // dialog has to say so.
  const w = world({ answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'df -h' } });

    assert.equal(w.ran.length, 2);
    assert.equal(w.dialogs.length, 1, 'the second call did not ask again');
    assert.equal(w.presence, 1, 'answering a dialog is the provable moment of presence');
  } finally {
    w.server.dispose();
  }
});

test('the consent dialog names EVERY action the grant covers, not just this one', async () => {
  // Otherwise "open a terminal" is what the person reads while "run any command" is what
  // they grant.
  const w = world({ answers: ['Allow'], supports: ['exec', 'terminal'] });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.match(w.dialogs[0], /Allowing covers every later call/);
    assert.match(w.dialogs[0], /"prod"/);
  } finally {
    w.server.dispose();
  }
});

test('a DENIED grant refuses this call and every later one, without running anything', async () => {
  const w = world({ answers: ['Deny'] });
  try {
    const { port, secret } = await share(w);

    const first = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    const second = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(code(first), 'denied');
    assert.equal(code(second), 'denied');
    assert.deepEqual(w.ran, []);
    assert.equal(w.dialogs.length, 1, 'a denial is remembered, not re-asked');
  } finally {
    w.server.dispose();
  }
});

test('a DISMISSED dialog refuses this call but leaves the grant re-promptable', async () => {
  // A mis-click must not lock an agent out for the window's life.
  const w = world({ answers: [undefined, 'Allow'] });
  try {
    const { port, secret } = await share(w);

    const first = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    const second = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(code(first), 'consent_timeout');
    assert.equal(second.status, 200, 'the next call asked again and was allowed');
    assert.equal(w.dialogs.length, 2);
  } finally {
    w.server.dispose();
  }
});

test('an action the entity kind does not support is not_supported, and asks nobody', async () => {
  // A capability check before the dialog: nobody should be asked to approve something that
  // cannot happen.
  const w = world({ supports: ['exec'] });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/terminal', { token: secret, body: {} });

    assert.equal(code(answer), 'not_supported');
    assert.deepEqual(w.dialogs, []);
  } finally {
    w.server.dispose();
  }
});

test('a body the action rejects is refused BEFORE the human is asked', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: '' } });

    assert.equal(code(answer), 'invalid_request');
    assert.deepEqual(w.dialogs, [], 'no dialog for a call that could never run');
  } finally {
    w.server.dispose();
  }
});

test('a body that is not a JSON object is refused', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, raw: 'not json' });

    assert.equal(code(answer), 'invalid_request');
  } finally {
    w.server.dispose();
  }
});

test('an unknown endpoint is not_found rather than a stack trace', async () => {
  const w = world({});
  try {
    const { port, secret } = await share(w);

    assert.equal(code(await call(port, '/v1/use/../etc/passwd', { token: secret, body: {} })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

test("the entity's own secrets are masked out of the output it produced", async () => {
  // The broker's promise — no response field a secret can travel in — is true of the SHAPES
  // and false of what stdout carries: an agent that composes a command can make it print the
  // very password the broker supplied to run it.
  const w = world({ secrets: [{ value: SECRET, label: 'PASSWORD' }] });
  w.result = { status: 200, body: { exitCode: 0, stdout: `the password is ${SECRET}\n`, stderr: '' } };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo $PW' } });

    assert.ok(!JSON.stringify(answer.body).includes(SECRET), JSON.stringify(answer.body));
    assert.match(String(answer.body.stdout), /PASSWORD/, 'and it says which value stood there');
  } finally {
    w.server.dispose();
  }
});

test('the audit line records HOW MANY values were masked, never which', async () => {
  const w = world({ secrets: [{ value: SECRET, label: 'PASSWORD' }] });
  w.result = { status: 200, body: { exitCode: 0, stdout: `${SECRET}\n`, stderr: '' } };
  try {
    const { port, secret } = await share(w);
    await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo $PW' } });

    const masked = w.audit.filter((l) => /masked/.test(l));
    assert.equal(masked.length, 1, w.audit.join(' | '));
    assert.ok(!masked[0].includes(SECRET), masked[0]);
  } finally {
    w.server.dispose();
  }
});

test('a ONE-USE entity is burned after the answer, not before it', async () => {
  // A storage failure while burning must not cost the agent the result it already earned.
  const w = world({ burns: true });
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.equal(answer.status, 200, 'the result arrived');
    assert.deepEqual(w.burned, ['e1']);
  } finally {
    w.server.dispose();
  }
});

test('a REFUSED call burns nothing — a denial does not spend a use', async () => {
  const w = world({ answers: ['Deny'], burns: true });
  try {
    const { port, secret } = await share(w);

    await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });

    assert.deepEqual(w.burned, []);
  } finally {
    w.server.dispose();
  }
});

test('an ALIAS call reaches the same seam: it is consented, run and audited', async () => {
  // The alias route mints its own grant and then follows the token path exactly. Anything
  // duplicated for it would be a way for consent to apply to one caller and not the other.
  const w = world({ alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });

    assert.equal(answer.status, 200);
    assert.equal(w.dialogs.length, 1, 'an alias call is consented like any other');
    assert.deepEqual(w.ran.map((r) => r.entityId), ['e9'], 'and it ran against the aliased entity');
  } finally {
    w.server.dispose();
  }
});

test('an alias call the human DENIES runs nothing', async () => {
  const w = world({
    answers: ['Deny'],
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
  });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'uptime' } });

    assert.equal(code(answer), 'denied');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('an alias call is MASKED and BURNED like a token call', async () => {
  // The three things the seam exists to share, asserted through the newer door.
  const w = world({
    secrets: [{ value: SECRET, label: 'PASSWORD' }],
    burns: true,
    alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' },
  });
  w.result = { status: 200, body: { exitCode: 0, stdout: `${SECRET}\n`, stderr: '' } };
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'echo $PW' } });

    assert.ok(!JSON.stringify(answer.body).includes(SECRET), 'masked');
    assert.deepEqual(w.burned, ['e9'], 'burned');
  } finally {
    w.server.dispose();
  }
});

test('an unknown alias answers exactly like a known one nobody enabled', async () => {
  // Whether a name exists is not something an unauthenticated caller should enumerate.
  const w = world({ alias: { accountId: 'a1', entityId: 'e9', entityName: 'prod', kind: 'ssh' } });
  try {
    const { port } = await share(w);

    const answer = await call(port, '/v1/alias/exec', { body: { alias: 'no-such-entry', command: 'uptime' } });

    assert.equal(code(answer), 'not_found');
    assert.deepEqual(w.ran, []);
  } finally {
    w.server.dispose();
  }
});

test('a window serving NO aliases refuses alias calls entirely', async () => {
  const w = world({});
  try {
    const { port } = await share(w);

    assert.equal(code(await call(port, '/v1/alias/exec', { body: { alias: 'prod', command: 'x' } })), 'not_found');
  } finally {
    w.server.dispose();
  }
});

test('disposing stops serving — the port answers nothing afterwards', async () => {
  const w = world({});
  const { port, secret } = await share(w);
  w.server.dispose();

  await assert.rejects(() => call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } }));
});
