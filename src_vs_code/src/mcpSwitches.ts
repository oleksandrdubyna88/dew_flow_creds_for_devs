import { DepColorKey } from './depColors';
import { ASK_POLICIES, McpAccess, McpAskPolicy, askPolicy } from './mcpAccess';
import { escapeHtml } from './webviewHtml';

/**
 * The ten switches of the Agent access section, in ladder order — the one list the form's
 * markup, its page script and the viewer's summary are all built from. (Six when this was
 * written; the four folder rungs joined them, and the count in this sentence had not.)
 *
 * <p>Six of them are in the bar, and those six carry five colours: the two delete scopes share
 * one, because the tree's five stripes answer "can an agent delete here" and the scope is a
 * question only the form asks. That sharing is deliberate and is why `color` is a field here
 * rather than an index.</p>
 *
 * <p>Each carries its own <b>why</b>. A permission whose consequence is not written beside it is
 * a permission granted by shrug, and this is the section where that matters most.</p>
 *
 * <p><b>The ask policy (#95) is NOT in this list</b>, and that is load-bearing rather than tidy.
 * `searchPredicates.ts` maps every entry here to a search predicate name and THROWS at module load
 * for one it does not know, so a cadence added to this list would break every search in the product
 * at startup; `MCP_BAR_COLORS` and `accessMask` are the width of the tree icon's stripes. A switch
 * says what an agent MAY do; the policy says how often a person is asked before it does. Two
 * questions, two lists, and {@link MCP_ASK_CHOICES} is the other one.</p>
 */

export interface McpSwitch {
  id: string;
  label: string;
  why: string;
  color: DepColorKey;
  /** Is this switch on, for an access already run through the ladder? */
  on(access: McpAccess): boolean;
  /**
   * Does this switch get a stripe in the bar? Default yes.
   *
   * <p>The folder rungs do not. Every bit doubles the generated glyph set — five bits is 32
   * icons, eight would be 256 — and the badge answers a question about the row a person is
   * looking at, which for an entry is its credential. The folder rungs are shown where they are
   * decided: in the form.</p>
   */
  inBar?: boolean;
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
  {
    id: 'mcpFolderEdit',
    label: 'Agents may rename and move folders',
    why: 'Renaming, moving and retyping a folder — never its Agent access switches. A permission that could change permissions would be a permission to grant itself every other one. A folder can only be moved somewhere the same grant already reaches.',
    color: 'depColor2',
    inBar: false,
    on: (a) => a.folderEdit === true,
  },
  {
    id: 'mcpFolderCreate',
    label: 'Agents may create folders',
    why: 'For an agent putting what it provisioned somewhere sensible instead of dropping it in the first folder you left open.',
    color: 'depColor7',
    inBar: false,
    on: (a) => a.folderCreate === true,
  },
  {
    id: 'mcpFolderDeleteOwn',
    label: 'Agents may delete folders they created',
    why: 'Tidying up after itself. To the Trash, so it is reversible — but a folder takes its whole contents with it.',
    color: 'depColor3',
    inBar: false,
    on: (a) => a.folderDelete === 'own',
  },
  {
    id: 'mcpFolderDeleteAny',
    label: 'Agents may delete any folder here',
    why: 'Including folders you made yourself, and everything inside them. The widest grant on this page: read it twice.',
    color: 'depColor3',
    inBar: false,
    on: (a) => a.folderDelete === 'any',
  },
];

/**
 * One of the four answers to *how often should I be asked before an agent uses this* (#95).
 *
 * <p>Shaped like {@link McpSwitch} and deliberately apart from it: same `why`-beside-the-control
 * discipline, but a cadence is not a permission and the two lists are read by different code.</p>
 */
export interface McpAskChoice {
  id: string;
  /**
   * What this choice stores. `undefined` is Inherit — no answer of its own.
   *
   * <p>Absence is the model's way of saying "ask the folder", so Inherit is not a fourth policy
   * but the removal of one. What the PAGE posts for it is `null`, because `JSON.stringify` drops
   * `undefined` and the reader has to see the key to know the answer was taken back.</p>
   */
  value: McpAskPolicy | undefined;
  label: string;
  why: string;
}

/** The hint above the group: what the cadence covers, and what it never covers. */
export const MCP_ASK_HINT =
  'How often to confirm before an agent USES this — running a command, a query, a VPN, an export. ' +
  'Creating and deleting always ask, whatever this says.';

/** The value the Inherit radio carries on the wire. One spelling, read by the page script. */
export const MCP_ASK_INHERIT = 'inherit';

/**
 * What a record would inherit, and from where — the shape BOTH forms take.
 *
 * <p>One exported type rather than the same anonymous object written in three places. Structural
 * typing would let a field be added on one side and silently omitted by the other, which for this
 * shape means the entity form and the folder form telling a person different things about one
 * ancestry.</p>
 */
export interface InheritedAsk {
  ask: McpAskPolicy;
  from: string;
}

/**
 * Every policy, each with its control — and a fourth one added to {@link McpAskPolicy} without a
 * row here is a COMPILE error rather than a label that quietly reads "ask every time".
 *
 * <p>A `Record` keyed by the policy is what buys that. It was a `find` over a list with a `??`
 * fallback, which is the shape where a policy the door enforces and a label the form shows drift
 * apart in silence — an older build would have told somebody `every24h` meant ask every time while
 * the door asked once a day.</p>
 */
const ASK_CONTROLS: Record<McpAskPolicy, Omit<McpAskChoice, 'value'>> = {
  always: {
    id: 'mcpAskAlways',
    label: 'Ask every time',
    why: 'Today’s behaviour, and the default. Every use raises a dialog naming the entry and the command.',
  },
  every12h: {
    id: 'mcpAskEvery12h',
    label: 'Ask once every 12 hours',
    why: 'One dialog covers the next twelve hours on this machine only — it is never synced or shared. Turning a switch on afterwards asks again, because a wider grant is not the one you agreed to.',
  },
  never: {
    id: 'mcpAskNever',
    label: 'Never ask',
    why: 'The switches above become the whole gate: nothing else stands between an agent and this entry. Every call is still recorded in the journal, and creating and deleting still ask.',
  },
};

const INHERIT_CHOICE: McpAskChoice = {
  id: 'mcpAskInherit',
  value: undefined,
  label: 'Inherit from the folder',
  why: 'No answer of its own. Whatever the folder above says applies here, and it keeps applying when that changes.',
};

export const MCP_ASK_CHOICES: readonly McpAskChoice[] = [
  INHERIT_CHOICE,
  ...ASK_POLICIES.map((policy) => ({ value: policy, ...ASK_CONTROLS[policy] })),
];

/**
 * The radio group, with exactly one checked and the Inherit option saying what it inherits.
 *
 * <p>A control labelled "Inherit" that does not name what it inherits is one a person has to leave
 * the page to understand — and when nothing above answers it does not say "inherit" at all, because
 * there is nothing to inherit from. It is never disabled even then: taking back a local answer is
 * what that option is for, including on a folder with no parent.</p>
 */
export function mcpAskHtml(local: unknown, inherited?: InheritedAsk): string {
  // Through the SAME reader the resolver uses. The stored value arrives by sync and by import, so
  // it is not guaranteed to be a word this build knows — and `askPolicy` maps an unrecognised one
  // to `always`, which is what the door will enforce. A form checking nothing, or checking Inherit,
  // would be telling somebody the opposite of what is about to happen.
  const shown = askPolicy(local);
  const rows = MCP_ASK_CHOICES.map((choice) => {
    const label = choice.value === undefined ? inheritLabel(inherited) : choice.label;
    return `<div class="check">
      <input id="${choice.id}" name="mcpAsk" type="radio" class="mcpSwitch depColor4"
             value="${choice.value ?? MCP_ASK_INHERIT}"${choice.value === shown ? ' checked' : ''}>
      <label for="${choice.id}">${escapeHtml(label)}</label>
    </div>
    <p class="hint mcpWhy">${escapeHtml(choice.why)}</p>`;
  }).join('');
  return `<p class="hint">${escapeHtml(MCP_ASK_HINT)}</p>${rows}`;
}

/**
 * What this record has decided, said PER AXIS in one line (#95).
 *
 * <p>Four states, because there are two axes and each is answered on its own: an entry can hold its
 * own switches while taking its cadence from a folder three levels up. One line rather than two, so
 * an untouched entry reads as one sentence instead of the same sentence twice.</p>
 *
 * <p>It replaced `mcp !== undefined`, which is true for a record holding only a cadence — so a form
 * driven by it claimed the SWITCHES were set here while they were inherited, which is the defect the
 * folder form's code round found on the other side of the same question.</p>
 */
export function mcpSetSentence(ladder: boolean, policy: boolean): string {
  if (ladder) {
    return policy ? 'Set on this entry.' : 'Switches set on this entry. Its consent setting follows the folder.';
  }
  return policy ? 'Consent set on this entry. Its switches follow the folder.' : NOTHING_SET_HERE;
}

const NOTHING_SET_HERE =
  'Not set here — this entry follows its folder. Touching a switch or the consent setting decides that half here.';

/** The Inherit option's label: what it would inherit, or that there is nothing above to inherit. */
function inheritLabel(inherited: InheritedAsk | undefined): string {
  if (inherited === undefined) {
    return 'Not set here — nothing above answers, so: ask every time';
  }
  return `Inherit from the folder — "${inherited.from}" says: ${askWords(inherited.ask)}`;
}

/**
 * One wording for each policy, taken from its own label, so a rename cannot leave two spellings.
 *
 * <p>No fallback, and none is reachable: the key is `McpAskPolicy` and {@link ASK_CONTROLS} is
 * exhaustive over it, so a policy with no wording does not compile. A fallback here would be the
 * silent half of the drift the `Record` exists to prevent.</p>
 */
export function askWords(ask: McpAskPolicy): string {
  return ASK_CONTROLS[ask].label.toLowerCase();
}

/**
 * The stripes, in ladder order, with the two delete scopes merged into one.
 *
 * <p>Derived from the switches rather than written beside them: a sixth colour added to
 * `MCP_SWITCHES` appears here, and a duplicate does not. The list is the same length as
 * `accessMask`, which is what the tree icon and the viewer are generated from — the number five
 * is stated once, in the shape of the ladder, and never typed again.</p>
 */
export const MCP_BAR_COLORS: readonly DepColorKey[] = [
  ...new Set(MCP_SWITCHES.filter((s) => s.inBar !== false).map((s) => s.color)),
];

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
