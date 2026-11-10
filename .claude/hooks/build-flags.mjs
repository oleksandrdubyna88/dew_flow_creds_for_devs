#!/usr/bin/env node
/**
 * Refuse a .NET build command that does not bound its own worker pool.
 *
 * <p>Copied verbatim into each consumer as `.claude/hooks/build-flags.mjs` and wired by
 * `settings/settings.json` as a `PreToolUse` hook on the shell tools, exactly like
 * `load-instructions.mjs`. It enforces the half of `csharp/dotnet-build.md` that no file can
 * enforce.</p>
 *
 * <p><b>Why a hook and not a line in the rule.</b> Measured 2026-09-11: `-nr:false` can be delivered
 * by `Directory.Build.rsp`, but `-m` cannot — `dotnet build` injects its own `-maxcpucount` and the
 * command line beats the response file, so `-m:4` in a file leaves the peak at eleven workers and
 * 1232 MB, exactly the control. The only place `-m` works is the command line, and on this machine
 * the command line is written by five autonomous sessions at once.</p>
 *
 * <p><b>It reads TOKENS, never substrings.</b> The first draft matched build verbs anywhere in the
 * raw command, and the code round found both halves of that mistake: `grep -n "dotnet build" README`
 * was refused although it builds nothing, and `dotnet build "src/My -m 4.sln"` was allowed because
 * the path contained something shaped like the switch. A command is only a build when the EXECUTABLE
 * token says so, and a switch only counts when it is a token of its own.</p>
 *
 * <p><b>It only ever refuses; it never rewrites</b>, and it fails OPEN on every path — a malformed
 * payload, an internal error, and a caller that writes the payload without closing stdin (which
 * would otherwise leave the tool call pending for ever). A hook that can hang is a worse outcome
 * than the memory it saves.</p>
 */

/** Verbs that open a worker pool. `restore` is here because it was measured: 11 workers, all
 * retained, on the solution a full build opens 11 for. `test` is deliberately absent — this family
 * forbids `dotnet test` in `common/testing.md`, and enforcing another rule belongs to that rule. */
const BUILD_VERBS = new Set(['build', 'msbuild', 'publish', 'pack', 'restore']);

/** Shells and evaluators whose argument is itself a command line. */
const WRAPPERS = new Set(['eval', 'sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd', 'command', 'time', 'nice']);

/** `NAME=value` in front of a command — an environment assignment, never the executable. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** A max-cpu switch as a standalone token: `-m:4`, `--maxcpucount=8`, `/m:2`, or `-m` before a number. */
const MAX_CPU = /^(-{1,2}|\/)(m|maxcpucount)(?:[:=](\d+))?$/i;

const STDIN_LIMIT = 256 * 1024;
const STDIN_DEADLINE_MS = 2000;

/**
 * Split a command line into the pieces that each run something.
 *
 * <p>Chains (`&&`, `||`, `;`, `|`, newline) and the openers of substitutions and subshells
 * (`$(`, backtick, `(`, `)`), all ignored inside quotes. The chain split is what stops the `-m` of
 * `git commit -m "…" && dotnet build` from vouching for the build; the substitution split is what
 * keeps `VAR=$(dotnet build …)` visible.</p>
 */
function segments(command) {
  const out = [];
  let cur = '';
  let quote = '';
  const text = String(command);
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '$(') { out.push(cur); cur = ''; i += 1; continue; }
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '`' || ch === '(' || ch === ')') {
      out.push(cur); cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);

  return out;
}

/** Whitespace-separated tokens with quotes removed, so a quoted path is exactly one token. */
function tokens(segment) {
  const out = [];
  let cur = '';
  let quote = '';
  let started = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started) { out.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);

  return out;
}

/** `C:/Program Files/dotnet/dotnet.exe` -> `dotnet`. */
function executableName(token) {
  const base = token.split(/[\\/]/).pop() ?? '';

  return base.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

/** True when this segment's own tokens carry a max-cpu switch. */
function bounded(parts) {
  return parts.some((part, index) => {
    const match = MAX_CPU.exec(part);
    if (!match) return false;

    return match[3] !== undefined || /^\d+$/.test(parts[index + 1] ?? '');
  });
}

/** The build this segment runs without bounding it, or an empty string. */
function unboundedBuild(segment, depth = 0) {
  // `&` is PowerShell's call operator, and `VAR=value` in front of a command is ordinary shell —
  // this family's own CLAUDE.md documents builds written exactly that way, and while the first token
  // was taken as the executable, `CI=1 dotnet build App.slnx` was allowed. Found on PR #21.
  const parts = tokens(segment).filter(part => part !== '&' && !ASSIGNMENT.test(part));
  if (parts.length === 0 || depth > 3) return '';

  const exe = executableName(parts[0]);
  if (WRAPPERS.has(exe)) {
    // `bash -c "dotnet build …"`, `cmd /c dotnet build …`: the command is the argument. Skip only
    // the wrapper's OWN leading flags — everything from the first non-flag token onward is one inner
    // command line, rejoined. Judging those tokens separately was the round-2 gap (`dotnet` alone is
    // not a build), and dropping every dashed token instead would throw away the inner `-m:4`.
    const rest = parts.slice(1);
    const start = rest.findIndex(part => !part.startsWith('-') && !/^\/[a-z]+$/i.test(part));

    return start < 0 ? '' : unboundedBuild(rest.slice(start).join(' '), depth + 1);
  }
  const isBuild = exe === 'msbuild'
    || (exe === 'dotnet' && BUILD_VERBS.has((parts[1] ?? '').toLowerCase()));

  return isBuild && !bounded(parts) ? segment.trim() : '';
}

/** The reason to refuse, or an empty string when there is nothing to say. */
export function buildFlagsRefusal(command) {
  const offending = segments(command).map(part => unboundedBuild(part)).find(Boolean);
  if (!offending) return '';

  return (
    'csharp/dotnet-build.md: this build does not bound its worker pool. Add -m:4 (or the number this '
    + 'repository sets) to the command:\n\n    ' + offending + ' -m:4\n\n'
    + "Measured on this family's machine: without it one build peaks at 11 MSBuild workers and 1222 MB, "
    + 'with it 3 workers and 365 MB, and it is no slower. Several sessions build here at once, so the '
    + 'peaks add up — 72 workers holding 10.7 GB is what this prevents. -m cannot be put in '
    + 'Directory.Build.rsp or an environment variable; the command line is the only place it works.'
  );
}

/**
 * The hook payload, or `{}` when it does not arrive in time.
 *
 * <p>The deadline is the point. `for await (… process.stdin)` ends at EOF, so a caller that writes
 * the payload and holds the pipe open leaves this process alive and the tool call pending for ever —
 * found by the code round, reproduced by a test that writes without closing.</p>
 */
async function payload() {
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

  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

if (process.argv[1]?.endsWith('build-flags.mjs')) {
  try {
    const input = await payload();
    const refusal = buildFlagsRefusal(input?.tool_input?.command ?? '');
    if (refusal) {
      process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: refusal,
        },
      })}\n`);
    }
  } catch {
    // Allow. See the class comment: this hook must never be the reason a command cannot run.
  }
  process.exit(0);
}
