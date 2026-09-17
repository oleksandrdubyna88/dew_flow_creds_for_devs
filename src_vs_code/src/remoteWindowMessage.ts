import { RefusalReason } from './remoteRoute';

/**
 * What to SAY when a Connect click cannot be honoured in this window, and which button fixes it.
 *
 * <p><b>Why the wording is its own module with its own tests.</b> `wslRelayReadiness.ts` exists
 * because an operator did everything right and was told only <i>communication with agent failed</i>,
 * with the real reason in a log nobody had reason to open. This is the same lesson one layer up: the
 * defect being fixed here USED to produce
 * <code>Identity file c:\Users\…\keys\23284\&lt;guid&gt;.key not accessible</code> — a true sentence
 * that names nothing a person can act on, because the interesting fact is not the missing file but
 * that the file is on a different computer from the shell looking for it.</p>
 *
 * <p>So every message here does two things the old one did not: it <b>names both machines</b>, and
 * it <b>lists everything that is missing at once</b> rather than one thing per attempt.</p>
 *
 * <p>The button comes from the FIRST reason, which is why `remoteRoute` returns an ordered list
 * rather than a set: the order is "what must be fixed first", and the primary action follows it.</p>
 *
 * <p>Pure, and imports no `vscode`: it names an ACTION, not a command id, so the call site keeps the
 * `vscode.commands.executeCommand` and this stays unit-testable.</p>
 */

export type RefusalAction =
  | 'setUpRelay'
  | 'addKeyToAgent'
  | 'copyWindowsCommand'
  | 'chooseDistribution'
  | 'retry'
  | 'openRemoteBridge';

export interface RefusalButton {
  readonly label: string;
  readonly action: RefusalAction;
}

export interface RefusalContext {
  /** The distribution, when one could be named. */
  readonly distro: string;
  /** `vscode.env.remoteName` — what KIND of remote this window is. */
  readonly remoteName: string;
  /** What this machine is, in a word a person recognises: `win32` → Windows. */
  readonly hostPlatform: NodeJS.Platform;
}

export interface RemoteRefusal {
  readonly message: string;
  readonly buttons: readonly RefusalButton[];
}

/** Exported so the call site and the help article quote the SAME strings rather than retyping them. */
export const BUTTON_LABELS: Readonly<Record<RefusalAction, string>> = {
  // DEC-1: the button FIXES it rather than sending the person to the palette — the setup command is
  // idempotent and asks before touching anything, and the call site retries the connect once when it
  // returns. It is not called "Turn It On and Connect" because that command opens a distribution
  // picker and a readiness check first, and a label may not promise a silence it will not deliver.
  //
  // It says "and Connect" ONLY when the relay is the last thing missing — see `relayLabel`.
  setUpRelay: 'Set Up the Relay and Connect',
  addKeyToAgent: 'Add Key to Agent',
  copyWindowsCommand: 'Copy the Windows Command',
  chooseDistribution: 'Choose a Distribution…',
  retry: 'Try Again',
  openRemoteBridge: 'Open Remote Bridge…',
};

/**
 * The whole refusal: one sentence naming the two machines, one line per missing piece, one button.
 *
 * <p>`reasons` is `remoteRoute`'s ordered list and is never empty.</p>
 */
export function refusalFor(
  reasons: readonly RefusalReason[],
  context: RefusalContext,
): RemoteRefusal {
  const lines = reasons.map((reason) => `• ${sentenceFor(reason, context)}`);
  return {
    message: [whichMachineIsWhich(context), ...lines].join('\n'),
    buttons: buttonsFor(reasons),
  };
}

/**
 * The line that was missing from the original failure, and the reason this module exists.
 *
 * <p>"Identity file … not accessible" is true and useless: the file is exactly where it was put. The
 * fact worth saying is that the extension and the terminal are on two different computers.</p>
 */
function whichMachineIsWhich(context: RefusalContext): string {
  return (
    `CredsForDevs runs on this computer (${machineName(context.hostPlatform)}), ` +
    `while this window's terminal runs in ${whereTheTerminalIs(context)}. ` +
    'Your keys are held on this computer, so a path to one means nothing to that shell.'
  );
}

function whereTheTerminalIs(context: RefusalContext): string {
  if (context.remoteName !== 'wsl') {
    return `a ${context.remoteName} window`;
  }
  return context.distro.length > 0 ? `WSL (${context.distro})` : 'WSL';
}

/** `win32` → `Windows`. Said the way a person says it, not the way Node spells it. */
function machineName(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'Windows';
  }
  return platform === 'darwin' ? 'macOS' : 'Linux';
}

// One sentence per reason. Each says what is true AND what it means for this click — a message that
// leaves someone unable to act is a message they learn to dismiss.
function sentenceFor(reason: RefusalReason, context: RefusalContext): string {
  return SENTENCES[reason](context);
}

const SENTENCES: Readonly<Record<RefusalReason, (context: RefusalContext) => string>> = {
  'not-wsl': (context) =>
    `Nothing bridges a ${context.remoteName} window to the keys on this computer yet — only WSL is ` +
    'reachable, through the agent relay. For a Remote-SSH host, install `creds` there and open the ' +
    'Remote Bridge instead.',
  'distro-ambiguous':
    () =>
      'This window has folders in more than one WSL distribution, so there is no single one to ask ' +
      'for the key — and picking one of them would silently use the wrong agent.',
  'distro-unknown':
    () =>
      'This window has no folder open, and more than one distribution is set up, so there is no way ' +
      'to tell which one this terminal is in.',
  'relay-off': (context) =>
    `The WSL agent relay is switched off, so ${context.distro.length > 0 ? context.distro : 'WSL'} ` +
    'cannot reach the SSH agent on this computer. Turning it on is what makes this connection ' +
    'possible without the key ever entering the distribution.',
  'relay-not-running':
    () =>
      'The WSL agent relay is switched on but is not listening yet — usually `creds` is not ' +
      'installed inside the distribution, which the setup command checks and says.',
  'agent-has-no-key':
    () =>
      'This key is not loaded into the SSH agent. The relay carries the agent, not the file, so the ' +
      'key has to be in the agent for the connection to use it.',
  'credential-is-a-password':
    () =>
      'This entry authenticates with a PASSWORD, which is supplied through a helper script written ' +
      'on this computer — a path that shell cannot run. Connect from a window on this computer, or ' +
      'give the entry a key.',
  'credential-is-a-key-path':
    () =>
      'This entry points at a key FILE on this computer rather than one held in the vault. Only a ' +
      'vault key can be served through the agent, and a Windows path is not readable as a key from ' +
      'that shell.',
  'known-hosts-translation-failed': (context) =>
    `This host's key is pinned, and ${context.distro.length > 0 ? context.distro : 'the distribution'} ` +
    'did not answer when asked where that file is. Connecting without the pin would drop the very ' +
    'check the pin exists for, so the connection was refused instead.',
};

/**
 * The button, from the FIRST reason.
 *
 * <p>One primary action, never a row of them: the list is ordered by what must be fixed first, and
 * offering the third fix beside the first invites someone to start in the wrong place.</p>
 */
function buttonsFor(reasons: readonly RefusalReason[]): readonly RefusalButton[] {
  const first = reasons[0];
  const action = first === undefined ? undefined : ACTIONS[first];
  if (action === undefined) {
    return [];
  }
  return [{ label: labelFor(action, reasons), action }];
}

/**
 * The relay button drops its promise when the relay is NOT the last thing missing.
 *
 * <p>Found by the plan round, and it is the kind of defect a label invites: `setUpWslRelay` starts
 * the relay, it does not put this key into the agent. So on a refusal that reads "the relay is off
 * AND the agent does not hold this key", a button saying <i>and Connect</i> would set the relay up,
 * retry, and land the person on a second refusal — having promised the opposite. When the relay is
 * the only thing missing the promise is true and worth making; otherwise the button says what it
 * does and the next refusal offers the next button.</p>
 */
function labelFor(action: RefusalAction, reasons: readonly RefusalReason[]): string {
  if (action !== 'setUpRelay' || reasons.length === 1) {
    return BUTTON_LABELS[action];
  }
  return RELAY_ONLY_LABEL;
}

/** What the relay button says when fixing it will NOT be enough to connect. */
export const RELAY_ONLY_LABEL = 'Set Up the WSL Agent Relay';

const ACTIONS: Readonly<Record<RefusalReason, RefusalAction | undefined>> = {
  'not-wsl': 'openRemoteBridge',
  'distro-ambiguous': 'chooseDistribution',
  'distro-unknown': 'chooseDistribution',
  'relay-off': 'setUpRelay',
  'relay-not-running': 'setUpRelay',
  'agent-has-no-key': 'addKeyToAgent',
  'credential-is-a-password': 'copyWindowsCommand',
  'credential-is-a-key-path': 'copyWindowsCommand',
  'known-hosts-translation-failed': 'retry',
};
