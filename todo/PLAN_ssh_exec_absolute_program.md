# PLAN — `ssh:exec` spawns its ssh by an absolute path on Windows

> Status: **not started, 2026-11-10.** Scope: the extension's `ssh:exec` road (`src_vs_code/src/sshUseActions.ts`) and
> its tests. Found while writing B1 of [PLAN_terminal_command_over_ssh_E3.md](../research/PLAN_terminal_command_over_ssh_E3.md)
> (flag 8); waits for E3, which adds `spawnableSshProgram`.

## Symptom

On Windows without agent forwarding, `ssh:exec` spawns the bare `ssh` (`agentAwareLaunch`, `sshUseActions.ts:95-109`,
through `openSshBinary`, `sshProgram.ts:205-216`) with no `cwd` (`sshUseActions.ts:278-283`, `sshExecRunner.ts:129-133`).
libuv then searches the child's folder before `PATH`. That folder is the extension host's own folder, not the
workspace, so a repository cannot plant an `ssh.exe` there today. It is still the same CWE-426 class as E3's B1 (parent
entry 3.1), and the agent's run over SSH (E3.S2) uses the same road through `execOverSsh`.

## Fix idea

Apply E3's `spawnableSshProgram` (PATH's first absolute `ssh.exe`, else the built-in OpenSSH, else the refusal
`NO_SSH_TO_SPAWN`) to the program `agentAwareLaunch` answers, and decide whether to give `runSshExec` a `cwd` (the
storage folder, as the masked run). One road: the composition lives in `sshProgram.ts`, not at the call site.

## Build order

1. After E3 merges: a RED test in `test/sshExecOver.test.ts` with `win32` injected — the program is a bare name.
2. The fix in `agentAwareLaunch` (or in `sshSpawnLaunch` for both callers); the refusal answered as `no_credential` or
   as the door decides.
3. `research/module_extension.md`: the `ssh:exec` paragraph.

## Test plan

- The RED test above; the existing `ssh:exec` suites stay green unchanged.

## Definition of Done

- [ ] On Windows `ssh:exec` never spawns a bare name; the sweep found no other spawn of a bare `ssh` (method named).
- [ ] Tests green, the first one watched RED; the coai gate ran on plan and code.
- [ ] This plan promoted.
