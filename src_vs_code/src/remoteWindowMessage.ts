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
    message: [whichMachineIsWhich(context, reasons), ...lines].join('\n'),
    buttons: buttonsFor(reasons),
  };
}

/**
 * The line that was missing from the original failure, and the reason this module exists.
 *
 * <p>"Identity file … not accessible" is true and useless: the file is exactly where it was put. The
 * fact worth saying is that the extension and the terminal are on two different computers.</p>
 */
function whichMachineIsWhich(
  context: RefusalContext,
  reasons: readonly RefusalReason[],
): string {
  // Only which machine is which. The key sentence used to live here too, and the code round was
  // right that it is a claim: a refusal for an unresolved distribution, or for an entity with no
  // credential at all, is not about a key, and sending that reader looking for one wastes the very
  // attention this heading exists to direct. It belongs to the reasons that are about a key.
  return (
    `CredsForDevs runs on this computer (${machineName(context.hostPlatform)}), ` +
    `while this window's terminal runs in ${whereTheTerminalIs(context, reasons)}.`
  );
}

/**
 * Where the terminal is, named as precisely as the refusal allows.
 *
 * <p>The distribution is deliberately NOT named when the refusal is that we could not work out
 * which distribution this is: a heading reading "WSL (Ubuntu)" above a line reading "this window
 * has folders in more than one distribution" points the reader at the one thing the message has
 * just said it cannot identify.</p>
 */
function whereTheTerminalIs(
  context: RefusalContext,
  reasons: readonly RefusalReason[],
): string {
  if (context.remoteName !== 'wsl') {
    return `a remote window (${context.remoteName})`;
  }
  const unresolved =
    reasons.includes('distro-ambiguous') || reasons.includes('distro-unknown');
  return context.distro.length > 0 && !unresolved ? `WSL (${context.distro})` : 'WSL';
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
  // The remedy differs by remote kind, so the sentence is built from it rather than assuming
  // Remote-SSH — a person in a dev container was being told to install `creds` on an SSH host.
  'not-wsl': (context) =>
    `Your keys are held on this computer, and nothing bridges a ${context.remoteName} window to ` +
    `them yet — only WSL is reachable, through the agent relay. ${remedyForRemote(context.remoteName)}`,
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
      'The WSL agent relay is switched on but is not listening. It may still be starting, so trying ' +
      'again in a moment is worth one attempt; if it keeps saying this, `creds` is most likely not ' +
      'installed inside the distribution — the setup command checks that and names what is missing.',
  'agent-has-no-key':
    () =>
      'This key is not loaded into the SSH agent. The relay carries the agent, not the file, so your ' +
      'key stays on this computer and has to be IN the agent for the connection to use it.',
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
  'relay-socket-unusable':
    () =>
      'The relay is listening, but at a path this connection cannot safely put in front of a ' +
      'command — it contains a quote. Rather than run `ssh` without the agent, which would silently ' +
      'fall back to whatever keys that shell already has, the connection was refused. Set ' +
      '`CREDS_RELAY_SOCKET` to a path without quotes and start the relay again.',
  // "Try Again" on its own is a loop, which the code round was right to call out: say what would
  // have to change between the two attempts.
  'known-hosts-translation-failed': (context) =>
    `This host's key is pinned, and ${context.distro.length > 0 ? context.distro : 'the distribution'} ` +
    'did not answer when asked where that file is — usually it is stopped or still starting. ' +
    'Connecting without the pin would drop the very check the pin exists for, so the connection was ' +
    'refused instead. Open a terminal there to wake it, then try again.',
};

/** What to do instead, per remote kind — only Remote-SSH has a bridge to point at. */
function remedyForRemote(remoteName: string): string {
  if (remoteName === 'ssh-remote') {
    return 'Install `creds` on that host and open the Remote Bridge instead.';
  }
  return 'Connect from a window running on this computer, or use an entry that needs no key.';
}

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
 * The relay button promises a connection only when switching the relay ON is the whole fix.
 *
 * <p>Found twice, by both gate rounds, and it is the kind of defect a label invites.</p>
 *
 * <p>First: `setUpWslRelay` starts the relay, it does not put this key into the agent. So on a
 * refusal reading "the relay is off AND the agent does not hold this key", <i>and Connect</i> would
 * set the relay up, retry, and land the person on a second refusal — having promised the
 * opposite.</p>
 *
 * <p>Second, and the one the first fix missed: `relay-not-running` means the relay is ALREADY
 * switched on and still is not listening — usually because something inside the distribution is
 * wrong. Running the setup again may well not fix it, so that reason never promises a connection
 * even when it stands alone.</p>
 */
function labelFor(action: RefusalAction, reasons: readonly RefusalReason[]): string {
  if (action !== 'setUpRelay') {
    return BUTTON_LABELS[action];
  }
  const relayIsTheWholeFix = reasons.length === 1 && reasons[0] === 'relay-off';
  return relayIsTheWholeFix ? BUTTON_LABELS.setUpRelay : RELAY_ONLY_LABEL;
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
  'relay-socket-unusable': 'setUpRelay',
  'known-hosts-translation-failed': 'retry',
};
