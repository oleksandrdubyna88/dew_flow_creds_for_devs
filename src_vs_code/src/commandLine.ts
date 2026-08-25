import { CommandArg } from './types';

/**
 * CLI commands, assembled from a base command and a list of arguments.
 *
 * <p>The case: `aws sso login --sso-session OD-org` is unfindable in shell history a week
 * later, and the part nobody remembers is never the verb. It is which `--sso-session`
 * value belongs to which organisation, and why. So an argument is a ROW with its own note
 * rather than a word inside a blob of text — that is the whole reason this file exists
 * instead of a single `command: string`.</p>
 *
 * <p>Free of `vscode`, so the assembly rules are unit tests.</p>
 */

/** Drop blank rows and empty notes; keep order, notes and the disabled flag. */
export function normalizeArgs(args: readonly CommandArg[] | undefined): CommandArg[] {
  return (args ?? [])
    .map((arg) => ({
      value: arg.value.trim(),
      note: arg.note?.trim(),
      disabled: arg.disabled === true ? true : undefined,
    }))
    .filter((arg) => arg.value.length > 0)
    .map((arg) => {
      // Omit rather than store empty: an absent note and a note of "" mean the same
      // thing to a reader, and only one of them survives a round-trip cleanly.
      const out: CommandArg = { value: arg.value };
      if (arg.note !== undefined && arg.note.length > 0) {
        out.note = arg.note;
      }
      if (arg.disabled === true) {
        out.disabled = true;
      }
      return out;
    });
}

/**
 * The line to run.
 *
 * <p>A disabled argument is kept in the entry but left out of the line. That is the point
 * of having the flag at all: `--debug` is what you want back next week, and deleting it
 * means retyping it from memory — the exact problem this feature exists to remove.</p>
 */
export function buildCommandLine(command: string, args: readonly CommandArg[] | undefined): string {
  const base = command.trim();
  if (base.length === 0) {
    return '';
  }
  const parts = normalizeArgs(args)
    .filter((arg) => arg.disabled !== true)
    .map((arg) => arg.value);
  return [base, ...parts].join(' ');
}

/**
 * The command and what its parts mean, as plain text — for a tooltip, the details view,
 * or the clipboard.
 *
 * <p>An argument with no note contributes no line, so nothing ever renders as a value
 * followed by a dangling dash.</p>
 */
// eslint-disable-next-line complexity
export function describeCommand(
  command: string,
  args: readonly CommandArg[] | undefined,
  note: string | undefined,
): string {
  const lines: string[] = [];

  const line = buildCommandLine(command, args);
  if (line.length > 0) {
    lines.push(line);
  }

  const summary = note?.trim();
  if (summary !== undefined && summary.length > 0) {
    lines.push('', summary);
  }

  const annotated = normalizeArgs(args).filter((arg) => arg.note !== undefined);
  if (annotated.length > 0) {
    lines.push('');
    for (const arg of annotated) {
      lines.push(`${arg.value}  — ${arg.note}${arg.disabled === true ? '  (off)' : ''}`);
    }
  }

  return lines.join('\n');
}
