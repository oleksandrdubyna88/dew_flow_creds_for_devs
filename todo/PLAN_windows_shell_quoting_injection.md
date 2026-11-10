# PLAN — Windows: vault data in a typed SSH line or the askpass script cannot run a local command

> Status: **built on fix/windows-shell-quoting-injection (local, not pushed), 2026-11-10.**
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
- `test/shellQuotingRoadScan.test.ts` lists every quoting site with its parser and whether vault data reaches it,
  with a self-check.

## 3. Delivery

1. **Done:** this branch, from origin/main, holding only these changes and their tests; full suite 7112 tests,
   0 failures, 9 skipped.
2. **The push, the PR text and the release are the owner's decision**: this repository is public, and the PR names
   defects that every released extension since the askpass and the win32 line shipped carries. Disclosure wording and
   timing belong to the owner.
3. The terminal-over-SSH work is rebased onto this commit (the plan is `todo/PLAN_terminal_command_over_ssh.md` on
   branch `feat/terminal-command-over-ssh-e1`).

## 4. Tests

RED tests first: hostShell per typographic quote; sshCommand S1–S4 (hostile `-i`, pin file, `$` login, jump) and the
C1 matrix of 156 literals, six of which change on purpose (fixture `a$HOME`); sshAskpass (no `%VAR%`, delayed
expansion); wslRelay; the scan. The cases that need a real shell skip when cmd.exe or pwsh is not on the machine; the
real cmd.exe case runs on Windows only and has run NOWHERE yet.

## 5. Hand checks (owner)

1. Windows, password SSH entry, a password holding `&` and `%`: Connect logs in (the `.bat` on real cmd).
2. Windows, pwsh 7 and PowerShell 5.1: Connect with an ordinary key path, with a key path holding a space.

## 6. Definition of Done

- [ ] The branch holds only these changes; full suite green; coai code round run and resolved.
- [ ] The owner decided push, PR text and release; hand checks 1–2 done.
- [ ] Followups item 5 marked closed with this plan's merge.
