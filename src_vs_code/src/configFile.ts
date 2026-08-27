import { CONFIG_FORMAT_LABELS, ConfigFormat } from './configFormat';

/**
 * Writing a config out as a real file — the decisions, none of the I/O.
 *
 * <p>A configuration provider covers the application. It does not cover `docker compose`, Vite,
 * `dotnet ef`, a Makefile, or the colleague who just wants to look at the thing — and a feature
 * that only works from inside C# would send everyone back to keeping a copy on the side, which is
 * the habit this is all for. So the file can always be put on disk.</p>
 *
 * <p><b>Which makes the git question the important one.</b> The point of the vault is that this
 * content is not in the repository; writing it back into the repository undoes that in one step,
 * and nobody would notice until the push. The check is therefore not "does this file exist" but
 * what git thinks of the path, and the two answers mean different things:</p>
 *
 * <ul>
 *   <li><b>tracked</b> — the file is already IN the repository. Writing secrets into it is one
 *       `git commit -a` from publishing them, so this is refused outright.</li>
 *   <li><b>not ignored</b> — the file is not in the repository yet and nothing is stopping it.
 *       The next `git add .` takes it. That is a warning rather than a refusal, because a
 *       directory outside any repository looks exactly the same and is perfectly safe.</li>
 * </ul>
 *
 * <p>Free of `vscode` and of `child_process`: argv is built here, run by the caller, and the
 * verdict is a function of two booleans. All three are unit tests.</p>
 */

export type WriteVerdict =
  | { readonly kind: 'ok' }
  | { readonly kind: 'refuse'; readonly message: string }
  | { readonly kind: 'confirm'; readonly message: string };

export function writeVerdict(fileName: string, tracked: boolean, ignored: boolean): WriteVerdict {
  if (tracked) {
    return {
      kind: 'refuse',
      message: `"${fileName}" is tracked by git. Writing a config of secrets into a tracked file is one \`git commit -a\` away from publishing them. Add it to .gitignore first, or write it somewhere else.`,
    };
  }
  if (ignored) {
    return { kind: 'ok' };
  }
  return {
    kind: 'confirm',
    message: `"${fileName}" is not ignored by git, so the next \`git add .\` would commit it. That is fine if this folder is not a repository. Write it anyway?`,
  };
}

/** `git ls-files --error-unmatch -- <file>`: exit 0 means the path is tracked. */
export function trackedArgv(file: string): string[] {
  return ['ls-files', '--error-unmatch', '--', file];
}

/** `git check-ignore -q -- <file>`: exit 0 means some .gitignore rule covers the path. */
export function ignoredArgv(file: string): string[] {
  return ['check-ignore', '-q', '--', file];
}

/**
 * The file name to write.
 *
 * <p>What the entry declares, or its own name, or the word `config` — and an extension appended
 * only when the chosen name has none. `.env` therefore stays `.env` rather than becoming
 * `.env.env`, which is the case a naive `name + ext` gets wrong and the one people use most.</p>
 */
export function configFileNameFor(
  declared: string | undefined,
  format: ConfigFormat,
  entityName: string,
): string {
  const safe = safeFileName(firstNonBlank(declared, entityName));
  return safe.includes('.') ? safe : `${safe}${CONFIG_FORMAT_LABELS[format].ext}`;
}

/** Its own function so the two fallbacks do not count against the caller's complexity. */
function firstNonBlank(declared: string | undefined, entityName: string): string {
  return (declared ?? '').trim() || entityName.trim() || 'config';
}

/**
 * A name that addresses one file and cannot address a directory.
 *
 * <p>An entity name is free text that arrives by sync, by import and by accepted share, so it is
 * untrusted input at exactly the moment it becomes part of a path. Separators and the characters
 * Windows refuses become `_`; a name that is nothing but dots would be `.` or `..`, which name a
 * directory rather than a file, and is replaced outright.</p>
 */
function safeFileName(name: string): string {
  const flattened = name.replace(/[\\/:*?"<>|]/g, '_');
  return /^\.+$/.test(flattened) ? 'config' : flattened;
}
