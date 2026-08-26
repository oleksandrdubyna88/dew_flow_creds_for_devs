import { DEFAULT_SSH_PORT } from './sshCommand';
import { normalizeTags } from './sshOptions';
import { TreeNode } from './types';

/**
 * The grey text beside an entity's name in the tree: what it connects to, and its tags.
 *
 * <p>Carved out of `treeDataProvider.ts` when tags pushed that file past the 800-line limit —
 * and the same reason `entityText.ts` was carved out of `dialogs.ts`: this is a pure function of
 * a node, so as a separate module it is a unit test instead of something only reachable through
 * a stubbed `vscode`.</p>
 *
 * <p>What it renders is the same text the tree filter matches on (`treeSearch.nodeHaystack`),
 * and that is not a coincidence — it is the rule: <b>if the row does not say it out loud, typing
 * it will not find it</b>. Nothing secret belongs in either.</p>
 */

/** `#prod #eu-west` — normalized, so a tag arriving by sync cannot render as anything else. */
export function tagLabel(node: TreeNode): string {
  return normalizeTags(node.details?.tags)
    .map((tag) => `#${tag}`)
    .join(' ');
}

/** What this entity connects to: `user@host:port`, or the kind when there is no host. */
// eslint-disable-next-line complexity -- one branch per entity kind; moved verbatim from treeDataProvider
export function baseTarget(node: TreeNode): string {
  const d = node.details;
  if (d?.isDb && !d.host) {
    return d.dbType ?? 'db';
  }
  if (d?.isVpn && !d.host) {
    return d.vpnType ?? 'vpn';
  }
  if (!d?.host) {
    return '';
  }
  const target = d.user ? `${d.user}@${d.host}` : d.host;
  return d.port !== undefined && d.port !== DEFAULT_SSH_PORT ? `${target}:${d.port}` : target;
}

/** The whole description: the target, then the tags, separated so neither reads as the other. */
export function describeTarget(node: TreeNode): string {
  return [baseTarget(node), tagLabel(node)].filter((part) => part.length > 0).join('  ');
}
