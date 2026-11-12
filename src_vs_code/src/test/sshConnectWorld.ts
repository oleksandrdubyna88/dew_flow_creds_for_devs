import { loadEachWithVscode } from './vscodeStub';
import { EntityMetadata, TreeNode } from '../types';
import { StorageManager } from '../storageManager';
import * as sshProgram from '../sshProgram';
import { FolderColorFake, folderColorStorage } from './folderColorStorage';

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
export type Seam = typeof import('../sshSession');

export interface Terminal {
  name: string;
  sent: string[];
  env?: Record<string, string>;
  /** The `color` the terminal was created with; the property is absent when the options carried none. */
  color?: { id: string };
  disposed: boolean;
  exitStatus?: unknown;
}

export interface World {
  mod: Connect;
  /** `sshSession` from the SAME graph as `mod`, so both see one set of mocks. */
  seam: Seam;
  materialised: string[];
  /** The opener each credential resolution was handed — a click opener on the human path (entry-PIN plan, D6). */
  openers: unknown[];
  forgotten: string[];
  /** Terminals opened through `openSshTerminal`, with the key path each was given. */
  sshTerminals: { keyPath: string | undefined; options: unknown; platform?: string; prefix?: string; title?: string; place?: { title: string; accountId: string; color?: string } }[];
  created: Terminal[];
  existing: Terminal[];
  warnings: string[];
  /** The button labels each warning offered, in order. */
  offered: string[][];
  errors: string[];
  /** Every path handed to the distribution for translation, in order. */
  translated: { distro: string; windowsPath: string }[];
  /** Fires the onDidCloseTerminal listeners with a terminal. */
  closeTerminal(t: unknown): void;
  /** What `openSshTerminal` returned — the terminal the wipe is registered against. */
  sshTerminalHandle?: unknown;
  /** Every install offer made, with the gate it was handed — only when the world says ssh is missing. */
  installOffers: { tool: string; startGate?: AbortSignal }[];
  /** The gate each host-key conversation (`connectionOptions`) was handed, in order (E4.S4). */
  hostKeyAsked: (AbortSignal | undefined)[];
  /** The per-session suffix each host-key conversation was handed, in order (E1.S3 `isolate`). */
  pinSuffixes: (string | undefined)[];
  /** Every line put on the clipboard — a refusal's *Copy the Windows command* button. */
  copied: string[];
}

export interface Parts {
  source: Record<string, unknown>;
  /** undefined = the host key was refused, so the connection must not proceed. */
  options?: Record<string, unknown>;
  materialiseFails?: boolean;
  /** The options answer WHEN it depends on the session's suffix (`isolate`): the pin file name carries it. Wins over `options`. */
  pinFor?: (suffix: string | undefined) => Record<string, unknown>;
  /** What `openSshTerminal` hands back; undefined = it could not open one. */
  sshTerminal?: unknown;
  existingNamed?: string;
  /** What the fake distribution answers when asked where a Windows path is. */
  translated?: string;
  /** What the distribution answers when asked whether an adopted socket is still there. */
  socketAlive?: boolean;
  /** Press the button every refusal offers, so the remedy-and-retry path runs. */
  chooseButton?: boolean;
  /** Runs while the credential is being looked up — where an agent's client can leave (E4.S1). */
  duringLookup?: () => void;
  /** This machine has no ssh client, so the connect path offers to install one (E4.S3). */
  sshMissing?: boolean;
  /** Runs while the host-key conversation is open — where an agent's client can leave (E4.S4). */
  duringHostKey?: () => void;
  /** Runs while a refusal's modal is open, before the person's button is read (E4.S4). */
  duringRefusal?: () => void;
  /** Runs while the distribution is asked to translate a path — the last await before a late refusal (E4.S4). */
  duringTranslate?: () => void;
}

export function world(parts: Parts): World {
  const closeListeners: ((t: unknown) => void)[] = [];
  const w: World = {
    mod: undefined as never,
    seam: undefined as never,
    materialised: [],
    openers: [],
    forgotten: [],
    sshTerminals: [],
    created: [],
    existing: [],
    warnings: [],
    offered: [],
    errors: [],
    translated: [],
    installOffers: [],
    hostKeyAsked: [],
    pinSuffixes: [],
    copied: [],
    closeTerminal: (t: unknown): void => closeListeners.forEach((l) => l(t)),
  };
  if (parts.existingNamed !== undefined) {
    w.existing.push(staleTerminal(parts.existingNamed));
  }
  // The object `openSshTerminal` hands back. A test closes THIS one, because the wipe is
  // registered against it and must not fire for anybody else's terminal.
  const opened = parts.sshTerminal === undefined ? undefined : { name: 'ssh', dispose: (): void => undefined };
  w.sshTerminalHandle = opened;

  const [mod, seam] = loadEachWithVscode(
    ['../sshConnect', '../sshSession'],
    vscodeStub(w, parts, closeListeners),
    {
      './sshCredential': {
        resolveSshCredential: (_s: unknown, _a: unknown, _e: unknown, open: unknown): Promise<unknown> => {
          w.openers.push(open);
          parts.duringLookup?.();
          return Promise.resolve(parts.source);
        },
      },
      './connectionOptions': {
        // RECORDED with the gate it was handed: the host-key question is the agent's request's to refuse (E4.S4).
        connectionOptions: (
          _a: unknown,
          _e: unknown,
          _s: unknown,
          _d: unknown,
          startGate?: AbortSignal,
          suffix?: string,
        ): Promise<unknown> => {
          w.hostKeyAsked.push(startGate);
          w.pinSuffixes.push(suffix);
          parts.duringHostKey?.();
          return Promise.resolve(parts.pinFor === undefined ? parts.options : parts.pinFor(suffix));
        },
      },
      './keyInstaller': {
        materializePrivateKey: (_dir: string, entityId: string, _content: string, suffix?: string): string => {
          if (parts.materialiseFails === true) {
            throw new Error('disk full');
          }
          const path = `/storage/keys/${entityId}${suffix === undefined ? '' : `-${suffix}`}.key`;
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
        // An adopted relay is probed before its socket is used; a world says so with `socketAlive`.
        socketIsAlive: (): Promise<boolean> => Promise.resolve(parts.socketAlive !== false),
        translateWindowsPath: (distro: string, windowsPath: string): Promise<string> => {
          // RECORDED, because what is handed to the distribution is half the contract: a review found
          // a translation test whose Windows path had lost its separators to `\k` and `\s` before it
          // ever reached here, so it asserted a round trip of a string no Windows machine produces.
          w.translated.push({ distro, windowsPath });
          parts.duringTranslate?.();
          return Promise.resolve(parts.translated ?? `/mnt/c${windowsPath}`);
        },
      },
      // Which shell a composed ssh line gets (issue #103) is `pinnedTerminal`'s question and its own
      // tests'; here it is a fixed answer, so no real `where pwsh.exe` runs inside an SSH scenario.
      './pinnedTerminal': { composedShellPath: (): string | undefined => undefined },
      './terminalManager': {
        openSshTerminal: (
          entity: { sshKeyPath?: string },
          options: unknown,
          platform?: string,
          prefix?: string,
          place?: { title: string; accountId: string; color?: string },
        ): unknown => {
          w.sshTerminals.push({ keyPath: entity.sshKeyPath, options, platform, prefix, title: place?.title, place });
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
      ...missingSsh(w, parts.sshMissing === true),
    },
  );
  w.mod = mod as Connect;
  w.seam = seam as Seam;
  return w;
}


/** The `vscode` the connect path sees: terminals and dialogs that record, a clipboard that records (E4.S4). */
function vscodeStub(w: World, parts: Parts, closeListeners: ((t: unknown) => void)[]): Record<string, unknown> {
  return {
    window: {
      terminals: w.existing,
      createTerminal: (o: { name: string; env?: Record<string, string>; color?: { id: string } }): Terminal => {
        const t: Terminal = { name: o.name, env: o.env, sent: [], disposed: false, ...('color' in o ? { color: o.color } : {}) };
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
        // The client can leave while the modal sits open; the person's button is read after that.
        parts.duringRefusal?.();
        // `chooseButton` presses the offered button, so the remedy-and-retry path is drivable.
        return Promise.resolve(parts.chooseButton === true ? labels[0] : undefined);
      },
      showErrorMessage: (m: string): Promise<undefined> => {
        w.errors.push(m);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    env: {
      clipboard: {
        writeText: (text: string): Promise<void> => {
          w.copied.push(text);
          return Promise.resolve();
        },
      },
    },
  };
}

/** A terminal already open under `name` — one a fresh session must dispose rather than reuse. */
function staleTerminal(name: string): Terminal {
  const stale: Terminal = { name, sent: [], disposed: false };
  Object.assign(stale, {
    dispose: (): void => {
      stale.disposed = true;
    },
  });
  return stale;
}

/** No ssh client on this machine: the offer is recorded, never shown, and nothing is installed. */
function missingSsh(w: World, missing: boolean): Record<string, unknown> {
  if (!missing) {
    return {};
  }
  return {
    './sshProgram': { ...sshProgram, sshClientPresent: (): boolean => false },
    './toolEnsure': {
      offerToInstall: (tool: string, startGate?: AbortSignal): Promise<void> => {
        w.installOffers.push({ tool, startGate });
        return Promise.resolve();
      },
    },
  };
}

export const entity = (extra: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'prod', kind: 'ssh', host: 'prod.corp.com', ...extra }) as unknown as EntityMetadata;

/**
 * The entry `e1` sits in the folder "ssh connections", so a connect names that folder in its terminal title (the owner,
 * 2026-11-10).
 */
export const E1_IN_FOLDER: TreeNode = { id: 'e1', name: 'prod', type: 'entity', parentId: 'f1' };
export const FOLDER: TreeNode = { id: 'f1', name: 'ssh connections', type: 'folder', folderType: 'ssh', parentId: null };
/** The entry `e1` at the root, for a test that moves it out of its folder. */
export const E1_AT_ROOT: TreeNode = { ...E1_IN_FOLDER, parentId: null };

/**
 * A storage that knows exactly these nodes. Besides the modules these tests replace, the connect path uses the three
 * methods of the folder-colour allocator (`getNode`, `getNodes`, `updateNodeFields`), which `folderColorStorage` (the
 * shared fake of E1.S2) provides and records; those are typed against the real `StorageManager`, and the one cast is
 * here (`PrepareOptions.storage` carries the note, typescript.doctrine § 3). `written` is every colour write, and `failNextWrite` makes the next one reject.
 */
export function storageWith(...nodes: TreeNode[]): StorageManager & Pick<FolderColorFake, 'written' | 'failNextWrite'> {
  const fake = folderColorStorage({ [ACCOUNT_ID]: nodes });
  const read: Pick<StorageManager, 'getNode' | 'getNodes' | 'updateNodeFields'> = fake;
  return Object.assign(read as StorageManager, { written: fake.written, failNextWrite: fake.failNextWrite });
}
/** The account every connect of these tests is for. */
export const ACCOUNT_ID = 'a1';
export const storage = storageWith(E1_IN_FOLDER, FOLDER);
/** The title every connect of `entity()` gives its terminal. */
export const SSH_TITLE = 'Creds SSH: ssh connections / prod';
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
