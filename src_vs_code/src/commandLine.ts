import { CommandArg, EntityMetadata } from './types';
import { hasOs, osLabel } from './hostShell';
import { nameRefusal, substituteName, usesNameToken } from './commandName';

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
 * The raw join: the template, before `{name}`. Everything outside this file asks `resolveCommand` (`commandRoadScan.test.ts`).
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

/** What every road reads of an entry to know its line: `name` fills `{name}`. */
export type CommandEntry = Pick<EntityMetadata, 'name' | 'command' | 'commandArgs'>;

/** A line's parts with `{name}` filled in. Enabled rows only; a disabled row stays as stored. */
export interface CommandParts {
  readonly command: string;
  readonly args: readonly CommandArg[];
}

export type ResolvedCommand =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly line: string; readonly parts: CommandParts }
  | { readonly kind: 'refused'; readonly template: string; readonly reason: string };

/**
 * The ONE line of an entry. What is displayed, approved, fingerprinted and typed is this string, so `line` exists only
 * after narrowing: skipping a refusal does not compile. Only enabled parts are judged, so a disabled row cannot refuse.
 */
export function resolveCommand(entry: CommandEntry): ResolvedCommand {
  const template = templateOf(entry);
  if (template.length === 0) {
    return { kind: 'empty' };
  }
  const reason = usesNameToken(template) ? nameRefusal(entry.name) : undefined;
  return reason === undefined ? readyCommand(entry) : { kind: 'refused', template, reason };
}

function templateOf(entry: CommandEntry): string {
  return buildCommandLine(entry.command ?? '', entry.commandArgs);
}

function readyCommand(entry: CommandEntry): ResolvedCommand {
  const command = substituteName((entry.command ?? '').trim(), entry.name);
  const args = normalizeArgs(entry.commandArgs).map((arg) => (arg.disabled === true ? arg : { ...arg, value: substituteName(arg.value, entry.name) }));
  return { kind: 'ready', line: buildCommandLine(command, args), parts: { command, args } };
}

/** The line to SHOW: the resolved one, else the template, so a refused name is never shown as resolved. */
export function shownCommandLine(entry: CommandEntry): string {
  const resolved = resolveCommand(entry);
  switch (resolved.kind) {
    case 'ready':
      return resolved.line;
    case 'refused':
      return resolved.template;
    default:
      return '';
  }
}

/** Why this entry's line will not run, or `undefined` when nothing about its name stops it. */
export function commandRefusal(entry: CommandEntry): string | undefined {
  const resolved = resolveCommand(entry);
  return resolved.kind === 'refused' ? resolved.reason : undefined;
}

/** The line every display adds under a refused template: one row, or none. */
export function willNotRunLines(entry: CommandEntry): string[] {
  const reason = commandRefusal(entry);
  return reason === undefined ? [] : [`will not run: ${reason}`];
}

/**
 * The command and what its parts mean, as plain text — for a tooltip, the details view,
 * or the clipboard. The line is the resolved one (the template, and why, for a refused name); the
 * annotated rows stay as stored, with a person's note.
 *
 * <p>An argument with no note contributes no line, so nothing ever renders as a value
 * followed by a dangling dash.</p>
 */
// eslint-disable-next-line complexity
export function describeCommand(entry: CommandEntry & Pick<EntityMetadata, 'commandNote'>): string {
  const line = shownCommandLine(entry);
  const lines: string[] = [...(line.length > 0 ? [line] : []), ...willNotRunLines(entry)];

  const summary = entry.commandNote?.trim();
  if (summary !== undefined && summary.length > 0) {
    lines.push('', summary);
  }

  const annotated = normalizeArgs(entry.commandArgs).filter((arg) => arg.note !== undefined);
  if (annotated.length > 0) {
    lines.push('');
    for (const arg of annotated) {
      lines.push(`${arg.value}  — ${arg.note}${arg.disabled === true ? '  (off)' : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * The viewer's label for a command row — with the OS it is written for, when one is recorded
 * (issue #103). A label rather than a row of its own: an OS is not a value anybody copies.
 */
export function commandRowLabel(terminalOs: string | undefined): string {
  return hasOs(terminalOs) ? `Command · runs on ${osLabel(terminalOs)}` : 'Command';
}
