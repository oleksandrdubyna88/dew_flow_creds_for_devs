import { CommandArg } from './types';
import { SecretRefField, findSecretRefs, parseSecretRef } from './secretRef';

/**
 * Turning a stored command or script into something runnable with secrets, without putting a
 * secret anywhere it can be read afterwards.
 *
 * <p>Two shapes, one rule. A `creds://…` reference becomes an environment variable name in the
 * text that runs, and the value goes only into the child's environment — exactly the trade
 * `resolveScriptEnv` already makes for a script's own variables, extended to references and to
 * command arguments, which had no mechanism at all.</p>
 *
 * <p><b>Why the argument is rewritten rather than substituted.</b> A command line is visible in
 * the process list to every user on the machine (`ps`, Task Manager), so a resolved password
 * pasted into argv would be readable by anyone while it ran. The argument becomes the shell's
 * own read — `"$CREDS_REF_1"` or `%CREDS_REF_1%` — so what argv carries is a name.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

/** The variable name a reference is given, numbered in the order they appear. */
export function refVarName(index: number): string {
  return `CREDS_REF_${index + 1}`;
}

/** How a shell reads a variable. cmd.exe is the one that cannot use `$NAME`. */
type ShellFamily = 'cmd' | 'powershell' | 'posix';

const SHELL_PREFIXES: ReadonlyArray<[string, ShellFamily]> = [
  ['cmd', 'cmd'],
  ['powershell', 'powershell'],
  ['pwsh', 'powershell'],
];

/** Which family a shell path belongs to. Windows with nothing reported means PowerShell. */
export function shellFamily(platform: NodeJS.Platform, shellPath?: string): ShellFamily {
  const base = basenameOf(shellPath);
  const known = SHELL_PREFIXES.find(([prefix]) => base.startsWith(prefix));
  if (known !== undefined) {
    return known[1];
  }
  // No shell reported: on Windows the default is PowerShell in every supported VS Code.
  return base.length === 0 && platform === 'win32' ? 'powershell' : 'posix';
}

function basenameOf(shellPath: string | undefined): string {
  const normalized = (shellPath ?? '').toLowerCase().split('\\').join('/');
  return normalized.split('/').pop() ?? '';
}

export function shellRead(name: string, platform: NodeJS.Platform, shellPath?: string): string {
  const family = shellFamily(platform, shellPath);
  if (family === 'cmd') {
    return `%${name}%`;
  }
  return family === 'powershell' ? `$env:${name}` : `"$${name}"`;
}

export interface RefPlan {
  /** Every distinct reference found, in order — index i is `refVarName(i)`. */
  refs: string[];
  /** reference -> the variable name it will be read from. */
  names: Record<string, string>;
}

/** Assign a variable name to every reference in these texts. */
export function planRefs(texts: readonly string[]): RefPlan {
  const refs: string[] = [];
  for (const text of texts) {
    for (const ref of findSecretRefs(text)) {
      if (!refs.includes(ref)) {
        refs.push(ref);
      }
    }
  }
  const names: Record<string, string> = {};
  refs.forEach((ref, index) => {
    names[ref] = refVarName(index);
  });
  return { refs, names };
}

/** The field a reference names, for a summary a person reads before allowing a run. */
export function refField(ref: string): SecretRefField | undefined {
  return parseSecretRef(ref)?.field;
}

/** Replace every reference in a text with the shell's read of its variable. */
export function rewriteRefs(
  text: string,
  plan: RefPlan,
  platform: NodeJS.Platform,
  shellPath?: string,
): string {
  let out = text;
  for (const ref of plan.refs) {
    out = out.split(ref).join(shellRead(plan.names[ref], platform, shellPath));
  }
  return out;
}

/**
 * A command line whose referencing arguments read their value from the environment.
 *
 * <p>Disabled rows are left out, as `buildCommandLine` does — the same rule, because this is
 * the same command with a different value channel.</p>
 */
export function buildCommandLineWithRefs(
  command: string,
  args: readonly CommandArg[] | undefined,
  plan: RefPlan,
  platform: NodeJS.Platform,
  shellPath?: string,
): string {
  const base = rewriteRefs(command.trim(), plan, platform, shellPath);
  if (base.length === 0) {
    return '';
  }
  const parts = (args ?? [])
    .filter((arg) => arg.disabled !== true && arg.value.trim().length > 0)
    .map((arg) => rewriteRefs(arg.value.trim(), plan, platform, shellPath));
  return [base, ...parts].join(' ');
}

/**
 * A script body's references rewritten into that language's own environment read.
 *
 * <p>Deliberately the language's syntax, not the shell's: a Python script reading `"$NAME"`
 * would get a literal string. The four runnable languages are the four `resolveScriptEnv`
 * knows, and the mapping is the same one — a fifth language would break in both places at
 * once, which is the correct coupling.</p>
 */
const LANGUAGE_READS: Record<string, (name: string) => string> = {
  bash: (name) => `"$${name}"`,
  powershell: (name) => `$env:${name}`,
  javascript: (name) => `process.env.${name}`,
  python: (name) => `os.environ.get('${name}', '')`,
};

export function rewriteScriptRefs(body: string, plan: RefPlan, language: string): string {
  const read = LANGUAGE_READS[language];
  if (read === undefined) {
    return body;
  }
  const translated = plan.refs.filter((ref) => body.includes(ref));
  const out = translated.reduce((text, ref) => text.split(ref).join(read(plan.names[ref])), body);
  // Same rule as resolveScriptEnv: the import is added only if something needs it.
  return needsOsImport(language, translated.length, out) ? `import os\n${out}` : out;
}

function needsOsImport(language: string, translated: number, out: string): boolean {
  return language === 'python' && translated > 0 && !/^\s*import\s+os/m.test(out);
}
