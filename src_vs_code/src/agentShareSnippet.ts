/**
 * The text "Share with Claude Code" puts on the clipboard: what the agent is
 * being given, the exact commands, and the two things a human should know
 * afterwards (it dies with the window; every call is logged).
 *
 * Pure, so the shape of the instructions is a unit test — the token appearing
 * once, both command forms present, the CLI path quoted for a path with
 * spaces, and no secret material anywhere (there is none to leak: the token is
 * a capability, not the credential).
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
    'Open an interactive terminal for the human (not for you to type into):',
    `  ${cli} terminal ${input.token}`,
    '',
    `This token reaches "${input.entityName}" and nothing else in the vault, and it stops working`,
    'when that VS Code window closes. The first call asks the human to Allow or Deny it; every',
    'call after that runs silently and is logged in the "CredsForDevs: Agent Access" output panel.',
  ].join('\n');
}
