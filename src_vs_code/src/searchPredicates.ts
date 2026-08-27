import { TreeNode } from './types';
import { MCP_SWITCHES } from './mcpSwitches';
import { McpAccess } from './mcpAccess';

/**
 * Typed filter predicates for the tree search (tails T23b): `has:totp`, `has:cli`, `mcp:usable`…
 *
 * <p>Free text finds a row by what is written on it; these find rows by what they CAN DO — all
 * the CLI-enabled entries, everything an agent may rotate, every entry with a one-time code.
 * Combinable with each other and with free text (`aws has:totp mcp:usable` is an AND over all
 * three), because combinations are what the owner asked for in as many words.</p>
 *
 * <p><b>The boundary `nodeHaystack` states extends here unchanged: predicates read METADATA
 * only.</b> `has:totp` reads the flag, never the seed; `has:cli` reads the alias map, never a
 * token. Nothing in this module can receive a secret, which is a property of its inputs.</p>
 */

export type PredicateKey =
  | 'totp'
  | 'cli'
  | 'env'
  | 'code-access'
  | 'ephemeral'
  | 'deps'
  | 'attachment'
  | 'image'
  | `mcp-${string}`;

export interface ParsedQuery {
  /** The free-text terms, exactly as `searchTerms` would have produced them. */
  readonly terms: string[];
  readonly predicates: PredicateKey[];
  /** `has:` / `mcp:` / `is:` tokens nobody recognises — reported, never treated as text. */
  readonly unknown: string[];
}

/** What the predicates need beyond the node itself. All metadata-shaped, by construction. */
export interface CapabilityContext {
  /** Whether a CLI alias points at this entry. */
  readonly hasAlias: (node: TreeNode) => boolean;
  /** The entry's EFFECTIVE MCP access — the same resolver the tree badge uses. */
  readonly mcpAccess: (node: TreeNode) => McpAccess;
}

/**
 * `mcp:` predicate names, keyed by the switch catalog's own ids — the STABLE identifiers, so a
 * relabelled switch keeps its predicate and a NEW switch fails the completeness test below
 * rather than silently having no name.
 */
const MCP_PREDICATE_NAMES: Readonly<Record<string, string>> = {
  mcpView: 'visible',
  mcpUse: 'usable',
  mcpEdit: 'rotate',
  mcpCreate: 'create',
  mcpDeleteOwn: 'delete-own',
  mcpDeleteAny: 'delete-any',
};

const MCP_NAMES: ReadonlyMap<string, number> = new Map(
  MCP_SWITCHES.map((entry, index) => {
    const name = MCP_PREDICATE_NAMES[entry.id];
    if (name === undefined) {
      throw new Error(`mcp switch "${entry.id}" has no search predicate name`);
    }
    return [name, index] as const;
  }),
);

const HAS_KEYS: ReadonlySet<string> = new Set([
  'totp', 'cli', 'env', 'code-access', 'deps', 'attachment', 'image',
]);

/**
 * Split a query into free text and predicates. `has:x`, `is:x` and `mcp:x` are predicate
 * syntax; everything else is a term. An unrecognised predicate is reported in `unknown` so the
 * UI can SAY so — silently treating `has:ttop` as free text would match nothing and look like
 * an empty vault.
 */
export function parseQuery(query: string): ParsedQuery {
  const terms: string[] = [];
  const predicates: PredicateKey[] = [];
  const unknown: string[] = [];
  for (const token of query.toLowerCase().split(/\s+/).filter((t) => t.length > 0)) {
    const kind = classify(token);
    if (kind === 'term') {
      terms.push(token);
    } else if (kind === 'unknown') {
      unknown.push(token);
    } else {
      predicates.push(kind);
    }
  }
  return { terms, predicates, unknown };
}

/** Per prefix: does this name exist, and what predicate is it then. */
const PREFIX_RULES: Readonly<
  Record<string, (name: string) => PredicateKey | undefined>
> = {
  mcp: (name) => (MCP_NAMES.has(name) ? (`mcp-${name}` as PredicateKey) : undefined),
  has: (name) => (HAS_KEYS.has(name) ? (name as PredicateKey) : undefined),
  is: (name) => (name === 'ephemeral' ? 'ephemeral' : undefined),
};

/** What one token is: free text, a known predicate, or predicate syntax nobody recognises. */
function classify(token: string): PredicateKey | 'term' | 'unknown' {
  const match = /^(has|is|mcp):(.+)$/.exec(token);
  if (match === null) {
    return 'term';
  }
  return PREFIX_RULES[match[1]](match[2]) ?? 'unknown';
}

/** Whether this node satisfies EVERY predicate. Folders satisfy none — capabilities are per entry. */
export function matchesPredicates(
  node: TreeNode,
  predicates: readonly PredicateKey[],
  caps: CapabilityContext,
): boolean {
  return predicates.every((predicate) => matchesOne(node, predicate, caps));
}

// eslint-disable-next-line complexity
function matchesOne(node: TreeNode, predicate: PredicateKey, caps: CapabilityContext): boolean {
  if (node.type !== 'entity') {
    return false;
  }
  const d = node.details;
  switch (predicate) {
    case 'totp': return d?.hasTotp === true;
    case 'cli': return caps.hasAlias(node);
    case 'env': return Object.keys(d?.envBindings ?? {}).length > 0;
    case 'code-access': return d?.configKeyHash !== undefined;
    case 'ephemeral': return d?.expiresAt !== undefined || d?.burnPolicy !== undefined;
    case 'deps': return (d?.dependsOn ?? []).length > 0;
    case 'attachment': return d?.attachmentFileName !== undefined;
    case 'image': return d?.imageFileName !== undefined;
    default: {
      const index = MCP_NAMES.get(predicate.slice('mcp-'.length));
      if (index === undefined) {
        return false;
      }
      const access = caps.mcpAccess(node);
      return MCP_SWITCHES[index].on(access);
    }
  }
}
