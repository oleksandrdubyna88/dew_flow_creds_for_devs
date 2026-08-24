import { splitTokens } from './commandParse';

/**
 * Reading what a flag MEANS out of the CLI's own `--help`.
 *
 * <p>The alternative was a table of flags for the tools we happened to think of, which
 * would be wrong for every private tool and stale for every public one. A CLI already
 * documents itself; the only question is whether we are willing to ask it.</p>
 *
 * <p>Two rules this file exists to keep. <b>It fails quietly</b> — a wrong note is worse
 * than no note, because the note is the thing being trusted a week later, so anything the
 * heuristic is not sure of returns `undefined`. And <b>the probe is an argv array</b>,
 * never a shell string: the words come from something the user pasted, and a line
 * assembled for a shell is a line that can be injected into.</p>
 */

export interface HelpProbe {
  file: string;
  args: string[];
}

/**
 * The commands to try, in order. `--help` first because it is nearly universal; `help`
 * as a subcommand for the Go-style CLIs (aws, git, go) that prefer it; `-h` last because
 * on a few tools it means something else entirely.
 */
/**
 * Whether this command may be probed at all.
 *
 * <p>On Windows the tools worth probing — `aws`, `npm`, `terraform` — are `.cmd` shims,
 * and Node refuses to spawn those without a shell. A shell is a place things get
 * injected, and the words here come from a text field that a SHARED entry can fill in.
 * So instead of reasoning about quoting rules on two platforms, the answer is a
 * whitelist: letters, digits, and the handful of punctuation marks that appear in real
 * tool names. Anything else is simply not probed, and the user types the note by hand —
 * which is the behaviour for a private tool anyway.</p>
 */
export function isProbeSafe(command: string): boolean {
  const words = command.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length > 0 && words.every((w) => /^[A-Za-z0-9._\\/+-]+$/.test(w));
}

export function helpProbes(command: string): HelpProbe[] {
  if (!isProbeSafe(command)) {
    return [];
  }
  const words = splitTokens(command.trim()).map((t) => t.text).filter((w) => w.length > 0);
  const [file, ...rest] = words;
  return [
    { file, args: [...rest, '--help'] },
    { file, args: [...rest, 'help'] },
    { file, args: [...rest, '-h'] },
  ];
}

/** `--sso-session` / `-s` — the flag a help line is about, without its `=value` tail. */
function flagsOnLine(line: string): string[] {
  const found: string[] = [];
  const pattern = /(^|[\s,(])(--?[a-zA-Z][a-zA-Z0-9-]*)/g;
  let match = pattern.exec(line);
  while (match !== null) {
    found.push(match[2]);
    match = pattern.exec(line);
  }
  return found;
}

/** True when the flag at this position sits inside a `[...]` group — a usage synopsis. */
function insideBrackets(line: string, at: number): boolean {
  let depth = 0;
  for (let i = 0; i < at; i += 1) {
    if (line[i] === '[' || line[i] === '(') {
      depth += 1;
    }
    if (line[i] === ']' || line[i] === ')') {
      depth -= 1;
    }
  }
  return depth > 0;
}

const USAGE_LINE = /^\s*(usage|synopsis|or)\s*:/i;

function isFlagLine(line: string): boolean {
  return /^\s*-/.test(line);
}

/**
 * The description that begins on this line, with the lines it wraps onto.
 *
 * <p>Both halves came from running this against real tools. Docker wraps `--rm` over
 * three lines, and stopping at the first gave "Automatically remove the" — which reads
 * as if that were the whole meaning, and is worse than no note at all. Git prints a
 * usage synopsis for `--help`, and `-m` came back as
 * `[--allow-empty-message] [--no-verify] [-e] [--author=<author>]`: confident, attached
 * to the row, and nonsense. A wrong note is the one outcome this file must not produce.</p>
 */
function descriptionAt(lines: string[], index: number, flag: string): string | undefined {
  const line = lines[index];
  const at = line.indexOf(flag);
  if (at === -1 || insideBrackets(line, at) || USAGE_LINE.test(line)) {
    return undefined;
  }

  const tail = line.slice(at + flag.length);
  const gap = tail.search(/\s{2,}/);
  let first = gap === -1 ? '' : tail.slice(gap).trim();
  let column = first.length > 0 ? line.indexOf(first, at) : -1;
  let from = index + 1;

  if (first.length === 0) {
    // The other common shape: flag alone on its line, description indented underneath.
    const next = lines[index + 1];
    if (next === undefined || next.trim().length === 0 || isFlagLine(next)) {
      return undefined;
    }
    first = next.trim();
    column = next.length - next.trimStart().length;
    from = index + 2;
  }

  // A description starting with a bracket or an angle is a synopsis fragment, not prose.
  if (/^[[<|]/.test(first)) {
    return undefined;
  }

  const parts = [first];
  for (let i = from; i < lines.length; i += 1) {
    const cont = lines[i];
    if (cont.trim().length === 0 || isFlagLine(cont)) {
      break;
    }
    const indent = cont.length - cont.trimStart().length;
    if (indent < column - 2) {
      break;
    }
    parts.push(cont.trim());
  }

  return parts.join(' ');
}

export function describeFlag(helpText: string, flag: string): string | undefined {
  if (flag.length === 0 || !flag.startsWith('-') || helpText.length === 0) {
    return undefined;
  }

  const lines = helpText.split(/(?:\r)?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    // Exact flag match only. `--sso` must not pick up `--sso-session`: a confidently
    // attached WRONG explanation is the failure this whole file is shaped around.
    if (!flagsOnLine(lines[i]).includes(flag)) {
      continue;
    }
    const found = descriptionAt(lines, i, flag);
    if (found !== undefined) {
      return found;
    }
    // A synopsis mention is not a definition — keep looking for the real one.
  }

  return describeBundle(helpText, flag);
}

/**
 * `-it` is `-i -t`, and no help text has an entry for it. Explaining the letters is the
 * difference between a useful note and a dash on one of the most typed commands there is.
 *
 * <p>All or nothing: half a bundle explained, presented as the explanation, is the same
 * confidently-wrong failure the rest of this file is built to avoid.</p>
 */
function describeBundle(helpText: string, flag: string): string | undefined {
  if (!/^-[a-zA-Z]{2,}$/.test(flag)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const letter of flag.slice(1)) {
    const one = describeFlag(helpText, '-' + letter);
    if (one === undefined) {
      return undefined;
    }
    parts.push(one);
  }
  return parts.join('; ');
}
