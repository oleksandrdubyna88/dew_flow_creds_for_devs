import { AuditEntry, parseAuditLine } from './agentAuditLog';
import { NO_GENERATOR_OUTCOME } from './secretKinds';

/**
 * The MCP journal: what an agent asked this window for, and what it was told.
 *
 * <p><b>A view, not a second store.</b> The broker already writes one line per call into
 * `agent-*.log`, a file per run inside a folder per day, swept after a fortnight. Those lines
 * now say which door a call came through, so "everything an agent did" is a filter over a file
 * that already exists — history between sessions comes free, the sweep already works, and no
 * second place appears that could disagree with the first. Inventing one would be exactly the
 * drift the shared logging rule was written against.</p>
 *
 * <p>Pure: it takes text and gives back rows. What reads the folder is the panel.</p>
 */

export interface McpLogRow extends AuditEntry {
  /** The day the file was filed under, so a row from Tuesday says Tuesday. */
  day: string;
}

/**
 * The rows an agent produced, out of one file's text.
 *
 * <p>Lines that do not parse are skipped rather than shown as a half-filled row. The folder is
 * swept but not versioned, so a fortnight after any format change it holds both shapes; a row
 * claiming an entity called `(…)` because a parse half-worked is worse than a line left out.</p>
 */
export function mcpRowsIn(text: string, day: string): McpLogRow[] {
  return text
    .split('\n')
    .map((line) => parseAuditLine(line.trim()))
    .filter((entry): entry is AuditEntry => entry !== undefined && entry.via === 'mcp')
    .map((entry) => ({ ...entry, day }));
}

/** What the view can narrow to. Each answers one question a person actually has. */
export type McpLogFilter = 'all' | 'refused' | 'rotations' | 'agentSecrets' | 'noGenerator';

export const MCP_LOG_FILTERS: readonly { id: McpLogFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'Everything', hint: 'Every call an agent made through MCP.' },
  {
    id: 'refused',
    label: 'Refused',
    hint: 'What it asked for and did not get — a switch that is off, a prompt you declined, a prompt nobody answered.',
  },
  {
    id: 'rotations',
    label: 'Secrets replaced',
    hint: 'Every secret an agent rotated. The value passed through this window and never through the agent.',
  },
  {
    id: 'agentSecrets',
    label: 'Secrets from the agent',
    hint: 'Entries an agent created and supplied the secret for — the only calls where a value passed through its context. The price of that level, counted.',
  },
  {
    id: 'noGenerator',
    label: 'Could not generate',
    hint: 'What an agent asked this window to make and it could not — the map of where the generators stop, and where an agent is next tempted to fill in for them.',
  },
];

/**
 * The outcomes that mean "no".
 *
 * <p>Matched against the broker's own error codes rather than by looking for the word "denied":
 * a refusal reads `denied`, `consent_timeout`, `not_supported`, `invalid_request` and half a
 * dozen more, and a view that only caught the obvious one would quietly under-report the exact
 * thing somebody opened it to count.</p>
 */
const REFUSALS = new Set([
  'denied',
  'consent_timeout',
  'not_supported',
  'not_found',
  'invalid_request',
  'no_credential',
  'too_many_requests',
  'tool_missing',
  'unauthorized',
  'payload_too_large',
  'internal',
]);

export function isRefusal(row: AuditEntry): boolean {
  return REFUSALS.has(row.outcome);
}

/** A rotation that actually happened — an attempt that was refused is a refusal, not a rotation. */
export function isRotation(row: AuditEntry): boolean {
  return row.action === 'rotate' && !isRefusal(row);
}

/**
 * A secret that travelled through the agent's context.
 *
 * <p>The one number in this view that is a cost rather than an activity. Every level of this
 * product is built so that no secret passes through an agent — except creation, where the agent
 * provisioned the thing and is the only party holding the value. Counting them is how that trade
 * stays visible instead of becoming a habit.</p>
 */
export function isAgentSecret(row: AuditEntry): boolean {
  return row.outcome === 'created with agent secret';
}

/**
 * A secret this window was asked for and could not make.
 *
 * <p>The other half of the same question, and the more useful half: every one of these is a place
 * where an agent's next move is to generate the value itself and hand it over. Counting them is
 * how the shape of that gap stays visible — a run of certificate refusals is a feature request
 * with evidence attached, and a run of them followed by agent-supplied secrets is a leak of
 * exactly the kind this product exists to avoid.</p>
 */
export function isNoGenerator(row: AuditEntry): boolean {
  return row.outcome === NO_GENERATOR_OUTCOME;
}

export function applyFilter(rows: readonly McpLogRow[], filter: McpLogFilter): McpLogRow[] {
  const match = MATCHERS[filter];
  return match === undefined ? [...rows] : rows.filter((row) => match(row));
}

const MATCHERS: Partial<Record<McpLogFilter, (row: AuditEntry) => boolean>> = {
  refused: isRefusal,
  rotations: isRotation,
  agentSecrets: isAgentSecret,
  noGenerator: isNoGenerator,
};

/**
 * What the view says when there is nothing to show.
 *
 * <p>Three different silences, and telling them apart is most of this feature's usefulness: a
 * vault nobody opened to an agent, an agent that has not called yet, and a filter that matched
 * nothing are three situations with three different next steps.</p>
 */
export function emptyMessage(filter: McpLogFilter, totalRows: number): string {
  if (totalRows === 0) {
    return 'No agent has called this window yet. Entries are invisible to agents until you turn on Agent access for one.';
  }
  return EMPTY[filter] ?? 'No secrets have been replaced by an agent.';
}

/** One sentence per filter, because "nothing here" means a different thing in each. */
const EMPTY: Partial<Record<McpLogFilter, string>> = {
  refused: 'Nothing was refused — every call an agent made was allowed.',
  agentSecrets:
    'No secret has reached the vault from an agent. Every value an agent used was held by this window.',
  noGenerator:
    'Nothing was asked for that this window could not make. The generators have covered everything an agent has wanted.',
};
