import { CommandArg } from './types';

/**
 * Scripts: a big body with the CHANGEABLE parts pulled out into `${NAME}` variables,
 * plus a small dependency-free highlighter.
 *
 * <p>The highlighter's one non-negotiable property is that it ESCAPES before it marks:
 * the output lands in a webview, and a script that contains markup must never become
 * markup. Everything past that is cosmetics — comments, strings, keywords, numbers and
 * the `${VAR}` placeholders, per language, by regex. It will misread exotic nesting and
 * that is fine; it is a credential manager, not an IDE.</p>
 */

export interface ScriptLanguage {
  id: string;
  label: string;
}

export const SCRIPT_LANGUAGES: readonly ScriptLanguage[] = [
  { id: 'bash', label: 'Bash / sh' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript / TypeScript' },
  { id: 'sql', label: 'SQL' },
  { id: 'yaml', label: 'YAML' },
  { id: 'json', label: 'JSON' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'other', label: 'Other / plain text' },
];

/** `${NAME}` -> the enabled variable's value; disabled and unknown stay as placeholders. */
// eslint-disable-next-line complexity
export function substituteScript(body: string, vars: readonly CommandArg[] | undefined): string {
  const values = new Map<string, string>();
  for (const v of vars ?? []) {
    if (v.disabled !== true && v.name !== undefined && v.name.length > 0) {
      values.set(v.name, v.value);
    }
  }
  return body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    values.has(name) ? (values.get(name) as string) : whole,
  );
}

const KEYWORDS: Record<string, string[]> = {
  bash: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'export', 'local', 'echo', 'set'],
  powershell: ['if', 'else', 'elseif', 'foreach', 'while', 'function', 'return', 'param', 'try', 'catch', 'finally', 'switch', 'Write-Host'],
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'class', 'lambda', 'None', 'True', 'False', 'print', 'raise', 'pass'],
  javascript: ['function', 'return', 'if', 'else', 'for', 'while', 'const', 'let', 'var', 'class', 'import', 'from', 'export', 'async', 'await', 'try', 'catch', 'finally', 'new', 'this', 'null', 'true', 'false'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'CREATE', 'TABLE', 'AND', 'OR', 'NOT', 'NULL', 'AS'],
  yaml: ['true', 'false', 'null'],
  json: ['true', 'false', 'null'],
  dockerfile: ['FROM', 'RUN', 'COPY', 'ADD', 'ENV', 'ARG', 'WORKDIR', 'EXPOSE', 'ENTRYPOINT', 'CMD', 'USER', 'VOLUME', 'HEALTHCHECK', 'LABEL'],
};

const COMMENT: Record<string, RegExp | undefined> = {
  bash: /#[^\n]*/g,
  powershell: /#[^\n]*/g,
  python: /#[^\n]*/g,
  yaml: /#[^\n]*/g,
  dockerfile: /#[^\n]*/g,
  javascript: /\/\/[^\n]*/g,
  sql: /--[^\n]*/g,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escaped HTML with `tok-comment` / `tok-string` / `tok-kw` / `tok-num` / `tok-var`
 * spans. Single pass over token candidates so a keyword inside a string stays a string.
 */
// eslint-disable-next-line complexity
export function highlightScript(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const parts: RegExp[] = [];
  const comment = COMMENT[language];
  if (comment !== undefined) {
    parts.push(comment);
  }
  // Strings after escaping: quotes survive escaping as &quot; for ", keep ' literal.
  parts.push(/&quot;(?:[^&]|&(?!quot;))*?&quot;/g);
  parts.push(/'[^'\n]*'/g);
  parts.push(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g);
  const kws = KEYWORDS[language] ?? [];
  if (kws.length > 0) {
    parts.push(new RegExp('\\b(?:' + kws.join('|') + ')\\b', language === 'sql' ? 'gi' : 'g'));
  }
  parts.push(/\b\d+(?:\.\d+)?\b/g);

  const combined = new RegExp(parts.map((r) => '(?:' + r.source + ')').join('|'), 'g' + (language === 'sql' ? 'i' : ''));

  // eslint-disable-next-line complexity
  return escaped.replace(combined, (match) => {
    if (comment !== undefined && new RegExp('^' + comment.source).test(match)) {
      return '<span class="tok-comment">' + match + '</span>';
    }
    if (match.startsWith('&quot;') || match.startsWith("'")) {
      return '<span class="tok-string">' + match + '</span>';
    }
    if (match.startsWith('${')) {
      return '<span class="tok-var">' + match + '</span>';
    }
    if (/^\d/.test(match)) {
      return '<span class="tok-num">' + match + '</span>';
    }
    return '<span class="tok-kw">' + match + '</span>';
  });
}

/**
 * The variables a script needs, delivered as PROCESS ENVIRONMENT rather than substituted
 * into its text.
 *
 * <p>`substituteScript` (kept below for reading a finished command back) bakes the real
 * values into a string. That string was written to a file on disk and rendered into the
 * viewer — so a script whose variables held a token put that token in both places, every
 * run, every panel open. Here the body keeps no value at all: each `${NAME}` becomes the
 * way THAT language reads an environment variable, and the values travel separately, in
 * the child process's own environment — the same channel `sshAskpass.ts` uses for an SSH
 * password, and for the same reason.</p>
 *
 * <p>A disabled variable stays a literal placeholder (it is deliberately not in play) and
 * an unknown one is left alone rather than translated into a read of nothing. A language
 * with no interpreter is left verbatim: nothing will ever read an environment there.</p>
 */

export interface ScriptEnvPlan {
  /** The script as it will be written and shown — free of every value. */
  body: string;
  /** NAME -> value, for the child process's environment only. */
  env: Record<string, string>;
}

const READS_ENV: Record<string, (name: string) => string> = {
  bash: (name) => '${' + name + '}',
  powershell: (name) => '$env:' + name,
  javascript: (name) => 'process.env.' + name,
  python: (name) => "os.environ.get('" + name + "', '')",
};

// eslint-disable-next-line complexity
export function resolveScriptEnv(
  body: string,
  vars: readonly CommandArg[] | undefined,
  language: string,
): ScriptEnvPlan {
  const env: Record<string, string> = {};
  for (const v of vars ?? []) {
    if (v.name !== undefined && v.name.length > 0 && v.disabled !== true) {
      env[v.name] = v.value;
    }
  }

  const read = READS_ENV[language];
  if (read === undefined) {
    return { body, env };
  }

  let translated = false;
  const out = body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    if (!(name in env)) {
      return whole;
    }
    translated = true;
    return read(name);
  });

  // Python cannot read os.environ without the import, and adding it unconditionally
  // would edit a script that needed nothing.
  const needsImport = language === 'python' && translated && !/^\s*import\s+os/m.test(out);
  return { body: needsImport ? 'import os' + String.fromCharCode(10) + out : out, env };
}

/**
 * Variables this script appears to PRINT rather than merely use.
 *
 * <p>Moving values into the environment keeps them out of the script file and out of the
 * viewer. It cannot stop the script from printing them — that is the user's own code, and
 * forbidding `echo` would gut the feature. So the honest move is to notice and say so
 * once, per exact script content.</p>
 *
 * <p>A heuristic, deliberately narrow: only a direct print of a variable counts. Passing
 * one to a tool (`curl -H "Auth: ${TOKEN}"`) is the normal, correct case, and warning
 * about it would teach people to dismiss the warning.</p>
 */
const PRINTS: Record<string, RegExp> = {
  bash: /(?:^|[;&|]|\bthen\b|\bdo\b)\s*(?:echo|printf)\s+[^\n]*/g,
  powershell: /(?:^|[;|])\s*(?:Write-Host|Write-Output|echo)\s+[^\n]*/g,
  python: /\bprint\s*\([^\n]*/g,
  javascript: /\bconsole\.(?:log|info|warn|error)\s*\([^\n]*/g,
};

// eslint-disable-next-line complexity
export function detectSecretPrints(
  body: string,
  variableNames: readonly string[],
  language: string,
): string[] {
  const pattern = PRINTS[language];
  if (pattern === undefined || variableNames.length === 0) {
    return [];
  }
  const found = new Set<string>();
  for (const line of body.match(pattern) ?? []) {
    for (const name of variableNames) {
      if (line.includes('${' + name + '}') || line.includes('$env:' + name) ||
          line.includes('process.env.' + name) || line.includes("environ.get('" + name + "'")) {
        found.add(name);
      }
    }
  }
  return [...found];
}
