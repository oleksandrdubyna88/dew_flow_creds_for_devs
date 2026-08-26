/**
 * What the CLI prints, and what it exits with, once the broker has answered 200.
 *
 * <p>Pure and separate from `agentCli.ts` for two reasons. It was untestable inside `main`,
 * which is how the defect below survived; and it is the half of the wire contract that a
 * second implementation in another language has to reproduce exactly. An agent reads the exit
 * code and decides what to do next, so "this succeeded" meaning `0` in one client and `95` in
 * another is not a cosmetic difference between them.</p>
 *
 * <p><b>The defect this replaced.</b> `main` special-cased `terminal`, then treated every other
 * answer as `Partial<ExecResponseBody>` and finished with
 * `typeof body.exitCode === 'number' ? body.exitCode : EXIT.brokerFailure`. But
 * `credential:exportEnv` answers `{written}` and `vpn:up`/`down` answer `{opened}` — neither
 * carries an `exitCode`. So all three reported a **successful** call as failure 95 and printed
 * nothing at all, and no test in the suite covered any of them. A table keyed by verb replaces
 * the fall-through, because a verb nobody taught this about should be a visible gap rather
 * than a silent failure.</p>
 */

export const EXIT = {
  usage: 96,
  brokerUnreachable: 90,
  unknownToken: 91,
  denied: 92,
  entityGone: 93,
  busy: 94,
  brokerFailure: 95,
  consentTimeout: 97,
  remoteTimeout: 98,
  toolMissing: 99,
  /** The call worked and the human declined the action. Distinct from a mechanism failure. */
  refused: 89,
} as const;

export interface CliOutcome {
  readonly stdout: string;
  readonly stderr: string;
  /** Lines the CLI prefixes and sends to stderr — context, never data the agent should parse. */
  readonly notes: readonly string[];
  readonly exitCode: number;
}

type Body = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function truncationNotes(body: Body): string[] {
  return body.stdoutTruncated === true || body.stderrTruncated === true
    ? ['output was truncated at the size ceiling and the command was stopped.']
    : [];
}

/**
 * The code an exec-shaped answer ends with.
 *
 * <p>No code at all really is a broker that did not do its job — this is the one verb family
 * for which the original fall-through to `brokerFailure` was correct, which is why it is kept
 * here rather than removed with the rest of it.</p>
 */
function execExitCode(body: Body): number {
  if (body.timedOut === true) {
    return EXIT.remoteTimeout;
  }
  return typeof body.exitCode === 'number' ? body.exitCode : EXIT.brokerFailure;
}

/** An exec-shaped answer: the remote command's own output and its own exit code. */
function fromExec(body: Body): CliOutcome {
  const notes = truncationNotes(body);
  if (body.timedOut === true) {
    notes.push('the remote command hit the time ceiling and was terminated.');
  }
  return {
    stdout: str(body.stdout),
    stderr: str(body.stderr),
    notes,
    exitCode: execExitCode(body),
  };
}

function fromTerminal(): CliOutcome {
  return {
    stdout: "An SSH terminal is now open in the human's VS Code window.\n",
    stderr: '',
    notes: [],
    exitCode: 0,
  };
}

/** The names that were exported — never the values, which the agent must not receive. */
function fromEnv(body: Body): CliOutcome {
  const written = Array.isArray(body.written) ? body.written.filter((n) => typeof n === 'string') : [];
  if (written.length === 0) {
    return {
      stdout: '',
      stderr: '',
      notes: ['no variables were exported — the entry has nothing bound to a name.'],
      exitCode: 0,
    };
  }
  return {
    stdout: `${written.join('\n')}\n`,
    stderr: '',
    notes: [
      `${written.length} variable(s) are set in integrated terminals opened after this, in that VS Code window only. You receive the names, never the values.`,
    ],
    exitCode: 0,
  };
}

/**
 * A tunnel action. `opened: false` is a 200 — the call worked and the person said no.
 *
 * <p>Exiting 0 there would tell the agent the tunnel is up when it is not, and it would then
 * act on that. A refusal gets its own code so it cannot be confused with either success or a
 * mechanism failure.</p>
 */
function fromVpn(kind: string, body: Body): CliOutcome {
  const verb = kind === 'vpn-down' ? 'brought down' : 'brought up';
  return body.opened === true
    ? { stdout: `The VPN tunnel was ${verb}.\n`, stderr: '', notes: [], exitCode: 0 }
    : {
        stdout: '',
        stderr: `The VPN tunnel was not ${verb}: the human refused it, or the client could not start.\n`,
        notes: [],
        exitCode: EXIT.refused,
      };
}

const BY_KIND = new Map<string, (kind: string, body: Body) => CliOutcome>([
  ['exec', (_k, b) => fromExec(b)],
  ['db', (_k, b) => fromExec(b)],
  ['run', (_k, b) => fromExec(b)],
  ['script', (_k, b) => fromExec(b)],
  ['terminal', () => fromTerminal()],
  ['env', (_k, b) => fromEnv(b)],
  ['vpn-up', (k, b) => fromVpn(k, b)],
  ['vpn-down', (k, b) => fromVpn(k, b)],
]);

/** How a 200 for this verb should be reported. An unknown verb is a gap, and says so. */
export function interpretSuccess(kind: string, body: Body): CliOutcome {
  const handler = BY_KIND.get(kind);
  return handler === undefined
    ? {
        stdout: '',
        stderr: '',
        notes: [`this build does not know how to report the result of "${kind}".`],
        exitCode: EXIT.brokerFailure,
      }
    : handler(kind, body);
}
