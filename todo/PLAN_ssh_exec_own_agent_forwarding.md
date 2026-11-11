# PLAN — `ssh:exec` forwards only the extension's own agent, never the person's own one

> Status: **not started; needs the owner's yes, 2026-11-10.** Scope: the extension's `ssh:exec` road
> (`src_vs_code/src/sshUseActions.ts`), the three person clicks of `src_vs_code/src/commands/agentCommands.ts` that build
> the same argv, and their tests. Found by the E3.S2 security spec's third amendment
> ([PLAN_terminal_command_over_ssh_E3_S2_security.md](../research/PLAN_terminal_command_over_ssh_E3_S2_security.md) §16 items 10
> and 11, §18.2), in the re-review of epoch 4 of [PLAN_terminal_command_over_ssh.md](../research/PLAN_terminal_command_over_ssh.md)
> (D17, risk 9, §7a, §9). Read in the code on 5b221602, **not observed on a host**.

**Boundary with [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md)** (F7, epic 2): that plan changes the third argument of the refusal function in `sshUseActions.ts` (what `execOverSsh` SAYS when it refuses a hidden second entry). It changes no argv and no environment, so its lines are disjoint from this plan's.

**Boundary with [PLAN_ssh_line_runs_in_login_shell.md](PLAN_ssh_line_runs_in_login_shell.md)** (2026-11-11): that plan changes only the REMOTE COMMAND (the last argv word) of the linked `creds_run` and of Run with Secrets, to `exec ${SHELL:-sh} -l -c '…'`. It keeps `ssh:exec`'s command as the agent wrote it, and it changes no `-A`, `-T`, option or environment of any road. Disjoint from this plan; either may go first.

## Symptom

An SSH entry with agent forwarding on, opened to agents, on a machine where the extension's own agent has no key (no
socket: `sshAgentManager.ts:205-207`) and the extension host has an `SSH_AUTH_SOCK` (a desktop session's agent):

- `buildSshExecArgv` sends `-A` whenever the entry asks (`sshOptions.ts:197`);
- the spawned ssh inherits the extension host's environment, so its `SSH_AUTH_SOCK` is the person's OWN agent
  (`sshExecAuth.ts` spreads `process.env`; `agentAwareLaunch`, `sshUseActions.ts:95-109`);
- the journal says *nothing will be forwarded until one is loaded into the agent* (`NO_AGENT_TO_FORWARD`,
  `sshProgram.ts:251-254`).

So the agent's FREE command runs on the server with the person's own agent forwarded, and that agent signs with no
prompt, where the extension's agent would ask for each signature. Shipped since `-A` was wired for a spawned ssh. The
three clicks of `commands/agentCommands.ts` (`:197`, `:222`, `:351`) build the same argv with no `ownAgent`.

A second limit of the same road (security spec §16 item 11): with `RequestTTY force` in the person's ssh config,
`ssh:exec` and the three clicks get a remote pty: `stdout` and `stderr` are joined, line ends become CR LF, and a value
of more than one line is then not masked in the agent's answer. E3's two roads (Run with Secrets over SSH and an
agent's linked run) send `-T` (parent D16) and do not have this limit; `ssh:exec` does not, because a person may rely
on a forced pty (`sudo`, for example).

A third fact of the same road: `ssh:exec`'s child inherits the extension host's `SSH_AUTH_SOCK` even when the entry
does not forward, so ssh can offer the keys of the person's own agent before the vault's key. E3's two roads remove it
(parent D17 (a)); `ssh:exec` keeps it (`ownAgentOnly: false`).

## What the terminal-over-SSH plan already leaves ready (E3, not yet merged)

- `SshExecOptions.ownAgent` in `sshExecCommand.ts`: with `false` and a forwarding entry, no `-A` and
  `-o ForwardAgent=no` (`-A` wins over the option in either order, measured with `ssh -G` on OpenSSH 10.2p1).
- `OverSshCall.ownAgentOnly`, a REQUIRED per-call word: the agent's linked run says `true`, `ssh:exec` says `false`
  with a comment naming this plan, and the scan F5 pins exactly one `false` and the three calls of `agentCommands.ts`
  with no `ownAgent` (a list that may only get shorter). Its environment half is ready too: for `ownAgentOnly`,
  `execOverSsh` hands `agentAwareLaunch` `envWithout(prepared.env, E3_INHERITED_DROP, process.platform)` (the pure
  `envWithout` and `E3_INHERITED_DROP` of `sshProgram.ts`), so turning `ssh:exec` to `true` also removes the host's
  `SSH_AUTH_SOCK` there.
- `SshExecOptions.noTty` and `OverSshCall.noTty`: one word on a call gives `-T`.

| Item | Which plan builds it | The other one's part |
|---|---|---|
| `ownAgent`, `ownAgentOnly` (argv and environment halves), `envWithout`, `noTty`, the F5 scan | terminal over SSH (E3) | none here |
| `ssh:exec` turned to `ownAgentOnly: true`; the three clicks pass `ownAgent` | this plan | none there: E3 changes no shipped argv |
| `-T` (or not) on `ssh:exec` and the clicks | this plan decides | E3 sends `-T` on its two roads, Run with Secrets and the agent's linked run |
| whether the person's ssh setup applies to a spawned ssh at all (`SendEnv`, `ProxyCommand`, the agent's keys) | [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) (its Definition of Done, third row) | this plan decides only `-A` and the pty |

Order: E3 merges first (it adds the words); this plan comes after it. The table is complete: nothing else of these
roads is in either plan.

## Fix idea and build order (to be decided with the owner)

1. Observe it first on a real host: a forwarding entry, no key in the extension's agent, the person's own agent with
   a key, `ssh:exec` of `ssh-add -l` on the server. Expected (not yet seen): it lists the person's key.
2. `ssh:exec` says `ownAgentOnly: true` (one word); the three clicks pass `ownAgent` by the same rule.
3. Decide the forced pty: `-T` on these roads, or a recorded limit, with the owner (it may take away a `sudo` that
   works today).

The fix takes away something a person may use today (their own agent forwarded by an agent's call), so it needs the
owner's yes before it is planned in full.

## Test plan (outline)

- RED first: `test/sshExecOver.test.ts` F4's last case (`ownAgentOnly: false`, no socket: `-A` in the argv) turns into
  the new expectation (no `-A`, `ForwardAgent=no`); the F5 scan's `false` list becomes empty.
- The clicks: one test per call site of `commands/agentCommands.ts`.
- A hand check on a real host (step 1), before and after.

## Definition of Done

- [ ] The owner said yes; the behaviour was observed on a host before the fix.
- [ ] No road of an agent forwards the person's own agent or offers its keys through the inherited `SSH_AUTH_SOCK`;
      the journal's sentence is true on every road.
- [ ] The forced pty is decided and either fixed or recorded with the owner's word.
- [ ] Tests green, the first ones watched RED; the coai gate ran on plan and code; this plan promoted.
