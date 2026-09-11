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
export const BROKER_HOOK_NAMES = [
  'storageDir',
  'maskEntriesFor',
  'burnAfterUse',
  'isOneUse',
  'resolveAlias',
  'listAliases',
  'listMcpEntries',
  'visibleConfig',
  'resolveMcpUse',
  'moveToTrash',
  'mcpCreate',
  'configRoute',
] as const;

/** True only when the two sets are the same set — in either direction. */
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * A compile-time assertion, not a runtime one: adding a field to {@link BrokerHooks} without adding
 * its name above stops the build here, rather than at some window's startup.
 */
const NAMES_MATCH_THE_INTERFACE: SameSet<keyof BrokerHooks, (typeof BROKER_HOOK_NAMES)[number]> = true;
void NAMES_MATCH_THE_INTERFACE;

/**
 * The hooks, with every key checked against the interface.
 *
 * <p><b>Why a runtime check for something the compiler already knows.</b> Five of the seven callers
 * are `.cjs` integration scripts. TypeScript never reads them, so the whole benefit of naming these
 * would stop at the two callers that were never the problem. A misspelled key there is silent by
 * construction — the field is optional, so absent is legal — and silence is what made the August
 * shift last a month.</p>
 *
 * <p>An explicitly `undefined` value is fine: several windows switch a hook off that way on purpose,
 * and so does every call site migrating from the positional form. It is the KEY that is checked,
 * never the value.</p>
 *
 * <p>Nothing at all is fine too — a build with no vault is a real build. Anything that is not a set
 * of hooks is NOT: a string in that position is the half-migrated `.cjs` shape, where the old third
 * positional argument is still being passed, and ignoring it would switch every hook off at once.</p>
 */
export function checkedHooks(hooks: BrokerHooks | undefined): BrokerHooks {
  if (hooks === undefined) {
    return {};
  }
  if (!isHookSet(hooks)) {
    throw new Error(`The broker's hooks must be an object of named hooks, not ${describe(hooks)}.`);
  }
  const stray = Object.keys(hooks).filter((key) => !(BROKER_HOOK_NAMES as readonly string[]).includes(key));
  if (stray.length > 0) {
    throw new Error(
      `Not a broker hook: ${stray.join(', ')}. Expected any of: ${BROKER_HOOK_NAMES.join(', ')}.`,
    );
  }
  return hooks;
}

/** A plain object, which is the only thing whose KEYS mean anything. */
function isHookSet(value: unknown): value is BrokerHooks {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Enough to recognise what was passed, without putting a callback's source in an error. */
function describe(value: unknown): string {
  return Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value;
}
