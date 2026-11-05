# PLAN — Off a bridge, a jump hop can be answered with the destination's password

> Status: **plan only, nothing implemented yet, 2026-11-05.** Scope: `src_vs_code` (`sshAskpass.ts`, `sshExecAuth.ts`, `sshExecCommand.ts`,
> `sshConnect.ts`, `sshCommand.ts`). Found by the review of E1.3's Amendment 3 and judged in Amendment 4 (D.1) of
> [PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md). The bridged exec is fixed there; the two paths below are
> outside that plan's scope (its §8, the "found on the way" row) and wait for a plan of their own.

## The defect

An entry that authenticates by password rides `SSH_ASKPASS` with `SSH_ASKPASS_REQUIRE=force` and the password in `CREDS_SSH_PASSWORD`
(`sshAskpass.ts`), and the askpass script prints that variable for any prompt. `-J` makes ssh spawn a nested ssh for each hop, which gets
`-l`, `-p`, `-F` (if the outer had one), `-v` and `-W` — none of the outer's `-o` options — and inherits the environment. Measured on OpenSSH
10.2 with `ssh -v` and `ssh -G` against loopback. So when a hop refuses the laptop's keys and offers password or keyboard-interactive
authentication, the nested ssh answers with the DESTINATION entry's password, and the hop receives it. A keyboard-interactive prompt's text
is the server's, so filtering by prompt text in the script would be spoofable.

Two paths have it:

| Path | Where |
|---|---|
| The agent's local `exec` (main port, socket) | `sshUseActions.ts` → `buildSshExecArgv` with `auth: 'askpass'` and `jump` |
| The person's own Connect | `sshConnect.ts` composes the same askpass environment and `sshCommand.ts` the same `-J` for the terminal |

Since 0.42.0, when askpass arrived; a jump was never asked about.

## The fix the bridge took (Amendment 4, D.1), to be weighed here

A static `ssh_config` handed with `-F`: a `Host *` block first (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `BatchMode yes`,
no connection sharing, no forwardings), then `Match all` and `Include` of the person's own files by absolute path, so the hop legs are bound by
the block and the outer wins back what it needs on its command line. For the person's Connect the same file may be too strict (a person at a
terminal may legitimately type a hop's password themselves — then the askpass script must not answer for them); a separate decision.

## Definition of Done (for the plan that builds this)

- [ ] On both paths a hop never receives the destination entry's password, measured with a hop `sshd` that offers password authentication and
      an askpass stub that logs its calls (the itest leg Amendment 4 adds for the bridge, reused).
- [ ] Whatever a person could do safely before still works: a hop that takes the laptop's key or agent, a hop whose password the person types.
