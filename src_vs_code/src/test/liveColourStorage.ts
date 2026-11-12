import { DiagnosticWriter } from '../diagnosticWriter';
import { TreeNode } from '../types';
import { FolderColorFake, WrittenChange, folderColorStorage } from './folderColorStorage';

/**
 * The colour-write half of a test world's storage, over the nodes the world already holds.
 *
 * <p>The worlds of the arrow, the folder run and the VPN launcher keep their nodes in a structure their tests edit in
 * place (a sync, a move, a removal), so those stay the truth for every read. `updateNodeFields` is the shared fake of
 * E1.S2 (`folderColorStorage`: each write recorded, an object or a function patch, one turn per call): before a call the
 * fake is made to hold the world's nodes as they are NOW, and after it the node it changed is handed back to the world.
 * `failNextWrite` makes the next write reject, as a storage that cannot save does.</p>
 */
export interface LiveNodes {
  all(): readonly TreeNode[];
  /** Put this node where the node with its id is. */
  replace(node: TreeNode): void;
}

export interface ColouringStorage {
  getNodes(accountId: string): readonly TreeNode[];
  updateNodeFields(accountId: string, id: string, patch: Partial<TreeNode> | ((node: TreeNode) => Partial<TreeNode>)): Promise<void>;
  /** Every write the fake recorded, in order. */
  readonly written: WrittenChange[];
  /** The next write rejects with this error. */
  failNextWrite(error: Error): void;
}

export function colouringStorage(live: LiveNodes): ColouringStorage {
  const fake: FolderColorFake = folderColorStorage({});
  const holdWhatTheWorldHolds = (accountId: string): void => {
    const now = live.all();
    const ids = new Set(now.map((node) => node.id));
    fake.getNodes(accountId).filter((node) => !ids.has(node.id)).forEach((node) => fake.remove(accountId, node.id));
    now.forEach((node) => fake.put(accountId, node));
  };
  return {
    getNodes: () => live.all(),
    updateNodeFields: async (accountId, id, patch) => {
      holdWhatTheWorldHolds(accountId);
      try {
        await fake.updateNodeFields(accountId, id, patch);
      } finally {
        const after = fake.getNode(accountId, id);
        if (after !== undefined) {
          live.replace(after);
        }
      }
    },
    written: fake.written,
    failNextWrite: (error) => fake.failNextWrite(error),
  };
}

/** One line a world's diagnostic log got. */
export interface LogLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly source: string;
  readonly message: string;
}

/** A `DiagnosticWriter` that keeps what it is given, in order. */
export function recordingLog(): { readonly log: DiagnosticWriter; readonly lines: LogLine[] } {
  const lines: LogLine[] = [];
  const at = (level: LogLine['level']) => (source: string, message: string): void => {
    lines.push({ level, source, message });
  };
  return { log: { info: at('info'), warn: at('warn'), error: at('error') }, lines };
}
