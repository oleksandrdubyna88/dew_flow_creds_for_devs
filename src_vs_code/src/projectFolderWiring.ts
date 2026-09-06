import { CorpPolicyState } from './corpPolicy';
import { ProjectFolderHost, ProjectFolderOutcome, applyProjectFolders } from './projectFolderSync';
import { ProjectAssignmentFact, reconcileProjectFolders } from './projectFolders';
import { StoredAccount, TreeNode } from './types';

/**
 * What the reconciler needs from the layers around it, as functions — so this module imports no
 * `vscode` and its ordering is testable with fakes.
 */
export interface ProjectFolderDeps {
  readonly nodesOf: (accountId: string) => readonly TreeNode[];
  /**
   * Pull and merge this account's vault, BEFORE anything is decided.
   *
   * <p>Not an optimisation — the correctness of the whole reconcile rests on it. The removal
   * instruction is per PERSON, so the first machine to carry it out clears it for every other one;
   * a second machine then reads a document with no assignment and no instruction, and against its
   * own stale nodes that reads as "the assignment quietly ended". It would UNLOCK the folder, and
   * that edit carries a newer version vector than the tombstone — so the merge would resurrect the
   * folder the organisation had removed, unlocked. Pulling first makes the sequence impossible: by
   * the time anything is decided, the tombstone has landed and the node is gone.</p>
   */
  readonly pull: (accountId: string) => Promise<void>;
  readonly host: ProjectFolderHost;
}

/**
 * The callback `refreshOrgPolicy` runs after a SUCCESSFUL read of a person's document: bring this
 * account's project folders in line with what the server just said.
 *
 * <p><b>Only after a successful read</b>, which is why it hangs off that one place rather than off
 * the caller's loop. A failed fetch keeps the previous answer, and reading its absence as "you are
 * on nothing" would unlock every project folder on the machine.</p>
 *
 * <p><b>Nothing at all happens on a personal account.</b> `corpMode` false means the document is the
 * inert default — no assignments, no instructions — and the reconcile answers "nothing to do", which
 * `applyProjectFolders` short-circuits before it touches storage or the network.</p>
 */
export function projectFolderReconciler(
  deps: ProjectFolderDeps,
): (account: StoredAccount, state: CorpPolicyState) => Promise<ProjectFolderOutcome> {
  return async (account, state) => {
    // First, and it throws rather than continuing: a machine that could not pull has nothing
    // trustworthy to reconcile against, and deciding on stale nodes is the hazard above.
    await deps.pull(account.accountId);
    const plan = reconcileProjectFolders(
      deps.nodesOf(account.accountId),
      assignmentsOf(state),
      state.pendingFolderRemovals,
      account.accountId,
    );
    return await applyProjectFolders(account.accountId, plan, deps.host);
  };
}

/**
 * The assignments as the reconcile wants them.
 *
 * <p>`name` is optional on the wire — a server from before epic 3 has no project store to take one
 * from — so an empty string here is the honest reading, and the reconcile gives such a folder a
 * readable fallback name rather than an empty one.</p>
 */
function assignmentsOf(state: CorpPolicyState): ProjectAssignmentFact[] {
  return state.projects.map((p) => ({ projectId: p.projectId, name: p.name ?? '' }));
}

/**
 * The deps as the running extension holds them.
 *
 * <p>Separate from {@link projectFolderReconciler} so the reconciler itself can be tested with
 * fakes: this is the only part that knows about a vault, a server and a window, and it has no
 * decisions in it — everything it does is name which function plays which role.</p>
 */
export function vscodeProjectFolderDeps(
  storage: ProjectFolderStorage,
  sync: ProjectFolderPusher,
  transports: ProjectFolderTransports,
  announce: (message: string) => void,
): ProjectFolderDeps {
  return {
    nodesOf: (accountId) => storage.getNodes(accountId),
    pull: (accountId) => sync.pullAccount(accountId),
    host: {
      addFolder: (accountId, node) => storage.addNode(accountId, node),
      setFields: (accountId, id, patch) => storage.updateNodeFields(accountId, id, patch),
      // The ONE real deletion path — tombstone, node, secrets — so it reaches their other machines.
      deleteRecursive: (accountId, id) => storage.deleteNodeRecursive(accountId, id),
      push: async (accountId) => {
        const account = accountOf(storage, accountId);
        // Reports its failure rather than swallowing it into a toast: an ack after a silently
        // failed push loses the deletion on every other machine of that person.
        await sync.pushAccount(account);
      },
      ack: async (accountId, projectId) => {
        const account = accountOf(storage, accountId);
        const client = transports.orgMembersFor(account);
        if (client === undefined) {
          throw new Error(`No corporate server is configured for ${account.email}.`);
        }
        await client.ackFolderRemoval(account, projectId);
      },
      announce,
      now: () => Date.now(),
    },
  };
}

/** Just the parts of `StorageManager` this needs, so a test can hand over four functions. */
export interface ProjectFolderStorage {
  getNodes: (accountId: string) => readonly TreeNode[];
  getAccounts: () => readonly StoredAccount[];
  addNode: (accountId: string, node: TreeNode) => Promise<void>;
  updateNodeFields: (accountId: string, id: string, patch: Partial<TreeNode>) => Promise<void>;
  deleteNodeRecursive: (accountId: string, id: string) => Promise<string[]>;
}

export interface ProjectFolderPusher {
  pushAccount: (account: StoredAccount) => Promise<void>;
  pullAccount: (accountId: string) => Promise<void>;
}

export interface ProjectFolderTransports {
  orgMembersFor: (account: StoredAccount) => { ackFolderRemoval: (account: StoredAccount, projectId: string) => Promise<void> } | undefined;
}

function accountOf(storage: ProjectFolderStorage, accountId: string): StoredAccount {
  const account = storage.getAccounts().find((a) => a.accountId === accountId);
  if (account === undefined) {
    throw new Error('The account this cycle started for is no longer here.');
  }
  return account;
}
