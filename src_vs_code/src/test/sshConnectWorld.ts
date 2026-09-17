import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * The human Connect path (audit A3).
 *
 * <p>This module decides HOW a credential reaches `ssh`, and the three ways differ in what
 * they leave behind. That is the whole reason it is worth testing as a sequence rather than as
 * a result: nothing it returns tells you whether a decrypted key was written to disk, or
 * whether it was wiped afterwards.</p>
 *
 * <ul>
 *   <li><b>The agent serves the key.</b> Nothing is written at all — no `-i`, no file. Writing
 *       one anyway would defeat the feature precisely where someone could see it working.</li>
 *   <li><b>A stored key.</b> Materialised to a 0600 file, and wiped when the terminal closes.
 *       A missed wipe leaves a decrypted private key on disk for the life of the window.</li>
 *   <li><b>A password.</b> It rides the terminal's ENVIRONMENT through askpass — never a file,
 *       never the command line — and in a FRESH terminal, because reusing one would run the
 *       new session with the previous entity's credentials.</li>
 * </ul>
 *
 * <p>Its collaborators are substituted, which is what makes the sequence observable: the point
 * is not what `materializePrivateKey` does (that is `keyInstaller.test.ts`) but whether this
 * module calls it, and whether it calls `forgetMaterializedKey` afterwards.</p>
 */

export type Connect = typeof import('../sshConnect');

export interface Terminal {
  name: string;
  sent: string[];
  env?: Record<string, string>;
  disposed: boolean;
  exitStatus?: unknown;
}

export interface World {
  mod: Connect;
  materialised: string[];
  forgotten: string[];
  /** Terminals opened through `openSshTerminal`, with the key path each was given. */
  sshTerminals: { keyPath: string | undefined; options: unknown; platform?: string; prefix?: string }[];
  created: Terminal[];
  existing: Terminal[];
  warnings: string[];
  /** The button labels each warning offered, in order. */
  offered: string[][];
  errors: string[];
  /** Fires the onDidCloseTerminal listeners with a terminal. */
  closeTerminal(t: unknown): void;
  /** What `openSshTerminal` returned — the terminal the wipe is registered against. */
  sshTerminalHandle?: unknown;
}

export interface Parts {
  source: Record<string, unknown>;
  /** undefined = the host key was refused, so the connection must not proceed. */
  options?: Record<string, unknown>;
  materialiseFails?: boolean;
  /** What `openSshTerminal` hands back; undefined = it could not open one. */
  sshTerminal?: unknown;
  existingNamed?: string;
  /** What the fake distribution answers when asked where a Windows path is. */
  translated?: string;
  /** Press the button every refusal offers, so the remedy-and-retry path runs. */
  chooseButton?: boolean;
}

export function world(parts: Parts): World {
  const closeListeners: ((t: unknown) => void)[] = [];
  const w: World = {
    mod: undefined as never,
    materialised: [],
    forgotten: [],
    sshTerminals: [],
    created: [],
    existing: [],
    warnings: [],
    offered: [],
    errors: [],
    closeTerminal: (t: unknown): void => closeListeners.forEach((l) => l(t)),
  };
  if (parts.existingNamed !== undefined) {
    const stale: Terminal = { name: parts.existingNamed, sent: [], disposed: false };
    Object.assign(stale, {
      dispose: (): void => {
        stale.disposed = true;
      },
    });
    w.existing.push(stale);
  }
  // The object `openSshTerminal` hands back. A test closes THIS one, because the wipe is
  // registered against it and must not fire for anybody else's terminal.
  const opened = parts.sshTerminal === undefined ? undefined : { name: 'ssh', dispose: (): void => undefined };
  w.sshTerminalHandle = opened;

  w.mod = loadWithVscode<Connect>(
    '../sshConnect',
    {
      window: {
        terminals: w.existing,
        createTerminal: (o: { name: string; env?: Record<string, string> }): Terminal => {
          const t: Terminal = { name: o.name, env: o.env, sent: [], disposed: false };
          Object.assign(t, {
            show: (): void => undefined,
            sendText: (line: string): void => {
              t.sent.push(line);
            },
            dispose: (): void => {
              t.disposed = true;
            },
          });
          w.created.push(t);
          return t;
        },
        onDidCloseTerminal: (listener: (t: unknown) => void): { dispose(): void } => {
          closeListeners.push(listener);
          return { dispose: (): void => undefined };
        },
        showWarningMessage: (m: string, ...rest: unknown[]): Promise<string | undefined> => {
          w.warnings.push(m);
          const labels = rest.filter((r): r is string => typeof r === 'string');
          w.offered.push(labels);
          // `chooseButton` presses the offered button, so the remedy-and-retry path is drivable.
          return Promise.resolve(parts.chooseButton === true ? labels[0] : undefined);
        },
        showErrorMessage: (m: string): Promise<undefined> => {
          w.errors.push(m);
          return Promise.resolve(undefined);
        },
      },
    },
    {
      './sshCredential': {
        resolveSshCredential: (): Promise<unknown> => Promise.resolve(parts.source),
      },
      './connectionOptions': {
        connectionOptions: (): Promise<unknown> => Promise.resolve(parts.options),
      },
      './keyInstaller': {
        materializePrivateKey: (_dir: string, entityId: string): string => {
          if (parts.materialiseFails === true) {
            throw new Error('disk full');
          }
          const path = `/storage/keys/${entityId}.key`;
          w.materialised.push(path);
          return path;
        },
        forgetMaterializedKey: (path: string): void => {
          w.forgotten.push(path);
        },
        writeAskpassScriptFile: (): string => '/storage/keys/askpass.sh',
      },
      './wslProcess': {
        // Never a real `wsl.exe` in a unit test. '' is the module's own "it would not say".
        translateWindowsPath: (_distro: string, windowsPath: string): Promise<string> =>
          Promise.resolve(parts.translated ?? `/mnt/c${windowsPath}`),
      },
      './terminalManager': {
        openSshTerminal: (
          entity: { sshKeyPath?: string },
          options: unknown,
          platform?: string,
          prefix?: string,
        ): unknown => {
          w.sshTerminals.push({ keyPath: entity.sshKeyPath, options, platform, prefix });
          return opened;
        },
        buildSshCommand: (entity: { host?: string }): string | undefined =>
          entity.host === undefined ? undefined : `ssh ${String(entity.host)}`,
        describeSshTarget: (entity: { host?: string }): string | undefined => entity.host,
      },
      './sshAskpass': {
        askpassEnv: (script: string, password: string): Record<string, string> => ({
          SSH_ASKPASS: script,
          SSH_ASKPASS_REQUIRE: 'force',
          CREDS_PASSWORD: password,
        }),
      },
    },
  );
  return w;
}


export const entity = (extra: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'prod', kind: 'ssh', host: 'prod.corp.com', ...extra }) as unknown as EntityMetadata;

export const storage = {} as never;
export const OPTIONS = { knownHostsFile: undefined };

/** The shape materializeKnownHosts actually writes: keys/<pid>/, which is what the deletion guard keys on. */
export const OUR_PIN = `/storage/keys/${process.pid}/known_hosts-e1`;

/**
 * `hostPlatform` is PINNED, and CI is why.
 *
 * <p>The refusal's heading names the machine the extension host is on. Left to `process.platform`,
 * the assertion reads "(Windows)" on the machine the report came from and "(Linux)" on the Ubuntu
 * runner — green here, red there, for a reason that is about neither the window nor the code. A WSL
 * window already means the host is Windows, so pinning it states a fact rather than arranging one.</p>
 */
export const WSL_NO_RELAY = {
  side: { kind: 'wsl' as const, distro: 'Ubuntu' },
  relay: { enabled: false, running: false, socket: '' },
  hostPlatform: 'win32' as NodeJS.Platform,
};

export const WSL_READY = {
  side: { kind: 'wsl' as const, distro: 'Ubuntu' },
  relay: { enabled: true, running: true, socket: '/run/user/1000/creds-agent.sock' },
  hostPlatform: 'win32' as NodeJS.Platform,
};

/** A machine with the built-in Windows OpenSSH, which is every Windows 10/11 since 2018. */
export const WSL_WINDOWS_CLIENT = {
  ...WSL_NO_RELAY,
  windowsClient: '/mnt/c/Windows/System32/OpenSSH/ssh.exe',
};
