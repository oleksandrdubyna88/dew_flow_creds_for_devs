import { DepColorKey } from './depColors';
import { McpAccess } from './mcpAccess';

/**
 * The six switches of the Agent access section, in ladder order — the one list the form's
 * markup, its page script and the viewer's summary are all built from.
 *
 * <p>Six switches, five colours: the two delete scopes share one, because the tree's five
 * stripes answer "can an agent delete here" and the scope is a question only the form asks. That
 * sharing is deliberate and is why `color` is a field here rather than an index.</p>
 *
 * <p>Each carries its own <b>why</b>. A permission whose consequence is not written beside it is
 * a permission granted by shrug, and this is the section where that matters most.</p>
 */

export interface McpSwitch {
  id: string;
  label: string;
  why: string;
  color: DepColorKey;
  /** Is this switch on, for an access already run through the ladder? */
  on(access: McpAccess): boolean;
}

export const MCP_SWITCHES: readonly McpSwitch[] = [
  {
    id: 'mcpView',
    label: 'Visible to agents',
    why: 'The agent learns this entry exists and sees its non-secret half — name, host, user, port, notes. Never a password, a key, or a connection string with one in it.',
    color: 'depColor5',
    on: (a) => a.view === true,
  },
  {
    id: 'mcpUse',
    label: 'Usable by agents',
    why: 'The agent may ask for an action — run a command on this host, run a query on this database — and you confirm it. The secret is never handed over.',
    color: 'depColor4',
    on: (a) => a.use === true,
  },
  {
    id: 'mcpEdit',
    label: 'Agents may replace the secret',
    why: 'For rotation. The extension generates the new value and the agent never sees it — nor the old one. The previous value goes into this entry’s history.',
    color: 'depColor2',
    on: (a) => a.edit === true,
  },
  {
    id: 'mcpCreate',
    label: 'Agents may create entries',
    why: 'For an agent that provisions something and wants to store the credential it just made.',
    color: 'depColor7',
    on: (a) => a.create === true,
  },
  {
    id: 'mcpDeleteOwn',
    label: 'Agents may delete what they created',
    why: 'Tidying up after itself. Deleted entries go to the Trash, so this is reversible.',
    color: 'depColor3',
    on: (a) => a.delete === 'own',
  },
  {
    id: 'mcpDeleteAny',
    label: 'Agents may delete anything here',
    why: 'Including entries you made yourself. Still only as far as the Trash — but a Trash that empties on a timer is a delay, not a veto.',
    color: 'depColor3',
    on: (a) => a.delete === 'any',
  },
];

/**
 * The stripes, in ladder order, with the two delete scopes merged into one.
 *
 * <p>Derived from the switches rather than written beside them: a sixth colour added to
 * `MCP_SWITCHES` appears here, and a duplicate does not. The list is the same length as
 * `accessMask`, which is what the tree icon and the viewer are generated from — the number five
 * is stated once, in the shape of the ladder, and never typed again.</p>
 */
export const MCP_BAR_COLORS: readonly DepColorKey[] = [...new Set(MCP_SWITCHES.map((s) => s.color))];

/**
 * The bar, from a mask.
 *
 * <p>One builder for all three surfaces — the entity form, the folder form and the read-only
 * viewer. The form's copy used to map the SWITCHES and so drew six segments while the page
 * script repainted five, leaving the last one frozen at whatever it was when the form opened.
 * Nothing here is escaped because nothing here is user text: the only variable is a boolean.</p>
 */
export function mcpBarHtml(mask: readonly boolean[]): string {
  const segs = MCP_BAR_COLORS.map(
    (color, i) => `<span class="mcpSeg ${color}${mask[i] === true ? ' mcpSegOn' : ''}"></span>`,
  ).join('');
  return `<div class="mcpBar" aria-hidden="true">${segs}</div>`;
}

/** The CSS that paints each control in its own colour and nothing else in it. */
export function mcpSwitchStyles(): string {
  const swatch = (key: DepColorKey): string =>
    `var(--vscode-credSshManager-${key}, var(--vscode-focusBorder, #007fd4))`;
  const seen = new Set<DepColorKey>();
  const rules: string[] = [];
  for (const entry of MCP_SWITCHES) {
    if (seen.has(entry.color)) {
      continue;
    }
    seen.add(entry.color);
    rules.push(`.mcpSwitch.${entry.color} { accent-color: ${swatch(entry.color)}; }`);
    rules.push(`.mcpSeg.${entry.color} { background: ${swatch(entry.color)}; }`);
  }
  return rules.join('\n  ');
}
