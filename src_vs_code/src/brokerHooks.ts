import { ConfigRouteSources } from './brokerConfigRoute';
import { McpCreateHooks } from './brokerMcpDoor';
import { McpUseLookup } from './brokerRequests';
import { McpEntry } from './mcpEntries';
import { MaskEntry } from './secretMasker';
import { EntityMetadata } from './types';

/**
 * Everything the broker asks of the side that owns the vault — by name.
 *
 * <p><b>Why this is an object and not a parameter list.</b> `CredsAgentServer` took fourteen
 * POSITIONAL constructor parameters, eleven of them optional callbacks of much the same shape, so
 * inserting one in the middle handed every argument after it to the wrong slot — and the types
 * could not see it, because a lambda fits another lambda's hole. It happened twice, both times
 * silently:</p>
 *
 * <ul>
 *   <li><b>2026-08-27.</b> `visibleConfig` was added. `creds-mcp-itest.cjs` still carries the
 *       note: every lambda after it shifted one place, the permission gate became the config
 *       supplier, and nineteen checks failed for a MONTH before anybody ran that script.</li>
 *   <li><b>2026-09-11.</b> `isOneUse` was added for audit finding #3. `listAliases` landed in its
 *       slot and `creds ls` answered "no entry is enabled for the CLI yet".</li>
 * </ul>
 *
 * <p>Five of the seven construction sites are `.cjs` integration scripts, where TypeScript never
 * looks, and one of those five is not in CI at all — which is precisely how August lasted a month.
 * Moving the newest parameter to the end fixed that insertion and not the next one.</p>
 *
 * <p><b>Every one of these is optional, and that is the design rather than laxity</b> — a build
 * with no vault, an integration script with nothing but an action registry, and a window whose
 * storage path is too long for a unix socket are all real configurations, and each must answer
 * rather than crash. It is also exactly why {@link checkedHooks} exists: when absent is legal, a
 * MISSPELLED key is not an error, it is a feature quietly switched off.</p>
 */
export interface BrokerHooks {
  /**
   * Where this window keeps its own files — the audit journal, the CLI endpoint note, and the
   * second listener's socket path. Absent means none of those three, which is a real build: a
   * storage path too long for the OS socket limit runs on the loopback port alone.
   *
   * <p>In here rather than a third positional parameter, which is where the plan first put it. A
   * reviewer pointed out that an optional positional in front of an options object rebuilds the
   * very trap this change removes: `new CredsAgentServer(actions, present, { listAliases })` binds
   * the object to `storageDir`, leaves `hooks` at its default, and switches every hook off with no
   * error anywhere. Two required positionals and one named object has no such shape.</p>
   */
  readonly storageDir?: string;

  /**
   * The secrets of the entity a grant points at, for masking that entity's own values out of the
   * output it produces. Absent means no masking, never a crash.
   *
   * <p>Scoped to the GRANT's entity on purpose. Building a table from every secret of every
   * unlocked account would put N keychain reads on a per-call path — exactly the cost class 0.57.0
   * removed from the tree and the sync cycle. For the common case the values are already in memory
   * by the time output exists.</p>
   */
  readonly maskEntriesFor?: (accountId: string, entityId: string) => Promise<readonly MaskEntry[]>;

  /**
   * Destroy the entity if it was marked to live for exactly one agent use; answers whether it did.
   *
   * <p>The DECISION lives outside on purpose. The broker knows a grant, not a stored record — it
   * should no more read `burnPolicy` than it reads a password — so the caller that owns storage
   * answers "was this one-use, and is it gone now". That also keeps the single deletion path
   * (`deleteNodeRecursive`, tombstone and history included) on the side of the wall that has it.</p>
   */
  readonly burnAfterUse?: (accountId: string, entityId: string) => Promise<boolean>;

  /**
   * Whether this entry may be used exactly once — asked of the side that owns storage, like
   * {@link burnAfterUse}. One call at a time for such an entry (audit 2026-09-09, finding #3);
   * absent means this window queues nothing.
   */
  readonly isOneUse?: (accountId: string, entityId: string) => boolean;

  /**
   * Resolve a CLI alias to the entry it names. Absent means this window serves no alias calls at
   * all, which is what a build or a test without the registry should do.
   *
   * <p>Outside again, for the same reason as the others: the broker holds grants, not stored
   * records. It should not know where a NAME is kept any more than it knows where a password is.</p>
   */
  readonly resolveAlias?: (
    name: string,
  ) => { accountId: string; entityId: string; entityName: string; kind: string } | undefined;

  /**
   * The names enabled for the CLI, for `creds ls`. Absent means this window answers the listing
   * route with an empty list rather than a crash.
   *
   * <p>Separate from {@link resolveAlias} even though both read the same registry, because they
   * disclose different things and a future build might well want one without the other — resolving
   * a name you already know is not the same as being handed every name there is.</p>
   */
  readonly listAliases?: () => readonly { name: string; kind: string }[];

  /**
   * The entries a person opened to agents, already reduced to their non-secret half.
   *
   * <p>Asynchronous unlike its neighbours, because "is there a password" is a keychain read.
   * Absent means this window shows agents nothing, which is what a build or a test without the
   * vault should do.</p>
   */
  readonly listMcpEntries?: () => Promise<readonly McpEntry[]>;

  /**
   * An agent-VISIBLE config entry by id — the snippet route's supplier (T10), behind the same wall
   * as the listing above. Absent answers "no such config".
   */
  readonly visibleConfig?: (entityId: string) => EntityMetadata | undefined;

  /**
   * Resolve an entry id for an agent's USE call — and say whether it may.
   *
   * <p>One callback rather than a lookup and a separate permission check, because the two questions
   * have one answer and splitting them is how a path ends up asking the first and forgetting the
   * second.</p>
   */
  readonly resolveMcpUse?: (entryId: string, action: string) => McpUseLookup;

  /**
   * Move an entry to the Trash, answering whether it was still there to move.
   *
   * <p>Deliberately NOT `deleteNodeRecursive`: that is the one real deletion path, and an agent
   * never reaches it — what makes "agents may delete" grantable at all is that the destination is a
   * folder and not oblivion.</p>
   */
  readonly moveToTrash?: (accountId: string, entityId: string) => Promise<boolean>;

  /**
   * Where an agent may create an entry, and how to make one.
   *
   * <p>The only one of these whose gate is not an entry: there is no entry yet. Which folders are
   * open, which kinds they hold and what a request becomes are all questions about a vault.</p>
   */
  readonly mcpCreate?: McpCreateHooks;

  /**
   * Where `/v1/config/read` gets its answer. Outside for the same reason as the rest: this class
   * holds grants, and a config key is not one. Absent serves no config to anything.
   */
  readonly configRoute?: ConfigRouteSources;
}

/**
 * The names {@link checkedHooks} accepts — and the tuple the type is checked against.
 *
 * <p>Exported because the test asserts the guard agrees with itself, and because a hand-maintained
 * second list is exactly the drift a reviewer warned about: add a hook to the interface, forget it
 * here, and every typechecked caller compiles while every server construction throws at startup.
 * {@link NAMES_MATCH_THE_INTERFACE} below makes that a compile error instead.</p>
 */
/**
 * Every hook by name, and the KIND its value must be — the two things the guard checks.
 *
 * <p>One table rather than a list and a separate switch, because a hook added to one and not the
 * other is the drift a reviewer warned about. {@link NAMES_MATCH_THE_INTERFACE} below turns that
 * into a compile error rather than a startup one.</p>
 *
 * <p>The kinds are deliberately coarse — `string`, `function`, `object`. A schema would be a second
 * description of the interface, which is the thing that drifts; these three catch what the five
 * untyped callers can actually get wrong, which is passing the wrong ARGUMENT, not the wrong shape
 * of the right one.</p>
 */
const HOOK_KINDS = {
  storageDir: 'string',
  maskEntriesFor: 'function',
  burnAfterUse: 'function',
  isOneUse: 'function',
  resolveAlias: 'function',
  listAliases: 'function',
  listMcpEntries: 'function',
  visibleConfig: 'function',
  resolveMcpUse: 'function',
  moveToTrash: 'function',
  mcpCreate: 'object',
  configRoute: 'object',
} as const;

/** The names {@link checkedHooks} accepts. Exported so the test can assert the guard's own list. */
export const BROKER_HOOK_NAMES = Object.keys(HOOK_KINDS) as readonly (keyof typeof HOOK_KINDS)[];

const KNOWN = new Set<string>(BROKER_HOOK_NAMES);

/** True only when the two sets are the same set — in either direction. */
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * A compile-time assertion, not a runtime one: adding a field to {@link BrokerHooks} without adding
 * it to {@link HOOK_KINDS} stops the build here, rather than at some window's startup.
 */
const NAMES_MATCH_THE_INTERFACE: SameSet<keyof BrokerHooks, keyof typeof HOOK_KINDS> = true;
void NAMES_MATCH_THE_INTERFACE;

/**
 * The hooks, checked and made the server's own.
 *
 * <p><b>Why a runtime check for something the compiler already knows.</b> Five of the seven callers
 * are `.cjs` integration scripts. TypeScript never reads them, so the whole benefit of naming these
 * would stop at the two callers that were never the problem. A misspelled key there is silent by
 * construction — the field is optional, so absent is legal — and silence is what made the August
 * shift last a month.</p>
 *
 * <p>Three things are refused, and each of them used to be accepted as "no hooks at all":</p>
 * <ul>
 *   <li>anything that is <b>not a plain object</b>. A `Map` carrying the hooks has no own
 *       enumerable keys, so the key check saw nothing wrong and every hook came out off — the guard
 *       failing at its own job, found by the review gate. A string or a number in that position is
 *       the half-migrated `.cjs` shape, still passing the old third positional argument;</li>
 *   <li>a <b>key that is not a hook</b>, named alongside the twelve that are;</li>
 *   <li>a <b>value of the wrong kind</b>. `storageDir: 123` reaches `path.join` and throws
 *       somewhere later; `listAliases: 'yes'` throws on the first `creds ls`. Both belong here.</li>
 * </ul>
 *
 * <p>An explicitly `undefined` value is fine throughout: several windows switch a hook off that way
 * on purpose. Nothing at all is fine too — a build with no vault is a real build.</p>
 *
 * <p>What comes back is a FROZEN COPY. A caller that reuses its options object must not be able to
 * switch a running window's feature off after the fact.</p>
 */
export function checkedHooks(hooks: BrokerHooks | undefined): BrokerHooks {
  if (hooks === undefined) {
    return Object.freeze({});
  }
  if (!isPlainObject(hooks)) {
    throw new Error(`The broker's hooks must be a plain object of named hooks, not ${describe(hooks)}.`);
  }
  refuseStrayKeys(hooks);
  refuseWrongKinds(hooks);
  return Object.freeze({ ...hooks });
}

function refuseStrayKeys(hooks: Record<string, unknown>): void {
  const stray = Object.keys(hooks).filter((key) => !KNOWN.has(key));
  if (stray.length > 0) {
    throw new Error(
      `Not a broker hook: ${stray.join(', ')}. Expected any of: ${BROKER_HOOK_NAMES.join(', ')}.`,
    );
  }
}

function refuseWrongKinds(hooks: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(hooks)) {
    const wanted = HOOK_KINDS[key as keyof typeof HOOK_KINDS];
    if (value !== undefined && typeof value !== wanted) {
      throw new Error(`The broker hook ${key} must be a ${wanted}, not ${describe(value)}.`);
    }
  }
}

/**
 * A plain object, which is the only thing whose KEYS describe it.
 *
 * <p>`Object.create(null)` counts: it has no prototype, and nothing here reads one.</p>
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Enough to recognise what was passed — the type, and for a primitive the value itself, because a
 * developer migrating from the positional form needs to see their own argument to recognise it.
 * Never a function's source, and never an object's contents.
 */
function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'function') {
    return 'a function';
  }
  return typeof value === 'object' ? `a ${constructorName(value)}` : `${typeof value} ${quoted(value)}`;
}

/**
 * The primitive itself, so a developer migrating from the positional form recognises their own
 * argument. A string is quoted; nothing here goes through `JSON.stringify`, which this repository
 * refuses inside a template literal — see `scriptInterpolation.test.ts`.
 */
function quoted(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function constructorName(value: object): string {
  return Array.isArray(value) ? 'array' : (value.constructor?.name ?? 'object');
}
