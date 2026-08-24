import { CommandArg } from './types';

/**
 * Turning a pasted command line back into rows.
 *
 * <p>Nobody types an argument list into a form; they paste the line they already have.
 * A form that then asks them to re-key it row by row is a form used once. So the paste is
 * split here — and every guess it makes is written into a field the user can see and
 * correct, never applied invisibly.</p>
 *
 * <p>`parseCommandLine` is the inverse of `buildCommandLine`: a row keeps the RAW text of
 * its tokens, quotes included, so what was pasted is exactly what will run. A parse that
 * silently changes a command would be worse than no parse at all.</p>
 */

export interface Token {
  /** The token with its quoting removed — what the shell would pass to the program. */
  text: string;
  /** The token exactly as written, quotes intact. */
  raw: string;
}

export interface ParsedCommand {
  command: string;
  args: CommandArg[];
}

const QUOTE_SINGLE = "'";
const QUOTE_DOUBLE = '"';
const ESCAPE = '\\';

/** POSIX-ish tokenizer: quotes group, a backslash escapes the next character. */
export function splitTokens(input: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  let raw = '';
  let quote = '';
  let started = false;

  const flush = (): void => {
    if (started) {
      tokens.push({ text, raw });
    }
    text = '';
    raw = '';
    started = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quote === '' && (ch === ' ' || ch === '\t' || ch === '\n')) {
      flush();
      continue;
    }

    started = true;

    if (ch === ESCAPE && i + 1 < input.length && quote !== QUOTE_SINGLE) {
      raw += ch + input[i + 1];
      text += input[i + 1];
      i += 1;
      continue;
    }

    if (quote === '' && (ch === QUOTE_SINGLE || ch === QUOTE_DOUBLE)) {
      quote = ch;
      raw += ch;
      continue;
    }

    if (quote !== '' && ch === quote) {
      quote = '';
      raw += ch;
      continue;
    }

    raw += ch;
    text += ch;
  }
  flush();

  return tokens;
}

function isFlag(token: Token): boolean {
  return token.text.startsWith('-') && token.text.length > 1;
}

/**
 * Whether a token reads as a SUBCOMMAND (`sso`, `login`, `cp`) rather than a value
 * (`a.txt`, `s3://bucket`, `ubuntu:24.04`). There is no signal that settles this — a dot,
 * a slash or a colon says "value" and nothing says "subcommand" — so the rule is a guess
 * with a hard cap, and the result lands in an editable field.
 */
function isSubcommandish(token: Token): boolean {
  return /^[a-z][a-z0-9_-]*$/i.test(token.text);
}

/** How many words the verb may swallow before it is certainly eating arguments. */
const MAX_VERB_WORDS = 3;

export function parseCommandLine(input: string): ParsedCommand {
  // Half the commands in the world are copied out of a README with the prompt attached.
  const cleaned = input.trim().replace(/^[$>#]\s+/, '');
  const tokens = splitTokens(cleaned);
  if (tokens.length === 0) {
    return { command: '', args: [] };
  }

  let verbEnd = 1;
  while (
    verbEnd < tokens.length &&
    verbEnd < MAX_VERB_WORDS &&
    !isFlag(tokens[verbEnd]) &&
    isSubcommandish(tokens[verbEnd])
  ) {
    verbEnd += 1;
  }

  const command = tokens
    .slice(0, verbEnd)
    .map((t) => t.raw)
    .join(' ');

  const args: CommandArg[] = [];
  for (let i = verbEnd; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];

    // A flag takes the token after it as its value — unless that token is itself a flag,
    // in which case this one is a switch and stands alone.
    if (isFlag(token) && !token.text.includes('=') && next !== undefined && !isFlag(next)) {
      args.push({ value: token.raw + ' ' + next.raw });
      i += 1;
      continue;
    }

    args.push({ value: token.raw });
  }

  return { command, args };
}

/** The flag a row is about, for looking its meaning up in a help text. */
export function flagOf(value: string): string {
  const first = splitTokens(value)[0];
  if (first === undefined || !first.text.startsWith('-')) {
    return '';
  }
  const eq = first.text.indexOf('=');
  return eq === -1 ? first.text : first.text.slice(0, eq);
}
