# PLAN — E1.6 spec: SSH execution containment — what each leg of a bridged `ssh` offers, and to whom

> Status: **spec, 2026-11-12, by Fable, written as a security spec (authentication: what a leg offers and to whom) before its code; not built.**
> Story E1.6 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md):
> §4.9 whole, §4.2's two in-scope answers and N7, §4.11's bridged half, §5 step 3c, §6, §7 *The SSH contract* legs (a)-(i), *The file writer refuses
> injection*, *In scope, visible or not*, *Links*, M8 and M9, §8, §9, `## Epics` E1, ledger entries 8.2 and 9.1). The parent is approved at epoch 9
> and is not edited here. Where this spec found the parent silent or inexact, the contract is **not** changed: the point is in §S6.10 with its
> evidence, and the spec builds the safe side.
>
> Scope: `src_vs_code/src` (`sshUseActions.ts`, `sshExecCommand.ts`, `sshOptions.ts`, `sshExecAuth.ts` (one export), `materializedKeys.ts`,
> `agentUseActions.ts` (one call), `dbCliLauncher.ts`; new `bridgedSshConfig.ts`, `bridgedSshEnv.ts`, `bridgedSshCall.ts`); the tests of §S6.5;
> `src_vs_code/scripts` (`bridged-ssh-itest.cjs` and `bridged-mysql-itest.cjs`, new; `itestSshd.cjs`; `run-itests.mjs`); `src_vs_code/package.json`
> (two `itest:` lines); `.github/workflows/ci-extension.yml` (two steps); `research/module_extension.md`, `research/module_tests.md`. No UI, no
> command, no `extension.ts` line, no help article, no client (`src_cli`, `src_mcp`, `src_broker_client` have an empty diff), no CHANGELOG bullet (§S6.11).

Every path is relative to `src_vs_code/src/` unless it starts with `scripts/`, `todo/` or `research/`. Every `file:line` was opened on this tree
(`13733b4c`: `main` at `53b9879f` plus change 9.1) on 2026-11-12. Lines the parent quotes from older commits are cited again here against this tree.

**How to read this spec.** **[C]** marks a contract: the coder builds against it and a test pins it. **[S]** marks a sketch: a name, a shape or an
order that the coder may replace, with the reason in §S6.13. A line with no mark in §S6.0 is an observation, with its date.

## S6.0 — Facts this spec rests on

| # | Fact (verified on `13733b4c`) | Consequence |
|---|---|---|
| H1 | `execOverSsh` (`sshUseActions.ts:272-296`) is the body through which `ssh:exec` and the agent's linked `run` start `ssh`: `prepareAuth` (`:275`), `call.jump()` (`:280`), `execArgv` (`:285`), `agentAwareLaunch` (`:286`), `runSshExec` (`:287`, no `cwd`), `removeKeyFile` in `finally` (`:293`). Two callers: `ssh:exec` (`:340`) and the agent's linked `run`, which a bridge refuses before it (`agentUseActions.ts:270-272`). | The bridged branch is built in `execOverSsh`. Only `ssh:exec` reaches it with `ctx.bridge` set. |
| H2 | The lock of partial E1: `unguardedBridge` (`:418-420`) refuses a bridged call when `deps.bridgedSshConfig` is absent; `sshDepsFor` (`:447-470`) gives none; `BridgedSshConfigWriter` (`:84`) takes `{ callId }` and answers `{ cwd, configFile }`; nothing calls it. Tests: G1 and G2 (`test/bridgeLinks.test.ts:238`, `:257`). | E1.6 wires the real writer and widens the type. The refusal for a call with no file stays (§4.9: *a bridged call without the file is refused*). |
| H3 | `buildSshExecArgv` (`sshExecCommand.ts:128-174`): the host-key words are `:145-150`; a pinned entry gets `-o UserKnownHostsFile=<path>` (`:148`); a bridged call gets `BRIDGED_SSH_OPTIONS` (`:28-35`, `:156-158`); an unsafe target answers `undefined` (`:135-137`). | On a bridge the option at `:148` goes; `-F c.conf` and the password words come in. |
| H4 | `execArgv` casts that answer to `string[]` with the comment *the host was checked by the caller* (`sshUseActions.ts:254-258`). The caller checks only that a host exists (`unusableEntity`, `:160-165`). Node starts a program with no arguments when the argv is `undefined` (run here, 2026-11-12). | A defect on `main` (§S6.10 P5). On a bridge E1.6 refuses an `undefined` argv before the spawn. |
| H5 | The pin file of an agent's call is `known_hosts-<entry id>` in `keys/<pid>/`, written by `materializeKnownHosts` (`hostKeyTrust.ts:66-68`, `:80-98`), called at `sshUseActions.ts:219`. Only the entry of the call gets one; a hop gets none. | On a bridge E1.6 does not call it. It writes per-call pin files with no id in the name (change 9.1). |
| H6 | The environment of the child is `{ ...process.env }` on every credential kind (`sshExecAuth.ts:98`, `:147`, `:163`), plus `askpassEnv` for a password (`sshAskpass.ts:37-53`: `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`, and `DISPLAY` off Windows). | On a bridge the environment is built new from the allow-list. These four names are taken from the credential's answer for a password destination only. |
| H7 | `resolveJumpChain` (`sshOptions.ts:172-190`) walks `jumpHostEntityId`, refuses a hop that is gone or whose address fails `isSafeSshTarget` (`:148-158`), and answers only the `-J` text (`:189`); `hopOf` (`:108-111`) writes `user@host[:port]`. `isSafeSshHost` allows `A-Za-z0-9._:[]-` only (`sshCommand.ts:83-85`). | E1.6 needs the hop entries. The walk answers them too. A host can hold no quote, space or control character. |
| H8 | `resolveSshCredential` (`sshCredential.ts:45-63`) answers `storedKey`, `keyPath` (`:59-60`), `password`, `none` or `stopped`, with the automatic opener by default. `resolveExecAuth` turns `keyPath` into `-i <path>` unchanged (`sshExecAuth.ts:146-147`). `byStoredKey` refuses a sealed value before any write (`:157-160`). | A hop's credential is read with `resolveSshCredential`. The sealed check is reused, not copied. |
| H9 | `materializedKeyPath` (`materializedKeys.ts:112-114`) is the one builder of a path in `keys/<pid>/`; `test/keysDirPaths.test.ts:70-80` fails on any `path.join(materializedKeysDir(` outside `materializedKeys.ts`. `purgeMaterializedKeys` (`keyInstaller.ts:269-292`) removes `keys/<own pid>/` with every folder in it. | The per-call folder gets a builder in `materializedKeys.ts`. The purge covers it. |
| H10 | `runSshExec` takes `cwd` (`sshExecRunner.ts:49-54`, `:132`). `sshSpawnLaunch` answers the bare word `ssh` when the entry does not forward the agent (`sshProgram.ts:338-347`); a bridge refuses a forwarding entry (`sshUseActions.ts:164`). | `cwd` needs no new seam. On a bridge the program is the bare `ssh`, and `cwd` holds only `c.conf`. |
| H11 | `dbQueryAction` starts the client with `env: { ...process.env, ...launch.env }` (`agentUseActions.ts:628-629`); `buildDbQueryLaunch` (`dbCliLauncher.ts:233-310`) has no bridged flag; its test pins *never `--no-defaults`* (`test/dbCliLauncher.test.ts:378-385`). The parent cites these as `agentUseActions.ts:342`, `:369`, `:372`, which are stale. | Part B (§S6.2 B8) adds the bridged flags and the environment. |
| H12 | `startSshd` (`scripts/itestSshd.cjs:89-115`) picks its own port, listens on `127.0.0.1`, and puts `extraConfig` **after** `PasswordAuthentication no` (`:105-107`). `sshd` keeps the first value. The CI `sshd` is not root and cannot check a password (`.github/workflows/ci-extension.yml:158-161`). | The harness gets a fixed address and port and lines that go first. No leg can show a password login that succeeds: a leg shows who was **asked**. |
| H13 | `linksWorld` (`test/bridgeLinksWorld.ts:79-153`) runs the real `sshExecAction` with a stub writer that writes nothing (`:132-135`). Its hop `j1` has no key (`:194-198`). L2 and L3 pin N7 (`test/bridgeLinks.test.ts:75`, `:120`). | After E1.6 the world uses the real writer, and `j1` gets a key of its own, or L3 and F1 are refused on a bridge. |
| H14 | PR #359 (branch `fix/agent-refusal-key-file-path`, head `05ac86a4`, read with `git show`, not merged): `callKeyName()` in `materializedKeys.ts` answers `call-<uuid>`; `materializeCallKey(storageDir, content)` in `keyInstaller.ts` writes `call-<uuid>.key`; `byStoredKey` calls it (`sshExecAuth.ts:161` there) and the `node:crypto` import is gone; scan S1 (`test/keysDirPaths.test.ts` there) fails on the word `materializePrivateKey` in any file but `keyInstaller.ts`, `sshSession.ts`, `transportFactory.ts`, an import included. | §S6.1 E3. |

**Measured here for this spec** (OpenSSH_10.2p1, Linux, 2026-11-12; `ssh -G` and `ssh -v` against a listener that says nothing; no `sshd` on this machine, so no login was run):

| # | What was run | Result |
|---|---|---|
| X1 | `IdentityFile "${VAR}"` in a `Host` block of the `-F` file; and `-i '${VAR}'` on the command line; `VAR=hunter2` in the environment | `ssh -v` prints `identity file hunter2 type -1` for both. `UserKnownHostsFile "…${VAR}"` shows the value in `-G`. **`ssh` puts an environment variable into a path.** |
| X2 | `UserKnownHostsFile "/tmp/x y/100%%me/pin"` | `-G` prints `/tmp/x y/100%me/pin`: `%%` is one `%`. A single `%z` in `IdentityFile` is kept by `-G`; what the load does with it was not run. |
| X3 | `Host HOP.Example` with the target `hop.EXAMPLE`; `Host hop.example` with `HOP.Example`; `Host HOP.Example` with `HOP.Example` | Only the third matches. **A `Host` pattern is compared with the host as typed, letter case included.** `-J u@HOP.Example:1` gives the nested command the host `HOP.Example`. |
| X4 | `-J 'u@[::1]:1'`; `Host [::1]` and `Host ::1` | The nested command gets `::1`. `Host [::1]` does not match it; `Host ::1` does. |
| X5 | `IdentityFile "C:\dir\"` | `invalid quotes`, the file is refused, `ssh` ends. |
| X6 | The password words on the command line over the file of §S6.3 | `batchmode no`, `passwordauthentication yes`, `kbdinteractiveauthentication yes`, `numberofpasswordprompts 1`; the only identity is the sentinel; the known-hosts file is the destination block's. For an unpinned key destination: `stricthostkeychecking accept-new` and the two files of `Host *`. |

## S6.1 — Entry conditions

- **E1. M8 (4)-(8) recorded.** Met on 2026-11-11 (parent §7 M8).
- **E2. Epoch 9 open.** Met on 2026-11-12 (parent ledger).
- **E3. PR #359 is on `main` before E1.6's first code commit. [C]** The coder merges that `main` into the E1.6 branch and reads `sshExecAuth.ts`
  again: `byStoredKey` calls `materializeCallKey`, and there is no `node:crypto` import. E1.6 imports `materializeCallKey` from `./keyInstaller` and
  `callKeyName` from `./materializedKeys`, adds no file to S1's list, and never writes the word `materializePrivateKey` in a new file.
  *Why this order.* Change 9.1 names two functions that exist only on that branch. S1 is the control for E1.6's hop writer, and a control is there
  before the code it guards. E1.6 opens way (c) of that plan on a bridge (`ssh`'s own stderr with a key path), and with #359 on `main` the
  destination's key file has a random name on the day the lock goes.
  *The other order, only on the lead's word.* If #359 cannot merge first, the coder adds `callKeyName()` and `materializeCallKey()` to the same
  two files with that branch's text, byte for byte, and nothing else of #359 (not S1, not `byStoredKey`). The PR body and §S6.13 then say that
  the destination's stored-key file still holds the key entry's id until #359 merges, and that no door reaches it (R1, `test/bridgeBoundary.test.ts:158`).
  #359, which then merges second, reads `sshExecAuth.ts` and `bridgedSshCall.ts` again, and its S1 must pass on them.
- **E4. Re-read at the start.** `sshUseActions.ts`, `sshExecAuth.ts`, `sshProgram.ts`, `agentUseActions.ts` at their `main` state. Three open
  plans touch them (§S6.8). If one merged since this spec, the facts H1, H6 and H10 are checked again before the first test is written.

## S6.2 — What is built, step by step

RED first. Each step names its tests of §S6.5. A step is one commit or less. In a step marked **[C]** the behaviour its text states is the
contract. The names and signatures in the code blocks are **[S]**, but four names are the parent's and stay: the dep `bridgedSshConfig`, the file
`c.conf`, `test/bridgedSshConfig.test.ts` and `scripts/bridged-ssh-itest.cjs`.

**B0 — The tests that are RED today.** Write `test/bridgedSshConfig.test.ts` (F1-F6), `test/bridgedSshEnv.test.ts` (N1-N6) and the door
cases L1, L3, L6-L9 of `test/bridgeLinks.test.ts` first. Watch each fail for its own reason (no module; no `-F`; a hop with a password runs).
The record goes in §S6.13.

**B1 — The hop entries. [C]** `sshOptions.ts`: the `ok` branch of `JumpChain` (`:105`) gains `hops: readonly EntityMetadata[]`, in the order
`ssh` contacts them (the order of the `-J` text). `resolveJumpChain` fills it from the entries it already reads at `:185`. One walk, no second
function. Callers that read `value` do not change. Test J1.

**B2 — The folder builder. [C]** `materializedKeys.ts`, beside `materializedKeyPath`:

```ts
export const BRIDGED_CONFIG_FILE = 'c.conf';
/** The folder of one bridged call, `keys/<pid>/<callName>/`, and its one file. It creates nothing. */
export function bridgedCallFolder(storageDir: string, callName: string): { readonly dir: string; readonly file: string };
//   dir = path.join(materializedKeysDir(storageDir), safeFileComponent(callName)); file = path.join(dir, BRIDGED_CONFIG_FILE)
```

`callName` is always a fresh `callKeyName()`. No entry id, no `callId` from a request. `keysDirPaths.test.ts` stays green with no exception. Test P1.

**B3 — The text of the file. [C]** New `bridgedSshConfig.ts`, pure, no `vscode`, no `fs`:

```ts
export type HostCheck = { readonly pinnedFile: string } | { readonly firstContact: true };
export interface HopBlock { readonly host: string; readonly identityFile: string; readonly check: HostCheck; }
export interface ConfigInput {
  readonly hops: readonly HopBlock[];                       // ssh order
  readonly destination: { readonly host: string; readonly pinnedFile?: string };
  readonly noDefaultIdentity: string;                       // <keys/<pid>>/no-default-identity; the file never exists
  readonly firstContactFile: string;                        // <storageDir>/bridges/known_hosts
  readonly personKnownHosts: string;                        // <injected home>/.ssh/known_hosts
}
/** True when the value cannot be written into the file, or handed to `ssh` as a path. The ONE check of every value. */
export function unsafeSshConfigValue(value: string): boolean;
/** The file, or the name of the first field that failed the check. It echoes no value. */
export function bridgedConfigText(input: ConfigInput): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly field: string };
export const BRIDGED_LOCKDOWN: ReadonlyArray<readonly [keyword: string, value: string]>;   // the 16 lines of `Host *` that hold no path, §S6.3
export const BRIDGED_ASKPASS_OPTIONS: readonly string[];                                    // §S6.3
```

The value rule and the file's shape are §S6.3. Tests F1-F6.

**B4 — The environment. [C]** New `bridgedSshEnv.ts`, pure:

```ts
export const BRIDGED_ENV_POSIX = ['PATH', 'HOME'] as const;
export const BRIDGED_ENV_WINDOWS = ['PATH', 'SYSTEMROOT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'COMSPEC'] as const;
export const BRIDGED_ENV_EXTRA = ['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'CREDS_SSH_PASSWORD', 'DISPLAY',
  'PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER'] as const;
/** A NEW object: each listed name that `source` holds, then `extra`. It throws on an `extra` name that is not in BRIDGED_ENV_EXTRA. */
export function bridgedSshEnv(source: NodeJS.ProcessEnv, platform: NodeJS.Platform, extra?: Readonly<Record<string, string>>): NodeJS.ProcessEnv;
```

Rules: `source` is never spread. On `win32` a listed name is found in `source` in any letter case and written under the list's spelling. A
name that `source` does not hold is left out, not written as `undefined`. Tests N1-N6. M9 may make the Windows list shorter (§S6.9).

**B5 — The files of one call.** New `bridgedSshCall.ts` (it imports `./keyInstaller`, so tests load it with the `vscode` stub).

```ts
export interface BridgedLeg { readonly entity: EntityMetadata; readonly credential: SshCredentialSource | SshCredentialStopped; }   // one hop
export interface BridgedCallInput {
  readonly destination: EntityMetadata; readonly auth: SshExecAuth; readonly keyPath: string | undefined; readonly hops: readonly BridgedLeg[];
}
export type BridgedCallFiles =
  | { readonly ok: true; readonly cwd: string; readonly configFile: typeof BRIDGED_CONFIG_FILE; readonly pinned: boolean;
      /** After the run: one journal sentence for each line that is new in `bridges/known_hosts`. Never throws. */
      firstContacts(): readonly string[];
      /** Removes every file and the folder this call wrote. Never throws; a failure is one note. */
      remove(): void }
  | { readonly ok: false; readonly code: 'no_credential' | 'internal'; readonly reason: string };
export interface BridgedBase { readonly storageDir: string; readonly home: string; readonly platform: NodeJS.Platform; note(message: string): void; }
/** No vault: the legs are given. The itest calls this. */
export function writeBridgedCall(base: BridgedBase, input: BridgedCallInput): BridgedCallFiles;
/** The vault half: reads each hop's credential with `resolveSshCredential` (the automatic opener), then `writeBridgedCall`. */
export function bridgedSshConfigWriter(parts: { storage: StorageManager; storageDir: string; home: string; note(message: string): void }): BridgedSshConfigWriter;
/** argv, environment and cwd of the spawn. `execOverSsh` and the itest both call it, so the itest runs what production runs. */
export function bridgedSpawn(input: { destination: EntityMetadata; keyPath: string | undefined; auth: SshExecAuth; askpassEnv: NodeJS.ProcessEnv;
  jump: string | undefined; remoteCommand: string; files: Extract<BridgedCallFiles, { ok: true }>; sourceEnv: NodeJS.ProcessEnv; platform: NodeJS.Platform })
  : { readonly argv: string[]; readonly env: NodeJS.ProcessEnv; readonly cwd: string } | undefined;
```

**The order inside `writeBridgedCall`. [C]** Two passes. The first writes nothing.

1. *Refuse, in this order* (sentences in §S6.4): a hop's credential is `password`, `none`, `stopped`, a `keyPath` that is empty, or a
   `storedKey` whose content is sealed (the check of `sshExecAuth.ts:157`, exported from there as one function and used by both); two legs with one host
   (compared without letter case; the destination and every hop); a password destination with no pin (`auth === 'askpass'` and no known-hosts line
   from `parseHostKey` and `knownHostsLine`, `hostKeyPin.ts:107`, `:124`); a value that fails `unsafeSshConfigValue`: the keys folder's path, the
   first-contact file's path, the person's file's path, each host, each hop's typed key path, the destination's `keyPath`.
2. *Write*, in this order: the keys folder (0700); each `storedKey` hop's key with `materializeCallKey(storageDir, content)`; each pinned leg's pin
   file (below); `<storageDir>/bridges/` (0700, so `ssh` can make the file in it); the call folder (0700) and `c.conf` (0600, `lockToOwner`), from
   `bridgedConfigText`. A failure in this pass removes what the pass wrote and answers `internal` (§S6.4 R7). `bridgedConfigText` asks the value
   rule again of every value it writes; if it refuses here, the pass removes what it wrote and answers R6.

**The pin file. [C]** One function in `bridgedSshCall.ts`: it writes one known-hosts line (`knownHostsLine`) to
`materializedKeyPath(storageDir, callKeyName() + '.known_hosts')`, mode 0600, `lockToOwner`. The destination's pin and each pinned hop's pin are
written by it. No entry id is in the name. `materializeKnownHosts` is not called for a bridged call.

**A `keyPath` hop. [C]** Its typed path goes into its block as typed. Nothing is copied, and `remove()` does not touch it.

**`remove()`. [C]** It removes the hop key files, the pin files, `c.conf` and the call folder, each in its own `try`. A failure writes one note
(`ssh:exec — a file of the call could not be removed: <describeError>`) and throws nothing, as `removeKeyFile` does (`sshUseActions.ts:227-239`).
The destination's own key file stays `removeKeyFile`'s.

**First contact. [S]** `writeBridgedCall` reads the lines of `bridges/known_hosts` when a leg is `firstContact` (a file that is not there has no
lines). `firstContacts()` reads it again and answers one sentence (§S6.4 J1) for each line that was not there. Two calls at once can each note
the same line; that is accepted.

Tests W1-W10.

**B6 — The argv. [C]** `sshExecCommand.ts`: `SshExecOptions` gains `configFile?: string` and `pinned?: boolean`. Only when `bridged === true`:

- no `configFile`, or a `knownHostsFile` given: the answer is `undefined` (a bridged call without the file is refused, like an unsafe host);
- the host-key words are `-o StrictHostKeyChecking=yes` when `pinned`, else `-o StrictHostKeyChecking=accept-new`. **No word starts with `UserKnownHostsFile=`**;
- after `BRIDGED_SSH_OPTIONS`: `BRIDGED_ASKPASS_OPTIONS` when `auth === 'askpass'`, then `-F`, `configFile`.

The order on a bridge: the auth word (`-o NumberOfPasswordPrompts=1` or `-o BatchMode=yes`), the host-key word, `-o ConnectTimeout=10`, `-J …`,
the six of `BRIDGED_SSH_OPTIONS`, the three of `BRIDGED_ASKPASS_OPTIONS` for a password, `-F c.conf`, `-i <path>`, `-p <port>`, `--`, the
destination, the command. Off a bridge nothing changes: not one word, not the order. Tests A1-A6.

**B7 — The road. [C]** `sshUseActions.ts`:

- `BridgedSshConfigWriter` becomes `(call: { accountId: string; destination: EntityMetadata; auth: SshExecAuth; keyPath: string | undefined; hops: readonly EntityMetadata[] }) => Promise<BridgedCallFiles>`.
- `sshDepsFor` gives the real one: `bridgedSshConfigWriter({ storage, storageDir, home: os.homedir(), note })`. G2 flips.
- `unguardedBridge` and `refusedBeforeSlot` stay. The field stays optional, so a test world or a later caller with no writer is refused and
  cannot run a bridged `ssh` with no file. `NO_BRIDGED_SSH_CONFIG` becomes `'no per-call ssh_config for this call'`. G1 keeps its assertions with that text.
- `connectionArgvOptions` does not call `materializeKnownHosts` on a bridge.
- `execOverSsh`, when `ctx.bridge !== undefined`, after the chain (`:280-283`): call the writer; a refusal goes to `refuse(code, reason)`; then
  `bridgedSpawn(…)`; an `undefined` answer goes to `refuse('no_credential', R8)`; then `runSshExec(argv, { program, env, cwd, … })` with the program of
  `sshSpawnLaunch` and **the environment of `bridgedSpawn` alone** (nothing of `agentAwareLaunch`'s environment, nothing of `prepared.env` but the
  four askpass names, and those only when `prepared.auth === 'askpass'`); then one `deps.note` for each sentence of `firstContacts()`; in the
  `finally`, `removeKeyFile` as today and `files.remove()`.
- Off a bridge, `execOverSsh` runs the lines it runs today.

`sshUseActions.ts` is 470 lines; it stays under 540. Each new module stays under 300. Tests L1-L10, G1, G2.

**B8 — The database client on a bridge (parent §4.11, the bridged half). [C]**

- `dbCliLauncher.ts`: `buildDbQueryLaunch(dbType, connectionString, query, options: { bridged?: boolean } = {})`. Bridged `postgres`: `-X` is the
  first argument, before `-c`. Bridged `mysql`: `--no-defaults` is the first argument, before `-h`. `mssql`: no flag (`-X1` breaks the login on go-sqlcmd,
  change 4.1). Off a bridge the arguments are today's, byte for byte, and the test at `test/dbCliLauncher.test.ts:378-385` stays as it is.
- `agentUseActions.ts:610`: pass `{ bridged: ctx.bridge !== undefined }`. `:629`: on a bridge the environment is
  `bridgedSshEnv(process.env, process.platform, launch.env)`; off a bridge the line is today's.

Tests Q1-Q4 and the itest leg (m).

**B9 — The harnesses.** `scripts/itestSshd.cjs`: `startSshd` takes an options object `{ address?, port?, first? }`: the listen address (default
`127.0.0.1`), a fixed port, and config lines that go **before** the defaults. The known-hosts line names the address. Today's callers do not change.
`scripts/bridged-ssh-itest.cjs` (the name is fixed by the parent's §4.9) and `scripts/bridged-mysql-itest.cjs`; a row each in `HARNESSES` of
`scripts/run-itests.mjs`; `itest:bridged-ssh` and `itest:bridged-mysql` in `package.json`; two steps in `.github/workflows/ci-extension.yml` after the
SSH agent step. Scratch folders go through `scripts/lib/harnessScope.cjs` and `ownedDir`, as `scripts/itestForwardAgent.cjs:180-181` does.

**What B6 breaks, and how it is mended.** A bridged argv with no `configFile`, or with a `knownHostsFile`, is now `undefined`. Two legs of
`scripts/itestForwardAgent.cjs` build one (`oneLeg` with `bridged`, `:99`; `bridgedLeg`, `:131`): they are rewritten to go through
`writeBridgedCall` and `bridgedSpawn`, and their controls stay as they are. The mux pair then proves "no multiplexing" under the file. Four unit
cases build one too (`test/sshExecCommand.test.ts:144`, `:168`, `:223`, `:225`): they get `configFile: 'c.conf'` and keep their assertions.

**B10 — The owed tests.** X1 (the door case of change 8.2), K1 (the `keyPath` unit test), and L2 and L3 kept green with no edit to their assertions.

## S6.3 — The file, the argv and the environment (contracts)

**The file. [C]** Lines end with LF. Each keyword line is indented two spaces. Every path is in double quotes. Blocks in this order:

```
Host <hop 1 host>                                   one block for each hop, in ssh order
  IdentityFile "<that hop's key file>"
  StrictHostKeyChecking <yes | accept-new>
  UserKnownHostsFile "<that hop's pin file>"        or, for accept-new: "<first-contact file>" "<person's file>"
Host <destination host>                             only when the entry pins a host key
  StrictHostKeyChecking yes
  UserKnownHostsFile "<the destination's pin file>"
Host *
  BatchMode yes
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  IdentityAgent none
  IdentitiesOnly yes
  IdentityFile "<keys/<pid>>/no-default-identity"
  ForwardAgent no
  ControlMaster no
  ControlPath none
  ClearAllForwardings yes
  ForwardX11 no
  Tunnel no
  PermitLocalCommand no
  ProxyCommand none
  ConnectTimeout 10
  StrictHostKeyChecking yes
  UserKnownHostsFile "<storageDir>/bridges/known_hosts" "<home>/.ssh/known_hosts"
  GlobalKnownHostsFile none
```

- A hop block has exactly those three keywords. The destination block has exactly those two. `Host *` has exactly those eighteen lines, in that order.
  A test parses the written text and fails on any other keyword in a block (F2). So a block cannot weaken `Host *`.
- **The `Host` word is the host as the entry holds it, letter case kept** (X3). For a hop, one pair of square brackets around the whole host is
  taken off (X4). It is never made lower case.
- **Our own paths** (key files, pin files, the sentinel, the first-contact file, the person's file) are written with each `%` as `%%` (X2). **A
  typed key path** of a hop is written as typed. Backslashes are written once.
- `<home>` is the injected home (`os.homedir()` in production, the rig home in the itest). The writer reads no environment variable itself.

**The value rule. [C]** `unsafeSshConfigValue(value)` is true when the value is empty, or holds `"`, or any code point below 0x20, or 0x7F, or the
two characters `${`, or ends with a backslash. It is asked of **every** value the file gets and of the destination's `-i` path. The parent's D15
names the quote and the control characters. `${` is added from X1: a hop's typed key path `${CREDS_SSH_PASSWORD}` would make the hop leg put the
destination's password into a file name, and `ssh` names that file on stderr (§S6.10 P1). The backslash is added from X5, so the journal says why.

**The password words. [C]** `BRIDGED_ASKPASS_OPTIONS` is `-o BatchMode=no -o PasswordAuthentication=yes -o KbdInteractiveAuthentication=yes`. With
`-o NumberOfPasswordPrompts=1` first, these are the four the parent names. They are on the command line, so they bind the outer leg only: a
nested `-J` command gets `-l`, `-p`, `-F`, `-W` and the host, nothing else (the E1.3 spec's Amendment 4, D.1, measured; X6).

**The spawn. [C]** `cwd` is the call folder. The argv names the file as `-F c.conf`, never by a longer path. The program is the bare `ssh` of
`sshSpawnLaunch`. The call folder holds `c.conf` and nothing else, for the whole run.

**The environment. [C]** Exactly the names of `BRIDGED_ENV_POSIX` or `BRIDGED_ENV_WINDOWS` that the extension host holds; plus, for a password
destination only, `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`, and `DISPLAY` off Windows. No `SSH_AUTH_SOCK`, no `CREDS_REF_` name,
nothing else.

**What each leg offers, and to whom. [C]** This is the judgement the review makes (§S6.7).

| Leg | Offers | Never offers | Trusts the host by |
|---|---|---|---|
| A hop | one signature, with that hop entry's own key (stored, written for the call; or the file at its typed path) | a password, a keyboard-interactive answer, an agent's keys, a default identity, the destination's key | its entry's pin, alone; or first contact into `bridges/known_hosts` |
| A key destination | one signature, with the entry's key (`-i`) | the same list | its entry's pin, alone; or first contact into `bridges/known_hosts` |
| A password destination | the entry's password, through the askpass script, at most once | a key (the sentinel is the only identity), an agent | its entry's pin, alone. No pin: no spawn |

## S6.4 — Refusals and sentences (exact)

Every refusal below is made **before any spawn**. The agent reads `BRIDGE_USE_REFUSED(<entry of the call>)` (`bridgeScope.ts`, through
`bridgedRefusal`, `sshUseActions.ts:135-143`) and nothing else. The sentence goes to the laptop's journal as
`<entry of the call>: <sentence> (a Remote Bridge was told only that it could not be used)`. It may name a hop entry: that is N7's stated
boundary (parent §4.2). The code is `no_credential` for every row but R7, as L2 and L3 have it today, so the code tells the agent nothing new; R7 is `internal`.

| # | When | The journal sentence [C] | Pinned beside |
|---|---|---|---|
| R1 | a hop's credential is a password | `The jump host "<hop name>" logs in by password. Through a Remote Bridge a jump host needs a key of its own.` | no spawn; no file in `keys/<pid>/` |
| R2 | a hop has no credential, or an empty key path | `The jump host "<hop name>" has no key. Through a Remote Bridge a jump host needs a key of its own.` | the same |
| R3 | a hop's value was not opened (a PIN, a woven password, a sealed key) | the opener's own sentence (`SshCredentialStopped.reason`, or `pinRefusalFor(<hop name>)`), as `sshExecAuth.ts:132-136` says it for a linked key | the same |
| R4 | two legs have one host | `Two connections of this call go to the host "<host>". Through a Remote Bridge the destination and each jump host need a different host.` | the same |
| R5 | a password destination with no pin | `"<entry>" logs in by password and pins no host key. Through a Remote Bridge a password goes only to a host whose key is pinned.` | the same; the main-port control runs |
| R6 | a value fails the value rule | `A value of this call cannot be given to ssh: <field> is empty, or holds a quote, a control character or "${", or ends with a backslash.` | the same; the sentence holds no part of the value |
| R7 | a write fails | `Could not write the files of this call: <describeError>` | what was written is gone |
| R8 | the argv is `undefined` (the destination's host or user fails `isSafeSshTarget`) | `"<entry>" cannot be given to ssh: its host or its user is not a valid one.` | no spawn; the files of the call are gone |
| J1 | after the run, a new line in `bridges/known_hosts` | `<entry of the call>: first contact through a Remote Bridge: <host word of the line> <algorithm> <SHA256 fingerprint> was added to bridges/known_hosts` | the line is in the file |

`<field>` is one of `the host of "<entry or hop name>"`, `the key path of the jump host "<hop name>"`, `the key path of "<entry>"`,
`the keys folder`, `the known-hosts path`. The
code is `no_credential` for R8 too. R1-R5 and R8 say what the code has just checked and nothing about what comes next. J1 says that a line was added; it does not say who the host is.

## S6.5 — Scenarios

Each scenario names its observation. A sentence is asserted beside an observation, never alone.

**`test/bridgedSshConfig.test.ts` (pure)**

| # | Scenario | Observation |
|---|---|---|
| F1 | Two hops (one pinned with a stored key, one unpinned with a typed key path) and a pinned destination | the text equals the expected text, byte for byte, in the order of §S6.3 |
| F2 | The same text, parsed block by block | a hop block has `IdentityFile`, `StrictHostKeyChecking`, `UserKnownHostsFile` and no other keyword; the destination block has two; `Host *` has the eighteen lines in order |
| F3 | An unpinned key destination | no destination block |
| F4 | A Windows path with a space and backslashes; a keys folder with `%` in it | each path is in quotes, backslashes once, `%` written `%%` in our own paths and kept in a typed path |
| F5 | (D15) the measured value, a line break and `ProxyCommand /tmp/evil %h`, as a hop's key path; then `"`, CR, 0x1B, 0x7F, `${X}`, a last backslash and the empty text, in each field in turn | `ok: false` with that field's name; no text is answered; the name holds nothing of the value |
| F6 | Hosts `HOP.Example` and `[::1]` | the lines are `Host HOP.Example` and `Host ::1` |

**`test/bridgedSshEnv.test.ts` (pure)**

| # | Scenario | Observation |
|---|---|---|
| N1 | `linux`, a source with forty names | the keys are exactly `PATH`, `HOME` |
| N2 | `win32`, a source that spells `Path` and `SystemRoot` | the keys are exactly the eight, in the list's spelling, with the source's values |
| N3 | The four askpass names as `extra` | they are there; with no `extra` they are not |
| N4 | `SSH_AUTH_SOCK`, `CREDS_REF_X`, `BRIDGE_TEST_SECRET`, `PGOPTIONS`, `PGSERVICE`, `PGPASSFILE`, `MYSQL_HOME` in the source | none is a key of the answer |
| N5 | `extra` holds `LD_PRELOAD` | the call throws; nothing is answered |
| N6 | A source with no `HOME` | no `HOME` key (not a key with the value `undefined`); the source object is not changed |

**`test/sshExecCommand.test.ts`, `test/sshOptions.test.ts`, `test/materializedKeys.test.ts`, `test/sshExecAuth.test.ts` (added cases)**

| # | Scenario | Observation |
|---|---|---|
| A1 | Bridged, key, `configFile: 'c.conf'`, a jump, a port | the argv equals the expected list in B6's order |
| A2 | Bridged, no `configFile` | `undefined` |
| A3 | Bridged, `pinned: true` | `StrictHostKeyChecking=yes` is there; no word starts with `UserKnownHostsFile=`; `-i <path>` is there |
| A4 | Bridged, with a `knownHostsFile` | `undefined` |
| A5 | Bridged, `askpass` | the three password words stand after the six and before `-F` |
| A6 | Off a bridge, the argv of every existing case | equal to today's (the existing cases are not edited) |
| J1 | A chain of two hops | `hops` holds the two entries in the order of the `-J` text |
| P1 | `bridgedCallFolder(dir, 'call-…')`, and a name with `../` | the folder is in `keys/<pid>/`; the file is `c.conf` in it; the second name cannot leave the folder |
| K1 | (M8 (6a)) an entry made by the import from a `Host` block with an `IdentityFile` line, through `resolveSshCredential`, `resolveExecAuth` and `buildSshExecArgv` | the credential is `keyPath`; the word after `-i` equals the line's value, byte for byte, for a `~/` path and for a drive path with a space |

**`test/bridgedSshCall.test.ts` (real files in an owned folder; `./keyInstaller` as `linksWorld` gives it)**

| # | Scenario | Observation |
|---|---|---|
| W1 | A hop with a stored key | one file `call-<uuid>.key`, mode 0600, with the key; `c.conf` in `keys/<pid>/call-<uuid>/`, which holds nothing else; no path of the answer or of the text holds the hop's id, the key entry's id or a name |
| W2 | A hop with a typed key path | its block names the path as typed; no key file is written; after `remove()` the file at that path is still there |
| W3 | A hop with a password; with none; with a PIN-sealed key; with a sealed stored content; with an empty key path | `ok: false`, `no_credential`, the sentence of R1, R2 or R3; `keys/<pid>/` holds no new file and no folder |
| W4 | The destination's host equals a hop's; two hops with one host; the same with another letter case | R4; nothing written |
| W5 | A password destination with no pin; then with a pin | R5 and nothing written; then `ok: true`, `pinned: true`, a destination block |
| W6 | A pinned hop on port 2222; an unpinned hop | a file `call-<uuid>.known_hosts` with the line `[<host>]:2222 <algorithm> <key>`; `accept-new` and the two files for the other |
| W7 | `remove()`; then `remove()` with `rmSync` made to fail | every file and the folder are gone; then nothing is thrown and there is one note |
| W8 | The second key write fails | `internal`, R7; the first key file is gone |
| W9 | A `home` that is not this machine's home | the person's file in the text is under the injected home, as an absolute path |
| W10 | A first-contact leg; a line appended to `bridges/known_hosts` between the write and `firstContacts()` | one sentence J1 with the fingerprint of that key; a second call with no new line answers none |

**`test/bridgeLinks.test.ts` (the real action behind the real broker and a bridge listener; the stub runner records `argv`, `env`, `cwd` and reads the `cwd` folder while it "runs")**

| # | Scenario | Observation |
|---|---|---|
| L1 | (rewritten) `e1` with its linked key, through the bridge | 200; the argv has `-F`, `c.conf`; `cwd` is a folder in `keys/<pid>/` that held `c.conf` alone; the text read there is §S6.3's for no hop; after the call the key file and the folder are gone; one dialog |
| L3 | (kept; `j1` now has a stored key) a jump host out of scope | 200; `-J hop@jump.example.com`; the text read during the run has the `Host jump.example.com` block with a `call-….key`; the body holds nothing of `jump` |
| L6 | `j1` with a password; with no key; with a sealed key | the body is `BRIDGE_USE_REFUSED('prod')` with `no_credential`; the journal holds the exact line of R1, R2 or R3; `runs` is empty; the slot is back; `keys/<pid>/` is empty |
| L7 | `e1` with a password and no pin, through the bridge; then through the main port | refused with R5 in the journal, `runs` empty; the main port answers 200 with today's argv |
| L8 | (parent §7 D15) `j1`'s `sshKeyPath` is the measured value | refused with R6; `runs` is empty; no `c.conf` was written; the body and the journal line hold no `ProxyCommand` |
| L9 | `BRIDGE_TEST_SECRET` and `SSH_AUTH_SOCK` set in the test process | through the bridge the keys of `runs[0].env` are exactly the allow-list; through the main port both names are there |
| L10 | (g) the main port, every existing case | `runs[0].cwd` is `undefined`; no `-F`; the existing F-scenarios pass with no edit |
| L11 | `e1`'s user holds a space, through the bridge | refused with R8 in the journal; `runs` is empty; `keys/<pid>/` is empty |
| G1 | (text only) no writer | as today, with the new journal text |
| G2 | (flipped) `sshDepsFor(parts)` | it carries `bridgedSshConfig` |
| L2, L3-invalid | (not edited) | the generic body and the exact journal line: N7 |

**`test/agentNamesOnlyViewable.test.ts`, beside the case at `:382`**

| # | Scenario | Observation |
|---|---|---|
| X1 | (change 8.2, owed) `wallWorld({ x: 'closed', scope: ['e1', 'x'] })`, `POST /v1/mcp/use/exec` and `…/query` for `x` through `viaBridge` | 403 `denied` with the switch sentence; it differs from the 404 of an absent id; `ww.w.dialogs` is empty; `ww.w.ran` is empty |

**`test/dbCliLauncher.test.ts` and the query door**

| # | Scenario | Observation |
|---|---|---|
| Q1 | `postgres`, bridged | the arguments are `-X`, `-c`, the query with its one leading space, `--`, the URI |
| Q2 | `mysql`, bridged | `--no-defaults` is the first argument; `--skip-named-commands`, `--delimiter=;`, `--local-infile=0` stand after the connection flags and before `-e` |
| Q3 | `mssql`, bridged; and all three off a bridge | the arguments equal today's |
| Q4 | A real `dbQueryAction` in `wallWorld` (`query:`), `PGOPTIONS` set in the test process | through the bridge the spawn's environment keys are the allow-list and `PGPASSWORD`; through the main port `PGOPTIONS` is there |

**`scripts/bridged-ssh-itest.cjs` (CI, Linux, a real `ssh` and `sshd -d`).** POSIX only; with `CI=true` a missing `sshd` fails. The rig is one owned
folder. Its storage folder and its rig home have a space in their names; the `sshd` folders do not (`startSshd` writes their paths with no quotes).
Keys are made with `ssh-keygen`. The hop listens on `127.0.0.1`, the destination on `127.0.0.2`, so the two legs have different hosts. Every
production leg is `writeBridgedCall` and `bridgedSpawn` from `out/` (loaded with `vscode` resolved to a stub, as `scripts/ssh-agent-itest.cjs:279-341`
does), then a spawn of `ssh` with that argv, environment and `cwd`. Every control is written by hand and runs under `-F <rig>/.ssh/config`. Where a
leg shows that a thing does **not** happen, its control shows that this rig can make it happen.

| Leg | Control (the bad thing happens) | Production (it does not) |
|---|---|---|
| (a) | leg 0, no `sshd`: `ssh -G -F c.conf -l hop -p 1 -W '[127.0.0.2]:22' 127.0.0.1` in the call folder reports `batchmode yes`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `identityagent none`. Leg 5: a hop that offers passwords only; the hand-written argv; the askpass stub's log has a line | leg 6: the same hop; the stub's log is empty and the hop's `sshd` saw the connection. Leg 7 (this spec's): the hop takes the hop key, the destination offers passwords; the log has exactly one line and its prompt names `127.0.0.2` |
| (b) | `AcceptEnv BRIDGE_TEST_*` on the `sshd`, `SendEnv BRIDGE_TEST_*` in the rig's config, the whole environment: the remote `printenv BRIDGE_TEST_SECRET` prints the value | exit 1 and an empty stdout; the keys of the spawn's environment are the allow-list |
| (c) | `ProxyCommand sh -c 'touch <marker>; exec nc %h %p'`, `PermitLocalCommand yes`, `LocalCommand touch <marker2>`, `Host dest-alias` in the rig's config: both markers exist | no marker exists; an entry whose host is `dest-alias` fails to resolve |
| (d) | a key held only by a live `ssh-agent`: the control logs in | `Permission denied`, with `SSH_AUTH_SOCK` not in the environment; **and again with `SSH_AUTH_SOCK` put back by hand under the production file**: `Permission denied` too, so `IdentityAgent none` is proved alone |
| (e) | — (the refusals are W3, W4 and L6) | a hop whose key differs from the destination's: the hop's `sshd -d` log accepts the hop key's fingerprint, the destination's accepts the destination's, and neither log names the other key |
| (f) | the first call of the leg logs in, so the later refusal is not a rig that cannot connect (the unpinned password refusal is W5 and L7) | an unpinned key destination: one line in `bridges/known_hosts`, one sentence J1; **then `purgeMaterializedKeys`, then a second `sshd` with another host key on the same address and port: the next call fails on that leg**; a pinned hop whose key changed fails on that leg; the rig's `~/.ssh/known_hosts` is byte for byte the same after every leg of the harness |
| (g) | — | no leg of its own: (g) is the existing F-scenarios with no edit, with A6, L10 and Q3; the controls of `scripts/itestForwardAgent.cjs` (off-bridge argv) stay green with no edit |
| (h) | the key file removed: `Permission denied` | a pinned destination whose pin file's path holds a space logs in, and the argv has no `UserKnownHostsFile=`; then another host key on the same address: refused; the same for a pinned hop; and a login by `-i` with a key at a path with a space |
| (i) | only when `CI=true`: `/etc/ssh/ssh_config` and the rig's config each get `ForwardAgent yes`, a `RemoteForward` and an `IdentityFile` the destination accepts; under `-F /etc/ssh/ssh_config`, and under `-F <rig>/.ssh/config`, the control logs in with that key and `-v` shows the forwarding request | `Permission denied` for that key; `-v` shows no agent request and no forwarding request; the system file is put back in a `finally` and compared by hash |
| (j) | (this spec's, from X1) a hand-written file whose hop block has `IdentityFile "${BRIDGE_TEST_SECRET}"`, the variable in the environment: `ssh -v` names a file called by the value | L8 and F5 are the production half: the writer refuses, so there is nothing to run |

Legs (a) 5-7 and (b)-(d), (h) need different `sshd` settings, so each starts its own. Leg (i) is skipped with a printed line off CI; on CI it never skips.

**`scripts/bridged-mysql-itest.cjs` (CI, Linux; parent §4.11, mandatory).** A fake server in the harness completes the handshake and answers the
query with a `LOCAL INFILE` request for a marker file. Oracle's `mysql` and MariaDB's client are both on the runner, each named by an absolute path;
the harness prints each `--version` and fails on CI when one is missing.

| Leg | Control | Production |
|---|---|---|
| (m) | without `--local-infile=0`: the server receives the marker's bytes, on each client. For Oracle's client also: an option file with `load-data-local-dir` and `--local-infile=0` but no `--no-defaults`: the bytes arrive | `buildDbQueryLaunch('mysql', …, { bridged: true })`'s arguments, with the same option file in the rig home: the server receives none of the marker's bytes, on each client |

How the fake server speaks the protocol, and how two clients get on one runner, are **[S]**; the pass rule is **[C]**.

## S6.6 — Mutations

Mutate, watch the named case fail, restore; both outputs go in the PR. One file at a time.

| # | Mutation | Must fail |
|---|---|---|
| T1 | Drop `IdentityAgent none` from `BRIDGED_LOCKDOWN` | F2; itest (d), the second production leg |
| T2 | Drop `BatchMode yes`, `PasswordAuthentication no` and `KbdInteractiveAuthentication no` together; then one of them alone | F2; itest (a) leg 6. One alone: F2 only (ssh_config(5) says that `BatchMode yes` disables password prompts; not run here; the lines are kept as the parent lists them) |
| T3 | Write the `Host *` block first | F1; itest (f) pinned hop, or (h) |
| T4 | Let a hop block carry `ProxyCommand` | F2 |
| T5 | Take `${` out of the value rule; then the line break | F5; L8 |
| T6 | Make the `Host` word lower case | F6 |
| T7 | Spread the source into the answer of `bridgedSshEnv` | N1, N4; L9; itest (b) |
| T8 | Give the askpass names to a key destination | N3; L9 |
| T9 | Let a password hop pass | W3; L6 |
| T10 | Let an unpinned password destination pass | W5; L7 |
| T11 | Compare hosts with letter case | W4 |
| T12 | Put `-o UserKnownHostsFile=` back on a bridge | A3; itest (h) |
| T13 | Drop `-F` from the bridged argv | A1; L1; itest (a) leg 6, (e), and (i) on CI |
| T14 | Name a hop key file `<hop id>-<uuid>.key` with `materializePrivateKey` | W1; S1 of #359 |
| T15 | Put the first-contact file in the keys folder | itest (f) |
| T16 | Give `runSshExec` no `cwd` on a bridge | L1; every itest leg |
| T17 | Skip `files.remove()` | L1; W7 |
| T18 | Drop `--no-defaults`; then move it to the end | Q2; itest (m) |
| T19 | Spread `process.env` into the bridged database child | Q4 |
| T20 | Let an `undefined` argv reach `runSshExec` on a bridge | L11 |

## S6.7 — Review checklist

For Opus, on the code; the last five are Fable's authentication judgement at review.

1. Off a bridge: `git diff` shows no changed line on the off-bridge branches of `buildSshExecArgv`, `execOverSsh`, `buildDbQueryLaunch` and `dbQueryAction` but the added conditions.
2. `bridgedSshEnv` is the only source of a bridged child's environment: grep `process.env` in `sshUseActions.ts`, `bridgedSshCall.ts` and the bridged branch of `agentUseActions.ts`.
3. No new file names `materializePrivateKey`; no path in `keys/<pid>/` is built outside `materializedKeys.ts`; no file name of a bridged call holds an entry id.
4. Every refusal of §S6.4 is before the first `runSshExec`, and leaves no file (the tests assert the folder, not a flag).
5. The file is written from `BRIDGED_LOCKDOWN` and from nothing a caller hands in as a keyword.
6. Each sentence of §S6.4 holds no part of a value, and says only what the code checked.
7. The mutations of §S6.6 were run, and each named case failed for the reason given.
8. The As-built names each **[S]** that changed, with the reason.
9. *What a hop is offered.* Read the written `c.conf` of L3 and of itest (e): one `IdentityFile` in the hop's block, that hop's own. No road gives a hop the destination's key or password.
10. *What the destination is offered.* A password leaves only through the outer leg, only to a pinned host, at most once.
11. *Who is trusted.* A pinned leg reads its entry's pin alone. First contact writes only to `bridges/known_hosts`. The person's `known_hosts` is read and never written.
12. *What is not consulted.* No agent, no default identity, no file but `c.conf`, on the outer leg and on every nested leg.
13. *The value rule.* Every value that reaches the file or `-i` passes the one function; the review looks for a value that reaches `ssh` by another road.

## S6.8 — Out of scope, and where it goes

| Item | Where it goes |
|---|---|
| The tunnel (`ssh -R`) and every helper exec of the supervisor under the same file and environment | E2.2 (parent §4.9, E2 *Inherits from E1.6*). `writeBridgedCall`, `bridgedSpawn` and `bridgedSshEnv` take legs, not an action's context, so E2.2 can call them. Nothing is built for it here |
| The scope pick's rows, Q4's warning, the help | E2.2b and E4 |
| The `describeError` text in `Could not run ssh` (`sshUseActions.ts:291`) and the other bodies | Parent §8, open. Not built. R7 adds one such text, to the journal only |
| `-o UserKnownHostsFile=<path>` off a bridge (`sshExecCommand.ts:148`) | Parent §8: a separate fix on `main`, with no owner yet. E1.6 changes the bridged argv only |
| The askpass script answering a hop on the local road and the person's Connect | `todo/PLAN_askpass_answers_the_hop.md` |
| The program `ssh:exec` starts on Windows | `todo/PLAN_ssh_exec_absolute_program.md`. E1.6 keeps the bare word and the folder with no other file. Whichever merges second reads `sshUseActions.ts` and `sshProgram.ts` again |
| The agent forwarded off a bridge | `todo/PLAN_ssh_exec_own_agent_forwarding.md`. A bridge refuses a forwarding entry |
| A sweep of key files left by a failed removal | E4 (parent §8) |
| A certificate as an entry kind | A todo of E4 (parent §8) |
| `run` on a bridge | E3 |
| A real hop from Windows | Nobody measures it (parent §7 M1). §4.9 fails closed |
| The `refuseQuery` rules and the flags on every door | Done on `main` (PR #303). E1.6 adds the bridged flags only |

## S6.9 — Not verified by this spec

- **No login was run for this spec.** This machine has no `sshd`. Every statement about authentication is the parent's measurement (M8), or is owed to the itest.
- **M9.** The Windows list is the parent's, not measured. *How it is measured:* on the owner's Windows host, a build of the E1.6 branch; one call
  to a key destination and one to a password destination with exactly the eight names; then each name taken out in turn. The result goes to
  the parent's §7 M9 row and to §S6.13. `BRIDGED_ENV_WINDOWS` is then set to what was needed and no wider. On Linux the same with `PATH`, `HOME`.
  M9 is recorded before E1's *Done when* is ticked; it does not block the review of the code.
- **Windows and the file.** LF line ends, `%%`, a last backslash, the letter case of a `Host` word and `${…}` were measured on OpenSSH 10.2 on
  Linux only (X1-X5). M8 measured a quoted path with a space on Win32-OpenSSH 9.5p2, and no more of these.
- **The sentinel's line.** From the source of OpenSSH as remembered, not run: an identity file that a configuration file names and that does not
  exist is reported at the default log level (`no such identity: <path>`) when authentication reaches it. If so, a bridged call to a password
  destination prints the keys folder's path on stderr each time. The itest prints the stderr of legs (a) 7 and (h), and §S6.13 records what it showed (P3).
- **What a database client does with no `LANG` or `LC_ALL`** (the output's character set). Q4 pins the environment, not the output (P4).
- **`.mylogin.cnf`.** By MySQL's documentation, `--no-defaults` still reads it. It can hold a host, a user, a password, a port and a socket. Not run.
- **A host written as an IPv6 address.** X4 is the nested command's argv only. A block that does not match fails closed: `Host *` has no key and checks strictly.
- **Leg (i) off CI.** It writes a system file, so it runs on the CI runner only.
- **A hostile `~/.ssh/config` of the account itself.** `ssh` reads the home of the account, not `HOME` (the parent's measurement, §7). So the
  production legs of (b) and (c) never meet the rig's config as the person's file; their controls show what that config does when it is read. Only
  (i), on CI, puts hostile lines where a production call would read them, and that is the system file. That `-F` also shuts out the account's own
  file rests on ssh(1) and on M8 (4) on Windows.

## S6.10 — Questions for the plan, and for the owner

**For the owner: none.** Q1-Q4 and Q8 are decided (parent §2.1), and this spec builds under them. M9 needs the owner's Windows host; that is a measurement, not a question.

**For the plan (the lead asks the consultants first; this spec does not edit the parent).** Each has the default this spec builds under.

| # | Point, with its evidence | Default built |
|---|---|---|
| P1 | §4.9's injection rule names a quote and control characters. X1: `${VAR}` in `IdentityFile`, `UserKnownHostsFile` and `-i` is replaced by an environment variable of the `ssh` process, and a nested hop leg has `CREDS_SSH_PASSWORD` in its environment for a password destination. A writer of a shared vault can type such a path into a hop entry | The value rule refuses `${`. It refuses more, never less, than D15. Whether this is a ledger entry is the rule's question |
| P2 | §4.9 does not say how the `Host` word is spelled. X3: a pattern in another letter case does not match, and the leg then gets `Host *` alone | The host as typed; the equal-host refusal ignores letter case |
| P3 | The sentinel may print a path on each password call (§S6.9) | The sentinel stays, as §4.9 says. The itest records the line |
| P4 | §4.11 gives the database child the same list as `ssh`. No `LANG` or `LC_*` is on it | The list as written |
| P5 | `sshUseActions.ts:254-258`: an entry whose host or user fails `isSafeSshTarget` gives `runSshExec` an `undefined` argv, and Node then starts `ssh` with no arguments (H4). Off a bridge this is `main`'s | On a bridge: R8, before the spawn (L11). Off a bridge: not changed |
| P6 | §6 has no row for the per-call pin files | At most (1 + 4) × 8 files, under 1 KB each, removed in the call's `finally`; the purge covers a killed window. The row is owed to the parent |
| P7 | The E1 stories document's row for E1.6 (`:524`) and its item 10 (`:571-572`) say legs (a)-(g) and name no database flag; the parent says (a)-(i) and gives E1.6 §4.11's bridged half | This spec follows the parent |

## S6.11 — What this changes for a local user; the CHANGELOG; the documents

- **For a local user: nothing.** Off a bridge the argv, the environment and the `cwd` of `ssh:exec` and of a query are today's (A6, L10, Q3, Q4,
  itest (g)). No production door reaches a bridge (R1). The PR body says so and names these tests.
- **`CHANGELOG.md`:** no bullet. The parent says that the guard gets none, and that E4.1's flip entry carries what a bridge does. If the diff at the
  commit shows a change a local user can reach, it gets its bullet from that diff, and the PR says which test missed it.
- **`research/module_extension.md`:** the bridged `ssh` road (the file, the environment, the refusals), from the code as built.
- **`research/module_tests.md`:** the two harnesses, each with its command, what it covers, and what it does not prove (Linux only; no password login that succeeds).
- **The parent and the stories document:** not edited by the coder. The M9 result, and what the As-built changes, go to the lead.

## S6.12 — Contract → step → test

| # | Contract (parent) | Step | Unit and door tests | Itest leg |
|---|---|---|---|---|
| C1 | §4.9 row 1: a hop never gets the destination's password | B3, B5 | F2, W3, L6 | (a) 0, 5, 6, 7 |
| C2 | Row 1, Q3: a password goes only to a pinned destination | B5 | W5, L7 | (a) 7 (the destination alone is asked) |
| C3 | Row 2, Q1: a hop signs with its own entry's key, offered alone; other credentials are refused | B5 | W1, W2, W3, L3, L6 | (e) |
| C4 | Row 2: the destination's key by `-i`; key files 0600, removed in `finally`; a typed path read in place | B5, B6, B7 | A1, K1, W2, W7, L1 | (e), (h) |
| C5 | Rows 3 and 4, Q2: no agent, no default identity | B3, B4 | F2, N4, L9 | (d) both, (i) |
| C6 | Row 5: the environment is the allow-list | B4, B7 | N1-N6, L9 | (b) |
| C7 | Rows 6 and 7: the command, stdin and output as today; no entry id in a path | B5 | W1, L1, L2, L3 | — |
| C8 | Row 8: no forwarding on an exec leg | B3 | F2, F1 of `bridgeLinks` (kept) | (i) |
| C9 | Row 9: no local subprocess but the askpass script | B3 | F2 | (c) |
| C10 | Row 10: the per-call file alone is read | B6, B7 | A1, A2, L1 | (c), (i) |
| C11 | Row 11: pinned legs read their own file; first contact goes to `bridges/known_hosts`; the person's file is never written | B3, B5 | F1, F3, W6, W9, W10 | (f), (h) |
| C12 | Row 12: no multiplexing | B3, B9 | F2 | the mux pair of `scripts/itestForwardAgent.cjs`, rewritten (B9) |
| C13 | Row 13: a refusal is generic to the agent, detailed in the journal | B7 | L2, L3, L6, L7, L8, L11 | — |
| C14 | The file: order, three and two keywords, the lock-down, quotes, backslashes once | B3 | F1, F2, F4, F6 | (a) 0 |
| C15 | D15: a value that could change the file is refused, no spawn, no file | B3, B5 | F5, L8 | (j) |
| C16 | D16: a relative `-F`, a fresh folder per call with one file | B2, B5, B7 | P1, W1, L1 | every leg (the storage folder has a space in its name) |
| C17 | Equal hosts among one call's legs are refused | B5 | W4 | — |
| C18 | Epoch 9: no `-o UserKnownHostsFile` on a bridge; the pin in the destination block; `-i` kept | B3, B6 | A3, A4, F1 | (h) |
| C19 | Off a bridge, byte for byte | all | A6, L10, Q3, the existing F-scenarios | (g): the controls of `scripts/itestForwardAgent.cjs`, not edited |
| C20 | The lock goes; a call with no file is refused | B6, B7 | A2, G1, G2 | — |
| C21 | Change 9.1: `materializeCallKey` for a hop key; no id in a hop file or a pin file | B5 | W1, W6; S1 of #359 | — |
| C22 | §4.11: `-X`, `--no-defaults` first, nothing on `sqlcmd` | B8 | Q1, Q2, Q3 | (m) |
| C23 | §4.11: the database child's environment | B8 | Q4, N4 | — |
| C24 | Change 8.2: an in-scope entry the agent may view, switch off, through the door | B10 | X1 | — |
| C25 | N7: the generic body and the detailed note | none | L2, L3 (not edited) | — |
| C26 | M8 (6a): an imported key path reaches `-i` unchanged | B10 | K1 | — |
| C27 | M9: the Windows list | a measurement | — | — |

**Done when.**

- [ ] Every scenario of §S6.5 is green, and each new one was watched RED first (B0's record).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run ratchet` are green in `src_vs_code`; no file is over 800 lines.
- [ ] `itest:bridged-ssh` and `itest:bridged-mysql` are green in CI on the PR's head, leg (i) included, and `itest:ssh-agent` is green with the rewritten legs.
- [ ] The mutations of §S6.6 were run; both outputs are in the PR.
- [ ] S1 of #359 passes on the new files; `keysDirPaths.test.ts` is green with no exception.
- [ ] `research/module_extension.md` and `research/module_tests.md` say what was built; `node .agents/conventions/tools/plan-lifecycle.mjs` is clean.
- [ ] The PR body says what changes for a local user (nothing, with the tests that show it) and lists the questions of §S6.10 with what was built.
- [ ] The Opus review and Fable's authentication judgement (§S6.7, points 9-13) are done, and the `coai` code round reached `proceed`.
- [ ] §S6.13 is written. M9 is recorded, or the PR says that it is still owed before E1's *Done when*.

## S6.13 — As built

Not built. The coder writes here: the RED record of B0, each **[S]** that changed and why, the line counts, the mutations' outputs, what the
itest showed for P3, and the order in which #359 and this story merged.
