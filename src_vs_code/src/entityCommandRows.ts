import { commandRefusal, describeCommand, shownCommandLine } from './commandLine';
import type { CopiedLine } from './remoteLaunch';
import { EntityMetadata } from './types';

/**
 * What the viewer, its copy and Copy All show for a Terminal entry (E2.S1 of `PLAN_terminal_command_over_ssh.md`): one
 * reading, `copiedLineOf`, so the rows and the block cannot disagree. Pure.
 */
export type { CopiedLine } from './remoteLaunch';

/** The viewer's command rows. `copy` is REQUIRED: what the caller read with storage (`copiedLineOf`); there is no fallback reading. */
export function commandRowsOf(d: EntityMetadata, copy: CopiedLine): { full?: string; refusal?: string; note?: string } {
  switch (copy.kind) {
    case 'local':
      return { full: shownCommandLine(d), refusal: commandRefusal(d) };
    case 'linked':
      return { full: copy.line, note: copy.note };
    case 'refused':
      return { refusal: copy.reason };
  }
}

/** Copy All's block for a Terminal entry: the local description, or the trust line and its note, or the reason. */
export function commandBlockOf(d: EntityMetadata, copy: CopiedLine): string {
  switch (copy.kind) {
    case 'local':
      return describeCommand(d);
    case 'linked':
      return `${copy.line}\n${copy.note}`;
    case 'refused':
      return copy.reason;
  }
}
