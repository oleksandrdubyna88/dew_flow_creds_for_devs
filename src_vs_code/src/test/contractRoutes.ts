/**
 * Every route `contract/broker-v1.json` names, enumerated from the file itself (E1.3, S1 and S2).
 *
 * <p>Not a test file: `node:test` is pointed at `*.test.js` only. It reads the contract the way a second
 * implementation does, by its keys, and then scans every string in the file for one that starts with `/v1/` and
 * is in neither the list nor a known prefix, so a route filed under a key nobody has seen yet still turns up,
 * with its name. A table of served routes that is checked against a hand-typed list would agree with the list
 * and miss the third entry.</p>
 */

interface Named {
  readonly health: { readonly path: string };
  readonly reads: Readonly<Record<string, { readonly path: string }>>;
  readonly configRead: { readonly path: string };
  readonly routes: Readonly<Record<string, string>>;
  readonly mcpDeleteRoute: string;
  readonly mcpCreateRoute: string;
  readonly aliasPrefix: string;
  readonly mcpUsePrefix: string;
  readonly mcpActions: readonly string[];
  readonly mcpFolderPrefix: string;
  readonly mcpFolderActions: readonly string[];
}

const USE_PREFIX = '/v1/use/';

/** The prefixes the contract names; a string equal to one of them is a prefix, not a route. */
function prefixes(contract: Named): string[] {
  return [contract.aliasPrefix, contract.mcpUsePrefix, contract.mcpFolderPrefix];
}

/** Every concrete route the contract names, without repeats. */
export function contractRoutes(contract: unknown): string[] {
  const c = contract as Named;
  const useRoutes = [...new Set(Object.values(c.routes))];
  const found = [
    c.health.path,
    ...Object.values(c.reads).map((read) => read.path),
    c.configRead.path,
    ...useRoutes,
    c.mcpDeleteRoute,
    c.mcpCreateRoute,
    ...useRoutes.map((route) => c.aliasPrefix + route.slice(USE_PREFIX.length)),
    ...c.mcpActions.map((action) => c.mcpUsePrefix + action),
    ...c.mcpFolderActions.map((action) => c.mcpFolderPrefix + action),
  ];
  return [...new Set(found)];
}

/** Every string anywhere in the value, keys excluded. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  return typeof value === 'object' && value !== null ? Object.values(value).flatMap(strings) : [];
}

/** Strings that look like a route but are neither in the enumerated list nor a known prefix. */
export function strayRoutes(contract: unknown): string[] {
  const known = new Set([...contractRoutes(contract), ...prefixes(contract as Named)]);
  return strings(contract).filter((text) => text.startsWith('/v1/') && !known.has(text));
}

/** Every route the contract names, enumerated or found by the scan, that `table` does not name. */
export function unnamedRoutes(contract: unknown, table: readonly string[]): string[] {
  const named = new Set(table);
  return [...contractRoutes(contract), ...strayRoutes(contract)].filter((route) => !named.has(route));
}

/** The message a route that is in the contract and not in the table fails with (S1). */
export function unnamedMessage(route: string): string {
  return `${route} is in contract/broker-v1.json and not named in bridgeAllowList.ts. Name it: served, or refused and why.`;
}
