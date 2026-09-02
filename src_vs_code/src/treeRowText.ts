import { DEFAULT_SSH_PORT } from './sshCommand';
import { hasLifetime } from './entityExpiry';
import { normalizeTags } from './sshOptions';
import { EntityMetadata, TreeNode } from './types';
import { canConnectSsh } from './entityKind';
import { isVpnStartable } from './vpnCommand';

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

/** A folder row's context value: `folder`, or `folder:trashed` inside the Trash (Restore leads). */
export function folderContextValue(trashed: boolean): string {
  return trashed ? 'folder:trashed' : 'folder';
}

/**
 * The colon-joined capability tokens a row's context menu is keyed on — `entity:ssh:pwd`,
 * `entity:vpn:vpnrun:shareable`, and so on. Every `viewItem` regex in `package.json` reads this
 * string, so it decides which of the forty-odd commands are offered on a row.
 *
 * <p>Moved out of `getTreeItem` because an entity is about to be renderable in TWO places: its
 * own row, and again under whatever it is a dependency of. Those two rows must offer the same
 * menu — an entity you can Connect to is one you can Connect to wherever you are looking at it
 * from — and the only way to guarantee that is one implementation, not two ladders that agree
 * today. It is pure, so it is now a unit test rather than something reachable only through a
 * stubbed `vscode`.</p>
 */
/**
 * `:mixed` on a record with a woven field — what hides *Edit* from the menu.
 *
 * <p>The form would put the woven value where the original belongs and a save would weave it again.
 * `entityEditCommands` refuses as well; this only stops the person being OFFERED something that will
 * be refused. See `mixedFieldGuard.ts`.</p>
 */
function mixedToken(details: EntityMetadata | undefined): string {
  return details?.hasMixedField === true ? ':mixed' : '';
}

// eslint-disable-next-line complexity -- one branch per capability; moved verbatim from treeDataProvider
export function entityContextValue(
  details: EntityMetadata | undefined,
  hasPassword: boolean,
  /** Whether a bridge is open to this entry right now — see the `:bridged` pair below. */
  bridged: boolean = false,
  /** In the Trash: *Restore* leads the menu (the owner, 2026-08-28). */
  trashed: boolean = false,
): string {
  let contextValue = trashed ? 'entity:trashed' : 'entity';
  // One named predicate instead of two spellings of "is this SSH?" — the tree used to ask
  // `details.host` here while `kindOf` asked `isSshEnabled` (audit S5).
  if (canConnectSsh(details)) {
    contextValue += ':ssh';
    // Two tokens, the same shape as the agent pair above, and for the same reason: the menu
    // must offer *Open Remote Bridge…* or *Close Remote Bridge*, never both and never the
    // wrong one. It used to offer "open" while a bridge was running — the command toggled and
    // the title did not, so somebody looking for "close" found nothing and had to click
    // "open" on an open bridge to reach the choice hidden behind it.
    //
    // A single `:bridged` would leave the open item needing "ssh and NOT bridged", which VS
    // Code expresses awkwardly and which shows BOTH items on any row whose value is stale.
    contextValue += bridged ? ':bridged' : ':nobridge';
  }
  if (details?.isSshKey) {
    contextValue += ':key';
    // Two tokens rather than one, so Add and Remove are each offered only when they mean
    // something — the same shape the VPN start/stop pair uses.
    contextValue += details.sshAgent === true ? ':agenton' : ':agentoff';
  }
  if (details?.isVpn) {
    contextValue += ':vpn';
    if (isVpnStartable(details.vpnType)) {
      contextValue += ':vpnrun';
    }
  }
  if (details?.isDb) {
    contextValue += ':db';
  }
  if (details?.isTerminal) {
    contextValue += ':cmd';
  }
  if (details?.isScript) {
    contextValue += ':script';
  }
  if (details?.isConfig) {
    contextValue += ':config';
    // Two tokens rather than one, so Enable and Revoke are each offered only when they mean
    // something — the same shape the SSH-agent and VPN start/stop pairs use.
    contextValue += details.configKeyHash === undefined ? ':codeoff' : ':codeon';
  }
  if (details?.isPayment) {
    contextValue += ':payment';
  }
  if (hasPassword) {
    contextValue += ':pwd';
  }
  // From the plaintext flag, never from SecretStorage: the seed's presence is metadata,
  // the seed is not.
  if (details?.hasTotp === true) {
    contextValue += ':totp';
  }
  contextValue += mixedToken(details);
  if (hasLifetime(details ?? {})) {
    // Burn Now… is offered on exactly these rows (the owner, 2026-08-28).
    contextValue += ':burnable';
  }
  return isShareable(details, hasPassword) ? `${contextValue}:shareable` : contextValue;
}

/**
 * One suffix the menu can test, rather than a lookahead regex in `package.json` doing the
 * inclusion AND the sshkey exclusion — which nothing could test and nobody could read.
 */
// eslint-disable-next-line complexity -- a disjunction over the kinds that can be shared
function isShareable(details: EntityMetadata | undefined, hasPassword: boolean): boolean {
  return (
    details !== undefined &&
    details.isSshKey !== true &&
    (Boolean(details.host) ||
      details.isDb === true ||
      (details.isVpn === true && isVpnStartable(details.vpnType)) ||
      details.isTerminal === true ||
      details.isScript === true ||
      // Named explicitly rather than left to follow from `hasPassword`: a config HAS no password,
      // and until the body travelled, an entry that became shareable through a leftover one
      // delivered the password and left the document behind.
      details.isConfig === true ||
      // Named for the same reason `config` is: a payment instrument HAS no password
      // (`keepsPassword` refuses one), so it would never become shareable through `hasPassword`
      // — and a card is exactly the thing somebody sends a colleague. The CVV and the PIN are
      // stripped on the way out; that is `paymentRedaction.ts`'s job, not this predicate's.
      details.isPayment === true ||
      hasPassword)
  );
}

/**
 * A config whose body does not parse, said in the one channel a tree row has left.
 *
 * <p>`!!!` in front of the name. The icon already carries the agent-access ladder and the row
 * decoration already carries dependency colour, and `depDecorations.ts` states the rule both of
 * those follow: one channel carrying two meanings tells you neither. The label is what remains,
 * and three marks read as an alarm at any width, in any theme, without a colour that a
 * high-contrast theme might flatten.</p>
 *
 * <p>Pure, so what the row says is a unit test rather than something seen by clicking.</p>
 */
export function markInvalid(name: string, invalid: boolean): string {
  return invalid ? `!!!-${name}` : name;
}
