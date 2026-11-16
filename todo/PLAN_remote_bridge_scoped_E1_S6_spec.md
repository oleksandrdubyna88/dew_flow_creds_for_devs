# PLAN — E1.6 spec: SSH execution containment — what each leg of a bridged `ssh` offers, and to whom

> Status: **spec, 2026-11-12, by Fable, written as a security spec (authentication: what a leg offers and to whom) before its code. Built 2026-11-13 in PR #365 (As built: §S6.13); M9 began on the owner's Windows host on 2026-11-15 and stopped the parent plan (its change 9.2: `ssh.exe` does not start without `ProgramData`); not merged. Amended on 2026-11-15 for the parent's epoch 10: §S6.14 is the fix-forward, built on this PR once that epoch opens.**
> **Revised the same day after two reviews of `a30faed7` (an Opus judge and a Fable security judge):** the user rule, the host rule and the
> equal `Host` words, first contact that cannot be written, the `%` rule, the pin line's spelling, and the tests and mutations for them. The
> decisions of that day are in §S6.10.
> Story E1.6 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md):
> §4.9 whole, §4.2's two in-scope answers and N7, §4.11's bridged half, §5 step 3c, §6, §7 *The SSH contract* legs (a)-(i), *The file writer refuses
> injection*, *In scope, visible or not*, *Links*, M8 and M9, §8, §9, `## Epics` E1, ledger entries 8.2 and 9.1). The parent is approved at epoch 9
> and is not edited here. Where this spec found the parent silent or inexact, the point is in §S6.10 with its evidence, and the spec builds the
> safe side. The parent's file shape is built as written (the sentinel `IdentityFile`; three keywords in a hop block): §S6.10 says why two
> other shapes that were measured are not built now.
>
> Scope: `src_vs_code/src` (`sshUseActions.ts`, `sshExecCommand.ts`, `sshOptions.ts` (one walk, two views, one export), `sshExecAuth.ts` (one export), `materializedKeys.ts`,
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
| H7 | `resolveJumpChain` (`sshOptions.ts:172-190`) walks `jumpHostEntityId`, refuses a hop that is gone or whose address fails `isSafeSshTarget` (`:148-158`), and answers only the `-J` text (`:189`); `hopOf` (`:108-111`) writes `user@host[:port]`. `isSafeSshHost` allows `A-Za-z0-9._:[]-` only (`sshCommand.ts:83-85`). | E1.6 needs the hop entries. The walk answers them too. A host can hold no quote, space or control character, and no pattern character (`*`, `?`, `!`, `,`). It can hold `:`, `[` and `]` in any place: §S6.3's host rule. |
| H7a | `isSafeSshUser` allows `A-Za-z0-9._-`, the backslash and `$`, with no `-` first (`sshCommand.ts:91-93`). So a space, a backtick, `;`, `|`, a glob, `~`, `@` and `+` are refused already. An entry may have no user (`isSafeSshTarget`, `:97-102`). **From the security review, not opened here:** `ssh` puts the `-J` user into the nested command with no quotes, and runs that command under `/bin/sh -c` (ssh.c 9.5 `:1284-1303`, 10.2 `:1356-1375`); upstream does not refuse `$` there, a patched Ubuntu build does, and Windows starts the command with no shell; before 9.6 a user that ends with a backslash takes the next word (`-F`). | A hop user `$CREDS_SSH_PASSWORD` would give the destination's password to the hop's `sshd` as a login name, and to stderr. §S6.3's user rule. |
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
| X1 | `IdentityFile "${VAR}"` in a `Host` block of the `-F` file; `VAR=hunter2` in the environment | `ssh -v` prints `identity file hunter2 type -1`. `UserKnownHostsFile "…${VAR}"` shows the value in `-G`. **`ssh` puts an environment variable into a path.** |
| X1a | `-i <path>` whose text holds `${VAR}`, `%u` or `%%`: once with no file at that text, once with a file at exactly that text | With no file: `Warning: Identity file … not accessible`, and the path is not used. With a file: `ssh` takes the path, **then** expands it, and loads the other name (`…/lit<login>/k`, `…/litdummyvalue/k`, `…/lit%x/k`). So `-i` checks the text as written and loads the text as expanded: a `-i` path with `%` has no spelling that works. **Correction:** the first version of this spec said that `-i '${VAR}'` printed the value. That line came from the file's own `IdentityFile` in the same run. |
| X2 | `UserKnownHostsFile "/tmp/x y/100%%me/pin"`; `IdentityFile "/tmp/%u/k"` and `IdentityFile "~/nokey"` in the file | `-G` prints `/tmp/x y/100%me/pin`: `%%` is one `%`. `ssh -v` loads `/tmp/<login>/k` and `<home>/nokey`: a `%` token and `~` are expanded in a path of the file. |
| X3 | `Host HOP.Example` with the target `hop.EXAMPLE`; `Host hop.example` with `HOP.Example`; `Host HOP.Example` with `HOP.Example` | Only the third matches. **A `Host` pattern is compared with the host as typed, letter case included.** `-J u@HOP.Example:1` gives the nested command the host `HOP.Example`. |
| X4 | `-J 'u@[::1]:1'`; `Host [::1]` and `Host ::1` | The nested command gets `::1`. `Host [::1]` does not match it; `Host ::1` does. |
| X5 | `IdentityFile "C:\dir\"` | `invalid quotes`, the file is refused, `ssh` ends. |
| X6 | The password words on the command line over the file of §S6.3 | `batchmode no`, `passwordauthentication yes`, `kbdinteractiveauthentication yes`, `numberofpasswordprompts 1`; no identity but the one `Host *` names; the known-hosts file is the destination block's. For an unpinned key destination: `stricthostkeychecking accept-new` and the two files of `Host *`. |
| X7 | A hop `[::1]` and the destination `::1` under a file with one `Host ::1` block (the review's case, run again here) | `-G` of the destination lists the hop's `IdentityFile` and the hop's pin file. Two legs with one `Host` word are one block. |
| X8 | `ssh -- 'u@[::1]'`; `-J 'h@::1'`; `-J 'h@gw:2201'` | `Could not resolve hostname [::1]`: `ssh` does not take brackets in its destination word. `Invalid -J argument` for a bare IPv6 address. The third gives the nested command `-p 2201` and the host `gw`. |
| X9 | `-J` with the user `h$BRIDGE_PROBE`, and with `CORP\alice`, on this build (Ubuntu's 10.2p1) | `parse_jump: invalid username`, `Invalid -J argument`, no nested command. This build refuses both. It says nothing about an upstream build or about Windows (H7a). |
| X10 | **Measured, and not built (§S6.10).** `IdentityFile none` in `Host *`, in place of the parent's sentinel path; a hop block with its own `IdentityFile` and `PubkeyAcceptedAlgorithms -sk-*` | The hop leg lists `identityfile <hop key>` then `identityfile none`; the destination lists `identityfile none` alone; `ssh -v` prints no `identity file` line for it and tries no default file. The hop leg's `pubkeyacceptedalgorithms` holds no `sk-` name; the destination's holds four. The lead measured the same with `-G` on Win32-OpenSSH 9.5p2 (2026-11-12). `-G` does not run the loader. The row stays as evidence for the next whole-plan review. |
| X11 | `-G` of the nested command under the file of §S6.3; and `-G` with no `-F` on this machine | Under the file: `gssapiauthentication no`, `hostbasedauthentication no`, `canonicalizehostname false`, `updatehostkeys false`, `verifyhostkeydns false`, `hashknownhosts no`, and no `pkcs11provider`, `knownhostscommand` or `sendenv` line. With no `-F`: `gssapiauthentication yes`, `hashknownhosts yes`, `updatehostkeys true` and four `sendenv` lines (the system file of this machine). |
| X12 | The destination word `u@LocalHost` | `ssh -v` prints `Connecting to localhost`: `ssh` makes the host lower case for the connection. That the `known_hosts` lookup uses this name is the review's reading; leg (k) of §S6.5 proves it or not. |

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

**B0 — The tests that are RED today.** Write `test/bridgedSshConfig.test.ts` (F1-F10), `test/bridgedSshEnv.test.ts` (N1-N6) and the door
cases L1, L3, L6-L9 and L12 of `test/bridgeLinks.test.ts` first. Watch each fail for its own reason (no module; no `-F`; a hop with a password
runs; a hop user with `$` reaches the argv). The record goes in §S6.13.

**B1 — The hop entries. [C]** `sshOptions.ts`. The walk of `resolveJumpChain` (`:172-190`) moves into one private function that answers the
hop entries, in the order `ssh` contacts them (the order of the `-J` text). Two views of that one walk:

- `resolveJumpChain(entity, byId)` answers what it answers today, **the same object, key for key**. Four tests compare that whole object
  (`test/sshOptions.test.ts:96`, `:108`, `:115`; `test/windowsParsers.test.ts:362`) and stay as they are.
- `resolveJumpHops(entity, byId)` answers `{ ok: true, value, hops }` or the same refusal. The `ok` branch of `JumpChain` (`:105`) gains the
  **optional** field `hops?: readonly EntityMetadata[]`, so the two literals at `test/sshExecOver.test.ts:131` and `:138` compile with no edit.
- `hopOf` (`:108-111`) is exported: the writer builds the `-J` text of a bridged call with it (B5).

`ssh:exec` calls `resolveJumpHops` (`sshUseActions.ts:343`). On a bridge a chain with a `-J` text and no `hops` is refused before any write
(`internal`, R9): the hop blocks cannot be written for it. Tests J1 and J2.

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
export interface HopBlock { readonly host: string; readonly identityFile: string; readonly typedKeyPath: boolean; readonly check: HostCheck; }
export interface ConfigInput {
  readonly hops: readonly HopBlock[];                       // ssh order; `host` as the entry holds it
  readonly destination: { readonly host: string; readonly pinnedFile?: string };
  readonly noDefaultIdentity: string;                       // materializedKeyPath(storageDir, 'no-default-identity'); the file is never made
  readonly firstContactFile: string;                        // <storageDir>/bridges/known_hosts
  readonly personKnownHosts: string;                        // <injected home>/.ssh/known_hosts
}
/** True when the value cannot be written into the file, or handed to `ssh` as a path. The ONE check of every path. */
export function unsafeSshConfigValue(value: string): boolean;
/** True when a user that an entry holds cannot go into a bridged argv. An absent user is not asked. */
export function unsafeBridgedUser(user: string): boolean;
/** The `Host` word of a leg (brackets off, letter case kept), or `undefined` when the host is refused on a bridge. */
export function bridgedHostWord(host: string, leg: 'hop' | 'destination'): string | undefined;
/** The name `ssh` looks a leg up by in a known-hosts file: the `Host` word in lower case, as `[name]:port` for a port that is not 22. */
export function knownHostsName(hostWord: string, port: number | undefined): string;
/** The file, or the name of the first field that failed a rule. It echoes no value. It refuses two legs with one `Host` word itself. */
export function bridgedConfigText(input: ConfigInput): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly field: string };
export const BRIDGED_LOCKDOWN: ReadonlyArray<readonly [keyword: string, value: string]>;   // the 16 lines of `Host *` that hold no path, §S6.3
export const BRIDGED_ASKPASS_OPTIONS: readonly string[];                                    // §S6.3
```

The rules and the file's shape are §S6.3. The caller builds the sentinel's path with `materializedKeyPath`; this module joins no path. Tests F1-F10.

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
name that `source` does not hold is left out, not written as `undefined`. Tests N1-N6. M9 may make the Windows list shorter (§S6.9). *For the Windows list and `BRIDGED_ENV_EXTRA`, §S6.14 Y1 supersedes this block.*

**B5 — The files of one call.** New `bridgedSshCall.ts` (it imports `./keyInstaller`, so tests load it with the `vscode` stub).

```ts
export interface BridgedLeg { readonly entity: EntityMetadata; readonly credential: SshCredentialSource | SshCredentialStopped; }   // one hop
export interface BridgedCallInput {
  readonly destination: EntityMetadata; readonly auth: SshExecAuth; readonly keyPath: string | undefined; readonly hops: readonly BridgedLeg[];
}
export type BridgedCallFiles =
  | { readonly ok: true; readonly cwd: string; readonly configFile: typeof BRIDGED_CONFIG_FILE; readonly pinned: boolean;
      /** The `-J` text, built with `hopOf` from the hop entries THIS call checked; `undefined` with no hop. */
      readonly jump: string | undefined;
      /** After the run, in the caller's `finally`: the journal sentences J1 and J2 of §S6.4. Never throws. */
      afterRun(): readonly string[];
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
  remoteCommand: string; files: Extract<BridgedCallFiles, { ok: true }>; sourceEnv: NodeJS.ProcessEnv; platform: NodeJS.Platform })
  : { readonly argv: string[]; readonly env: NodeJS.ProcessEnv; readonly cwd: string } | undefined;
```

**The `-J` text comes from the checked entries. [C]** `bridgedSpawn` takes no `-J` text from its caller. It reads `files.jump`, which the writer
built from the hop entries it checked. So no hop can be in the argv that the rules below did not see.

**The order inside `writeBridgedCall`. [C]** Two passes. The first writes nothing. Every refusal is in the first pass or is a failed write.

1. *Refuse* (sentences in §S6.4; the order among them is **[S]**):
   - a user of the destination or of a hop that fails the user rule (§S6.3). An entry with no user is not asked;
   - a host of the destination or of a hop that fails the host rule (§S6.3);
   - two legs with one `Host` word, compared in lower case; the destination and every hop are compared (R4);
   - a hop's credential that is `password`, `none`, `stopped`, a `keyPath` that is empty, or a `storedKey` whose content is sealed (the check of
     `sshExecAuth.ts:157`, exported from there as one function and used by both) (R1-R3). A hop credential's `warning` is written to the journal
     first, as `<entry of the call>: <warning>`, as `prepareAuth` does for the destination (`sshUseActions.ts:189-193`); it is the journal's only,
     with no notice on screen;
   - a password destination with no pin (`auth === 'askpass'` and no line from `parseHostKey` and `knownHostsLine`, `hostKeyPin.ts:107`, `:124`) (R5);
   - a path that fails the value rule (R6) or the `%` rule (R10) (§S6.3): the keys folder (`materializedKeysDir(storageDir)`), the first-contact file, the
     person's file, each hop's typed key path, the destination's `keyPath`.
2. *Write*, in this order: the keys folder (0700); each `storedKey` hop's key with `materializeCallKey(storageDir, content)`; each pinned leg's pin
   file (below); `<storageDir>/bridges/` (0700); **when a leg is first contact, the first-contact file is opened for append (it is made with
   mode 0600 if it is not there) and closed**; the call folder (0700) and `c.conf` (0600, `lockToOwner`), from `bridgedConfigText`. A failure in
   this pass removes what the pass wrote and answers `internal` (R7). `bridgedConfigText` asks its rules again of every value it writes; if it
   refuses here, the pass removes what it wrote and answers R6.

**Why the open for append. [C]** Under `accept-new`, `ssh` goes on when it cannot write the new line (the review's reading of
`sshconnect.c:1245-1247`; not opened here). Then nothing is recorded, and the next call accepts any key again. So a call with a first-contact
leg does not start when the file cannot be opened for writing.

**The pin file. [C]** One function in `bridgedSshCall.ts`: it writes one line, `knownHostsLine(<the leg's Host word in lower case>, port, key)`,
to `materializedKeyPath(storageDir, callKeyName() + '.known_hosts')`, mode 0600, `lockToOwner`. The destination's pin and each pinned hop's pin
are written by it. No entry id is in the name. The host of the line is the `Host` word in lower case, not the host as typed: `ssh` looks a host
up in lower case and with no brackets (X12; the review). `materializeKnownHosts` is not called for a bridged call.

**A `keyPath` hop. [C]** Its typed path goes into its block as typed (it has passed the value rule and the `%` rule). Nothing is copied, and
`remove()` does not touch it.

**`remove()`. [C]** It removes the hop key files, the pin files, `c.conf` and the call folder, each in its own `try`. A failure writes one note
(`ssh:exec — a file of the call could not be removed: <describeError>`) and throws nothing, as `removeKeyFile` does (`sshUseActions.ts:227-239`).
The destination's own key file stays `removeKeyFile`'s. The first-contact file is never removed.

**After the run. [C]** `afterRun()` is called in the caller's `finally`, before `remove()`, whatever the run did. It reads the two known-hosts
files and answers:

- one sentence J1 for each line of `bridges/known_hosts` that was not there before the spawn (the writer kept the lines it read in pass 2);
- one sentence J2 for each first-contact leg whose name (`knownHostsName(<Host word>, port)`) is in neither file. A line holds the name when a
  comma-separated part of its first field equals the name, or is a hashed part (`|1|<salt>|<hash>`) that the name matches by HMAC-SHA1.

How the lines are kept and compared is **[S]**. Two calls at once can each note the same line; that is accepted.

Tests W1-W16.

**B6 — The argv. [C]** `sshExecCommand.ts`: `SshExecOptions` gains `configFile?: string` and `pinned?: boolean`. Only when `bridged === true`:

- no `configFile`, or a `knownHostsFile` given: the answer is `undefined` (a bridged call without the file is refused, like an unsafe host);
- a user that fails the user rule, a host that fails the host rule, or a key path that fails the value rule or the `%` rule: the answer is
  `undefined`. The writer has refused these already, with the reason; this is the second line, on the one function that builds the argv;
- the destination word is `user@<Host word>` or `<Host word>`: the host with its brackets off (X8: `ssh` cannot resolve a bracketed word);
- the host-key words are `-o StrictHostKeyChecking=yes` when `pinned`, else `-o StrictHostKeyChecking=accept-new`. **No word starts with `UserKnownHostsFile=`**;
- after `BRIDGED_SSH_OPTIONS`: `BRIDGED_ASKPASS_OPTIONS` when `auth === 'askpass'`, then `-F`, `configFile`.

The order on a bridge: the auth word (`-o NumberOfPasswordPrompts=1` or `-o BatchMode=yes`), the host-key word, `-o ConnectTimeout=10`, `-J …`,
the six of `BRIDGED_SSH_OPTIONS`, the three of `BRIDGED_ASKPASS_OPTIONS` for a password, `-F c.conf`, `-i <path>`, `-p <port>`, `--`, the
destination, the command. Off a bridge nothing changes: not one word, not the order. Tests A1-A9.

**B7 — The road. [C]** `sshUseActions.ts`:

- `BridgedSshConfigWriter` becomes `(call: { accountId: string; destination: EntityMetadata; auth: SshExecAuth; keyPath: string | undefined; hops: readonly EntityMetadata[] }) => Promise<BridgedCallFiles>`.
- `sshDepsFor` gives the real one: `bridgedSshConfigWriter({ storage, storageDir, home: os.homedir(), note })`. G2 flips.
- `unguardedBridge` and `refusedBeforeSlot` stay. The field stays optional, so a test world or a later caller with no writer is refused and
  cannot run a bridged `ssh` with no file. `NO_BRIDGED_SSH_CONFIG` becomes `'no per-call ssh_config for this call'`. G1 keeps its assertions with that text.
- `connectionArgvOptions` does not call `materializeKnownHosts` on a bridge.
- `ssh:exec` resolves its chain with `resolveJumpHops` (B1).
- `execOverSsh`, when `ctx.bridge !== undefined`, after the chain (`:280-283`): a chain with a `-J` text and no `hops` goes to
  `refuse('internal', R9)`; call the writer; a refusal goes to `refuse(code, reason)`; then `bridgedSpawn(…)`; an `undefined` answer goes to
  `refuse('no_credential', R8)`; then `runSshExec(argv, { program, env, cwd, … })` with the program of `sshSpawnLaunch` and **the environment of
  `bridgedSpawn` alone** (nothing of `agentAwareLaunch`'s environment, nothing of `prepared.env` but the four askpass names, and those only
  when `prepared.auth === 'askpass'`). In the `finally`: one `deps.note` for each sentence of `files.afterRun()`, then `removeKeyFile` as today,
  then `files.remove()`.
- Off a bridge, `execOverSsh` runs the lines it runs today.

`sshUseActions.ts` is 470 lines; it stays under 540. Each new module stays under 300. Tests L1-L14, G1, G2.

**B8 — The database client on a bridge (parent §4.11, the bridged half). [C]**

- `dbCliLauncher.ts`: `buildDbQueryLaunch(dbType, connectionString, query, options: { bridged?: boolean } = {})`. Bridged `postgres`: `-X` is the
  first argument, before `-c`. Bridged `mysql`: `--no-defaults` is the first argument, before `-h`. `mssql`: no flag (`-X1` breaks the login on go-sqlcmd,
  change 4.1). Off a bridge the arguments are today's, byte for byte, and the test at `test/dbCliLauncher.test.ts:378-385` stays as it is.
- `agentUseActions.ts:610`: pass `{ bridged: ctx.bridge !== undefined }`. `:629`: on a bridge the environment is
  `bridgedSshEnv(process.env, process.platform, launch.env)`; off a bridge the line is today's.

Tests Q1-Q4 and the itest leg (m).

**B9 — The harnesses.** `scripts/itestSshd.cjs`: `startSshd` takes an options object `{ address?, port?, first? }`: the listen address (default
`127.0.0.1`), a fixed port, and config lines that go **before** the defaults (`sshd` keeps the first value, so a rig that offers passwords
says `PasswordAuthentication yes` and `KbdInteractiveAuthentication no` there). The known-hosts line names the address. Today's callers do not change.
`scripts/bridged-ssh-itest.cjs` (the name is fixed by the parent's §4.9) and `scripts/bridged-mysql-itest.cjs`; a row each in `HARNESSES` of
`scripts/run-itests.mjs`; `itest:bridged-ssh` and `itest:bridged-mysql` in `package.json`; two steps in `.github/workflows/ci-extension.yml` after the
SSH agent step. Scratch folders go through `scripts/lib/harnessScope.cjs` and `ownedDir`, as `scripts/itestForwardAgent.cjs:180-181` does.

**What B6 breaks, and how it is mended.** A bridged argv with no `configFile`, or with a `knownHostsFile`, is now `undefined`. Two legs of
`scripts/itestForwardAgent.cjs` build one (`oneLeg` with `bridged`, `:99`; `bridgedLeg`, `:131`): they are rewritten to go through
`writeBridgedCall` and `bridgedSpawn`, and their controls stay as they are. The mux pair then proves "no multiplexing" under the file. Four unit
cases build one too (`test/sshExecCommand.test.ts:144`, `:168`, `:223`, `:225`): they get `configFile: 'c.conf'` and keep their assertions.

**B10 — The owed tests.** V1 (the door case of change 8.2), K1 (the `keyPath` unit test), and L2 and L3 kept green with no edit to their assertions.

## S6.3 — The file, the argv and the environment (contracts)

**The file. [C]** Lines end with LF. Each keyword line is indented two spaces. Every path is in double quotes. Blocks in this order:

```
Host <hop 1 Host word>                              one block for each hop, in ssh order
  IdentityFile "<that hop's key file>"
  StrictHostKeyChecking <yes | accept-new>
  UserKnownHostsFile "<that hop's pin file>"        or, for accept-new: "<first-contact file>" "<person's file>"
Host <destination Host word>                        only when the entry pins a host key
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

- **A hop block has exactly those three keywords.** The destination block has exactly those two. `Host *` has exactly those eighteen lines, in
  that order. A test parses the written text and fails on any other keyword in a block (F2). So a block cannot weaken `Host *`. This is the
  parent's shape, as written.
- **The sentinel.** The `IdentityFile` line of `Host *` names `materializedKeyPath(storageDir, 'no-default-identity')`: the one builder of a path
  in the keys folder, so `test/keysDirPaths.test.ts:70-80` stays green. The file is never made. The line makes the list not empty, so `ssh` adds
  no default identity file (the parent's measurement, §4.9). When `ssh` reaches that name it can print it (`no such identity: <path>`): the
  keys folder's path may then be in stderr, which the parent's Output row allows (P3).
- **The `Host` word** is the host as the entry holds it, with its brackets off and its letter case kept (X3, X4; the lead measured the same
  letter-case rule on Win32-OpenSSH 9.5p2, 2026-11-12). It is never made lower case in the file.
- **Our own paths** (key files, pin files, the sentinel, the first-contact file, the person's file) are written with each `%` as `%%` (X2). A typed key path
  of a hop is written as typed. Backslashes are written once.
- `<home>` is the injected home (`os.homedir()` in production, the rig home in the itest). The writer reads no environment variable itself.

**The host rule. [C]** `bridgedHostWord(host, leg)` answers the `Host` word, or `undefined` for a host a bridge does not take:

- the host passes `isSafeSshHost`;
- a host with no `:`, `[` or `]` is its own word;
- any other host must be an IPv6 address (`net.isIPv6`), alone or with one pair of brackets around all of it. The word is the address with
  the brackets off. **A hop needs the brackets** (X8: `-J` does not take a bare address). **The destination may have them or not**: off a bridge
  only the bare form works (X8), and on a bridge the argv's destination word is the `Host` word, so both forms work there;
- everything else is refused: `gw:2201` (a port typed into the host field), `[gw]`, a bracket in any other place.
- IPv6 zone ids (`fe80::1%eth0`) are not supported: `%` fails `isSafeSshHost`. Two spellings of one address (`::1` and `0:0:0:0:0:0:0:1`) are two
  `Host` words, and `ssh` keeps them apart, because it matches the text before any address normalisation (measured with `-G` on 10.2p1, 2026-11-13).

**A relative typed key path. [C]** A key path that is neither absolute nor starts with `~` is read by `ssh` against the call folder, the spawn's
`cwd`, on a bridge. Off a bridge, it is read against the extension host's own working folder. So on a bridge a plain relative path **fails at
`ssh`** (`no such identity`, or `Permission denied`), because the call folder holds `c.conf` alone. *Corrected 2026-11-13 (CodeRabbit):* the
path rule does not refuse `..`, so a typed `../../../id` climbs from `keys/<pid>/<call>/` into the storage folder, and a file found there would
be loaded. The path is the person's own typing, never the agent's. It is not refused before the spawn, and the refusal list is unchanged. The help
(E4) tells the person to type an absolute path. The parent's §4.9 *fails at `ssh`* list says so (2026-11-13).

**Two legs with one `Host` word are refused. [C]** The words are compared in lower case, after the brackets are off, among the destination and
every hop. The writer refuses first (R4). `bridgedConfigText` refuses again by itself, so no caller can get a file in which two legs are one
block (X7: the destination would get the hop's key and the hop's pin file).

**The user rule. [C]** `unsafeBridgedUser(user)` is true when `isSafeSshUser(user)` is false, or the user holds `$` or a backslash. It is asked of
every user that an entry holds: the destination's and each hop's. An entry with no user is not asked, and its argv word is as today. The reason
is H7a: the `-J` user reaches a shell on some builds. **The cost:** a Windows domain login written `CORP\alice` is refused on a bridge.

**The value rule. [C]** `unsafeSshConfigValue(value)` is true when the value is empty, or holds `"`, or any code point below 0x20, or 0x7F, or the
two characters `${`, or ends with a backslash. It is asked of **every** path the file gets and of the `-i` path. The parent's D15 names the
quote and the control characters. `${` is added from X1: a hop's typed key path `${CREDS_SSH_PASSWORD}` would make the hop leg put the
destination's password into a file name, and `ssh` names that file on stderr. The backslash is added from X5, so the journal says why.

**The `%` rule. [C]** A hop's typed key path that holds `%` is refused. A `-i` path that holds `%` is refused, typed or written by this call.
The journal sentence is R10: it says that a bridge does not support `%` in a key path, and asks for a key file whose absolute path has none.
`~` stays allowed (K1, §S6.9). The import keeps `%` as typed (`importFormats.ts:145`, `:210`), so an imported `IdentityFile` can hold it.
Two reasons. A `%` token in a path is expanded (X2), and `ssh` prints the expanded name when it cannot load the file: the agent would read the
laptop's login, home or host name. And `-i` checks the text as written and loads the text as expanded (X1a), so no spelling of `%` works there.

**The password words. [C]** `BRIDGED_ASKPASS_OPTIONS` is `-o BatchMode=no -o PasswordAuthentication=yes -o KbdInteractiveAuthentication=yes`. With
`-o NumberOfPasswordPrompts=1` first, these are the four the parent names. They are on the command line, so they bind the outer leg only: a
nested `-J` command gets `-l`, `-p`, `-F`, `-W` and the host, nothing else (the E1.3 spec's Amendment 4, D.1, measured; X6).
`NumberOfPasswordPrompts` counts for each method, so the script can be asked once for `password` and once for `keyboard-interactive`.

**The spawn. [C]** `cwd` is the call folder. The argv names the file as `-F c.conf`, never by a longer path. The program is the bare `ssh` of
`sshSpawnLaunch`. The call folder holds `c.conf` and nothing else, for the whole run.

**The environment. [C]** Exactly the names of `BRIDGED_ENV_POSIX` or `BRIDGED_ENV_WINDOWS` that the extension host holds; plus, for a password
destination only, `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`, and `DISPLAY` off Windows. No `SSH_AUTH_SOCK`, no `CREDS_REF_` name,
nothing else.

**What each leg offers, and to whom. [C]** This is the judgement the review makes (§S6.7).

| Leg | Offers | Never offers | Trusts the host by |
|---|---|---|---|
| A hop | one signature, with that hop entry's own key (stored, written for the call; or the file at its typed path) | a password, a keyboard-interactive answer, an agent's keys, a default identity, the destination's key | its entry's pin, alone; or first contact, recorded in `bridges/known_hosts` |
| A key destination | one signature, with the entry's key (`-i`) | a password, a keyboard-interactive answer, an agent's keys, a default identity, a hop's key | its entry's pin, alone; or first contact, recorded in `bridges/known_hosts` |
| A password destination | the entry's password, through the askpass script, at most once for each method, to the pinned destination only | a key (the sentinel is the only identity, and it is no file), an agent | its entry's pin, alone. No pin: no spawn |

## S6.4 — Refusals and sentences (exact)

Every refusal below is made **before any spawn**. The agent reads `BRIDGE_USE_REFUSED(<entry of the call>)` (`bridgeScope.ts`, through
`bridgedRefusal`, `sshUseActions.ts:135-143`) and nothing else. The sentence goes to the laptop's journal as
`<entry of the call>: <sentence> (a Remote Bridge was told only that it could not be used)`. It may name a hop entry: that is N7's stated
boundary (parent §4.2). The code is `no_credential` for every row but R7 and R9 (so for R10 too), as L2 and L3 have it today, so the code tells the agent nothing
new; R7 and R9 are `internal`.

| # | When | The journal sentence [C] | Pinned beside |
|---|---|---|---|
| R1 | a hop's credential is a password | `The jump host "<hop name>" logs in by password. Through a Remote Bridge a jump host needs a key of its own.` | no spawn; no file in `keys/<pid>/` |
| R2 | a hop has no credential, or an empty key path | `The jump host "<hop name>" has no key. Through a Remote Bridge a jump host needs a key of its own.` | the same |
| R3 | a hop's value was not opened (a PIN, a woven password, a sealed key) | the opener's own sentence (`SshCredentialStopped.reason`, or `pinRefusalFor(<hop name>)`), as `sshExecAuth.ts:132-136` says it for a linked key | the same |
| R4 | two legs have one `Host` word | `Two connections of this call go to the host "<Host word>". Through a Remote Bridge the destination and each jump host need a different host.` | the same |
| R5 | a password destination with no pin | `"<entry>" logs in by password and pins no host key. Through a Remote Bridge a password goes only to a host whose key is pinned.` | the same; the main-port control runs |
| R6 | a user, a host or a path fails its rule | `A value of this call cannot be given to ssh through a Remote Bridge: <field> <why>.` | the same; the sentence holds no part of the value |
| R7 | a write fails, or the first-contact file cannot be opened for append | `Could not write the files of this call: <describeError>` | what was written is gone; no spawn |
| R8 | the argv is `undefined` (the second line of B6) | `"<entry>" cannot be given to ssh through a Remote Bridge: its host, its user or its key path is not one a bridge takes.` | no spawn; the files of the call are gone |
| R9 | the chain has a `-J` text and no hop entries | `The jump chain of this call gave no entries to check.` | no spawn; no file |
| R10 | a hop's typed key path, or the `-i` path, holds `%` | `A Remote Bridge does not support "%" in a key path: <the key path of "<entry>" \| the key path of the jump host "<hop name>">. Choose a key file whose absolute path has no "%".` | no spawn; no file; the sentence holds no part of the path |
| J1 | after the run, a new line in `bridges/known_hosts` | `<entry of the call>: first contact through a Remote Bridge: <first field of the line> <algorithm> <SHA256 fingerprint> was added to bridges/known_hosts` | the line is in the file |
| J2 | after the run, a first-contact leg's name is in neither file | `<entry of the call>: after this call no host key line for <name> is in bridges/known_hosts, and none that this check can read is in your own known_hosts. If ssh reached that host in this call, it accepted the key and kept no record, and the next call accepts any key.` | the two files hold no line for the name |

R6's `<field>` and `<why>`:

| `<field>` | `<why>` |
|---|---|
| `the user of "<entry>"`, `the user of the jump host "<hop name>"` | `is not a valid user name, or holds "$" or a backslash` |
| `the host of "<entry>"`, `the host of the jump host "<hop name>"` | `is not a valid host, or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes` |
| `the key path of "<entry>"`, `the key path of the jump host "<hop name>"`, `the keys folder`, `the known-hosts path` | `is empty, or holds a quote, a control character or "${", or ends with a backslash` |

R1-R6 and R8-R10 say what the code has just checked and nothing about what comes next. J1 says that a line was added; it does not say who the
host is. J2 says what the check read. It does not know whether `ssh` reached the host, so it says *if*; and it does not read a pattern line or
a certificate-authority line of the person's file, so it says *that this check can read*.

## S6.5 — Scenarios

Each scenario names its observation. A sentence is asserted beside an observation, never alone.

**`test/bridgedSshConfig.test.ts` (pure)**

| # | Scenario | Observation |
|---|---|---|
| F1 | Two hops (one pinned with a stored key, one unpinned with a typed key path) and a pinned destination | the text equals the expected text, byte for byte, in the order of §S6.3 |
| F2 | The same text, parsed block by block | a hop block has `IdentityFile`, `StrictHostKeyChecking`, `UserKnownHostsFile` and no other keyword; the destination block has two; `Host *` has the eighteen lines in order; the only `IdentityFile` lines of the text are one for each hop block and the sentinel's, and no line names `PubkeyAcceptedAlgorithms` |
| F3 | An unpinned key destination | no destination block |
| F4 | A Windows path with a space and backslashes; a keys folder with `%` in it | each path is in quotes, backslashes once, `%` written `%%` in our own paths |
| F5 | (D15) the measured value, a line break and `ProxyCommand /tmp/evil %h`, as a hop's key path; then `"`, CR, 0x1B, 0x7F, `${X}`, a last backslash and the empty text, in each path field in turn | `ok: false` with that field's name; no text is answered; the name holds nothing of the value |
| F6 | Hosts `HOP.Example`, a hop `[::1]`, a destination `::1`, a destination `[::1]`, and a hop `[::1]` with a destination `0:0:0:0:0:0:0:1` | `bridgedHostWord` answers `HOP.Example`, `::1`, `::1`, `::1`; the last pair gives two words and no refusal; the lines are `Host HOP.Example` and `Host ::1`; `knownHostsName` answers `hop.example` for port 22 and `[::1]:2222` for port 2222 |
| F7 | Hosts `gw:2201` (as a hop, and as the destination), a hop `::1` with no brackets, `[gw]`, `a[b`, `[::1]x`, `fe80::1%eth0` and `[fe80::1%eth0]` | `bridgedHostWord` answers `undefined`; `bridgedConfigText` answers `ok: false` with the host field |
| F8 | Inside `bridgedConfigText` alone: a hop `[::1]` and the destination `::1`; two hops `Hop.example` and `hop.EXAMPLE`; a hop and an unpinned destination with one host | `ok: false`, no text. The writer's own check is not on this road: the function refuses by itself |
| F9 | `unsafeBridgedUser` for `$BRIDGE_PROBE`, `CORP\alice`, `alice`, `alice-name`, and `a b` | true, true, false, false, true |
| F10 | A hop's typed key path `/k/%u/id` | `ok: false` with the key path field |

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
| A5 | Bridged, `askpass` | the three password words stand after the six and before `-F`; no word names `PubkeyAuthentication` |
| A6 | Off a bridge, the argv of every existing case | equal to today's (the existing cases are not edited) |
| A7 | Bridged, the destination `[::1]` and then `::1`, with a user | the destination word is `u@::1` for both. Off a bridge each word is as typed |
| A8 | Bridged, the destination's user `$BRIDGE_PROBE`, then `CORP\alice`, then `alice`, then `alice-name` | `undefined`, `undefined`, an argv, an argv. Off a bridge `CORP\alice` gives today's argv |
| A9 | Bridged, a key path `/k/%u/id`, then `/k/${X}/id`; then the host `gw:2201` | `undefined` each time |
| J1 | `resolveJumpHops` for a chain of two hops | `hops` holds the two entries in the order of the `-J` text; `value` equals what `resolveJumpChain` answers |
| J2 | `resolveJumpChain` for the same chain | the object has the keys `ok` and `value` and no other (the four existing whole-object cases are not edited) |
| P1 | `bridgedCallFolder(dir, 'call-…')`, and a name with `../` | the folder is in `keys/<pid>/`; the file is `c.conf` in it; the second name cannot leave the folder |
| K1 | (M8 (6a)) an entry made by the import from a `Host` block with an `IdentityFile` line, through `resolveSshCredential`, `resolveExecAuth` and `buildSshExecArgv` | the credential is `keyPath`; the word after `-i` equals the line's value, byte for byte, for a `~/` path and for a drive path with a space |

**`test/bridgedSshCall.test.ts` (real files in an owned folder; `./keyInstaller` as `linksWorld` gives it)**

| # | Scenario | Observation |
|---|---|---|
| W1 | A hop with a stored key | one file `call-<uuid>.key`, mode 0600, with the key; `c.conf` in `keys/<pid>/call-<uuid>/`, which holds nothing else; no path of the answer or of the text holds the hop's id, the key entry's id or a name; `jump` equals the `-J` text `resolveJumpChain` gives for the same chain |
| W2 | A hop with a typed key path | its block names the path as typed; no key file is written; after `remove()` the file at that path is still there |
| W3 | A hop with a password; with none; with a PIN-sealed key; with a sealed stored content; with an empty key path | `ok: false`, `no_credential`, the sentence of R1, R2 or R3; `keys/<pid>/` holds no new file and no folder |
| W4 | The destination's host equals a hop's; two hops with one host; the same with another letter case; **a hop `[::1]` and the destination `::1`** | R4; nothing written |
| W5 | A password destination with no pin; then with a pin | R5 and nothing written; then `ok: true`, `pinned: true`, a destination block |
| W6 | A pinned hop typed `HOP.Example` on port 2222; a pinned hop `[::1]` on port 22; an unpinned hop | the block is `Host HOP.Example` and its pin file `call-<uuid>.known_hosts` holds `[hop.example]:2222 <algorithm> <key>`; the second pin file holds `::1 <algorithm> <key>`; `accept-new` and the two files for the third |
| W7 | `remove()`; then `remove()` with `rmSync` made to fail | every file and the folder are gone, and `bridges/known_hosts` is still there; then nothing is thrown and there is one note |
| W8 | The second key write fails | `internal`, R7; the first key file is gone |
| W9 | A `home` that is not this machine's home | the person's file in the text is under the injected home, as an absolute path |
| W10 | A first-contact leg; a line appended to `bridges/known_hosts` between the write and `afterRun()` | one sentence J1 with the fingerprint of that key; a second call with no new line answers no J1 |
| W11 | A hop's user `$BRIDGE_PROBE`; then `CORP\alice`; then the same two as the destination's user; then `alice` and `alice-name` | R6 with the user field for the first four, nothing written; `ok: true` for the last two |
| W12 | A hop `gw:2201`; a hop `::1` with no brackets; the destination `gw:2201`; the destination `::1` | R6 with the host field for the first three, nothing written; `ok: true` for the fourth |
| W13 | The destination's `keyPath` is `/k/%u/id`; then `/k/${X}/id`; a hop's typed key path `/k/%d/id` | R10 with the key path field for the two paths with `%`, R6 for the path with `${`; nothing written; no sentence holds a part of the path |
| W14 | A first-contact leg, and `bridges/known_hosts` cannot be opened for append (the path is a folder); then a call whose legs are all pinned, with no such file | `internal`, R7, and `keys/<pid>/` holds no file and no folder; then `ok: true` and the file is not made |
| W15 | A first-contact leg and no new line: with both files empty; with a plain line for the name in the person's file; with a hashed line (`\|1\|…`) for the name there; with a line for the name in `bridges/known_hosts` | one sentence J2 with the name; then none, none, none |
| W16 | A hop whose credential carries a `warning` | the journal has `<entry of the call>: <warning>`; the call goes on |

**`test/bridgeLinks.test.ts` (the real action behind the real broker and a bridge listener; the stub runner records `argv`, `env`, `cwd` and reads the `cwd` folder while it "runs")**

| # | Scenario | Observation |
|---|---|---|
| L1 | (rewritten) `e1` with its linked key, through the bridge | 200; the argv has `-F`, `c.conf`; `cwd` is a folder in `keys/<pid>/` that held `c.conf` alone; the text read there is §S6.3's for no hop; after the call the key file and the folder are gone; one dialog |
| L3 | (kept; `j1` now has a stored key) a jump host out of scope | 200; `-J hop@jump.example.com`; the text read during the run has the `Host jump.example.com` block with a `call-….key` and its three keywords; the body holds nothing of `jump` |
| L6 | `j1` with a password; with no key; with a sealed key | the body is `BRIDGE_USE_REFUSED('prod')` with `no_credential`; the journal holds the exact line of R1, R2 or R3; `runs` is empty; the slot is back; `keys/<pid>/` is empty |
| L7 | `e1` with a password and no pin, through the bridge; then through the main port | refused with R5 in the journal, `runs` empty; the main port answers 200 with today's argv |
| L8 | (parent §7 D15) `j1`'s `sshKeyPath` is the measured value | refused with R6; `runs` is empty; no `c.conf` was written; the body and the journal line hold no `ProxyCommand` |
| L9 | `BRIDGE_TEST_SECRET` and `SSH_AUTH_SOCK` set in the test process | through the bridge the keys of `runs[0].env` are exactly the allow-list; through the main port both names are there |
| L10 | (g) the main port, every existing case | `runs[0].cwd` is `undefined`; no `-F`; the existing F-scenarios pass with no edit |
| L11 | `e1`'s user holds a space, through the bridge | refused with R6 (the user field) in the journal; `runs` is empty; `keys/<pid>/` is empty |
| L12 | `BRIDGE_PROBE=dummy` in the test process; `j1`'s user is `$BRIDGE_PROBE`, then `CORP\alice`; then `e1`'s user is each of the two; then `alice-name` | the first four: refused with R6 (the user field); `runs` is empty; no file; neither the body nor the journal holds `dummy`. The last: 200. Through the main port `CORP\alice` runs with today's argv |
| L13 | A first-contact leg; the stub runner adds a line to `bridges/known_hosts` and then fails to start; then a run that adds no line | the journal has J1 although the run threw, and the files of the call are gone; then the journal has J2 |
| L14 | The second line alone: a stub writer that answers `ok: true` for an `e1` whose user is `$BRIDGE_PROBE` | refused with R8 in the journal; `runs` is empty; the stub's files are gone |
| G1 | (text only) no writer | as today, with the new journal text |
| G2 | (flipped) `sshDepsFor(parts)` | it carries `bridgedSshConfig` |
| L2, L3-invalid | (not edited) | the generic body and the exact journal line: N7 |

**`test/agentNamesOnlyViewable.test.ts`, beside the case at `:382`**

| # | Scenario | Observation |
|---|---|---|
| V1 | (change 8.2, owed) `wallWorld({ x: 'closed', scope: ['e1', 'x'] })`, `POST /v1/mcp/use/exec` and `…/query` for `x` through `viaBridge` | 403 `denied` with the switch sentence; it differs from the 404 of an absent id; `ww.w.dialogs` is empty; `ww.w.ran` is empty |

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
does), then a spawn of `ssh` with that argv, environment and `cwd`. The harness counts its spawns of `ssh`, so *zero spawns* is a number it reads.
Every control is written by hand and runs under `-F <rig>/.ssh/config`. Where a leg shows that a thing does **not** happen, its control shows
that this rig can make it happen. A **record** leg asserts nothing about the build: it prints what the CI build did, and §S6.13 keeps the line.

| Leg | Control (the bad thing happens) | Production (it does not) |
|---|---|---|
| (a) | Leg 5: a hop that offers passwords only (`PubkeyAuthentication no`, `PasswordAuthentication yes`, `KbdInteractiveAuthentication no` as its first lines); the hand-written argv; the askpass stub's log has a line | Leg 0, no `sshd`: `ssh -G -F c.conf -l hop -p 1 -W '[127.0.0.2]:22' 127.0.0.1` in the call folder reports `batchmode yes`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `identityagent none`, `identityfile <the hop key>` then the sentinel's path and no other `identityfile` line, `gssapiauthentication no`, `hostbasedauthentication no`, `canonicalizehostname false`, `updatehostkeys false`, `verifyhostkeydns false`, and no `pkcs11provider`, `knownhostscommand` or `sendenv` line (X11). Leg 6: the hop of leg 5; the stub's log is empty and the hop's `sshd` saw the connection. Leg 7 (this spec's): the hop takes the hop key; the destination offers `PasswordAuthentication yes` and `KbdInteractiveAuthentication no` as its first lines; the log has exactly one line and its prompt names `127.0.0.2` |
| (b) | `AcceptEnv BRIDGE_TEST_*` on the `sshd`, `SendEnv BRIDGE_TEST_*` in the rig's config, the whole environment: the remote `printenv BRIDGE_TEST_SECRET` prints the value | exit 1 and an empty stdout; the keys of the spawn's environment are the allow-list |
| (c) | `ProxyCommand sh -c 'touch <marker>; exec nc %h %p'`, `PermitLocalCommand yes`, `LocalCommand touch <marker2>`, `Host dest-alias` in the rig's config: both markers exist | no marker exists; an entry whose host is `dest-alias` fails to resolve |
| (d) | a key held only by a live `ssh-agent`: the control logs in | `Permission denied`, with `SSH_AUTH_SOCK` not in the environment; **and again with `SSH_AUTH_SOCK` put back by hand under the production file**: `Permission denied` too, so `IdentityAgent none` is proved alone |
| (e) | the production login below shows that this rig's hop can be reached | a hop whose key differs from the destination's: the hop's `sshd -d` log accepts the hop key's fingerprint, the destination's accepts the destination's, and neither log names the other key. **The refusals of the parent's §7 (e), with the hop's `sshd` up:** a hop entry with a password, with no key, with a PIN-sealed key, and two hops with one host: `ok: false` with the sentence of R1, R2, R3 or R4, zero spawns, and the hop's `sshd` saw no connection |
| (f) | the first call of the leg logs in, so the later refusal is not a rig that cannot connect. **A record leg for first contact:** a hand-written `accept-new` call whose known-hosts file is read-only: the harness prints whether `ssh` logged in and whether a line was written | **an unpinned password destination: `ok: false` with R5, zero spawns.** An unpinned key destination: one line in `bridges/known_hosts`, one sentence J1; **then `purgeMaterializedKeys`, then a second `sshd` with another host key on the same address and port: the next call fails on that leg**; a pinned hop whose key changed fails on that leg; **`bridges/known_hosts` made read-only: `ok: false` with R7, zero spawns**; the rig's `~/.ssh/known_hosts` is byte for byte the same after every leg of the harness |
| (g) | — | no leg of its own: (g) is the existing F-scenarios with no edit, with A6, L10 and Q3; the controls of `scripts/itestForwardAgent.cjs` (off-bridge argv) stay green with no edit |
| (h) | the key file removed: `Permission denied` | a pinned destination whose pin file's path holds a space logs in, and the argv has no `UserKnownHostsFile=`; then another host key on the same address: refused; the same for a pinned hop; and a login by `-i` with a key at a path with a space |
| (i) | only when `CI=true`: `/etc/ssh/ssh_config` and the rig's config each get `ForwardAgent yes`, a `RemoteForward` and an `IdentityFile` the destination accepts; under `-F /etc/ssh/ssh_config`, and under `-F <rig>/.ssh/config`, the control logs in with that key and `-v` shows the forwarding request | `Permission denied` for that key; `-v` shows no agent request and no forwarding request; the system file is put back in a `finally` and compared by hash |
| (j) | (this spec's, from X1) a hand-written file whose hop block has `IdentityFile "${BRIDGE_TEST_SECRET}"`, the variable in the environment: `ssh -v` names a file called by the value. **A record leg for the user (H7a):** in the rig of leg 7, with `BRIDGE_PROBE=dummy` in the environment, a hand-written `-J '$BRIDGE_PROBE@127.0.0.1:<port>'`: the harness prints whether this build refused the user (`invalid username`, as X9) or started the nested command, and whether `dummy` is in `ssh`'s stderr or in the hop's `sshd` log | L8 and F5 are the production half for the path: the writer refuses, so there is nothing to run. For the user, in the same rig and with the same variable: a hop whose user is `$BRIDGE_PROBE`, then `CORP\alice`: `ok: false` with R6, **zero spawns**, and the hop's `sshd` saw no connection |
| (k) | the same call with another host key in the pin line: refused on that leg | (this spec's, from X3 and X12) a pinned hop whose entry host is `LocalHost`: the call logs in. So the block `Host LocalHost` matched the host as typed (the hop key was offered), and the pin line `[localhost]:<port>` matched the name `ssh` looks up |
| (n) | (this spec's; `-G` never runs the identity loader) only when `CI=true`, and only when the runner's `~/.ssh/id_ed25519` does not exist (the leg fails if it does, and writes nothing): the leg makes that default key, the destination's `sshd` authorises it and offers passwords too, and a hand-written call under `-F <an empty file>` logs in with it | a pinned password destination, so the call names no key and the sentinel is the whole list (with `-i`, or in a hop block, the list is not empty anyway): the call is `Permission denied`, the `sshd -d` log shows that no key was offered, and the askpass log has a line. The harness prints the call's stderr, which shows whether the sentinel's path is in it (P3). The default key file is removed in a `finally` |

Legs (a) 5-7, (b)-(d), (h) and (n) need different `sshd` settings, so each starts its own. Legs (i) and (n) are skipped with a printed line off CI; on CI they never skip.

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
| T2 | Drop `BatchMode yes`, `PasswordAuthentication no` and `KbdInteractiveAuthentication no` together; then one of them alone | F2; itest (a) leg 6. One alone: F2 and leg 0 only (ssh_config(5) says that `BatchMode yes` disables password prompts; not run here; the lines are kept as the parent lists them) |
| T3 | Write the `Host *` block first | F1; itest (f) pinned hop, or (h) |
| T4 | Let a hop block carry `ProxyCommand` | F2 |
| T5 | Take `${` out of the value rule; then the line break | F5; L8 |
| T6 | Make the `Host` word lower case | F6; itest (k) |
| T7 | Spread the source into the answer of `bridgedSshEnv` | N1, N4; L9; in itest (b), the assertion on the keys of the environment **only**: the remote `printenv` stays empty under the file, because the file has no `SendEnv` |
| T8 | Give the askpass names to a key destination | N3; L9 |
| T9 | Let a password hop pass | W3; L6; itest (e) |
| T10 | Let an unpinned password destination pass | W5; L7; itest (f) |
| T11 | Compare `Host` words with letter case | W4; F8 |
| T12 | Put `-o UserKnownHostsFile=` back on a bridge | A3; itest (h) |
| T13 | Drop `-F` from the bridged argv | A1; L1; itest (a) leg 6, (e), and (i) on CI |
| T14 | Name a hop key file `<hop id>-<uuid>.key` with `materializePrivateKey` | W1; S1 of #359 |
| T15 | Put the first-contact file in the keys folder | itest (f) |
| T16 | In `bridgedSpawn`, answer the keys folder as `cwd` (not the call folder) | L1; every itest leg that connects (`ssh` finds no `c.conf`) |
| T17 | Skip `files.remove()` | L1; W7 |
| T18 | Drop `--no-defaults`; then move it to the end | Q2; itest (m) |
| T19 | Spread `process.env` into the bridged database child | Q4 |
| T20 | Let an `undefined` argv reach `runSshExec` on a bridge | L14 |
| T21 | Write a hop's `IdentityFile` under `Host *`, not in its block | F1, F2; itest (e): the destination's log then shows the hop key offered |
| T22 | Compare the `Host` words before the brackets are off; then drop the check inside `bridgedConfigText` | W4 (the hop `[::1]` with the destination `::1`); then F8 |
| T23 | Skip the value rule and the `%` rule for the destination's `-i` path, in the writer; then in `buildSshExecArgv`; then answer R6 for a path with `%` | W13; then A9; then W13 (the sentence is R10's) |
| T24 | Skip the user rule in the writer; then in `buildSshExecArgv`; then let `$` through the rule | W11, L12, itest (j); then A8; then F9 |
| T25 | Let `:` through the host rule | F7; W12 |
| T26 | Drop the sentinel's `IdentityFile` line from `Host *` | F2; itest (n): the default key is then offered and the call logs in |
| T27 | Build the sentinel's path with `path.join(materializedKeysDir(…), …)` in `bridgedSshCall.ts` | `test/keysDirPaths.test.ts` |
| T28 | Skip the open for append of the first-contact file | W14; itest (f) |
| T29 | Call `afterRun()` after the `try`, not in the `finally` | L13 |
| T30 | Write the pin line with the host as typed | W6; itest (k) |
| T31 | Do not write the hop credential's `warning` | W16 |

## S6.7 — Review checklist

For Opus, on the code; points 9-15 are Fable's authentication judgement at review.

1. Off a bridge: `git diff` shows no changed line on the off-bridge branches of `buildSshExecArgv`, `execOverSsh`, `buildDbQueryLaunch` and `dbQueryAction` but the added conditions, and `resolveJumpChain` answers the same object.
2. `bridgedSshEnv` is the only source of a bridged child's environment: grep `process.env` in `sshUseActions.ts`, `bridgedSshCall.ts` and the bridged branch of `agentUseActions.ts`.
3. No new file names `materializePrivateKey`; no path in `keys/<pid>/` is built outside `materializedKeys.ts`; no file name of a bridged call holds an entry id.
4. Every refusal of §S6.4 is before the first `runSshExec`, and leaves no file (the tests assert the folder, not a flag).
5. The file is written from `BRIDGED_LOCKDOWN` and from nothing a caller hands in as a keyword.
6. Each sentence of §S6.4 holds no part of a value, and says only what the code checked.
7. The mutations of §S6.6 were run, and each named case failed for the reason given.
8. The As-built names each **[S]** that changed, with the reason.
9. *What a hop is offered.* Read the written `c.conf` of L3 and of itest (e): one `IdentityFile` in the hop's block, that hop's own, and three keywords. No road gives a hop the destination's key or password.
10. *What the destination is offered.* A password leaves only through the outer leg, only to a pinned host, at most once for each method.
11. *Who is trusted.* A pinned leg reads its entry's pin alone. The call does not start when `bridges/known_hosts` cannot be opened for append. That check is made once, before the spawn: a write that fails later in the call (a full disk, a permission changed meanwhile) is not prevented, because `ssh` itself goes on after it (`sshconnect.c:1245-1247`), and it is reported after the call by J2. So this row promises *opened before, reported after*, not *recorded or refused*. A key destination sends no password, so a missed record costs the record, and the next call is a first contact again, journaled again. The person's `known_hosts` is read and never written.
12. *What is not consulted.* No agent, no default identity, no file but `c.conf`, on the outer leg and on every nested leg.
13. *The rules.* Every path that reaches the file or `-i` passes the value rule and the `%` rule; every user and every host of a leg passes its rule. The review looks for a value that reaches `ssh` by another road.
14. *The `-J` text.* It is built from the entries the writer checked (`files.jump`), not from a text the caller handed in.
15. *One leg, one block.* No two legs of a call can have one `Host` word, by the writer and by `bridgedConfigText` alone.

## S6.8 — Out of scope, and where it goes

| Item | Where it goes |
|---|---|
| The tunnel (`ssh -R`) and every helper exec of the supervisor under the same file and environment | E2.2 (parent §4.9, E2 *Inherits from E1.6*). `writeBridgedCall`, `bridgedSpawn` and `bridgedSshEnv` take legs, not an action's context, so E2.2 can call them. Nothing is built for it here |
| The scope pick's rows, Q4's warning, the help | E2.2b and E4. The costs this spec adds (§S6.10) go to those texts with the parent's list |
| The `describeError` text in `Could not run ssh` (`sshUseActions.ts:291`) and the other bodies | Parent §8, open. Not built. R7 adds one such text, to the journal only |
| `-o UserKnownHostsFile=<path>` off a bridge (`sshExecCommand.ts:148`) | Parent §8: a separate fix on `main`, with no owner yet. E1.6 changes the bridged argv only |
| The user rule, the host rule and the `%` rule off a bridge | Nobody. Off a bridge the person's own configuration and terminal apply, and the argv is today's. By H7a the same shell is reached off a bridge, with a hop user that holds `$`. It has no owner; the lead decides whether it joins `todo/PLAN_askpass_answers_the_hop.md`, which has the local hop leg |
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
- **M9, recorded before the merge** (the parent's §7 and the stories document's item 8). *How it is measured:* on the owner's Windows host, a
  build of the E1.6 branch; one call to a key destination and one to a password destination with exactly the eight names; then each name taken
  out in turn. `BRIDGED_ENV_WINDOWS` is then set to what was needed and no wider. On Linux the same with `PATH`, `HOME`. **Added by this
  revision, in the same run:** an unpinned key destination, called from a profile whose path holds a space: the call logs in, and its line is
  in `bridges/known_hosts` afterwards; then the host key is changed, and the next call is refused. And a password call with a default identity
  file in the profile's `.ssh` folder: `-v` shows that it is not offered (the sentinel at run time on Win32-OpenSSH). **And the `%` check of the
  bridge's own entry:** the run asks `includes('%')` of that entry's key path and records yes or no. It does not print the path (the repository
  is public, and the owner's entry cannot be read from here). With yes, R10 refuses that entry on a bridge, and the DoD's `vpn-up` line needs
  another key path. The results go to the parent's §7 M9 row, to the PR and to §S6.13.
- **Windows and the file.** LF line ends, `%%`, a last backslash and `${…}` were measured on OpenSSH 10.2 on Linux only (X1, X1a, X2, X5). M8
  measured a quoted path with a space on Win32-OpenSSH 9.5p2. **Closed:** the letter case of a `Host` word. The lead measured on Win32-OpenSSH
  9.5p2 (2026-11-12) that `Host HOP.Example` matches only that spelling, as X3 on Linux.
- **The user and the shell (H7a).** This spec did not open `ssh.c`. X9 shows only that this machine's build refuses such a user. The record leg
  of (j) says what the CI build does. The rule does not rest on either: the user is refused before the spawn.
- **`ssh` goes on when it cannot write a first-contact line.** The review's reading of `sshconnect.c`; not opened and not run here. The record
  leg of (f) says what the CI build does. The open for append and J2 do not rest on it.
- **A known limit, not run: a FIDO key on a hop, and its PIN.** For a password destination the hop leg has the askpass names in its
  environment, because it is a child of the outer `ssh`. By the review's reading of `sshconnect2.c:1263-1265` (not opened here; no token here),
  a FIDO key that asks for its PIN is then answered by the askpass script with the destination's password. The value stays on the laptop, but
  each call uses one try of the token's PIN. This spec builds nothing against it (§S6.10 says why). **Resolve the FIDO-PIN risk at the next
  whole-plan review, and in any case before any real-token measurement or any switch-on owner build (E2.4) and before E4.1's flip; if no stop
  comes earlier, the lead schedules that review explicitly.** It can wait because R1 (`test/bridgeBoundary.test.ts:158`) keeps every bridge door
  closed until the switch, so E1.6's code reaches no user.
- **The sentinel's line (P3).** By the review's reading of `sshconnect2.c:1529-1532`, `ssh` prints `no such identity: <path>` at the default
  log level when authentication reaches the sentinel. Then a bridged call can show the keys folder's path in stderr. Not run here; legs (a) 7
  and (n) print their stderr, and §S6.13 records it.
- **The name `ssh` looks a host up by.** X12 shows the lower-case name for the connection. Leg (k) is the test for the pin line. Whether a
  pin line in another letter case would match too was not run; this spec writes the lower-case one.
  *Measured 2026-11-13 on 10.2p1 (CI, mutation T30):* a pin line in another letter case matches too. The lower-case line stays.
- **`~` in a typed key path.** `~/` and `~user/` are expanded (X2). When `ssh` cannot load the file it prints the expanded path, so the agent
  can read the laptop's home folder. That is the parent's standing decision on a key path in stderr (N10 Q3), and `~/` is what an imported
  `IdentityFile` often holds (K1), so it is not refused.
- **An IPv6 address end to end.** X4, X7 and X8 are `-G` and `-v` only. No leg of the itest logs in to an IPv6 address. A `Host` word that does
  not match fails closed: `Host *` has no key and checks strictly.
- **What a database client does with no `LANG` or `LC_ALL`** (the output's character set). Q4 pins the environment, not the output (P4).
- **`.mylogin.cnf`.** By MySQL's documentation, `--no-defaults` still reads it. It can hold a host, a user, a password, a port and a socket. Not run.
  *Corrected 2026-11-13, after the code review (Fable; a consultant read Oracle's `mysys/my_default.cc` for 8.0.40 and 8.4.0):* the five
  fields are what `mysql_config_editor` writes, not what the reader accepts. The reader takes any recognised client option from the file's
  `[client]` and `[mysql]` groups, so a hand-written `.mylogin.cnf` can carry `load-data-local-dir` (which acts under `--local-infile=0`) or
  `plugin-dir` with `default-auth`. That is confirmed from the source for 8.0 and 8.4 only; 9.x was not read, and the file disclosure or plugin
  load it allows was not run. B8 does not claim this file is closed. The remedy is owed (§S6.10).
- **Legs (i) and (n) off CI.** (i) writes a system file and (n) writes a default key into the account's own `.ssh` folder, so they run on the CI runner only.
- **A hostile `~/.ssh/config` of the account itself.** `ssh` reads the home of the account, not `HOME` (the parent's measurement, §7). So the
  production legs of (b) and (c) never meet the rig's config as the person's file; their controls show what that config does when it is read. Only
  (i), on CI, puts hostile lines where a production call would read them, and that is the system file. That `-F` also shuts out the account's own
  file rests on ssh(1) and on M8 (4) on Windows.

## S6.10 — Decisions, what is owed to the parent, and the open points

**Decisions of 2026-11-12, as the lead gave them to this spec.**

- **Not a plan change (the owner).** The fixes of this revision satisfy what §4.9 and the Definition of Done (§9) already say: a hop is not handed the destination's
  password, each leg offers its own entry's identity alone, and a first contact is recorded. No ledger entry is written for them. The sentences of
  the parent that they make inexact are listed below, and the lead edits the parent.
- **Settled (the lead and the owner):** PR #359 merges first (§S6.1 E3); the dep `bridgedSshConfig` stays optional and a call with no writer is
  refused (B7); the bridged half of §4.11 is built by this story (B8); the value rule refuses `${` (P1).
- **Two measured shapes are not built: `IdentityFile none` and `PubkeyAcceptedAlgorithms -sk-*` (X10).** A consultant counted them under the
  change-control rule, and the lead verified the count: they are two plan changes (they would be 9.2 and 9.3). §4.9's Output row already allows
  a key path in stderr, and *exactly three keywords* is a stated shape of the parent. Two changes in one epoch stop the whole plan. The decision
  is not to stop now: this spec keeps the plan as written, with the sentinel and three keywords.
- **Settled (the lead): the `%` rule stays (P9),** with the sentence R10 and the M9 check of §S6.9.
- **Settled by a consultant, checked by the lead against `sshCommand.ts:91-93`:** the user rule is `isSafeSshUser` and no `$` and no backslash,
  for every user an entry holds.
- **Measured by the lead:** the letter case of a `Host` word on Win32-OpenSSH 9.5p2 (P2).

**Owed to the parent. This spec does not edit it.**

1. **§4.9, *What this costs, said once, the whole list*, the list of what is refused before any spawn:**
   - *two of one call's legs share a host string* becomes *two of one call's legs share a host, compared with the brackets of an IPv6 address
     off and without letter case*;
   - *a value the file would carry holds a quote or a control character (D15)* becomes *a path the file or `-i` would carry is empty, holds a
     quote, a control character or `${`, or ends with a backslash (D15); a typed key path, or the path given to `-i`, holds `%`*;
   - added: *the user of the destination or of a hop holds `$` or a backslash, so a Windows domain login written `CORP\alice` is refused*;
   - added: *a host holds `:` or a square bracket and is not an IPv6 address (in brackets for a hop), so a port typed into the host field is refused*;
   - added: *a call with an unpinned key leg cannot open `bridges/known_hosts` for writing*.
2. **§6:** a row for the per-call pin files: at most (1 + 4) × 8 files, under 1 KB each, removed in the call's `finally`; the purge covers a killed window (P6).
3. **§7, the M9 row:** the first-contact measurements, the default-identity measurement and the `%` check of §S6.9.
4. **The stories document** (`todo/PLAN_remote_bridge_scoped_E1.md:524`, `:571-572`): legs (a)-(i), and the bridged half of §4.11 (P7).
5. **Stale line numbers of §4.11:** `agentUseActions.ts:342`, `:369`, `:372` are `:602`, `:629`, `:628` on this tree (H11).

**Disposed on 2026-11-15 by the parent's revision for epoch 10** (its §4.9, the table *What was owed to this review, disposed*): the FIDO-PIN risk and
items 1-6 below. What is built for each is §S6.14. The two lists stay here as the record of what was owed.

**Owed to the next stop of the plan.** The FIDO-PIN risk of §S6.9, with its text there: at the next whole-plan review, and in any case before
any real-token measurement or any switch-on owner build (E2.4) and before E4.1's flip; if no stop comes earlier, the lead schedules that review
explicitly. X10 is its evidence. The same review can weigh `IdentityFile none` against the sentinel (P3).

**Also owed to the next stop, from the code review of 2026-11-13** (Opus and Fable on `154ab5ca..4abf2e47`). The same deadline applies to each
item: the next whole-plan review, and in any case before any switch-on owner build (E2.4) and before E4.1. A consultant counted the first three
under the change-control rule, one consult each. Each remedy proposed would be a change: a new refusal, a new environment variable on B4's list,
or a new path shape against D16. So none is built here, and none is counted, because no remedy was accepted. The bridge stays unreachable
(`bridgeBoundary.test.ts`, R1).

1. **`.mylogin.cnf`** (§S6.9, corrected): proposed remedy `MYSQL_TEST_LOGIN_FILE` set to an absent path for a bridged `mysql`. MariaDB ignores
   it; `--no-login-paths` is fatal on MariaDB. First step: a fixture with `load-data-local-dir=/`, run as `mysql --no-defaults --verbose --help`,
   with and without the variable.
2. **A backslash pair inside a quoted path, on Windows.** Inside quotes `ssh` 8.7+ reads `\\` as `\` and `\'` as `'`. Measured with `-G` on
   10.2p1: a UNC storage folder written once as `"\\fs\…"` is read as `\fs\…`. A pinned leg then fails closed. An unpinned key leg runs
   `accept-new` against a file it cannot write, so a first contact is not recorded and only J2 reports it afterwards. A typed hop key path has
   the same reading. Proposed remedies: refuse `\\` and `\'` in the value rule, or write our own Windows paths with `/`. Either would be a change.
   `8.0`-`8.6` read quoted text verbatim, so doubling is no remedy. First step: an unpinned call on Windows with a disposable UNC storage folder,
   then a look at `bridges/known_hosts`.
3. **A hop whose host is `none`.** `-J none` turns the jump off: `ssh` goes straight to the destination and skips the bastion the entry names.
   The destination leg keeps its own pin and key, and no credential crosses legs. Measured with `-G` on 10.2p1. Proposed remedy: refuse a hop
   word equal to `none` in any letter case. That is a new refusal against §S6.3's host rule.
4. **A `hostKey` that does not parse is read as unpinned** (`bridgedSshRefusals.ts`). A key leg then gets `accept-new`; a password destination
   is still refused (R5). It behaves the same off a bridge.
5. **Older clients** (Fable, partly from memory of the source; not run on them):
   - `CheckHostIP` defaults to yes before 8.5, so a direct first contact also writes an IP line into `bridges/known_hosts`.
   - `%%` in `UserKnownHostsFile` is expanded only from 8.4. On older clients a storage path holding `%` is read literally: a pinned leg fails
     closed and a first contact records nothing.
   - `GlobalKnownHostsFile none` is a relative file named `none` before about 8.5. That is harmless only because the call folder holds `c.conf`
     alone.
   - `SSH_ASKPASS_REQUIRE` exists from 8.4.
   - Before 8.7 `KbdInteractiveAuthentication no` does not override `ChallengeResponseAuthentication yes`, so on a hop leg `BatchMode yes` is
     what closes it.

   Every keyword the file writes exists in 8.0, so no line is fatal there. The plan names no oldest client; the review chooses one.
6. **R10 when the storage folder itself holds `%`.** Every stored-key call is then refused, because the `-i` path is the call's own. Measured:
   `-i` with `%%` fails "not accessible", so escaping is no remedy. The sentence *Choose a key file…* misleads in that case. A regression test
   pins the refusal. A sentence that names the storage folder would be a new sentence.

**For the owner: none.** Q1-Q4 and Q8 are decided (parent §2.1), and this spec builds under them. M9 needs the owner's Windows host; that is a measurement.

**The points, and where each stands.**

| # | Point, with its evidence | Built | Stands |
|---|---|---|---|
| P1 | D15 names a quote and control characters. X1: `${VAR}` in a path of the file is replaced by an environment variable of the `ssh` process, and a nested hop leg has `CREDS_SSH_PASSWORD` in its environment for a password destination | The value rule refuses `${` | Settled |
| P2 | §4.9 does not say how the `Host` word is spelled. X3: a pattern in another letter case does not match | The host as typed, brackets off; equal words compared in lower case | Settled; measured on both builds |
| P3 | The sentinel's path can be printed (`no such identity: <path>`, the review's reading of `sshconnect2.c:1529-1532`) | The sentinel, as the parent says. The keys folder's path may be in stderr, which the parent's Output row allows | Stays. Leg (n) is the run-time test that no default identity is offered. `IdentityFile none` (X10) waits for the next whole-plan review |
| P4 | §4.11 gives the database child the same list as `ssh`. No `LANG` or `LC_*` is on it | The list as written | Open; it changes no secret |
| P5 | `sshUseActions.ts:254-258`: an entry whose host or user fails `isSafeSshTarget` gives `runSshExec` an `undefined` argv, and Node then starts `ssh` with no arguments (H4) | On a bridge: R6 from the writer, and R8 as the second line (L11, L14). Off a bridge: not changed | Off a bridge it has no owner |
| P6 | §6 has no row for the per-call pin files | As item 2 above | Owed |
| P7 | The stories document says legs (a)-(g) and names no database flag | This spec follows the parent | Owed |
| P8 | **The host rule, where this spec does not follow the review's words.** The review said: refuse a host that holds `:` unless it is one bracketed literal. X8: `ssh` cannot resolve a bracketed destination word, off a bridge and on one, and a bare address is the only form that works off a bridge | A hop: brackets needed. The destination: an IPv6 address with or without brackets, and the argv word has them off. `gw:2201` and `[gw]` are refused for both | **Settled (a consultant, checked by the lead with `ssh -G` on 10.2p1, 2026-11-13):** this form stays. `Host` blocks match the text before any address normalisation, so `Host ::1` and `Host 0:0:0:0:0:0:0:1` stay apart; a zone id (`%`) fails `isSafeSshHost`; add regression cases for both, and say that zone ids are not supported |
| P9 | **The `%` rule and an imported `IdentityFile`.** An entry whose key path holds a `%` token (`%d/.ssh/id`) is refused on a bridge. M8 (6) did not write the form of the owner's path here | Refused, with R10 in the journal. `~` stays allowed (K1) | Settled (the lead): the refusal stays. The import keeps `%` as typed (`importFormats.ts:145`, `:210`). M9 asks `includes('%')` of the bridge's own entry without printing the path, and the PR records the result before the merge |

## S6.11 — What this changes for a local user; the CHANGELOG; the documents

- **For a local user: nothing.** Off a bridge the argv, the environment and the `cwd` of `ssh:exec` and of a query are today's (A6, A7, A8, L10,
  L12, Q3, Q4, itest (g)), and `resolveJumpChain` answers the same object (J2). No production door reaches a bridge (R1). The PR body says so
  and names these tests.
- **`CHANGELOG.md`:** no bullet. The parent says that the guard gets none, and that E4.1's flip entry carries what a bridge does. If the diff at the
  commit shows a change a local user can reach, it gets its bullet from that diff, and the PR says which test missed it.
- **`research/module_extension.md`:** the bridged `ssh` road (the file, the environment, the rules, the refusals), from the code as built.
- **`research/module_tests.md`:** the two harnesses, each with its command, what it covers, and what it does not prove (Linux only; no password login that succeeds; record legs assert nothing about the build).
- **The parent and the stories document:** not edited by the coder. The M9 result, and what the As-built changes, go to the lead.

## S6.12 — Contract → step → test

| # | Contract (parent) | Step | Unit and door tests | Itest leg |
|---|---|---|---|---|
| C1 | §4.9 row 1: a hop never gets the destination's password | B3, B5 | F2, F9, W3, W11, L6, L12 | (a) 0, 5, 6, 7; (j) |
| C2 | Row 1, Q3: a password goes only to a pinned destination | B5 | W5, L7 | (a) 7 (the destination alone is asked); (f) |
| C3 | Row 2, Q1: a hop signs with its own entry's key, offered alone; other credentials are refused | B5 | F2, W1, W2, W3, W16, L3, L6 | (e); (a) 0 |
| C4 | Row 2: the destination's key by `-i`; key files 0600, removed in `finally`; a typed path read in place | B5, B6, B7 | A1, K1, W2, W7, L1 | (e), (h) |
| C5 | Rows 3 and 4, Q2: no agent, no default identity | B3, B4 | F2, N4, L9 | (d) both, (i), (n) |
| C6 | Row 5: the environment is the allow-list | B4, B7 | N1-N6, L9 | (b) |
| C7 | Rows 6 and 7: the command, stdin and output as today; no entry id in a path | B5 | W1, L1, L2, L3 | — |
| C8 | Row 8: no forwarding on an exec leg | B3 | F2, F1 of `bridgeLinks` (kept) | (i) |
| C9 | Row 9: no local subprocess but the askpass script | B3 | F2 | (c) |
| C10 | Row 10: the per-call file alone is read | B6, B7 | A1, A2, L1 | (c), (i); (a) 0 |
| C11 | Row 11: pinned legs read their own file; the call does not start unless `bridges/known_hosts` opens for append, and a record missing after the call is reported (J2); the person's file is never written | B3, B5, B7 | F1, F3, F6, W6, W9, W10, W14, W15, L13 | (f), (h), (k) |
| C12 | Row 12: no multiplexing | B3, B9 | F2 | the mux pair of `scripts/itestForwardAgent.cjs`, rewritten (B9) |
| C13 | Row 13: a refusal is generic to the agent, detailed in the journal | B7 | L2, L3, L6, L7, L8, L11, L12, L14 | — |
| C14 | The file: order, three and two keywords, the lock-down, quotes, backslashes once | B3 | F1, F2, F4, F6 | (a) 0 |
| C15 | D15: a value that could change the file is refused, no spawn, no file; and no `%` in a key path (R10) | B3, B5, B6 | F5, F10, W13, A9, L8 | (j) |
| C16 | D16: a relative `-F`, a fresh folder per call with one file | B2, B5, B7 | P1, W1, L1 | every leg (the storage folder has a space in its name) |
| C17 | Equal hosts among one call's legs are refused, and a host has one `Host` word | B3, B5 | F6, F7, F8, W4, W12, A7 | (e) |
| C18 | Epoch 9: no `-o UserKnownHostsFile` on a bridge; the pin in the destination block; `-i` kept | B3, B6 | A3, A4, F1 | (h) |
| C19 | Off a bridge, byte for byte | all | A6, A7, A8, J2, L10, Q3, the existing F-scenarios | (g): the controls of `scripts/itestForwardAgent.cjs`, not edited |
| C20 | The lock goes; a call with no file is refused | B6, B7 | A2, G1, G2 | — |
| C21 | Change 9.1: `materializeCallKey` for a hop key; no id in a hop file or a pin file | B5 | W1, W6; S1 of #359 | — |
| C22 | §4.11: `-X`, `--no-defaults` first, nothing on `sqlcmd` | B8 | Q1, Q2, Q3 | (m) |
| C23 | §4.11: the database child's environment | B8 | Q4, N4 | — |
| C24 | Change 8.2: an in-scope entry the agent may view, switch off, through the door | B10 | V1 | — |
| C25 | N7: the generic body and the detailed note | none | L2, L3 (not edited) | — |
| C26 | M8 (6a): an imported key path reaches `-i` unchanged | B10 | K1 | — |
| C27 | M9: the Windows list, and first contact on Windows | a measurement, before the merge | — | — |
| C28 | The hop entries the file is written for are the hops of the `-J` text | B1, B5 | J1, J2, W1 | (e) |

**Done when.**

- [ ] Every scenario of §S6.5 is green, and each new one was watched RED first (B0's record).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run ratchet` are green in `src_vs_code`; no file is over 800 lines.
- [ ] `itest:bridged-ssh` and `itest:bridged-mysql` are green in CI on the PR's head, legs (i) and (n) included, and `itest:ssh-agent` is green with the rewritten legs. The lines of the record legs of (f) and (j) are in §S6.13.
- [ ] The mutations of §S6.6 were run; both outputs are in the PR.
- [ ] S1 of #359 passes on the new files; `keysDirPaths.test.ts` is green with no exception.
- [ ] `research/module_extension.md` and `research/module_tests.md` say what was built; `node .agents/conventions/tools/plan-lifecycle.mjs` is clean.
- [ ] The PR body says what changes for a local user (nothing, with the tests that show it) and lists the points of §S6.10 with what was built.
- [ ] The Opus review and Fable's authentication judgement (§S6.7, points 9-15) are done, and the `coai` code round reached `proceed`.
- [ ] **M9 is recorded before the merge**, with the first-contact and default-identity measurements of §S6.9 and the `%` check of the bridge's own entry, whose result is in the PR. §S6.13 is written.

## S6.13 — As built

*Written by the lead from the coder's (Sonnet) two reports, 2026-11-13.* Built on `docs/remote-bridge-e1-6-spec`, PR #365.

**Commits.** The build is `4c4b7f83` (B1-B2), `94f99e58` (B3-B4), `16e5d078` (B5-B7), `376bdfe1` (B8), `ea09a15c` (B10) and `77e0b152` (two
tests given teeth by T8 and T22a). `4abf2e47` is B9 with its harnesses. After the review (Opus; Fable on security) came the fix-forward:
`947bb1db`, `9a819751`, `ded151e7`, `c9e48f14`, and the CI library line. B3+B4 and B5+B6+B7 are one commit each, because without B7's writer
B6 leaves the old bridged tests red (the review judged this acceptable).

**Order with #359.** #359 was on the branch before the first commit. Hop keys are written with `materializeCallKey`.

**RED record of B0.** Each new test file was run against the old code or with its module missing:
- `sshExecCommand`: 8 of 26 failed (A1-A5, A7-A9).
- `bridgeLinks` with `bridgeRunSites`: 15 failed (L1, L3, K6, F1, G1, G2, L6-L9, L11-L14, C10).
- `dbCliLauncher`: Q1, Q2 and Q4 failed.
- V1, K1 and A6/Q3 test behaviour that already existed, so they had no RED.
- Fix-forward: the `keyInstaller` partial-key case and the first-contact report note were RED first; the DISPLAY, `fieldRefusal`, EISDIR and
  storage-`%` cases failed to load before their code existed.

**Test counts.** 7863 tests before (7826 pass, 37 skipped). 7923 after the build. 7930 after the fix-forward: 7893 pass, 0 fail, 37 skipped.
Typecheck, lint, ratchet, public hygiene, the leftovers check and plan-lifecycle are clean.

**Mutations (§S6.6), unit halves.** Each was run by a script that applied it, compiled, ran 12 test files and restored the file. Each one run
failed the unit case the spec names, and on these points more than it names:
- T2: dropping one password line alone fails F2 and L1, not "F2 and leg 0 only".
- T22a survived at first: `bridgedConfigText` refused the same pair after a write. W4 now asserts that no key file was asked for, and T22a then
  fails W4.
- T8 fails L9 only because L9 now sets `SSH_ASKPASS` and `DISPLAY`.
- The other 31 mutations, T1-T31 and a K1 mutation, failed as named.
- T15 has only an itest half. V1 has no mutation.
- **The itest halves** ran on CI from the branch `tmp/e16-itest-mutations` (workflow dispatch; the PR branch was not touched), in run
  [43507318723](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/actions/runs/43507318723). A runner applied one mutation,
  compiled, ran only the named legs, and restored the file. Each mutation failed its leg except T30. **The baseline:** unmutated, every named leg
  passed, in that run before the first mutation and on the PR head f5b452b9 (run 43510966411); so (f) is green without T15 and red with it.
  - T1 fails (d), the second production leg.
  - T2 (all three lines) fails (a) 6 and (a) 0. One line alone fails (a) 0 only.
  - T3 fails (h). T6 fails (k). T7 fails (b), the environment keys. T9 fails (e). T10 fails (f), R5. T12 fails (h), twice.
  - T13 fails (a) 6, (e) and (i). T15 fails (f), J1. T16 fails (e) and (k).
  - T18 fails (m), both dropped and moved to the end, on Oracle's client. MariaDB's `--local-infile=0` already wins over its option file.
  - T21 fails (e)'s new offers check. T24 (writer) fails (j). T26 fails (n). T28 fails (f), R7.
  - **T30 survived (k).** `ssh` matched a pin line written `[LocalHost]:port` for a host typed `LocalHost`, so on 10.2p1 the letter case of
    a known-hosts line does not matter. The unit case W6 alone pins the lower-case line, which stays as the spec writes it. This answers
    §S6.9's open point on the pin line's letter case.
- **The first dispatch found four weak rig legs.** They are fixed on the PR branch:
  - (d) now names the agent key's public file in `-i`, so only `IdentityAgent none` keeps the agent out (T1 survived before).
  - (a) 6 now uses a pinned password destination with the askpass names in the environment (T2 survived before).
  - (e) has a check that a refused first key is not followed by the hop key (T21 survived before).
  - `production()` no longer crashes on a missing `c.conf` (T16).

Eight more mutations of the fix-forward each fail their own case: DISPLAY on win32, `readText`, `afterRun`, `reportFirstContact`, R9, the `%`
rule, the field sentences and the partial key.

**[S] items that changed, and why.**
- New modules keep each file under 300 lines: `bridgedSshRefusals.ts` (pass 1 and `fieldRefusal`), `bridgedSshSentences.ts` (R1-R10, J1, J2,
  the known-hosts reading), `bridgedSshRoad.ts` (the bridged half of `execOverSsh`), and the harness helpers `itestBridgedRig.cjs` and
  `itestBridgedTrust.cjs`.
- `process.env` is read in `bridgedSshRoad.ts`, the one source given to `bridgedSpawn`. Checklist item 2's grep should name that file.
- `bridgedSpawn` passes `ownAgent: false`, because `launchRoadScan.test.ts` F5 needs every call to name it. On a bridge it has no effect.
- The field names of `bridgedConfigText` are `hop:<n>:host|key|pin`, `destination:host|pin`, `keys`, `known-hosts` and `hosts`. The export
  `bridgedKeyPathProblem` returns `'value'` or `'percent'`, so R10 can be told from R6.
- The second line (`fieldRefusal`) maps a host field to that entry's R6 host sentence, and a hop key to R10 or that hop's R6 key sentence.
  `hosts` maps to R4 with the later word. `hop:N:pin`, `destination:pin` and `keys` keep the keys-folder sentence: the pin files and the sentinel
  have names we made, so the keys folder is the only R6 row that can be at fault.
- R4 names the later duplicate word. J1 and J2 use `destination.name`.
- `remove()` writes one note per call.
- `readText` reads only ENOENT as empty. Any other error is R7 before the spawn and one note after it. `afterRun` and `reportFirstContact`
  write `ssh:exec — first contact of the call could not be reported: <why>` and no longer swallow the error.
- `materializePrivateKey` removes its own file when the write, the chmod or the lock throws, and rethrows. That covers hop keys and the
  destination key.
- `askpassOf(env, platform)` drops `DISPLAY` on win32.
- Harness legs:
  - (m) control uses `--local-infile=1`.
  - (j) control uses a direct connection to a silent listener: `ssh` loads identities after the connect.
  - Leg 0 checks the hop block in `-G` output by its text.
  - (i) makes both `/etc/ssh/ssh_config` and the rig's config hostile, with an agent running. Each control must show the agent-forwarding
    request and the remote forward, and production must show neither.
  - (n) asserts the askpass log has a line.
- CI: Oracle's `mysql-client` and `libmariadb3` come from apt. MariaDB's `mariadb-client-core` is downloaded and unpacked, and both are named to
  the harness by absolute path. The two client packages conflict on Ubuntu.
- Not done: replacing `held.files`, `written.files.push` and `written.dir =` with new objects. They are the trackers that let a throw mid-pass
  remove what was written, and a rewrite was not local.

**Line counts.** `sshUseActions.ts` 536, `keyInstaller.ts` 321, `bridgedSshCall.ts` 296, `bridgedSshConfig.ts` 225, `sshExecCommand.ts` 213,
`bridgedSshRefusals.ts` 179, `bridgedSshSentences.ts` 110, `bridgedSshRoad.ts` 70, `bridgedSshEnv.ts` 47.

**Live harnesses.** This host has no `sshd` and no mysql client, so only leg (a) 0 ran (`ssh -G` under the production file on 10.2p1): 14 of
14 checks green. A few things were probed outside the harness: (c) an alias does not resolve, (j) control `ssh -v` names the file `${VAR}`
expands to, and (e) R1-R3 spend no spawn. Every other leg first runs on CI. The record legs of (f) and (j) print there; their output is copied
into the PR.

The first CI run was 2026-11-13, on OpenSSH 10.2p1 (Ubuntu). Every leg was green except the **(a) 5 control**. It failed because `ssh` puts
`-F <path>` **unquoted** into the ProxyCommand it builds from `-J`. The `-v` line was `exec ssh -l runner -p … -F /tmp/…/rig home/.ssh/config
-v -W …`, and the nested leg then opened `…/rig`. That leg was the rig's own error, since its control file sat under a folder with a space. The
control now names its file relative to its `cwd`. The same run is evidence for D16: the relative `-F c.conf` is what keeps a storage path with
a space from breaking every bridged hop.

**Open risks found at review** are in §S6.10, *Also owed to the next stop*.

**M9: run 2026-11-15 as re-review evidence. It stopped the parent plan (its ledger entries 9.2 and 9.3), so it is not a merge pass.**

How it was run:
- The lead ran it, not the owner, on the owner's Windows PC through WSL interop.
- The runtime was VS Code's own: `Code.exe` with `ELECTRON_RUN_AS_NODE=1`, Electron 43.8.6, node 24.22.1. That is the extension host's runtime and its libuv.
- The driver called the branch's compiled `writeBridgedCall`, `bridgedSpawn`, `sshSpawnLaunch`, `writeAskpassScriptFile` and `askpassEnv` from `out/`; the code was `f5b452b9`.
- It spawned the way the runner does: `shell: false`, `windowsHide: true`, stdio `ignore`/`pipe`/`pipe`.
- The client was Win32-OpenSSH 9.5p2.
- The server was a throwaway `sshd` (Alpine, OpenSSH 9.9p2) in a `wslc` container on Windows' `127.0.0.1:2222`, with a throwaway account, password and keys.
- The storage folder's path held a space.
- The output masks the user name and the password. The driver stays on that host.

A probe "+ `PROGRAMDATA`" is the production environment with that one name added by the driver, never by the product.

| Leg | Environment asked | Result |
|---|---|---|
| A0 key, pinned, as built | the eight of `BRIDGED_ENV_WINDOWS` | exit 255, no stdout, no stderr |
| A0 password, pinned, as built | the eight + the three askpass names | exit 255, nothing printed |
| A1 key, pinned | + `PROGRAMDATA` | logs in |
| A2 password, pinned, `-v` | + `PROGRAMDATA` | `askpass.bat` answers; `Authenticated to 127.0.0.1 ([127.0.0.1]:2222) using "password"`; `Will attempt key:` names only the sentinel |
| A3 each name taken out in turn, key and password | the eight + `PROGRAMDATA`, less one | all 16 log in except the two without `PROGRAMDATA` (exit 255, nothing printed) |
| A4 first contact, unpinned key | + `PROGRAMDATA` | logs in. The journal has J1 (`first contact through a Remote Bridge: [127.0.0.1]:2222 ssh-ed25519 SHA256:… was added to bridges/known_hosts`). `bridges/known_hosts` was absent before and holds one line, the server's key, after |
| B1 unpinned, the server's key then changed | + `PROGRAMDATA` | refused: `Host key verification failed`, the offending line `bridges\known_hosts:1` |
| B2 key pinned to the old key, the key changed | + `PROGRAMDATA` | refused; the offending line is in the call's own pin file |
| B3 password pinned to the old key, the key changed | + `PROGRAMDATA` | refused before authentication |
| C1 a default identity in the profile | + `PROGRAMDATA` | The control (`-F` an empty file) offered `~\.ssh\id_ed25519` and logged in by `publickey`. The production password call then listed only the sentinel under `Will attempt key:` and logged in by `password` |

What the run shows, and what it does not:
- **Win32-OpenSSH 9.5p2 does not start without `PROGRAMDATA`.** Even `-V` exits 255 with nothing printed. As built, every bridged call on Windows fails, and `BRIDGED_ENV_WINDOWS` needs that name. That is change 9.2.
- **libuv adds names on Windows.** When `HOMEDRIVE`, `HOMEPATH`, `PATH`, `SYSTEMROOT`, `TEMP` or `USERPROFILE` is absent, libuv puts the extension host's value back. It adds `LOGONSERVER`, `SYSTEMDRIVE`, `USERDOMAIN`, `USERNAME` and `WINDIR` too. That is change 9.3.
  - So taking out one of those six measured the restored value, not its absence.
  - "Logs in without it" is a real result only for `TMP` and `COMSPEC`. `askpass.bat` ran without `COMSPEC`.
- **Win32-OpenSSH takes `~` from the account's profile, not from `USERPROFILE`.** A control with `USERPROFILE` set to a folder whose path holds a space still listed the real profile's `.ssh\id_*` under `-v`.
  - So a profile path with a space reaches the extension's own paths, but not ssh's `~`. In the first-contact leg, the space was in the storage folder's path.
  - For C1, a throwaway `id_ed25519` was put into the real profile's `.ssh` and removed after the leg. The folder listed the same files before and after.
- **Linux (WSL), OpenSSH 10.2p1 on both ends.** The `sshd` was unpacked from the Ubuntu package with `libwrap0` and ran as a non-root user. The production call came through the itest rig.
  - With `PATH` and `HOME`, the key call logs in, and also with either one alone.
  - The password call asked askpass once, and the `sshd` logged a password attempt, in all three cases. It cannot log in, because a non-root `sshd` cannot check a password. That is a limit of the rig.
- **The `%` check of the bridge's own entry: answered by the owner, 2026-11-16: no `%`.** That entry's key path cannot be read from here, so the owner looked; the path is not recorded.

**PW2 and PW3: run 2026-11-15 by the lead, the same rig and runtime, a fresh storage folder whose path holds a space.**

| Probe | Environment asked | Result |
|---|---|---|
| PW2 A1 key, pinned | exactly the seven of Y1 | logs in |
| PW2 A2 + C1 password, pinned, `-v` (a throwaway `id_ed25519` in the account profile's `.ssh`, removed after) | the seven + the three askpass names | logs in by `password` through `askpass.bat`; `Will attempt key:` names only the sentinel |
| PW2 A4 first contact, unpinned | the seven | logs in; J1 in the journal; `bridges/known_hosts` absent before, one line after |
| PW3 `cmd /d /c set` | the seven | the child holds `USERNAME`, `USERDOMAIN` and `LOGONSERVER` with the host's values (libuv) |
| PW3 `cmd /d /c set` | the seven + `USERNAME`, `USERDOMAIN`, `LOGONSERVER` given as empty strings | the three are present and empty: libuv backfills only an absent name; `ssh -V` exits 0 |
| PW3 A1, A2, A4 | the seven + the three empty (no default identity planted) | all three log in as in PW2 |

PW3 is an observation for Q14 (the parent's §2.1), not a decision: giving the three identity names empty values would keep the account's
name, domain and logon server out of `ssh.exe`, leaving `SYSTEMDRIVE` and `WINDIR` as the only values libuv adds.

## S6.14 — Amendment for epoch 10: the fix-forward on PR #365

*Written 2026-11-15 by Fable, with the parent's whole revision for epoch 10 (step 4 of the full stop after 9.2 and 9.3). Nothing here is built
before epoch 10 opens and the sort has marked E1.6.* The parent's text it builds from: §4.9 (the Environment row, *The client check, and the
floor*, the table *What was owed to this review, disposed*, the cost list), §4.11, §5 step 3d, §7 (legs (b), (o)-(r), the M9 row, the probe
table), §8, §9, §2.1 Q12-Q14. **[C]** and **[S]** mean what they mean above.

**Why.** The spec treated what it hands to `ssh` as proof of what `ssh` does. M9 found the list that no `ssh.exe` starts under (9.2) and the
names libuv adds (9.3). `-J none`, a pin that does not parse, `.mylogin.cnf` and the FIDO PIN have the same shape. So every item below has two
tests: one pins the request, one observes the child or the receiver.

**Supersedes.** B4's Windows list and `BRIDGED_ENV_EXTRA`; §S6.3 *The environment*; N2; the words *builds nothing against it* of §S6.9's FIDO
bullet; R6's keys-folder sentence; for Y4, §S6.3's *exactly those eighteen lines* of `Host *` and F2's *the eighteen lines* and *no line
names `PubkeyAcceptedAlgorithms`* (nineteen lines now, the new one once and in `Host *`: F11), and §S6.10's *not built* for
`PubkeyAcceptedAlgorithms -sk-*`, which Y4 builds in `Host *` (`IdentityFile none` and a hop block with a fourth keyword stay unbuilt).
Everything else of §S6.2-§S6.7 stands. Q12-Q14 wait for the owner: if an answer differs from the default,
the lead says which of Y3-Y5 changes before the coder starts.

**The order. [C]** Probes first, each in a commit that adds only the probe and is watched on CI (PW2: run by the lead) before the code that
depends on it. Then the RED tests of Y1-Y6. Then the code. A probe that answers against the parent's probe table stops the work and goes to the lead.

**Y0 — The probes (parent §7, the probe table).**
- **PV1. [C]** `ci-extension.yml` runs `npm run itest:bridged-ssh` on `ubuntu-22.04` and `ubuntu-24.04` too, with the same `sshd` install step.
  The harness prints `ssh -V` as its first line. [S] One small matrix job beside `build-test`; legs (i) and (n) run there as on `ubuntu-latest`.
- **PW1. [C]** New `test/bridgedEnvWindows.test.ts`, run by the `runner-windows` job in a step of its own. Off `win32` every case is skipped by
  name. On `win32`, with `spawnSync`, `shell: false`, `windowsHide: true`, and `env` = `bridgedSshEnv(process.env, 'win32')`:

  | # | Scenario | Observation |
  |---|---|---|
  | WN1 | `%SystemRoot%\System32\OpenSSH\ssh.exe -V` | exit 0; stderr starts with `OpenSSH_for_Windows_`; the test prints that line and `process.version` |
  | WN2 | the same with `PROGRAMDATA` taken out of the object | recorded, not asserted: the exit code and both streams are printed |
  | WN3 | `BRIDGE_TEST_SECRET` and `SSH_AUTH_SOCK` set in the test process; the child is `process.execPath -e` printing the names of its environment | neither name is printed, in any letter case; every printed name is in `BRIDGED_ENV_WINDOWS` or `BRIDGED_ENV_RUNTIME_ADDED_WINDOWS`; `USERNAME`, `USERDOMAIN` and `LOGONSERVER` are printed with empty values (Q14); the list is printed, with no values but those three |
  | WN4 | for each of `psql`, `mysql`, `sqlcmd` found on `PATH`: its version flag | exit 0; a client that is not found is a skip named *not measured*, never a pass |
- **PW2.** The lead's M9 driver on the owner's Windows host: legs A1, A2, A4 and C1 of §S6.13 with exactly the seven names of Y1. Its table goes
  into §S6.13 before `BRIDGED_ENV_WINDOWS` changes.
- **PD1. [C]** In `scripts/bridged-mysql-itest.cjs`, a record leg: `mysql_config_editor` writes a login file under the rig home with
  `--login-path=client --host=<marker>`; then `--no-defaults --verbose --help` of each client under that home, with and without
  `MYSQL_TEST_LOGIN_FILE` at a path that does not exist. The leg prints whether the marker stands in each output. [S] If the CI image has no
  `mysql_config_editor`, the leg fails and names the package.
- **PD2. [C]** A record leg (new `scripts/bridged-psql-itest.cjs`, or a leg of the mysql harness: [S]): a fake server that answers a start-up
  message with a request for a clear-text password, records the password message and closes; `psql` under a rig home whose `.pgpass` holds a
  marker for that host and port, with no `PGPASSWORD`, once with no `PGPASSFILE` and once with it at a path that does not exist.
- **PF1.** The control of leg (o) (Y4), on each image of PV1.

**Y1 — The environment asked for. [C]** In `bridgedSshEnv.ts`:

```ts
export const BRIDGED_ENV_WINDOWS = ['PATH', 'SYSTEMROOT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'PROGRAMDATA'] as const;
/** What Node's libuv writes into every Windows child whose block lacks it. This module never writes one: the list is for the tests and the documents. */
export const BRIDGED_ENV_RUNTIME_ADDED_WINDOWS = ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP',
  'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR'] as const;
/** Asked for as empty strings on Windows, so the runtime does not fill them with the account's identity (Q14, PW3). */
export const BRIDGED_ENV_BLANKED_WINDOWS = ['USERNAME', 'USERDOMAIN', 'LOGONSERVER'] as const;
export const BRIDGED_ENV_EXTRA = ['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'CREDS_SSH_PASSWORD', 'DISPLAY',
  'PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER', 'MYSQL_TEST_LOGIN_FILE', 'PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY'] as const;
```

`TMP` and `COMSPEC` go only after PW2 passed; if PW2 fails a leg, the name that leg needs stays and §S6.13 says which run showed it. The module's
doc comment and every comment that says *exactly* say **asked for**: no comment claims what a child receives or what a value holds. That includes the module's doc comment, whose *no … `PGPASSFILE`* is false
under Y6: it says instead that `PGPASSFILE` and `MYSQL_TEST_LOGIN_FILE` are asked for only as paths that never exist. N2 becomes
*the keys are exactly the seven, with the source's values, and the three blanked names, each `''`, whatever the source holds* (the owner's Q14,
2026-11-16). New **N6a**: a `win32` source that lacks `SYSTEMDRIVE` gives an answer with no such key, and a source whose `USERNAME` is set
gives `USERNAME: ''` (the module copies none of the three; the runtime adds `SYSTEMDRIVE` and `WINDIR`). On POSIX the three are never asked for. L9 and Q4 keep their words with *asked for*.

**Y2 — The environment received. [C]** In `scripts/bridged-ssh-itest.cjs`, leg (b) gains two legs:
- **(b) 3:** the control's environment with `BRIDGE_TEST_SECRET` in it, under the **production** file: the remote `printenv` exits 1 with an
  empty stdout. (Until now the production leg showed nothing about `SendEnv`: the marker was not in the child at all.)
- **(b) 4:** `BRIDGE_TEST_SECRET` and `SSH_AUTH_SOCK` set in the harness; `/usr/bin/env` started with the environment and `cwd` that
  `bridgedSpawn` answers, through the production spawner itself (`runBounded`, `sshExecRunner.ts:112`), not `spawnSync` or the harness's
  `launch`: the names it prints are exactly the asked ones. PW1 and WN3 on `windows-latest` call `runBounded` too, so the runner's
  pass-through is observed, not only the request.

**Y3 — The client check and the floor. [C]** New `bridgedSshClient.ts`, pure, no `vscode`:

```ts
export const BRIDGED_SSH_FLOOR = { other: [8, 9], win32: [9, 5] } as const;
export type ClientVerdict = { ok: true; version: string } | { ok: false; sentence: string };
/** Reads what `ssh -V` answered. `ssh` prints its version on stderr. */
export function clientVerdict(exit: number | null, stdout: string, stderr: string, platform: NodeJS.Platform): ClientVerdict;
```

- The version token is `^OpenSSH_(?:for_Windows_)?(\d+)\.(\d+)`, anchored at the start of the first line of **stderr** only (two consultants of
  two, with Q12, approved by the owner 2026-11-16): `ssh -V` prints there, and a word later in a line, or on stdout, is not a version. Major and minor are compared as
  numbers. On `win32` the token must be the `for_Windows_` one.
- `ok: false` with **R12** when the exit is not 0 or there is no token; with **R13** when the version is below the floor or, on `win32`, the
  build is another one.
- **Where. [C]** On the bridged branch of `execOverSsh`, after pass 1's refusals and before any file of the call is written. So a refused
  entry still spends no spawn, and R1-R11 are said before R12 and R13. The spawn is `ssh -V` with the program of `sshSpawnLaunch`, the
  environment `bridgedSshEnv(process.env, process.platform)`, `cwd` at a fresh call folder that holds nothing and is removed afterwards, a 10 s
  timeout that kills the tree. A good verdict is kept for the life of the dependencies object; a bad one is not kept. [S] The seam is a dep,
  `SshUseDeps.bridgedClient`, as `bridgedSshConfig` is; a bridged call with no such dep is refused (R8's road).
- **Tests.** `test/bridgedSshClient.test.ts`:

  | # | Scenario | Observation |
  |---|---|---|
  | CV1 | `OpenSSH_10.2p1 Ubuntu-…, OpenSSL …` on `linux`, exit 0 | ok, `10.2` |
  | CV2 | `OpenSSH_8.9p1` and `OpenSSH_8.8p1` on `linux` | ok; R13 |
  | CV3 | `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2` and `OpenSSH_for_Windows_8.1p1` on `win32` | ok; R13 |
  | CV4 | `OpenSSH_9.9p1` on `win32` | R13 |
  | CV5 | exit 255, both streams empty | R12 with `255` |
  | CV6 | exit 0 and no token; a stderr of 4000 characters | R12; the sentence holds no part of the output |
  | CV7 | `OpenSSH_9.9p1` on stdout only, stderr empty; `banner OpenSSH_9.9p1` on stderr | R12; R12 |

  `test/bridgeLinks.test.ts`: **L15** the stub answers `OpenSSH_8.6p1`: `runs` holds the `-V` spawn alone, the body is
  `BRIDGE_USE_REFUSED`, the journal has R13. **L16** two good calls: one `-V` spawn. **L17** a bad answer then a good one: two `-V` spawns
  and the second call runs. **L18** an entry refused by R5: no `-V` spawn.
- **Itest (q). [C]** The real `ssh -V` through `clientVerdict` on every image: ok, and the version is printed. Two stand-in programs (shell
  scripts in the rig, named to the harness as the program): one prints `OpenSSH_8.6p1`, one exits 255 and prints nothing; the harness counts
  one spawn each and no `ssh`.

**Y4 — No security key. [C]** `Host *` gains `PubkeyAcceptedAlgorithms -sk-*`, straight after the sentinel's `IdentityFile` line. No hop block
and no destination block gains a keyword. **F11:** the line stands once, in `Host *`. **Leg (o):** the harness writes a key file of `ssh-keygen`'s type
`ed25519-sk` (an Ed25519 security key) with the verify-required flag from random bytes, with no token; its public line goes into the hop's
`authorized_keys`; the destination is a pinned password entry and the askpass stub logs each prompt. Control, a hand-written file without the
line: the log holds a prompt that begins `Enter PIN for`. Production: the log is empty, and the hop leg ends `Permission denied`. [S] The
file's layout is the `openssh-key-v1` one (cipher and kdf `none`; the public part is the type, 32 bytes and the application `ssh:`; the private
part adds one flag byte, a key handle and an empty reserved string), written from memory of `PROTOCOL.u2f`: PF1 says whether the CI client
reaches the prompt with it. If it does not, (o) is reported *not measured* in §S6.13 and in the PR, and F11 is all that pins the line.

**Y5 — Three refusals and one sentence. [C]** All in pass 1 (`bridgedSshRefusals.ts`), with `bridgedConfigText` as the second line as today.
- **A hop named `none`.** `bridgedHostWord(host, 'hop')` answers `undefined` for `none` in any letter case; R6 is said. A destination named
  `none` and a hop named `none.example` are not refused.
- **R11, a pin that does not parse.** A leg whose entry has a `hostKey` that is not empty after a trim and for which `parseHostKey` answers
  `undefined` is refused. Order in `refusalOf`: users, hosts, equal hosts, **R11**, hop credentials, R5, paths. So a password destination
  with such a pin hears R11, not R5. An empty `hostKey` is unpinned, as today.
- **A doubled backslash.** A new `unsafeBridgedFileValue(value)` in `bridgedSshConfig.ts` answers true when `unsafeSshConfigValue(value)` does
  or the value holds `\\` or `\'`, and every value the **file** carries passes it: hop key paths (typed or materialised), pin files, the
  sentinel, both known-hosts paths. `unsafeSshConfigValue` itself is unchanged, so `bridgedKeyPathProblem` (`bridgedSshConfig.ts:94-99`),
  which calls it, still lets a destination's typed `-i \\fs\…` path through: that path goes to `-i` on the argv only. A hop's typed key path
  goes into the file, so it meets both checks. *(The lead, 2026-11-15, from the Opus sort: the earlier text put the rule inside
  `unsafeSshConfigValue`, which `bridgedKeyPathProblem` calls, so the two sentences contradicted each other.)* The person's own
  `known_hosts` path is in the file too: a profile folder on a UNC path refuses every bridged call (the parent's cost list says so).
- **R14, the storage folder.** When the path at fault is one this extension made (the keys folder, the call's own key file, a pin file, the
  sentinel, `bridges/known_hosts`), the sentence is R14: for `%` (today R10's *Choose a key file…*) and for every R6 reason. R10 stays for
  a typed path. R6's known-hosts sentence stays for the person's own `known_hosts` path.
- **The sentences (journal only; the agent reads `BRIDGE_USE_REFUSED`).**

  | # | When | Sentence |
  |---|---|---|
  | R6 | a host | …`is not a valid host, is the word "none", or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes.` |
  | R6 | a path | …`is empty, or holds a quote, a control character, "${", two backslashes in a row or a backslash before an apostrophe, or ends with a backslash.` |
  | R11 | a pin that does not parse | `The host key stored for <the host key of "E"> cannot be read as a host key. Through a Remote Bridge a host key that an entry holds must be one ssh can check.` |
  | R12 | no version | `ssh did not answer its version under the environment a Remote Bridge gives it (exit <code>). No call can go through a Remote Bridge from this computer until it does.` |
  | R13 | below the floor, or another build on Windows | `The ssh on this computer answered <token>. A Remote Bridge needs OpenSSH 8.9 or newer, and on Windows the OpenSSH that Windows ships, 9.5 or newer.` |
  | R14 | a path this extension made | `The folder VS Code gives this extension for its files has a path that cannot be given to ssh through a Remote Bridge: it holds "%", two backslashes in a row, or another character a bridge refuses. Stored keys cannot be used through a Remote Bridge from this computer.` |

  `<the host key of "E">` is built by `of(who, 'host key')`. `<token>` is the matched version token and nothing else of the output. R12-R14
  name no entry: they are true of the computer. Each sentence says what was just checked and nothing about what comes next.
- **Tests** (unit, `test/bridgedSshConfig.test.ts` and `test/bridgeLinks.test.ts`; each observes `runs` empty and no file written): a hop
  `none`, `NONE`; a destination `none` runs; a key destination and a hop with `hostKey: 'host ssh-ed25519 AAAA…'` (a `known_hosts` line, the
  likely typed form) and with `'garbage'`: R11, and `bridges/known_hosts` byte for byte as before; a password destination with `'garbage'`:
  R11; a storage folder `\\fs\share\x` on `win32`: R14; a hop key path `C:\keys\\id` and `C:\'k\id`: R6; a destination's typed
  `\\fs\keys\id`: the call runs and `-i` carries it unchanged; a storage folder with `%` and a stored key: R14, and a typed path with `%`: R10.
- **Leg (p). [C]** Against the rig: a chain whose one hop has the host `none`, no user and port 22: zero spawns; the record leg prints
  `ssh -G -J none` and `ssh -G -J u@none`, the first with no `proxyjump` line. A key destination with a pin that does not parse: zero spawns.

**Y6 — What the database clients read. [C]** Only after PD1 and PD2 answered as the parent's probe table expects. `buildDbQueryLaunch` takes
`{ bridged, absentFile }`; on a bridge `mysql` gets `MYSQL_TEST_LOGIN_FILE = absentFile` and `psql` gets `PGPASSFILE = absentFile`, in
`launch.env`. `absentFile` is a path from the sanctioned builder in `materializedKeys.ts`, with a name nothing ever writes, as the sentinel's
is. Off a bridge the launch is byte for byte today's. **Q4a, Q4b:** the keys of the bridged spawn's environment hold the name, and off a bridge
they do not. **Leg (m), added:** PD1's case as an assertion on the production launch's environment: no marker in the output of either client.
**Leg (r):** PD2's fake server: the control sends the marker from `.pgpass`; the production launch sends no password message that holds it.
**Row 9 (the sort, 2026-11-15):** after PD3 answered as expected, `psql` on a bridge also gets `PGSSLCERT` and `PGSSLKEY`, each a path from the
same builder that nothing writes; leg (r) gains PD3's case: the control offers the rig home's `.postgresql` certificate, production none.

**Y7 — Before the merge. [C]** PW2's table and the owner's `%` check (§S6.9) are in §S6.13 and in the PR. The parent's §7 M9 row gets what PW2 gave.

**Mutations, added to §S6.6.**

| # | Mutation | Must fail |
|---|---|---|
| T32 | Drop `PROGRAMDATA` from `BRIDGED_ENV_WINDOWS` | N2; WN1, while that image's client needs it (WN2 records whether it does) |
| T33 | Spread the source in `bridgedSshEnv` | N1, N6a; WN3; (b) 4 |
| T34 | Drop `PubkeyAcceptedAlgorithms -sk-*` | F11; (o), when PF1 showed the prompt |
| T35 | Compare the version as text | CV1 (`10.2` against `8.9`) |
| T36 | Keep a bad verdict | L17 |
| T37 | Run the check before pass 1 | L18 |
| T38 | Read a pin that does not parse as no pin | the R11 cases; (p) |
| T39 | Let a hop named `none` through | the `none` cases; (p) |
| T40 | Drop `MYSQL_TEST_LOGIN_FILE`, then `PGPASSFILE` | Q4a and (m); Q4b and (r) |
| T41 | Copy `USERNAME` from the source instead of `''` (Q14) | N2, N6a; WN3 |
| T42 | Drop the `^` anchor of the version token | CV7 |

**Which owed items land here, and which later.** All seven land here (the FIDO PIN; `.mylogin.cnf`; the backslash pair; a hop named `none`;
a pin that does not parse; older clients; R10 on a storage folder with `%`), with the two the revision found (`~/.pgpass`; the database
clients on Windows, observed by WN4). Later: the supervisor's use of the client check (E2.2a); the lifting of the UNC refusal, a todo with
probe PU1 (E4.3); the two defects off a bridge, on `main` (parent §8).

**Documents.** `research/module_extension.md`: the environment as asked for and as received, the client check, the floor, the new refusals.
`research/module_tests.md`: PW1's step, PV1's job, legs (o)-(r). No CHANGELOG bullet, as §S6.11 says: no door reaches any of it.

**Not verified by this amendment.**
- No login, no `sshd` and no database client was run for it. Run here on 2026-11-15 (OpenSSH 10.2p1, `-G` only): `-J none` and `-J NONE`
  print no `proxyjump`; `u@none`, `none:22` and `a,none` keep it; `PubkeyAcceptedAlgorithms -sk-*` in `Host *` leaves no `sk-` name in the
  list, against four without it.
- That a security key's PIN is asked through askpass, and that a key whose algorithm is not accepted is skipped before it signs: the
  review's reading of `sshconnect2.c` and the writer's memory of it. Leg (o) is the observation.
- How Win32-OpenSSH asks for a security key's PIN. Not looked at; the line removes the question on that build too, by `-G` (X10).
- That an absent `MYSQL_TEST_LOGIN_FILE` or `PGPASSFILE` is passed over silently, and that `psql` uses `.pgpass` when an entry stores no
  password: the clients' documentation, from memory. PD1 and PD2 are the observations.
- The OpenSSH versions of the `ubuntu-22.04` and `ubuntu-24.04` images, and the client and the database clients on `windows-latest`: from
  memory. Each probe prints what it met.
- libuv's list is the one M9 saw under Electron 43.8.6. Another runtime may add other names: WN3 fails then, and the parent's row is
  corrected first.
