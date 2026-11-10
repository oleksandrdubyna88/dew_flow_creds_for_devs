# PLAN — E1.S2 spec: the composer (`remoteLaunch.ts`), the `remote` option, the delivery test, the road scan

> Status: **built 2026-11-10 on feat/terminal-command-over-ssh-e1 (local), promotes with the parent.** Spec text, written by Fable before the code. Written by Fable as the cornerstone spec of story
> E1.S2 of [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) (the parent; §4.2, §4.5, §4.6, §6,
> `## Epics` › E1 › S2). The E1 stories document (`PLAN_terminal_command_over_ssh_E1.md`, Opus) is written in parallel
> and marks the cornerstones; this spec does not wait for it. Where this spec differs from the parent, this spec says
> so in §S2.1 and the parent text is changed by the main session (plan-change control), not by the coder.
>
> Scope: `src_vs_code/src` — new `remoteLaunch.ts` (pure, no `vscode`); `sshCommand.ts` (`buildSshCommand` gains the
> `remote` option; byte-identical output without it); new `test/remoteLaunch.test.ts`, `test/remoteLaunchDelivery.test.ts`,
> `test/launchRoadScan.test.ts`; additions to `test/sshCommand.test.ts`; one paragraph each in `research/module_extension.md`
> and `research/module_tests.md`. **No road file changes in S2**: the roads keep S1's refusal; E2 and E3 switch them to
> `planLaunch`. S1's refusal function moves into `remoteLaunch.ts` (§S2.6) — that is the only edit outside the files named.

Every path is relative to `src_vs_code/src/`. Every `file:line` was opened on commit `e468285` of
`feat/terminal-command-over-ssh`. S1 (`sshEntityId`) had not landed in this worktree when this was written, so S1's
lines are named by role, never by number.

## S2.0 — Facts this spec rests on (verified)

| # | Fact | Consequence |
|---|---|---|
| G1 | `buildSshCommand(entity, platform, options)` (`sshCommand.ts:125-157`) returns `undefined` when `!isSafeSshTarget(entity)` (`:130`), then pushes: program word (`:138-141`), `-i <quoted key>` (`:142-144`), `-p <port>` (`:145-147`), `sshOptionArgv` (`:153`), `hostKeyArgv` (`:154`), the destination (`:155`), and joins with one space (`:156`). | `-t` goes right after the program word (a new push after `:141`); `--`, the destination and the remote word replace `:155` when `remote` is given. Nothing before `:155` moves, so without `remote` the string is byte-identical. |
| G2 | `shellQuote` (`sshCommand.ts:97-102`) double-quotes; on POSIX it escapes `\ " $ \``, on win32 only `"`. It quotes the key path and the known_hosts path. `quotedDestination` (`:197-200`) quotes `user@host` only when needed. | Never used for the remote command (`$` would expand in PowerShell, the parent §3). The remote word is quoted by `quoteFor`. |
| G3 | `quoteFor(family, value)` (`hostShell.ts:117-125`): PowerShell `'…'` with `'` → `''`; posix `'…'` with `'` → `'"'"'`; cmd a plain `"…"`. | The local parse is a single-quoted literal in both pinned families. The posix form puts a `"` into the typed line for every `'` in the remote command — that matters for the PowerShell 5.1 check only in the PowerShell family, where the form is `''` (no `"`). |
| G4 | `hostShell.ts` imports only `./remoteWindow` (`hostShell.ts:1`); `remoteWindow.ts` imports nothing. `sshCommand.ts` imports `./types`, `./entityKind`, `./sshOptions`, `./sshProgram` (`sshCommand.ts:27-30`). `sshOptions.ts:1` already imports `sshCommand` (an existing two-way edge). | `sshCommand.ts` → `hostShell.ts` → `remoteWindow.ts` adds **no cycle**. `remoteLaunch.ts` → `commandLine.ts` (→ `types`, `hostShell`, `commandName`), `sshCommand.ts`, `hostShell.ts`, `entityKind.ts`, `trash.ts`: none of those imports `remoteLaunch.ts`, so no cycle. |
| G5 | `resolveCommand(entry)` (`commandLine.ts:76-83`) returns `empty`, `ready{line, parts}` or `refused{template, reason}`; `commandRoadScan.test.ts:65-69` pins `buildCommandLine(` to `commandLine.ts`. Today `resolveCommand(` is imported by the roads and the viewer (not pinned). | The parent §4.5 (1) wants `resolveCommand(` imported only by `commandLine.ts` and `remoteLaunch.ts` — that is **not true today** and cannot be true in S2 (roads switch in E2/E3). §S2.7 pins an allow-list of today's importers instead, shrinking per epic. |
| G6 | `isSafeSshTarget` (`sshCommand.ts:84-89`): host required, `isSafeSshHost` (`:70-72`: no leading `-`, `[A-Za-z0-9._:\[\]-]`), user optional, `isSafeSshUser` (`:78-80`: `[A-Za-z0-9._\\$-]`, no leading `-`). `isSafeSshUser` **rejects `@`**. | "unsafe host" covers host and user; a user with `@` is refused there. A host starting with `-` is refused there, before any `--` is needed — `--` is defence in depth. |
| G7 | `resolveKind(details)` (`entityKind.ts:83-85`): the stored `kind`, else the flag ladder (`:29-71`: terminal before ssh). `canConnectSsh` (`:139-142`) also admits a `credential` with a host. `isInTrash(node, byId)` (`trash.ts:47-56`) walks `parentId` to a trash folder, bounded. | The link check is `resolveKind(...) === 'ssh'` (D13 says kind `ssh`), narrower than `canConnectSsh` on purpose. A Terminal entry pointing at itself resolves to kind `terminal`, so "not ssh" would fire before "self" — §S2.1 item 3 reorders. |
| G8 | `commandFingerprint(entityId, line)` (`commandTrust.ts:38-40`) hashes id, a space, the line. `confirmTrusted(store, id, name, line, message?)` (`trustPrompt.ts:12-30`) keys on exactly that. | The trust line is the `line` argument; the Terminal entry's id is the id. No new storage. |
| G9 | `buildSshExecArgv` (`sshExecCommand.ts:94-141`) pushes `--`, the destination, then the remote command as one argv element (`:135-139`). | The agent and Run with Secrets roads (E3) already have a one-element remote argument. S2's `secretsStdin` is what E3 feeds it; `typedLine` is the terminal roads' mirror of it. |
| G10 | `openSshTerminal` (`terminalManager.ts:20-50`) sends `` `${prefix}${command}` `` (`:48`); the relay prefix is `env SSH_AUTH_SOCK='<path>' ` (`wslRelay.ts:96-99`); the password branch rewrites `^ssh ` to `ssh -o StrictHostKeyChecking=accept-new ` (`sshConnect.ts:325-328`); `hostShell(platform, exists, hasPwsh)` (`hostShell.ts:101-106`) names `pwsh.exe` or `powershell.exe`. | `typedLine` = `prefix + buildSshCommand(...)`, with the accept-new rewrite kept as a regex on the program word that still matches with `-t` after it (`ssh -t …` → `ssh -o StrictHostKeyChecking=accept-new -t …`). The 5.1 check reads the pinned shell path's basename. |
| G11 | Real shells measured on this machine (2026-11-10, `dash` 0.5.x and `bash`, `SHELL` set to a marker script): the parent's wrapper `<line>; s=$?; …` **loses the stay-open for a line ending in `# note`** (the comment swallows the rest) and **is a syntax error for a line ending in `&`** (`;` after `&`). An `eval '<line>'` form handles both, and holds no `"`. | §S2.4 wrapper text is the `eval` form. The parent §4.2 line 116 must be changed (§S2.1 item 1). |
| G12 | `test/commandNameShell.test.ts:24-34` is the house shape for a real-shell test: `has(program, args)` probe, a `{ skip: '<reason>' }` string, `ownedDir(t, …)` from `scripts/lib/leftovers.cjs`, a 20 s timeout per shell. `testing.md` § "A runner bounds…": a shim on `PATH` must never resolve to itself. | The delivery test copies this shape; the fake `ssh` is a `#!/bin/sh` script that calls nothing named `ssh`. |
| G13 | ESLint: complexity ≤ 4, ≤ 50 lines per function (120 in tests), ≤ 800 lines per file (`eslint.config.*:30-32,58-60`). | `sshLinkOf` is a chain of small refusal functions, like `refuseHop`/`refuseWalk` in `sshOptions.ts:126-157`. |

## S2.1 — The parent's choices, judged (what this spec changes, and why)

1. **The stay-open wrapper is the `eval` form, not the parent's `<line>; s=$?; …` form.** Measured (G11): a trailing
   comment removes the stay-open and the exit message silently; a trailing `&` makes the whole remote command a syntax
   error, so nothing runs. `eval '<line>'` (the line single-quoted with `'` → `'\''`) parses the person's text as one
   script, so a comment ends at the end of that script and `&` is followed by nothing. `eval` under `$SHELL -c` parses the
   text the way a non-interactive shell would parse the typed line: same expansions, same quoting, no aliases, no
   history — the same as the parent's form. The wrapper uses `'\''` (not `quoteFor`'s `'"'"'`) and unquoted `$s` and
   `${SHELL:-sh}`, so the wrapper itself holds **no `"`**; otherwise every stay-open launch would hit the PowerShell 5.1
   refusal (§4.6) on a Windows machine without pwsh. The parent's §4.2 line 116 and §6 row "stay-open wrapper text"
   must say the new text. **Parent change, owed by the main session.**
2. **`LaunchPlan.remote` carries no `trustLine`.** The parent's diagram (§4, line 90) puts `trustLine` inside the plan,
   but §4.4 "one snapshot" says the trust line is built from the SSH entry **as prepared** (after `prepareSshSession`),
   and `planLaunch` runs before prepare (the link decides whether to prepare at all). Two trust texts from two reads
   would be the defect §4.4 forbids. So `planLaunch` gives `line` and `remoteCommand`; the road calls
   `trustLineFor(prepared.entity, prepared.jump, plan.line)` from the snapshot. The folder modal (E2.S2) shows the trust
   line before prepare from its own `resolveJumpChain` read — a display, not the approval key. **Parent diagram
   change, owed.**
3. **The self check is the first check after `none`, by id, with no lookup.** The brief's order (none, missing, trashed,
   not ssh, unsafe host, self) makes "self" unreachable: a Terminal entry's kind is `terminal` (G7), so "not ssh" fires
   first and the self sentence is never shown. `entry.sshEntityId === entry.id` is a pure comparison and is checked
   second. The form scrub (S1) prevents self on save; this check is for synced or imported data.
4. **The PowerShell 5.1 refusal covers `"` and a trailing `\`.** Windows PowerShell 5.1 wraps a native argument that
   holds a space in `"…"` and does not escape an inner `"`; a trailing `\` then escapes its own closing quote, so the
   argument runs into the next ones. Both are known-wrong parses; a known-wrong parse is refused, not hand-checked.
   Risk 2 ("other cases are a hand check") stays for anything else.
5. **The `remote` option's quoting family comes from `platform`, like every other argument of `buildSshCommand`**
   (`sshCommand.ts:58-59`: "the arguments are still parsed by the shell, so they are still quoted for `platform`"):
   `win32` → `'powershell'`, else `'posix'`. A pinned terminal is never cmd (`PinnedFamily`, `hostShell.ts:85`). The WSL
   relay route (`platform` = the Linux side, `program` = the Windows client) therefore quotes posix, which is right: bash
   parses the line there.
6. **`resolveCommand(` has more than two importers today (G5)**; S2's scan pins today's importers by file and shrinks
   the list in E2/E3 (§S2.7) instead of asserting a count that is false on the day it is written.
7. **Upheld unchanged:** the trust line text and its exclusions (no `-i`, no known_hosts, no program word, no prefix);
   the serialization contract (one remote argument, local quoting only for delivery); the newline/CR/NUL refusal; the
   Windows-remote refusal (D9); `secretsStdin`'s `{ … } </dev/null` group and `exit $?`; the supported remote shells.

## S2.2 — Types and signatures

```ts
// remoteLaunch.ts — pure: imports types, commandLine, sshCommand, hostShell, entityKind, trash. No `vscode`.

/** What the composer reads of a Terminal entry. `id` for the self check; `terminalOs` for D9. */
export type LaunchEntry = Pick<EntityMetadata, 'id' | 'name' | 'command' | 'commandArgs' | 'terminalOs' | 'sshEntityId'>;

/** The vault as the composer may see it: one node by id. The same shape `isInTrash` takes. */
export type NodeLookup = (id: string) => TreeNode | undefined;

export type SshLink =
  | { readonly kind: 'none' }
  | { readonly kind: 'linked'; readonly ssh: EntityMetadata; readonly sshName: string }   // `ssh` is node.details, `sshName` is node.name
  | { readonly kind: 'refused'; readonly reason: string };

/** §S2.3 rows L1–L7, in that order. Never throws; a lookup that throws is the caller's bug, not caught here. */
export function sshLinkOf(entry: LaunchEntry, lookup: NodeLookup): SshLink;

export type LaunchPlan =
  | { readonly kind: 'empty' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'local'; readonly line: string }
  | {
      readonly kind: 'remote';
      readonly ssh: EntityMetadata;      // the link's entity AS READ HERE — the road replaces it by the prepared snapshot
      readonly sshName: string;
      readonly line: string;             // the person's line, `{name}` filled — what the trust line quotes
      readonly remoteCommand: string;    // the ONE remote argument: the bare line, or the stay-open wrapper
    };

export interface PlanOptions {
  /** Interactive roads (arrow, folder run, VPN launcher) pass true; the chain step, Run with Secrets and the agent pass false. */
  readonly stayOpen: boolean;
}

/** §S2.3 rows P1–P6. */
export function planLaunch(entry: LaunchEntry, link: SshLink, options: PlanOptions): LaunchPlan;

/** `<line>` wrapped so a failed command is said and the login shell follows. Exported for the test; the text is §S2.4. */
export function stayOpenWrapper(line: string): string;

/** The canonical approval text (§S2.4). `jump` is the resolved `-J` value or undefined. Posix quoting always, so one OS-independent text. */
export function trustLineFor(ssh: EntityMetadata, jump: string | undefined, line: string): string;

/** What `typedLine` needs of S3's `PreparedSsh.ready`. A structural type: S3's `ready` must satisfy it, S2 does not import S3. */
export interface PreparedForTyping {
  // Lead amendment 2026-11-10: named as S3's ReadySsh names them, so `ready` is assignable with no adapter (S3 §S3.13 A2).
  readonly entity: EntityMetadata;                // the snapshot with `sshKeyPath` set to the materialised file or cleared
  readonly options: SshCommandOptions;            // jump, knownHostsFile, program — as `connectionOptions` resolved them
  readonly platform: NodeJS.Platform;             // `terminalPlatform(side, hostPlatform)`, the shell that parses the line
  readonly prefix: string | undefined;            // the relay prefix, or undefined on every other route
  readonly acceptNew: boolean;                    // the password branch without a pin (sshConnect.ts:325-328)
}

export type TypedLine =
  | { readonly kind: 'typed'; readonly line: string }
  | { readonly kind: 'refused'; readonly reason: string };

/** The line a terminal receives: §S2.3 row T1 (PowerShell 5.1), then `prefix + buildSshCommand(ssh, platform, { ...options, remote })`. */
export function typedLine(plan: Extract<LaunchPlan, { kind: 'remote' }>, prepared: PreparedForTyping, localShell: HostShell): TypedLine;

/** The script the remote login shell's `"${SHELL:-sh}" -s` (epoch 2, E1 §S4 F3) reads on stdin for Run with Secrets (§S2.4). Throws `Error` for a name that is not `^[A-Za-z_][A-Za-z0-9_]*$`. */
export function secretsStdin(env: Readonly<Record<string, string>>, line: string): string;
```

```ts
// sshCommand.ts — one option, one import
import { quoteFor } from './hostShell';                           // G4: no cycle

export interface SshCommandOptions {
  // … the existing four fields unchanged …
  /**
   * A command to run on the remote, as ONE argument. The line then ends `-- <destination> '<command>'`, and `-t` follows
   * the program word when `tty` is true. Without this field the output is byte-identical to before the field existed.
   */
  remote?: { readonly command: string; readonly tty: boolean };
}

export function buildSshCommand(entity, platform = process.platform, options = {}): string | undefined
// returns undefined additionally when `options.remote !== undefined && options.remote.command.length === 0`
```

Exact edit of `buildSshCommand` (G1): after `:141` push `-t` when `options.remote?.tty === true`; replace `:155` by:
`parts.push(...destinationArgv(entity.user ? \`${entity.user}@${host}\` : host, platform, options.remote));` where
`destinationArgv` returns `[quotedDestination(d, platform)]` without `remote`, and `['--', quotedDestination(d, platform),
quoteFor(platform === 'win32' ? 'powershell' : 'posix', remote.command)]` with it. One new private function keeps
`buildSshCommand` inside the complexity limit (G13). The header comment of the file gains three lines on the remote
word: quoted for the LOCAL parse only; the remote shell parses the content (parent §4.2 "serialization contract").

## S2.3 — The decision table (in check order)

Names in sentences: `<entry>` is `entry.name`, `<ssh>` is the linked node's `name`. Sentences are exact; a test compares
them whole.

**`sshLinkOf(entry, lookup)`**

| # | Check | Input | Output |
|---|---|---|---|
| L1 | none | `sshEntityId` undefined or `''` | `{ kind: 'none' }` |
| L2 | self | `sshEntityId === entry.id` | refused: `"<entry>" is set to run over itself. Edit it and choose an SSH connection, or set "Runs over SSH" to "Do not use".` |
| L3 | missing | `lookup(id)` is `undefined`, or `node.type !== 'entity'`, or `node.details` is `undefined` | refused: `"<entry>" runs over an SSH connection that is no longer in this vault. Edit it and choose an SSH connection, or set "Runs over SSH" to "Do not use".` |
| L4 | trashed | `isInTrash(node, lookup)` | refused: `"<entry>" runs over the SSH connection "<ssh>", which is in the Trash. Restore it first.` |
| L5 | not ssh | `resolveKind(node.details) !== 'ssh'` | refused: `"<entry>" runs over "<ssh>", which is not an SSH connection entry. Edit it and choose an SSH connection.` |
| L6 | unsafe host | `!isSafeSshTarget(node.details)` (host missing or unsafe, or user unsafe — G6) | refused: `"<entry>" runs over the SSH connection "<ssh>", whose address is not a valid host and user.` |
| L7 | linked | everything above passed | `{ kind: 'linked', ssh: node.details, sshName: node.name }` |

**`planLaunch(entry, link, { stayOpen })`**

| # | Check | Input | Output |
|---|---|---|---|
| P1 | nothing to run | `resolveCommand(entry).kind === 'empty'` | `{ kind: 'empty' }` (checked first: an empty entry runs nowhere, linked or not) |
| P2 | the line's own refusal | `resolveCommand(entry).kind === 'refused'` | refused with `resolveCommand`'s `reason` (the `{name}` refusal), unchanged |
| P3 | link refused | `link.kind === 'refused'` | refused with `link.reason` |
| P4 | no link | `link.kind === 'none'` | `{ kind: 'local', line }` |
| P5 | Windows remote (D9) | `link.kind === 'linked'` and `asOsName(entry.terminalOs) === 'windows'` | refused: `"<entry>" is written for Windows and is set to run over SSH. A Windows remote is not supported yet. Change "Runs on" to Linux or macOS, or set "Runs over SSH" to "Do not use".` |
| P6 | newline, CR or NUL | `/[\n\r\0]/.test(line)` | refused: `"<entry>" has a line break in its command, which cannot be sent over SSH as one command. Put the steps on one line, joined with ";" or "&&".` |
| P7 | remote | else | `{ kind: 'remote', ssh, sshName, line, remoteCommand: stayOpen ? stayOpenWrapper(line) : line }` |

**`typedLine(plan, prepared, localShell)`**

| # | Check | Input | Output |
|---|---|---|---|
| T1 | PowerShell 5.1 | `localShell.shellPath`'s lower-cased basename (either separator) is `powershell.exe` or `powershell`, and `plan.remoteCommand` holds `"` or ends with `\` | refused: `This terminal is Windows PowerShell 5.1, which cannot pass a double quote or a trailing backslash to ssh correctly. Install PowerShell 7 (pwsh) and run "<entry>" again.` (`<entry>` is not in the plan; `typedLine` takes it from `plan.line`? No — add `entryName: string` to the remote plan: `{ …, entryName }`. Correction applied in §S2.2 by the coder: the remote plan carries `entryName`.) |
| T2 | no target | `buildSshCommand` returns `undefined` (cannot happen after L6 and the one-snapshot rule, kept as a belt) | refused: `"<ssh>" has no host configured — cannot start SSH.` (the text of `terminalManager.ts:30`) |
| T3 | typed | else | `(prefix ?? '') + command`, where `command` is `buildSshCommand(prepared.entity, prepared.platform, { ...prepared.options, remote: { command: plan.remoteCommand, tty: true } })`, and when `prepared.acceptNew` the program word is followed by ` -o StrictHostKeyChecking=accept-new` exactly as `sshConnect.ts:325-328` does (a regex on `^(\S+) ` so a quoted program word with no space still works — if the program word can hold a space, the coder reports it; today `openSshProgram` returns a path or `ssh`) |

`tty` is `true` on every terminal road: the chain step also types into a terminal. The `tty: false` form exists for the
option's honesty and is pinned by one `sshCommand.test.ts` case; E3's roads use `buildSshExecArgv`, not this builder.

## S2.4 — Exact texts

**Stay-open wrapper** — `stayOpenWrapper(line)` returns, with `L` = `line` where every `'` became `'\''`:

```
eval 'L'; s=$?; test $s -eq 0 || printf 'creds: the command ended with exit code %s\n' $s >&2; exec ${SHELL:-sh} -l
```

One line, no `"` anywhere unless the person's line holds one. Measured (G11) under `dash -c` and `bash -c`: `echo ok # a
note` prints `ok` and starts the login shell; `echo a &` prints `a` and starts it; `false` prints the sentence with `1`
and starts it; `exit 3` ends with 3 and no login shell (eval of `exit` exits — accepted, the same as the parent's form);
an unclosed quote is a syntax error reported by `eval`, then the login shell starts — in bash; in dash the syntax error of the special builtin `eval` ends the shell after the message (measured 2026-11-10 by the coder and the lead; `command eval` would fix dash and break zsh, so plain `eval` stays — lead note).

**Trust line** — `trustLineFor(ssh, jump, line)`:

```
ssh[ -p <port>][ -J <jump>][ -A][ -L …][ -R …][ -D …] -- <user@host|host> <quoteFor('posix', line)>
(epoch 2, E1 §S4 F1: `-A` and every enabled forward, as `sshOptionArgv` composes them)
```

`-p` only when `ssh.port !== undefined && ssh.port !== DEFAULT_SSH_PORT`; `-J` only when `jump` is a non-empty string;
the destination exactly as `buildSshCommand` spells it, unquoted (the trust text is a key, not a typed line). Never `-t`,
never `-i`, never `-o`, never a program word, never a prefix. Posix quoting on every OS, so the same entry gives the same
text on Windows and Linux. The approval key is `commandFingerprint(terminalEntry.id, trustLine)` (G8). Linking an entry
that was trusted locally therefore asks once more — the text changed, as D6 wants.

**Secrets script** — `secretsStdin(env, line)` returns these lines joined by `\n`, with a final `\n`:

```
NAME_1=<quoteFor('posix', value_1)>; export NAME_1
…
{
<line>

} </dev/null
exit $?
```

The blank line after `<line>` is deliberate: a line ending in `\` continues onto the blank line, not onto `}`. Measured
(2026-11-10, `dash -s` and `bash -s`): a value holding `' " $HOME \`id\` \` and a newline comes back byte-equal through
`printf %s "$CREDS_REF_1"`; `cat; echo after-cat` reads end-of-input at once (the group's stdin is `/dev/null`) and the
rest of the group still runs; `echo x # comment` runs; `echo tail \` prints `tail`; `exit 7` and `false` give 7 and 1.
Names are `CREDS_REF_<n>` from `runPlan.ts:25`; any other name must still match `^[A-Za-z_][A-Za-z0-9_]*$` or the
function throws (a name is never quoted; a bad one would be an injection).

## S2.5 — `buildSshCommand`: what stays byte-identical

A test (§S2.9, C1) builds, for each of the twelve existing `sshCommand.test.ts` fixtures and the four option shapes
(none; key; port+jump+forward; known_hosts), the line with `options` and with `{ ...options, remote: undefined }` and
asserts `===`. The existing 25 tests of the file stay as they are; the new ones are appended under a header comment that
names this spec.

## S2.6 — The hand-over from S1: one road, in steps

S1 ships a small pure function that refuses a linked entry on every road (its name is S1's; call it *the S1 refusal*
here). It reads `.sshEntityId` and answers a sentence or `undefined`. S2 makes it part of the one road without touching
the road files:

1. The S1 refusal **moves into `remoteLaunch.ts`** with its name and signature unchanged; its old file re-exports nothing
   — the six road files change only their import path (one line each). Its body becomes:
   `sshLinkOf(entry, () => undefined).kind === 'none' ? undefined : <S1's sentence>` — i.e. it answers through
   `sshLinkOf`'s L1, so "is this entry linked" has one reader. The sentence stays S1's exact text (S1's tests keep
   passing).
2. In E2 and E3 each road replaces its call of the S1 refusal by `sshLinkOf` + `planLaunch` (+ `prepareSshSession`,
   `trustLineFor`, `typedLine`). When the last caller is gone, the S1 refusal is deleted and the scan's count of its
   callers (§S2.7 scan 4) reaches zero — the scan then pins zero.
3. (Lead note, 2026-11-10: S1 as written has 11 calls in 8 files — Copy Command and the viewer call it too; the coder takes the exact list from `PLAN_terminal_command_over_ssh_E1.md` §S1.3, last paragraph, not the count of six below.) The road scan's allow-lists (§S2.7) hold today's six S1 call sites and today's send/spawn lines by exact trimmed text,
   each with a `because`. An E2/E3 story that switches a road edits the allow-list in the same commit, and the stale-entry
   check makes it do so.

## S2.7 — `test/launchRoadScan.test.ts` — the structural test

Copy `commandRoadScan.test.ts`'s machinery (`sourceFiles`, `sitesIn` over the whole text, `Site` with `within`, the
`where` formatter, the allow-list keyed by file and exact trimmed line, the stale-entry test, the self-check). Four scans:

1. **`resolveCommand(` importers.** Pattern `/import\s*\{[^}]*\bresolveCommand\b[^}]*\}\s*from/g`. Allowed files: the exact
   list the coder finds at `e468285` plus S1 (grep `resolveCommand` across `src`, excluding `test/`), plus `remoteLaunch.ts`.
   The list is written as a sorted array and compared with `deepEqual`, so a new importer and a vanished one both fail.
   E2/E3 remove road files from it; the target state (parent §4.5 (1)) is `['commandLine.ts', 'remoteLaunch.ts']` plus
   the display-only readers (`entityViewPage`, copy, the folder modal) — Opus decides those per story.
2. **`.sshEntityId` readers.** Patterns like `READS` of `commandRoadScan.test.ts:20` with `sshEntityId`. Allowed: S1's
   plumbing lines (type guard, scrub, form select, post literal, share strip, export strip, quarantine remap, viewer row,
   the deny-list, `collectSshCandidates`), the S1 refusal's one read inside `remoteLaunch.ts`, and `sshLinkOf`'s read.
   Nothing in a road file reads it directly — a road asks `sshLinkOf`.
3. **Send and spawn sites in the road files.** Files: `commands/runCommands.ts`, `commands/folderRunCommand.ts`,
   `folderRun.ts`, `dependencyRun.ts`, `dependencyRunHost.ts`, `vpnLauncherRun.ts`, `agentUseActions.ts`, `terminalGuard.ts`,
   `pinnedTerminal.ts`, `maskedTerminal.ts`. Patterns: `/\.sendText\s*\(/g`, `/\bsendGuarded\s*\(/g`, `/\btypeIntoNew\s*\(/g`,
   `/\btypeAll\s*\(/g`, `/\brunMasked\s*\(/g`, `/\bcapturedRun\s*\(/g`, `/\bchildProcess\.spawn\s*\(/g`. Today's sites, by
   exact trimmed line (verified at `e468285`): `commands/runCommands.ts:143,235,267`, `commands/folderRunCommand.ts:163,197`,
   `dependencyRunHost.ts:288`, `terminalGuard.ts:44,74`, `vpnLauncherRun.ts:122`, `pinnedTerminal.ts:88`,
   `maskedTerminal.ts:158`, `agentUseActions.ts:225`. Each gets a `because` naming the road and the E2/E3 story that will
   change it.
4. **The S1 refusal's callers.** Pattern `/\b<S1 name>\s*\(/g`; expected: the declaration in `remoteLaunch.ts` plus the six
   road call sites, as `file:within` pairs like `commandRoadScan.test.ts:109-116`.
5. **Self-check.** The import scan finds `remoteLaunch.ts`; the read scan finds `sshLinkOf`'s line; the send scan finds
   `terminalGuard.ts:74`; a literal split over three lines is found once by each pattern (as `commandRoadScan.test.ts:124-126`).

The research line: `research/module_tests.md` gets one table row beside `commandRoadScan.test.ts` (`:1257`), and
`research/module_extension.md` one paragraph naming `remoteLaunch.ts` as the one road from entry + link to a launch, held
by this scan.

## S2.8 — `test/remoteLaunchDelivery.test.ts` — the delivery through real shells

Shape of `commandNameShell.test.ts` (G12). Constants: `SHELL_TIMEOUT_MS = 20_000`; a corpus `CORPUS` of remote commands:

```
echo hi; echo there            a && b | c                  printf '%s|' a\ b "c;d" '$(x)' && echo; echo "$HOME"
`id`                           back\slash\                 100% !bang *glob
tab<TAB>here                   ünïcode €                   it's 'quoted' "and" $(sub)
--                             -oProxyCommand=id           trail # comment
echo a &                       x'                          '"'"'
```

**The fake `ssh`.** `ownedDir(t, 'ssh')` gets an executable file `ssh` (`#!/bin/sh`, `printf '%s\0' "$@" > "$FAKE_SSH_OUT"`),
mode 0o755. It calls nothing (G12). `PATH` for the child is `<dir> + path.delimiter + process.env.PATH`;
`FAKE_SSH_OUT` is a file in the same dir. Measured 2026-11-10 with this exact fake through `bash -c`: all 13 corpus
items of a first draft came back as one element, byte-equal (`mismatches: 0`).

**Typed line → argv.** For each `c` in `CORPUS`: `line = buildSshCommand(E, platform, { program: 'ssh', remote: { command: c, tty: true } })`
with `E = { id:'s', name:'srv', host:'host', user:'deploy', port: 2222, isSshEnabled: true }`. Then:

- `bash -c <line>` (one argv element; `platform: 'linux'`). Skip only on Windows without bash (`NO_BASH`, as
  `commandNameShell.test.ts:34`).
- `pwsh -NoProfile -NonInteractive -Command <line>` (`platform: 'win32'`, so the PowerShell family quotes). Skip with
  `'no pwsh on this machine'` when `has('pwsh', ['-NoProfile', '-Command', '1'])` is false — pwsh is not installed here,
  so this prints its skip reason locally and runs on a machine that has it. What a pwsh run on Linux proves: PowerShell's
  parse of the single-quoted literal and that `--` reaches a native program. What it does not prove: Windows' native
  command-line re-quoting (hand check 1 of the parent §10).

Assert: `argv[0] === '-t'`; the index of `'--'` exists; `argv[i+1] === 'deploy@host'`; `argv.slice(i+2)` deep-equals `[c]`.
One assertion per corpus item with the item in the message.

**Emulated remote parse.** For `sh` in `['dash', 'bash', 'zsh']` (each probed with `has(sh, ['-c', 'true'])`; dash and bash
exist on this machine, zsh does not and prints `'no zsh on this machine'`): for each `c` of the runnable subset of the
corpus (the items that are commands, not the bare `--`, `x'`, etc. — a second list `RUNNABLE` with expected outputs),
`spawnSync(sh, ['-c', element])` where `element` is what the fake received, equals `spawnSync(sh, ['-c', c])` in stdout,
stderr and status. Then the wrapper: `spawnSync(sh, ['-c', stayOpenWrapper(c)], { env: { ...process.env, SHELL: marker } })`
where `marker` is an owned `#!/bin/sh` script printing `LOGIN-SHELL`; stdout ends with `LOGIN-SHELL\n` for `echo ok # a note`
and `echo a &`; stderr is `creds: the command ended with exit code 1\n` for `false`; status is 3 and no `LOGIN-SHELL` for
`exit 3`.

**Secrets script.** `spawnSync(sh, ['-s'], { input: secretsStdin(env, c) })` for `sh` in dash, bash: the cases of §S2.4
(value round trip through `printf %s "$CREDS_REF_1"`, `cat; echo after-cat`, the comment, the trailing `\`, `exit 7`,
`false`), status and stdout asserted exactly.

## S2.9 — Scenarios, RED first (test name → assertion)

Every test is written and run before its production code exists; the coder reports the first failure message (an import
error or `undefined is not a function` is the RED of a new module) and the pass. Names state the guarantee.

`test/remoteLaunch.test.ts`

| # | Test | Assertion |
|---|---|---|
| R1 | `no_link_is_none_and_an_empty_id_is_none` | L1 for `undefined` and `''`; `lookup` is never called (a counting fake). |
| R2 | `a_link_to_itself_is_refused_before_any_lookup` | L2 sentence; `lookup` call count 0. |
| R3 | `a_missing_or_folder_or_detail_less_node_is_refused_as_missing` | L3 sentence for `undefined`, `type: 'folder'`, `details: undefined`. |
| R4 | `a_trashed_ssh_entry_is_refused_naming_it` | A node under a trash folder two levels deep (`isTrash: true` on the grandparent): L4 sentence with `<ssh>`. |
| R5 | `a_non_ssh_entry_is_refused` | Kinds `terminal`, `credential` with host (what `canConnectSsh` would admit), `vpn`: L5 sentence. Fixture includes a legacy record with no `kind` and `isSshEnabled: true` → linked (the ladder). |
| R6 | `an_unsafe_host_or_user_is_refused` | host `-oProxyCommand=id`, host `a.com;id`, user `a@b`, missing host: L6 sentence. |
| R7 | `a_good_link_carries_the_node_details_and_name` | L7: `ssh` is the node's `details` object, `sshName` the node's `name`. |
| R8 | `the_candidate_predicate_and_the_link_agree` | Over one fixture vault (ssh ok, ssh trashed, ssh no host, terminal, self, credential-with-host): every node `collectSshCandidates` (S1) offers is `linked`; every node it does not offer is `refused` or self. Skipped with a printed reason only if S1 has not landed in the same branch — it must have (D8). |
| R9 | `an_empty_entry_is_empty_whatever_the_link` | P1 with `none`, `linked`, `refused` links. |
| R10 | `the_name_refusal_wins_over_a_link_refusal` | P2: an entry with `{name}` and a refusing name, and a refused link: the reason is `resolveCommand`'s. |
| R11 | `a_refused_link_refuses_the_plan` | P3 reason equals the link's. |
| R12 | `no_link_is_a_local_plan_with_the_resolved_line` | P4: `line` equals `resolveCommand(entry).line` (`{name}` filled). |
| R13 | `a_windows_remote_is_refused` | P5 sentence for `terminalOs: 'windows'`; `linux`, `macos`, `undefined`, `''` pass. |
| R14 | `a_line_break_is_refused` | P6 for `\n`, `\r`, `\0` placed in `command` and in an `args` row. |
| R15 | `stay_open_wraps_and_the_others_do_not` | P7: `stayOpen: true` → `remoteCommand === stayOpenWrapper(line)`; `false` → `=== line`. |
| R16 | `the_wrapper_text_is_exact_and_holds_no_double_quote` | `stayOpenWrapper("echo it's")` equals the §S2.4 string with `'\''`; `includes('"')` is false; for a line with `"` it holds exactly the line's. |
| R17 | `the_trust_line_is_canonical` | `ssh -p 2222 -J j@b:2200,k@c -- deploy@host 'echo hi'`; port 22 drops `-p`; `jump: undefined` and `''` drop `-J`; no user drops `user@`. |
| R18 | `the_trust_line_changes_with_host_user_port_and_jump_and_not_with_key_or_pin` | Four changed inputs → four different texts; `sshKeyPath` and `knownHostsFile` are not inputs at all; the text holds no `-i`, no `-o`, no `/`. |
| R19 | `the_trust_line_quotes_posix_on_win32_too` | `trustLineFor` has no platform parameter; the text with `'` in the line holds `'"'"'`. |
| R20 | `typedLine_refuses_powershell_5_1_for_a_double_quote_or_a_trailing_backslash` | T1 for `shellPath: 'powershell.exe'`, `C:\\…\\powershell.exe`, `powershell`; with `pwsh.exe` and with `/bin/bash` the same plan is typed. A remote command without `"` and not ending in `\` is typed under 5.1. |
| R21 | `typedLine_is_prefix_then_the_builder_with_t_and_the_remote_word` | `prefix: "env SSH_AUTH_SOCK='/s' "`, posix: `env SSH_AUTH_SOCK='/s' ssh -t -p 2222 -- deploy@host 'echo hi'`; `acceptNew: true` → `ssh -o StrictHostKeyChecking=accept-new -t …`. |
| R22 | `typedLine_reads_the_snapshot_not_the_plan` | `plan.ssh.host = 'a'`, `prepared.entity.host = 'b'`: the typed line names `b`. |
| R23 | `secretsStdin_is_exact` | The §S2.4 text for two variables and `echo x`; a value with `'` is `'"'"'`-quoted; the blank line is present; a bad name throws. |
| R24 | `the_s1_refusal_answers_through_sshLinkOf` | After the move: S1's function for a linked entry returns S1's sentence, for an unlinked one `undefined`; it is exported from `remoteLaunch.ts`. |

`test/sshCommand.test.ts` additions

| # | Test | Assertion |
|---|---|---|
| C1 | `without_remote_the_line_is_byte_identical` | §S2.5. |
| C2 | `with_remote_the_order_is_program_t_options_dashdash_destination_word` | posix: `ssh -t -i "/k" -p 2222 -J j@b -o StrictHostKeyChecking=yes -o UserKnownHostsFile="/kh" -- deploy@host 'echo hi'`. |
| C3 | `tty_false_omits_t_and_keeps_dashdash` | `ssh -p 2222 -- deploy@host 'echo hi'`. |
| C4 | `the_remote_word_is_quoted_for_the_family_of_platform` | linux: `'it'"'"'s $(x) \`y\` \\'`; win32: `'it''s $(x) \`y\` \\'` (no `"` added, `$` and backtick untouched). |
| C5 | `an_empty_remote_command_is_undefined` | `remote: { command: '', tty: true }` → `undefined`. |
| C6 | `an_unsafe_target_is_still_undefined_with_remote` | host `-x` → `undefined` (G6 before `--`). |

`test/launchRoadScan.test.ts`: §S2.7 scans 1–5, one test each, plus `the_allow_list_has_no_stale_entry`.

`test/remoteLaunchDelivery.test.ts`: §S2.8 — `bash_delivers_one_remote_element_byte_equal`, `pwsh_delivers_one_remote_element_byte_equal`
(skip reason printed), `dash_bash_zsh_parse_the_element_as_the_line` (per shell, skip reason printed for zsh),
`the_wrapper_keeps_the_login_shell_after_a_comment_and_an_ampersand`, `the_wrapper_says_a_non_zero_exit`,
`the_secrets_script_runs_under_sh_s_with_a_stdin_reading_command`.

## S2.10 — Break-its (inputs that try to escape; each is a corpus item or a test case)

| # | Input | Where it is stopped | Red case |
|---|---|---|---|
| B1 | line `'` and `x'` | posix `quoteFor` → `'"'"'`; PowerShell `''` | delivery (bash, pwsh), C4 |
| B2 | line `'"'"'` (someone pre-quoted) | the same; arrives byte-equal and is the remote's problem | delivery |
| B3 | `$(id)`, `` `id` ``, `$HOME` | a single-quoted literal in both families; the remote parses them (D14) | delivery, C4 |
| B4 | `\` and `back\slash\` | literal in single quotes; a trailing `\` under PowerShell 5.1 is T1 | delivery, R20 |
| B5 | remote command `--` or `-oProxyCommand=id` | after `--` ssh reads it as the command, not an option | delivery (`argv[i+2] === '--'`) |
| B6 | host `-oProxyCommand=id`, host `-x` | L6 via `isSafeSshHost` (`:71`), and `--` as a belt | R6, C6 |
| B7 | user `a@b` | L6 via `isSafeSshUser` (`:79`, no `@`) | R6 |
| B8 | user `CORP\alice`, user `a$b` | admitted (G6); destination quoted by `quotedDestination` on posix | existing `sshCommand.test.ts:162-180`; C2 with such a user |
| B9 | line with `\n`, `\r`, `\0` | P6 | R14 |
| B10 | line ending `# note`, line ending `&` | the `eval` wrapper | delivery wrapper cases |
| B11 | value in `secretsStdin` with `'`, `"`, `$`, backtick, `\`, newline | `quoteFor('posix')`; the two-step `NAME=…; export NAME` | R23, delivery secrets |
| B12 | env name `X; id` or `1A` | `secretsStdin` throws | R23 |
| B13 | a lookup that returns a node whose `details.kind` is `'ssh'` but `isSshEnabled` is false | `resolveKind` reads `kind` first → linked (a stored kind wins, as everywhere) | R5 fixture |
| B14 | `ssh.sshKeyPath` with `"` or a space | `shellQuote` as today; not in the trust line | R18, C2 |
| B15 | PowerShell 5.1 + `"` in the line | T1 | R20 |

## S2.11 — Opus review checklist for the code

- [ ] `remoteLaunch.ts` imports no `vscode`; `grep -n vscode remoteLaunch.ts` is empty; `npm run typecheck` green.
- [ ] `buildSshCommand` without `remote` is byte-identical (C1 runs over the existing fixtures, not new ones); the `-t` push
      is after the program word and before `-i`; `--` is immediately before the destination; the remote word is last.
- [ ] The remote word is quoted by `quoteFor`, family from `platform`; `shellQuote` is not used for it.
- [ ] `sshCommand.ts` imports `./hostShell` and nothing else new; no file imports `remoteLaunch.ts` except tests and the six
      road files' S1-refusal import (§S2.6).
- [ ] The check order is §S2.3 exactly (self second, with no lookup).
- [ ] Every sentence in the tests is compared whole, not by `includes`.
- [ ] The wrapper is the `eval` form with `'\''`, and R16 asserts no `"`.
- [ ] `trustLineFor` has no platform parameter, no `-i`, no `-o`, no program word; R18 proves the four inputs change it.
- [ ] `LaunchPlan.remote` has no `trustLine` field (§S2.1 item 2); `typedLine` reads `prepared.entity`, never `plan.ssh` (R22).
- [ ] `secretsStdin` validates names, uses the two-step export, has the blank line, `} </dev/null`, `exit $?`.
- [ ] The fake `ssh` is a `#!/bin/sh` script that invokes nothing named `ssh`; `PATH` is prepended, not replaced; the file is in
      an `ownedDir`; every spawn has a timeout.
- [ ] Skips are `{ skip: '<reason>' }` strings (bash on Windows only, pwsh, zsh); a POSIX machine without bash FAILS.
- [ ] The delivery assertions compare `Buffer`/string bytes, including the tab and the non-ASCII items.
- [ ] `launchRoadScan.test.ts` has the stale-entry test and the self-check; its allow-lists carry a `because` per line.
- [ ] The S1 refusal moved, body through `sshLinkOf`, S1's tests green unchanged; the six import paths changed and nothing else
      in those files.
- [ ] The RED run is reported per test file with the first failure message, and the GREEN run; `npm test`, `npm run lint`,
      `npm run typecheck` all green at lowered priority.
- [ ] `research/module_extension.md` names `remoteLaunch.ts` and the scan; `research/module_tests.md` has the row.

## S2.12 — Not verified by this spec; hand checks

- A real sshd round trip (parent §10 hand check 4) — the remote parse is emulated with `<shell> -c`.
- Windows PowerShell 5.1 and pwsh 7 on Windows (hand checks 1 and 2); pwsh on Linux proves the parse, not Windows' native
  re-quoting. `--` reaching a native program from PowerShell is asserted by the pwsh delivery case where pwsh exists.
- `zsh` and `ksh` as remote login shells: the zsh case runs where zsh is installed; ksh is documented only.
- The password branch's `accept-new` rewrite on a program word that holds a space: today none does (`openSshProgram`).

## S2.13 — Decisions closed here

| # | Decision |
|---|---|
| S2-D1 | Wrapper = `eval` form (§S2.1 item 1), parent text to follow. |
| S2-D2 | Trust line not in `LaunchPlan`; built from the prepared snapshot by the road. |
| S2-D3 | Self check second, by id. |
| S2-D4 | 5.1 refusal also for a trailing `\`. |
| S2-D5 | `remote` quoting family from `platform`; empty remote command → `undefined`. |
| S2-D6 | `resolveCommand(` importers pinned as a list that shrinks per epic, not as a count of two. |
| S2-D7 | The S1 refusal moves into `remoteLaunch.ts` and answers through `sshLinkOf`. |
