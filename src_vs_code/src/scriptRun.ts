/**
 * Executing a stored script: which interpreter, which file extension, per OS.
 *
 * <p>Only languages with an unambiguous interpreter are runnable. SQL needs a database,
 * YAML/JSON/Dockerfile are data — offering a Run button that pipes them into a shell
 * would execute noise. Refusing with a reason beats guessing.</p>
 */

export const RUNNABLE_LANGUAGES: readonly string[] = ['bash', 'powershell', 'python', 'javascript'];

export type ScriptRunPlan =
  | { kind: 'run'; command: string; args: string[]; extension: string }
  | { kind: 'unsupported'; reason: string };

// eslint-disable-next-line complexity
export function scriptRunPlan(language: string, platform: NodeJS.Platform): ScriptRunPlan {
  switch (language) {
    case 'bash':
      // On Windows this needs a bash on PATH (git-bash ships one); the terminal will
      // say "not found" plainly if there is none — better than silently using cmd.
      return { kind: 'run', command: 'bash', args: [], extension: '.sh' };
    case 'powershell':
      return platform === 'win32'
        ? { kind: 'run', command: 'powershell', args: ['-ExecutionPolicy', 'Bypass', '-File'], extension: '.ps1' }
        : { kind: 'run', command: 'pwsh', args: ['-File'], extension: '.ps1' };
    case 'python':
      return { kind: 'run', command: 'python', args: [], extension: '.py' };
    case 'javascript':
      return { kind: 'run', command: 'node', args: [], extension: '.js' };
    default:
      return {
        kind: 'unsupported',
        reason:
          `A ${language} script has no interpreter to hand it to — SQL needs a database, ` +
          'data formats are not programs. Use Copy and paste it where it belongs.',
      };
  }
}
