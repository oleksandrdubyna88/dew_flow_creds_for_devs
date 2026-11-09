import type { McpVaultSource } from './mcpEntries';

/**
 * The WHOLE source with `getAccounts` answering one row, every other method delegated by name: how a Remote Bridge's
 * listing and snippet are kept to the account of its context. {@link accountOnly} narrows a `Pick` for the lookups;
 * `visibleMcpEntries` and `visibleConfigDetails` need the secret readers too.
 *
 * <p>A file of its own, classified a CARRIER in `pinReaderBoundary.test.ts`: the five secret getters are only handed on, as
 * functions, to the one reader that asks whether a value exists (`mcpEntries.ts`, whose refusal primitive decides). Beside
 * `accountOnly` it would have been five unexplained reads in a file classified as an automatic reader.</p>
 *
 * <p>Delegated method by method, not spread: a `StorageManager` is a class, a spread of it loses its prototype, and a
 * method pulled off an object loses its `this`. Each call is made ON the source.</p>
 */
export function accountOnlyVault(source: McpVaultSource, accountId: string): McpVaultSource {
  return {
    getAccounts: () => source.getAccounts().filter((account) => account.accountId === accountId),
    getNodes: (account) => source.getNodes(account),
    getNode: (account, id) => source.getNode(account, id),
    getPassword: (account, id) => source.getPassword(account, id),
    getPrivateKey: (account, id) => source.getPrivateKey(account, id),
    getNotes: (account, id) => source.getNotes(account, id),
    getTotp: (account, id) => source.getTotp(account, id),
    getDbConnection: (account, id) => source.getDbConnection(account, id),
  };
}
