# PLAN — E1.S3 spec: the seam, `prepareSshSession` (CORNERSTONE)

> Status: **spec by Fable, 2026-11-10, written before its code. Nothing built.**
> Story E1.S3 of [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) — parent §4.3 (the seam),
> §4.4 (the "one owner" and "one snapshot" rules), §6 (rows "prepare opens no terminal" and "existing SSH Connect
> suites green, unchanged"), risk 7, `## Epics` › E1 › S3. Its own file because the E1 stories document goes whole to
> the review gate and must stay short; it is promoted with E1's documents.
> Where this spec differs from the parent plan, this spec wins and §S3.1 says why.
>
> Scope: `src_vs_code/src` — new `sshSession.ts`; `sshConnect.ts` loses its preparation half and keeps its open
> half; one small change to the fixture `test/sshConnectWorld.ts`; new `test/sshSession.test.ts`; two lines in
> `research/module_extension.md` and one row in `research/module_tests.md`. **No road calls the seam in S3.** The
> two existing suites `test/sshConnect.test.ts` and `test/sshConnectRemote.test.ts` are not edited.
> A Sonnet coder builds from this file and re-discovers nothing; an Opus judge reviews against §S3.10.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on
commit `e468285` (branch `feat/terminal-command-over-ssh`; the source files are those of `origin/main`).

## S3.0 — Facts this spec rests on

| # | Fact (verified) | Consequence |
|---|---|---|
| F1 | `connectEntity` (`sshConnect.ts:136-348`) does, in this order: request gate (`:143`), ssh client check with an install offer (`:166-170`), `resolveSshCredential` (`:173`), gate (`:176`), credential warning (`:179-181`), credential `stopped` (`:182-184`), `remoteRoute` (`:189`) and its refusal (`:190-192`), `connectionOptions` (`:198-201`), `withTranslatedKnownHosts` (`:209-213`), the program word (`:216-217`), `terminalPlatform` (`:219-225`), gate (`:226-229`), the relay route (`:233-265`), the agent-serves-key route (`:266-276`), the Windows-client caveat (`:277-282`), key materialisation (`:283-295`), the password branch (`:300-331`), the key terminal and its close handler (`:333-347`). | The seam is everything before a terminal is created or shown. That is `:143-295` **plus** the password branch's preparation: `:304-309` (command, target, the no-host sentence), `:310` (askpass script), `:319` (`askpassEnv`), `:325-328` (accept-new). |
| F2 | Three terminal openings exist: `:264` (relay prefix), `:275` (agent serves the key), `:333` (key path or none). All three call `openSshTerminal(entity-with-sshKeyPath, options, platform[, prefix])`. The password branch (`:313-330`) creates its own terminal with an `env`. | After the cut, the open half is TWO calls: `openSshTerminal(ready.entity, ready.options, ready.platform, ready.prefix)` and the password terminal. |
| F3 | The close handler (`:339-344`) and the failed-open path (`:337`) forget the KEY only. The pin file is never deleted on a success path; it lives in `keys/<pid>/` until `purgeMaterializedKeys` (`keyInstaller.ts:260`) runs on activate and deactivate. | `connectEntity` keeps exactly these two forget sites, reading `ready.materializedKeyPath`. Roads use `cleanup()`, which forgets key AND pin. |
| F4 | Two exits after `connectionOptions` has written a pin file do NOT take it back today: a key that cannot be written (`:287-292`) and a password entity with no host (`:306-309`). For the second, `materializeKnownHosts` returns `undefined` when `entity.host === undefined` (`hostKeyTrust.ts:82`), so no pin file can exist. The first is a real gap. | §S3.4 gives every `stopped` and `refused` exit after `connectionOptions` one give-back helper (security.md § *A measure applied at SOME of its sites*). Observable change: one, named in §S3.11 D4. |
| F5 | `connectionOptions` returns `undefined` BEFORE `materializeKnownHosts` when the host key is refused or the request is gone (`connectionOptions.ts:61-63`, then `:67`). | A `stopped('connection-options')` has nothing on disk. |
| F6 | `test/vscodeStub.ts` patches `Module._load` (`:56-60`): a request whose string is a key of `mocks` gets the mock, everything else loads for real under the same patch. The whole `out/` graph is evicted first (`:55`). `loadEachWithVscode` (`:40`) loads several requests into ONE graph. | A module `sshConnect.ts` requires (`./sshSession`) loads under the same patch, so `sshSession.ts`'s own `require('./sshCredential')` meets the same mock — **if the request string is identical**. §S3.6 gives the rules. |
| F7 | `sshConnectWorld.ts` mocks by request string `'./sshCredential'`, `'./connectionOptions'`, `'./keyInstaller'` (only `materializePrivateKey`, `forgetMaterializedKey`, `writeAskpassScriptFile`), `'./wslProcess'` (`socketIsAlive`, `translateWindowsPath`), `'./pinnedTerminal'` (`composedShellPath`), `'./terminalManager'` (`openSshTerminal`, `buildSshCommand`, `describeSshTarget`), `'./sshAskpass'` (`askpassEnv`), and with `sshMissing` also `'./sshProgram'`, `'./toolEnsure'` (`:123-190`, `:257-270`). A mock replaces the WHOLE module. | `sshSession.ts` may import from these request strings ONLY the names the mock provides. `materializedKeysDir` comes from `'./materializedKeys'` (as `sshConnect.ts:20` does today), never from `'./keyInstaller'`, which re-exports it (`keyInstaller.ts:19`) — the mock does not. |
| F8 | `sshConnectRemote.test.ts:488` asserts `w.sshTerminals[0].prefix === undefined` in a local window; `:101-105` asserts the exact `env SSH_AUTH_SOCK='…' ` string on the relay route. The mock records the fourth argument as given. | `ready.prefix` is `string \| undefined` and `connectEntity` always passes it as the fourth argument. `undefined` reaches the mock as `undefined` and the real `openSshTerminal` as its default `''` (`terminalManager.ts:24`). |
| F9 | `RemoteWindowDeps` is imported from `'./sshConnect'` by `remoteConnectHost.ts:6` and `sshUseActions.ts:22`; `connectEntity` is called by `commands/agentCommands.ts:557` and `sshUseActions.ts:316`. `test/remoteConnectParity.test.ts:62` finds every file (not `sshConnect.ts`, not tests) that writes `connectEntity(`. | The types move to `sshSession.ts` and `sshConnect.ts` re-exports them; the two callers and the parity scan do not change. `sshSession.ts` never writes `connectEntity(`. |
| F10 | ESLint: `max-lines` 800, `max-lines-per-function` 50 code lines, `complexity` 4, and `reportUnusedDisableDirectives: 'error'` (`eslint.config.mjs:20,30-32`). `connectEntity` carries `// eslint-disable-next-line complexity, max-lines-per-function` (`sshConnect.ts:135`). `tsconfig.json:11-12` has `noUnusedLocals` and `noUnusedParameters`. | After the cut, `connectEntity` is small and that disable MUST be removed, or lint fails. `sshSession.ts` carries no disable. Unused imports left in `sshConnect.ts` fail `typecheck`. |
| F11 | `sshConnect.test.ts` has 24 tests, `sshConnectRemote.test.ts` 25 (`grep -c '^test('`). `research/module_tests.md:1021` says "(32)" — a stale count from before the split. | The parity row in §S3.8 names 24 + 25. The coder corrects the count in the research row it touches. |
| F12 | The plan's ledger reads `Cornerstones: 0 of 2 — none marked yet` (parent, last line) and `todo/PLAN_terminal_command_over_ssh_E1.md` does not exist yet. `subagent-models.md` DoD: "a cornerstone was in the ledger before Fable wrote its spec". | Owed before this spec's commit lands: the E1 stories document, with S2 and S3 marked `model: fable`, and the ledger line `Cornerstones: 2 of 2 — E1.S2, E1.S3`. This spec does not write them (one file only). |

## S3.1 — The parent plan's wording, judged

| Parent says | Judgement | This spec |
|---|---|---|
| §4.3, E1.S3: "`sshConnect.ts:143-295` moved, in the same order" | Incomplete. The password branch prepares AFTER `:295`: `:304-310` (command, target, no-host sentence, askpass script), `:319` (`askpassEnv`), `:325-328` (accept-new). Left in `connectEntity`, a road could not get `env` or `acceptNew` without a terminal. | The seam is `:143-295` plus `:304-310`, `:319`, `:325-328` (F1). The order of every await is kept (§S3.3). |
| §4.3: "`connectEntity` becomes prepare + its four open branches" | Right in count of today's exits, wrong in shape: `:264`, `:275`, `:333` are one call with different arguments (F2). | Two open functions: `openKeyTerminal(ready)` and `openPasswordTerminal(ready)` (§S3.5). |
| §4.3: "its tests … must stay green unchanged" | Right for the two suites. The fixture `sshConnectWorld.ts` is not a suite; it needs one small change so the new suite shares its mocks instead of copying them (F6, F7). | The two `.test.ts` files: zero diff. `sshConnectWorld.ts`: loads two modules into one graph (§S3.6). |
| §3: "a refused window leaves nothing on disk" | Right for `refused`. One `stopped` exit leaves a pin file today (F4). | Closed in the seam: D4 in §S3.11. The ONE deliberate deviation from byte-identical. |
| §4.4: "`ready` carries the SSH entry as it was read … and the jump string it resolved" | Right. | `snapshot` and `jump` fields (§S3.2). |
| Risk 7: "askpass answers the hop" | Right; inherited on purpose. | Not fixed here. `ready.env` carries the same three variables the terminal gets today. A password entity with a `-J` jump has the same defect through every road (§S3.12). |
| Ledger "0 of 2" | Out of order with `subagent-models.md` (F12). | Owed by the E1 stories document, in the same commit as this spec at the latest. |

## S3.2 — Types and signatures (`sshSession.ts`)

`sshSession.ts` imports `vscode` (it shows the same warnings `connectEntity` shows today). It is tested through the
stub world, as `sshConnect.ts` is. It imports nothing from `'./sshConnect'` (no cycle).

```ts
/** What the WINDOW is — moved verbatim from sshConnect.ts:39-81, doc comments included. */
export interface RemoteWindowDeps { /* unchanged */ }

/** Moved from sshConnect.ts:83-86. */
const LOCAL_WINDOW: RemoteWindowDeps = { side: { kind: 'local' }, relay: { enabled: false, running: false, socket: '' } };

/** `connect.remote`, or a local window. Used by prepare and by connectEntity's retry (sshConnect.ts:474-477). */
export function windowOf(connect: PrepareOptions): RemoteWindowDeps;

/** What preparing needs. sshConnect.ts:93-132 minus the two retry fields. Doc comments move with the fields. */
export interface PrepareOptions {
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly agentServesKey?: boolean;
  readonly remote?: RemoteWindowDeps;
  readonly startGate?: AbortSignal;
}

export type PreparedSsh = ReadySsh | RefusedSsh | StoppedSsh;

export interface ReadySsh {
  readonly kind: 'ready';
  /**
   * The SSH entity EXACTLY as handed in — the one snapshot (parent §4.4). The same object, not a copy.
   * The trust line, the typed line and a spawn argv are built from this; nobody re-reads storage after prepare.
   */
  readonly snapshot: EntityMetadata;
  /**
   * `snapshot` with `sshKeyPath` SET to the file `-i` must name, or CLEARED when the agent answers
   * (the relay route and the agent-serves-key route). What `buildSshCommand` and `openSshTerminal` take.
   */
  readonly entity: EntityMetadata;
  /** Jump, known_hosts file (translated for a WSL shell), program word on the Windows-client route. */
  readonly options: ConnectionOptions;
  /** The platform whose SHELL parses the line — the terminal's, never `process.platform`. */
  readonly platform: NodeJS.Platform;
  /** `env SSH_AUTH_SOCK='…' ` on the relay route; `undefined` on every other route (F8). */
  readonly prefix: string | undefined;
  /** The askpass environment — ONLY for a password credential. It holds the password. Never logged. */
  readonly env: Record<string, string> | undefined;
  /** Add `-o StrictHostKeyChecking=accept-new`: true for a password credential WITHOUT a pinned host key. */
  readonly acceptNew: boolean;
  /** `options.jump` — the resolved `-J` value, for the trust line (parent §4.2 `trustLineFor`). */
  readonly jump: string | undefined;
  /** `describeSshTarget(entity)` — the `SSH: <target>` terminal name. `undefined` when the entity has no host. */
  readonly target: string | undefined;
  /** The key file THIS preparation wrote, or `undefined`. connectEntity's two forget sites read it (F3). */
  readonly materializedKeyPath: string | undefined;
  /**
   * Forget the materialised key and our pin file. Idempotent: the second call does nothing. The OWNER calls
   * it on every exit that did not hand the session to a terminal or a child (parent §4.4 "one owner").
   */
  cleanup(): void;
}

export interface RefusedSsh {
  readonly kind: 'refused';
  /** For `refuseAndOfferTheFix`, ordered as `remoteRoute` orders them. */
  readonly reasons: readonly RefusalReason[];
  /** False only for the `not-wsl` refusal of an unnameable platform (sshConnect.ts:224 passes no retry). */
  readonly retryable: boolean;
}

export type StopReason =
  | 'request-gone'
  | 'ssh-client-missing'
  | 'credential-stopped'
  | 'connection-options'
  | 'key-write-failed'
  | 'no-host';

export interface StoppedSsh {
  readonly kind: 'stopped';
  /** Why. Nothing in connectEntity reads it; tests and a later log line do. */
  readonly why: StopReason;
}

/**
 * Everything SSH Connect does before a terminal exists, in the same order, opening no terminal.
 * Every dialog connectEntity showed before a terminal is still shown here: the install offer, the credential
 * warning, the Windows-client caveat, the key-write error, the no-host sentence. The refusal MODAL is not:
 * `refused` is returned and the caller shows it (connectEntity: `refuseAndOfferTheFix`; a road: its own sentence).
 */
export async function prepareSshSession(
  accountId: string,
  ssh: EntityMetadata,
  connect: PrepareOptions,
): Promise<PreparedSsh>;

/** `command` with `-o StrictHostKeyChecking=accept-new` after the program word when `acceptNew` — sshConnect.ts:325-328, verbatim regex. */
export function withAcceptNew(command: string, acceptNew: boolean): string;
```

`sshConnect.ts` keeps:

```ts
export type { RemoteWindowDeps } from './sshSession';          // remoteConnectHost.ts:6, sshUseActions.ts:22 unchanged
export interface ConnectOptions extends PrepareOptions {        // the two retry fields, doc comments from :102-123
  readonly refreshAgentServesKey?: () => boolean;
  readonly allowRetry?: boolean;
}
export async function connectEntity(accountId: string, entity: EntityMetadata, connect: ConnectOptions): Promise<boolean>;
```

`ready` holds **no command line**. The composer (`remoteLaunch.ts`, S2) is the only road from an entity to a line
(parent D7); `connectEntity` builds its own line in its open half, as today. A `command` field on `ready` would be
a second road, and T16 pins the key list so one cannot appear unnoticed.

## S3.3 — The order of the awaits, and where each line lives after the cut

The seam makes NO new await and moves none. Each row is one step of today's `connectEntity`.

| # | Today | Step | After the cut | Exit |
|---|---|---|---|---|
| 1 | `:143-145` | `requestGone(startGate)` | prepare | `stopped('request-gone')` |
| 2 | `:166-170` | local window and no ssh client: **await** `offerToInstall('ssh', startGate)` | prepare | `stopped('ssh-client-missing')` |
| 3 | `:173` | **await** `resolveSshCredential(storage, accountId, ssh, clickOpener(storage, accountId, 'connect'))` | prepare | — |
| 4 | `:176-178` | gate | prepare | `stopped('request-gone')` |
| 5 | `:179-181` | `source.warning` → `showWarningMessage` | prepare | — |
| 6 | `:182-184` | `source.kind === 'stopped'` | prepare | `stopped('credential-stopped')` |
| 7 | `:188-192` | `remoteRoute(side, source.kind, agentServesKey, relay, windowsClient.length > 0)` → refuse | prepare | `refused(reasons, retryable: true)` — nothing on disk |
| 8 | `:198-201` | **await** `connectionOptions(accountId, ssh, storage, storageDir, startGate)` → `undefined` | prepare | `stopped('connection-options')` — nothing on disk (F5) |
| 9 | `:209-213` | not Windows-client: **await** `withTranslatedKnownHosts(resolved, side, storageDir)` → `undefined` | prepare (the helper moves, `:360-375`) | `refused(['known-hosts-translation-failed'], true)` — the helper already took the pin back |
| 10 | `:216-217` | `options = windowsClient ? { ...translated, program } : translated` | prepare | — |
| 11 | `:219-225` | `terminalPlatform(side, hostPlatform) === undefined` | prepare | give back; `refused(['not-wsl'], retryable: false)` |
| 12 | `:226-229` | gate | prepare | give back; `stopped('request-gone')` |
| 13 | `:233-250` | relay route: `envPrefix('SSH_AUTH_SOCK', socketPath)` empty | prepare | give back; `refused(['relay-socket-unusable'], true)` |
| 14 | `:256-259` | **await** `adoptedSocketStillThere(relay, side)` false (the helper moves, `:490-495`) | prepare | give back; `refused(['relay-not-running'], true)` |
| 15 | `:260-263` | gate | prepare | give back; `stopped('request-gone')` |
| 16 | `:264` | relay route → terminal | `ready` with `entity.sshKeyPath` cleared, `prefix` set | hand to connectEntity |
| 17 | `:266-276` | `agentServesKey && storedKey && compose` → terminal | `ready` with `entity.sshKeyPath` cleared, `prefix` undefined | hand to connectEntity |
| 18 | `:277-282` | Windows-client caveat → `showWarningMessage` | prepare | — |
| 19 | `:283-292` | `materializePrivateKey(storageDir, keyEntityId, content)` throws → `showErrorMessage` | prepare | give back (**D4**); `stopped('key-write-failed')` |
| 20 | `:293-295` | `keyPath` source → path | prepare | — |
| 21 | `:304-309` | password: `buildSshCommand(entity, platform, options)` or `describeSshTarget(entity)` undefined → the no-host sentence | prepare | give back (a no-op, F4); `stopped('no-host')` |
| 22 | `:310, :319` | `writeAskpassScriptFile(storageDir, platform)`; `askpassEnv(scriptPath, password, platform)` | prepare | — |
| 23 | `:325-328` | `acceptNew = options.knownHostsFile === undefined` | prepare | `ready` with `env`, `acceptNew` |
| 24 | `:313-321, :329-330` | dispose a stale `SSH: <target>`, `createTerminal({ name, shellPath: composedShellPath(), env })`, `show`, `sendText(withAcceptNew(command, acceptNew), true)` | **connectEntity** | `true` |
| 25 | `:333` | `openSshTerminal({ ...entity, sshKeyPath: keyPath }, options, platform)` | **connectEntity**, as `openSshTerminal(ready.entity, ready.options, ready.platform, ready.prefix)` for rows 16, 17 and 25 alike | `terminal !== undefined` |
| 26 | `:335-346` | `materialized` set: terminal undefined → forget the key now; else forget it on `onDidCloseTerminal` of THAT terminal | **connectEntity**, reading `ready.materializedKeyPath`, calling `forgetMaterializedKey` as today (F3) | — |

"Give back" = `forgetOurPin(resolved.knownHostsFile, storageDir)` — on `resolved`, never on `options` (the relay route
has translated `options`; `sshConnect.ts:244-247`). The helper moves verbatim (`:535-546`) with its directory guard.

After `ready` is returned, `connectEntity` makes no await before the terminal (rows 24-26 are synchronous), so the
last gate before a terminal stays where it is today (rows 12, 15). A ROAD awaits between prepare and its send
(trust, dependencies); the gate for that gap is the road's (E2, E3), not the seam's.

## S3.4 — The contract: state → what is on disk → who cleans

| Result | Key file (`keys/<pid>/<id>.key`) | Pin file (`keys/<pid>/known_hosts-<id>`) | Askpass script (`keys/<pid>/askpass.sh\|.bat`) | Who cleans |
|---|---|---|---|---|
| `stopped` rows 1, 2, 4, 6, 8 | none | none (F5) | none | nobody — nothing to clean |
| `stopped` rows 12, 15, 19, 21 | none (row 19: the write failed) | **taken back by prepare** before returning (D4 for row 19) | none | prepare |
| `refused` row 7 | none | none | none | nobody |
| `refused` rows 9, 11, 13, 14 | none | **taken back by prepare** | none | prepare |
| `ready`, relay or agent route (rows 16, 17) | none | present when pinned | none | owner: `cleanup()` deletes the pin; connectEntity: nobody (as today, F3) |
| `ready`, stored key (row 25 with `materializedKeyPath`) | **present, 0600, owner-locked** | present when pinned | none | owner: `cleanup()` on an exit without hand-over, and on terminal close or child exit; connectEntity: `forgetMaterializedKey` at its two sites (F3) |
| `ready`, key path (row 20) | none — the person's own file, never deleted | present when pinned | none | owner: `cleanup()` (pin only) |
| `ready`, password (row 23) | none | present when pinned | **present**; static, no secret, shared by every caller, written each time (`keyInstaller.ts:206-213`) | the script: `purgeMaterializedKeys` on deactivate — nobody else, today or after; the pin: owner `cleanup()` |

`cleanup()` rules: (1) forgets `materializedKeyPath` if set, (2) `forgetOurPin(resolved.knownHostsFile, storageDir)`,
(3) sets a `done` flag first and returns at once when it is set. It never throws (`forgetMaterializedKey` swallows,
`keyInstaller.ts:220-226`). After a hand-over the OWNER decides when to call it (terminal close, child exit); the seam
does not know about terminals. Calling it after a hand-over while the session is alive would delete the key under
a running `ssh` — allowed by the type, forbidden by the "one owner" rule; §S3.10 asks the reviewer to check each
road's call sites when E2 and E3 land.

`cleanup()` cannot erase `ready.env` (a string in memory). The owner drops its reference; nothing logs `ready`.

## S3.5 — `connectEntity` after the cut

```ts
export async function connectEntity(accountId, entity, connect): Promise<boolean> {
  const prepared = await prepareSshSession(accountId, entity, connect);
  if (prepared.kind === 'stopped') { return false; }
  if (prepared.kind === 'refused') {
    const retry = prepared.retryable && connect.allowRetry !== false
      ? (): Promise<boolean> => retryAfterRemedy(accountId, entity, connect) : undefined;
    return refuseAndOfferTheFix(prepared.reasons, entity, windowOf(connect), retry, connect.startGate);
  }
  return prepared.env === undefined ? openKeyTerminal(prepared) : openPasswordTerminal(prepared);
}
```

- `openKeyTerminal(ready)`: rows 25-26, with `ready.prefix` always passed as the fourth argument (F8). The close
  handler compares `closed === terminal` and forgets `ready.materializedKeyPath` (today's `:339-344`).
- `openPasswordTerminal(ready)`: row 24. `command = buildSshCommand(ready.entity, ready.platform, ready.options)`;
  `undefined` is unreachable (row 21 stopped first) and is a `return false` guard, not a cast — the file's own
  precedent is `:220-225`. Name `SSH: ${ready.target}`; dispose a live terminal of that name; create with
  `shellPath: composedShellPath()` and `env: ready.env`; `show()`; `sendText(withAcceptNew(command, ready.acceptNew), true)`.
- `retryAfterRemedy`, `freshWindow` (now `windowOf(connect).refresh?.() ?? windowOf(connect)`), `freshAgent`,
  `refuseAndOfferTheFix`, `actOnRefusal`, `askAndPick`, `runRemedyAndRetry`, `refusalContext`,
  `copyTheWindowsCommand` stay in `sshConnect.ts` unchanged.
- `forgetOurPin`, `withTranslatedKnownHosts`, `adoptedSocketStillThere` move to `sshSession.ts` as private functions.
- The disable on `:135` is removed (F10). Imports that became unused are removed (`describeError`, `askpassEnv`,
  `describeSshTarget`, `sshClientPresent`, `offerToInstall`, `materializePrivateKey`, `writeAskpassScriptFile`,
  `resolveSshCredential`, `clickOpener`, `connectionOptions`, `path`, `materializedKeysDir`, `terminalPlatform`,
  `remoteRoute`, `envPrefix`, `socketIsAlive`, `translateWindowsPath`, `windowsClientCaveat` — the coder lets `tsc`
  name the exact list).

Byte-identical means: the same dialogs in the same order with the same text, the same files written and deleted at
the same moments, the same `openSshTerminal` arguments, the same `createTerminal` options, the same `sendText`,
the same boolean. The one exception is D4 (§S3.11).

## S3.6 — The test-world module swaps, and the precise way to keep them valid

How a swap works (F6): `world()` calls `loadWithVscode('../sshConnect', stub, mocks)`. The loader evicts every
compiled module under `out/`, patches `Module._load`, and `require('../sshConnect')` rebuilds the graph. When
`sshConnect.js` requires `./sshSession`, that request is not in `mocks`, so the real file loads — under the SAME
patch. When `sshSession.js` then requires `./sshCredential`, the string `'./sshCredential'` IS in `mocks`, so it
gets the mock. The swap is keyed on the literal request string, not on the resolved path.

Rules, each one load-bearing:

1. **Same directory.** `sshSession.ts` lives in `src/`, beside `sshConnect.ts`. In a subfolder it would write
   `'../sshCredential'`, which matches no mock, and every test would run the REAL credential resolver.
2. **Same request strings.** `sshSession.ts` imports from exactly `'./sshCredential'`, `'./connectionOptions'`,
   `'./keyInstaller'`, `'./wslProcess'`, `'./terminalManager'`, `'./sshAskpass'`, `'./sshProgram'`, `'./toolEnsure'`
   — as `sshConnect.ts:5-31` spells them today. Not `'./sshCommand'` for `buildSshCommand` (the mock is on
   `'./terminalManager'`, `sshConnectWorld.ts:168-181`).
3. **Only the names the mock provides** (F7). From `'./keyInstaller'`: `materializePrivateKey`,
   `writeAskpassScriptFile`, `forgetMaterializedKey`. `materializedKeysDir` from `'./materializedKeys'`. From
   `'./sshAskpass'`: `askpassEnv` only. From `'./terminalManager'`: `buildSshCommand`, `describeSshTarget` (prepare
   never imports `openSshTerminal`). From `'./wslProcess'`: `socketIsAlive`, `translateWindowsPath`.
4. **`./sshSession` is never mocked.** It is the module under test for the new suite and the real dependency of
   `connectEntity` for the old ones.
5. **One fixture, two modules.** `sshConnectWorld.ts` changes `loadWithVscode<Connect>('../sshConnect', …)` to
   `loadEachWithVscode(['../sshConnect', '../sshSession'], stub, mocks)` and exposes the second as `w.seam`
   (`type Seam = typeof import('../sshSession')`). The second request answers the instance the first already loaded
   (`vscodeStub.ts:31-40`), so both suites see one `sshSession`. `World` gains `seam: Seam`. Nothing else in the
   fixture changes; the mocks are not copied into a second world (security.md § *A measure applied at SOME of its sites*).
6. **No re-export shortcuts.** `sshSession.ts` does not `export * from` anything, and `sshConnect.ts` re-exports
   only the two types. A value re-export would be a second import site for the same name.
7. **`vscode` in `sshSession.ts`** is the stub, as everywhere: `window.showWarningMessage`, `window.showErrorMessage`
   (`sshConnectWorld.ts:219-231`). Nothing else from `vscode` is used there.

Check after building: `grep -n "from '\./" src/sshSession.ts` lists only request strings from rule 2 plus
`'./types'`, `'./storageManager'`, `'./requestLife'`, `'./pinClick'`, `'./connectionOptions'`, `'./materializedKeys'`,
`'./remoteWindow'`, `'./remoteRoute'`, `'./remoteWindowMessage'`, `'./wslRelay'`, `'./describeError'` — the pure
modules, loaded for real, as `sshConnect.ts` loads them today.

## S3.7 — Small functions (complexity ≤ 4, ≤ 50 code lines, no disable)

ESLint's `complexity` counts each `if`, `?:`, `catch`, `&&`, `||`, `??`. Suggested cut, one function per step group;
the coder may split further, never merge.

| Function | Steps of §S3.3 | Branches |
|---|---|---|
| `prepareSshSession` | 1-8 head, then delegates | `stopped` from `credentialStep`; `refuse` route; `connectionOptions` undefined → 3 |
| `credentialStep(accountId, ssh, connect, side)` → `source \| StoppedSsh` | 1-6 | split in two: `entryGate` (rows 1-2: 2 branches) and `lookedUp` (rows 3-6: gate, warning, stopped → 3) |
| `composeStep(ssh, connect, source, route, resolved)` | 9-12 | translated undefined; platform undefined; gate → 3 |
| `routeBranch(...)` | 13-23 dispatch | `route.kind === 'agent'` → `relayBranch`; else `keyOrPasswordBranch` → 1 |
| `relayBranch(...)` | 13-16 | prefix empty; socket dead; gate → 3 |
| `keyOrPasswordBranch(...)` | 17-23 dispatch | agent-serves-key (one `&&` chain = 3); else `caveat` then by `source.kind` |
| `caveat(route, ssh)` | 18 | 2 |
| `keyFile(source, storageDir)` → `{ keyPath?, materialized? } \| 'failed'` | 19-20 | storedKey try/catch; keyPath → 3 |
| `passwordBranch(...)` | 21-23 | command or target undefined (`\|\|`) → 2 |
| `ready(parts)` | builds `ReadySsh` with its `cleanup` closure | 0-1 |
| `giveBack(resolved, storageDir)` | the one give-back helper | 0 |
| `forgetOurPin`, `withTranslatedKnownHosts`, `adoptedSocketStillThere` | moved verbatim | as today |

Sizes: `sshConnect.ts` 546 → about 400; `sshSession.ts` about 350 with the moved comments. Both under 800.

## S3.8 — Scenarios, RED first (`test/sshSession.test.ts`)

The new suite imports `world`, `entity`, `storage`, `OPTIONS`, `OUR_PIN`, `WSL_NO_RELAY`, `WSL_READY`,
`WSL_WINDOWS_CLIENT` from `./sshConnectWorld` and calls `w.seam.prepareSshSession('a1', entity(), { storage,
storageDir: '/storage', … })`. Helper: `const ready = (p: PreparedSsh): ReadySsh => { assert.equal(p.kind, 'ready'); return p as ReadySsh; }`.

**The RED order.** Step A: the test file and rule 5 of §S3.6 are written first; `npm run compile` fails with
`Cannot find module '../sshSession'` — recorded, that is the RED of a new module. Step B: `sshSession.ts` is built as
a straight move; T11 is RED against a straight move (today's code leaves the pin, F4) and is recorded failing with
`forgotten: []`. Step C: D4 is added; all green. The break-its of §S3.9 then prove every other assertion bites.

| # | Test name | Assertions | RED because |
|---|---|---|---|
| T1 | `prepare opens no terminal and sends nothing — stored key, relay, password` | Three worlds (local storedKey with `sshTerminal: {}`; `WSL_READY` + `agentServesKey: true`; local password): each `kind === 'ready'`; `w.sshTerminals` `[]`; `w.created` `[]` | step A |
| T2 | `ready with a stored key wrote the key; cleanup deletes it and our pin` | `options: { knownHostsFile: OUR_PIN }`: `materializedKeyPath === '/storage/keys/k1.key'`, `entity.sshKeyPath` the same, `w.materialised` `['/storage/keys/k1.key']`, `w.forgotten` `[]`; after `cleanup()`: `w.forgotten` deepEqual `['/storage/keys/k1.key', OUR_PIN]` | step A; B2 |
| T3 | `cleanup twice forgets once` | T2's world; `cleanup(); cleanup();` → `w.forgotten.length === 2` | step A; B3 |
| T4 | `a refused window leaves no pin file, asks no host key, shows no modal` | `WSL_NO_RELAY`, storedKey, `agentServesKey: false`: `kind === 'refused'`, `reasons` deepEqual `['relay-off', 'agent-has-no-key']`, `retryable === true`, `w.hostKeyAsked` `[]`, `w.materialised` `[]`, `w.forgotten` `[]`, `w.warnings` `[]` (the modal is the caller's) | step A; B4 |
| T5 | `a late refusal takes its pin back — failed translation, dead adopted relay` | `WSL_READY`, `agentServesKey: true`, `options: { knownHostsFile: OUR_PIN }`, `translated: ''` → `refused`, `reasons` `['known-hosts-translation-failed']`, `w.forgotten` `[OUR_PIN]`. Second world: `socketAlive: false`, relay `adopted: true` → `reasons` `['relay-not-running']`, `w.forgotten` `[OUR_PIN]`, `w.sshTerminals` `[]` | step A |
| T6 | `a request already gone is asked nothing and stops` | aborted `startGate`: `kind === 'stopped'`, `why === 'request-gone'`, `w.openers` `[]`, `w.hostKeyAsked` `[]`, `w.warnings` `[]`, `w.created` `[]` | step A |
| T7 | `a request gone during the lookup gets no host-key question and no warning` | `duringLookup: abort`, source with `warning`: `stopped`/`request-gone`, `w.hostKeyAsked` `[]`, `w.warnings` `[]` | step A; B5 |
| T8 | `a request gone after the host-key step stops and takes the pin back` | local storedKey, `options: { knownHostsFile: OUR_PIN }`, `duringHostKey: abort`: `stopped`/`request-gone`, `w.forgotten` `[OUR_PIN]`, `w.materialised` `[]` | step A; B6 |
| T9 | `a password gives an env with the password and no terminal; accept-new only without a pin` | password `hunter2`, `OPTIONS`: `ready`; `env.CREDS_PASSWORD === 'hunter2'`; `env.SSH_ASKPASS === '/storage/keys/askpass.sh'`; `acceptNew === true`; `entity.sshKeyPath === undefined`; `materializedKeyPath === undefined`; `w.created` `[]`. Second world `options: { knownHostsFile: '/storage/known_hosts' }`: `acceptNew === false` | step A; B7 |
| T10 | `a password entity with no host stops with the sentence and writes nothing` | `entity({ host: undefined })`, password: `stopped`/`no-host`, `w.warnings[0]` matches `/no host configured/`, `w.created` `[]` | step A; B8 |
| T11 | `a key that cannot be written stops, says so, and takes the pin back` | `materialiseFails: true`, `options: { knownHostsFile: OUR_PIN }`: `stopped`/`key-write-failed`, `w.errors[0]` matches `/Could not write the stored key/`, `w.forgotten` `[OUR_PIN]` | **step B** (a straight move leaves `forgotten: []`); B9 |
| T12 | `the snapshot is the entity handed in; the key path is set or cleared on the copy; jump and target are read off it` | `const ssh = entity()`; `options: { knownHostsFile: undefined, jump: 'jump.corp' }`; storedKey: `ready.snapshot === ssh` (strict), `ssh.sshKeyPath === undefined`, `entity.sshKeyPath === '/storage/keys/k1.key'`, `jump === 'jump.corp'`, `target === 'prod.corp.com'`. `agentServesKey: true`: `entity.sshKeyPath === undefined`. keyPath source `/home/me/.ssh/id_ed25519`: `entity.sshKeyPath` that path, `materializedKeyPath === undefined`, `cleanup()` forgets nothing | step A; B10 |
| T13 | `the relay route: prefix, no key, linux, nothing to clean` | `WSL_READY`, `agentServesKey: true`, `OPTIONS`: `prefix === "env SSH_AUTH_SOCK='/run/user/1000/creds-agent.sock' "`, `platform === 'linux'`, `entity.sshKeyPath === undefined`, `materializedKeyPath === undefined`, `w.materialised` `[]`; `cleanup()` → `w.forgotten` `[]` | step A |
| T14 | `the Windows-client route: program word, key written, pin not translated, the caveat said` | `WSL_WINDOWS_CLIENT`, `options: { knownHostsFile: OUR_PIN }`, `translated: '/mnt/c/x'`, entity with a local port forward: `options.program === '/mnt/c/Windows/System32/OpenSSH/ssh.exe'`, `options.knownHostsFile === OUR_PIN`, `w.translated` `[]`, `w.materialised` `['/storage/keys/k1.key']`, `platform === 'linux'`, `w.warnings.length === 1` and matches `/binds on WINDOWS/` | step A |
| T15 | `the order of the awaits: PIN, then host key, then translation` | `trace: string[]`; `duringLookup`, `duringHostKey`, `duringTranslate` push `'lookup'`, `'hostKey'`, `'translate'`; `WSL_READY`, `agentServesKey: true`, `options: { knownHostsFile: OUR_PIN }`: `trace` deepEqual `['lookup', 'hostKey', 'translate']` | step A; B4 |
| T16 | `ready has exactly its contract's keys and no command line` | storedKey local: `Object.keys(ready).sort()` deepEqual `['acceptNew', 'cleanup', 'entity', 'env', 'jump', 'kind', 'materializedKeyPath', 'options', 'platform', 'prefix', 'snapshot', 'target']` | step A; B12 |
| T17 | `cleanup never deletes a known_hosts file outside our directory` | `options: { knownHostsFile: '/home/someone/.ssh/known_hosts-e1' }`, storedKey local: `ready`; `cleanup()` → `w.forgotten` deepEqual `['/storage/keys/k1.key']` | step A; B13 |
| T18 | `the local window with no ssh client: the install offer carries the gate, nothing else happens` | `sshMissing: true`, a live `startGate`: `stopped`/`ssh-client-missing`, `w.installOffers` deepEqual `[{ tool: 'ssh', startGate }]`, `w.openers` `[]` | step A |
| P | **Parity**: `sshConnect.test.ts` (24) and `sshConnectRemote.test.ts` (25) green; `git diff --stat -- src_vs_code/src/test/sshConnect.test.ts src_vs_code/src/test/sshConnectRemote.test.ts` prints nothing; `remoteConnectParity.test.ts` green | green at every step; the pin of "byte-identical" |

Commands (from `src_vs_code`):

```bash
npm run typecheck && npm run lint
npm run compile && node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/sshSession.test.js"
npm run compile && node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/sshConnect*.test.js"
npm test
```

## S3.9 — Break-its (mutate one line, watch the named case fail, restore; both outputs in the PR)

| # | Mutation in `sshSession.ts` (or where named) | Red case | Symptom |
|---|---|---|---|
| B1 | `relayBranch` calls `openSshTerminal(...)` before returning `ready` (import it for the mutation) | T1 | `w.sshTerminals.length === 1` |
| B2 | `cleanup()` forgets the key only | T2 | `w.forgotten` lacks `OUR_PIN` |
| B3 | `cleanup()` without the `done` flag | T3 | `w.forgotten.length === 4` |
| B4 | `remoteRoute` decided after `connectionOptions` | T4, T15 | `w.hostKeyAsked.length === 1` in a refused window; trace order unchanged but T4 red |
| B5 | the gate after the lookup (row 4) removed | T7, `sshConnect.test.ts` "a client that leaves during the credential lookup is shown no host-key question" | `w.hostKeyAsked.length === 1` |
| B6 | the give-back in row 12 removed | T8, `sshConnect.test.ts` "a request already gone at a late refusal … pin file is taken back" stays green (different row) — T8 is the only catch | `w.forgotten` `[]` |
| B7 | `acceptNew = true` always | T9 (pinned half), `sshConnect.test.ts` "without a pinned host key, accept-new is added — with one, it is NOT" | `acceptNew === true` with a pin; the sent line holds `accept-new` |
| B8 | row 21's no-host check removed | T10, `sshConnect.test.ts` "a password entity with no host says so" | `ready` instead of `stopped`; in connectEntity, `createTerminal` for a hostless entity |
| B9 | row 19 returns `stopped` without the give-back | T11 | `w.forgotten` `[]` |
| B10 | `entity: snapshot` (no spread, `sshKeyPath` not set) | T12, `sshConnect.test.ts` "a stored key is materialised and passed to the terminal" | `entity.sshKeyPath === undefined` on a stored key |
| B11 | `prefix: ''` off the relay route | `sshConnectRemote.test.ts` "a LOCAL window is untouched" | `prefix === ''` where `undefined` is asserted |
| B12 | add `command` to `ReadySsh` and `ready(...)` | T16 | the key list has 13 entries |
| B13 | `forgetOurPin` without the directory guard | T17, `sshConnectRemote.test.ts` "a known_hosts path OUTSIDE our own directory is never deleted" | `/home/someone/.ssh/known_hosts-e1` in `w.forgotten` |
| B14 | import `materializedKeysDir` from `'./keyInstaller'` | T2, T5, T8, T11, T17 | `TypeError: materializedKeysDir is not a function` — why rule 3 of §S3.6 exists |
| B15 | in `sshConnect.ts`, `openKeyTerminal` passes no fourth argument on rows 17 and 25 (today's shape) | none — both suites stay green | records that the pass-through is free: `undefined` and "omitted" are the same to the mock and to the default |

B15 is run to show a non-finding, as the parity row's evidence; the others must each go red.

## S3.10 — Opus review checklist for the code

- Order: §S3.3 rows 1-23 appear in `sshSession.ts` in that order; `git diff -M --color-moved` of the moved block
  shows moved lines, not rewritten ones; no new `await`; the comments of `:157-165`, `:171-172`, `:174-175`,
  `:186-187`, `:193-197`, `:203-208`, `:214-215`, `:220-222`, `:234-247`, `:251-255`, `:267-274`, `:297-299`,
  `:301-303`, `:322-324` travel with their lines.
- `sshSession.ts` never names `createTerminal`, `openSshTerminal`, `sendText`, `show(` (grep); it imports `vscode`
  for `showWarningMessage` and `showErrorMessage` only.
- Every exit after `connectionOptions` returned a value passes through ONE give-back helper (rows 11-15, 19, 21);
  `withTranslatedKnownHosts` keeps its own (moved verbatim); the helper is called on `resolved.knownHostsFile`,
  never on `options.knownHostsFile`.
- `cleanup()`: a `done` flag, key then pin, never throws; `materializedKeyPath` is the ONLY key it deletes (a
  `keyPath` source's file is never touched).
- `ReadySsh` has exactly the twelve keys of T16; `snapshot` is the argument object itself; `entity` is a spread
  with `sshKeyPath` set or `undefined`; no `command` field.
- `prefix` is `undefined` off the relay route and always passed as the fourth argument in `openKeyTerminal`.
- `refused.retryable` is `false` only on row 11; `connectEntity` turns it into `undefined` for `refuseAndOfferTheFix`
  and still honours `allowRetry === false`.
- `connectEntity`: no `await` after `prepareSshSession`; `openPasswordTerminal` disposes, creates, shows, sends in
  today's order with `withAcceptNew`; `openKeyTerminal` forgets `materializedKeyPath` at the two sites of F3 and
  nowhere else; the `:135` disable is gone; no new disable anywhere; `npm run lint` green.
- `sshConnect.ts` re-exports `RemoteWindowDeps` as a type; `ConnectOptions extends PrepareOptions`;
  `remoteConnectHost.ts`, `sshUseActions.ts`, `commands/agentCommands.ts` unchanged; `remoteConnectParity.test.ts`
  green; `sshSession.ts` does not write `connectEntity(`.
- §S3.6 rules 1-7 hold: `sshSession.ts` in `src/`; request strings identical; only mocked names imported from mocked
  modules; `sshConnectWorld.ts` loads both modules with `loadEachWithVscode` and adds `seam` — no mock duplicated,
  no other fixture change.
- Parity: the two suites have a zero diff; 24 + 25 pass; the RED record shows step A's compile failure and step B's
  T11 failure (`forgotten: []`) before the green run; B1-B14 each red, B15 recorded green.
- `ready.env` is never logged or stringified; no test prints a `ready` object.
- Documents: `research/module_extension.md:208` paragraph gains two sentences naming `prepareSshSession` and the
  contract of §S3.4; `research/module_tests.md` gains a row for `sshSession.test.ts` (T1-T18) and corrects "(32)"
  to 24 (F11); `todo/README.md` gains this spec's row in E1's commit; the parent's ledger reads `2 of 2` (F12).
- Risk 7 is written in `sshSession.ts` beside `askpassEnv`'s call as an inherited defect with a link to
  `PLAN_askpass_answers_the_hop.md`, not fixed.

## S3.11 — Decisions closed

| # | Decision | Why |
|---|---|---|
| D1 | `materializedKeyPath` is exposed, and `connectEntity` keeps `forgetMaterializedKey` at its two sites instead of calling `cleanup()` | Byte-identical (F3): today the pin file is not deleted on terminal close or failed open. Roads never call `forgetMaterializedKey`; they call `cleanup()`. |
| D2 | `cleanup()` = key + pin, one function, idempotent | A road with two functions can forget half. The pin after a session ended is garbage; the entity's `hostKey` holds the trust, not the file. |
| D3 | `ready` holds no command line | D7 of the parent: the composer is the only road to a line. T16 pins the key list. |
| D4 | **The one deviation from byte-identical**: a stored key that cannot be written (`:287-292`) takes its pin file back before `stopped('key-write-failed')` | The contract table must say "stopped → nothing on disk" without a footnote, or roads build on a maybe. Closes a gap F4 names. Both old suites are indifferent to it (they use `OPTIONS` there). Also: row 21's `giveBack` deletes a pin in one more case — a safe host with an unsafe `user`: `buildSshCommand` returns `undefined` through `isSafeSshTarget` (`sshCommand.ts:84-88`) while `knownHostsLine` checks only the host (`hostKeyPin.ts:124-127`), so the pin was written; the old code left it, the new code deletes it. A second, harmless deviation. |
| D5 | `target` is `string \| undefined`; the no-host check stays in the password branch only | Byte-identical for the key branches: today the sentence comes from `openSshTerminal` AFTER the key is written and the key is then forgotten (`:333-337`). Roads never see `undefined`: `sshLinkOf` (S2) refuses a link without a safe host before prepare. A road still treats `undefined` as a refusal, defensively. |
| D6 | `StopReason` on `stopped` | Free, read by tests (T6-T8, T10, T11, T18); nothing in production branches on it. |
| D7 | `RemoteWindowDeps`, `LOCAL_WINDOW`, `PrepareOptions`, `windowOf` live in `sshSession.ts`; `ConnectOptions` extends `PrepareOptions` in `sshConnect.ts` | No import cycle; the retry fields are connectEntity's alone; the two external importers of the type are unchanged (F9). |
| D8 | The askpass script is written by prepare and deleted by nobody but the purge | As today (`keyInstaller.ts:206-213`): static, secret-free, shared. Deleting it in `cleanup()` would break a second live password terminal. |
| D9 | The fixture change is one call and one field | Rule 5 of §S3.6. A second world would copy nine mocks. |
| D10 | `withAcceptNew` is exported from `sshSession.ts` | E2's arrow and E3's secrets need the same regex on their own lines; one copy. The regex (`/^ssh /`) is today's, with today's limit: a program word that is not `ssh` (a quoted Windows path) is not matched — inherited, to be checked by E2.S1 on Windows, not changed here. |

## S3.12 — Not verified by this spec, and what the roads inherit

- Risk 7: `ready.env` answers every password prompt of the ssh process, the hop's included. Inherited; fixed with
  `PLAN_askpass_answers_the_hop.md`.
- `ready.env` lives in memory until the owner drops it. A road that keeps `ready` in a long-lived list (the folder
  run, parent §4.4) holds the password for the run's life. E2.S2's review checks that the list is dropped in the
  run's `finally`.
- Between `prepareSshSession` and a road's send there are awaits (trust, dependencies). The seam's last gate is row
  12 or 15; a road that serves an agent request must read `startGate` again before its send (E3.S2).
- Two prepares of one entity in one window write one key path and one pin path (same ids). The second `cleanup()`
  deletes files the first session may still use. Today's `connectEntity` has the same shape through terminal reuse
  (`terminalManager.ts:36-41`). Not changed here; recorded for E2.S2 (folder run with a duplicated row).
- The 50-line and complexity limits are checked by lint, not by this spec's table; the cut in §S3.7 is a suggestion
  that fits, not a requirement of names.

## S3.13 — Lead amendment, 2026-11-10 (after the cadence consultation, verified in code)

**A1 — A road's session owns its files ALONE.** Verified: the key file is `keys/<pid>/<entityId>.key`
(`keyInstaller.ts:154`) and the pin file `known_hosts-<entityId>` (`hostKeyTrust.ts:67`). Two prepares of one SSH entry
share both paths, so a dependency step linked to the same SSH entry as its parent deletes the parent's key and pin in
its `cleanup()` BEFORE the parent's send (order: prepare → trust → dependencies → send). This is not a folder-run
corner case (§S3.12 bullet 4 is withdrawn); it is the seam's ownership contract.
- `PrepareOptions` gains `readonly isolate?: boolean`. `connectEntity` never sets it: SSH Connect keeps today's names
  and stays byte-identical, and its suites stay unchanged.
- With `isolate: true` (every road in E2 and E3 passes it) the key is written as `<entityId>-<uuid>.key` and the pin as
  `known_hosts-<entityId>-<uuid>`, the uuid from `crypto.randomUUID()` per preparation, in the same `keys/<pid>/`
  folder (so the activate/deactivate purge still owns them). Add an optional `suffix` parameter to
  `materializePrivateKey` and to the known_hosts writer; omitted, the name is today's. The suffix is a uuid, never vault
  data, and passes `safeFileComponent` unchanged.
- `cleanup()` deletes exactly the two paths THIS preparation wrote.
- New scenarios: **T20** two isolated prepares of one SSH entry write four distinct files; cleaning the second leaves
  the first's key and pin on disk. **T21** a non-isolated prepare writes today's names (byte-identical guard).

**A2 — `ReadySsh` satisfies S2's `PreparedForTyping`.** The E1.S2 spec §S2.2 is amended to match this type: its
`ssh` field is read from `entity` (the snapshot with the key path set or cleared), and `prefix` is
`string | undefined`. `test/sshSession.test.ts` pins it at compile time: `const typed: PreparedForTyping = ready;`
(the test imports both modules; neither module imports the other).
