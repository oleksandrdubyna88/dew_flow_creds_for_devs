import { commandRefusal, describeCommand, shownCommandLine } from './commandLine';
import { CopiedLine, copiedLineOf } from './remoteLaunch';
import { EntityMetadata } from './types';

/**
 * What the viewer, its copy and Copy All show for a Terminal entry (E2.S1 of `PLAN_terminal_command_over_ssh.md`): one
 * reading, `copiedLineOf`, so the rows and the block cannot disagree. Pure.
 */
export type { CopiedLine } from './remoteLaunch';

function readOf(d: EntityMetadata, copy: CopiedLine | undefined): CopiedLine {
  return copy ?? copiedLineOf(d, () => undefined);
}

/**
 * The viewer's command rows. `copy` is what the caller read with storage; absent means "no lookup was made", and a linked
 * entry then fails closed with the missing-entry sentence (production always passes it).
 */
export function commandRowsOf(d: EntityMetadata, copy: CopiedLine | undefined): { full?: string; refusal?: string; note?: string } {
  const read = readOf(d, copy);
  switch (read.kind) {
    case 'local':
      return { full: shownCommandLine(d), refusal: commandRefusal(d) };
    case 'linked':
      return { full: read.line, note: read.note };
    case 'refused':
      return { refusal: read.reason };
  }
}

/** Copy All's block for a Terminal entry: the local description, or the trust line and its note, or the reason. */
export function commandBlockOf(d: EntityMetadata, copy: CopiedLine | undefined): string {
  const read = readOf(d, copy);
  switch (read.kind) {
    case 'local':
      return describeCommand(d);
    case 'linked':
      return `${read.line}\n${read.note}`;
    case 'refused':
      return read.reason;
  }
}
