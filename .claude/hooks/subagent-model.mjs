#!/usr/bin/env node
/**
 * Refuse a subagent launch that does not name its model as a bare alias, and teach the role table on every
 * launch that passes. It does not judge `effort`: measured 2026-10-14, the hook payload never carries the
 * Agent tool's per-launch `effort`, and the child's effort comes from the settings.
 *
 * <p>Copied verbatim into each consumer as `.claude/hooks/subagent-model.mjs` and wired by
 * `settings/settings.json` as a `PreToolUse` hook on `Agent|Task`, exactly like `build-flags.mjs`. It
 * enforces the half of `common/subagent-models.md` that no file can enforce: a launch with no model
 * inherits whatever the parent runs on, and a versioned id freezes a model the rule wants to follow
 * the newest of its family.</p>
 *
 * <p><b>It only ever refuses or teaches; it never approves and never rewrites.</b> It never emits
 * `allow` (that would skip the permission prompt for a call it knows nothing else about), and it never
 * repairs a model value: `Opus` is denied, not corrected, because correcting it is `updatedInput` under
 * another name. A refusal carries the role table, so the relaunch can be right the first time.</p>
 *
 * <p><b>It fails OPEN on every path</b> — unparseable stdin, a payload of the wrong shape, an internal
 * error, a caller that writes the payload and never closes stdin, a payload over the size limit. A hook
 * that blocks every subagent because it could not read its input is a worse outcome than a launch on the
 * wrong model. Fail-open output is always zero bytes and exit 0, and no warning rides one.</p>
 *
 * <p><b>The digest is its only copy of the table.</b> The hook reads no file, so `ROLE_DIGEST` is the one
 * place the table is written a second time; `tools/subagent-model-hook.test.mjs` compares it with the
 * rule's own table, so the two cannot drift apart unnoticed. Both texts are rendered from it by
 * `roleLine`, never written by hand.</p>
 *
 * <p><b>Warnings travel as `systemMessage`, never as a deny.</b> A frozen alias or a misspelt opt-out is a
 * fact about the host's environment, not about the call; a deny would block work the session cannot fix.
 * `SUBAGENT_MODEL_GUARD=off` is the only opt-out, for harnesses that measure models and must not be
 * steered.</p>
 */

/** Raise with every behaviour change; it decides whether a session self-install upgrades the user copy. */
export const GUARD_VERSION = 3;
export const DENY_MARKER = 'subagent-models.md:';
export const ALLOWED_MODELS = Object.freeze(['sonnet', 'opus', 'fable']);
export const OPT_OUT_VARIABLE = 'SUBAGENT_MODEL_GUARD';
export const FREEZE_VARIABLES = Object.freeze([
  'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL_FORCE',
]);
export const STDIN_LIMIT = 256 * 1024;
export const STDIN_DEADLINE_MS = 2000;

/** The hook's ONLY copy of the rule's role table: `role` is the table's first cell verbatim, `model` its second. */
export const ROLE_DIGEST = Object.freeze([
  { role: 'Scout', model: 'sonnet' },
  { role: 'Coder', model: 'sonnet' },
  { role: 'Small edit', model: 'main session or sonnet' },
  { role: 'Judge', model: 'opus' },
  { role: 'Plan → epics', model: 'fable' },
  { role: 'Security judgement', model: 'fable' },
  { role: 'Cornerstone spec', model: 'fable' },
].map(Object.freeze));

/** The digest as one line: roles grouped by model, the allowed models first, in their own order. */
export function roleLine(digest = ROLE_DIGEST) {
  const groups = new Map();
  for (const { role, model } of digest) {
    groups.set(model, [...(groups.get(model) ?? []), role.toLowerCase()]);
  }
  const rank = model => {
    const index = ALLOWED_MODELS.indexOf(model);

    return index < 0 ? ALLOWED_MODELS.length : index;
  };

  return [...groups.keys()]
    .map((model, order) => ({ model, order }))
    .sort((a, b) => rank(a.model) - rank(b.model) || a.order - b.order)
    .map(({ model }) => `${model}: ${groups.get(model).join(', ')}`)
    .join(' · ');
}

export const TEACH_TEXT = `Subagent models — ${roleLine(ROLE_DIGEST)}. Scouts: ⌈1.5·N⌉, N = count given (2→3). Name the model on every launch as a bare alias; the role table is common/subagent-models.md.`;

export const DENY_TEXT = `${DENY_MARKER} name the model on every Agent call as a bare alias — sonnet, opus or fable. Missing, empty, haiku, inherit, a versioned id or another spelling is refused. Roles — ${roleLine(ROLE_DIGEST)}. Relaunch with the alias of the role.`;

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const envText = (env, name) => String(env[name] ?? '').trim();

const SILENT = Object.freeze({ kind: 'silent', text: '', warnings: Object.freeze([]) });

const hasAllowedModel = toolInput => typeof toolInput.model === 'string' && ALLOWED_MODELS.includes(toolInput.model);

/** The refusal for this `tool_input`; `''` when the launch is fine. */
const refusalText = toolInput => (hasAllowedModel(toolInput) ? '' : DENY_TEXT);

/** `silent` unless the payload is a PreToolUse `Agent`/`Task` call with an object `tool_input`. */
function inEnvelope(payload) {
  return isPlainObject(payload)
    && (payload.hook_event_name === undefined || payload.hook_event_name === 'PreToolUse')
    && (payload.tool_name === 'Agent' || payload.tool_name === 'Task')
    && isPlainObject(payload.tool_input);
}

/** The user-visible warnings about the environment, in a fixed order. */
function warningsFor(env) {
  const set = FREEZE_VARIABLES.filter(name => envText(env, name) !== '');
  const freeze = set.length === 0 ? [] : [
    `Model guard: alias-freezing variable(s) set: ${set.join(', ')}. The rule wants bare aliases that follow the newest model — unset them (common/subagent-models.md).`,
  ];
  const spelled = envText(env, OPT_OUT_VARIABLE);
  const optOut = spelled === '' || spelled.toLowerCase() === 'on' ? [] : [
    `Model guard: ${OPT_OUT_VARIABLE} is set but is not an opt-out, the guard stays on; the only opt-out is ${OPT_OUT_VARIABLE}=off.`,
  ];

  return [...freeze, ...optOut];
}

/**
 * The verdict on one hook payload. Pure: no I/O, no clock. Reads exactly six keys of `env`.
 *
 * <p>Order: the opt-out and the envelope first (silent), then the MODEL (a missing or non-alias model is the
 * denial), otherwise teach. `effort` is never read.</p>
 *
 * @returns {{ kind: 'deny' | 'teach' | 'silent', text: string, warnings: string[] }}
 */
export function subagentModelVerdict(payload, env) {
  if (envText(env, OPT_OUT_VARIABLE).toLowerCase() === 'off') return SILENT;
  if (!inEnvelope(payload)) return SILENT;
  const text = refusalText(payload.tool_input);

  return text === '' ? { kind: 'teach', text: TEACH_TEXT, warnings: warningsFor(env) } : { kind: 'deny', text, warnings: warningsFor(env) };
}

/** `''` for silent, otherwise ONE line of JSON ending in a newline. */
export function hookOutput(verdict) {
  if (verdict.kind === 'silent') return '';
  const specific = verdict.kind === 'deny'
    ? { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.text }
    : { hookEventName: 'PreToolUse', additionalContext: verdict.text };

  return `${JSON.stringify({
    hookSpecificOutput: specific,
    ...(verdict.warnings.length > 0 ? { systemMessage: verdict.warnings.join(' ') } : {}),
  })}\n`;
}

/** What the entry prints for this stdin: `''` on ANY throw, because this hook fails open. */
export function hookResponse(stdinText, env) {
  try {
    return hookOutput(subagentModelVerdict(JSON.parse(stdinText), env));
  } catch {
    return '';
  }
}

/**
 * The raw stdin text and its byte count, judged after a deadline when the pipe is never closed.
 *
 * <p>The deadline is the point: `for await (… process.stdin)` ends at EOF, so a caller that writes the
 * payload and holds the pipe open would leave the tool call pending for ever. `size` counts every byte
 * received, so an over-limit payload is judged over by its size and never parsed by luck of chunking.</p>
 */
async function readStdin() {
  const chunks = [];
  let size = 0;
  const read = (async () => {
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
      size += chunk.length;
      if (size > STDIN_LIMIT) break;
    }
  })();
  let timer;
  await Promise.race([read, new Promise(resolve => { timer = setTimeout(resolve, STDIN_DEADLINE_MS); })]);
  clearTimeout(timer);

  return { text: Buffer.concat(chunks).toString('utf8'), size };
}

if (process.argv[1]?.endsWith('subagent-model.mjs')) {
  const out = await (async () => {
    try {
      const { text, size } = await readStdin();
      return size > STDIN_LIMIT ? '' : hookResponse(text, process.env);
    } catch {
      return '';
    }
  })();
  if (out === '') process.exit(0);
  else {
    // The host may close the pipe before the write completes: every stdout failure still exits 0, silently.
    process.stdout.on('error', () => process.exit(0));
    process.stdout.write(out, () => process.exit(0));
  }
}
