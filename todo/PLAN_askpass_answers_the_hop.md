# PLAN — Off a bridge, a jump hop can be answered with the destination's password

> Status: **plan only, nothing implemented yet, 2026-11-05 (revised the same day with the parent's epoch 4 revision; its roads and priority updated 2026-11-10 by the terminal-over-SSH plan's re-review).** Scope: `src_vs_code` (`sshAskpass.ts`, `sshExecAuth.ts`, `sshExecCommand.ts`,
> `sshConnect.ts`, `sshCommand.ts`). Found by the review of E1.3's Amendment 3 and judged in Amendment 4 (D.1) of
> [PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md). The **bridged** legs are fixed by the parent's SSH contract
> ([PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.9, story E1.6); the two paths below are outside that plan's scope (its §8 row)
> and wait for a plan of their own.

**Boundary with [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md)** (F7, epic 2): that plan adds a field `second` to the failure of `ExecAuth` and to the failure of `JumpChain`, and reads no password path. A new refusal on this plan's paths that names a hop or a second entry sets `second`, so that the refusal passes the one chooser of that plan.

## The defect

An entry that authenticates by password rides `SSH_ASKPASS` with `SSH_ASKPASS_REQUIRE=force` and the password in `CREDS_SSH_PASSWORD`
(`sshAskpass.ts`), and the askpass script prints that variable for any prompt. `-J` makes ssh spawn a nested ssh for each hop, which gets
`-l`, `-p`, `-F` (if the outer had one), `-v` and `-W` — none of the outer's `-o` options — and inherits the environment. Measured on OpenSSH
10.2 with `ssh -v` and `ssh -G` against loopback. So when a hop refuses the laptop's keys and offers password or keyboard-interactive
authentication, the nested ssh answers with the DESTINATION entry's password, and the hop receives it. A keyboard-interactive prompt's text
is the server's, so filtering by prompt text in the script would be spoofable.

Two paths have it, and the terminal-over-SSH plan
([PLAN_terminal_command_over_ssh.md](../research/PLAN_terminal_command_over_ssh.md), risk 7 and §7a; its E3.S2 security spec §18.3)
puts more roads on each (added 2026-11-10, the both-sides rule):

| Path | Where | Roads on it |
|---|---|---|
| The agent's local `exec` (main port, socket) | `sshUseActions.ts` → `buildSshExecArgv` with `auth: 'askpass'` and `jump` | `ssh:exec`; an agent's linked `creds_run` (`execOverSsh`, E3.S2); the same builder from `secretsArgv` (`remoteLaunch.ts`): *Run with Secrets* over SSH, which sends vault values on stdin through that connection (E3.S1). E3 not yet released |
| The person's own Connect | `sshConnect.ts` composes the same askpass environment and `sshCommand.ts` the same `-J` for the terminal; since E1, `prepareSshSession` (`sshSession.ts`) is that preparation | SSH Connect; a linked Terminal entry's arrow, a VPN's launcher and *Run All in Folder* (E2, released in 1.20.0). A dependency step refuses a password SSH entry at plan time, so it is not on this path |

Since 0.42.0, when askpass arrived; a jump was never asked about.

**Priority (raised 2026-11-10).** The terminal-over-SSH plan makes a password SSH entry with a jump host a thing people
link commands to, so more connections pass the defect, and *Run with Secrets* sends vault values through a connection
whose hop was answered that way. That plan does NOT refuse such an entry on its roads (a refusal on one road would
protect nothing while the others still pass it), so this plan is where the defect is fixed for every road, and it is
the next plan on the SSH roads after that plan's E3. It is not a condition of E3's merge or release: no road of E3
adds a new way to reach the defect.

## What the bridge does (parent §4.9, E1.6), to be weighed here for the two local paths

A per-call `ssh_config` handed with `-F` and **no `Include`**: one `Host <hop>` block per hop of the typed chain carrying that hop entry's own key
and host-key keywords, then `Host *` with the lock-down (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `BatchMode yes`,
`IdentityAgent none`, `IdentitiesOnly yes`, no default identity, `ProxyCommand none`, `PermitLocalCommand no`, no connection sharing, no
forwarding). The outer wins back what the destination needs on its command line. The child's environment is an allow-list, not `process.env`.
Amendment 4's earlier shape, the same file with `Include`s of the person's files, was measured false as containment on 2026-11-05 (the parent's
D9): a `ProxyCommand` child has no `-F` and the whole environment, and `SendEnv`, `LocalCommand`, `accept-new` survive.

For the two local paths that file is too strict as it stands, and the question this plan must answer is which parts carry over:

- **The local `exec`** is an agent's call with nobody watching, like the bridged one: the hop legs' denial of password and keyboard-interactive
  authentication carries over whole. Whether the person's `~/.ssh/config` may still apply to a LOCAL exec (the owner's own laptop, the owner's
  own file; no server in the loop) is this plan's decision, not the bridge's: the bridge refuses it because a server asked; here the person asked
  a local agent.
- **The person's Connect** is a terminal the person sits in: a hop's password may legitimately be typed by them, so the askpass script must not
  answer for them on a hop leg while still answering for the destination. Denying password authentication on the hop would refuse what the
  person can do by hand; the right shape may be `SSH_ASKPASS_REQUIRE=prefer` with a TTY for the hop and `force` for the destination, which
  `-J` cannot express per leg — so an explicit `ProxyCommand ssh -W …` composed here from the typed chain, with its own environment, may be the
  only per-leg handle. Unmeasured.

## Deferred: checking the parent process inside the askpass script

Considered on 2026-11-05 and deferred, with the reasons recorded so it is not re-asked blind: the script cannot tell *why* the outer `ssh` asks
(an encrypted key's passphrase, a login password, a host-key question, a hop's prompt), so a parent-process test answers "which process" and not
"which prompt"; delivering the secret to the right process needs a second channel (today one variable in one environment serves every leg);
and the behaviour of `SSH_ASKPASS` under Win32-OpenSSH with a `.bat` and the process tree it makes is unverified. It would be a third mechanism
beside the denial at the client (the bridge's) and a per-leg `ProxyCommand` (above). Re-opened only if both of those fail a local path.

## Definition of Done (for the plan that builds this)

- [ ] On both paths a hop never receives the destination entry's password, measured with a hop `sshd` that offers password authentication and
      an askpass stub that logs its calls (the itest leg the bridge's E1.6 adds, reused).
- [ ] Whatever a person could do safely before still works: a hop that takes the laptop's key or agent, a hop whose password the person types.
- [ ] Whether the person's `~/.ssh/config` applies to a local agent exec is decided and said in the help, with the measurement that decided it.
