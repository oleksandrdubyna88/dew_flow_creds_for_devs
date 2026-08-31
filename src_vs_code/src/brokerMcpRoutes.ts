import * as http from 'node:http';
import {
  handleFolderCreate,
  handleFolderDelete,
  handleFolderEdit,
  McpFolderHooks,
} from './brokerFolderDoor';
import {
  BrokerDoor,
  McpCreateHooks,
  ReadBody,
  ResolveUse,
  handleMcpCreate,
  handleMcpDelete,
  handleMcpUse,
} from './brokerMcpDoor';
import {
  isMcpCreateRoute,
  isMcpDeleteRoute,
  parseMcpFolderRoute,
  parseMcpUseRoute,
} from './brokerProtocol';

/**
 * Which MCP route this is, and which door answers it.
 *
 * <p>Out of `credsAgentServer.ts` for the reason five other modules already are: that file lives
 * at its 800-line ceiling, and a dispatcher that grows by two lines per verb is exactly the kind
 * of thing that pushes it over. It is also the honest seam — this decides nothing except which
 * handler runs, and every handler it names lives beside it.</p>
 *
 * <p>Answers `false` when the path is none of ours, so the server can carry on to its other
 * routes rather than answering 404 for something it does serve.</p>
 */

/** Everything the routes need from the vault. Each may be absent: a window can serve less. */
export interface McpRouteDeps {
  door: BrokerDoor;
  readBody: ReadBody;
  resolveUse: ResolveUse | undefined;
  moveToTrash: ((accountId: string, entityId: string) => Promise<boolean>) | undefined;
  create: McpCreateHooks | undefined;
  folders: McpFolderHooks | undefined;
}

export async function answerMcpRoute(
  deps: McpRouteDeps,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  const action = parseMcpUseRoute(pathname);
  if (action !== undefined) {
    await handleMcpUse(deps.door, deps.readBody, req, res, action, deps.resolveUse);
    return true;
  }
  return (await answerEntryRoute(deps, req, res, pathname)) || answerFolderRoute(deps, req, res, pathname);
}

/** Delete and create: the two entry routes that are not a use of a credential. */
async function answerEntryRoute(
  deps: McpRouteDeps,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (isMcpDeleteRoute(pathname)) {
    await handleMcpDelete(deps.door, deps.readBody, req, res, deps.resolveUse, deps.moveToTrash);
    return true;
  }
  if (!isMcpCreateRoute(pathname)) {
    return false;
  }
  await handleMcpCreate(deps.door, deps.readBody, req, res, deps.create);
  return true;
}

/**
 * The three folder verbs.
 *
 * <p>The LISTING is deliberately not here. It is a read — no token, no body, nothing performed —
 * and this dispatch is reached only under POST, so filing it here made it answer 404 to the only
 * client that asks for it (0.85.0 through 0.89.0). It lives in `brokerReadRoutes.ts` with the
 * other three routes the contract files under `reads`.</p>
 *
 * <p>Returns a PROMISE of the boolean rather than awaiting inside the caller's `||`, so a folder
 * route still answers when the entry routes did not — the two chains are alternatives, not a
 * sequence.</p>
 */
async function answerFolderRoute(
  deps: McpRouteDeps,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  const verb = parseMcpFolderRoute(pathname);
  if (verb === undefined) {
    return false;
  }
  await runFolderVerb(deps, req, res, verb);
  return true;
}

async function runFolderVerb(
  deps: McpRouteDeps,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  verb: string,
): Promise<void> {
  const handler = FOLDER_HANDLERS[verb];
  await handler(deps.door, deps.readBody, req, res, deps.folders);
}

/**
 * The verb table.
 *
 * <p>A table rather than a chain of `if`s: `parseMcpFolderRoute` already decided which words are
 * routes, and a second list of them here would be the second place to keep in step.</p>
 */
const FOLDER_HANDLERS: Readonly<
  Record<
    string,
    (
      door: BrokerDoor,
      readBody: ReadBody,
      req: http.IncomingMessage,
      res: http.ServerResponse,
      hooks: McpFolderHooks | undefined,
    ) => Promise<void>
  >
> = {
  create: handleFolderCreate,
  edit: handleFolderEdit,
  delete: handleFolderDelete,
};
