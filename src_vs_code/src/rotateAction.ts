import { UseAction, UseActionContext, UseActionResult } from './useActions';
import {
  NEW_SECRET_PLACEHOLDER,
  RotationSlot,
  checkRotation,
  storedValueFor,
  substituteNewSecret,
  summarizeRotation,
} from './secretRotation';
import { EntityMetadata } from './types';
import { Revision } from './revisionHistory';

/**
 * The `rotate` action: the window changes a secret on the far side and then stores it.
 *
 * <p><b>It wraps the action that already exists rather than repeating it.</b> Rotating a
 * database password means running a statement against that database — which `(db, query)` knows
 * how to do, down to keeping the password out of argv and refusing a connection string that
 * could carry command-line options. A second implementation of that would be a second place to
 * get any of it wrong. So this generates, substitutes, and hands the result to the underlying
 * action; what it adds is the two steps around the outside.</p>
 *
 * <p><b>The order is load-bearing.</b> The far side changes first, and only a success writes the
 * new value here. The other order — store, then run — produces the worst outcome available: a
 * vault holding a password the server never accepted, which looks like a working entry until
 * somebody tries it. And the snapshot goes into history BEFORE the write, so the previous value
 * is recoverable for as long as history keeps it.</p>
 *
 * <p><b>Nobody sees the new secret.</b> Not the agent, which wrote a placeholder; not the
 * person, whose consent prompt shows the statement with the placeholder intact; not the audit
 * line, which records the same summary. The one place it could still escape is the far side's
 * own output — a statement can be composed to echo what it was given — and the broker's masker
 * closes that: by the time the response is masked the new value is stored, so it is in the mask
 * table like any other secret of that entry.</p>
 */

export interface RotateDeps {
  /** Draw a new secret. The extension's own generator; never the agent's. */
  generate(): string;
  /** The live entity, or undefined when it has gone. */
  entity(ctx: UseActionContext): EntityMetadata | undefined;
  /** The value in the slot right now — a password, or a connection string. */
  current(ctx: UseActionContext, slot: RotationSlot): Promise<string | undefined>;
  /** Everything about this entity as it is, for history. */
  snapshot(ctx: UseActionContext, details: EntityMetadata): Promise<Revision>;
  record(ctx: UseActionContext, revision: Revision): Promise<void>;
  store(ctx: UseActionContext, slot: RotationSlot, value: string): Promise<void>;
  /** Called after a successful rotation so the tree and any open viewer catch up. */
  onRotated?: () => void;
}

/** The body field the wrapped action reads its statement from. */
export type StatementField = 'query' | 'command';

/**
 * Wrap one action into its rotating twin.
 *
 * <p>The agent always writes `statement`, whatever the kind — one word to learn — and this maps
 * it onto whichever field the underlying action expects.</p>
 */
export function rotateAction(
  underlying: UseAction,
  field: StatementField,
  deps: RotateDeps,
): UseAction {
  return {
    kind: underlying.kind,
    action: 'rotate',
    verb: 'change the stored secret of',
    describeOutcome: (result) => (result.status === 200 ? 'rotated' : String(result.status)),
    validate: (body) => validateBody(body, underlying.kind),
    // The placeholder stays. A prompt that showed the generated value would put it on a screen,
    // in a screenshot, and in this window's own audit line.
    summarize: (body) => summarizeRotation(statementOf(body)),
    run: (ctx, body) => run(ctx, statementOf(body), underlying, field, deps),
  };
}

function statementOf(body: unknown): string {
  const value = (body as { statement?: unknown }).statement;
  return typeof value === 'string' ? value : '';
}

function validateBody(body: unknown, kind: string): { ok: true } | { ok: false; message: string } {
  const statement = statementOf(body);
  if (statement.length > 8000) {
    return { ok: false, message: 'That statement is too long (8000 characters maximum).' };
  }
  const checked = checkRotation(statement, kind);
  return checked.ok ? { ok: true } : { ok: false, message: checked.message };
}

/**
 * Generate, run, and only then store.
 *
 * <p>Every refusal below happens before a secret is generated where it can, because generating
 * one and then discovering the request was malformed would leave a value nobody asked for in a
 * history nobody expected to grow.</p>
 */
async function run(
  ctx: UseActionContext,
  statement: string,
  underlying: UseAction,
  field: StatementField,
  deps: RotateDeps,
): Promise<UseActionResult> {
  const ready = await prepare(ctx, statement, underlying.kind, deps);
  if (!ready.ok) {
    return refuse(ready.error);
  }
  const { details, checked, secret, stored } = ready;

  const result = await underlying.run(ctx, { [field]: substituteNewSecret(statement, secret) });
  // The far side did not change, so neither does the vault. Handed back as it came: the
  // statement's own error is what says why, and rewording it here would lose that.
  return succeeded(result)
    ? await commit(ctx, details, checked.slot, stored, result, deps)
    : result;
}

/**
 * Everything that must be true before a statement runs, gathered once.
 *
 * <p>The generate happens LAST of these, so a malformed request never leaves a value nobody
 * asked for in a history nobody expected to grow.</p>
 */
async function prepare(
  ctx: UseActionContext,
  statement: string,
  kind: string,
  deps: RotateDeps,
): Promise<
  | { ok: true; details: EntityMetadata; checked: { slot: RotationSlot }; secret: string; stored: string }
  | { ok: false; error: string }
> {
  const details = deps.entity(ctx);
  if (details === undefined) {
    return { ok: false, error: `"${ctx.entityName}" no longer exists in the vault.` };
  }
  const checked = checkRotation(statement, kind);
  if (!checked.ok) {
    return { ok: false, error: checked.message };
  }
  const secret = deps.generate();
  const stored = storedValueFor(checked.slot, await deps.current(ctx, checked.slot), secret, details.dbType);
  return stored.ok
    ? { ok: true, details, checked, secret, stored: stored.value }
    : { ok: false, error: stored.error };
}

/** History first, then the write, then the tree. Only ever reached by a far side that changed. */
async function commit(
  ctx: UseActionContext,
  details: EntityMetadata,
  slot: RotationSlot,
  value: string,
  result: UseActionResult,
  deps: RotateDeps,
): Promise<UseActionResult> {
  await deps.record(ctx, await deps.snapshot(ctx, details));
  await deps.store(ctx, slot, value);
  deps.onRotated?.();
  return { status: 200, body: { rotated: true, entity: ctx.entityName, output: outputOf(result) } };
}

/**
 * Did the far side actually change?
 *
 * <p>A 200 from the broker means the statement RAN, not that it worked: a database that refuses
 * `ALTER USER` answers with a non-zero exit code inside a perfectly successful call. Storing on
 * a 200 alone is how a vault ends up holding a password the server never accepted.</p>
 */
function succeeded(result: UseActionResult): boolean {
  if (result.status !== 200) {
    return false;
  }
  const exitCode = (result.body as { exitCode?: unknown }).exitCode;
  return exitCode === undefined || exitCode === 0;
}

/** Whatever the statement printed, passed through — the masker takes the secret out of it. */
function outputOf(result: UseActionResult): unknown {
  return (result.body as { stdout?: unknown }).stdout ?? '';
}

function refuse(message: string): UseActionResult {
  return { status: 400, body: { error: { code: 'invalid_request', message } } };
}

/** Re-exported so the tool description and the tests name the same string. */
export { NEW_SECRET_PLACEHOLDER };
