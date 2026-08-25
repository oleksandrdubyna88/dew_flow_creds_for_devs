/**
 * The text "Share with Claude Code" puts on the clipboard: what the agent is
 * being given, the exact commands, and the two things a human should know
 * afterwards (it dies with the window; every call is logged).
 *
 * Pure, so the shape of the instructions is a unit test — the token appearing
 * once, both command forms present, the CLI path quoted for a path with
 * spaces, and no secret material anywhere (there is none to leak: the token is
 * a capability, not the credential).
 *
 * <p><b>One line for every shell, and it was measured rather than assumed.</b>
 * The same invocation was run through git-bash, Windows PowerShell 5.1 and
 * cmd.exe: all three deliver `-- "docker ps --format '{{.Names}}'"` as ONE
 * argv element with the inner single quotes intact, which is what the remote
 * shell needs. So the snippet does not branch per platform, and an agent has
 * one form to learn.</p>
 *
 * <p>The one real divergence is worth the line it costs: given inner DOUBLE
 * quotes, PowerShell 5.1 drops them and splits the argument — `'grep "server
 * name" f'` arrives as `grep server name f`. That is not a failure anyone
 * sees; it is a different command that runs successfully. Hence the rule in
 * the text: double quotes outside, single quotes inside.</p>
 */

export interface SnippetInput {
  entityName: string;
  /** `user@host[:port]` from `describeSshTarget`. */
  target: string;
  token: string;
  /** Absolute path to the compiled CLI, next to the running entry (`out/` or `dist/`). */
  cliPath: string;
}

export function buildAgentSnippet(input: SnippetInput): string {
  const cli = `node "${input.cliPath}"`;
  return [
    `You have SSH access to "${input.entityName}" (${input.target}) through CredsForDevs.`,
    `You never receive the credential itself — VS Code runs ssh for you and returns the output.`,
    '',
    'Run a command on the remote host (stdout, stderr and the exit code come back):',
    `  ${cli} ssh ${input.token} -- <command>`,
    '',
    'Examples:',
    `  ${cli} ssh ${input.token} -- uname -a`,
    `  ${cli} ssh ${input.token} -- "docker ps --format '{{.Names}}'"`,
    '',
    'These work as written in PowerShell, cmd and bash alike. When the remote command needs',
    'quoting, put double quotes around the whole of it and single quotes inside: inner DOUBLE',
    'quotes are dropped by Windows PowerShell, which silently changes what runs rather than',
    'failing — "grep \\"server name\\" f" arrives as: grep server name f.',
    '',
    'Open an interactive terminal for the human (not for you to type into):',
    `  ${cli} terminal ${input.token}`,
    '',
    `This token reaches "${input.entityName}" and nothing else in the vault, and it stops working`,
    'when that VS Code window closes. The first call asks the human to Allow or Deny it; every',
    'call after that runs silently and is logged in the "CredsForDevs: Agent Access" output panel.',
  ].join('\n');
}

/** What every snippet ends with: the two facts a human needs after pasting it. */
function footer(token: string): string[] {
  return [
    '',
    `This token reaches that one vault entry and nothing else, and it stops working`,
    'when that VS Code window closes. The first call asks the human to Allow or Deny it;',
    'every call after that runs silently and is logged in the "CredsForDevs: Agent Access"',
    'output panel.',
    '',
    `(token: ${token})`,
  ];
}

/**
 * The instructions for one kind — or `undefined` when that kind has no agent capability.
 *
 * <p>Per kind rather than one generic text because the agent has to be told the verb that
 * actually exists: a snippet offering `ssh <token> -- …` for a database is worse than no
 * snippet, since the agent will try it, get a 404, and have nothing to correct itself
 * with.</p>
 */
export function buildKindSnippet(
  kind: string,
  input: { entityName: string; token: string; cliPath: string },
): string | undefined {
  const cli = `node "${input.cliPath}"`;
  const name = input.entityName;
  const t = input.token;

  const head = (what: string): string[] => [
    `You have ${what} for "${name}" through CredsForDevs.`,
    'You never receive the credential itself — VS Code performs the action and returns',
    'only its output.',
    '',
  ];

  switch (kind) {
    case 'script':
      return [
        ...head('permission to run a stored script'),
        'Run it (stdout, stderr and the exit code come back):',
        `  ${cli} script ${t}`,
        '',
        'It runs exactly as saved — you cannot change the script or pass arguments, and',
        'its variables reach it through the environment without passing through you.',
        ...footer(t),
      ].join('\n');
    case 'terminal':
      return [
        ...head('permission to run a stored command'),
        'Run it:',
        `  ${cli} run ${t}`,
        '',
        'It runs exactly as saved — you cannot change the line or pass arguments.',
        ...footer(t),
      ].join('\n');
    case 'credential':
      return [
        ...head('permission to export a stored secret'),
        'Put it into the environment of new integrated terminals in this window:',
        `  ${cli} env ${t}`,
        '',
        'You get back the variable NAMES, never the values. Read them from the',
        'environment of a terminal opened afterwards in this VS Code window.',
        ...footer(t),
      ].join('\n');
    case 'vpn':
      return [
        ...head('permission to control a VPN tunnel'),
        'Bring it up or down:',
        `  ${cli} vpn-up ${t}`,
        `  ${cli} vpn-down ${t}`,
        '',
        'The tunnel needs administrator rights, so a prompt appears for the human to',
        'answer; the terminal it opens is theirs to watch.',
        ...footer(t),
      ].join('\n');
    case 'db':
      return [
        ...head('permission to query a database'),
        'Run a query (its output comes back as text):',
        `  ${cli} db ${t} -- "select 1"`,
        '',
        'The connection string and its password stay inside VS Code — you send SQL and',
        'receive the result.',
        ...footer(t),
      ].join('\n');
    default:
      return undefined;
  }
}
