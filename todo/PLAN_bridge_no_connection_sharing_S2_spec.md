# PLAN — S2 spec: a real ssh and real sshd runs show what the two options do (SECURITY, CORNERSTONE)

> Status: **spec, 2026-11-17, by Fable; nothing built yet.** The feasibility probe of its step 1 was run for this spec and passed
> (L2). The cornerstone spec of the plan, and a security spec, written before its code (the rows *Cornerstone spec* and *Security
> judgement* of `subagent-models.md`). Story S2 of
> [PLAN_bridge_no_connection_sharing.md](PLAN_bridge_no_connection_sharing.md) (its §7.4, the real-leg half of §7.5, §4.5,
> `## Stories` S2, and entry 1.1 of its `## Plan changes`). This file is promoted together with the parent.
>
> Scope: `src_vs_code` — new `scripts/itestNoSharing.cjs`; `scripts/ssh-agent-itest.cjs` (its header, one `require`, one call);
> three docblocks: `src/sshExecCommand.ts` (the constant), `src/sshBridge.ts` (`FIXED_OPTIONS`), `src/sshBridgeManager.ts`.
> `scripts/itestSshd.cjs` does NOT change. No product logic, no workflow change, no document (S3). Branch
> `fix/g2-no-connection-sharing`, on top of the commit of S1. Each `file:line` below was read on `30364080`. Fable writes this
> spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/` unless they start with another folder. "The parent" is the plan linked above. "The S1 spec" is
[PLAN_bridge_no_connection_sharing_S1_spec.md](PLAN_bridge_no_connection_sharing_S1_spec.md); its names keep their meaning
(`NO_CONNECTION_SHARING`, "the two options", M1 to M14, K9, K10). This document's own names: the facts L1 to L14, the legs K-A,
P-B, K-C, P-D1, P-D2, P-D3, P-X, K-I, P-I1, P-I2 (a K leg is a control, a P leg runs the production argv), the checks 1 to 42, the
mutations N1 to N8, the break-its Y1 to Y12. This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`).

## What S2 builds, in one paragraph

S1 puts two option words into two argvs. That is a request to `ssh`, and a unit test can only show that the request is sent. S2
asks the receiver. One new script, section 9 of the SSH agent itest, starts real `sshd -d` runs on loopback and a real `ssh`
under a config file that shares connections, as a laptop's `~/.ssh/config` can. Three control legs take the two options OUT of
the production argv and show that this rig has the fault: the spawned `ssh` exits and a detached master serves the forward; with
a master up, a tunnel with a wrong key and a wrong pin rides it; a run whose key file needs a passphrase rides it. Seven
production legs run the argv the product builds, and the tunnels are started by the product's own `SshBridgeManager` and
`bridgeSpawner`: the forward is served while the tunnel runs and not after `stop()`; no master is made; with a master up each call
logs in to the server it names, and fails on a wrong pin and on a wrong key. Two of the legs show the cost that plan change 1.1
names: a valid key whose file needs a passphrase fails on a run (nobody is asked), and the same key in an `ssh-agent` works. The
first step is a feasibility probe: one production tunnel through `sshd -d`, before any other leg is built. The last step writes
what the legs showed into three comments of the product.

| File | Change | Where |
|---|---|---|
| `scripts/itestNoSharing.cjs` (new) | `liveNoSharing(check, out)`: the rig, ten legs, 42 checks, the teardown. 432 lines | §4 |
| `scripts/ssh-agent-itest.cjs` | the header says what section 9 is; one `require`; one call after section 8. 757 → 764 lines | §5 |
| `src/sshExecCommand.ts` | one paragraph in the docblock of `NO_CONNECTION_SHARING`: each option alone. 194 → 200 lines | §6 |
| `src/sshBridge.ts` | two sentences in the docblock of `FIXED_OPTIONS`. 382 → 384 lines | §6 |
| `src/sshBridgeManager.ts` | one paragraph in the file's docblock. 97 → 103 lines | §6 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a leg is not RED or GREEN
  as this document says, or the probe of step 1 fails: stop and tell the lead. Do not repair the parent or this document.
- **The repository's `scripts/itestSshd.cjs` is not edited**, also not for a run on this PC (it has no `/usr/sbin/sshd`). A run here
  is made on a COPY of the repository in the scratchpad folder (§2). PR #365 changes that file; this story must not collide.
- **Every wait has a ceiling.** Each timeout of §4 is part of the spec. No `await` on a child without one.
- **Kill only what you started, by its pid.** Never by name. After a run, and after a run you killed, look (§2, the last
  block) and remove what is left by its exact name.
- **A control leg takes the two options OUT; nothing in the script adds them.** The production legs run the argv the compiled
  builders return, unchanged. A leg with a hand-written production argv is a defect of this story.
- **A tunnel is started by the compiled `SshBridgeManager` over the compiled `bridgeSpawner`**, so `stop()` is the product's. Only
  P-D2 and P-D3 use `launch`: they read `ssh`'s stderr, and the spawner starts its child with no stdio.
- **`ControlPersist` in the rig is 60 seconds, never `yes`.** A master of a killed run must end by itself (the parent's §4.5).
- **The script makes no temp path of its own**: one `ownedDir` under `shortSocketRoot()`, everything inside it
  (`test/harnessSites.test.ts` reads every script). The remote end of every forward is a path inside that folder.
- **No product logic changes.** The three product files get comments only (§6). After §6, `git diff -w` of the three files shows
  comment lines only. The comments say what the legs SHOWED, with the conditions. If your runs of N4 and N5 show something else
  than L10: stop and tell the lead, and write nothing the legs did not show.
- **The comments of `sshBridge.ts` and `sshBridgeManager.ts` do not spell the options as `Name=value`** (G11 of the S1 spec).
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Node only.** No Python. Write files with the Edit or Write tool, not with a shell heredoc.

## Facts read on `30364080` and measured, that this spec uses

| # | Fact | Where |
|---|---|---|
| L1 | `sshd -d` serves exactly ONE connection, so every login needs a run of its own (`scripts/itestSshd.cjs:2`). `startSshd(scope, sshdDir, hostKeyPath, authorizedKeys, extraConfig)` (`:89-115`) writes `sshd_config` and `known_hosts` into `sshdDir`, starts `SSHD -d -e -f <config>` on a free loopback port, waits for `Server listening` and answers `{ sshd, port, knownHosts }` or `{ sshd, failure }`. `launch(scope, exe, args, options)` (`:26-57`) starts a child that the scope ends, and collects `stdout`, `stderr`, `exited`, `done`, `closed`. `endChild(result)` (`:141-150`) ends a child by its pid and waits, 5 s and 5 s. `SSHD` is `/usr/sbin/sshd` (`:13`) | `scripts/itestSshd.cjs` |
| L2 | **The feasibility probe, run 2026-11-17 for this spec: passed.** One tunnel with the argv of `buildBridgeArgv` (the product as it is at `30364080`, under an empty `-F` file), started by the compiled `SshBridgeManager` and `bridgeSpawner`, against the unchanged `startSshd` (`sshd -d`, OpenSSH 10.2p1, run by the user). The remote socket was there after 104 ms. Two connects from `node` to that socket each read the line of the test's loopback listener, and `exited` had not settled. `sshd` logged `Accepted publickey`, `streamlocal-forward listen path …` and one `forwarded-streamlocal` (OpenSSH's channel type) channel per connect. After `stop()`, `exited` settled with 0 within about 50 ms and the next connect answered `ECONNREFUSED`; the socket FILE stayed (`sshd` does not unlink it). So `sshd -d` is enough for a unix-socket `-R`: the one connection carries every reverse-forward channel, and a connect from `node` is no second `ssh` connection. `startSshd` needs no second mode | a scratch copy |
| L3 | The pattern this section extends: `liveNoAgentForward` (`scripts/itestForwardAgent.cjs:165-205`): the skip on Windows, a missing `sshd` fails where `CI=true`, a `sectionScope()` and one `ownedDir(section, …, { parent: shortSocketRoot() })` (`:180-181`), the section closed in a `finally`. The harness calls it with its `check` and the folder of the compiled product (`scripts/ssh-agent-itest.cjs:66-71`, `:219`) | the scripts |
| L4 | `SshBridgeManager.start` (`src/sshBridgeManager.ts:65-79`) spawns and keeps the row until `exited` settles; `stop` (`:81-89`) drops the row FIRST, then kills, and answers `false` when there is no row; `dispose` (`:92-96`) stops every row. `bridgeSpawner` (`src/bridgeSpawner.ts:77-80`) starts the child with `stdio: 'ignore'` and the environment it is given; `exited` is the code of the child's `'exit'` (`:61-73`) | the product |
| L5 | **Measured:** an `ssh -N` that gets SIGTERM exits with code 0. So after `stop()` a production tunnel's `exited` is 0, the same number as a tunnel that left its work to a master and exited by itself. The exit CODE does not tell them apart. The legs tell them apart by WHEN `exited` settles: a production tunnel is `'running'` while the forward is served | section 9 |
| L6 | **Measured (the fault, in this rig):** under a config with `ControlMaster auto`, a fixed `ControlPath` and `ControlPersist 60`, the tunnel's argv without the two options exits with 0 in under a second; the forward is then served; the control socket exists; `stop()` answers `false` (the row is gone) and the forward is still served; `ssh -O exit` ends the master and removes the socket. With a master up, a tunnel without the two options and with a wrong key and a wrong pin exits with 0, its forward is served, and the `sshd` it names logs no connection | section 9 |
| L7 | **Measured (time):** section 9 alone takes 2.0 to 2.5 s when every leg passes (eight runs in a row, all 42 checks `ok` each time) and 7.9 to 8.6 s on the unchanged product. The whole `ssh-agent-itest.cjs` with section 9 takes 21 to 23 s and prints 119 `ok` lines, 42 of them section 9's | a scratch copy |
| L8 | **Measured (size):** one run makes 1 owned folder with 52 entries, 11.8 kB together: four key pairs and one copy of a private key, `authorized_keys`, three client configs, two wrong `known_hosts` files, eleven `sshd` folders with a config, a `known_hosts` and a pid file each, and sockets. Eleven `sshd -d` runs, at most two alive at once; two detached masters (K-A's, and the group's); one `ssh-agent`, for P-I2 only; one loopback listener | section 9 |
| L9 | **Measured (RED):** with `src/sshExecCommand.ts` and `src/sshBridge.ts` as they are at `b84416aa`, 26 checks are `ok` and 16 are `FAIL`: the sixteen of §7. Every control check is `ok` | a scratch copy |
| L10 | **Measured (each option alone, OpenSSH 10.2p1):** with `ControlPath=none` alone, all 42 checks are `ok`. With `ControlMaster=no` alone, 12 are `FAIL`: P-B is `ok` (this `ssh` does not become a master), and with a master up every production leg rides it (P-D1, P-D2, P-D3, P-X, P-I1, P-I2). The parent's §7.5 expected exactly this from ssh_config(5) | a scratch copy |
| L11 | **Measured (a killed run):** SIGTERM to the harness at 0.7 s (inside K-A, its detached master up) and at 1.5 s (inside the master group): exit 143, and 300 ms later no folder of the run and no process of the rig is left. SIGKILL at 0.7 s: the detached master of K-A and the processes of its `sshd` are alive at 1 s, 30 s and 58 s and gone at 62 s (`ControlPersist 60`); no other process of the rig is left; the folder and its claim file stay, for the janitor | a scratch copy |
| L12 | The environment of every `ssh` of the rig: the harness's, without `SSH_AUTH_SOCK`. A `-F` file replaces `~/.ssh/config` and the system-wide file. Every leg passes `-i`, and `ssh` tries its default identity files only when no identity file is named. So the only keys an `ssh` of the rig can offer are the leg's own, and in P-I2 the agent's | ssh(1), ssh_config(5), read |
| L13 | CI: the Ubuntu job installs `openssh-server` when the image has no `/usr/sbin/sshd` and runs `npm run itest:ssh-agent` (`.github/workflows/ci-extension.yml:162-168`); that `sshd` runs as the runner's user, not as root (`:158-161`). Its version is the runner image's. It was NOT measured here | the workflow |
| L14 | The leftovers guard (`leftovers-check.mjs --profile node --token creds`) is clean with the new script, and `test/harnessSites.test.ts` is green | a scratch copy |

All measurements: 2026-11-17, OpenSSH 10.2p1 for the client and for a user-run `sshd` (unpacked from the distribution's package,
§2), loopback, one user, Node 26.12.1, Linux (WSL2), on a copy of the repository at `30364080` with the product of the S1 spec.

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.**
2. `npm run itest:ssh-agent` — it compiles, lowers itself and runs `scripts/ssh-agent-itest.cjs`. On a machine with no
   `/usr/sbin/sshd` it prints `skip  live no-connection-sharing legs — sshd not installed` and section 9 proves nothing: use §2.
3. `node $LP npm run typecheck`, `node $LP npm run lint`, `npm test`.

## 1. Step 1: the feasibility probe

The question: does `sshd -d`, which serves one connection, serve a unix-socket `-R` forward that the test can read through,
and does the product's own manager end it? If not, every leg of this story stands on nothing. The cadence consultant
(`59aa353c`) asked for this probe before the legs are built. It was run for this spec and passed (L2).

You repeat it as the first thing you build, in your environment, in this form: **the script of §4 with ONE leg, P-B.** Write
the file of §4 with these parts only: the header comment, the `require` lines, the constants, and the functions `tool`, `within`,
`readThrough`, `served`, `sshdTail`, `entityOn`, `sshdFor`, `sharingConfig`, `tunnelArgv`, `startTunnel`, `settledAfter`,
`tunnelLivesAndDies`, `productionTunnel`, `makeKeys`, `startListener` and `liveNoSharing`, where the three calls of the legs
are, for now, one:

```js
    await productionTunnel(check, rig);
```

Add the call of §5. Run it (§2 on this PC). Expected: section 9 prints eight `ok` lines, the checks 1, 2 and 9 to 14 of §8:
the keys, the passphrase, `p-b: its sshd started`, and the five of P-B.

- All eight `ok`: the probe passed. Commit it (c2 of §9) and go on.
- `P-B: the production tunnel serves the forward while its ssh runs` is `FAIL` with `read "error: ENOENT"` or a timeout, and
  the tail of `sshd` shows no `streamlocal-forward`: this `sshd -d` does not serve the forward. **Stop and tell the lead.** The
  parent's fallback is a second mode of `startSshd`; that is a decision of the lead, because PR #365 edits the same file.
- Any other `FAIL`: read its detail; if it is not a fault of your copy (§2), stop and tell the lead.

## 2. A run on a machine with no `sshd` (this PC)

`/usr/sbin/sshd` is absent here and nothing may be installed into the system. A user-run `sshd` from the distribution's package,
and a COPY of the repository, make the legs run. Nothing of this is committed. `$SP` is the scratchpad folder of the session;
`$WT` is the worktree.

**2.1 The `sshd`.** Three NEW, EMPTY folders. The packages are data: they are unpacked into a folder that holds no script.

```bash
mkdir "$SP/g2-deb" "$SP/g2-sshd" "$SP/g2-run"
(cd "$SP/g2-deb" && apt-get download openssh-server libwrap0)
for deb in "$SP"/g2-deb/*.deb; do dpkg-deb -x "$deb" "$SP/g2-sshd"; done
```

Then one wrapper file, `$SP/g2-run/sshd-wrap.sh`, made executable (`chmod +x`), with `$SP` written out:

```sh
#!/bin/sh
# sshd from the unpacked package. Its helper sshd-session needs libwrap, which is not installed here: the library path is set
# for sshd and its children only. exec keeps the pid, and sshd must be started by an absolute path.
LD_LIBRARY_PATH=$SP/g2-sshd/usr/lib/x86_64-linux-gnu exec $SP/g2-sshd/usr/sbin/sshd "$@"
```

**2.2 The copy.** The WHOLE repository, never a part of it (`git-workflow.md`, rule 6), with the shared rules and
`node_modules` linked in:

```bash
mkdir "$SP/g2-copy" && git -C "$WT" archive HEAD | tar -x -C "$SP/g2-copy"
rmdir "$SP/g2-copy/.agents/conventions"
ln -s "$WT/.agents/conventions" "$SP/g2-copy/.agents/conventions"
ln -s "$WT/src_vs_code/node_modules" "$SP/g2-copy/src_vs_code/node_modules"
```

`git archive HEAD` holds what is committed. Copy each file you changed and did not commit yet into the copy, with `cp`, before
you compile the copy.

**2.3 Two edits in the COPY's `scripts/itestSshd.cjs`, and nowhere else.** Line 13 names the wrapper:
`const SSHD = '<$SP>/g2-run/sshd-wrap.sh';`. And in the config list of `startSshd`, after the line
`'KbdInteractiveAuthentication no',` (`:106`), two more lines, which an `sshd` 10.x that was not installed needs:

```js
      'SshdSessionPath <$SP>/g2-sshd/usr/lib/openssh/sshd-session',
      'SshdAuthPath <$SP>/g2-sshd/usr/lib/openssh/sshd-auth',
```

**2.4 Compile and run, in `$SP/g2-copy/src_vs_code`.** `node ../.agents/conventions/tools/low-priority.mjs node node_modules/typescript/bin/tsc -p ./`
(read its exit), then the whole script: `node --import ./scripts/lower-priority.mjs scripts/ssh-agent-itest.cjs`. For section 9
alone (2 s, not 21 s), a runner of 16 lines, `$SP/g2-run/run9.cjs`, called as `node "$SP/g2-run/run9.cjs" "$SP/g2-copy/src_vs_code"`:

```js
// Runs section 9 alone, the way `ssh-agent-itest.cjs` would call it: node run9.cjs <scratch copy>/src_vs_code
const path = require('path');
const ROOT = process.argv[2];
const harnessScope = require(path.join(ROOT, 'scripts', 'lib', 'harnessScope.cjs'));
const { liveNoSharing } = require(path.join(ROOT, 'scripts', 'itestNoSharing.cjs'));
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}
harnessScope.run(async () => {
  const t0 = Date.now();
  await liveNoSharing(check, path.join(ROOT, 'out'));
  console.log(`\n${failures} check(s) failed; ${Date.now() - t0} ms`);
  return failures === 0 ? 0 : 1;
});
```

**2.5 After every run, and at the end.** Nothing of the rig may be left:

```bash
ls /tmp | grep 'testsToDelete-u[0-9]*-creds-nsh'                              # expected: nothing
ps -u "$(id -u)" -o pid,args | grep -E 'sshd|ssh-agent|ssh -F' | grep -v grep   # expected: nothing of this rig
```

A folder of a run you killed with SIGKILL is removed by its exact name, with its `.owner` file beside it; a process that is left
is ended by its pid. At the end of the story the four folders of `$SP` are removed.

## 3. The rig and the legs

One owned folder under the short socket root (a unix socket path has a length limit). In it: a host key; `user_key`, authorized;
`wrong_key`, authorized nowhere (its public half is also the "wrong pin": a `known_hosts` line with a key that is not the
server's); `pass_key`, authorized, whose file gets a passphrase nobody types, and `pass_key_open`, a copy from before the
passphrase, which only the agent of P-I2 reads. One loopback listener answers one known line and closes: a forward is SERVED
when that line is read through the remote socket. A config "as a laptop has it" is three lines under `Host *`:
`ControlMaster auto`, a fixed `ControlPath` inside the folder, `ControlPersist 60`. The path is fixed on purpose: whatever port an
argv names, a client that shares joins the master that holds that file, which is the sharpest form of the fault.

| Leg | The argv, and what is up | What the checks say (their numbers in §8) |
|---|---|---|
| K-A, control | the tunnel's argv with the two options taken out; its own config; no master before | the spawned `ssh` exits with 0 (4); the forward is served after that (5); the control socket exists (6); `stop()` changes nothing (7); `ssh -O exit` ends the master (8) |
| P-B | the production tunnel; its own config; no master before | the forward is served WHILE `exited` is not settled (10); its `sshd` accepted the key (11); the control path is not made while it runs (12); `stop()` ends it (13); after that the forward is not served (14) |
| the master | a plain `ssh … 'sleep 120'` to `sshd` A under the group's config, as a person opens one | its control socket exists (16) |
| K-C, control | the tunnel's argv with the two options taken out, for B, with `wrong_key` and the wrong pin | exit 0 (18); the forward is served (19); B saw no connection (20) |
| P-D1 | the production tunnel for B | served while it runs (22); B accepted the key (23); `stop()` ends it (24); not served after (25) |
| P-D2 | the production tunnel for B with the wrong pin, by `launch` | exit 255 and `Host key verification failed` (27); it reached B (28) |
| P-D3 | the production tunnel for B with `wrong_key`, by `launch` | exit 255 and `Permission denied` (30); it reached B (31) |
| P-X | the production run off a bridge (`buildSshExecArgv`, a key entry, B's pin), `printenv SSH_CONNECTION` | exit 0, the printed line ends in B's port, B accepted the key (33) |
| K-I, control of 1.1 | that run with the two options taken out and `-i pass_key`; no agent | exit 0, the line ends in A's port, B saw no connection (35): the credential that needs a person "worked" through the master |
| P-I1 (change 1.1) | the production run with `-i pass_key`; no agent | exit 255 and `Permission denied` (37); it reached B, which accepted no key (38) |
| P-I2 (change 1.1) | the same, with the key in a real `ssh-agent` of the run's environment | the agent holds the key (39); exit 0, the line ends in B's port, B accepted the key (41) |
| the end of the group | | the master's client is still running and its socket is still there (42) |

Every leg that connects has an `sshd` of its own: `k-a`, `p-b`, `a`, and one B each for `k-c`, `p-d1`, `p-d2`, `p-d3`, `p-x`,
`k-i`, `p-i1`, `p-i2`. Eleven runs. A control's B must see no connection; a production leg's B must see one. So a line in a log
can only come from its own leg.

Why P-I1 and P-I2 are a pair. P-I1 alone could fail for a reason that has nothing to do with a passphrase: a key that is not
authorized, a broken `sshd`. P-I2 names the SAME key file on a fresh `sshd` and is accepted, so the key is valid; and K-I shows
that before S1 the same run "worked". What is left as the cause of P-I1 is the one thing that differs: nobody can be asked
(`BatchMode=yes`), and nothing else holds the key.

## 4. New `scripts/itestNoSharing.cjs`

The whole file. Its timeouts: a tool 15 s; a connect through a forward 5 s; `within` as each call says; a client 20 s and 2 s for
its last output; a tunnel's exit 10 s (a control) or 5 s (after `stop()`); the master's socket 15 s.

```js
// Section 9 of `ssh-agent-itest.cjs` (G2, `PLAN_bridge_no_connection_sharing.md` §7.4), in a file of its own so that script stays
// under the 800-line limit.
//
// The extension's own `ssh` calls must share no connection, whatever the laptop's `~/.ssh/config` says. The product sends
// `NO_CONNECTION_SHARING` (`sshExecCommand.ts`: `ControlPath=none`, `ControlMaster=no`) in the tunnel of a Remote Bridge and in every
// run, and a unit test can only show that the options are IN the argv (`testing.md`: a sent option is not a measured protection).
// So this asks a real `ssh` and real `sshd -d` runs, under a config file with `ControlMaster auto`, a FIXED `ControlPath` and a
// finite `ControlPersist`:
//   K-A  (control) the tunnel's argv with the two options taken out, no master before: the spawned ssh exits with 0, a detached
//        master holds the forward, and the product's `stop()` changes nothing;
//   P-B  the production tunnel: it serves the forward while it runs, makes no control socket, and `stop()` ends the forward;
//   then a master on sshd A, opened as a person would (a plain `ssh`), and for each leg below an sshd B of its own:
//   K-C  (control) the tunnel without the two options, for B, with a WRONG key and a WRONG pin: it rides the master, exit 0, the
//        forward is served and B sees no connection;
//   P-D1 the production tunnel for B: B accepts the key, the forward is served, `stop()` ends it;
//   P-D2 the same with the wrong pin: exit 255, `Host key verification failed`;
//   P-D3 the same with the wrong key: exit 255, `Permission denied`;
//   P-X  the production run off a bridge (`buildSshExecArgv`), for B: the command ran on B;
//   K-I  (control) that run without the two options, with a key file that has a passphrase and is in no agent: it rides the master;
//   P-I1 the production run with that key: exit 255, `Permission denied` (a credential that needs a person fails; plan change 1.1);
//   P-I2 the same with the key in an `ssh-agent` of the run's environment: the command ran on B (what needs nobody still works).
//        The agent lives for that leg only.
//
// POSIX only, like sections 5, 7 and 8; with `CI=true` a missing sshd FAILS. `sshd -d` serves one connection, so every leg that
// connects has an sshd of its own. A tunnel is started by the product's own `SshBridgeManager` and `bridgeSpawner`, so `stop()` is
// the product's. Teardown: the tunnels, `ssh -O exit` for the detached master of K-A, the master, every sshd by its pid, the agent of
// P-I2, the listener, the folder. A master that outlives a killed run ends by itself: `ControlPersist` is 60 s here, never `yes`.
const fs = require('fs');
const net = require('node:net');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, startSshd, endChild } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

/** The two options, spelled once more here on purpose: a control leg takes them OUT of a production argv. Nothing here adds them. */
const TWO = ['ControlPath=none', 'ControlMaster=no'];

/** What the test's listener answers: a forward is SERVED when this line is read through the remote socket. */
const LINE = 'creds-g2-forward\n';

/** What a connection leaves in `sshd -d`'s stderr. */
const CONNECTED = /Connection from 127\.0\.0\.1/;
const ACCEPTED = /Accepted publickey/;

const destination = `${os.userInfo().username}@127.0.0.1`;

/** The PATH's OpenSSH tool with `args`; resolves its trimmed stderr on failure, `undefined` on success. */
function tool(name, args, env) {
  return new Promise((resolve) => {
    // The PATH lookup is on purpose, as in section 8: the PATH's OpenSSH tools are the ones the extension starts.
    execFile(name, args, { timeout: 15_000, env }, (error, _out, stderr) => { // NOSONAR: a CI rig, the PATH's OpenSSH is the tool under test (see above)
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

/** Resolves `true` when `probe()` is true, `false` when `ms` have passed first. Polls every 50 ms. */
async function within(ms, probe) {
  const deadline = Date.now() + ms;
  while (!(await probe())) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

/** One connect to the remote end of a forward: the text read through it, or the error's code. Bounded: 5 s. */
function readThrough(socketPath) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    let text = '';
    const timer = setTimeout(() => socket.destroy(new Error('timeout')), 5_000);
    socket.on('data', (chunk) => {
      text += chunk;
    });
    socket.on('error', (error) => {
      text = `error: ${error.code ?? error.message}`;
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(text);
    });
  });
}

/** Whether the forward behind `socketPath` is served now. */
const served = async (socketPath) => (await readThrough(socketPath)) === LINE;

/** The last lines of a started sshd's stderr, for a failure message. */
const sshdTail = (started) => started.sshd.stderr.trim().split(/\r?\n/).slice(-12).join('\n');

/** The entry the production argv is built for: the loopback address, this user and the sshd's port. */
const entityOn = (port) => ({ id: 'e-nsh', name: 'nsh', host: '127.0.0.1', user: os.userInfo().username, port, isSshEnabled: true });

/** `argv` with every `-o <one of TWO>` pair taken out: what the builders sent before G2. */
function withoutTheTwo(argv) {
  const gone = new Set(argv.flatMap((arg, i) => (arg === '-o' && TWO.includes(argv[i + 1]) ? [i, i + 1] : [])));
  return argv.filter((_, i) => !gone.has(i));
}

/** A throwaway sshd in a folder of its own, or `undefined` after a failed check that names why. */
async function sshdFor(check, rig, name) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  const started = await startSshd(rig.scope, dir, rig.hostKey, rig.authorizedKeys);
  check(`${name}: its sshd started`, started.failure === undefined, started.failure);
  return started.failure === undefined ? started : (await endChild(started.sshd), undefined);
}

/** A config as a laptop that shares connections has it, with a control path of its own. `ControlPersist` is finite on purpose. */
function sharingConfig(rig, name) {
  const config = path.join(rig.dir, `${name}.config`);
  const control = path.join(rig.dir, `${name}.cm`);
  fs.writeFileSync(config, `Host *\n  ControlMaster auto\n  ControlPath ${control}\n  ControlPersist 60\n`);
  return { config, control };
}

/** A `known_hosts` file that names `started`'s address with a key that is NOT its host key: the wrong pin. */
function wrongPin(rig, started, name) {
  const file = path.join(rig.dir, `${name}.known_hosts`);
  const stranger = fs.readFileSync(`${rig.wrongKey}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
  fs.writeFileSync(file, `[127.0.0.1]:${started.port} ${stranger}\n`);
  return file;
}

/** The production argv of a tunnel to `started`, whose forward ends at the test's listener. */
function tunnelArgv(rig, started, remote, parts = {}) {
  const { buildBridgeArgv } = require(path.join(rig.out, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(rig.out, 'sshCommand.js'));
  const options = { port: rig.listenerPort, remote: { path: remote }, keyPath: parts.key ?? rig.userKey, knownHostsFile: parts.pin ?? started.knownHosts, auth: 'key' };
  return buildBridgeArgv(entityOn(started.port), options, isSafeSshTarget);
}

/** The production argv of a run off a bridge on `started`: a key entry, as *Run with Secrets* and an agent's `ssh:exec` build it. */
function runArgv(rig, started, key) {
  const { buildSshExecArgv } = require(path.join(rig.out, 'sshExecCommand.js'));
  return buildSshExecArgv(entityOn(started.port), key, 'printenv SSH_CONNECTION', 'key', { knownHostsFile: started.knownHosts });
}

/** A tunnel started as the product starts one: `SshBridgeManager.start` over `bridgeSpawner`. `exit` is `'running'` until `exited` settles. */
function startTunnel(rig, config, argv, remote) {
  const { SshBridgeManager } = require(path.join(rig.out, 'sshBridgeManager.js'));
  const { bridgeSpawner } = require(path.join(rig.out, 'bridgeSpawner.js'));
  const tunnel = { exit: 'running', errors: [], remote };
  tunnel.manager = new SshBridgeManager(bridgeSpawner({ report: (error) => tunnel.errors.push(String(error)) }));
  rig.scope.after(() => tunnel.manager.dispose()); // a signal in the middle of a leg ends the tunnel too
  const bridge = tunnel.manager.start('nsh', remote, 'ssh', ['-F', config, ...argv], rig.env);
  tunnel.exited = bridge.process.exited.then((code) => {
    tunnel.exit = code;
  });
  return tunnel;
}

/** Resolves when `promise` has, or `ms` after this call — whichever is first; the timer does not outlive the race. */
function settledAfter(promise, ms) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

/** A real ssh with `argv` under `config`: its exit code, what it printed and what it said. Bounded: 20 s. */
async function runClient(rig, config, argv, env = rig.env) {
  const client = launch(rig.scope, 'ssh', ['-F', config, ...argv], { env });
  try {
    const code = await settledAfter(client.done, 20_000);
    await settledAfter(client.closed, 2000); // output that arrived between `exit` and `close`
    return { code: code ?? 'timeout', stdout: client.stdout.trim(), stderr: client.stderr.trim() };
  } finally {
    await endChild(client);
  }
}

/** K-A: without the two options the spawned ssh is NOT the connection: it exits, a detached master serves the forward, and `stop()` changes nothing. */
async function controlDetachedMaster(check, rig) {
  const started = await sshdFor(check, rig, 'k-a');
  if (started === undefined) {
    return;
  }
  const { config, control } = sharingConfig(rig, 'k-a');
  const remote = path.join(rig.dir, 'k-a.sock');
  const tunnel = startTunnel(rig, config, withoutTheTwo(tunnelArgv(rig, started, remote)), remote);
  try {
    await settledAfter(tunnel.exited, 10_000);
    check('K-A control: without the two options the spawned ssh exits with 0 while the bridge is wanted', tunnel.exit === 0, `exit ${tunnel.exit}\n${sshdTail(started)}`);
    check('K-A control: and the forward is served after that exit, by a detached master', await within(5_000, () => served(remote)), await readThrough(remote));
    check('K-A control: the master left its control socket', fs.existsSync(control), control);
    tunnel.manager.stop('nsh');
    await new Promise((resolve) => setTimeout(resolve, 300));
    check("K-A control: the product's stop() changes nothing: the forward is still served", await served(remote), await readThrough(remote));
  } finally {
    const said = await tool('ssh', ['-F', config, '-O', 'exit', '-p', String(started.port), destination], rig.env);
    check('K-A: the detached master is ended by `ssh -O exit`, and its control socket is gone', await within(5_000, () => !fs.existsSync(control)), said);
    await endChild(started.sshd);
  }
}

/**
 * A production tunnel that is up: the forward is served WHILE the spawned ssh runs, and `stop()` ends both. Used by P-B and P-D1.
 * `control` is the control path of a config with no master yet (P-B): it is looked at while the tunnel runs, because a master
 * removes its socket when it ends.
 */
async function tunnelLivesAndDies(check, rig, name, config, started, control) {
  const remote = path.join(rig.dir, `${name}.sock`);
  const tunnel = startTunnel(rig, config, tunnelArgv(rig, started, remote), remote);
  const up = await within(10_000, () => tunnel.exit !== 'running' || served(remote));
  check(`${name}: the production tunnel serves the forward while its ssh runs`, up && tunnel.exit === 'running' && (await served(remote)), `exit ${tunnel.exit}; read ${JSON.stringify(await readThrough(remote))}\n${sshdTail(started)}`);
  check(`${name}: it logged in by itself: its sshd accepted the key`, ACCEPTED.test(started.sshd.stderr), sshdTail(started));
  if (control !== undefined) {
    check(`${name}: it became no master: the control path of its config is not made while it runs`, !fs.existsSync(control), control);
  }
  const stopped = tunnel.manager.stop('nsh');
  await settledAfter(tunnel.exited, 5_000);
  check(`${name}: stop() ends the spawned ssh`, stopped && tunnel.exit !== 'running', `stop() answered ${stopped}; exit ${tunnel.exit}; ${tunnel.errors.join('; ')}`);
  check(`${name}: and after stop() the forward is not served`, await within(3_000, async () => !(await served(remote))), await readThrough(remote));
}

/** P-B: no master before. */
async function productionTunnel(check, rig) {
  const started = await sshdFor(check, rig, 'p-b');
  if (started === undefined) {
    return;
  }
  const { config, control } = sharingConfig(rig, 'p-b');
  try {
    await tunnelLivesAndDies(check, rig, 'P-B', config, started, control);
  } finally {
    await endChild(started.sshd);
  }
}

/** The master: a plain ssh to A under the sharing config, as a person opens one, held open until the group is over. */
async function startMaster(rig, a, mux) {
  const argv = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${a.knownHosts}`, '-i', rig.userKey, '-p', String(a.port), destination, 'sleep 120'];
  const master = launch(rig.scope, 'ssh', ['-F', mux.config, ...argv], { env: rig.env });
  return { master, up: await within(15_000, () => fs.existsSync(mux.control)) };
}

/** K-C: with a master up, the tunnel without the two options rides it: a wrong key and a wrong pin are not even looked at. */
async function controlRidesMaster(check, group) {
  const { rig, mux } = group;
  const b = await sshdFor(check, rig, 'k-c');
  if (b === undefined) {
    return;
  }
  const remote = path.join(rig.dir, 'k-c.sock');
  const argv = withoutTheTwo(tunnelArgv(rig, b, remote, { key: rig.wrongKey, pin: wrongPin(rig, b, 'k-c') }));
  const tunnel = startTunnel(rig, mux.config, argv, remote);
  try {
    await settledAfter(tunnel.exited, 10_000);
    check('K-C control: with a master up, the tunnel without the two options ends at once, with a WRONG key and a WRONG pin', tunnel.exit !== 'running', `exit ${tunnel.exit}`);
    check('K-C control: its forward is served, through the master', await within(5_000, () => served(remote)), await readThrough(remote));
    check('K-C control: and the sshd it named saw no connection', !CONNECTED.test(b.sshd.stderr), sshdTail(b));
  } finally {
    tunnel.manager.dispose();
    await endChild(b.sshd);
  }
}

/** P-D1: with the master up, the production tunnel logs in to B by itself. */
async function productionBesideMaster(check, group) {
  const b = await sshdFor(check, group.rig, 'p-d1');
  if (b === undefined) {
    return;
  }
  try {
    await tunnelLivesAndDies(check, group.rig, 'P-D1', group.mux.config, b);
  } finally {
    await endChild(b.sshd);
  }
}

/** P-D2 and P-D3: with the master up, the production tunnel fails on a wrong pin and on a wrong key. Started with `launch`: its stderr is read. */
async function productionRefuses(check, group, name, parts, expected) {
  const { rig, mux } = group;
  const b = await sshdFor(check, rig, name.toLowerCase());
  if (b === undefined) {
    return;
  }
  try {
    const wrong = parts.pin === 'wrong' ? { pin: wrongPin(rig, b, name.toLowerCase()) } : { key: rig.wrongKey };
    const result = await runClient(rig, mux.config, tunnelArgv(rig, b, path.join(rig.dir, `${name.toLowerCase()}.sock`), wrong));
    check(`${name}: with a master up, the production tunnel with ${parts.what} fails: exit 255 and \`${expected.source}\``, result.code === 255 && expected.test(result.stderr), JSON.stringify(result));
    check(`${name}: and it reached the sshd it named`, CONNECTED.test(b.sshd.stderr), sshdTail(b));
  } finally {
    await endChild(b.sshd);
  }
}

/** One run off a bridge for an sshd B of its own, under the master's config; `takeOut` builds the control. */
async function oneRun(check, group, name, key, options = {}) {
  const b = await sshdFor(check, group.rig, name.toLowerCase());
  if (b === undefined) {
    return undefined;
  }
  try {
    const argv = runArgv(group.rig, b, key);
    const result = await runClient(group.rig, group.mux.config, options.takeOut ? withoutTheTwo(argv) : argv, options.env);
    return { ...result, port: b.port, connected: CONNECTED.test(b.sshd.stderr), accepted: ACCEPTED.test(b.sshd.stderr), tail: sshdTail(b) };
  } finally {
    await endChild(b.sshd);
  }
}

/** Whether a run's one printed line, `SSH_CONNECTION`, ends in `port`: the server the command ran on. */
const ranOn = (result, port) => result !== undefined && result.code === 0 && result.stdout.split(/\s+/).at(-1) === String(port);

/** P-X, K-I, P-I1, P-I2: the runs off a bridge. */
async function runLegs(check, group) {
  const { rig, a } = group;
  const plain = await oneRun(check, group, 'P-X', rig.userKey);
  check('P-X: with a master up, the production run off a bridge ran on the sshd it named: SSH_CONNECTION ends in its port', ranOn(plain, plain?.port) && plain.accepted, JSON.stringify(plain));

  const rides = await oneRun(check, group, 'K-I', rig.passKey, { takeOut: true });
  check('K-I control: without the two options, a run whose key file needs a passphrase rides the master: exit 0, SSH_CONNECTION ends in the MASTER\'s port', ranOn(rides, a.port) && !rides.connected, JSON.stringify(rides));

  const needsPerson = await oneRun(check, group, 'P-I1', rig.passKey);
  check('P-I1: the production run with that key fails: exit 255 and `Permission denied` (a credential that needs a person does not work on this road)', needsPerson?.code === 255 && /Permission denied/.test(needsPerson.stderr), JSON.stringify(needsPerson));
  check('P-I1: it reached the sshd it named, which accepted no key', needsPerson?.connected === true && !needsPerson.accepted, needsPerson?.tail);

  await runWithAgent(check, group);
}

/** P-I2: the same run with the key in an ssh-agent of its environment. The agent is a real one and lives for this leg only. */
async function runWithAgent(check, group) {
  const { rig } = group;
  const env = { ...rig.env, SSH_AUTH_SOCK: rig.agentSocket };
  const agent = launch(rig.scope, 'ssh-agent', ['-D', '-a', rig.agentSocket], { env: rig.env });
  try {
    const up = await within(5_000, () => fs.existsSync(rig.agentSocket));
    const added = up ? await tool('ssh-add', [rig.passKeyOpen], env) : 'the agent made no socket';
    check('P-I2: a real ssh-agent holds the key whose file needs a passphrase', added === undefined, `${added} ${agent.stderr.trim()}`);
    const fromAgent = await oneRun(check, group, 'P-I2', rig.passKey, { env });
    check('P-I2: the same run with that key in an ssh-agent of its environment ran on the sshd it named (what needs nobody still works)', ranOn(fromAgent, fromAgent?.port) && fromAgent.accepted, JSON.stringify(fromAgent));
  } finally {
    await endChild(agent);
  }
}

/** The master group: one master on A, then every leg with an sshd B of its own. */
async function masterGroup(check, rig) {
  const a = await sshdFor(check, rig, 'a');
  if (a === undefined) {
    return;
  }
  const mux = sharingConfig(rig, 'mux');
  let master;
  try {
    const started = await startMaster(rig, a, mux);
    master = started.master;
    check('a master connection to A is up: its control socket exists', started.up, `${master.stderr.trim()}\n${sshdTail(a)}`);
    if (!started.up) {
      return;
    }
    const group = { rig, a, mux };
    await controlRidesMaster(check, group);
    await productionBesideMaster(check, group);
    await productionRefuses(check, group, 'P-D2', { pin: 'wrong', what: 'the wrong pin' }, /Host key verification failed/);
    await productionRefuses(check, group, 'P-D3', { key: 'wrong', what: 'the wrong key' }, /Permission denied/);
    await runLegs(check, group);
    check('the master is still the one connection A served: every production leg went to its own sshd', master.exited === false && fs.existsSync(mux.control), master.stderr.trim());
  } finally {
    if (master !== undefined) {
      await endChild(master);
    }
    await endChild(a.sshd);
  }
}

/** The keys: a host key, the user's key, a key nobody authorized, and an authorized key whose FILE needs a passphrase. */
async function makeKeys(check, rig) {
  const keygen = (file) => tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file]);
  const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey)) ?? (await keygen(rig.wrongKey)) ?? (await keygen(rig.passKey));
  check('the throwaway keys were generated', failed === undefined, failed);
  fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8') + fs.readFileSync(`${rig.passKey}.pub`, 'utf8'));
  // A copy WITHOUT a passphrase stays beside it, for the agent of P-I2 only. The file that a run names gets a passphrase nobody types.
  fs.copyFileSync(rig.passKey, rig.passKeyOpen);
  const locked = await tool('ssh-keygen', ['-q', '-p', '-P', '', '-N', 'a passphrase nobody types', '-f', rig.passKey]);
  check('the file of one authorized key now needs a passphrase', locked === undefined, locked);
}

/** The loopback listener every forward ends at; it answers one known line and closes. */
function startListener(rig) {
  const listener = net.createServer((socket) => socket.end(LINE));
  rig.scope.after(() => new Promise((resolve) => listener.close(resolve)));
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => resolve(listener.address().port));
  });
}

async function liveNoSharing(check, out) {
  if (process.platform === 'win32') {
    console.log('skip  live no-connection-sharing legs — POSIX only (a unix-socket forward and sshd)');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('the live no-connection-sharing legs ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live no-connection-sharing legs — sshd not installed');
    }
    return;
  }
  // Its own scope, registered in the module scope at once (a signal in this section closes it too), closed in the `finally` below. The folder
  // holds unix sockets, so it is made under the short socket root.
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'nsh', { parent: shortSocketRoot() });
  const { SSH_AUTH_SOCK: _own, ...env } = process.env; // no agent of the person's: every leg says which agent it has, and only P-I2 has one
  try {
    const rig = {
      dir, scope: section, out, env, hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), wrongKey: path.join(dir, 'wrong_key'),
      passKey: path.join(dir, 'pass_key'), passKeyOpen: path.join(dir, 'pass_key_open'), authorizedKeys: path.join(dir, 'authorized_keys'),
      agentSocket: path.join(dir, 'a.sock'),
    };
    await makeKeys(check, rig);
    rig.listenerPort = await startListener(rig);

    await controlDetachedMaster(check, rig);
    await productionTunnel(check, rig);
    await masterGroup(check, rig);
  } finally {
    await section.close(); // the folder goes last: the children hold files in it, and the section ended them first
  }
}

module.exports = { liveNoSharing };
```

Notes.

- `TWO` is spelled in the script on purpose. The script must also run on the two source files of `b84416aa`, where the constant
  does not exist (the RED of §7); and a control must not depend on the thing it controls.
- `startTunnel` registers `dispose` in the section scope at once, so a signal in the middle of a leg ends the tunnel.
- `tunnelLivesAndDies` looks at the control path WHILE the tunnel runs: a master removes its socket when it ends, so a look
  after `stop()` would pass for a tunnel that had become a master.
- The group's master is started with `launch`. Under `ControlPersist` the started process hands the connection to a detached
  master and stays as its client for the `sleep`. `endChild(master)` ends the client; the end of `sshd` A ends the detached
  master. The same holds for K-A's master when `ssh -O exit` did not: the end of its `sshd` closes its connection.
- P-I2's agent lives for that leg only. An `ssh-agent -D` whose starter was killed with SIGKILL never ends by itself. Measured
  with an earlier form of this script, which started the agent first: after SIGKILL the agent was the one process that stayed
  until it was ended by its pid. The short life keeps that window to one leg.
- The destination, the user and the remote command are words of the rig; nothing is read from the vault.

## 5. The call from `scripts/ssh-agent-itest.cjs`

Three places. The header, after the paragraph of section 8 (`:33-36`), gains an empty comment line and this paragraph:

```js
//
// Section 9 (POSIX only, `itestNoSharing.cjs`) is the measurement behind `NO_CONNECTION_SHARING` (G2): under a config that shares
// connections, the tunnel of a Remote Bridge and a run off a bridge each make a connection of their own, a closed bridge serves
// nothing, and a wrong key or a wrong pin fails; the control legs show the fault without the two options.
```

After the `require` of `./itestForwardAgent.cjs` (`:43`):

```js
const { liveNoSharing } = require('./itestNoSharing.cjs');
```

After the call of section 8 (`:219`), inside the same block:

```js
    // ---- 9. the extension's own ssh calls share no connection, whatever ~/.ssh/config says (G2) ---------------------
    await liveNoSharing(check, OUT);
```

The file then has 764 lines (the limit is 800). Section 9 needs no `vscode` stub: `sshBridge.js`, `sshExecCommand.js`,
`sshCommand.js`, `sshBridgeManager.js` and `bridgeSpawner.js` import none. It stands in the block of section 8 only to keep the
order of the sections.

## 6. The comments: what the legs showed

Written LAST, after the mutation runs of §10, and only what they showed (the constraint above). Comments only.

**6.1 `src/sshExecCommand.ts`**, in the docblock of `NO_CONNECTION_SHARING`, between the paragraph that ends
`` `Host key verification failed`.</p> `` and the paragraph *What is NOT covered*: an empty ` *` line and this paragraph.

```ts
 * <p>Each option alone, as section 9 of `scripts/ssh-agent-itest.cjs` saw it against real `sshd -d` runs (OpenSSH 10.2p1,
 * loopback, a config with `ControlMaster auto`, a fixed `ControlPath` and `ControlPersist 60`): with `ControlPath=none` alone
 * every leg passes. With `ControlMaster=no` alone this `ssh` does not BECOME a master, and that is all: with a master up it
 * still joins it, with a wrong key and a wrong pin. So the first option is the protection and the second is belt and braces.
 * Both stay. Section 9 runs in the `itest:ssh-agent` step of the CI runs of the extension workflow, with both.</p>
```

**6.2 `src/sshBridge.ts`**, in the docblock of `FIXED_OPTIONS`: the sentence `The measurement and its conditions are beside the
constant.</p>` loses its `</p>`, and two sentences follow it. The paragraph then ends:

```ts
 * the forward, and the kill hit a pid that was gone; with the two options the process stays and the kill ends the forward. The
 * measurement and its conditions are beside the constant. Section 9 of `scripts/ssh-agent-itest.cjs` asks a real `sshd` on every
 * CI run: this argv serves the forward while its `ssh` runs and makes no control socket, it logs in by itself while a master is
 * up, and after `stop()` the forward is not served.</p>
```

**6.3 `src/sshBridgeManager.ts`**, in the file's docblock, after the paragraph *A bridge cannot outlive the window* (`:8-12`): an
empty ` *` line and this paragraph.

```ts
 * <p>That holds only while the spawned process IS the connection that carries the forward. With connection sharing in the
 * person's `ssh` config it was not: the process exited at once, a master kept the forward, and `kill()` reached nothing. The
 * tunnel's argv now asks for no sharing (`NO_CONNECTION_SHARING`, `sshBridge.ts`), and section 9 of
 * `scripts/ssh-agent-itest.cjs` drives THIS class against a real `sshd`: after `stop()` the forward is not served. Not covered:
 * an extension host that is killed runs no `dispose`, and the `ssh` it started lives on.</p>
```

Its last sentence is the follow-up H3 of the parent's §9, said where a reader of this class stops. After §6 the three files
have 200, 384 and 103 lines, and the unit tests of the S1 spec and `sshBridgeManager.test.js` are green (measured: 115 tests, 114
pass, 1 skipped).

## 7. RED: the legs on the product before S1 (L9)

In the COPY (§2): put the two files as they are at `b84416aa` into it, compile, run section 9, then put S1's files back and
compile again.

```bash
git -C "$WT" show b84416aa:src_vs_code/src/sshExecCommand.ts > "$SP/g2-copy/src_vs_code/src/sshExecCommand.ts"
git -C "$WT" show b84416aa:src_vs_code/src/sshBridge.ts > "$SP/g2-copy/src_vs_code/src/sshBridge.ts"
# compile, run, save the output; then:
cp "$WT/src_vs_code/src/sshExecCommand.ts" "$WT/src_vs_code/src/sshBridge.ts" "$SP/g2-copy/src_vs_code/src/"
```

Expected: 26 `ok`, 16 `FAIL`, exit 1. Every control check is `ok` (the rig has the fault with and without S1). The sixteen:

| # | The check that is `FAIL` | What its detail shows |
|---|---|---|
| 1 | `P-B: the production tunnel serves the forward while its ssh runs` | `exit 0; read "creds-g2-forward\n"`: the spawned `ssh` has exited and the forward is served all the same |
| 2 | `P-B: it became no master: the control path of its config is not made while it runs` | the path of `p-b.cm`: it exists |
| 3 | `P-B: stop() ends the spawned ssh` | `stop() answered false; exit 0`: the row was gone before the kill |
| 4 | `P-B: and after stop() the forward is not served` | `creds-g2-forward`: it is still served |
| 5 | `P-D1: the production tunnel serves the forward while its ssh runs` | `exit 0; read "creds-g2-forward\n"` |
| 6 | `P-D1: it logged in by itself: its sshd accepted the key` | the tail of its `sshd` ends at `Server listening`: no connection came |
| 7 | `P-D1: stop() ends the spawned ssh` | `stop() answered false; exit 0` |
| 8 | `P-D1: and after stop() the forward is not served` | `creds-g2-forward` |
| 9 | ``P-D2: with a master up, the production tunnel with the wrong pin fails: exit 255 and `Host key verification failed` `` | `"code":0`: the wrong pin was not looked at |
| 10 | `P-D2: and it reached the sshd it named` | the tail ends at `Server listening` |
| 11 | ``P-D3: with a master up, the production tunnel with the wrong key fails: exit 255 and `Permission denied` `` | `"code":0`: the wrong key was not used |
| 12 | `P-D3: and it reached the sshd it named` | the tail ends at `Server listening` |
| 13 | `P-X: with a master up, the production run off a bridge ran on the sshd it named: SSH_CONNECTION ends in its port` | `"code":0`, and `stdout` ends in the port of `sshd` A |
| 14 | ``P-I1: the production run with that key fails: exit 255 and `Permission denied` (a credential that needs a person does not work on this road)`` | `"code":0`, and `stdout` ends in A's port: it "worked", as whoever opened the master |
| 15 | `P-I1: it reached the sshd it named, which accepted no key` | the tail ends at `Server listening` |
| 16 | `P-I2: the same run with that key in an ssh-agent of its environment ran on the sshd it named (what needs nobody still works)` | `"code":0`, and `stdout` ends in A's port: it never reached its own `sshd` |

P-I2 is red here too, for a reason of its own: before S1 the run does not use the agent's key at all, it rides the master.

## 8. GREEN: the 42 checks, in the order they are printed (the product of S1)

1. `the throwaway keys were generated`
2. `the file of one authorized key now needs a passphrase`
3. `k-a: its sshd started`
4. `K-A control: without the two options the spawned ssh exits with 0 while the bridge is wanted`
5. `K-A control: and the forward is served after that exit, by a detached master`
6. `K-A control: the master left its control socket`
7. `K-A control: the product's stop() changes nothing: the forward is still served`
8. ``K-A: the detached master is ended by `ssh -O exit`, and its control socket is gone``
9. `p-b: its sshd started`
10. `P-B: the production tunnel serves the forward while its ssh runs`
11. `P-B: it logged in by itself: its sshd accepted the key`
12. `P-B: it became no master: the control path of its config is not made while it runs`
13. `P-B: stop() ends the spawned ssh`
14. `P-B: and after stop() the forward is not served`
15. `a: its sshd started`
16. `a master connection to A is up: its control socket exists`
17. `k-c: its sshd started`
18. `K-C control: with a master up, the tunnel without the two options ends at once (its exit code is recorded: 0 locally, 1 on the CI runner), with a WRONG key and a WRONG pin`
19. `K-C control: its forward is served, through the master`
20. `K-C control: and the sshd it named saw no connection`
21. `p-d1: its sshd started`
22. `P-D1: the production tunnel serves the forward while its ssh runs`
23. `P-D1: it logged in by itself: its sshd accepted the key`
24. `P-D1: stop() ends the spawned ssh`
25. `P-D1: and after stop() the forward is not served`
26. `p-d2: its sshd started`
27. ``P-D2: with a master up, the production tunnel with the wrong pin fails: exit 255 and `Host key verification failed` ``
28. `P-D2: and it reached the sshd it named`
29. `p-d3: its sshd started`
30. ``P-D3: with a master up, the production tunnel with the wrong key fails: exit 255 and `Permission denied` ``
31. `P-D3: and it reached the sshd it named`
32. `p-x: its sshd started`
33. `P-X: with a master up, the production run off a bridge ran on the sshd it named: SSH_CONNECTION ends in its port`
34. `k-i: its sshd started`
35. `K-I control: without the two options, a run whose key file needs a passphrase rides the master: exit 0, SSH_CONNECTION ends in the MASTER's port`
36. `p-i1: its sshd started`
37. ``P-I1: the production run with that key fails: exit 255 and `Permission denied` (a credential that needs a person does not work on this road)``
38. `P-I1: it reached the sshd it named, which accepted no key`
39. `P-I2: a real ssh-agent holds the key whose file needs a passphrase`
40. `p-i2: its sshd started`
41. `P-I2: the same run with that key in an ssh-agent of its environment ran on the sshd it named (what needs nobody still works)`
42. `the master is still the one connection A served: every production leg went to its own sshd`

## 9. Order of work, and the commits

1. **Step 1, the probe** (§1): the script with the one leg P-B, and the call of §5. Run it (§2): eight `ok`. Commit c2:
   `test(ssh): G2 S2 — the feasibility probe: one production tunnel through sshd -d (section 9, leg P-B)`. Its body says where it
   ran and what the eight lines were. Tell the lead: when the lead pushes c2, the step `Integration test (SSH agent …)` of the
   head sha's CI run shows the same leg on the runner's `sshd`.
2. **The other legs** (§4, whole). Run section 9 on the product of S1: 42 `ok` (§8). Run it three times.
3. **RED** (§7): 26 `ok` and the 16 `FAIL` of §7. Save the output. If a control is `FAIL`, another check is `FAIL`, or one of the
   sixteen is `ok`: stop and tell the lead. Put S1's files back, compile, and see 42 `ok` again.
4. **The mutation runs** (§10), one at a time, each restored before the next. Save what each one printed.
5. **The comments** (§6). In the worktree: compile, typecheck, lint, the whole suite: green. In the copy, with the three files
   copied over: the whole `ssh-agent-itest.cjs`: `all agent integration checks passed`, 119 `ok` lines.
6. Commit c3: `test(ssh): G2 S2 — a real ssh and real sshd runs show what the two options do (section 9)`. Its body has the
   sixteen RED lines, the result of N1 to N8, the versions of `ssh` and `sshd`, and the sentence that the first run on the
   runner's `sshd` is CI's.
7. Look and clean (§2.5).

No commit holds a red check. The lead pushes; the legs must be green on the head sha's CI run before the story is done.

## 10. The mutation runs on the legs (each restored before the next)

In the COPY. Each is a temporary edit of a product file of the copy (N1 to N5 are M1, M2, M4, M5, M6 of the S1 spec), then
compile, then section 9. "Red" is what was measured with the final script (L9, L10); a run that shows another list is a finding for
the lead.

| # | The mutation | `FAIL` (of 42) |
|---|---|---|
| N1 | The tunnel says nothing (M1) | 12: the four of P-B (10, 12, 13, 14), the four of P-D1 (22 to 25), 27, 28, 30, 31. P-X and the P-I legs are `ok` |
| N2 | A run off a bridge says nothing (M2) | 4: P-X (33), P-I1 (37, 38), P-I2 (41). Every tunnel leg is `ok` |
| N3 | The tunnel clears its own forward (M4) | 5: every check that reads through a forward of a tunnel: 5 and 7 (K-A), 10 (P-B), 19 (K-C), 22 (P-D1), each with `error: ENOENT`. The controls are red too, because a control is the production argv less the two options |
| N4 | Only `ControlMaster=no` (M5) | 12: 22 to 25, 27, 28, 30, 31, 33, 37, 38, 41. **P-B is `ok`**: alone, this option keeps an `ssh` from becoming a master and does not keep it from joining one |
| N5 | Only `ControlPath=none` (M6) | 0: every leg passes. On this client the first option carries the whole effect |
| N6 | The product before S1 (§7) | 16 |
| N7 | SIGTERM to the runner at about 0.7 s and at about 1.5 s after its start (`kill -TERM <its pid>`) | no check list: exit 143, and 300 ms later §2.5 shows nothing |
| N8 | SIGKILL at about 0.7 s (`kill -KILL <its pid>`), once | §2.5 shows the folder with its `.owner` file, the detached master of K-A (`ssh -F …/k-a.config …`) and the `sshd-session` processes of its `sshd`; they are still there at 58 s and gone at 62 s, by themselves. Then remove the folder and its `.owner` by their exact names |

N4 and N5 decide the paragraph of §6.1. N7 and N8 are the proof of the parent's §4.5: a signal leaves nothing, and a master of a
killed run ends within `ControlPersist`.

## 11. Done when (each item can be counted)

- [ ] Step 1 ran before the other legs were written, with eight `ok`, and is commit c2.
- [ ] Section 9 on the product of S1: 42 `ok`, three runs in a row; the whole itest: 119 `ok` lines and `all agent integration checks passed`.
- [ ] The 16 `FAIL` of §7 were watched on the two files of `b84416aa`, with every control `ok`; S1's files were put back.
- [ ] N1 to N8 each showed what §10 names; the copy was restored after each.
- [ ] After a run, after N7 and after the cleaning of N8: no folder `testsToDelete-…-creds-nsh-…`, no process of the rig.
- [ ] `scripts/itestSshd.cjs` is unchanged; `scripts/ssh-agent-itest.cjs` has 764 lines; the new script has no temp call of its
      own (`test/harnessSites.test.ts` green) and the leftovers guard is clean.
- [ ] The three product files changed in comments only (200, 384 and 103 lines); the paragraph of §6.1 says what N4 and N5 showed.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` are green.
- [ ] The legs are green in the step `Integration test (SSH agent against a real ssh-add)` of the head sha's CI run (the lead
      reads it after the push; the version of the runner's `sshd` goes into the plan's record).

## 12. Break it — ways to make the legs pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| Y1 | The rig does not share at all (a typo in the config, a client that ignores it), so every production leg passes with or without the options | The three controls: K-A (4 to 7), K-C (18 to 20), K-I (35). They take the options out and must show the fault. And §7: the production legs are red on the product before S1 |
| Y2 | A production leg and its control run under different configs | P-D1, P-D2, P-D3, P-X, P-I1, P-I2 use the SAME file as K-C and K-I (`mux.config`); P-B's config and K-A's come from the one `sharingConfig` |
| Y3 | A check reads a stale forward: the socket of another leg, or of an earlier run | Each leg has a remote path of its own, in a folder that is new per run. `served` reads the listener's line through that path only. After `stop()` the file stays and the connect is refused, which is "not served" |
| Y4 | A production leg rides the master and passes anyway | Each has an `sshd` of its own, and a check on THAT log: `Accepted publickey` (11, 23, 33, 41) or `Connection from` (28, 31, 38); the runs also print `SSH_CONNECTION`, which must end in their own port. Check 42: the master is still A's one connection |
| Y5 | "Saw no connection" passes because the pattern never matches anything | The same two patterns are asserted positively in the production legs of the same run |
| Y6 | P-I1 fails for another reason than the missing person | P-I2: the same key file on a fresh `sshd` is accepted; K-I: the same run "worked" through the master (§3) |
| Y7 | The tunnel is started by a spawn of the test, so `stop()` proves nothing about the product | `startTunnel` uses the compiled `SshBridgeManager` and `bridgeSpawner`; the review reads it (§13 item 2) |
| Y8 | The exit code 0 of a stopped tunnel is read as "it ran until it was stopped" | L5: the code is 0 both ways. Checks 10 and 22 ask for `'running'` WHILE the forward is served; 13 and 24 ask that `stop()` answered `true` |
| Y9 | The production argv is not the product's: written by hand, or built with other options than the roads use | `tunnelArgv` and `runArgv` call the compiled builders with a key, a pin and `auth: 'key'`; a control is that argv less the two pairs, by `withoutTheTwo` |
| Y10 | "No control socket" is looked at after the tunnel ended, when a master has removed it | Check 12 is made while the tunnel runs (the note of §4) |
| Y11 | The legs do not run at all and the script is green | Where `CI=true` a missing `sshd` is a `FAIL` (the first lines of `liveNoSharing`); locally the skip is printed. The count of §8 is 42 |
| Y12 | A master of an earlier, killed run answers for this one | Every control path is inside the run's own new folder; `ControlPersist` is 60 s; N8 |

## 13. Opus review checklist

1. The script is the text of §4. No leg writes a production argv by hand; `withoutTheTwo` removes the two pairs and nothing
   else; `TWO` is used only to take out.
2. `startTunnel` is `SshBridgeManager.start` over `bridgeSpawner`, both required from `out/`; the only tunnels started by
   `launch` are P-D2 and P-D3.
3. Each production leg has its own `sshd`, and its checks read THAT `sshd`'s log; a control asserts that its `sshd` saw nothing.
4. Every wait is bounded, and every `sshd`, client, agent and tunnel is ended in a `finally` or by the section scope; the
   section is closed in the `finally` of `liveNoSharing`.
5. `ControlPersist 60` in `sharingConfig`, and no other config writer in the script.
6. The RED lines in the body of c3 are the sixteen of §7, with every control `ok`; the mutation results are those of §10.
7. The paragraph of §6.1 says what N4 and N5 showed, with the client's version; the three product files changed in comments
   only (`git diff -w` shows no code line); neither `sshBridge.ts` nor `sshBridgeManager.ts` spells an option as `Name=value`.
8. `scripts/itestSshd.cjs` is byte for byte unchanged; nothing of §2 (the wrapper, the two config lines, `run9.cjs`) is in the
   commit.
9. `scripts/ssh-agent-itest.cjs`: the three places of §5, 764 lines.
10. No sentence in a comment or a commit says more than the legs show: loopback, one user, key authentication, the two OpenSSH
    versions that were run. Nothing about Windows, macOS, a jump host or a password entry.
11. The step of the head sha's CI run was opened and its section 9 lines read: 42 `ok`, no `skip`.

## 14. Not verified by this spec

- **The runner's `sshd`.** Every leg was run against OpenSSH 10.2p1, unpacked and run by the user. CI installs the image's
  `openssh-server` and runs it as the runner's user (L13). The first run there is CI's; c2 is made so that the probe can be seen
  there first.
- **An older client or server.** Which option carries the effect (L10) is a fact about 10.2p1. Both options stay for that reason.
- **A password entry.** Every leg authenticates with a key (`auth: 'key'`, `BatchMode=yes`). The askpass branch
  (`NumberOfPasswordPrompts=1`) carries the same two words (the S1 spec, R2 and R9) and was not run against a server.
- **A network host, a jump host, Windows, macOS.** Loopback, one user, Linux. The nested `ssh` of a hop gets none of the options
  (the parent's H1).
- **A typed second factor and a security-key PIN.** P-I1 shows the class with a passphrase key. The other two were not run.
- **SIGKILL of the harness.** No handler runs. Measured (L11): a detached master ends within 60 s, and its `sshd` with it. Not
  bounded: an `sshd -d` that still waits for its one connection, a production tunnel that was up with its `sshd`, and P-I2's
  agent if the kill falls into that leg. The first is true of sections 5, 7 and 8 today; the tunnel is H3's shape. The folder
  is the janitor's.
- **The extension host.** The legs drive `SshBridgeManager` and `bridgeSpawner` from a script. No window was driven.

## Notes for the lead

- **Push c2 before the rest is reviewed, if you want the probe on the runner's `sshd` first.** The spec's own run of every leg
  passed (L2, L7), so step 2 need not wait for it; what CI adds is its `sshd` and its user.
- **`startSshd` is not changed**, so nothing of this story touches PR #365's edit of `scripts/itestSshd.cjs`. Section 9 calls it
  with the four arguments section 8 uses. If #365 changes that signature, both sections change together.
- **A follow-up, not built:** an `sshd -d` of a harness that was killed with SIGKILL waits without a limit (sections 5, 7, 8 and
  now 9). A bound belongs in `startSshd`, after #365.
- **The exit code of a closed bridge is 0** (L5): `ssh -N` treats SIGTERM as a normal end. The log line of a bridge that ended by
  itself (`ended (0)`) and of the fault before S1 are the same number. Nothing here depends on it; S3's documents should not say
  that a code tells the two apart.
- **The parent was repaired in this commit, wording only:** its §7.5 and its story S2 said that P-I2 is green on `origin/main`
  too. It is red there (§7, row 16): before S1 the run rides the master and never reaches its own `sshd`.
- The comment paragraphs of §6 were compiled and linted on the copy; `eslint` is clean and the S1 scan G11 is green with them.
