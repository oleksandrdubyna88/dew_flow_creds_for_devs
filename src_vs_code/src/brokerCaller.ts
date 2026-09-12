/**
 * Who is asking — as the caller REPORTS it, sanitised for a security dialog.
 *
 * <p>A `caller` object rides in every request body a client sends: which agent, which of its
 * sessions, that session's name and the folder it works in. The consent modal used to say
 * "Claude Code" for every one of them — Codex, Gemini, the `creds` CLI in a plain terminal — and
 * could not say WHICH of nine side-by-side Claude Code sessions raised it, while Allow covers every
 * later call on the grant.</p>
 *
 * <p><b>The record is a LABEL. It never reaches a decision.</b> No switch, no route, no throttle,
 * no grant lookup and no permission reads it; it is rendered into the modal, written to the audit
 * line, and that is the whole of its power. That is why it may be accepted from an unauthenticated
 * body at all — and why this module is the security boundary for it: any local process can POST an
 * alias or MCP body with any `caller` it likes, so every field is stripped and capped HERE, on the
 * window side, before it can reach a template literal. The client-side cap in `CallerIdentity.cs`
 * is courtesy so a well-behaved client sends a well-formed label; this is the guard.</p>
 *
 * <p>Its own module, free of `vscode`, so the sanitiser and the sentence are unit tests. Not in
 * `brokerRequests.ts`, which the plan named: that file imports `grantLimits`, and through it
 * `vscode`, so a test of it needs the stub and this does not.</p>
 */

export interface CallerLabel {
  /** The product and its version, e.g. `Claude Code 2.1.268`; for the CLI, `creds CLI`. */
  agent: string;
  /** The short session id — the first eight characters of the caller's own id. */
  session: string;
  /** The session's name, when the agent's registry has one (`clauderag-d6`). */
  sessionName: string;
  /** The BASENAME of the working folder — never a full path, which is a leak in a modal. */
  cwd: string;
}

/** The body field the nested object travels in. */
export const CALLER_FIELD = 'caller';

/** The four fields, in the order the label composes them. */
export const CALLER_FIELDS = ['agent', 'session', 'sessionName', 'cwd'] as const;

/**
 * The prefix of the flat fallback shape — `callerAgent`, `callerSession`, `callerSessionName`,
 * `callerCwd`. The nested object is what the senders use (measured under AOT, plan §5.2); the
 * flat shape is read too, because a fallback the parser does not know is one that silently turns
 * every label into "An agent".
 */
export const CALLER_FLAT_PREFIX = 'caller';

/** Per field. The contract carries the same number, so a second implementation can agree. */
export const CALLER_MAX_FIELD_CHARS = 80;

/** For the composed line: a 64 KB body must not become a 64 KB modal or a 64 KB audit line. */
export const CALLER_MAX_LABEL_CHARS = 160;

/** What the modal says when nothing was reported — never a product name. */
export const UNKNOWN_CALLER = 'An agent';

/** In the modal, in its own sentence: a label a person mistakes for a check is worse than none. */
export const CALLER_DISCLAIMER = 'Identity as reported by the caller — a label, not a check.';

type CallerField = (typeof CALLER_FIELDS)[number];

/** `agent` → `callerAgent`, and so on — the flat shape's key for one field. */
export function flatCallerKey(field: CallerField): string {
  return `${CALLER_FLAT_PREFIX}${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

/**
 * The caller a body reports, sanitised — or `undefined` when it reports nothing at all.
 *
 * <p>Both wire shapes: `body.caller` when it is an object, otherwise the four `caller*` string
 * fields. Every field goes through `cleanCallerField`; an all-empty result is `undefined` rather
 * than a label, so the modal falls back deliberately instead of rendering `" ·  · "`.</p>
 */
export function callerFrom(body: Record<string, unknown>): CallerLabel | undefined {
  const nested = body[CALLER_FIELD];
  const source = isPlainObject(nested) ? nested : flatFields(body);
  const label: CallerLabel = {
    agent: cleanCallerField(source.agent),
    session: cleanCallerField(source.session),
    sessionName: cleanCallerField(source.sessionName),
    cwd: cleanCallerField(source.cwd),
  };
  return CALLER_FIELDS.every((field) => label[field] === '') ? undefined : label;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flatFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CALLER_FIELDS.map((field) => [field, body[flatCallerKey(field)]]));
}

// Every Unicode control (Cc) and format (Cf) character — `\n`, `\r`, `\t`, a zero-width space,
// a terminal escape — and the audit line's field separator. A newline is the dangerous one: the
// modal is built with `\n\n` between paragraphs, so an unstripped label could append its own
// "Allowing covers…" paragraph or a fake "(verified)" line to a security dialog. Replaced by a
// space rather than removed, so `X\n\nAllow` reads `X Allow` and not `XAllow`; the run collapses.
const UNPRINTABLE_OR_SEPARATOR = /[\p{Cc}\p{Cf}→]/gu;

/**
 * One field: a string or nothing, one line, no control characters, at most 80 characters.
 *
 * <p>`parseJsonObject` yields `unknown`, and an object or an array must never reach a template
 * literal — so anything that is not a string is dropped rather than stringified.</p>
 */
export function cleanCallerField(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const flat = value.replace(UNPRINTABLE_OR_SEPARATOR, ' ').replace(/\s+/g, ' ').trim();
  return capPoints(flat, CALLER_MAX_FIELD_CHARS);
}

/** Cut by code point, so a cap never leaves half a surrogate pair — a `�` — at the end. */
function capPoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join('');
}

/**
 * The head of the consent sentence — `Claude Code 2.1.268 · session clauderag-d6 (98bf9f23) · in
 * ClaudeRag` — each segment omitted when its field is empty, and `An agent` when there is no
 * caller at all.
 *
 * <p>Pure, and here rather than in the broker, so the sentence is a unit test without the stub
 * and `ask()` does not grow past its line ceiling.</p>
 */
export function callerLine(caller: CallerLabel | undefined): string {
  if (caller === undefined) {
    return UNKNOWN_CALLER;
  }
  const segments = [caller.agent, sessionSegment(caller), caller.cwd === '' ? '' : `in ${caller.cwd}`];
  return capPoints(segments.filter((segment) => segment !== '').join(' · '), CALLER_MAX_LABEL_CHARS);
}

/** `session <name> (<id>)`, or whichever half exists — the id alone is never parenthesised. */
function sessionSegment({ session, sessionName }: CallerLabel): string {
  if (sessionName === '') {
    return session === '' ? '' : `session ${session}`;
  }
  return session === '' ? `session ${sessionName}` : `session ${sessionName} (${session})`;
}

/**
 * The same label for the audit line — or nothing, so a line for an unknown caller carries no
 * ` by ` segment rather than ` by An agent`.
 */
export function callerForAudit(caller: CallerLabel | undefined): string | undefined {
  return caller === undefined ? undefined : callerLine(caller);
}
