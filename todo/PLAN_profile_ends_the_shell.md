# PLAN — a login profile that ends or replaces the shell makes an SSH road report success with nothing run

> Status: **not started, 2026-11-11.** A stub: it records the defect, what was measured and the fix ideas, so the work is not lost.
> Scope: the extension's remote commands (`src_vs_code/src/remoteLaunch.ts`: `loginShellCommand`, `SECRETS_REMOTE_COMMAND`), their
> tests and the help. Found by [PLAN_ssh_line_runs_in_login_shell.md](PLAN_ssh_line_runs_in_login_shell.md) (risk 3, §3.3), which
> records it as a limit; it waits for that plan to ship, because it changes the text of the same remote commands.

## Symptom

Since the line runs in the server's LOGIN shell (`exec ${SHELL:-sh} -l -c '<inner>'`), the person's own login profile runs before
the line, on every SSH road. A profile that ends the shell (`exit 0`), replaces it (`exec zsh`) or stops it from running commands
(`set -n`) ends the login shell, or turns it into a shell that runs nothing, BEFORE the line starts. The road then reports
**status 0 and nothing ran**: no error, no sentence, and the chain step, the agent's `creds_run` and the arrow's exit-code
sentence all read success. On *Run with Secrets* no value is read (the profile ends before the script is read), so nothing leaks,
but the run looks like it worked.

Measured by the parent plan, 2026-11-11, on six shells (bash 5.3.9, dash 0.5.12, zsh 5.9, mksh R59, ksh93u+m 1.0.10, busybox ash
1.37.0), with Run with Secrets: a profile with `exit 0`, one that `exec`s another shell and one with `set -n` each ended with status 0
and NOTHING run. The command cannot detect it from the inside: the profile ends or disables the shell before the command starts.

The parent plan's help says that the profile must not end or replace the shell, or the line does not run. That is a document, not a
control: the person learns it after a run that looked fine.

## Fix ideas (none chosen; each needs its own measurement on the six shells and on a real sshd)

1. **A started marker from outside the login shell.** Do not `exec` the login shell. The outer shell (sshd's own `$SHELL -c`)
   gives the login shell a second file descriptor to a pipe or a file it owns, the first thing of `<inner>` writes one byte to it,
   and the outer shell reports a sentence and a status that is not 0 when no byte arrived. Costs: the exit code must still be the
   line's (an `exec` kept it for free), the stay-open wrapper and Run with Secrets need their own care, and the outer text grows
   (more quoting for the Windows PowerShell 5.1 refusal, which allows no `"`).
2. **For Run with Secrets only: prove the script was read.** The outer shell keeps a way to see that the login shell consumed fd 3
   (for example it reads a byte back from a second descriptor that the subshell writes), and a script that was never read is a
   refusal with a sentence. This is the same marker, specialised.
3. **Check the profile once, in a probe.** A separate first call (`<sh> -l -c 'echo started'`) before the line. Costs a second
   connection or a second profile read on every run, and a profile that behaves differently the second time defeats it.
4. **Say it and do nothing else.** Keep the help sentence and add the sentence to the exit-code line of the stay-open roads. Cheapest;
   the defect stays.

## Open questions

- Which idea keeps `exec` (the exit code, one process, the folder) with the least new quoting?
- Is a profile that ends the shell a defect of the profile (it also breaks `ssh host command` for a plain `ssh`, which the person
  would see) or of the extension (it hides it)? Plain `ssh host 'cmd'` runs a non-login shell, so the profile is NOT read there, which is
  why the person may never have met it.
- The same defect on the agent's `creds_exec` is out of scope: it keeps sshd's non-login shell (L9 of the parent plan).

## Definition of Done

Not written: this is a stub. A plan with stories replaces it before any build, and goes through the plan round of the review gate.
