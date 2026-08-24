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
  /** Absolute path to the compiled CLI (`out/agentCli.js`). */
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
