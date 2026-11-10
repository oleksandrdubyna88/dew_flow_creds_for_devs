# PLAN — Windows: vault data in a typed SSH line or the askpass script cannot run a local command

> Status: **built on fix/windows-shell-quoting-injection (local, not pushed), 2026-11-10 — unverified on real Windows parsers until the windows CI step runs (on the first push) and the owner's hand checks.**
> Scope: the extension (`src_vs_code`) — `hostShell.ts` (`quoteFor`), `sshCommand.ts` (win32 words), `sshAskpass.ts`
> (the `.bat`), `wslRelay.ts` (`envPrefix`), their tests and one structural scan. Security fix of shipped behaviour.

## 1. Symptom (found 2026-11-10 by the class sweep of PLAN_terminal_command_over_ssh entry 1.2)

On a local Windows window, SSH Connect types its line into PowerShell (pwsh 7 when installed, else 5.1), and a
password connection's askpass script is a `.bat` run by cmd. Three values that come from vault data — and so from
sync, Accept Share and the ssh-config import — reached a local parser unescaped:

1. **The `-i` key path** (`sshKeyPath`) sat in PowerShell DOUBLE quotes (`shellQuote`, `sshCommand.ts:97`), where
   `$( )`, `$VAR` and a backtick expand, and where “ ” „ also close the string. A key path `"$(calc)"` ran `calc`
   locally (shown by the RED test).
2. **The destination** (`user@host`): `isSafeSshUser` admits `$`, so a user `a$HOME` was expanded by PowerShell;
   the jump and forward words likewise.
3. **The askpass `.bat`** echoed `%CREDS_SSH_PASSWORD%`; cmd expands `%VAR%` before it parses the line, so a password
   `a&calc` ran `calc` locally.

4. **A two-hop jump chain** (found by the Fable security judge, 2026-11-10). `,` was in the bare-word whitelist of
   `sshCommand.ts`, and PowerShell's argument mode turns a bare `a,b` into an ARRAY. `joinHops` writes `-J hop1,hop2`, so
   the chain became two arguments, and the second hop could become the destination. (Measured on Windows PowerShell
   5.1: a PowerShell function received an array. A native program received `a,b` as one word on 5.1, so the harm on 5.1
   for the real `ssh.exe` was not shown; pwsh 7 was not measured. The comma stays out of the whitelist in all cases: a
   quoted word is read the same everywhere.)

Plus the class root: `quoteFor('powershell')` doubled only the ASCII `'`, but PowerShell also reads ‘ ’ ‚ ‛ as
single quotes (Microsoft, about_Quoting_Rules). This closes item 5 of
[PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md).

## 2. Fix (as built on this branch, 4779685)

- `quoteFor('powershell')` doubles `'` ‘ ’ ‚ ‛ each with itself.
- A win32 word of the ssh line that holds `$`, a backtick, `"` or “ ” „ becomes a PowerShell single-quoted word;
  ordinary words keep today's form (`"…"` for paths, bare for safe words), so an ordinary line is unchanged.
- The `.bat` is `setlocal EnableDelayedExpansion` + `echo(!CREDS_SSH_PASSWORD!`: a delayed-expansion value is not
  parsed again.
- `envPrefix` also drops a value with a typographic single quote.
- **Review fixes (J1-J3, C1, C2, 2026-11-10).** One function, `windowsWord` in `sshCommand.ts`, decides every win32 word:
  single-quoted for a value PowerShell would expand or end, else `"…"` for a path (byte-identical to before), else bare
  or single-quoted for a line word; the key-value word `UserKnownHostsFile=…` goes through it too (C2: it replaces the
  three variants `shellQuote`, `lineWord` and the pin-file word). J1: `,` leaves the bare whitelist, so a jump chain is one
  single-quoted word; the other characters (`= + @ [ ] :`) were read by PowerShell 5.1 and are plain inside a word, but a
  LEADING `@` (a splat or a parse error) and a word that starts with `-` and holds `:` (`-p:1` splits) are now quoted. The
  port word also goes through the rule (the road test found it pushed raw: a port is a number by type and a string by
  sync or import data). J2: `askpassScript('win32')` itself has CRLF line ends, so the file `writeAskpassScriptFile`
  writes is the file cmd reads. J3: a road test (below).
- **Review round 2 (A1–A4, A5).** A1: the road test no longer casts a hostile string to `never` for a port field; a port is
  a number by type, so the ports left the string-field table, and a new road test feeds string ports through the real door
  (`isEntityMetadata` refuses them, so the builder is never handed one). A2: the module doc says the rule
  (`research/module_extension.md`, next to the Connect text). A3: U+201F and U+2033 also route a word to single quotes
  (defence in depth; ordinary paths and the C1 literals are unchanged). A4: every child `windowsParsers.test.ts` starts
  (`cmd.exe`, `powershell.exe`, `pwsh`) is started by one launcher whose timeout kills the whole process tree (`killChild`,
  `taskkill /T /F` on Windows), with a test of the launcher. A5: `hasPowerShellSingleQuote` uses one precompiled regex.
- The POSIX `-p` word stays bare: `typeGuards.ts:300` refuses a non-number port on every sync, import and sealed read, so only a number reaches the line (checked 2026-11-10); the win32 port word goes through `windowsWord` anyway.
- `test/shellQuotingRoadScan.test.ts` lists every quoting site with its parser and whether vault data reaches it,
  with a self-check.

## 3. Delivery

1. **Done:** this branch, from origin/main, holding only these changes and their tests; full suite 7112 tests (7118 with `windowsParsers.test.ts`, 15 skipped on Linux),
   0 failures, 9 skipped.
2. **The push, the PR text and the release are the owner's decision**: this repository is public, and the PR names
   defects that every released extension since the askpass and the win32 line shipped carries. Disclosure wording and
   timing belong to the owner.
3. The terminal-over-SSH work is rebased onto this commit (the plan is `todo/PLAN_terminal_command_over_ssh.md` on
   branch `feat/terminal-command-over-ssh-e1`).

## 4. Tests

RED tests first: hostShell per typographic quote; sshCommand S1–S4 (hostile `-i`, pin file, `$` login, jump) and the
C1 matrix of 156 literals (182 with the two-hop column below), six of which change on purpose (fixture `a$HOME`); sshAskpass (no `%VAR%`, delayed
expansion); wslRelay; the scan. Those assert STRINGS.

Review additions: sshCommand S4 (two-hop chain) and S5 (words PowerShell would read otherwise, the port) and a seventh C1
column, a two-hop jump (new literals, not a changed one; on win32 the chain is single-quoted on purpose, on linux it stays
bare); sshAskpass (CRLF line ends, the `/m` regex reads the `\r`); the scan gets `windowsWord` into its call pattern, and
a ROAD test that feeds a hostile value (`a$(x)b`, `a'b`, `a’b`, `a,b`, `a;b`, `a b`, a backtick, and more) into every
string field `buildSshCommand` reads on win32, then reads the line WORD BY WORD: each word is plain, a safe `"…"` word or
a well-formed single-quoted word, or the value was refused by the field's validator. The checker has its own self-check.
The test that only counted a line added to a source file is renamed for what it shows (it counts, it does not judge).

Round 2 added: a road test that string ports never become an entity (RED when the guard accepts a string port); S2 cases for
U+201F and U+2033; a launcher test that a timeout kills the child AND its grandchild (RED with a bare kill);
`hasPowerShellSingleQuote` answers the same on every call.

The strings are OBSERVED on the real parsers by `test/windowsParsers.test.ts` (security.md: a measure not observed
working is a comment). Off Windows a case skips with a printed reason when its shell is absent (a no-op on Linux without pwsh); ON Windows nothing
skips, and a missing or failing `cmd.exe`, `powershell.exe` or `pwsh.exe` FAILS (C1):

- **cmd.exe**: the `.bat` exactly as `writeAskpassScriptFile` writes it (CRLF comes from `askpassScript('win32')`; the test
  no longer rewrites line ends) into an owned folder, run by `cmd.exe /d /c`
  with eight hostile passwords (`a&echo PWNED&b`, `p"q%PATH%^r!s`, `!calc!`, `^!x^!`, `<x>|y`, a padded one, `100%`,
  `x!y!z`); stdout must be the password and CRLF, and no `PWNED` line. (This case moved here from `sshAskpass.test.ts`.)
- **Windows PowerShell 5.1 and PowerShell 7**, each when present (5.1 on Windows only): a control that the marker file
  CAN be created; then the words `quoteFor('powershell', v)` (as an expression and as a command argument) and the
  words `buildSshCommand` emits for win32 (hostile `-i` key path, a user `a$HOME` in the destination and in a jump value,
  a two-hop chain built by the real walk, which must reach the program as `['-J', 'a@b,c@d', 'deploy@example.com']`,
  the pin file) are read by the real parser. The result must equal the raw value, and the injected `New-Item` must create
  no file. The values include `x'; New-Item …; '` and the variants with ‘ ’ ‚ ‛ and " “ ” „, `$(New-Item …)`,
  `` `$HOME ``, `a$HOME`, a path with a space. The line is passed with `-EncodedCommand`, so no second command-line
  parser sits between the word and PowerShell, and the result is read back as UTF-16 code units, so a console code page
  cannot hide a typographic quote.

The CI step **"Windows parsers (cmd.exe askpass, PowerShell 5.1 and 7 quoting)"** in the `runner-windows` job of
`ci-extension.yml` runs `windowsParsers.test.js`, `sshAskpass.test.js` and `hostShell.test.js` on `windows-latest`.

**What is known before that step has run.** The same assertion logic was run against the OLD quoting (origin/main's
`hostShell.ts` and `sshCommand.ts`) on this machine: as a pure string check, the old word for `x’; …; ’` has a lone
closing quote after one character (the same for ‘ ‚ ‛), the old `-i` word for the `“ ” „`, `$(…)`, backtick and `$HOME`
values holds a character a double-quoted PowerShell word expands or ends at, and the old destination for `a$HOME` is a
bare word with `$`. See the commit message for the extra run through the Windows PowerShell 5.1 of this machine.

## 5. Hand checks (owner)

1. Windows, password SSH entry, a password holding `&`, `%` and `!`: Connect logs in (the `.bat` on real cmd).
2. Windows: Connect in pwsh 7 AND in PowerShell 5.1 (the terminal's pinned shell), each with an ordinary key path, a key
   path with a space, and a hostile key path (`$(New-Item -Path <folder>\pwned -ItemType File)`) that must create nothing.

## 6. Definition of Done

- [ ] The branch holds only these changes; full suite green; coai code round run and resolved.
- [ ] The windows CI step green (`windowsParsers.test.js` runs, not skips, on `windows-latest`).
- [ ] The owner decided push, PR text and release; hand checks 1–2 done.
- [ ] Followups item 5 marked closed with this plan's merge.
