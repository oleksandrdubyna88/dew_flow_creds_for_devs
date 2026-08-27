import Module from 'node:module';

/**
 * Loading a `vscode`-importing module under a stub, in one place.
 *
 * <p>Twelve test files carry their own copy of this `Module._load` dance, and the copies have
 * already drifted — some stub `EventEmitter`, some do not; some fake `workspace`, some
 * `window`. That was fine when there were three; it is the reason a change to what a module
 * needs from `vscode` now means editing a dozen files and finding out one by one which of them
 * you missed. New tests use this; the existing ones are left alone rather than churned, and
 * can adopt it whenever they are next touched for a reason of their own.</p>
 *
 * <p>Not named `*.test.ts`, so the runner's `out/test/*.test.js` glob never treats it as a
 * suite with no tests in it.</p>
 */
export function loadWithVscode<T>(
  request: string,
  stub: Record<string, unknown>,
  /**
   * Extra modules to substitute, keyed by the request string the module under test WRITES
   * (`'./sshCredential'`, not a resolved path). For the few modules whose whole job is
   * orchestrating other modules — open this, write that, then wipe it — the sequence is the
   * behaviour, and it cannot be observed without standing in for the collaborators.
   */
  mocks: Record<string, unknown> = {},
): T {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  // The WHOLE graph is evicted, not just the requested module, because `require` is cached
  // and these modules capture `vscode` at import time.
  //
  // Evicting only the top module is not enough and fails in a way that looks like a code bug:
  // `transportFactory` imports `nasPaths`, so a freshly-loaded factory would still consult the
  // `nasPaths` copy bound to an EARLIER stub, read a location from settings that are no longer
  // the test's, and route to the wrong transport. The first version of this helper did exactly
  // that, and the tests it broke read as routing defects rather than as a stale cache.
  evictOwnModules(require.resolve(request));
  loader._load = function patched(name: string, ...rest: unknown[]): unknown {
    if (name === 'vscode') {
      return stub;
    }
    return name in mocks ? mocks[name] : original.call(this, name, ...rest);
  };
  try {
    return require(request) as T;
  } finally {
    loader._load = original;
  }
}

/**
 * Drop every one of OUR compiled modules from the require cache, so the next load rebuilds
 * the dependency graph against the stub about to be installed. Anything outside the build
 * output — node built-ins, dependencies — is left cached, since none of it reads `vscode`.
 */
function buildOutputDir(resolvedEntry: string): string {
  const marker = resolvedEntry.includes('\\') ? '\\out\\' : '/out/';
  const at = resolvedEntry.lastIndexOf(marker);
  return at < 0 ? '' : resolvedEntry.slice(0, at + marker.length);
}

function evictOwnModules(resolvedEntry: string): void {
  const outDir = buildOutputDir(resolvedEntry);
  const ours = Object.keys(require.cache).filter((key) => outDir !== '' && key.startsWith(outDir));
  for (const key of ours.length > 0 ? ours : [resolvedEntry]) {
    delete require.cache[key];
  }
}

export interface ConfigStub {
  /** What `workspace.getConfiguration(section)` answers, by setting key. */
  values: Record<string, unknown>;
  /** Every `update(key, value, target)` this run performed, in order. */
  updates: { key: string; value: unknown; target: unknown }[];
  workspace: {
    getConfiguration(section: string): unknown;
    onDidChangeConfiguration(listener: (e: unknown) => void): { dispose(): void };
  };
  /** The section names asked for, so a test can prove a module reads its own. */
  sections: string[];
}

/**
 * A `workspace.getConfiguration` that answers from a plain object and records writes.
 *
 * <p>`update` writes back into `values` as well as recording, because the modules under test
 * read-modify-write a settings map — a stub that only recorded would make the second call in a
 * test see the first call's absence and quietly test the wrong thing.</p>
 */
export function configStub(values: Record<string, unknown> = {}): ConfigStub {
  const stub: ConfigStub = {
    values: { ...values },
    updates: [],
    sections: [],
    workspace: {
      getConfiguration(section: string): unknown {
        stub.sections.push(section);
        return {
          get<T>(key: string, fallback: T): T {
            return (stub.values[key] as T | undefined) ?? fallback;
          },
          update(key: string, value: unknown, target: unknown): Promise<void> {
            stub.updates.push({ key, value, target });
            stub.values[key] = value;
            return Promise.resolve();
          },
        };
      },
      // T28 subscribes pages to setting changes; tests need only a disposable.
      onDidChangeConfiguration(): { dispose(): void } {
        return { dispose: (): void => undefined };
      },
    },
  };
  return stub;
}

/**
 * A working `vscode.EventEmitter` — the real semantics, not a recorder.
 *
 * <p>A module that builds a `Pseudoterminal` hands VS Code `emitter.event` and then fires
 * through the emitter; a stub that only recorded `fire` calls would test nothing about what
 * actually reaches the screen. This one delivers to its listeners, so a test can subscribe
 * exactly as VS Code does and read the terminal's output.</p>
 */
export class StubEventEmitter<T> {
  private readonly listeners: ((value: T) => void)[] = [];

  readonly event = (listener: (value: T) => void): { dispose(): void } => {
    this.listeners.push(listener);
    return {
      dispose: (): void => {
        const at = this.listeners.indexOf(listener);
        if (at >= 0) {
          this.listeners.splice(at, 1);
        }
      },
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners.length = 0;
  }
}

/** The handful of `vscode` values a settings-reading module touches. */
export function settingsVscode(config: ConfigStub): Record<string, unknown> {
  return {
    workspace: config.workspace,
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    Uri: { file: (p: string): { fsPath: string } => ({ fsPath: p }) },
  };
}
