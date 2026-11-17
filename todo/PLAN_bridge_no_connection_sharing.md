# PLAN — the extension's own `ssh` calls share no connection (G2 of N16, widened)

> Status: **approved 2026-11-17 (the coai plan gate, `proceed`), epoch 1 open, one change (1.1); nothing implemented
> yet.** Split into three stories (`## Stories`), S2 the cornerstone; the two security specs by Fable, 2026-11-17:
> [S1](PLAN_bridge_no_connection_sharing_S1_spec.md) and [S2](PLAN_bridge_no_connection_sharing_S2_spec.md) (the
> cornerstone). The feasibility probe of S2's first step was run for its spec and passed (§2).
> Scope: the extension only (`src_vs_code`): the argv of the Remote Bridge's tunnel (`src/sshBridge.ts`), the argv of every
> non-interactive `ssh` run (`src/sshExecCommand.ts`), their tests, one new real-`sshd` test script, the docs. No change of
> the person's interactive terminal, of the shared composer `src/sshOptions.ts`, or of any file on disk. Found as G2 of
> [PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md) (N16, §5, `:198`), by reading; measured on
> 2026-11-17 (§2). The plan `todo/PLAN_person_roads_pin_host_key.md` (G1 of the same list; written on another branch, not
> on this one) depends on this plan (§3, decision 3).

## Plan changes

> Epoch 1 · approved 2026-11-17 · by reviewers · state: open

  (The plan round's accepted finding 1 was folded in at its resolve, before approval, and is not an entry: items 2 and 5
  of §7.2 asked for results that exclude each other when `extra` itself names sharing. Now the fixed two options stand
  exactly once BEFORE every word of `extra`, a caller's own sharing words in `extra` are outside the prohibition of
  item 5, and the `ssh -G` test of §7.3 checks the values in effect.)
  (The round's rejected finding 0 is not an entry either: an extension host that is killed without `dispose` leaves the
  `ssh` it started holding the forward. This plan neither causes nor changes that; its follow-up is H3 in §9.)

- 1.1 · 2026-11-17 · reviewer · scope — the cost of decision 1 reaches Run with Secrets and the agent's exec, not only
  the bridge: a credential that needs interaction (a passphrase key not in any agent, a typed second factor, a
  security-key PIN) used to work through a master the person had opened; with `BatchMode=yes` and sharing off it now
  fails authentication. Added: an acceptance leg in S2 for valid credentials that require interaction (it fails after
  S1, and an identity usable without interaction, e.g. from an agent, still works), and one sentence in the help
  of *Run with Secrets* and of the agent's SSH use (five languages each, as the *Remote Bridge* article) in S3.
  Raised by the cadence consultant (`59aa353c`) before the build; checked by reading `remoteLaunch.ts:515` and
  `sshUseActions.ts:259`.

## 1. Symptom

On a laptop whose `~/.ssh/config` shares connections (`ControlMaster auto` with a `ControlPath`, usually with
`ControlPersist`), three things the product says are not true. With no such config nothing below happens: `ssh` shares
nothing by default.

1. **A closed bridge is still open.** `SshBridgeManager` says *"A bridge cannot outlive the window"*
   (`sshBridgeManager.ts:8-12`): `stop()` kills the bridge's process (`:81-89`), `dispose()` stops every bridge (`:92-96`,
   wired at `extension.ts:212`). The tunnel's argv (`buildBridgeArgv`, `sshBridge.ts:201-226`; its fixed options
   `:156-161`) says nothing about connection sharing. So the spawned `ssh` hands its `-R` forward to a master process, which
   is another process, and the kill reaches nothing that holds the forward (§2, A and E). The forwarded socket on the remote
   host goes on reaching the broker's port on the laptop. A caller there still needs a grant token or an alias, and the
   consent prompt still appears on the laptop (`sshBridge.ts`, the header); what is lost is the closing.
2. **The row says *Open Remote Bridge…* while a forward is served.** The spawned `ssh` exits with code 0 about half a
   second after its start (§2, A). The manager drops the row and calls `onEnded` (`sshBridgeManager.ts:69-77`,
   `extension.ts:190-196`: a log line `ended (0)` and a refresh). *Close Remote Bridge* is then not offered
   (`commands/agentCommands.ts:363-379` would answer *it had already ended*), and each further *Open* adds one more forward
   to the master, on a new socket path. Read from the code on top of the measured A; no window was driven.
3. **A bounded call does not use the key and the pin it was given.** Every non-interactive `ssh` run is built by
   `buildSshExecArgv` (`sshExecCommand.ts:128-174`). It passes the pinned host key when the caller has one
   (`:142-150`: *"with a pin, a changed host key fails the call"*) and the key file (`:159-161`). When a master for that
   control path is up, the call becomes a client of the master: nothing authenticates, and the call's own `-i` and
   `StrictHostKeyChecking=yes` with its `UserKnownHostsFile` are not applied (§2, C). The product already knows this for a
   call that came through a Remote Bridge: only then it adds `BRIDGED_SSH_OPTIONS` (`:28-35`, `:154-158`;
   `research/module_extension.md:3873-3877` says why). Off a bridge the same call has no such option.

The roads, each reference opened on 2026-11-17 at `b84416aa`:

| Road | Where the argv is built | A pin is passed | Sharing off today |
|---|---|---|---|
| the bridge's tunnel, `ssh -N -R` (*Open Remote Bridge…*) | `commands/agentCommands.ts:437-441` (`buildBridgeArgv`), started at `:452` | no (G1) | no |
| the socket sweep of a bridge | `commands/agentCommands.ts:180` (`sweepDeadSockets`, `:173-189`) | no (G1) | no |
| the socket mode check of a bridge | `commands/agentCommands.ts:206` (`verifyBridgeSocket`, `:191-245`) | no (G1) | no |
| *Install creds on host*: the probe and the install | `commands/agentCommands.ts:338` (`runRemote`, `:332-350`) | no (G1) | no |
| the agent's `ssh:exec` and its run over SSH | `sshUseActions.ts:259` (`execArgv`, `:251-264`) | yes (`:218-225`) | only when the call came through a Remote Bridge |
| *Run with Secrets* over SSH | `remoteLaunch.ts:516` (`secretsArgv`, `:514-522`) | yes (`:518`) | no |

## 2. Evidence

**Measured on 2026-11-17 by a scout** (this plan's author did not run it again: this machine has no `sshd`). Conditions,
all of them part of the result: OpenSSH 10.2p1, client and server; loopback; the same user on both ends; an unprivileged,
user-run `sshd -D -e` with `UsePAM no`; the client under its own `-F` config with `ControlMaster auto`,
`ControlPath /tmp/…/cm-%C` and `ControlPersist yes`; the tunnel's argv as `buildBridgeArgv` builds it, with key
authentication and a pinned host key; the remote end of the forward a unix socket path.

| | The run | What was seen |
|---|---|---|
| A | the tunnel's argv as it is today, no master before | the spawned `ssh` exits with 0 after about 0.5 s; a detached master (another PID) holds the `-R` forward; the kill of `SshBridgeManager.stop` hits a PID that is gone; the forward is served until `ssh -O exit`. The extension sees the bridge end (code 0) right after its start |
| B | the same with `-o ControlMaster=no -o ControlPath=none` | the process stays; the kill ends the forward; no master is left |
| C | a master opened before by a plain command; then a tunnel without the two options, with a WRONG `-i` key and a `known_hosts` file that holds a DIFFERENT host key under `StrictHostKeyChecking=yes` | the tunnel comes up as a client of the master: exit 0, the forward is served, and the `sshd` log shows no new authentication. The call's own key and pin are ignored |
| D | the master still up; the tunnel with the two options | a fresh `Accepted publickey` in the `sshd` log; with the wrong pin: `REMOTE HOST IDENTIFICATION HAS CHANGED … Host key verification failed`, exit 255; with the wrong key: `Permission denied`, exit 255 |
| E | as A, with `ControlPersist 10s` | the forward outlives `stop` by 10 s |

**Measured on 2026-11-17 by this plan's author**, OpenSSH 10.2p1 client, `ssh -G` only (it resolves the configuration and
connects to nothing), under a `-F` file with the three lines above:

- the file alone: `controlmaster auto`, `controlpath <the path>`, `controlpersist yes`;
- with `-o ControlMaster=no -o ControlPath=none` among the tunnel's words (`-N -R …`): `controlmaster false`, **no
  `controlpath` line at all** (this client prints none for `none`), the `remoteforward` line still there, and
  `controlpersist yes` still printed (it does nothing without a master);
- order on the command line: with a second `-o ControlMaster=auto -o ControlPath=/tmp/zz` AFTER the two, the result is
  still `controlmaster false` and no path; with that pair BEFORE the two, it is `controlmaster auto` and
  `controlpath /tmp/zz`. So the first value wins on the command line too, and a command-line value wins over the file.

**Measured on 2026-11-17 for the two specs, after the approval** (their facts K9, K10 and L2 to L11; a copy of the repository in
a scratch folder, OpenSSH 10.2p1 for the client and for an `sshd` unpacked from the distribution's package and run by the user,
loopback, one user):

- the feasibility probe of §7.4 passed: `sshd -d` serves a unix-socket `-R`, a connect from `node` reads through it, and the
  product's `stop()` ends it;
- the ten legs of §7.4 with the product of S1: 42 checks pass, in about 2 s; on the product as it is today 16 of them fail, and
  every control passes;
- each option alone: with `ControlPath=none` alone every leg passes; with `ControlMaster=no` alone the tunnel does not become
  a master (P-B passes) and every call still joins a master that is up;
- `ssh.exe -G` of OpenSSH_for_Windows_9.5p2 resolves the two options as the Linux client does (the client alone, by hand).

**Not measured:** a host over a network; Windows (Win32-OpenSSH is recorded as *believed to have no `ControlMaster`*,
unverified: `PLAN_remote_bridge_scoped_E1_S3_spec.md:1772`) and macOS; a password entry; a jump host; the bounded runs
of `buildSshExecArgv` themselves (C and D were run with the tunnel's argv; that a non-bridged run joins a master is what
`scripts/itestForwardAgent.cjs:120-126` shows with a hand-written argv); each of the two options alone;
`ControlMaster` values other than `auto`; an older OpenSSH.

## 3. Decisions, settled with the question consultants (the baseline of this plan)

1. **Scope (b)** (consult `925f4f14`, both answers): the two options go into the tunnel's argv AND, for every call, into
   the argv of `buildSshExecArgv`. The person's interactive terminal (`buildSshCommand`, `sshCommand.ts:213-245`, a
   string for a terminal) KEEPS connection sharing. The shared composer (`sshOptionArgv`, `sshOptions.ts:199-204`) is not
   changed: both the terminal and the runs call it.
2. **Jump hosts** (codex's answer): the guarantee covers the connection the extension spawns, and no hop. `-J` makes
   `ssh` start a nested `ssh` for each hop with `-l`, `-p`, `-F` and `-W` only: it inherits `-F` and the environment, and
   none of the outer's `-o` options (recorded in
   [PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md), D.1, `:2167-2190`; measured there
   with `ssh -v` and `ssh -G` on OpenSSH 10.2). A hop leg can still join or create a master. The hop case is a
   follow-up (§9), not built here.
3. **Order:** this plan first, then G1 (`todo/PLAN_person_roads_pin_host_key.md`). The reason is run C: while a call can
   join a master, a pin on that call is not applied, so G1's pin would be a sent option with no effect.

The brief this plan was written from gives one consult id, for decision 1.

## 4. Fix

### 4.1 One constant for the two options

A new exported constant in `sshExecCommand.ts` (the name is the spec's; here `NO_CONNECTION_SHARING`): the four words
`-o ControlPath=none -o ControlMaster=no`, in the order `BRIDGED_SSH_OPTIONS` has them today. Three users, and no other
spelling of these two words in `src/`:

- `BRIDGED_SSH_OPTIONS` is built from it and stays the same six options in the same order (`sshExecCommand.ts:28-35`;
  `sshExecCommand.test.ts:139-141` pins the six and does not change);
- `buildSshExecArgv` (§4.3);
- `FIXED_OPTIONS` of the tunnel (§4.2). `sshBridge.ts` already imports from `./sshExecCommand` (`:1`), and both modules
  import no `vscode`.

**Only these two options are shared.** `ClearAllForwardings=yes` must not reach the tunnel: it clears the forwards of the
command line too (`sshExecCommand.ts:23-26`: *no localforward/remoteforward line even with -L and -R on the command
line*), so the tunnel would lose its own `-R`. The scoped bridge plan says the same from the other side: the tunnel is to
carry `-o ClearAllForwardings=no` ([PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.9, `:579`). It must
not reach a non-bridged run either: such a run keeps the entry's own `-L`/`-R`/`-D` and `-A` (`sshOptionArgv`).

What each option does alone was not measured (§2). Read from ssh_config(5): `ControlPath=none` turns sharing off in both
roles; `ControlMaster=no` alone stops this `ssh` from becoming a master (A, E) and does not stop it from joining one (C).
`BRIDGED_SSH_OPTIONS` calls the second one *belt and braces* (`sshExecCommand.ts:22-23`). S2 measures each alone (§7.5)
and the comment of the constant says what was seen, not what the names promise. The S2 spec's own run agrees with the
reading above (§2; its fact L10); the coder's run decides the comment.

### 4.2 The tunnel

`FIXED_OPTIONS` (`sshBridge.ts:156-161`) gains the constant. In `buildBridgeArgv` the fixed options stand after the
authentication words and before the host-key words, `-N`, `-R`, `options.extra` (`:217`), `-i`, `-p` and `--`
(`:210-225`), so the two options come before every word a caller can add, and the first value wins (§2). The docblock of
`FIXED_OPTIONS` gains the measurement of §2 with its conditions. Nothing else of the argv changes.

After this, on the measured conditions: the spawned `ssh` IS the connection that holds the forward, so `stop()` and
`dispose()` end it (B), the bridge's `exited` settles when the tunnel really ended, the row is *bridged* while it runs, and
the tunnel authenticates with its own key (D). The key file of a bridge (N16) is then deleted when the tunnel ends, not
half a second after its start.

### 4.3 Every run of `buildSshExecArgv`

The contract, for the spec to build and the tests to pin:

- **Every argv the function returns holds `-o ControlPath=none` and `-o ControlMaster=no`, each exactly once**, whatever
  `bridged`, `auth`, `noTty`, `ownAgent`, `jump`, the pin, the key or the entry say. No field of `SshExecOptions` and no
  caller can leave them out.
- **A bridged argv is byte for byte today's**: the six options, in today's place and order. This plan changes no bridged
  call.
- **A non-bridged argv gains exactly these four words**, where a bridged argv has its six: after the composer's words and
  the `ForwardAgent=no` of `ownAgentWords` (`sshExecCommand.ts:155`), before `-i`, `-p` and `--`. Every other word stays
  where it is.
- **No other word of any argv names `ControlMaster`, `ControlPath` or `ControlPersist`, and none is `-S`, `-M` or `-O`.**
  Today that is true: the words before the place are `-T`, the authentication option, the host-key options,
  `ConnectTimeout=10` and the composer's `-J`, `-A`, `-L`/`-R`/`-D` (`sshExecCommand.ts:138-155`, `sshOptions.ts:199-204`);
  the test of §7.2 keeps it true.

The five call sites of §1 pass nothing new and do not change. The approval line of a linked run (`trustLineFor`,
`remoteLaunch.ts:260-262`) holds no `-o` option, so no approval a person gave is asked again.

### 4.4 Every `ssh` the extension starts, and what this plan does to it

Found with `grep` for the two builders, `runSshExec(`, `bridges.start(`, `sshOptionArgv`, `GIT_SSH_COMMAND` and the word
`'ssh'` over `src_vs_code/src` (tests left out), each hit opened:

| The `ssh` | Built by | After this plan |
|---|---|---|
| the tunnel of a Remote Bridge | `buildBridgeArgv` | sharing off (§4.2) |
| the five bounded roads of §1 | `buildSshExecArgv` | sharing off (§4.3) |
| the person's terminals: *Connect via SSH* and every road that types an `ssh` line into a terminal | `buildSshCommand` (`sshConnect.ts:170`, `:321`; `sshSession.ts:492`; `terminalManager.ts:44`; `remoteLaunch.ts:309`) | unchanged, by decision 1: the person's own session may share |
| the nested `ssh` of each hop (`-J` of the entry, or a `ProxyJump` of the person's config) | `ssh` itself | unchanged: decision 2, follow-up H1 (§9) |
| `git` over SSH for a vault remote | `GIT_SSH_COMMAND` (`gitRemote.ts:124`: `ssh -i … -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`) | unchanged: not in decision 1's scope; follow-up H2 (§9) |

`ssh-keyscan` (`hostKeyTrust.ts:46`) is not `ssh` and shares nothing.

### 4.5 What grows, and who retires it

Nothing new is written to disk: no file, no folder, no setting, 0 bytes. No new process: one kind of process is no longer
created.

| What | Today, with a sharing config | After this plan | Who retires it |
|---|---|---|---|
| a detached master started by one of the extension's own calls | up to 1 per control path (with `%C`: per user, host and port); with `ControlPersist yes` it lives until `ssh -O exit` or the end of the login. A person with 10 bridged entries: up to 10 | 0 | none is created |
| the forward of a bridge inside a master | 1 more per *Open Remote Bridge…* (a new socket path each time), until the master ends | 0 | the tunnel's own process, killed by `stop()` and `dispose()` |
| logins to a host | a session inside the master, no login | one login per call: 3 for one *Open Remote Bridge…* (the tunnel, the sweep, the mode check), 2 for an install, 1 per `ssh:exec`, 1 per *Run with Secrets* | each ends with its call (the timeouts of `agentCommands.ts:185`, `:219`, `:343`; the agent's runs are at most 8 at once: `MAX_CONCURRENT_EXECS`, `brokerProtocol.ts:23`) |

The last row is what every machine without a sharing config does today, so it is no new load class. 8 logins at once stay
below the `MaxStartups` start of 10 that sshd_config(5) gives as the default (read, not measured).

**The test rig of S2** (§7.4) creates, per run of the script: 1 owned folder under the short socket root with about 50
small files (four key pairs; per `sshd` run a config, a `known_hosts` and a pid file; the client's configs; sockets;
under 100 kB), at most 11 `sshd -d` runs (one per leg that connects, §7.4; at most 2 alive at once), at most 2
masters, 1 `ssh-agent` (P-I2), 1 loopback listener. Projected time: under 60 s on top of the script. Measured for
the S2 spec (its L7, L8): 52 entries and 11.8 kB in the folder, 11 `sshd -d` runs, about 2 s. Who retires it: the section scope's `finally`, as section 8 does (`scripts/itestForwardAgent.cjs:178-204`).
**When it is interrupted:** a master of a control leg is detached, so it is not a child the scope can end by its pid. Three things
end it: `ssh -O exit` in the leg's own `finally`; a FINITE `ControlPersist` in the rig's config (60 s at most, the spec
picks), so a stranded master ends by itself; and the end of its `sshd`, which closes its connection. The folder is the
janitor's when the script is killed (`research/module_tests.md`, *Test leftovers*).

### 4.6 What does not change

`sshOptions.ts`; `sshCommand.ts`; `sshBridgeManager.ts` and `bridgeSpawner.ts` (their rules are right once the spawned
process is the connection); the five call sites; `sshExecAuth.ts`; any sentence a person reads in a dialog; the four other
bridged options and where they apply. PR #365 (E1.6 of the scoped bridge, open) changes `sshExecCommand.ts`,
`sshExecCommand.test.ts`, `bridgeLinks.test.ts`, `scripts/itestForwardAgent.cjs`, `scripts/itestSshd.cjs` and
`ci-extension.yml`, and not `sshBridge.ts` or `scripts/ssh-agent-itest.cjs`; of the documents of §8 it changes
`research/module_extension.md` and `research/module_tests.md`, and it changes `todo/README.md` and the scoped bridge
plan (`git diff --name-only` of its head `45726ae0` against `origin/main`, 53 files). Its bridged argv still starts with the six options, so the second bullet of §4.3 keeps
the merge of the two mechanical, in either order (§11).

## 5. What the person sees

Only a person whose `ssh` config shares connections sees any change.

- **A bridge closes when it is closed.** The row stays *bridged* while the tunnel runs; *Close Remote Bridge*, a newer
  bridge of the same entry and the end of the window end the forward. No master is left behind by the extension. A master
  that the person opened is not touched and not used.
- **Each of the extension's own calls logs in again.** A key entry (a stored key or a key file): silent, as on a machine
  with no sharing config (`BatchMode=yes`). A password entry: the stored password is answered by the askpass script
  (`NumberOfPasswordPrompts=1`; `sshAskpass.ts:33`, `:42-46`; `sshExecAuth.ts:77`), so the person is not asked.
- **A host that needs something only a person can give no longer works on these roads through a shared connection.** A
  second factor typed at login, a passphrase of a key file given by its path, the PIN of a security key: such a call fails
  with `ssh`'s own `Permission denied` (exit 255), as it does today on a machine with no sharing config. Before, it worked
  when the person had opened a master by hand, and it then ran as whoever that master had logged in as. A security key
  that needs a touch: the touch is still possible, within the call's timeout, and nothing on the screen asks for it (read
  from ssh(1) and the spawn options, not measured). The person's own *Connect via SSH* is not affected.
  **This reaches every road of §1, not only the bridge** (change 1.1): *Run with Secrets* over SSH and an agent's
  `ssh:exec` and run over SSH build their argv with `BatchMode=yes` for a key entry (`remoteLaunch.ts:515`,
  `sshUseActions.ts:259`), so a key file with a passphrase that no agent holds can no longer be used there through a
  master the person opened. An identity that needs no interaction still works: a key without a passphrase, a stored
  password, or a key that an agent in the call's environment holds (the leg P-I2 of §7.4 shows the last one). The help
  of both roads says so (§8).
- **Time.** Each call adds a TCP connect, a key exchange and an authentication where it had opened a session in a master.
  Not measured on a network host. An *Open Remote Bridge…* has three of them.
- **An entry with port forwards**, run by the agent while the person's own terminal already holds the same forward: the
  run's own bind fails and `ssh` says so on stderr, and the run goes on (no `ExitOnForwardFailure` on a run). That is
  today's behaviour without sharing; with sharing the master answered the request. Read, not measured.
- **A bridge that cannot log in fails at once** (exit 255, the log line `ended (255)`, the row back to *Open*), where
  before it rode a master. The message *Bridge open to …* still comes first (G8 of N16, not changed here).

## 6. Boundaries with other plans

| Item | Which plan builds it | The other's part |
|---|---|---|
| the two options on the outer leg of the tunnel and of every run of `buildSshExecArgv` | this plan | [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.9 (`:583`) keeps `ControlMaster no` / `ControlPath none` in the `Host *` block of its per-call `-F` file; E1.6 (PR #365, `bridgedSshConfig.ts`) writes that file for a bridged `exec`, and E2.2 is to put the tunnel and its helper runs under one (`:566`). When E2.2 does, the `-o` words of this plan stay: they bind the outer leg before any file is read |
| the hop legs of a bridged `exec` | the scoped bridge plan, E1.6 (the file reaches the nested `ssh` through `-F`) | none here |
| the hop legs of every other road (H1, §9) | no plan yet; the natural owner is [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md), which weighs the same `-F` file for the roads off a bridge | this plan states the gap and builds nothing |
| the pinned host key on the three roads of the person (G1) | `todo/PLAN_person_roads_pin_host_key.md` | this plan goes first (decision 3) and adds no pin |
| which agent a run forwards | [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md) | none: this plan adds no `ForwardAgent` word, and a non-bridged run keeps its `-A`. With sharing off, the agent a run forwards is the one of its own environment, never a master's |
| the key file of the three roads (N16, shipped) | [PLAN_person_roads_forget_key.md](../research/PLAN_person_roads_forget_key.md) | not changed; §4.2 says what G2 does to the moment a bridge's key file is deleted |

Disjoint from everything else in `todo/`. The same boundary is to be written into the older documents (N16's G2 line,
§4.9 of the scoped bridge plan, the askpass plan) by S3. This commit does not edit them: PR #365's branch changes the scoped bridge plan, and the line beside N16's G2
line is G1's, which the branch of G1's plan is expected to edit.

## 7. Tests (RED first)

Each new assertion is watched RED on `main`'s code, then GREEN, and the failure message is in the commit body.

### 7.1 Existing tests that change, and why

They assert that a call off a bridge OMITS the two options, which is the behaviour this plan ends:

| Test | What it says today | What it says after |
|---|---|---|
| `sshExecCommand.test.ts:158-164`, *F1: off a bridge the same entry is byte for byte today's … and none of the six options* | the words from `-J` to `--` are the composer's alone (`:160`); none of the six is in the argv (`:161-163`) | the composer's words, then the two options; the other four of the six are still absent |
| `sshExecCommand.test.ts:172-178`, *F2: `{ bridged: false }` and `{}` send none of the six* | none of the six, and the entry's own `-A` stays | the two, none of the other four, and the entry's own `-A` stays |
| `bridgeLinks.test.ts:219-232`, the off-bridge half of F1 through the real action | `ForwardAgent=no` and `OTHER_FIVE` are absent off a bridge | `ControlPath=none` and `ControlMaster=no` are present; `ForwardAgent=no` and the other three are absent. The comment of `OTHER_FIVE` (`:219`) changes with it |

Tests that do NOT change, each opened: the six of a bridged call (`sshExecCommand.test.ts:139-156`, `:166-170`;
`bridgeLinks.test.ts:233-245`); *off a bridge … without `ForwardAgent=no`* (`bridgeLinks.test.ts:248-254`); the tests that
compare an argv with the builder's own output (`sshExecOver.test.ts:150-151`, `secretsLaunch.test.ts:83-85`,
`sshRoadSecrets.test.ts:157`); `sshBridge.test.ts` (it asserts words that are present, and the last six words at `:152`);
`sshBridgeManager.test.ts:144` (an argv of its own); the four legs of `scripts/itestForwardAgent.cjs` (leg 1 runs the
non-bridged argv under a config with no `ControlMaster`, and this plan adds no `ForwardAgent` word; leg 3's argv is
hand-written).

### 7.2 New unit tests (S1)

1. The constant is the four words, spelled once more in the test, as `SIX` is (`sshExecCommand.test.ts:125-126`).
2. **The tunnel:** for key and password authentication, with and without a pin, a key, a port and words in `extra`: each
   of the two FIXED pairs (`-o ControlPath=none` and `-o ControlMaster=no`, the exact words of the constant) exactly
   once, before `-N`, `-R`, every word of `extra`, `-i`, `-p` and `--`. With an `extra` that itself holds
   `-o ControlMaster=auto -o ControlPath=/x`: the argv still holds the fixed two pairs exactly once, counted by their
   exact words (the caller's `ControlMaster=auto` is no second one), both BEFORE the first word of `extra`; the
   caller's four words stand where `extra` stands, unchanged and not filtered. What is then in effect is §7.3's to
   say, from the real client.
3. **The tunnel keeps its forward:** no word of the argv names `ClearAllForwardings`, and `-R` is still there.
4. **Every run:** over the combinations of `auth`, `bridged` (absent, `false`, `true`), `noTty`, `ownAgent`, a jump, an
   entry with `-A` and forwards, a pin, a key and a port: each of the two options exactly once, before `-i`, `-p` and
   `--`. A bridged argv equals a literal copied from `main`'s output.
5. **Nothing else names sharing:** in every argv of 2 and 4, no word that the BUILDER adds, other than the fixed two
   pairs, matches `ControlMaster`, `ControlPath` or `ControlPersist` in any letter case or in the `-oName=value`
   spelling, and none is `-S`, `-M` or `-O`. The words a caller passed in `extra` are outside this prohibition: they
   are the caller's, they stand after the fixed two (item 2), and the first value wins (§2). The test takes them out
   of the argv by their position (the slice `extra` occupies) before it scans, and one case with an empty `extra`
   scans the whole argv. `buildSshExecArgv` has no `extra`, so for item 4 the prohibition covers every word.
6. **The call sites are the six of §1:** a scan of `src/` (the pattern of `bridgeAuthParity.test.ts:47-65`, with its
   second assertion that the pattern still matches real code): every place that starts an `ssh` from an argv
   (`runSshExec(`, `bridges.start(`, the spawn of *Run with Secrets*; the spec lists the shapes) takes that argv from one
   of the two builders, and the two option words are spelled in one file only.

### 7.3 The real client, no `sshd` (S1)

A unit test that runs the PATH's `ssh -G -F <file>` with the built argv, where the file is an owned temporary file with
`Host *` / `ControlMaster auto` / `ControlPath <a path>` / `ControlPersist yes`. `-G` connects to nothing, so it runs in the
`Test` step of CI (`ci-extension.yml:82-85`).

- For the tunnel's argv and for a non-bridged and a bridged run, key and password: the output has `controlmaster false`
  and no `controlpath` line with a path (OpenSSH 10.2p1 prints no such line; a client that prints `controlpath none` passes
  too). For the tunnel: the `remoteforward` line is there.
- The control: the same argv with the four words taken out prints `controlmaster auto` and the file's `controlpath`. So the
  file can show the fault, and the test cannot pass by matching nothing.
- The tunnel with the hostile `extra` of test 2: the values IN EFFECT are still `controlmaster false` and no
  `controlpath` line that names `/x` or the file's path. This is the check that the exempt words of item 5 change
  nothing; the argv test of item 2 only shows where they stand.
- No `ssh` on the PATH: a skip with the reason locally, a failure where `CI=true` (the rule of section 8,
  `scripts/itestForwardAgent.cjs:170-176`).
- The same file also runs in the Windows job (`ci-extension.yml:236-237`, beside `sshAskpass.test.js`): it shows that
  Win32-OpenSSH takes the two words and what it resolves. It says nothing about sharing on Windows.

### 7.4 A real `ssh` against a real `sshd` (S2)

A new script `scripts/itestNoSharing.cjs`, called from `scripts/ssh-agent-itest.cjs` as its section 9 (757 lines today,
limit 800; two or three lines more), so it runs in the step that already has an `sshd`
(`ci-extension.yml:162-168`, `npm run itest:ssh-agent`). POSIX only; where `CI=true` a missing `sshd` fails. It extends
the pattern of section 8: `startSshd` and `launch` (`scripts/itestSshd.cjs`), the rig of
`scripts/itestForwardAgent.cjs:184-195`, a master on `sshd` A and the production argv for `sshd` B under a FIXED
`ControlPath` (`:113-117`, `:139-163`). The fixed path is used because `sshd -d` serves one connection
(`scripts/itestSshd.cjs:2`): the master is A's one connection, and a call that shares nothing reaches B.

The tunnel's argv comes from the compiled `buildBridgeArgv`, with `-F <the rig's config>` put before it, and is started by
the compiled `SshBridgeManager` and `bridgeSpawner`, so `stop()` is the product's. The forward leads to a loopback listener
of the test that answers one known line; *served* means that line was read through the remote socket path.

| Leg | The argv | Expected |
|---|---|---|
| K-A, the control of A | the tunnel's argv with the four words taken out; no master before | `exited` settles with 0; after that the forward is served; a control socket exists; `stop()` changes nothing |
| P-B | the production tunnel argv | the forward is served while `exited` has not settled; no control socket is made; after `stop()`, `exited` settles and the forward is not served |
| K-C, the control of C | master on A; the tunnel's argv with the four words taken out, for B, with a wrong key and a wrong pin | exit 0, the forward is served, `sshd` B saw no connection |
| P-D1 | master on A; the production tunnel argv for B, the right key and pin | `Accepted publickey` in B's log; the forward is served; `stop()` ends it |
| P-D2 | as P-D1 with the wrong pin | exit 255, `Host key verification failed` |
| P-D3 | as P-D1 with the wrong key | exit 255, `Permission denied` |
| P-X | master on A; the production NON-bridged argv of `buildSshExecArgv` for B, with B's pin | the command ran on B: `SSH_CONNECTION` ends in B's port. Its control is section 8's leg 3 (`:120-126`) |
| K-I, the control of 1.1 | master on A; the production non-bridged argv of a key entry (`BatchMode=yes`) with the four words taken out, for B; its `-i` names an authorized key file WITH a passphrase that no agent holds | exit 0 and the command ran through the master (`SSH_CONNECTION` ends in A's port): the credential that needs a person "worked" before |
| P-I1 (change 1.1) | master on A; the production argv of K-I, for B, no agent | exit 255, `Permission denied`; B saw the connection and accepted no key. The valid credential that needs interaction fails after S1 |
| P-I2 (change 1.1) | as P-I1, with that key loaded into an `ssh-agent` whose socket is in the run's environment | exit 0, the command ran on B, `Accepted publickey` in B's log: an identity usable without interaction still works |

P-D2 and P-D3 are started with `launch`, not the spawner, because they read `ssh`'s stderr. E has no leg of its own: K-A
with the rig's finite `ControlPersist` is the same fault, and a leg that waits out the time adds seconds for a control.

**One `sshd -d` per authentication attempt.** `sshd -d` serves one connection, so every leg that makes a production
connection to B, pass or fail, gets a B of its own (P-B, P-D1, P-D2, P-D3, P-X, P-I1, P-I2, and one B for each control,
which must see no connection); the master's A is one run for the whole master group.

**The first step of S2 is a feasibility probe, before any leg is built** (the cadence consultant, `59aa353c`; this is
the first step of S2's spec and no change of the order S1 → S2 → S3): one production tunnel against the existing
`startSshd`, then a round trip through the forwarded socket made by `node`. The consultant's reading is that `sshd -d`
is enough for a unix-socket `-R`: the tunnel's one connection carries the reverse-forward channel, and a probe of the
socket from `node` is no second `ssh` connection (the scout used `sshd -D -e`). If the probe says otherwise,
`startSshd` gets a mode that does not use `-d`, in a way that does not collide with PR #365's edit of that file.
The probe was run for the S2 spec on 2026-11-17 and passed (its fact L2), so the spec changes no line of `startSshd`;
the coder repeats it as step 1, and the first run on the runner's `sshd` is CI's.

**Where it can run.** CI has an `sshd`. This PC has none at `/usr/sbin/sshd`; the scout ran one as a user. S2's brief
names that binary, or the first run of the legs is CI's.

### 7.5 Mutation checks (by hand, recorded in the commit body)

- Take the constant out of `FIXED_OPTIONS` → tests 2 and 7.3 (tunnel) red; P-B and P-D1 to P-D3 red.
- Take it out of the non-bridged branch of `buildSshExecArgv` → test 4 and 7.3 (run) red; P-X, P-I1 and P-I2 red (each
  then rides the master and exits 0).
- Move it behind `extra` in the tunnel → test 2 red, and 7.3's hostile `extra` red.
- Add `ClearAllForwardings=yes` to the tunnel → test 3 red; P-B red (no forward).
- Keep `ControlMaster=no` and drop `ControlPath=none` → test 1 red; expected from ssh_config(5): P-B green, P-D1 to P-D3
  and P-X red. Keep `ControlPath=none` and drop `ControlMaster=no` → test 1 red; expected: every real leg green. What is
  seen is recorded as it is, and decides the comment of §4.1.
- Run the P legs with the two source files as they are on `origin/main` (checked out for that run, then restored) → P-B,
  P-D1 to P-D3, P-X, P-I1 and P-I2 red. This is S2's RED. P-I2 is red there for a reason of its own: before S1 the run
  rides the master and never reaches the `sshd` it names (measured for the S2 spec, its §7).

### 7.6 The whole suite

`npm test` in `src_vs_code`, typecheck, lint (`max-lines` included), the size ratchet and the build green before the PR;
`npm run itest:ssh-agent` green on the head sha's CI run.

## 8. Docs

- `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`: one security entry. The extension's own `ssh` calls (the Remote
  Bridge's tunnel, its socket check, *Install creds on host*, an agent's `ssh:exec` and run over SSH, *Run with Secrets*
  over SSH) no longer share a connection that an `ssh` config sets up (`ControlMaster`). Before, with such a config, a
  closed bridge could stay reachable, and a call could ride a connection opened earlier without using its own key or
  checking its pinned host key. Each call now logs in by itself; a host that needs a typed second factor works in your
  own terminal as before and not on these roads. *Connect via SSH* is unchanged. A jump host's own connection is not
  covered.
- `research/module_extension.md`: after the paragraph **The bridge's `ssh` and its key file (N16)** (`:2581-2591`), one
  paragraph on the tunnel's argv, the measurement with its conditions, and the hop limit; in the paragraph on a bridged
  call (`:3869-3879`), that the two options are now in every argv of `buildSshExecArgv` and the other four stay for a
  bridged call; one sentence in *The SSH call (`sshUseActions.ts`)* (`:2481`).
- `research/module_tests.md`: the row of `sshExecCommand.test.ts` (`:1464`); a new section after *A bridge, its socket
  check and the install delete their key file (N16)* (`:2479`) with the unit tests, the `-G` test, the legs of section 9,
  and what none of them proves (§2, *Not measured*).
- The help article *Remote Bridge* (`helpEn.ts:199-206` and the four other languages, the repository's rule 7): one
  sentence in *What can go wrong*: a bridge is a connection of its own and logs in by itself, so a host that needs a typed
  code cannot be bridged.
- The help of the two other roads (change 1.1), one sentence each in *What can go wrong*, in all five languages as the
  *Remote Bridge* article: *Secret references and masked runs* (`helpEn.ts:175-182`, the article of *Run with Secrets*)
  and *What an agent can and cannot do* (`helpEn.ts:127-134`, where `creds_exec` is described). The sentence: a run over
  SSH logs in by itself and asks nobody, so a key file with a passphrase, a typed second factor or a security-key PIN
  fails there with `Permission denied`, also when your own terminal has a connection to that host open; a key without a
  passphrase, a stored password or a key that your SSH agent holds works.
- The comments of `FIXED_OPTIONS`, of the constant and of `sshBridgeManager.ts:8-12` say what was measured and on which
  conditions (S1 and S2, with the code).
- The boundary lines of §6 in the older documents, and at promotion the *Fixed in* text on N16's G2 line.

## 9. Out of scope, and what was found on the way

- **H1, the hop legs.** A nested `ssh` of a jump host gets none of the outer's `-o` options (decision 2). Off a bridge it
  can still join a master, or become one that outlives the call. Reached by: the typed chain of an agent's run
  (`sshUseActions.ts:259`) and of *Run with Secrets* (`remoteLaunch.ts:517`), and a `ProxyJump` of the person's own config
  on every road. The three roads of the person and the tunnel pass no jump of the entry (`agentCommands.ts:180`, `:206`,
  `:338`, `:437-441`). A fix needs a generated `-F` file, as PR #365 builds for a bridged call. Not built here.
- **H2, `git` over SSH.** `GIT_SSH_COMMAND` (`gitRemote.ts:124`) names a key and `IdentitiesOnly=yes` and no sharing
  option. Found by the `grep` of §4.4 and read; not measured. Whether a vault sync can ride a master and so use another
  identity than the chosen key is a question for a plan of its own.
- **H3, a tunnel whose owner died without `dispose`.** An extension host that is killed (not closed) runs no `dispose`,
  so the `ssh` it started for a bridge is not killed and goes on holding the forward. Raised as finding 0 of the plan
  round and rejected for this plan: it is the same with and without a sharing config, so this plan neither causes nor
  changes it, and what G2 fixes is the kill that reaches nothing. Ending a tunnel when its owner dies needs a liveness
  link between the two processes, which is new process design. Read from the finding and the spawn options
  (`bridgeSpawner.ts:79`), not measured. No plan yet.
- **G1**, the pin on the three roads: `todo/PLAN_person_roads_pin_host_key.md`.
- **The agent a run forwards:** [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md).
- Turning sharing off for the person's terminal (decision 1), and ending a master that the person or an older version of
  the extension left running.
- G3 to G8 of N16.
- Windows and macOS runs of §7.4.

## 10. Definition of Done

- [ ] The tunnel's argv and every argv of `buildSshExecArgv` hold the two options once, first among anything that names
      sharing; a bridged argv is unchanged; the two words are spelled in one place.
- [ ] The tunnel has no `ClearAllForwardings` word and keeps its `-R`.
- [ ] The three tests of §7.1 changed as the table says, and no other existing test changed.
- [ ] The tests of §7.2 and §7.3 RED first, then GREEN; the legs of §7.4 green on the head sha's CI run (the three legs
      of change 1.1 among them), their RED and the mutations of §7.5 recorded with what was seen.
- [ ] A stranded master of the test rig ends by itself (§4.5), and the leftovers guard is green.
- [ ] The docs of §8, the three help articles in five languages each included; every sentence about an effect names its
      conditions.
- [ ] The coai code gate at `proceed`; the lead's Opus review of each story; CI green on the head sha; CodeRabbit read.
- [ ] Released as an extension patch with the owner's word; the plan promoted with its deviations; G1's plan told that
      its condition is met.

## 11. Build order and merge conditions

1. This plan through the coai plan gate (`review_plan` → `resolve` until `proceed`); the approval commit opens the ledger.
2. The two security specs by Fable (S1, S2); the cadence consult the gate orders, before the build (taken 2026-11-17,
   `59aa353c`: change 1.1, and the feasibility probe as the first step of S2).
3. S1, then S2 (the cornerstone), each from its spec, by a Sonnet coder, RED → GREEN; the lead's Opus review of each. Then
   S3, the documents, from its brief below.
4. `review_code` over the whole diff → `resolve` until `proceed`.
5. One PR from `fix/g2-no-connection-sharing`, a squash merge, after the head sha's checks exist and pass. The
   repository has five open PRs today (the cap is three): this PR needs the owner's word.
6. PR #365 changes files this plan also changes (§4.6). Whichever merges second merges `main` and runs both suites again; the
   bridged argv of §4.3 is the fixed point.
7. The release (a patch) with the owner's word, then the promotion PR. G1 is built after the merge of step 5.

## Stories

Three stories, no epics, one cornerstone; one branch, one PR, one code round over the whole diff. There is no stories
document. S1 and S2 are security work (what a call authenticates with, and what a closed bridge still reaches), so each
has a spec that Fable writes before its code (the row *Security judgement* of `subagent-models.md`, outside the quota);
S2 is also the one cornerstone. Per story: the spec or brief first, then a Sonnet coder (tests RED first, then the code),
then the lead's Opus review. The specs are written (2026-11-17):
[S1](PLAN_bridge_no_connection_sharing_S1_spec.md) and [S2](PLAN_bridge_no_connection_sharing_S2_spec.md). They keep no
change ledger: a change of one is an entry in this plan.

### S1 — Both argv builders turn connection sharing off

- **Goal.** The tunnel of a Remote Bridge and every run of `buildSshExecArgv` say `ControlPath=none` and
  `ControlMaster=no`, from one constant, before any other word that could name sharing (§4.1 to §4.3).
- **Scope.** `src/sshExecCommand.ts` (the constant, `BRIDGED_SSH_OPTIONS` built from it, the non-bridged branch),
  `src/sshBridge.ts` (`FIXED_OPTIONS` and its docblock). Tests: `sshExecCommand.test.ts` and `bridgeLinks.test.ts`
  (the three changes of §7.1), `sshBridge.test.ts` and `sshExecCommand.test.ts` (§7.2), one new test file for §7.3 and the
  scan of §7.2 item 6 (with a small helper module that the three test files share: the S1 spec, §3), and its line in the
  Windows job of `ci-extension.yml`. No call site, no document (S3).
- **Depends on.** Nothing unmerged.
- **Done when.** The assertions of §7.1 to §7.3 were watched failing on the unchanged code and pass; the first four
  mutations of §7.5 each turned red what the list names, on the unit and `-G` tests, and were restored; a bridged argv
  equals `main`'s; typecheck, lint and the whole suite green.
- **model:** fable writes the spec (security judgement); sonnet codes; opus reviews.

### S2 — The effect, seen on a real `ssh` and a real `sshd` (CORNERSTONE)

- **Goal.** What S1 sends is observed to work: a closed bridge serves nothing, the extension leaves no master, and a call
  that could join a master logs in by itself and fails on a wrong key or a wrong pin (§7.4). And the cost of that is
  shown as it is (change 1.1): a valid credential that needs a person fails on these roads, and one that needs nobody
  still works.
- **Why the cornerstone.** Everything the plan claims rests on this proof. An option in an argv is a request: the unit
  tests of S1 show that it is sent, and only a real client and server show what it does. A rig whose control legs do not
  share, whose probe reads a stale socket, or that leaves a master behind would turn the claim into a comment, and nothing
  else in the plan would notice.
- **Scope.** New `scripts/itestNoSharing.cjs` (the rig, the ten legs of §7.4, their teardown); the call from
  `scripts/ssh-agent-itest.cjs`; if the spec needs it, a second mode of `startSshd` in `scripts/itestSshd.cjs`. The
  comments of the constant and of `FIXED_OPTIONS` get what the legs showed. No product logic.
- **Depends on.** S1; an `sshd` the coder can run, or CI for the first run (§7.4). Its first step is the feasibility
  probe of §7.4, before any leg is built.
- **Done when.** The three control legs (K-A, K-C, K-I) show the fault in this rig and the seven production legs (P-B,
  P-D1 to P-D3, P-X, P-I1, P-I2) pass, on the head sha's CI run; the P legs were watched RED against `origin/main`'s two
  files (all seven: before S1, P-I2 rides the master too); every mutation of §7.5 is recorded with what the
  legs showed, each option alone included; no process and no file of the rig is left after a run and after a killed run (§4.5).
- **model:** fable writes the spec (the cornerstone, and security judgement); sonnet codes; opus reviews.

### S3 — The documents

- **Goal.** The documents say what S1 and S2 built and measured (§8), and the older plans carry the boundary of §6.
- **Scope, which is also the brief** (no spec; no code): the seven items of §8, in that order; then this plan: tick §10
  and record in the status paragraph what was built.
- **Depends on.** S1 and S2 (their final names, counts and what the legs showed).
- **Done when.** Every sentence describes code that is on the branch (each name found with `grep`); every sentence about
  an effect names the conditions of §2 or of S2's run; each of the three help articles changed in all five languages;
  `node .agents/conventions/tools/plan-lifecycle.mjs .` is clean; no sentence names a version, a sha or a count that the
  next commit moves, except the test counts.
- **model:** the brief is the list above (written with the split); sonnet writes the documents; opus reviews them.

Cornerstones: 1 of 1 — S2
