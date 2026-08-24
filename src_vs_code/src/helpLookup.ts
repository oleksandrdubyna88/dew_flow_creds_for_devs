import { execFile } from 'node:child_process';
import { HelpProbe, helpProbes } from './helpText';

/**
 * Asking a CLI to describe its own flags.
 *
 * <p>Separated from `helpText.ts` so that the parsing — the part with rules worth
 * asserting — stays free of a subprocess, and this file holds only the part that cannot
 * be unit tested honestly: running someone else's binary.</p>
 *
 * <p>Three things this file will not do. It never runs a command `isProbeSafe` rejects.
 * It never waits longer than a few seconds, because a tool that hangs on `--help` must
 * not hang the form. And it never throws — a missing tool is the ordinary case, not an
 * error worth showing.</p>
 */

const TIMEOUT_MS = 5_000;
const MAX_OUTPUT = 1_000_000;

function runProbe(probe: HelpProbe): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      probe.file,
      probe.args,
      {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT,
        windowsHide: true,
        // Windows ships `aws`, `npm` and `terraform` as .cmd shims, which Node refuses to
        // spawn without a shell. `isProbeSafe` has already rejected everything that could
        // mean anything to a shell, so there is nothing left here to inject.
        shell: process.platform === 'win32',
      },
      (_error, stdout, stderr) => {
        // Plenty of tools print help to stderr, and plenty exit non-zero after doing it.
        // The exit code says nothing useful; the text does.
        resolve((stdout ?? '') + String.fromCharCode(10) + (stderr ?? ''));
      },
    );
  });
}

/** Help text usually has a column of flags. Anything without one is an error message. */
function looksLikeHelp(text: string): boolean {
  return /^\s*-\s*-?[a-zA-Z]/m.test(text) && text.length > 40;
}

export async function readHelpText(command: string): Promise<string> {
  for (const probe of helpProbes(command)) {
    const text = await runProbe(probe);
    if (looksLikeHelp(text)) {
      return text;
    }
  }
  return '';
}
