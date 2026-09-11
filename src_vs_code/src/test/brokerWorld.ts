import { loadWithVscode } from './vscodeStub';
import type { McpUseLookup } from '../brokerRequests';
import type { McpCreateHooks } from '../brokerMcpDoor';

/**
 * The broker, started for real, with every collaborator a test might want to control.
 *
 * <p>A helper module rather than a block at the top of one test file, because there are two of
 * them now: `credsAgentServer.test.ts` drives the token and alias doors, and
 * `brokerMcpRoutes.test.ts` drives the two an MCP client uses. They must exercise the SAME
 * server — the whole point of the newer routes is that they lead to the same `perform` — and a
 * copied harness would have been the first thing to drift.</p>
 *
 * <p>Every collaborator is absent unless a test asks for it, which is itself what several tests
 * are about: a build with no masker must still answer, and a window with no alias registry must
 * refuse an alias call rather than crash.</p>
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
  /** Entity ids moved to the Trash by an agent. */
  trashed: string[];
  /** Names of entries an agent created. */
  created: string[];
  presence: number;
  /** Called by the run stub: a rotation writing its new value into storage mid-run. */
  rotate?: () => void;
  /** Set by the run() stub to whatever the action should answer. */
  /**
   * What the wrapped action answers — or, when it is an `Error`, what it THROWS.
   *
   * <p>The harness could express every outcome an action reaches by returning, and none it reaches
   * by failing, so the catch around `run` had no test at all. That is the branch that decides what
   * an agent is told about an internal failure.</p>
   */
  result: { status: number; body: Record<string, unknown> } | Error;
}

function world(options: {
  answers?: (string | undefined)[];
  secrets?: readonly { value: string; label: string }[];
  /**
   * When the masker's storage read FAILS, and where.
   *
   * <p>`before` is a keychain that will not answer at all; `after` answers the pre-run read and
   * then rejects the refresh — which is the shape a rotation meets, because it has just written to
   * the same keychain it is about to read. `entityGone` is the quieter one: the read succeeds and
   * the ENTITY is not there, which used to be indistinguishable from "this entry has no
   * secrets".</p>
   */
  maskerFails?: 'before' | 'after' | 'entityGone';
  /**
   * A value the action writes into storage DURING the run — a rotation, in one word.
   *
   * <p>Setting it also makes the action declare `mutatesSecrets`, because in the product those two
   * facts are the same fact: the flag is what says "this one writes".</p>
   */
  rotatesTo?: string;
  burns?: boolean;
  alias?: { accountId: string; entityId: string; entityName: string; kind: string };
  /** The names `creds ls` would see. Absent means this window has no registry at all. */
  aliasList?: { name: string; kind: string }[];
  /** What the vault would show an agent. Absent means this window shows agents nothing. */
  visibleConfig?: (entityId: string) => import('../types').EntityMetadata | undefined;
  mcpEntries?: Record<string, unknown>[];
  /** How an entry id resolves for an MCP use call. Absent means this window serves none. */
  mcpUse?: 'usable' | 'closed';
  /** Whether this window can move entries to the Trash. Absent means it cannot. */
  trash?: boolean;
  /** How a create request is answered: accepted into a folder, refused, or not served at all. */
  create?: 'open' | 'closed';
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
    trashed: [],
    created: [],
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
    mutatesSecrets: options.rotatesTo !== undefined,
    verb: `run a command on`,
    describeOutcome: (): string => 'exit 0',
    validate: (body: Record<string, unknown>): unknown =>
      body.command === '' ? { ok: false, message: 'no command given' } : { ok: true },
    summarize: (body: Record<string, unknown>): string => String(body.command ?? ''),
    run: (ctx: { entityId: string }, body: Record<string, unknown>): Promise<unknown> => {
      w.ran.push({ action: name, entityId: ctx.entityId, body });
      w.rotate?.();
      return w.result instanceof Error ? Promise.reject(w.result) : Promise.resolve(w.result);
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
    maskerFor(w, options),
    burnerFor(w, options.burns),
    aliasResolverFor(options.alias),
    options.aliasList === undefined ? undefined : () => options.aliasList ?? [],
    mcpEntriesFor(options.mcpEntries),
    options.visibleConfig,
    mcpUseFor(options.mcpUse),
    trashFor(w, options.trash),
    createFor(w, options.create),
  );
  return w;
}

/* The broker's three optional collaborators, each absent unless a test asks for it — which is
 * itself what several of the tests are about: a build with no masker must still answer, and a
 * window with no alias registry must refuse an alias call rather than crash. Lifted out of the
 * constructor call so the helper stays under the complexity limit; no test reads differently. */

/**
 * The broker's view of one entity's secrets — and the ways that read can fail.
 *
 * <p>A window with no masker at all is still a real configuration (`secrets` absent), and several
 * tests are about that. What is new is that the read can FAIL, which is the whole of audit finding
 * #1: it used to be caught and turned into an unmasked answer with `hits: 0`.</p>
 */
function maskerFor(
  w: World,
  options: { secrets?: readonly { value: string; label: string }[]; maskerFails?: string; rotatesTo?: string },
): (() => Promise<readonly { value: string; label: string }[]>) | undefined {
  const { secrets, maskerFails, rotatesTo } = options;
  if (secrets === undefined && maskerFails === undefined) {
    return undefined;
  }
  const held = [...(secrets ?? [])];
  armRotation(w, held, rotatesTo);
  return failingAfter(maskerFails, () => [...held]);
}

/** A run that writes a new secret into storage — what the broker's refresh is supposed to catch. */
function armRotation(w: World, held: { value: string; label: string }[], rotatesTo: string | undefined): void {
  if (rotatesTo === undefined) {
    return;
  }
  w.rotate = (): void => {
    held.push({ value: rotatesTo, label: 'NEW_PASSWORD' });
  };
}

/** The read, and the two shapes of failure a test can ask for. */
function failingAfter(
  fails: string | undefined,
  held: () => { value: string; label: string }[],
): () => Promise<readonly { value: string; label: string }[]> {
  let reads = 0;
  return (): Promise<readonly { value: string; label: string }[]> => {
    reads += 1;
    if (fails === 'entityGone') {
      return Promise.reject(new EntityGone('"prod" is no longer in the vault.'));
    }
    return rejectsNow(fails, reads) ? Promise.reject(new Error('the keychain would not answer')) : Promise.resolve(held());
  };
}

/** `before` refuses every read; `after` lets the pre-run one through and refuses the refresh. */
function rejectsNow(fails: string | undefined, reads: number): boolean {
  return fails === 'before' || (fails === 'after' && reads > 1);
}

/** What a masker throws when the entity a grant points at is not in the vault any more. */
class EntityGone extends Error {}

function burnerFor(
  w: World,
  burns: boolean | undefined,
): ((a: string, entityId: string) => Promise<boolean>) | undefined {
  if (burns === undefined) {
    return undefined;
  }
  return (_a: string, entityId: string): Promise<boolean> => {
    w.burned.push(entityId);
    return Promise.resolve(burns);
  };
}

/**
 * The entries a window would show an agent.
 *
 * <p>`as never`: these fixtures are deliberately PARTIAL. What is under test here is the door —
 * that it answers, that it needs no token, that it is a GET. Whether the shape is right is the
 * claim `mcpEntries.test.ts` makes, against the code that actually builds it, and a full fixture
 * here would only assert that a literal matches itself.</p>
 */
function mcpEntriesFor(
  entries: Record<string, unknown>[] | undefined,
): (() => Promise<never>) | undefined {
  return entries === undefined ? undefined : () => Promise.resolve(entries as never);
}

/**
 * How an entry id resolves for an MCP use call.
 *
 * <p>`e1` is the entry every test here mints against, so the fixture answers for that id and for
 * nothing else — which is what makes the "no such entry" case a real one rather than a stub
 * returning undefined for everything.</p>
 */
function mcpUseFor(
  verdict: 'usable' | 'closed' | undefined,
): ((id: string, action: string) => McpUseLookup) | undefined {
  if (verdict === undefined) {
    return undefined;
  }
  return (id: string, action: string): McpUseLookup => {
    if (id !== 'e1') {
      return undefined;
    }
    return verdict === 'closed'
      ? { kind: 'closed', entityName: 'prod', needed: action === 'rotate' ? 'edit' : 'use' }
      : { kind: 'usable', target: { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'ssh' } };
  };
}

/**
 * Moving to the Trash, recorded.
 *
 * <p>Absent means this window has no Trash to move to, which is a real configuration and one of
 * the refusals under test — a build without storage must answer rather than crash.</p>
 */
function trashFor(
  w: World,
  enabled: boolean | undefined,
): ((accountId: string, entityId: string) => Promise<boolean>) | undefined {
  if (enabled !== true) {
    return undefined;
  }
  return (_a: string, entityId: string): Promise<boolean> => {
    w.trashed.push(entityId);
    return Promise.resolve(true);
  };
}

/**
 * The vault's answer to a create request.
 *
 * <p>`open` accepts into one folder; `closed` refuses the way a vault with no folder open to
 * creation does; absent means this window serves no create calls at all, which is a real
 * configuration and one of the refusals under test.</p>
 */
function createFor(w: World, mode: 'open' | 'closed' | undefined): McpCreateHooks | undefined {
  if (mode === undefined) {
    return undefined;
  }
  return {
    choose: (body) =>
      mode === 'closed'
        ? { ok: false, code: 'denied', message: 'No folder is open to agents for creating entries.' }
        : {
            ok: true,
            target: { accountId: 'a1', entityId: 'f1', entityName: 'Servers', kind: 'ssh' },
            summary: `${String(body.name)} (ssh) in "Servers"`,
            withSecret: typeof body.secret === 'string' && body.secret.length > 0,
          },
    make: (_decision, body) => {
      w.created.push(String(body.name));
      return Promise.resolve({ id: 'new-1', name: String(body.name) });
    },
  };
}

function aliasResolverFor(
  alias: { accountId: string; entityId: string; entityName: string; kind: string } | undefined,
): ((name: string) => typeof alias) | undefined {
  return alias === undefined ? undefined : (name: string) => (name === 'prod' ? alias : undefined);
}

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

/** No header at all when there is no token — which is one of the refusals under test. */
function bearer(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : { Authorization: `Bearer ${token}` };
}

/** `raw` wins, so a test can send bytes that are deliberately not JSON. */
function payloadOf(options: { body?: unknown; raw?: string }): string | undefined {
  if (options.raw !== undefined) {
    return options.raw;
  }
  return options.body === undefined ? undefined : JSON.stringify(options.body);
}

async function call(
  port: number,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    raw?: string;
    method?: string;
    /** Headers a BROWSER would add, which is what the door is about. */
    headers?: Record<string, string>;
  } = {},
): Promise<Answer> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(options.token), ...options.headers },
    body: payloadOf(options),
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

/** The sentence a refusal carries, beside the code — what the agent is actually told. */
const message = (answer: Answer): string => (answer.body.error as { message: string } | undefined)?.message ?? '';

export { world, call, share, code, message, SECRET };
export type { World, Answer, Ran };
