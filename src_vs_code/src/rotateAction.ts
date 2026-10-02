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
import { DrawOptions, GenerationOutcome, NO_GENERATOR_OUTCOME } from './secretKinds';
import { readSecretOptions } from './mcpSecretOptions';
import { Revision } from './revisionHistory';
import { pinFieldRefusal } from './pinGate';
import { unsealedText } from './secretOpener';
import type { StoredSecret } from './storedSecret';
import { MaskEntry, buildMaskTable, maskResponseBody, maskText } from './secretMasker';
import { describeError } from './describeError';
import { Fingerprint, fingerprintOf } from './rotationQuarantine';

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
 * own output — a statement can be composed to echo what it was given. The rotation closes that
 * ITSELF, with the values it holds (`maskedAnswer`): the drawn secret and the stored form are masked
 * out of whatever it answers, stored or not, succeeded or not. The broker's masker could not — it
 * reads the entry's values after the run, and a value stored sealed under a PIN, held outside the
 * entry or stored nowhere is in no table it can build (rotation-quarantine plan §4.8, Q1).</p>
 */

export interface RotateDeps {
  /**
   * Draw a new secret of this kind — the extension's own generator, never the agent's.
   *
   * <p>Answers a refusal rather than throwing for a kind it does not make. That refusal is not a
   * failure of the request: it is the map of where an agent will be tempted to fill in for us,
   * which is why the journal counts it.</p>
   */
  generate(kind: string, options?: DrawOptions): GenerationOutcome;
  /** The live entity, or undefined when it has gone. */
  entity(ctx: UseActionContext): EntityMetadata | undefined;
  /**
   * The value in the slot right now, AS STORED — a password, or a connection string. `protectedSlot`
   * refuses a sealed one (or any of a marked entry) before anything else; what `draw` rebuilds is read
   * through `unsealedText`.
   */
  current(ctx: UseActionContext, slot: RotationSlot): Promise<StoredSecret | undefined>;
  /** Everything about this entity as it is, for history. */
  snapshot(ctx: UseActionContext, details: EntityMetadata): Promise<Revision>;
  record(ctx: UseActionContext, revision: Revision): Promise<void>;
  /**
   * Put the new value into the vault. Resolves `stored` when it is there, `quarantined` when the entry
   * refused it and it is held beside the entry until its PIN is entered (`rotationQuarantine.ts`); rejects
   * with {@link RotationNotStored} when even that failed and it was handed to the PERSON instead
   * (`rotationStore.ts`) — the far side has changed by then, so the value is never simply dropped. `was` is
   * the fingerprint of the text it replaces (`rotationQuarantine.fingerprintOf`), which a later release checks.
   */
  store(ctx: UseActionContext, slot: RotationSlot, value: string, was: Fingerprint): Promise<StoreOutcome>;
  /** Called after a successful rotation so the tree and any open viewer catch up. */
  onRotated?: () => void;
}

/** Where the new value is once the store returned: in the entry, or held beside it. */
export type StoreOutcome = 'stored' | 'quarantined';

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
    // The one action here that writes a stored secret while it runs — see `UseAction.mutatesSecrets`.
    mutatesSecrets: true,
    verb: 'change the stored secret of',
    describeOutcome: (result) => describeRotation(result),
    validate: (body) => validateBody(body, underlying.kind),
    // The placeholder stays. A prompt that showed the generated value would put it on a screen,
    // in a screenshot, and in this window's own audit line.
    summarize: (body) => summarizeRotation(statementOf(body)),
    run: (ctx, body) => run(ctx, statementOf(body), body, underlying, field, deps),
  };
}

/**
 * What the audit line says happened.
 *
 * <p>`no generator` is its own word rather than a status number, because the journal greps for
 * it: it is the count of what an agent asked us to make and we could not.</p>
 */
function describeRotation(result: UseActionResult): string {
  if (result.status === 200) {
    return JOURNAL_WORDS.get((result.body as { stored?: unknown }).stored) ?? 'rotated';
  }
  return (result.body as { noGenerator?: unknown }).noGenerator === true
    ? NO_GENERATOR_OUTCOME
    : String(result.status);
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
  body: unknown,
  underlying: UseAction,
  field: StatementField,
  deps: RotateDeps,
): Promise<UseActionResult> {
  const ready = await prepare(ctx, statement, underlying.kind, body, deps);
  if (!ready.ok) {
    // A kind we do not make is refused with its own outcome, because the journal counts those:
    // they are the map of where an agent will be tempted to generate the value itself.
    return ready.noGenerator === true ? refuseNoGenerator(ready.error) : refuse(ready.error);
  }
  const values = newValues(ready.checked.slot, ready.secret, ready.stored);
  return ranAndStored(ctx, ready, () => underlying.run(ctx, { [field]: substituteNewSecret(statement, ready.secret) }), deps).then(
    (answer) => maskedAnswer(answer, values),
    (error: unknown) => {
      throw maskedFailure(error, values);
    },
  );
}

/**
 * The statement, and the store only after it SUCCEEDED. The far side did not change, so neither does the
 * vault: its answer is handed back as it came (masked by the caller) — the statement's own error is what says
 * why, and a statement that printed its input and THEN failed may have changed the far side all the same.
 */
async function ranAndStored(ctx: UseActionContext, ready: Ready, runIt: () => Promise<UseActionResult>, deps: RotateDeps): Promise<UseActionResult> {
  const result = await runIt();
  return succeeded(result) ? commit(ctx, ready.details, { slot: ready.checked.slot, value: ready.stored, was: ready.was }, result, deps) : result;
}

/**
 * A rotation that THREW — the far side may have changed before it did — rethrown with the new value taken out
 * of its message (the security review, finding 4). The broker masks a failure's reason with what storage
 * holds, and the new value is in none of it: a driver error that quotes the statement it ran would put the
 * new secret in the journal.
 */
function maskedFailure(error: unknown, values: readonly MaskEntry[]): Error {
  const failure = new Error(maskText(describeError(error), buildMaskTable(values)).text);
  failure.name = error instanceof Error ? error.name : 'Error';
  return failure;
}

/**
 * The rotation's answer with the new value taken out of every field (rotation-quarantine plan §4.8, Q1).
 *
 * <p>Here and not in the broker, because only here is the value in hand: stored under a PIN it is sealed
 * (`maskEntries` cannot read a sealed value, by design), and handed to the person it is stored nowhere —
 * so the post-run table the broker builds holds the OLD value and not the new one, and a statement
 * composed to echo its input handed the agent the very secret this action exists to keep from it.</p>
 */
function maskedAnswer(answer: UseActionResult, values: readonly MaskEntry[]): UseActionResult {
  return { status: answer.status, body: maskResponseBody(answer.body, buildMaskTable(values)).body };
}

/** The drawn secret and the stored form that carries it — a connection string carries the password inside it. */
function newValues(slot: RotationSlot, secret: string, stored: string): MaskEntry[] {
  const label = slot === 'password' ? 'NEW_PASSWORD' : 'NEW_DB_PASSWORD';
  return [
    { value: secret, label },
    { value: stored, label: slot === 'password' ? label : 'NEW_DB_CONNECTION' },
  ];
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
  body: unknown,
  deps: RotateDeps,
): Promise<Prepared> {
  const details = deps.entity(ctx);
  if (details === undefined) {
    return { ok: false, error: `"${ctx.entityName}" no longer exists in the vault.` };
  }
  const checked = checkRotation(statement, kind);
  if (!checked.ok) {
    return { ok: false, error: checked.message };
  }
  const withheld = await notRotatable(ctx, details, checked.slot, deps);
  return withheld === '' ? draw(ctx, details, checked, body, deps) : { ok: false, error: withheld };
}

/**
 * A woven password is not a slot an agent may rotate.
 *
 * <p>Rotating it would store a new, unwoven value while the entry went on saying `Woven — on` —
 * so the viewer would offer a two-column row over a plain password and every reading would fail
 * as "not a whole woven pair". That is the same defect a Clear used to leave behind, arriving here
 * by a different door, and this one is opened by an AGENT rather than by the person.</p>
 *
 * <p>Refused rather than silently unmarked, because unmarking is a decision about somebody's
 * protection and nothing automatic is entitled to make it. Rotating the entry by hand still works:
 * the form is where a replacement chooses whether it stays woven.</p>
 */
/** The two reasons a slot is not an agent's to rotate, asked in the cheap order. */
async function notRotatable(
  ctx: UseActionContext,
  details: EntityMetadata,
  slot: RotationSlot,
  deps: RotateDeps,
): Promise<string> {
  const woven = wovenSlot(details, slot);
  return woven === '' ? protectedSlot(ctx, slot, details, deps) : woven;
}

/**
 * A PIN-protected slot is not one an agent may rotate.
 *
 * <p>The rotation would store a new, readable value while the entry went on carrying a wrap it no
 * longer has — the same shape as the woven refusal beside it, and refused for the same reason:
 * removing somebody's protection is a decision, and nothing automatic gets to make it.</p>
 *
 * <p>Checked in `prepare`, beside the woven one, so nothing is generated first: a refused request
 * must not leave a drawn secret in a history nobody expected to grow.</p>
 *
 * <p>Asked through `pinFieldRefusal` — the wrap first, the entry's MARK second (entry-PIN plan §5.6
 * check): asking the wrap alone rotated a value of an entry that claims a PIN while that value read
 * plain at the instant, storing a readable secret under a claim of protection.</p>
 */
async function protectedSlot(
  ctx: UseActionContext,
  slot: RotationSlot,
  details: EntityMetadata,
  deps: RotateDeps,
): Promise<string> {
  const locked = pinFieldRefusal(details, await deps.current(ctx, slot));
  return locked === ''
    ? ''
    : `${locked} A rotation would replace a value this build cannot read, and the entry would keep `
      + 'claiming a protection its new value does not have.';
}

function wovenSlot(details: EntityMetadata, slot: RotationSlot): string {
  return slot === 'password' && details.passwordWoven === true
    ? `"${details.name}" stores its password woven with a decoy, so it cannot be rotated `
      + 'automatically: a new value would replace a protection nothing here can put back. Rotate it '
      + 'from the entry, where the weaving box decides what a replacement becomes.'
    : '';
}

/**
 * Make the secret, and work out what would be stored.
 *
 * <p>Last of the checks, and deliberately so: a request that was malformed never gets this far,
 * so a generated value is never left in a history nobody expected to grow.</p>
 */
async function draw(
  ctx: UseActionContext,
  details: EntityMetadata,
  checked: { slot: RotationSlot },
  body: unknown,
  deps: RotateDeps,
): Promise<Prepared> {
  // The same constraints a creation may ask for. A system that caps the password length caps it
  // for the rotation too, and an agent that could not say so would have to generate the value
  // itself — which is the one path this whole level exists to avoid.
  const options = readSecretOptions(body as Record<string, unknown>);
  if (!options.ok) {
    return { ok: false, error: options.message };
  }
  const drawn = deps.generate(kindOf(body), { password: options.password, passphrase: options.passphrase });
  if (!drawn.ok) {
    return { ok: false, error: drawn.message, noGenerator: true };
  }
  // Sealed values and marked entries were refused by `protectedSlot` before this ran; the text as stored.
  const current = unsealedText(await deps.current(ctx, checked.slot));
  const stored = storedValueFor(checked.slot, current, drawn.value, details.dbType);
  return stored.ok
    ? { ok: true, details, checked, secret: drawn.value, stored: stored.value, was: fingerprintOf(current) }
    : { ok: false, error: stored.error };
}

type Prepared = Ready | { ok: false; error: string; noGenerator?: boolean };

/** Everything a rotation needs once its checks passed: the entry, the slot, the drawn secret and its stored form. */
type Ready = { ok: true; details: EntityMetadata; checked: { slot: RotationSlot }; secret: string; stored: string; was: Fingerprint };

/** The kind asked for, defaulting to a password — which is what a rotation almost always is. */
function kindOf(body: unknown): string {
  const value = (body as { secretKind?: unknown }).secretKind;
  return typeof value === 'string' && value.length > 0 ? value : 'password';
}

/** What a successful far side hands the store: the slot, the stored form, and the fingerprint of what it replaces. */
interface NewValue {
  readonly slot: RotationSlot;
  readonly value: string;
  readonly was: Fingerprint;
}

/**
 * History first, then the write, then the tree. Only ever reached by a far side that changed — so a
 * store that could not happen is never an internal failure that drops the new value: it is held beside
 * the entry until its PIN (`quarantined`), or — when even that failed — the person was handed it
 * (`RotationNotStored`), and the agent is told plainly where the value is.
 */
async function commit(
  ctx: UseActionContext,
  details: EntityMetadata,
  value: NewValue,
  result: UseActionResult,
  deps: RotateDeps,
): Promise<UseActionResult> {
  const historyKept = await kept(ctx, details, deps);
  const where = await storedOrHanded(ctx, value, deps);
  deps.onRotated?.();
  // `stdout`, not `output`: it IS the far side's stdout, and calling it anything else was how
  // this answer escaped the masker for one release (security pass, 2026-08-27). The masker
  // covers every field now, and the honest name is still the right one.
  const rotated = { rotated: true, entity: ctx.entityName, stdout: outputOf(result) };
  const words: { message?: string } = AGENT_WORDS[where];
  return { status: 200, body: { ...rotated, ...words, ...(historyKept ? {} : historyLost(words.message)) } };
}

/**
 * The previous value into history, BEFORE the store — and a failure there does not stop the store (the
 * security review, finding 4): the far side has changed, so the new value is the one that must not be lost;
 * the previous one no longer works anywhere. The agent is told it was not kept (`historyLost`).
 */
async function kept(ctx: UseActionContext, details: EntityMetadata, deps: RotateDeps): Promise<boolean> {
  try {
    await deps.record(ctx, await deps.snapshot(ctx, details));
    return true;
  } catch {
    return false;
  }
}

/** The answer's words when the history write failed — appended to whatever the store said. */
function historyLost(message: string | undefined): { historyKept: false; message: string } {
  return { historyKept: false, message: [message, HISTORY_LOST].filter((part) => part !== undefined).join(' ') };
}

const HISTORY_LOST = "The previous value could not be kept in the entry's history; the new value is where `stored` says.";

/**
 * `stored` when the value is in the vault, `quarantined` when it is held beside the entry until its PIN,
 * `handed` when the store handed it to the person instead.
 */
async function storedOrHanded(ctx: UseActionContext, value: NewValue, deps: RotateDeps): Promise<StoreOutcome | 'handed'> {
  try {
    return await deps.store(ctx, value.slot, value.value, value.was);
  } catch (error) {
    if (error instanceof RotationNotStored) {
      return 'handed';
    }
    throw error;
  }
}

/**
 * The store could not put the new value into the vault, and handed it to the person — who was told the
 * far side changed. The value is in no message, no journal line and no answer.
 */
export class RotationNotStored extends Error {
  constructor() {
    super(NOT_STORED);
    this.name = 'RotationNotStored';
  }
}

/** What the agent is told when the far side changed and the vault did not (its words, no value). */
const NOT_STORED = 'The far side changed; the new value was not stored in the vault; the person was told and offered the value. '
  + 'Do not retry the rotation: the old value no longer works, and the person holds the new one.';

/**
 * What the agent is told when the entry refused the value and it is held beside it (plan §4.3). The answer
 * does NOT wait for the person: the value is safe, so nothing they answer changes what the agent should do
 * (the owner's answer to the plan's open question 3).
 */
const QUARANTINED = "The far side changed. The entry was protected with a PIN while it ran, so the new value is kept on the person's "
  + 'machine, outside the entry, until they next enter its PIN — then it is stored. Do not retry the rotation; the old value no longer works.';

/**
 * Where the value is, in the answer's words — `stored` answers "where is it now": one field with three
 * answers that cannot contradict each other the way `stored: false, held: true` could (plan §4.3).
 */
const AGENT_WORDS: Readonly<Record<StoreOutcome | 'handed', { readonly stored?: unknown; readonly message?: string }>> = {
  stored: {},
  quarantined: { stored: 'quarantined', message: QUARANTINED },
  handed: { stored: false, message: NOT_STORED },
};

/** The journal's words for it — grep-able beside `rotated`. */
const JOURNAL_WORDS = new Map<unknown, string>([
  [false, 'rotated, not stored'],
  ['quarantined', 'rotated, quarantined'],
]);

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

/** Whatever the statement printed, passed through — `maskedAnswer` takes the new value out of it. */
function outputOf(result: UseActionResult): unknown {
  return (result.body as { stdout?: unknown }).stdout ?? '';
}

function refuse(message: string): UseActionResult {
  return { status: 400, body: { error: { code: 'invalid_request', message } } };
}

/**
 * A refusal that says WHY it could not be made, and is recorded as one.
 *
 * <p>`not_supported` rather than `invalid_request`: the request was well formed and the entry was
 * open — what is missing is a generator on this side. An agent reading the difference can offer
 * to make the value itself, which is a trade for the person to weigh rather than a retry.</p>
 */
function refuseNoGenerator(message: string): UseActionResult {
  return { status: 404, body: { error: { code: 'not_supported', message }, noGenerator: true } };
}

/** Re-exported so the tool description and the tests name the same string. */
export { NEW_SECRET_PLACEHOLDER };
