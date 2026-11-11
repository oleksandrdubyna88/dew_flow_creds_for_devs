# PLAN — a Terminal entry runs its command over a chosen SSH connection

> Status: **IMPLEMENTED, 2026-11-11.** Shipped: E1 (#335) and E2 (#337) in extension 1.20.0 (#341); E3 in extension 1.21.0, pending its release PR (branch feat/terminal-command-over-ssh-e3). Deviations: §12. Ledger at promotion: epoch 4, 0 changes. Hand checks 1-3 of §10 are owed to the owner. Scope: the extension (`src_vs_code`) — a new
> Terminal-entry field, the form, every road that runs a Terminal entry (arrow, folder run, dependency chain, VPN
> launcher, Run with Secrets, agent `creds_run`), SSH Connect's preparation half, help in five languages, README,
> `research/`. No server change, no HTTP contract change, no MCP tool shape change.

## Plan changes

> Epoch 1 · approved 2026-11-09 · by reviewers · state: closed

  (Approval: the plan gate's round 2, verdict good_enough, committed in e468285 with that round's accepted findings
  and the three-epic split the same round's operator command ordered.)
- 1.1 · 2026-11-10 · agent · approach — the E1.S2 spec measured the two parses: the stay-open wrapper becomes an `eval` form (a trailing comment or `&` broke the old one) and the PowerShell 5.1 refusal also covers a trailing `\`
  (Not counted, each only makes the plan true as written: the trust line built from the prepared snapshot per §4.4,
  the seam's range taking the password branch's preparation, `stopped` leaving nothing on disk, and the importer
  count of `resolveCommand(` repaired.)
- 1.2 · 2026-11-10 · reviewer · scope, contract — the E1.S2 review and the security.md class sweep: PowerShell typographic quotes doubled in `quoteFor`, the win32 `shellQuote` words that carry vault data (`-i`, destination, jump and forwards) and the askpass `.bat` no longer expand vault data; SSH Connect's shipped win32 line changes; followups item 5 closed here
  (First recorded as "not counted"; the E1 conventions review showed it is a change: its own cause, a shipped contract
  changed, a slice of another plan taken. In doubt it is a change. This second change stopped the plan.)

### Re-review for epoch 2

Narrowed: no — the Definition of Done is identical to epoch 1's; the trust line, the secrets shell and Update-it only widen or tighten; the security sweep leaves to its own plan and was never in epoch 1's scope

| Work | Where | Verdict | Action |
|---|---|---|---|
| b65139c, e75dd44, e468285 plan, gate rounds 1-2, epoch 1 approval | local, not pushed | fits | kept |
| 38d72cb E1 stories and the S2/S3 specs | local, not pushed | fits | kept; spec text for the trust line and the secrets shell fixed forward |
| c4bac82 the cadence consultation's three points | local, not pushed | fits | kept |
| 782444a E1 code with the security sweep inside | local, not pushed | cut | security hunks extracted onto their own branch (PLAN_windows_shell_quoting_injection), E1 rebased onto it, E1 §S4 F1-F7 fixed forward |
| 6fb4ba7 entry 1.2, the stop | local, not pushed | fits | kept |
| 6271779 the epoch 2 revision | local, not pushed | fits | kept; one README row fixed forward |

  (Sorted by an Opus judge, 2026-11-10. The stop commit was not pushed: the repository is public and the cut commit
  describes unreleased security defects; the push is the owner's decision.)

> Epoch 2 · approved 2026-11-10 · by reviewers · state: closed

  (The re-review round on branch feat/terminal-command-over-ssh-epoch2: verdict proceed, 1 of 2 reviewers answered —
  antigravity's answer was unparseable; the Update-it finding accepted (already E1 §S4 F2), the `exit` finding
  rejected with its reason.)
- 2.1 · 2026-11-10 · reviewer · contract — the E3.S2 security judgement (Fable): the agent's refusal of a linked run names only the Terminal entry (not the SSH entry), its code is `denied`, and the captured output is also masked with the linked SSH entry's values
  (One cause, one entry. Not counted: the internal widening of `summarize`/`validate` to take the call target, E3.L flag 2.)
- 2.2 · 2026-11-10 · reviewer · contract — the E3 plan round 1, item 2 (E3-D13): `LaunchPlan` is not changed, so `commands/runCommands.ts` keeps importing `resolveCommand` for its local uses and §4.5 (1)'s structural target ("imported only by `commandLine.ts` and `remoteLaunch.ts`") is never reached
  (Accepted in round 1 on 2026-11-10, recorded in 5f32ae71; first flagged as "may count" by the Opus judge, E3 flag 7 (a). In doubt it is a change. This second change stopped the plan. Flag 7 (b) and (c) are not changes: no parent text moves.)

### Re-review for epoch 3

Narrowed: no — scope, the Definition of Done and the epics are not smaller: the DoD gains two rows (the no-local-sink tests and the agent's refusal and mask) and E3's Done-when gains the gate, mask and no-local-sink rows; §4.5 (1)'s import target is replaced by the importer list that ships, and its purpose (no linked run on this machine) moves to behavioural tests that are acceptance rows and cover every road that resolves a line or treats a link as absent (the arrow, Run with Secrets, the dependency chain, an agent's VPN start, a chain with no lookup, the agent's run), so the execution safeguard stays a requirement and is wider than the import target was; E3 is not split (three epics is the owner's limit, and its stories already separate the two boundaries); 1.20.0 ships E1 and E2 with E3's two roads still refused, which every epic boundary of this plan allows (D8)

| Work | Where | Verdict | Action |
|---|---|---|---|
| f3b024b7 E1, #335 | main, merged 2026-11-10 | fits | kept; its importer list is S2-D6's, now §4.5 (1)'s text; E1's Done-when line fixed forward in this revision |
| 44f3f3dc E2, #337 | main, merged 2026-11-10 | fits | kept; its arrow and its dependency chain resolve before the link, and an agent's VPN start and a chain with no lookup treat the link as absent; each routing is pinned by E3's no-local-sink tests (tests only, in E3.S1) |
| 454e990f SSH Connect tab title, #336 | main, merged 2026-11-10 | fits | kept; not this plan's work (the owner's own request, its own coai rounds, SSH Connect's title and owner lookup); E3 is rebased on it, and `prepareSshSession`'s contract is unchanged |
| d1b4b88e CHANGELOG 1.20.0, #338 | main, merged 2026-11-10 | fits | kept; its text is true of E1 and E2 as merged, and it says that Run with Secrets and an agent's run still refuse |
| bd4cc948 E3 stories and the lead's flag decisions | pushed, unmerged (feat/terminal-command-over-ssh-e3) | fits | kept |
| f4ab4b6f E3.S2 security spec, entry 2.1 | pushed, unmerged | fits | kept; the parent now carries its refusal, code and mask (D15, §4.4, §6) |
| 5f32ae71 E3 plan round 1, eight findings owed | pushed, unmerged | fits | kept; it accepted entry 2.2's cause |
| 83a42129 hand check 4 on a real peer | pushed, unmerged | fits | kept |
| 4b43a373 E2 and E3 documents, rules and security plan paths | pushed, unmerged | fits | kept |
| e782769c E3 stories with the round-1 amendments | pushed, unmerged | fits | kept; E3-D13, flags 1 and 7, the no-local-sink tests and the CHANGELOG row fixed forward in this revision |
| f33e46f5 entry 2.2, the stop | pushed, unmerged | fits | kept |
| 733923ab the revision for epoch 3 and this sort, and the follow-up commit after it (the lead's Opus review applied) | 733923ab pushed, unmerged; the follow-up local | fits | kept |

  (Sorted by an Opus judge, 2026-11-10. Nothing is cut: every merged PR is compatible with the revised plan, and no
  pushed commit contradicts it.)
  (The stop was late. Entry 2.2's cause was accepted in 5f32ae71: authored 2026-11-10 08:20 UTC, and committed 17:31
  UTC by a rebase, after #335, #336 and #337 had merged. The stop was recorded only in f33e46f5, 17:59 UTC. Between the
  acceptance and the stop, #335 (15:45), #337 (16:09) and #338 (17:46) carried this plan's work to `main`; step 2 of the
  full stop forbids those three merges. #336 (17:06) merged in the same area but is not this plan's work. The three are
  kept because each fits the revised plan. Nothing is reverted, and the breach is recorded here, not hidden.)
  (Release decision: extension 1.20.0, by release-please with a version bump only, carries E1 (#335), E2 (#337), #336
  and the CHANGELOG (#338). It waits until epoch 3 opens and does NOT wait for E3. E3's two roads, Run with Secrets and
  an agent's creds_run, stay refused with E1's sentence until E3 ships in a later release. Source: two question
  consultants (2026-11-10) and the precedent in PLAN_remote_bridge_scoped.md (PR #307 fits, no merge until epoch 7
  opens). The owner ordered the release when E1 and E2 were ready and E3 had no code.)

> Epoch 3 · approved 2026-11-10 · by reviewers · state: closed

  (The re-review round on branch feat/terminal-command-over-ssh-epoch3, coai session db4ae051: verdict proceed, 2 of 2
  reviewers answered, five findings, each rejected with its reason: a multi-line secret was measured fine under
  dash -s; the folder run's cleanup is already in the finally of sshRoad.ts; the banner already says the input is
  empty; no harness drives the real extension UI; exit and exec were already rejected in epoch 2. With it, the lead's
  own Opus review: its six findings are applied in the follow-up commit. The dependency chain, an agent's VPN start, a
  chain with no lookup and the agent's local run join the no-local-sink proof of §4.5 (5); the rest are text fixes.)
- 3.1 · 2026-11-10 · reviewer · approach — the lead's Opus review of E3 (B1, CWE-426): on Windows the masked run's ssh is spawned by an absolute path (`spawnableSshProgram`, PATH's first absolute `ssh.exe`, else the built-in OpenSSH, else the refusal `NO_SSH_TO_SPAWN`) with the cwd `storageDir`, not as the agent's `ssh:exec` chooses it
  (In doubt it counts: §4.4 said the program is chosen as `ssh:exec` chooses it. The same client, hardened. `ssh:exec` itself is unchanged: it spawns in the extension host's own folder, not the workspace; its own hardening is a todo.)
- 3.2 · 2026-11-10 · reviewer · contract — the lead's Opus security review of the E3 code: the gate checks only the SSH entry's use rung, while the one-use burn and its lane follow the Terminal entry, so a one-use SSH entry opened to agents can be used again and again through a linked Terminal entry; the gate must also honour the SSH entry's one-use policy (refuse it, or burn it too)
  (A consultant (coai consultation 5b2cc40c) read the fix as a new gate condition, not a fix of the plan as written: D2 says "only if", it says nothing of consumption. In doubt it is a change. This second change stopped the plan.)

### Re-review for epoch 4

Narrowed: no — every decision of the revision only adds to the plan or makes it true as written: a linked run spends a one-use SSH entry once (B), not the refusal (A), so D2's road keeps its width; the agent's run also needs the shown summary and the used entry, which every door of the broker gives; a waiting rotated value of S goes in before the mask table; a password SSH entry with a jump host is not refused (the limit is recorded); the Definition of Done and the merge conditions gain rows; nothing released is taken away. Two approved texts changed, and neither is smaller: (1) the child's environment on E3's two roads — the approved §4.4 promised it holds only the askpass variables and `SSH_AUTH_SOCK`; the first draft of this revision withdrew that as a recorded limit, which the step-3 consultation read as a narrowing, and the final revision KEEPS the protection and builds it (`envWithout` removes the host's `SSH_AUTH_SOCK`; the extension's own is added only when its agent serves the run, D17); (2) "no tty" — approved for Run with Secrets, it is now true by `-T` there AND on the agent's linked run (D16), so the forced-pty limit no longer touches E3's roads; `ssh:exec` and the person's clicks keep today's argv and environment, so no shipped road changes and no released behaviour is taken away
  (The reading of "not narrowed" was disputed, and the record says so. The approved sentence is "The ssh child's
  environment holds no resolved value: only the askpass variables of a password SSH entry and SSH_AUTH_SOCK" (this
  plan at 190acefb, §4.4 "Run with Secrets", lines 322-324, and its §6 row at line 451). coai consultation b73776c0
  (codex) and question consultation f778e98d (its codex row) read it as an allow-list of the WHOLE environment: then
  the inherited environment is a narrowing. The lead's Opus reviewer and the antigravity row of f778e98d read it as
  "no resolved value; the only credential plumbing the run adds is askpass and SSH_AUTH_SOCK": then nothing is
  narrowed. The lead decided NOT narrowed, on evidence inside the approved text: the same sentence names "a person's
  own SendEnv" as an accepted limit, and SendEnv forwards variables of the ssh client's LOCAL environment, so the
  approved text assumes an inherited environment; and the same paragraph chose the program and the agent socket as the
  agent's ssh:exec chooses them, and ssh:exec spawns with the host's environment plus its additions. The revision also
  makes the approved test row hold literally for the whole environment (D17 (a): no CREDS_REF_ name, no host
  SSH_AUTH_SOCK, no resolved value; the keys added or changed are exactly askpass and our SSH_AUTH_SOCK; F6). The owner
  may override this reading: the record then becomes "Narrowed: yes", and epoch 4 waits for the owner's approval.)

| Work | Where | Verdict | Action |
|---|---|---|---|
| 190acefb epoch 3 opens, the lead's Opus review written in | pushed, unmerged | fits | kept |
| e57eb80f merge of `main` (#338, the 1.20.0 CHANGELOG) | pushed, unmerged | fits | kept; no cited source line moved |
| 91ab5fd8 E3 stories: round 2 findings and the lead's Opus review | pushed, unmerged | fits | kept; E3-D4, E3-D5 and E3-D8 fixed forward in this revision (the child's environment text) |
| 450af9ec E3.S2 security spec: the follow-up flag asks the gate first | pushed, unmerged | fits | kept |
| 5f7459a4 entry 3.1 (B1, the masked run's absolute ssh) and the lead's follow-up decisions | pushed, unmerged | fits | kept |
| d4ebcab9 the local masking banner moves to `outputMask` (E3.S1, M7) | pushed, unmerged | fits | kept |
| 58c1cd32 the pure half of Run with Secrets over SSH (E3.S1, K1-K8, K10) | pushed, unmerged | fits | kept; fixed forward: `secretsArgv` passes `noTty: true` and `ownAgent` (E3 §E3.4 F-S1) |
| fbb52314 the masked run's argv mode (E3.S1, M1-M14) | pushed, unmerged | fits | kept; its doc text of the child's environment fixed forward (E3 §E3.4) |
| e2dfff7b `sshSpawnLaunch` and `spawnableSshProgram` (E3.S1, P1-P7) | pushed, unmerged | fits | kept |
| 98aef0be `SshRoad` spawn preparation, `spawnLaunch`, the once-only hand-over (E3.S1, H6-H10) | pushed, unmerged | fits | kept; fixed forward: `SpawnLaunch.ownAgent` and the doc of `sshRoad.ts:31-33`, `:39-41` (E3 §E3.4) |
| 269e41a1 Run with Secrets runs a linked command over SSH (E3.S1, S1-S10, O1-O10, N1, R1-R6) | pushed, unmerged | fits | kept; fixed forward: `launchesOf` asks `spawnLaunch` first; S9 renamed (E3 §E3.4) |
| e58e376b the no-local-sink tests (E3.S1, LN1-LN11) | pushed, unmerged | fits | kept |
| 04924a8a the help for Run with Secrets over SSH ×5 (E3.S1, Hp6, Hp7) | pushed, unmerged | fits | kept |
| 320297b8 README, `module_extension` and `module_tests` for E3.S1 | pushed, unmerged | fits | kept |
| 757bf3a3 `execOverSsh`, shared by `ssh:exec` and the agent's run (E3.S2, X1-X5) | pushed, unmerged | fits | kept; fixed forward: `OverSshCall.ownAgentOnly` (`ssh:exec` says `false`) |
| 11591d05 `validate` and `summarize` take the grant; `run` gets the shown summary (E3.S2, G17) | pushed, unmerged | fits | kept; fixed forward: `uses` and `ctx.uses` (G17 extended) |
| 6fc64c52 the bridge allow-list says E3 decided for `run` (E3.S2, G13) | pushed, unmerged | fits | kept |
| b0c35a30 the mask table holds the SSH entry's values (E3.S2, G14) | pushed, unmerged | fits | kept; fixed forward: the waiting value of S is released first (U8, U9) |
| c0bbe5ce the agent's linked run, gated and over SSH (E3.S2, G1-G22, AG1-AG8) | pushed, unmerged | fits | kept; fixed forward: the used entry, the turns and the burn in the broker, the two-part compare, `ownAgentOnly: true`, the bridged journal line (U1-U11, G11, G23, G24, F4) |
| 7c6e4ffb the help for the agent's run ×5 (E3.S2, Hp8) | pushed, unmerged | fits | kept; fixed forward: one sentence on the one-use SSH entry ×5; the S2 documents (`README.md`, `research/`) |
| 5b221602 entry 3.2, the stop | pushed, unmerged | fits | kept |
| 81b7014d the security spec's third amendment (A1-A6) | local, not pushed | fits | kept; its A2 scope is corrected by 9776bd03 |
| 9776bd03 the security spec: `-T` on Run with Secrets only, by the lead's decision | local, not pushed | fits | kept; its scope is widened again by 21b8f5ce |
| #341 release extension 1.20.0 (E1, E2, #336, #338) | main, merged 2026-11-10 20:04 | fits | kept; it ships no E3 code, and its CHANGELOG says Run with Secrets and an agent's run still refuse |
| f3b38b36 the first text of this revision (parent, E3 stories, `todo/README.md`, `PLAN_askpass_answers_the_hop.md`, the new `PLAN_ssh_exec_own_agent_forwarding.md`) | local, not pushed | fits | kept; its child-environment text and its `-T` scope are corrected by the commit after 21b8f5ce |
| 21b8f5ce the security spec: `-T` on the linked run too; the host's `SSH_AUTH_SOCK` removed on E3's two roads; the marker's place; `burnInTurn` in a `finally`; RED after a no-op type | local, not pushed | fits | kept |
| the commit after 21b8f5ce: this revision made to agree with it, the reviewer's findings, and the epoch 4 line | local, not pushed | fits | kept |

  (Sorted by an Opus judge, 2026-11-10. Nothing is cut. No pushed commit contradicts the revised plan: each S1 and S2
  commit is a part the revision keeps, and what the revision adds is fixed forward by new items of the E3 stories
  document (§E3.4), never by a history rewrite. Nothing of E3 is merged or released. The S1 and S2 code was written in
  epoch 3 before the stop, so step 2 of the full stop was not broken; since 5b221602 no code was written.)
  (Step 3 of the full stop, the consultations. coai consultation 5b2cc40c (2026-11-10) read entry 3.2's fix as a new
  gate condition and so a change that counts; it preferred spending the SSH entry (B) to refusing it (A), and said the
  proof must drive the real broker, because the action does not pass through the one-use lane (here: U1-U7 through
  `brokerWorld` and `performCall`). coai consultation b73776c0 (2026-11-10), for the re-review, had entries 3.1 and 3.2
  quoted as evidence. It said: keep E3 together, no split. It named the drift: reuse of `ssh:exec`'s road was treated as
  inheritance of its guarantees, so each guarantee must be checked per entry (here: the acceptance matrix of §6, consent,
  consumption, authentication and masking for the Terminal entry and for the SSH entry). And it read the first draft's
  withdrawn child-environment text as a narrowing. The lead removed that cause instead of approving a narrowing: the
  environment protection is kept and built (`envWithout`, D17), and the linked run says `-T` too (D16), so its masking
  is not weakened by a forced pty. The consultant was told the outcome.)
  (Not counted, the baseline of epoch 4: the used entry and its turns, the burn of S, the two-part compare, the
  release of a waiting value of S, `-T` on E3's two roads, the agent socket rule and the removal of the host's
  `SSH_AUTH_SOCK` on E3's two roads, the acceptance matrix of §6, the recorded limits of §7, the new neighbour plan of
  §7a.)

> Epoch 4 · approved 2026-11-10 · by reviewers · state: open

  (The interim re-review round of plan-change-control, because this branch's plan round had already passed: coai
  review_document on branch feat/terminal-command-over-ssh-e3, document PLAN_terminal_command_over_ssh.md (then in todo/), verdict
  proceed, 4 of 4 reviewers answered, one finding, accepted: where the spent marker of the used entry lives and its
  limits (D15, §4.4 "Agent"). With it, the lead's own Opus review of the revision: no blocker; its findings M1 and m1 to
  m8 are applied in the same commit as this line. The step-3 consultation is b73776c0 (above). Not narrowed, so
  approved by reviewers. Epoch 4 starts at 0 changes.)

## 1. Goal

Today a Terminal entry ("Terminal command") always runs on THIS machine: its line is typed into a local VS Code
terminal, and *Runs on* only picks the local shell. A person who wants a command to run on a server writes the ssh
line into the command by hand. The help even tells them to: `ssh -t <host> tmux new -A -s {name}`
(`src_vs_code/src/helpEn.ts:84`). That hand-written line uses none of the vault's SSH entry: not its stored key, not
its password, not its host-key pin, not its jump host.

The owner asked (2026-11-09): in the Terminal command section of the form, add a dropdown of the vault's SSH
connection entries, default **Do not use**. When one is chosen, running the entry first connects over SSH with that
entry, then runs the command inside that SSH session.

Done when: every road that runs a Terminal entry either runs the command on the chosen SSH host, or refuses with a
sentence. A person's road says why. Before the agent's gate passes, an agent's refusal names only the Terminal entry
and not the reason, because the SSH entry is not the agent's to read (§4.4 "Agent", entry 2.1). **No road of this build or a later one runs a
linked entry's command on the local machine.** An OLDER build does not know the field; that exposure is risk 1, not
covered by this guarantee. **An agent's linked run is an agent's use of the SSH entry** (re-review, epoch 4): an SSH
entry set to last until an agent uses it once is spent by the first linked run that answers, exactly as by a
`creds_exec` on it, and every other promise the broker keeps for an entry an agent uses (a waiting rotated value goes in
first, the output is masked with its values) holds for it too.

How the guarantee is held (re-review, epoch 3): a linked run uses only a launch that the composer (`planLaunch`)
made. A road may still resolve the line itself to check the entry and to feed its LOCAL run: by `resolveCommand`, or
through a helper that calls it (`shownCommandLine` in `commandLine.ts`, `executableLine` in `dependencyRun.ts`). The
arrow, the local *Run with Secrets* and the dependency chain do this. Two roads also treat every entry as unlinked by
construction (an agent's VPN start, and a chain planned with no vault lookup) and rely on their local road's own link
refusal. After E3.S2, the agent's run sends an unlinked entry to a local run too. Each such road must keep a linked
entry away from its local sinks. An import scan cannot prove where a value flows, so behavioural tests hold this
guarantee (§4.5 (5)). The scan holds only who imports and who reads.

## 2. Decisions taken, and by whom

| # | Decision | By |
|---|---|---|
| D1 | All human roads support SSH in v1: Run in Terminal (arrow), folder run, dependency-chain step, VPN launcher, Run with Secrets. | owner, 2026-11-09 |
| D2 | Agent `creds_run` / CLI `run`: allowed only when the SSH entry itself is open to the agent for `exec`; else refused with a sentence. The consent dialog names the SSH entry and says the line runs there. | owner, 2026-11-09 |
| D3 | After the remote command ends, the remote login shell stays open. The owner was told this works only on POSIX remotes. | owner, 2026-11-09 |
| D4 | Share with… and Export remove the SSH link (Share strips it in `shareFormat.ts` as it strips `vpnLauncherEntityId`; Export strips it in `exportSecrets.ts` `exportedNode`, where no reference is stripped today). The recipient's copy then runs locally; accepted. An in-place update of an entry the recipient already holds (*Update it*) keeps the RECIPIENT's own link: the sender's link never travels, the recipient's is never erased (re-review, epoch 2). | owner, 2026-11-09; update rule lead, 2026-11-10 |
| D5 | One ssh line, never "connect, then type": text typed after ssh starts can land in a password, passphrase or host-key prompt. | lead |
| D6 | Trust (the "run this stored command?" modal and its fingerprint) covers the SSH target, not only the line — else a synced host change runs a trusted line on a new machine without a question. | lead |
| D7 | Structure: ONE pure module is the only road from "entry + link" to a launch. A structural scan test pins who imports `resolveCommand`, who reads the link and where each send or spawn is. Behavioural tests prove that a linked entry reaches no local sink (re-review, epoch 3: the scan cannot see control flow, §4.5). | lead + consultants (2 of 2 answered: codex, gemini; 1 row refused on a config limit), 2026-11-09; the split of the proof, re-review of epoch 3 |
| D8 | Story order: the field ships together with a refusal on every road, so no intermediate build runs a linked command locally. | lead + consultants |
| D9 | A Windows remote (*Runs on* = Windows with a link) is refused in v1: the remote shell (cmd or PowerShell) is unknown and stay-open is POSIX only. | lead + consultants |
| D10 | A password SSH entry needs a fresh terminal (the password rides the terminal's environment, settable only at creation). A new terminal opens BESIDE any live one with the same title; nothing is disposed. | lead + consultants |
| D11 | A dependency-chain step over SSH does not stay open (a step must end for the chain to go on); a password step in a chain is refused (one shared terminal has one environment). | lead |
| D12 | Run with Secrets over SSH: values go to the child's STDIN as `export` lines for the remote LOGIN shell reading stdin, `"${SHELL:-sh}" -s` — the same shell that parses the line on every other road (re-review, epoch 2: a plain `sh -s` failed bash syntax, measured); never on a command line (so in no argument list that `ps` shows, here or on the server), never in a history. On the server the values are in the remote command's environment (`ps e`, `/proc/<pid>/environ`, for the same user and root), as the help says. | lead |
| D13 | Dropdown candidates: kind `ssh` entries with a host, not itself, not in Trash. A stored id that is no longer offered shows **(missing entry)** so a save does not drop it. At run time a missing or trashed SSH entry refuses. | lead |
| D14 | With a link, *Runs on* describes the REMOTE system; the local terminal is chosen as SSH Connect chooses it (`composedShellPath()`, `src_vs_code/src/pinnedTerminal.ts:54`). | lead |
| D15 | The agent's gate for D2 (the authorisation part, [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) §0). The SSH entry must be usable for `exec` in the Terminal entry's account. The gate is checked before the consent dialog and again at run time. Before the gate passes, the agent reads one sentence, `linkedRunRefused`, which names only the Terminal entry, with code `denied`, whatever the reason. The mask table of the call also holds the linked SSH entry's values. **A linked run is an agent's use of the SSH entry** (security spec §2.5, A1, decision B): the action names the SSH entry to the broker (`UseAction.uses`, the gate first); the broker takes its one-use turn in the same lane as a `creds_exec` on it, asks its spent marker first, and after a call that answered 200 burns it (the marker is set even when the delete fails; the used entry is burned in a `finally` after the grant's entry, so a throw for the grant's entry cannot leave it unburned), so a one-use SSH entry is spent once. Its spent marker is a member of the lane's EXISTING per-window set, at most 512 keys, the oldest dropped first: the same set, key form and cap as the marker of a `creds_exec` on a one-use entry, so its limits are the same (another window, a reload, past 512 keys; each matters only when the delete failed). A linked run needs BOTH the summary the dialog showed AND the used entry the broker holds (`ctx.uses`, compared by id, so a relink to an SSH entry that looks the same refuses); either one absent refuses (A4). A waiting rotated value of the SSH entry is released before the mask table is read (A5). | Fable security judgement, 2026-11-10 (entry 2.1); the one-use promise, the two-part compare and the release: the re-review of epoch 4 (spec third amendment, A1, A4, A5; entry 3.2's cause) |
| D16 | E3's two roads ask ssh for no remote pty: their argv starts with `-T` (`buildSshExecArgv`'s new `noTty: true`), also when the person's ssh config says `RequestTTY force`. `noTty: true` stands at exactly two production sites: `secretsArgv` (Run with Secrets: the script on stdin is never typed into a remote terminal) and the linked run's call `overSshWithSlot` (`OverSshCall.noTty`, which `execOverSsh` hands on: stdout and stderr stay apart, so D15's masking holds for a value of more than one line). `ssh:exec` and the person's clicks of `commands/agentCommands.ts` keep today's argv; their forced pty is a recorded limit of the shipped road (§7 risk 9). No `-o EscapeChar=none` (inert without a pty). | Fable security judgement (spec §18.1, A2); the scope by the lead, 2026-11-10 (re-review of epoch 4, after coai b73776c0) |
| D17 | The agent socket and the child's environment on E3's two roads (Run with Secrets over SSH, the agent's linked run). (a) The child's environment: the run ADDS only the askpass variables and, when the extension's agent serves the run, its `SSH_AUTH_SOCK`; it REMOVES the host's `SSH_AUTH_SOCK` and every inherited name that starts with `CREDS_REF_`; other ordinary variables (`PATH`, `HOME`, …) are inherited as by every spawned program. The removal is pure and has no condition: `envWithout(base, drop, platform)` in `sshProgram.ts`, with `drop: { names: readonly string[]; prefixes: readonly string[] }` (one shape, used by both roads), and the constant `E3_INHERITED_DROP = { names: [AGENT_SOCKET_ENV], prefixes: ['CREDS_REF_'] }` (`AGENT_SOCKET_ENV = 'SSH_AUTH_SOCK'`); on Windows a name or a prefix matches in any letter case. The extension's socket is laid on top only when its agent serves (the entry forwards and the socket is up). So the approved test row holds for the WHOLE environment: no `CREDS_REF_` name, no host `SSH_AUTH_SOCK`, no resolved value, and the keys added or changed over the base environment are exactly the askpass variables and our `SSH_AUTH_SOCK` (F6). The `CREDS_REF_` prefix is the lead's extension of the security spec's §18.2 (a). (b) When the SSH entry asks for agent forwarding and the extension's own agent is NOT up, the argv has no `-A` and has `-o ForwardAgent=no` (`SshExecOptions.ownAgent`), so the person's own agent is never forwarded while the banner or the journal says nothing is. `ssh:exec` keeps today's environment and argv by a required per-call word (`ownAgentOnly: false`); its own plan is [PLAN_ssh_exec_own_agent_forwarding.md](../todo/PLAN_ssh_exec_own_agent_forwarding.md) (§7a). The trust line and the consent still show `-A`: the launch does less than was approved. No `-o IdentityAgent` word: a person's own config line `IdentityAgent` still wins (§7 risk 8). | Fable security judgement (spec §18.2, A3), re-review of epoch 4; (a) by the lead's decision after coai b73776c0 |
| D18 | A password SSH entry with a jump host is NOT refused on E3's roads: askpass can answer the hop's prompt with the SSH entry's password on every road that uses that entry, so a refusal on one road would protect nothing and make D2's road smaller. The fix belongs to [PLAN_askpass_answers_the_hop.md](../todo/PLAN_askpass_answers_the_hop.md), the next plan on the SSH roads after E3 (§7 risk 7). | Fable security judgement (spec §18.3, A6), re-review of epoch 4 |

## 3. What the code does today (verified 2026-11-09 at `origin/main` 16975d0)

Paths are under `src_vs_code/src/`. This section is the system BEFORE E1, kept as the base the design was written
on. E1 (#335) and E2 (#337) are now on `main`. The lines they changed are cited in their stories documents, and E3's
stories cite the lines on `main` 454e990f.

- **Field pattern to copy — `vpnLauncherEntityId`** (a VPN entry pointing at a Terminal entry): `types.ts:115`;
  type guard `typeGuards.ts:337`; form select with "(missing entry)" `execFormFields.ts:42-58`; save scrub by kind
  `execFormFields.ts:80-91`, spread into the whole-record save at `entityFormPanel.ts:645`; webview post
  `entityFormScript.ts:688`; share strip `shareFormat.ts:537`; id remap on quarantine `idQuarantine.ts:82`.
  Candidates: `commandTargets.ts:74-121` (`collectJumpCandidates` lists ssh-reachable entries but includes Trash).
  Filled at `entityEditCommands.ts:194-199` and `commands/treeMutationCommands.ts:271-276`; empty on purpose in
  `commands/shareCommands.ts:90-97`. External export gives every node a new id and remaps no reference
  (`externalBundle.ts:76`).
- **The one road to a line**: `resolveCommand` (`commandLine.ts:76`), enforced by `test/commandRoadScan.test.ts`.
- **Roads that run a Terminal entry**:
  - Arrow: `commands/runCommands.ts:115-147` — `passGates` (OS refusal, `confirmTrusted` `trustPrompt.ts:12`,
    `runDependenciesFirst`), then `sendGuarded` (`terminalGuard.ts:33`), which is synchronous from find to send and
    opens `Creds: <folder> / <entry>` via `openEntryTerminal` (`pinnedTerminal.ts:130`, no env).
  - Folder run: `commands/folderRunCommand.ts:74-210` + `folderRun.ts`; a modal lists every line; `typeAll` is
    synchronous.
  - Dependency chain: `dependencyRun.ts` (planner; `executableLine` has 4 readers pinned by the road scan) and
    `dependencyRunHost.ts` (ONE shared terminal; each step waits for its end via shell integration).
  - VPN launcher: `vpnLauncherRun.ts` via `sendGuarded`.
  - Run with Secrets: `commands/runCommands.ts:260-311`; `creds://` refs become environment reads
    (`runPlan.ts:106`) and the values go into the env of a hidden LOCAL child (`maskedTerminal.ts:66`).
  - Agent: `agentUseActions.ts:187-237` (`terminalRunAction`) spawns a local shell and captures output.
- **SSH Connect**: `connectEntity` (`sshConnect.ts:136-348`) does, in order: request-gone check, ssh client check,
  `resolveSshCredential` (PIN), `remoteRoute` (local / WSL relay / Windows client / refuse), `connectionOptions`
  (jump chain, host-key modal, known_hosts file), known_hosts translation, `terminalPlatform`, then opens one of four
  ways: relay prefix, agent serves the key, stored key written to a 0600 file deleted on terminal close, password via
  SSH_ASKPASS in the env of a fresh terminal. It returns a boolean. `buildSshCommand` (`sshCommand.ts:125`) has no
  `-t`, no `--`, no remote command. The agent's remote exec is `buildSshExecArgv` (`sshExecCommand.ts:94`: `--`,
  remote command as one argv element) with `resolveExecAuth` (`sshExecAuth.ts`).
- **Quoting helpers**: `quoteFor` (`hostShell.ts:117`) single-quotes for posix and PowerShell; `shellQuote`
  (`sshCommand.ts:97`) double-quotes, so `$` would expand in PowerShell — not used for the remote command.
- **Trust**: `commandFingerprint` (`commandTrust.ts:38`) hashes entry id + line. The file holds a literal NUL byte as
  a separator (line 39); it is not edited by this plan.
- **Agent access**: `findUsableEntry` (`mcpEntries.ts:344`).

## 4. Design

```
entry (command, args, terminalOs, sshEntityId)
   │ sshLinkOf(entry, lookup)                       [pure  · remoteLaunch.ts]
   ▼
SshLink:  none | linked(ssh) | refused(sentence)
   │ planLaunch(entry, link, {stayOpen})            [pure]
   ▼
LaunchPlan: empty | refused | local{line} | remote{ssh, line, remoteCommand}
            (the trust line is built AFTER prepare, from the prepared snapshot: trustLineFor(prepared.ssh, prepared.jump, line))
   │                                    │ prepareSshSession(ssh)   [vscode · sshSession.ts, cut from connectEntity]
   │                                    ▼
   │                         PreparedSsh: ready{options, platform, prefix, env?, cleanup} | refused | stopped
   │                                    │ typedLine(plan, prepared, localFamily)   [pure]
   ▼                                    ▼
arrow · folder run · chain step · VPN launcher · Run with Secrets · agent   →  terminal / child process
```

### 4.1 The field

`sshEntityId?: string` on `EntityMetadata`, Terminal entries only. Same plumbing as `vpnLauncherEntityId`: type
guard (lenient string), `execDetails` scrub (`kind === 'terminal'`, never itself), new `sshLinkField` in
`execFormFields.ts` (label **Runs over SSH**, first option **— Do not use —**, then candidates, then
**(missing entry)** for a stored id not offered), one `${…}` in `entityFormPage.ts` after *Runs on*, the post key
on the existing line of `entityFormScript.ts:690`, optional `sshCandidates` in `entityFormShape.ts`, a new
`collectSshCandidates` (kind `ssh`, host, not self, not Trash), viewer row, quarantine remap, share strip, export
strip, agent-create deny-list entry. The *Runs on* hint adds: "With an SSH connection, this is the remote system."

### 4.2 The pure composer — `remoteLaunch.ts` (no `vscode`)

- `sshLinkOf(entry, lookup)`: `none` when unset; `refused` with a sentence when the id is missing, in Trash, not an
  SSH entry, has no safe host (`isSafeSshTarget`), or is the entry itself; else `linked`.
- `planLaunch(entry, link, {stayOpen})`: resolves the line through `resolveCommand` (the composer is one of the
  importers that the road scan allows, §4.5 (1)); refuses a linked entry whose *Runs on* is Windows (D9) or whose line has a newline, CR or
  NUL. Stay-open is for the INTERACTIVE roads only (arrow, folder run, VPN launcher); there the remote command is
  `eval '<line>'; s=$?; test $s -eq 0 || printf 'creds: the command ended with exit code %s\n' $s >&2; exec ${SHELL:-sh} -l`
  (the line single-quoted with `'` → `'\''`; no `"` in the wrapper itself, so it never trips the PowerShell 5.1
  refusal; `eval` parses the person's text as one script, so a trailing `# comment` or `&` cannot eat the wrapper —
  entry 1.1, exact text in the E1.S2 spec §S2.4), so a failed command is said in the terminal before the login shell starts (the login shell's own exit status is
  not the command's). The chain step, Run with Secrets and the agent get the bare line, and ssh's exit status IS the
  remote command's.
- `trustLineFor(ssh, jump, line)`: the canonical text trust is keyed on —
  `ssh [-p port] [-J jump] [-A] [-L …] [-R …] [-D …] -- user@host '<line>'` — the jump, the agent forwarding and every
  enabled forward exactly as `sshOptionArgv` composes them for the launch (re-review, epoch 2: a forward or `-A` applies
  to the launch, so a synced change that adds one must ask again), built from the person's LINE, not from the wrapped remote command,
  so one approval covers every road (arrow, folder, chain, launcher, secrets, agent). No `-i`, no known_hosts path, no
  program word, no env prefix (they hold per-window paths). A changed host, user, port, jump, agent forwarding or forward gives a
  new text, so trust asks again (D6). Today's `commandFingerprint` is reused unchanged with this text as its `line`.
- **The remote serialization contract.** ssh joins its remote arguments with spaces and hands the one string to the
  remote login shell (`$SHELL -c`); argument boundaries do not survive. So the composer passes EXACTLY ONE remote
  argument, and the local quoting exists only to deliver that argument to ssh byte-for-byte. The remote shell then
  parses the person's text exactly as if it were typed at a remote prompt: `;`, `$()`, quotes and pipes in the line
  are the person's remote syntax and are meant to be parsed there (D14: the line is written for the remote system).
  What is tested is the delivery: the typed line, run through the REAL local shell (`/bin/bash -c`, and `pwsh -c`
  when installed) with a fake `ssh` first on PATH that records its argv NUL-separated, gives ONE element after `--`
  and the destination, equal byte-for-byte to the remote command, for a corpus holding `;`, `&&`, `|`, `'`, `"`,
  `$()`, backtick, `\`, `%`, `!`, `*`, a tab and non-ASCII. The remote side is then EMULATED: the received element
  is run as `<shell> -c '<element>'` — what sshd does with an exec request, which carries one command string
  (RFC 4254 §6.5) — under `dash` and `bash` (and `zsh` when installed, else skipped with a printed reason), and its
  output must equal running the line directly in that shell. A real sshd round trip stays hand check 4.
- **Supported remote login shells**: the POSIX family — `sh`, `dash`, `bash`, `zsh`, `ksh`. One measured limit (2026-11-10): on a `dash`
  login shell, a SYNTAX error in the stored line (an unclosed quote) ends the session after dash prints the error —
  plain `eval` is a special builtin there. `command eval` would keep dash open but breaks zsh (`command` runs only
  external commands in zsh), so plain `eval` stays. `fish`, `csh` and
  `tcsh` are not supported (their syntax differs and the stay-open wrapper is POSIX); the help says so. The remote
  shell cannot be known before connecting, so this is a documented limit, not a check.
- `typedLine(plan, prepared, localFamily)`: `buildSshCommand` with a new optional `remote = {command, tty}` option:
  program, `-t`, the existing options, `--`, destination, then the remote command as ONE word quoted by
  `quoteFor(localFamily, …)`. Without `remote` the builder's output is byte-identical to today — "today" meaning after
  the security plan, which changes the win32 words that hold `$`, a backtick or a double-quote character.
- `secretsStdin(env, line)`: `NAME=<quoteFor('posix', value)>; export NAME` lines — `quoteFor` (`hostShell.ts:117`)
  closes, escapes and reopens around every `'` in a value, so a value is one literal word whatever it holds; a test
  runs the produced script under a real local `sh` and checks each variable equals its raw value for values holding
  `'`, `"`, `$`, `` ` ``, `\` and a newline — then the line inside a group
  with each brace on its own line — `{\n<line>\n} </dev/null` — then `exit $?`. The line holds no newline (refused
  above), so a trailing `# comment` in it ends at its own line and cannot swallow the closing brace. A shell's `-s` reads its script from stdin as it goes, so a command that reads
  stdin would otherwise swallow the rest of the script; a `{ … }` group is parsed whole before it runs, and its stdin
  is `/dev/null` (raised by a consultant, 2026-11-09). The exit code of the group is the exit code of the run.

### 4.3 The seam — `sshSession.ts`

`prepareSshSession(accountId, ssh, connect)` = `sshConnect.ts:143-295` moved, in the same order, opening no terminal.
Returns `ready` (entity with key path set or cleared, options, platform, relay prefix, askpass env for a password,
`acceptNew`, `cleanup()` = forget the materialised key and our pin), `refused` (reasons, for the existing
`refuseAndOfferTheFix`) or `stopped`. `connectEntity` becomes prepare + its existing open branches; its tests
(`test/sshConnect.test.ts`, `test/sshConnectRemote.test.ts`) must stay green unchanged. Roads call it with no retry:
a refusal still shows its remedy, and the person runs the entry again.

### 4.4 The roads

Order on every road a person starts: resolve and link → `prepareSshSession` (all awaits: PIN, host-key modal, route
refusal) → `confirmTrusted(trustLine)` → dependencies → the synchronous find-and-send, or the spawn.

**Where a line is resolved** (re-review, epoch 3). "Resolve" here means `resolveCommand`, called directly or through
a helper (`shownCommandLine`, `commandLine.ts:96`; `executableLine`, `dependencyRun.ts:223`). Such a resolution may only
check the entry (no command, the `{name}` refusal, in today's words) and feed the LOCAL road. For a linked entry, the
road sends the entry to its SSH branch, and that branch reads only `planLaunch`'s plan. Every road below must keep a
linked entry away from its local sinks, whether its link is valid, its SSH entry is missing, or `sshLinkOf` refuses the
link. §4.5 (5) and §6 hold this with behavioural tests.

| Road | Resolves, then routes | Local sink | Its walls before the sink |
|---|---|---|---|
| Arrow | `runEntryLine` → `arrowLine` (`resolveCommand`) → `sshLinkOf` → `link.kind === 'none'` → `runLocalLine` | `typeIntoEntryTerminal` (a send with the target `{kind:'entry'}`) | the routing branch |
| *Run with Secrets* | `secretsJobAt` → `commandJob` (`resolveCommand`) → the link → the local road (after E3.S1) | the local masked run (`runMasked`, `runInMaskedTerminal` with a `commandLine`) | the routing branch; `secretsRefusal`'s `sshLinkRefusal` |
| Dependency chain | `visitNode` → `executableLine` (`dependencyRun.ts:127`) → `addStep` → `sshLinkOf` (`:148`) → `link.kind === 'none'` → `addLocalStep` | the step typed by `dependencyRunHost.ts` (`terminal.sendText(step.typed)`, or `executeCommand` with shell integration) | the routing branch; `stepRefusal`'s `sshLinkRefusal` (`:203`) |
| Chain planned with no vault lookup | `addStep` with `walk.lookup` undefined → `NO_LINK` (`:148`, `:157`): every step is unlinked by construction | the same | `stepRefusal`'s `sshLinkRefusal` only |
| An agent's VPN start | `linkOf` (`vpnLauncherRun.ts:84-86`) answers `none` when there is no road → `runLocalLauncher` | the launcher's local send | `launcherRefusal`'s `sshLinkRefusal` (`:157`) only |
| Agent's run (after E3.S2) | the gate `linkedCall` answers `local` or `linked` → `runHere` or `runThere` | `capturedRun` in `runHere` (a local shell, output captured) | the gate's routing (E3.S2 removes the `sshLinkRefusal` call from this road) |

**One owner per prepared session.** The road that called `prepareSshSession` owns its `ready` result until the
hand-over: the moment the line is sent into a terminal (the owner becomes that terminal's close handler) or the
child is spawned (the owner becomes the child's exit handler). Until then the road holds it in a `try … finally`
whose `finally` calls `cleanup()` unless the hand-over happened — so a declined trust, a cancelled dependency, a
thrown error, a failed terminal creation and a row that is never sent all leave no key file and no pin behind. Each of
these five exits is a named test (§6).

**One snapshot per prepared session.** `ready` carries the SSH entry as it was read for the preparation, and the
jump string it resolved. The trust line, the typed line and the spawn argv are all built from THAT snapshot; nothing
between `prepareSshSession` and the send or spawn reads the SSH entry from storage again. So a sync that changes the
host while the trust dialog is open cannot send the line, or the secrets, to a host the dialog did not name.

- **Arrow and VPN launcher**: `sendGuarded` takes a target: `{kind:'entry', terminalOs}` (today) or
  `{kind:'ssh', env?}`. For `ssh` the shell is the one SSH Connect pins. With `env` (password) the guard never finds
  or disposes: it opens a new terminal with the env (D10). The key file is deleted when that terminal closes, as
  SSH Connect does. A launcher whose line uses `{config}` (a local file) is refused when linked.
- **Folder run**: the modal shows each row's trust line; after the modal and the chain, EVERY linked row is
  prepared, one after another in row order (their PIN and host-key prompts come in that order), and only then does
  the synchronous `typeAll` send anything. A row whose preparation is `refused` is reported as failed and the others
  are typed. A `stopped` row (the person cancelled a PIN or a host-key prompt) stops the whole run: nothing is typed —
  linked or not — and every row prepared so far is cleaned. `stopped` is a run-level state, checked once more
  immediately before the synchronous `typeAll`, and no row of any kind is sent after it is set.
  The modal is the folder's approval, and it is shown BEFORE preparation, from its own read of each SSH entry. So after
  preparation each linked row's trust line is rebuilt from its prepared snapshot; a row whose text differs from the one
  the modal showed (its SSH entry or jump changed while the dialog was open) is NOT trusted and NOT typed — it is
  reported as failed with "changed while the dialog was open — run the folder again" and its session is cleaned. A named
  folder test changes a jump host while the modal is open (one snapshot, §4.4). The prepared rows are one list owned by the run, and the run's `finally`
  cleans every row that was not handed over to a terminal.
- **Dependency chain**: a linked step has no stay-open (D11); a password step is refused at plan time; *Runs on* of a
  linked step is not an OS refusal; the step's key is deleted when the step ends.
- **Run with Secrets**: local window only. Order: prepare → `confirmTrusted(trustLine)` (the same host-bound trust as
  every road; it is asked AFTER the host-key decision, so it names the host the values will reach) → dependencies →
  resolve the secret values → spawn. No child exists and no byte is written to any stdin before the trust is given;
  a declined trust cleans the session and spawns nothing. The child is `ssh` by argv
  (`buildSshExecArgv(ssh, keyPath, '"${SHELL:-sh}" -s', …, { …, noTty: true })`: `-T` is the first word, so ssh asks for
  no pty also when the person's ssh config says `RequestTTY force` (D16); no `-t`; `shell:false`; the
  agent socket by the rule of D17 — the extension's own agent's socket when the SSH entry forwards and that agent is up,
  else, for a forwarding entry, no `-A` and `-o ForwardAgent=no` (`ownAgent`, from `SpawnLaunch.ownAgent`); the program on
  Windows by an absolute path — `spawnableSshProgram`: PATH's first absolute
  `ssh.exe`, else the built-in OpenSSH, else the refusal `NO_SSH_TO_SPAWN` — and the working folder `storageDir`, never
  the workspace (entry 3.1); a stored key always in its own file; E3-D4 and E3-D5); STDIN carries `secretsStdin` (D12), then
  is closed; output masked with the resolved values, as today. The ssh child's environment (D17 (a)): the run ADDS
  only the askpass variables of a password SSH entry and, when the extension's agent serves the run, its
  `SSH_AUTH_SOCK`; it REMOVES the host's `SSH_AUTH_SOCK` and every inherited `CREDS_REF_` name (`SpawnLaunch.withoutEnv`,
  always `E3_INHERITED_DROP`; `MaskedRunOptions.withoutEnv`; `spawnChild` spawns with `{ ...envWithout(process.env,
  options.withoutEnv ?? NOTHING_DROPPED, process.platform), ...options.env }`); other ordinary variables (`PATH`,
  `HOME`, …) are inherited as by every spawned program. No resolved value and no `CREDS_REF_` name is in it (the values
  go on stdin only), and the keys added or changed over the base environment are exactly the askpass variables and our
  `SSH_AUTH_SOCK` (F6, on a real recording child). A person's own ssh config
  can still name an agent (`IdentityAgent`), which wins over the variable (§7 risk 8). The askpass password and a
  person's own `SendEnv` are the accepted limit of `research/PLAN_windows_shell_quoting_injection.md` §8.
  A local VS Code window only: a WSL or Remote-SSH window refuses before prepare. The run is bounded: `ConnectTimeout=10`
  while it connects, and closing its terminal kills the child; the end of the run drops any part of the script not yet
  written. The run is NON-INTERACTIVE: no tty (`-T`, D16), and the command's stdin is `/dev/null`, so a
  command that asks a question (`terraform apply`, `apt-get install` without `-y`) reads end-of-input and usually
  stops. The banner says so before the output and names the way out: "Run in Terminal" (interactive, but the values
  are not injected); the help says the same. A **password** SSH entry: the
  human PIN prompt runs inside `prepareSshSession` as for any road; its askpass env (`SSH_ASKPASS`,
  `SSH_ASKPASS_REQUIRE=force`, the password variable) goes into the CHILD's environment — never argv — with
  `NumberOfPasswordPrompts=1` from `buildSshExecArgv`'s askpass branch and its `ConnectTimeout=10`, so a wrong password
  ends the child with ssh's error instead of a hang. `MaskedRunOptions` gains `argv`, `env`, `stdinText` and `onEnded`
  (the run's once-only end, which cleans the session, E3-D7).
- **Agent** (D2, D15; the authorisation is the Fable spec
  [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md)): the gate comes
  FIRST. `findUsableEntry(…, sshEntityId, 'exec')`, looked up in the Terminal entry's own account only, must answer
  `usable`. The gate runs in `validate` (before the consent dialog, so nobody is asked to allow a run that will be
  refused) and again in `run`. Before it passes, nothing that reads the link or the SSH entry runs, and no `planLaunch`
  runs. So the agent reads only `not_found` (the Terminal entry is gone), the bridge's own refusal (on a bridge, for every
  linked entry), or ONE sentence, `linkedRunRefused(<Terminal entry>)`, code `denied`, which names only the Terminal entry
  (entry 2.1). It is the same sentence for every reason: closed, PIN-hidden, missing, another account, in the Trash, not
  an SSH entry, an unsafe host, itself, and on such an entry also a line break, *Runs on* Windows, the `{name}` refusal
  or an empty command. The real reason goes
  to the agent journal. A switch, link or target that changed while the dialog was open is refused at run time, by a
  compare of two parts (re-review, epoch 4; spec §2.3 step 3): the summary the dialog showed (`ctx.summary`) against the
  one rebuilt now, and the used entry the broker holds (`ctx.uses`) against the gate's SSH entry, by id. For a linked
  entry an ABSENT summary or an absent `ctx.uses` is not equal and refuses with `changedWhileAsking(<T>)`, `denied`; so
  does a link moved to another SSH entry with the same name and address. For an unlinked entry a `ctx.uses` refuses, and
  an absent summary is not compared (the local run uses no second entry). An
  entry the gate answers `local` (no link) goes to `runHere`, whose local sink is `capturedRun` (a local shell, output
  captured); a linked entry never reaches it (§4.5 (5)). After
  the gate: `planLaunch` with the gate's own link (its refusals name only the Terminal entry), then `resolveExecAuth`
  (refuses a PIN-locked or woven password), jump and pin as the agent exec does, `buildSshExecArgv` with the remote
  command WITHOUT stay-open, through `execOverSsh` with `ownAgentOnly: true` and `noTty: true`, key deleted in
  `finally`. `noTty: true` puts `-T` first (D16), so a forced pty (`RequestTTY force` in the person's ssh config) cannot
  join stdout and stderr in the agent's answer. `ownAgentOnly: true` gives D17: `execOverSsh` hands `agentAwareLaunch`
  `envWithout(prepared.env, E3_INHERITED_DROP, process.platform)`, so the host's `SSH_AUTH_SOCK` and any inherited
  `CREDS_REF_` name are removed and the
  extension's own is laid on top only when its agent serves; no `-A` and `-o ForwardAgent=no` when the SSH entry
  forwards and the extension's agent is not up. `ssh:exec` passes `ownAgentOnly: false` and no `noTty`, and keeps
  today's argv and environment. Trust uses the same trust line, so one approval covers the
  arrow and the agent. The consent text names the SSH entry and its target, and shows the trust line. The mask table of
  the call holds the Terminal entry's values and the linked SSH entry's values (entry 2.1), so the agent's captured output
  is masked with both; a waiting rotated value of the SSH entry is released before that table is read, so the table
  holds the value ssh will use (spec §7, A5).
  **The used entry, its turn and its burn** (re-review, epoch 4; spec §2.5). `terminalRunAction` declares
  `uses(target)`, which answers the SSH entry only when the gate answers `linked` (and nothing before the gate passes,
  so it tells the agent nothing). The broker asks it once per call, in the same step as `summarize`, and carries it
  (`CallSubject.uses`, required key) to `run` as `ctx.uses`. The broker's turns: the grant's entry, then the used entry
  when its lane key differs; each turn's spent marker is asked first (refuse, `usedEntrySpent(<T>)`, code `denied`, for a
  spent used entry: one sentence that names only the Terminal entry); the one-use turns are taken in ONE fixed order,
  ascending lane key, so no two calls can wait for each other; an ordinary entry is never queued. After a call that
  answered 200, the grant's entry is burned as today and then the used entry by the same `burnAndMark`: deleted only when
  it is one-use, and its spent marker set after the 200 even when the delete fails. What counts as the one use is what
  counts for `creds_exec` on it: a call that answered 200 (ssh started and ended). A refusal, an untrusted line, a full
  slot or `Could not run ssh` spends nothing. A person's own run of the Terminal entry never burns the SSH entry (only the
  broker spends an entry). The used entry is burned in a `finally` after the grant's entry (`burnInTurn`), so a throw
  while the grant's entry burns cannot leave a used SSH entry unburned and unmarked. Its spent marker is a member of the
  lane's EXISTING `spent` set (`oneUseLane.ts`): one set per window, in memory, at most 512 keys, the oldest dropped
  first — the same set, key form and cap as the marker of a `creds_exec` on a one-use entry, so its limits are the
  same: another window whose storage still holds the entry does not know the marker, a reload forgets it, and past 512
  spent entries the oldest falls out. Each matters only for an entry whose delete FAILED (the accepted finding of the
  re-review round).
- **Copy Command / viewer** (both copy roads: the Copy Command command and the viewer's full-command row, `entityViewCopy.ts`): show and copy the trust line for a linked entry, with one sentence beside it: "This line
  uses your own ssh setup (agent, `~/.ssh/config`); the vault's key and password are not in it — use Run to connect
  with them." The composed launch line is never copied: it holds a per-window key path and, on the relay route, a
  socket path.

### 4.5 The structural test — `test/launchRoadScan.test.ts`

Shape of `commandRoadScan.test.ts`: (1) outside `commandLine.ts` (which DEFINES `resolveCommand`) and the tests,
`resolveCommand` is imported only by the files on one sorted list (`RESOLVE_IMPORTERS`), compared whole, so a new
importer and a vanished one both fail. The list shrinks per epic (E1.S2 spec S2-D6). After E3 it is
`['commands/runCommands.ts', 'remoteLaunch.ts']`: `runCommands.ts` keeps its import for its two LOCAL uses (the arrow's
`arrowLine` and the local *Run with Secrets*' `commandJob`), because `LaunchPlan` is not widened (E3-D13, entry 2.2).
The list shows only direct importers: a road that resolves through `shownCommandLine` or `executableLine` (the
dependency chain) is not on it, which is one more reason (5) exists;
(2) `.sshEntityId` is read only on an exact allow-list of lines, with a stale-entry check; (3) in the road files, each
send or spawn call sits on an allow-listed line; (4) a self-check that every pattern still matches something.

(5) **What the scan does not prove, and what does.** The scan reads text: it says who imports and who reads, not where a
resolved line flows. So the guarantee of §1 is held by behavioural tests, on every road of the table in §4.4 "Where a
line is resolved":

- the arrow, *Run with Secrets* and the dependency chain, each with three linked entries — a valid link, a missing SSH
  entry, and a link that `sshLinkOf` refuses (not an SSH entry, or no safe host);
- an agent's VPN start of a linked launcher, and a chain planned with no vault lookup that holds a linked step — the
  roads that treat the link as absent by construction;
- the agent's run (after E3.S2), with a linked entry whose SSH entry is usable and one whose SSH entry is closed.

On each, nothing reaches the road's local sink. Each test is watched RED by a temporary bypass of EVERY wall that the
table names for that road: the routing branch made to answer "no link" (or `local`) for every entry, and the local road's
own `sshLinkRefusal` where it has one. A wall left in place would keep the test green and prove nothing. The bypassed
road reaches the local sink and the test fails on that. The bypass is never committed, and the RED message is named in
the story's summary. The trust fixtures trust the bare local line too, so a trust modal never stops a bypassed road
before its sink.

### 4.6 Quoting, in two parses

Local shell: `quoteFor` single quotes (posix and PowerShell). Windows PowerShell 5.1 passes an argument that holds a
double quote to a native program wrongly; when the pinned shell is `powershell.exe` (5.1) and the remote command holds
`"` or ends in `\` (5.1 wraps an argument with a space in `"…"` and does not escape either; entry 1.1), the road
refuses with "install PowerShell 7". Remote shell: the person's line is written for the remote login
shell and is not re-quoted. A login shell that is not POSIX-like (fish) is a recorded limitation.

## 5. Build order

1. Field, form, round trips — and a refusal on EVERY road while the link is set (D8).
2. Pure composer, `buildSshCommand` `remote` option, structural scan.
3. The seam (`prepareSshSession`), SSH Connect unchanged.
4. Arrow and VPN launcher.
5. Folder run.
6. Dependency chain.
7. Run with Secrets.
8. Agent.
9. Help ×5, README, CHANGELOG, `research/`.

Each step is mergeable alone: a road not yet built keeps step 1's refusal.

Releases (re-review, epoch 3): steps 1-6 (E1 and E2) ship in extension 1.20.0, whose CHANGELOG entry is on `main`
(#338). That release waits until epoch 3 opens, not for E3. In 1.20.0, *Run with Secrets* and an agent's `creds_run`
refuse a linked entry with E1's sentence. Steps 7-9 (E3) ship in a later release.

Steps 7 and 8 as built in epoch 3, and what the re-review of epoch 4 adds (E3 stories §E3.4, fixed forward on E3's
branch, before E3 merges):

- 7 (built, E3.S1) gains `-T` (D16) and the agent socket rule (D17): `SshExecOptions.noTty` and `.ownAgent`,
  `secretsArgv` passes both, `SpawnLaunch.ownAgent` and `.withoutEnv`, `envWithout`, `AGENT_SOCKET_ENV` and `E3_INHERITED_DROP`,
  `MaskedRunOptions.withoutEnv`, `launchesOf` asks `spawnLaunch` first; the true environment text.
- 8 (built, E3.S2) gains the used entry, the turns and the burn of D15 in the broker, the two-part compare, the release
  of a waiting value of S, `OverSshCall.ownAgentOnly` and `.noTty` (the linked run `true` for both, `ssh:exec`
  `ownAgentOnly: false` and no `noTty`), the removal of the host's `SSH_AUTH_SOCK` for the linked run, and the bridged
  journal line.
- 9 gains the S2 documents the S2 commits left stale, the help sentence on a one-use SSH entry ×5, and the CHANGELOG
  lines of D15-D17.

E3 merges as one unit with these. No E3 build ships without them: a release with S2 and without the one-use turn would
ship entry 3.2's defect.

## 6. Test plan

| What | Where | Proves |
|---|---|---|
| Guard accepts string / undefined, rejects a number | `test/typeGuards` style | a synced node is not dropped |
| `sshLinkField` default, candidates, (missing entry); `execDetails` scrub by kind and self | `test/terminalOs.test.ts` style | the form never drops or forges a link |
| post literal holds `sshEntityId: val('sshEntityId')` | file-text pin as `terminalOs.test.ts:101-109` | the key reaches the host |
| share strip, export strip, quarantine remap | `shareFormat`, `exportSecrets`, `idQuarantine` tests | D4, renamed ids |
| candidates: not self, not Trash, host required, kind ssh | `commandTargets` test | D13 |
| every road refuses a linked entry (step 1) | arrow / folder / vpn / chain / secrets / agent worlds | D8 |
| link none / linked / missing / trashed / self / no host; Windows refusal; newline refusal; wrapper text; trust line differs per host / user / port / jump and holds no `-i` | `test/remoteLaunch.test.ts` | D5, D6, D9 |
| `buildSshCommand` byte-identical without `remote`; `-t`, `--` order; quoting of `'`, `"`, `$`, backtick for posix and PowerShell | `test/sshCommand.test.ts` | two parses |
| PowerShell 5.1 + `"` refused | composer test | §4.6 |
| delivery: the typed line through the REAL local shell (`/bin/bash -c`; `pwsh -c` when installed, else skipped with a printed reason) and a recording fake `ssh` gives one remote element equal to the remote command, for the metacharacter corpus | `test/remoteLaunchDelivery.test.ts` | §4.2 serialization contract |
| stay-open wrapper text; a non-zero exit prints the sentence (run the wrapper with `sh -c` locally, `SHELL=/bin/true`) | `test/remoteLaunch.test.ts` | finding: status not lost |
| `secretsStdin`: braces on their own lines, `exit $?`, a `# comment` line, a value with `'` | `test/remoteLaunch.test.ts`, plus a local `sh -s` run of the produced script with a stdin-reading command | §4.2 |
| cleanup ownership: declined trust, cancelled dependency, thrown error, failed terminal creation, unsent folder row each leave no key file and no pin | the road worlds | §4.4 one owner |
| a chain step linked to the same SSH entry as its parent: the step's cleanup leaves the parent's key and pin (isolated per-session file names) | `test/sshSession.test.ts` T20, chain world | §4.4 one owner |
| folder: a `stopped` row stops the run, nothing typed, every prepared row cleaned | folder world | §4.4 |
| secrets: no child and no stdin write before trust; declined trust spawns nothing; password entry → askpass vars in the child env, not argv | masked-run test with a fake spawn | §4.4 |
| Copy Command on a linked entry copies the trust line, never a key path | viewer / copy test | §4.4 |
| delivery corpus re-parsed by `dash -c` and `bash -c` (zsh when installed) equals the line run directly | `test/remoteLaunchDelivery.test.ts` | supported shells |
| folder: cancel after mixed linked and unlinked rows were prepared — no row typed | folder world | run-level `stopped` |
| snapshot: the SSH entry changed in storage after prepare (during the trust dialog) — the sent line and the spawn argv still name the prepared host; nothing re-reads storage | arrow world, masked-run test | one snapshot |
| masking end to end: a fake `ssh` echoes each injected value to stdout and stderr; the shown output is masked | masked-run test | D12 |
| export: the exported Terminal entry has no `sshEntityId`; importing the bundle does not restore it | `externalBundle` test | D4 |
| prepare opens no terminal; `cleanup` deletes key and pin; `refused` leaves nothing on disk | `test/sshSession.test.ts` | the seam |
| existing SSH Connect suites green, unchanged | `sshConnect.test.ts`, `sshConnectRemote.test.ts` | no regression |
| arrow: typed line, password → new terminal with env beside a live one, nothing disposed; declined trust → cleanup; missing link → sentence, nothing typed | arrow world | D10 |
| folder: one refused row among typed rows; prepare before the synchronous send | folder world | §4.4 |
| chain: no wrapper, password step refused, key deleted at step end | dependency tests | D11 |
| secrets: no value in argv, stdin has the exports, the remote command is `"${SHELL:-sh}" -s`, `-T` first and no `-t`, output masked, Windows refused | masked-run test with a fake spawn | D12, D16 |
| agent: usable → the bare line via `buildSshExecArgv`; consent names the SSH entry and its target and shows the trust line | agent tests (`test/agentSshRun.test.ts`, `test/sshExecOver.test.ts`) | D2 |
| agent gate: every pre-gate outcome (closed, PIN-hidden, missing, another account, unsafe host, and on such an entry a line break, *Runs on* Windows, `{name}`, no command) answers `linkedRunRefused(T)` with code `denied`, in `validate` and in `run`; no message names the SSH entry or its host; nothing spawned, no slot, no trust read; the gate runs before `planLaunch` | `test/agentSshGate.test.ts` (the security spec's G-rows) | D15, entry 2.1 |
| agent gate: a switch turned off, or a link or target changed while the dialog was open, refuses at run time; on a bridge every linked entry is refused | `test/agentSshGate.test.ts` | D15 |
| agent masking: the mask table of a call on a linked entry holds the SSH entry's password; an unlinked entry gives the Terminal entry's table only | `test/agentSshGate.test.ts` (`maskEntriesWithLink`) | D15, entry 2.1 |
| secrets: the run ADDS to the ssh child's environment only the askpass variables and our `SSH_AUTH_SOCK`, and no resolved value and no `CREDS_REF_` name; the values are on stdin only (S9 `the_run_adds_only_the_askpass_and_agent_variables_and_no_value`, M11) | masked-run tests (a real child with a recording fake `ssh`, and the road world) | D12 |
| the WHOLE child environment on E3's two roads (F6): `envWithout` takes the names and the prefixes out of a copy (any letter case on win32); on the real recording child, with a `CREDS_REF_` name and a host `SSH_AUTH_SOCK` seeded into `process.env` for the test: no `CREDS_REF_` key at all, no host `SSH_AUTH_SOCK`, no resolved value in any value, a `PATH=` entry (ordinary variables are inherited), and the keys added or changed over the base environment are exactly the askpass variables (password entry) and our `SSH_AUTH_SOCK` (when our agent serves); Run with Secrets passes `E3_INHERITED_DROP`; the linked run's environment lacks the host socket; `ssh:exec` keeps it (a guard) | `test/sshProgram.test.ts`, `test/maskedTerminal.test.ts`, `test/sshRoadSecrets.test.ts`, `test/sshExecOver.test.ts` | D12, D17 (a) |
| `-T` on E3's two roads: the builder says `-T` first only when asked (T1); Run with Secrets' argv starts with `-T` (K1, K2); the linked run's argv starts with `-T` and `ssh:exec`'s does not (T2, its guard half); `noTty: true` stands at exactly two production sites, `secretsArgv` and `overSshWithSlot` (T2's scan, with its companion) | `test/sshExecCommand.test.ts`, `test/secretsLaunch.test.ts`, `test/sshExecOver.test.ts`, `test/launchRoadScan.test.ts` | D16 (A2) |
| agent socket: a forwarding entry with no agent of ours gets no `-A` and `-o ForwardAgent=no` (builder, F1); `spawnLaunch` says whether the agent is ours (F2); Run with Secrets sends no `-A` while its banner says nothing is forwarded, and the trust line still shows `-A` (F3); the linked run with `ownAgentOnly: true` sends no `-A`, and `ssh:exec` with `false` keeps it (F4); `ownAgentOnly: false` stands at exactly one site, `ssh:exec`, and the calls of `buildSshExecArgv` with no `ownAgent` are exactly the three of `commands/agentCommands.ts` (F5, a scan with its companion; the `ownAgent` key is written at the call site of `buildSshExecArgv` in `execOverSsh`, not hidden in `connectionArgvOptions`, so the scan reads it); the host's socket does not reach the child (F6, the row above) | `test/sshExecCommand.test.ts`, `test/sshRoad.test.ts`, `test/sshRoadSecrets.test.ts`, `test/sshExecOver.test.ts`, `test/launchRoadScan.test.ts` | D17 (A3) |
| one-use: two linked runs in a row use a one-use SSH entry once (U1); a direct exec and two linked runs at once start ssh once, each road winning once (U2); a failed delete stays spent on both roads (U3); an ordinary SSH entry is not queued and burns nothing (U4); a one-use Terminal entry burns as before, both burn when both are one-use (U5); a run that did not answer 200 spends nothing (U6); the turns in key order, so two calls that use each other's entry both end (U7); every per-entry hook of the broker has a decision for the used entry (U10, a sweep left as a test); `usedEntrySpent` names one entry (U11) | `test/agentSshOneUse.test.ts` (the REAL broker, `brokerWorld` with its `vault` option; U7 through `performCall`) | D15 (A1), entry 3.2 |
| release: a waiting value of the SSH entry goes in before the table is read (U8); the agent's output masks the SSH password the run used (U9) | `test/agentSshOneUse.test.ts` | D15 (A5) |
| compare: a linked run with no shown summary or no `ctx.uses` is refused, and a local one is not compared (G11, rewritten); a linked run over another SSH entry than the one the broker holds, with the same name and address, is refused (G24) | `test/agentSshGate.test.ts` | D15 (A4) |
| `uses` names the SSH entry only after the gate, and no other action declares it (G23); the broker hands `run` the summary it showed and the used entry `uses` answered, once per call, on both doors (G17, extended) | `test/agentSshGate.test.ts` | D15 (A1, A4) |
| secrets: the run is bounded — `ConnectTimeout=10` is sent; closing the terminal kills a stalled child; the end of the run drops the unwritten script; the session is cleaned exactly once on every exit | `test/maskedTerminal.test.ts`, `test/sshRoadSecrets.test.ts` | §4.4 one owner |
| no local sink: the arrow, *Run with Secrets* and the dependency chain, each with a valid link, a missing SSH entry and a refused link; an agent's VPN start of a linked launcher; a chain with no lookup holding a linked step; the agent's run with a usable and a closed SSH entry — nothing reaches the road's local sink (§4.4 table); each watched RED by the temporary bypass of every wall of §4.5 (5) | arrow world, secrets world, chain and launcher worlds, agent world | §1, D7 |
| road scan: the importer list, the link readers and the send or spawn sites are each an exact allow-list | `test/launchRoadScan.test.ts` | D7 (who imports and reads; not where a value flows) |
| help tests (5 languages) | existing help tests | rule 7 |

**The acceptance matrix per entry** (re-review, epoch 4; the step-3 consultation b73776c0 named the drift: reuse of
`ssh:exec`'s road was taken as inheritance of its guarantees). An agent's linked run uses TWO entries, the Terminal
entry T (the grant's) and the SSH entry S (the used entry). Each guarantee is decided and tested for each:

| Guarantee | T (the Terminal entry) | S (the SSH entry) |
|---|---|---|
| consent | T's grant and T's ask policy decide the dialog; the dialog names S and its target and shows the trust line (D2, D15) | S's own *Usable by agents* switch is required at every call (the gate, in `validate` and in `run`); S's ask policy is not consulted, by decision (security spec §3.2); a switch flipped while the dialog stood refuses (G2-G10, G20, G22) |
| consumption | T's own one-use turn and burn, as today (U5) | S's one-use turn in the same lane as `creds_exec` on S, spent marker first, burned after a 200 in a `finally` (U1-U7, U10, U11) |
| authentication | T holds no credential of the connection; the trust line, keyed on T, decides whether the line may run (AG2) | S's credential through `resolveExecAuth` (a PIN-locked or woven password refused, X3, X4); the host's agent socket removed, ours only when it serves; no `-A` without our agent (F1-F6) |
| masking | T's values in the mask table, as today | S's values in the same table (G14), with a waiting rotated value released first (U8, U9); `-T`, so a forced pty cannot join the streams (T2) |

## 7. Risks

1. **An older extension build** ignores the field and runs the command locally; its Save rebuilds the whole record
   and erases the field, and sync carries that everywhere. No version gate exists for any field of this product; the
   same risk was accepted for `vpnLauncherEntityId` and `dependsOn` (`research/PLAN_os_aware_execution.md`, risk 2).
   The exposure is the window between a person's first link and the update of their other machines (the Marketplace
   updates extensions by default). Recorded, not solved here; the guarantee of §1 is narrowed to this build and later.
   Checked and not built: storing a *Runs on* value that old builds refuse — `entryShell` uses the default profile in
   a Remote-SSH window and does not refuse there, so it is not airtight (§9).
2. **Windows PowerShell 5.1 quoting** of native arguments (§4.6) — refused for `"`; other cases are a hand check.
3. **A key file lives while the stay-open terminal lives** — the same lifetime as SSH Connect's session today, plus
   the purge on activate and deactivate.
4. **A second terminal with the same title** after a password run (D10).
5. **A reused terminal that is still in the remote shell**: a second run types into the remote shell. The guard's
   `finished` verdict cannot see this; after an SSH run the terminal's state is `unknown`, so the person is asked.
6. **Non-POSIX remote login shells** (fish) break the wrapper.
7. **A password SSH entry with a jump host** hands the askpass environment to the hop's nested ssh, so a hop that asks
   for a password is answered with the destination's password. This is the open defect of
   [PLAN_askpass_answers_the_hop.md](../todo/PLAN_askpass_answers_the_hop.md). Its two paths now carry this plan's roads too
   (security spec §18.3): the SSH Connect preparation and `-J` (the arrow, a VPN's launcher and the folder run, E2,
   released in 1.20.0), and `buildSshExecArgv` with `auth: 'askpass'` and `jump` (Run with Secrets over SSH, E3.S1, and
   the agent's linked run, E3.S2). (The dependency chain refuses a password SSH entry at plan time.) E3 does NOT refuse a
   password SSH entry with a jump (D18): the same agent reaches the same hop by `creds_exec` on the same SSH entry, so a
   refusal here would be a measure at one of its sites and would make D2's road smaller for no gain. The limit is
   recorded, and that plan's priority rose: it becomes the next plan on the SSH roads after E3. It is not a condition of
   E3's merge or release: no road of E3 adds a new way to reach the defect.
8. **What of the person's own ssh setup still reaches a spawned ssh on E3's two roads** (security spec §16 items 15-17,
   §18.2 (a)). The run removes the host's `SSH_AUTH_SOCK` and every `CREDS_REF_` name (D17 (a)), so no agent key comes
   from the inherited variable. Still recorded, not changed:
   - the person's `~/.ssh/config` applies (`SendEnv`, `ProxyCommand`, `ForwardAgent` less what D17 (b) takes away), and
     an `IdentityAgent` line there wins over the variable (measured with `ssh -G`, OpenSSH 10.2p1), so ssh then uses
     that agent. `-o IdentityAgent=none` (or `=SSH_AUTH_SOCK` when our agent serves) would override it and was measured
     to win over the config; it is not sent, because it overrides a line the person wrote;
   - Windows is NOT checked: with no `SSH_AUTH_SOCK` the Windows OpenSSH client may use the Windows agent service's
     default pipe, and a key of that service could still be offered. Hand check 3's third line, run on Windows, answers
     it; if a key of the service signs in, the option above is the fix and the lead decides;
   - the host's ambient `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE` and `DISPLAY` are inherited when the SSH entry does not use
     askpass. A key entry runs with `BatchMode=yes`, so ssh asks no askpass helper and they change nothing there; a
     password entry's own askpass variables are laid on top of them;
   - an SSH entry with no stored key and no password signs in on these two roads only with the person's default key
     files and their ssh config (not the inherited agent). Nothing of E3 is released, so nothing that works today stops.

   Whether the person's ssh setup applies to a spawned ssh is one question for all its parts, and
   `PLAN_askpass_answers_the_hop.md` owns it (§9).
9. **A forced pty on `ssh:exec`** (security spec §16 item 11; D16). With `RequestTTY force` in the person's ssh config,
   `ssh:exec` and the three clicks of `commands/agentCommands.ts` get a remote pty: `stdout` and `stderr` are joined,
   line ends become CR LF, and a value of more than one line is then not masked in the agent's answer. E3's two roads
   say `-T` (D16) and do not have this limit. `-T` is not sent on `ssh:exec`, because it would change a shipped road
   (a person may rely on a forced pty, for `sudo` for example). Routed to
   [PLAN_ssh_exec_own_agent_forwarding.md](../todo/PLAN_ssh_exec_own_agent_forwarding.md), which decides what an agent's spawned
   ssh takes from the person's ssh setup.

## 7a. Neighbour plans

| Plan | Touches | This plan's part |
|---|---|---|
| [PLAN_askpass_answers_the_hop.md](../todo/PLAN_askpass_answers_the_hop.md) | askpass + `-J` defect, on both its paths; whether the person's ssh setup applies to a spawned ssh | none: E3 does not refuse a password SSH entry with a jump (D18) and inherits the fix (risk 7). Its table names this plan's roads on each path. It goes FIRST among the SSH-road plans after E3 (its priority rose, security spec §18.3); it is not a condition of E3's merge |
| [PLAN_ssh_exec_own_agent_forwarding.md](../todo/PLAN_ssh_exec_own_agent_forwarding.md) (new, re-review of epoch 4) | `ssh:exec` on a forwarding SSH entry forwards the person's OWN agent when the extension's agent has no key; the three clicks of `commands/agentCommands.ts`; a forced pty on `ssh:exec` (risk 9) | none in code: this plan makes `ownAgentOnly` a required per-call word, the linked run says `true`, `ssh:exec` says `false` with a comment naming that plan, and the F5 scan pins the one `false`. That plan turns it to `true` (one word) after E3, with the owner's yes. Disjoint: this plan changes no shipped argv |
| [PLAN_ssh_exec_absolute_program.md](../todo/PLAN_ssh_exec_absolute_program.md) | `ssh:exec`'s program on Windows and its folder (CWE-426, entry 3.1's class) | none: E3 adds `spawnableSshProgram` for the masked run only; that plan applies it to `ssh:exec` (and so to the agent's linked run) after E3 merges |
| [PLAN_terminal_runs_followups.md](../todo/PLAN_terminal_runs_followups.md) | the same roads (`sendPinned`, the arrow's `{config}`, `fresh` disposing by name), and item 5 (`quoteFor` and typographic quotes) | none: item 5 is closed by the security plan below, not here; E2 adds the `ssh` target to `sendGuarded` |
| [PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md) | `quoteFor('powershell')`, the win32 `shellQuote` words, the askpass `.bat`, `envPrefix` — shipped local-injection defects found by E1's class sweep (entry 1.2) | none: that plan owns the fix and ships FIRST, as its own PR on its own clock; E1 is rebased onto it and keeps only its own changes |
| [PLAN_remote_bridge_scoped.md](../todo/PLAN_remote_bridge_scoped.md) | stored commands run by an agent ON a server through the bridge | none; the bridge keeps refusing `run` (§9). Disjoint: that plan runs a line on the server an agent lives on; this one runs a person's line on a server they connect to |

| [PLAN_consent_coverage_per_door.md](../todo/PLAN_consent_coverage_per_door.md) | `credsAgentServer.ts` (the stamp write, its gate), built on its own branch, unmerged | none: E3 changes other lines of `credsAgentServer.ts` (`perform`'s `uses`, `prepared`'s release, the `refuse` and `burn` closures, spec §11) and not the stamp; E3 keeps the stamp keyed on the Terminal entry (spec §3.2). Whichever merges second re-reads the file after the merge (the file is at 793 of its 800-line ceiling) |

The table is complete for plans open on 2026-11-10 that touch the files of the roads (§4.4) or the broker lines E3
changes. Checked by `grep` for `brokerCall.ts`, `credsAgentServer.ts`, `oneUseLane`, `sshExecCommand.ts` and
`useActions.ts` over `todo/PLAN_*.md`: the bridge plan and its stories (row above, disjoint), the consent-coverage plan
(this row), and `PLAN_grant_lifecycle_and_95_release.md` (plan only since 2026-09-17; the grant's lifetime at the doors,
not the lines E3 changes) and `PLAN_product_improvements.md` (two passing mentions) — neither shares a line with E3.

## 8. Growth surfaces

None new. Materialised key files already have an owner: deleted on terminal close, child exit or `finally`, and the
`keys/<pid>/` purge on activate and deactivate (`keyInstaller.ts`). The re-review of epoch 4 adds no surface either: a
one-use SSH entry spent by a linked run adds one key to the broker's existing spent set (`oneUseLane.ts`), which is per
window, lives as long as the window and is already bounded (the oldest marker falls out past its cap, its own doc); its
queue entry is pruned when the call settles, and a held turn always ends because a queue moves on when its job settles,
on failure as on success (`keyedQueue.ts`). At most one more marker per linked run, the same as one `creds_exec`.

## 9. Not in this plan

- An AGENT-started VPN (`creds_vpn_up`) whose launcher, or one of whose chain steps, is a linked Terminal entry: it
  stays REFUSED with the shared sentence (fail closed, which meets §1). D2 opens only `creds_run`; opening this road is
  an authorisation decision for a later plan with its own security judgement (raised by the E2 stories, 2026-11-10).

- The Windows quoting security fix of SSH Connect (entry 1.2) — its own plan, [PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md), landing before E1.

- A Windows remote (D9) — a later plan, after a hand check of Windows OpenSSH's default shell.
- Remapping references on external import (an existing gap for all four reference fields).
- A version gate against older builds (risk 1) — a product-wide sync/schema feature. A cheaper idea for later: a
  fail-closed marker that every road of an old build already refuses in every window kind (the *Runs on* value is
  not one, see risk 1).
- The bridge: it refuses `run` and `terminal` today (`bridgeAllowList.ts:44-46`) and keeps doing so.
- Other calls of an agent that use a second entry (security spec §16 item 9). CHECKED: the four other reference fields
  — an `sshkey` cannot be one-use; `-J` uses no stored credential of the hop; an agent's run starts no dependency. NOT
  CHECKED: an agent's VPN start (`creds_vpn_up`), which runs a launcher and a chain: whether those Terminal entries'
  own switch, one-use policy and mask values are honoured there. That road stays refused for linked entries (first
  bullet) and its own security judgement is owed with it.

**Open questions, owned by other plans** (re-review, epoch 4; this plan does not decide them):

- **`ssh:exec`'s `-A` with no key in the extension's agent.** Read in the code, not observed on a host: an SSH entry
  that forwards the agent, opened to agents, on a machine where the extension's own agent has no key and the extension
  host has an `SSH_AUTH_SOCK`: `ssh:exec` sends `-A`, the child inherits the host's socket, and the person's OWN agent is
  forwarded and signs with no prompt, while the journal says nothing is forwarded (security spec §16 item 10). Shipped
  before this plan; E3 does not change it (`ownAgentOnly: false`, D17). Owner:
  [PLAN_ssh_exec_own_agent_forwarding.md](../todo/PLAN_ssh_exec_own_agent_forwarding.md), which needs the owner's yes, because
  its fix takes away something a person may use today.
- **Whether the person's ssh config applies to a spawned ssh** (`SendEnv`, `ForwardAgent`, the agent's keys,
  `ProxyCommand`, `RequestTTY`): one question for all its parts (risk 8, risk 9). Owner:
  [PLAN_askpass_answers_the_hop.md](../todo/PLAN_askpass_answers_the_hop.md) (its Definition of Done, third row).

## 10. Hand checks (owner)

Done 2026-11-10 by the lead, with the owner's leave, on the owner's IONOS server (a throwaway user, deleted after):
hand check 4's delivery on a REAL peer — the E2 build's typed line (`buildSshCommand` with the `remote` word), run by
the host's real pwsh 7.6.9 and Windows `ssh.exe` 9.5 against real sshd and bash: 8 of 8 hostile commands printed
exactly what a local bash prints (`;`, `&&`, `|`, `$( )`, backticks, nested quotes, a tab, non-ASCII, typographic
quotes, a `-oProxyCommand=` text); the stay-open wrapper printed the output, then the exit-code sentence, then the
login shell. Hand checks 1-3 (the UI) stay the owner's.

1. Local Windows, pwsh 7: arrow on an entry linked to a key SSH entry; `tmux new -A -s {name}`; detach; the remote
   shell stays.
2. The same with a password SSH entry; a second run opens a second terminal.
3. Run with Secrets over SSH on a Linux host, once with a key entry and once with a password entry; the value is
   masked; `ps` on the host shows the login shell with `-s`; a bash-only line (`[[ … ]]`) runs under a bash login shell; a wrong password ends with ssh's error, not a hang.
   Three lines added by the re-review of epoch 4 (D16, D17; security spec §18.1, §18.2). Each observes an effect on a
   real session that the unit tests cannot see:
   - with `RequestTTY force` in `~/.ssh/config`, Run with Secrets of a line that runs `tty` prints `not a tty`, and the
     script is not echoed;
   - with `ForwardAgent yes` in `~/.ssh/config`, a forwarding SSH entry and no key in the extension's agent, Run with
     Secrets of `echo "${SSH_AUTH_SOCK:-none}"` prints `none`;
   - with a key that is ONLY in the person's own agent (not a default key file) and that the server accepts, an
     `SSH_AUTH_SOCK` of that agent in the extension host, and an SSH entry whose stored key the server does NOT accept:
     Run with Secrets ends with ssh's `Permission denied` (before the build it signs in with the agent's key). On
     Windows the same line, with the key in the Windows agent service, answers risk 8's Windows question.

   If any of the three fails: stop and report. The measure is then a comment, not a protection (`security.md`).
4. A real peer: a linked entry whose line is `printf '%s|' a\ b "c;d" '$(x)' && echo; echo "$HOME"` prints the same
   on the server as when typed at a remote prompt (bash and zsh login shells).

## 11. Definition of Done

- [ ] Every road runs a linked entry over SSH or refuses with a sentence; none runs it locally.
- [ ] The no-local-sink tests of §4.5 (5) green, each watched RED by its temporary bypass (the RED message in the
      summary).
- [ ] An agent's refusal of a linked run is the one sentence that names only the Terminal entry, code `denied`; the
      agent's captured output is masked with the linked SSH entry's values too (D15).
- [ ] The one-use promise holds through the REAL broker (D15, entry 3.2): two linked runs in a row use a one-use SSH
      entry once (U1); a direct exec and two linked runs at once start ssh once (U2); an SSH entry whose delete failed
      stays spent on both roads (U3); and U4-U11, G11, G17, G23 and G24 green, each watched RED first.
- [ ] `-T` first on the argv of E3's two roads and of no other (T1, K1, K2, T2 with its scan of the two `noTty: true`
      sites); no `-A` without the extension's agent on E3's two roads (F1-F5); the whole child environment on E3's two
      roads holds no host `SSH_AUTH_SOCK`, no `CREDS_REF_` name and no resolved value, and adds only askpass and our
      socket (F6); `ssh:exec`'s argv and environment unchanged (the guard halves of T2, F4 and F6).
- [ ] The acceptance matrix of §6 (consent, consumption, authentication, masking, for T and for S) has a green test in
      every cell.
- [ ] `launchRoadScan.test.ts` and `commandRoadScan.test.ts` green.
- [ ] `npm run typecheck`, `npm test` and lint in `src_vs_code` green, at lowered priority.
- [ ] SSH Connect's existing tests green, unchanged.
- [ ] Help changed in all five languages, English first; README, CHANGELOG, `research/module_extension.md`,
      `research/module_tests.md` updated.
- [ ] Hand check 3's three observations of §10 are handed to the owner with it (with `RequestTTY force`, `tty` prints
      `not a tty` and the script is not echoed; with `ForwardAgent yes` and no key in the extension's agent,
      `SSH_AUTH_SOCK` is `none`; a key only in the person's own agent is not used, so a stored key the server refuses
      ends with `Permission denied`); if any fails, stop and report. Owed, not a gate for the merge, like the rest of
      hand check 3.
- [ ] coai: a plan round reached `proceed`; a code round ran; every finding resolved; verdicts and reviewer counts in
      the summary.
- [ ] Plan promoted with its deviations when shipped.

## 12. Deviations — what shipped differently from this plan (promoted 2026-11-11)

Shipped: E1 and E2 in extension 1.20.0 (#341; E1 #335, E2 #337); E3 in extension 1.21.0 (`src_vs_code/CHANGELOG.md`, `## [1.21.0]`),
pending its release PR (E3 is on `feat/terminal-command-over-ssh-e3`). Each stories document keeps its own table of
deviations; this section lists what a reader of the PARENT needs first and cites those tables instead of copying them.
Where a line records something as not done or not possible, it says what was CHECKED.

**Plan changes (the ledger above is the record).** Three stops, three whole re-reviews, nothing narrowed: entry 1.2
(the security sweep left E1 for its own plan), entry 2.2 (below) and entry 3.2 (the one-use burn). Epoch 4 stood at
0 entries when the ledger was read whole at promotion (it is still open there; the ledger is append-only).

**E1** ([PLAN_terminal_command_over_ssh_E1.md](PLAN_terminal_command_over_ssh_E1.md) §S4, F1-F7, fixed before E1 merged):
F1 `trustLineFor` also carries `-A` and every enabled forward; F2 *Update it* on a received share keeps the RECIPIENT's own
link; F3 the secrets script is read by the remote login shell, `"${SHELL:-sh}" -s`; F4 Export uses `withoutSshLink` and the
candidate list uses the link decision; F5 ONE `withAcceptNew`, in the pure `sshCommand.ts`; F6 small duplicates removed;
F7 stale text corrected. E1 was built as one commit with the security sweep inside it; the sweep was cut out and
promoted as [PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md) (the epoch 2 record above).

**E2** ([PLAN_terminal_command_over_ssh_E2.md](PLAN_terminal_command_over_ssh_E2.md)): its four recorded deviations (the text of
`sshStopped`; the `carriesEnvironment` rule; A1 corrected after the code round; the one owner and the one re-check moved
into `sshRoad.ts` and serving four roads) and its flags 2-5: flag 2, a password step is refused AFTER the chain's
preparation and before any step runs, not "at plan time" as §4.4 said (the credential kind is known only inside
`prepareSshSession`), so the PIN may be asked first; flag 3, the road scan did not see `executeCommand(`, and S3 added it;
flag 4, Copy All is a third copy road, and `typedLine` takes `localShell: HostShell`; flag 5, files the E2 list did not
name. Flag 1 (an agent's `creds_vpn_up` on a linked launcher or chain step) stays refused (§9).

**E3** ([PLAN_terminal_command_over_ssh_E3.md](PLAN_terminal_command_over_ssh_E3.md)):

- **E3-D2.** Over SSH the references come only from the line that runs (`planRefs([plan.line])`); a reference that is only
  in a disabled argument row is not read. The local road still reads disabled rows.
- **E3-D4.** A spawn always writes the key file (`prepare(…, 'spawn')`): a spawned child does not reach the window's agent.
- **E3-D5 (round 2, B1, entry 3.1).** The masked ssh child is an absolute program on Windows and starts in the extension's
  storage folder, never in the workspace (CWE-426). `ssh:exec` and the agent's run keep their own program and folder
  (flag 8); that hardening is [PLAN_ssh_exec_absolute_program.md](../todo/PLAN_ssh_exec_absolute_program.md).
- **E3-D13 and entry 2.2: the first §4.5 (1) importer target was given up.** `commands/runCommands.ts` still imports
  `resolveCommand` for the local Run with Secrets and the arrow's local line, because `LaunchPlan` was deliberately not
  widened (E3's plan round 1). The epoch 3 revision wrote the shipped list into §4.5 (1) and put the guarantee on the
  no-local-sink tests (LN1-LN11, AG8). This is history for the reader, not a gap.
- **Flag 4.** The sentence of `sshLinkRefusal`, "…which this version cannot do yet…", was not reworded. Checked: the
  non-test callers of `sshLinkRefusal(` at the last commit before promotion are `vpnLauncherRun.ts`, `dependencyRun.ts` and
  `commands/runCommands.ts`; whether "yet" misleads a person there was not decided.
- **The CHANGELOG path** is `src_vs_code/CHANGELOG.md`, not `CHANGELOG.md` (flag 5); E3-D5 also chooses the program and the
  agent socket of the secrets child, which §4.4 did not name.
- **`-o SendEnv=-NAME` for the askpass variables: checked, NOT built.** Measured in
  [PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md) §8: OpenSSH removes only a pattern that is
  literally equal, not a wildcard, so the flag would look like protection and give none. The limit stays as the owner
  accepted it on 2026-11-10 (`research/module_extension.md`, `src_vs_code/CHANGELOG.md` 1.19.0, *Known limits*): a person's own
  `SendEnv` together with a server's `AcceptEnv` could send an askpass password. The resolved VALUES are never in that
  environment (stdin only), so no `SendEnv` can carry them.
- **Recorded, not built.** The agent's linked run reads the mask table BEFORE it waits for its lane, so a rotation released
  during that wait is not in the table (the old design of `creds_exec`; E3 stories, after the S3 table, "the mask table is read
  before the call waits in a lane").

**The epoch 4 decisions, shipped as written** (D15-D18; the baseline of epoch 4, not ledger entries): D15 a linked run is an
agent's use of the SSH entry (the used entry, its turn and its burn in the broker, the two-part compare, the waiting value
released first, the bridged journal line); D16 `-T` on E3's two roads only; D17 the host's `SSH_AUTH_SOCK` and every
`CREDS_REF_` name removed from the child's environment, and no `-A` without the extension's own agent; D18 a password SSH
entry with a jump host is NOT refused ([PLAN_askpass_answers_the_hop.md](../todo/PLAN_askpass_answers_the_hop.md) owns the fix).
The deviations of S1, S2 and the fix forward (the table of RED evidence, `linkedSummary`'s signature, G19, G10 (b), G4,
U7's measured deadlock, F6's ignored keys, the bridged journal line) are in the E3 stories document, **"Deviations of S1
and S2"**; the two accepted code-review fixes (a masked run closed during its banner kills the child and writes no script;
`execOverSsh` reads the agent socket once) and the typed fixtures that replaced the `as never` casts are in its
**"The review fixes"** table. The CHANGELOG of 1.21.0 also says that a spent SSH entry stays spent in this window and names
the Windows ssh-agent pipe as a known limit (commit 8c2bd268, from the same review).

**Owed, not done.** Hand checks 1-3 of §10 are the owner's (3 with the three lines of epoch 4 and E3's two observations of
E3-D11); hand check 4 was done on 2026-11-10. The merge and the release PR of E3 are not part of this promotion.

## Epics

Three epics over the nine build-order steps of §5, each of three stories. The split was five epics until the plan
gate's round 2 (2026-11-09), when the operator commanded: 2-3 epics of 2-3 logically complete stories, fewer is fine,
never more; the gate runs once per epic; each epic has its own branch, started from the previous epic's commit, and
lands as ONE commit. That command outranks our defaults, so five became three: the seam joined the field and the
composer (no road runs without the three), the terminal roads kept one epic, and the two non-interactive roads took
the closing documents with them. Documentation is updated with every change: the help, README and `research/` lines
for a road land in that road's story, so no epic is only documents. Each epic is mergeable alone: a road not yet built
keeps E1's refusal (D8), so no build between two epics runs a linked command locally.

The gate runs once per epic, declared with `plan` and `epic: "k/3"`. The consultation cadence is once per three
epics, so one consultation runs before E1 is built and none is owed before E2 or E3. The stories below carry one line
of scope each; each epic's stories document, `research/PLAN_terminal_command_over_ssh_E<n>.md`, is written by Opus when
that epic starts, and this section gets the link to it then (the both-sides rule of `planning-docs.md`).

The question consultant was asked what is important (2 of 2 answered, 2026-11-09). Ranked: (1) the single launch
composer with the canonical trust line, two-shell quoting and fail-closed coverage of every road — a missed road runs
a destructive command LOCALLY; (2) the SSH preparation seam cut from `connectEntity` — identity, host pin, route, the
lifetime of the credential and the key, and the "one owner" and "one snapshot" rules of §4.4 — the largest regression
radius on an existing security flow; (3) the non-interactive boundary — Run with Secrets over stdin to the login shell's `-s`, and
the agent gate. With three epics the quota is Q = ⌈2·3/5⌉ = 2, so areas (1) and (2) are the cornerstone areas. Both
live in E1, so at most two E1 stories can be marked, and E2 and E3 carry no mark. Area (3) is watched without a mark:
its agent gate is authorisation, which `subagent-models.md` gives to a Fable security judgement outside any quota; the
rest of it is an Opus judge's.

| Epic | Steps of §5 | Stories | Cornerstone area |
|---|---|---|---|
| E1 · Foundation: the field, the refusal on every road, the composer, the seam | 1, 2, 3 | S1 field · S2 composer · S3 seam | yes — areas (1) and (2) |
| E2 · Terminal roads: arrow and VPN launcher, folder run, dependency chain | 4, 5, 6 | S1 arrow + launcher · S2 folder run · S3 chain | none |
| E3 · Non-interactive roads and closing: Run with Secrets, agent, the rest of the documents | 7, 8, 9 | S1 secrets · S2 agent · S3 closing | none (area (3), watched) |

### E1 · Foundation: the field, the refusal on every road, the composer, the seam

Stories: [PLAN_terminal_command_over_ssh_E1.md](PLAN_terminal_command_over_ssh_E1.md); cornerstone specs
[E1.S2](PLAN_terminal_command_over_ssh_E1_S2_spec.md) and [E1.S3](PLAN_terminal_command_over_ssh_E1_S3_spec.md).

- **Goal.** A Terminal entry can store an SSH link, the form round-trips it, every road refuses a linked entry with a
  sentence, ONE pure module is the only way from "entry + link" to a launch (a structural test pins who imports and reads; since the epoch-3 re-review the behavioural no-local-sink tests of §4.5 (5) hold that no linked entry reaches a local sink), and
  `prepareSshSession` does everything `connectEntity` does before it opens a terminal. After E1 no road can run a
  linked line locally, built or not, and every road of E2 and E3 has its composer and its seam ready.
- **Stories.**
  - **S1 — The field.** `sshEntityId` on `EntityMetadata`, the `sshLinkField` select (**— Do not use —**, candidates,
    **(missing entry)**), every round trip (guard, scrub, post, share strip, export strip, quarantine remap,
    `collectSshCandidates`, viewer row, agent-create deny-list), and a refusal on EVERY road while a link is set
    (step 1, D8). Lands first. Its help line for the field in five languages, English first, and the README sentence.
  - **S2 — The composer.** `remoteLaunch.ts` (`sshLinkOf`, `planLaunch`, `trustLineFor`, `typedLine`,
    `secretsStdin`), `buildSshCommand`'s `remote` option (byte-identical without it), the delivery test through the
    REAL local shell with a recording fake `ssh` and the emulated remote parse, the PowerShell 5.1 refusal, and the
    road scan `test/launchRoadScan.test.ts` (step 2). `research/module_extension.md` names the module and the scan.
  - **S3 — The seam.** `prepareSshSession` in `sshSession.ts`, cut from `sshConnect.ts:143-295` in the same order,
    returning `ready | refused | stopped` with `cleanup()`; `connectEntity` becomes prepare + its four open branches;
    its two suites green unchanged (step 3). `research/module_extension.md` names the seam and its contract.
- **Scope.** §4.1 whole, §4.2 whole, §4.3 whole, §4.5, §4.6 (the PowerShell 5.1 refusal); build steps 1, 2 and 3;
  D5–D9, D13, D14. Files: `types.ts`, `typeGuards.ts`, `execFormFields.ts`, `entityFormPanel.ts`,
  `entityFormScript.ts`, `entityFormPage.ts`, `entityFormShape.ts`, `commandTargets.ts` (`collectSshCandidates`),
  `shareFormat.ts`, `externalBundle.ts`, `idQuarantine.ts`, the viewer row, the agent-create deny-list; a refusal line
  in each of `commands/runCommands.ts` (arrow and Run with Secrets), `commands/folderRunCommand.ts`,
  `dependencyRun.ts`, `vpnLauncherRun.ts`, `agentUseActions.ts`; new `remoteLaunch.ts`; `sshCommand.ts`
  (`buildSshCommand` `remote` option); new `sshSession.ts` and `sshConnect.ts` (the call and the open branches); new
  `test/launchRoadScan.test.ts`, `test/remoteLaunch.test.ts`, `test/remoteLaunchDelivery.test.ts`,
  `test/sshSession.test.ts`, `test/sshCommand.test.ts` additions; the five help files (the field's line), `README.md`,
  `research/module_extension.md`, `research/module_tests.md`. Risk 7 is inherited by S3 on purpose and not fixed here.
- **Depends on.** The coai plan round at `proceed` and the one consultation of the cadence; since epoch 2 also the
  security plan [PLAN_windows_shell_quoting_injection.md](PLAN_windows_shell_quoting_injection.md), which lands
  first. S1 lands before S2 (D8); S3 can be built beside them; the three land in E1's one commit on E1's branch.
- **As built and re-reviewed (epoch 2).** E1 was built as one local commit (782444a) and passed its coai code round
  (`proceed`, 8 of 8 reviewers). That commit also holds the security sweep, which moves to its own plan: E1 is
  rebased onto that plan's commit and keeps only its own changes. The fixes owed before E1 merges are listed in
  [PLAN_terminal_command_over_ssh_E1.md](PLAN_terminal_command_over_ssh_E1.md) §S4. Merged on 2026-11-10 as #335
  (f3b024b7), with the security plan before it (#334 promoted it). The road scan as built pins the importers of that day
  as a list (E1.S2 spec S2-D6), not a count of two.
- **Done when.** §6 rows "guard", "`sshLinkField`", "post literal", "share strip", "candidates", "every road
  refuses", "export", "link none / linked / …", "`buildSshCommand` byte-identical", "PowerShell 5.1", "delivery",
  "stay-open wrapper text", "`secretsStdin`", "delivery corpus re-parsed", "road scan", "prepare opens no terminal" and
  "existing SSH Connect suites green, unchanged" are green; `commandRoadScan.test.ts` still green; the road scan's
  `RESOLVE_IMPORTERS` is the sorted list of that day's importers, compared whole (§4.5 (1); E2 and E3 shrink it);
  `cleanup()` deletes the materialised key and our pin; a `refused` result leaves
  nothing on disk; no road calls the seam yet; the help tests pass for the field's line.
- **Cornerstone areas (1) and (2).** Area (1) is S2: the canonical trust line (no `-i`, no known_hosts path, a new
  text for a new host, user, port or jump), the two-shell quoting (`quoteFor` for the local parse, the line untouched
  for the remote parse), and the fail-closed coverage — S1's refusals plus the road scan that pins every `.sshEntityId`
  reader and every send or spawn to an allow-listed line. Area (2) is S3: the order of the awaits, the per-window
  route, and the lifetime of the credential, the key file and the askpass env from `ready` to `cleanup()` — the
  contract behind the "one owner" and "one snapshot" rules every road in E2 and E3 relies on. Opus marks the concrete
  stories (at most two, within Q = 2) when the E1 stories document is written, and updates the ledger line below in
  the same commit.

### E2 · Terminal roads: arrow and VPN launcher, folder run, dependency chain

Stories: [PLAN_terminal_command_over_ssh_E2.md](PLAN_terminal_command_over_ssh_E2.md).

- **Goal.** A person's roads that type into a VS Code terminal run a linked entry on the chosen host, in the order
  "resolve and link → prepare → trust → dependencies → synchronous send", with `cleanup()` on every exit that sends
  nothing, from one snapshot of the SSH entry. The help, README and `research/` lines for each road land with it.
- **Stories.**
  - **S1 — Arrow and VPN launcher.** `sendGuarded` takes a target `{kind:'entry', terminalOs}` or `{kind:'ssh', env?}`;
    a password entry opens a new terminal with the env BESIDE a live one (D10); a launcher whose line uses `{config}`
    is refused when linked; Copy Command and the viewer show the trust line with its one sentence (step 4). Help ×5
    for the arrow, the launcher and Copy Command; the `helpEn.ts:84` hand-written ssh advice is replaced here.
  - **S2 — Folder run.** The modal shows each row's trust line; every linked row is prepared in row order before the
    synchronous `typeAll`; a `refused` row is reported and the others typed; a `stopped` row stops the whole run and
    cleans every prepared row; the run's `finally` cleans what was not handed over (step 5). Help ×5 for the folder run.
  - **S3 — Dependency chain.** A linked step has no stay-open (D11); a password step is refused at plan time; *Runs on*
    of a linked step is not an OS refusal; the step's key is deleted when the step ends (step 6). Help ×5 for the chain.
- **Scope.** §4.4 head (order, one owner, one snapshot) and bullets "Arrow and VPN launcher", "Folder run",
  "Dependency chain", "Copy Command / viewer"; build steps 4, 5, 6; D10, D11; risks 3, 4, 5. Files: `terminalGuard.ts`
  (`sendGuarded` target), `pinnedTerminal.ts`, `commands/runCommands.ts:115-147`, `vpnLauncherRun.ts`,
  `commands/folderRunCommand.ts`, `folderRun.ts`, `dependencyRun.ts`, `dependencyRunHost.ts`, the Copy Command and
  viewer; their test worlds; the five help files, `README.md`, `research/module_extension.md`,
  `research/module_tests.md` for these roads. It adds the `ssh` target to `sendGuarded` and must not close or change
  the items of `PLAN_terminal_runs_followups.md` (§7a).
- **Depends on.** E1 merged (composer, scan allow-list, seam). E2's branch starts from E1's commit and lands as one
  commit. Each story is complete alone; a road whose story is not yet built keeps E1's refusal.
- **As built.** Merged on 2026-11-10 as #337 (44f3f3dc); `RESOLVE_IMPORTERS` lost `folderRun.ts`. The arrow resolves
  its line before it reads the link (`runEntryLine` → `arrowLine` → `sshLinkOf`); the routing that keeps a linked entry
  away from `typeIntoEntryTerminal` is pinned by E3's no-local-sink tests (§4.5 (5)), tests only, no change to E2's code;
  so are the chain (`executableLine` before `sshLinkOf`), an agent's VPN start and a chain with no lookup.
  Hand check 4 is done (§10).
- **Done when.** §6 rows "arrow", "folder" (both), "chain", "cleanup ownership" (declined trust, cancelled dependency,
  thrown error, failed terminal creation, unsent folder row), "folder: a `stopped` row", "folder: cancel after mixed
  rows", "snapshot" (the arrow world half) and "Copy Command" are green; the road scan is green with the new send lines
  allow-listed; the help tests pass for the changed lines; hand checks 1, 2 and 4 of §10 are handed to the owner (they
  are owed, not a gate for the merge; hand check 4 was done on 2026-11-10).
- **Cornerstone areas.** None. The key-file and password lifetimes these roads use are E1 S3's contract; the roads
  only call `cleanup()`. Opus judges each story.

### E3 · Non-interactive roads and closing: Run with Secrets, agent, the rest of the documents

Stories: [PLAN_terminal_command_over_ssh_E3.md](PLAN_terminal_command_over_ssh_E3.md).

- **Goal.** The two roads that run a child process instead of typing into a terminal run a linked entry over SSH
  without a secret on a command line (in no argument list that `ps` shows) or in a history — on the server the values are
  in the remote command's environment (`ps e`, `/proc/<pid>/environ`), as the help says; the agent road runs only when the SSH entry itself is
  open to the agent for `exec`, and otherwise refuses with the one sentence that names only the Terminal entry, code
  `denied` (D15). A linked run is an agent's use of the SSH entry: it spends a one-use SSH entry once, through the
  broker's own turn and burn (D15). Both roads ask ssh for no pty (`-T`, D16); neither road's ssh gets the host's agent
  socket, and neither forwards the person's own agent while it says nothing is forwarded (D17). Neither road lets a
  linked entry reach a local sink (§4.5 (5)).
  Then every document describes the shipped system and the plan is promoted with its deviations.
- **Stories.**
  - **S1 — Run with Secrets.** Order prepare → `confirmTrusted(trustLine)` → dependencies → resolve values → spawn; the
    child is `ssh` by argv (`buildSshExecArgv(ssh, keyPath, '"${SHELL:-sh}" -s', …)`, no `-t`, `shell:false`); STDIN carries
    `secretsStdin` then closes; askpass env in the CHILD's environment, never argv, and no resolved value in that
    environment; the non-interactive banner; output masked; the run bounded (connect timeout, a close kills the child);
    Windows and a non-local window refused (step 7, D12). The no-local-sink tests of §4.5 (5) for the arrow, *Run
    with Secrets*, the dependency chain, an agent's VPN start and a chain with no lookup land here (S1 changes the
    routing in `commands/runCommands.ts`; the others guard E2's merged code). Help ×5 for Run with Secrets,
    with the banner's way out. Built in epoch 3 (d4ebcab9 … 320297b8). Fixed forward in epoch 4 (stories §E3.4):
    `-T` first in its argv (D16), the agent socket rule and the removal of the host's `SSH_AUTH_SOCK` and of any
    `CREDS_REF_` name from the child's environment (D17).
  - **S2 — Agent.** The gate of D15 first (in `validate` and in `run`), else `linkedRunRefused(T)`, code `denied`, and
    nothing runs; then `planLaunch` with the gate's link; `resolveExecAuth`, jump and pin as the agent exec does;
    `buildSshExecArgv` with the bare line; key deleted in `finally`; the consent text names the SSH entry and its
    target; the mask table holds the SSH entry's values; the no-local-sink test of the agent's run (`runHere`'s
    `capturedRun`, §4.5 (5)) (step 8, D2, D15). Help ×5 for the agent road. Built in epoch 3 (757bf3a3 … 7c6e4ffb).
    Fixed forward in epoch 4 (stories §E3.4): the used entry, its turn and its burn in the broker (`uses`,
    `CallSubject.uses`, the turns in key order, `burnInTurn`, `usedEntrySpent`), the two-part compare, the release of a
    waiting value of S, `OverSshCall.ownAgentOnly` and `.noTty` (the linked run `true` for both, so `-T` and no host
    agent socket; `ssh:exec` `ownAgentOnly: false` and no `noTty`), the bridged journal line, and the help sentence on a
    one-use SSH entry ×5.
  - **S3 — Closing.** What the road stories did not already change: the remaining help ×5 lines (the limits — POSIX
    remote shells only, Windows remote refused, the risk-1 note), `README.md`, a new `src_vs_code/CHANGELOG.md` entry for
    E3's two roads (1.20.0's entry, #338, already holds E1 and E2 and says these two roads still refuse) with the lines
    of D15-D17, the S2 documents the S2 commits left stale (`README.md`, `research/module_extension.md`,
    `research/module_tests.md`), the deviations of S2 and the size-ratchet baseline,
    `research/module_extension.md` and `research/module_tests.md` as a whole, the `todo/README.md` and
    `research/README.md` rows, and the promotion of the plan and its stories and spec documents together, deviations
    recorded (step 9).
- **Scope.** §4.4 bullets "Run with Secrets" and "Agent"; §4.5 (5); build steps 7, 8, 9; D2, D12, D15; DoD rows
  "no-local-sink tests", "agent's refusal", "Help changed in all five languages" and "Plan promoted". Files:
  `maskedTerminal.ts` (`MaskedRunOptions` gains `argv`, `env`, `stdinText` and `onEnded`; `shell:false`),
  `commands/runCommands.ts` (Run with Secrets), `remoteLaunch.ts`, `sshRoad.ts`, `sshProgram.ts` (since epoch 4 also
  `envWithout`, `AGENT_SOCKET_ENV`, `E3_INHERITED_DROP`), `outputMask.ts`,
  `runPlan.ts`, `agentUseActions.ts` (`terminalRunAction`), `useActions.ts` (`validate`/`summarize` take the call
  target; `UseActionContext.summary`), `brokerCall.ts`, `mcpEntries.ts` (`findUsableEntry` on the SSH entry),
  `maskEntries.ts` (`maskEntriesWithLink`), `sshUseActions.ts` (`execOverSsh`, `ownAgentOnly`), `sshExecCommand.ts`
  (`buildSshExecArgv`'s `noTty` and `ownAgent`), `sshExecAuth.ts` (`resolveExecAuth`, used), `extension.ts` (in place only,
  not one line longer); since epoch 4 also `brokerCall.ts` (the turns, the burn of the used entry, `usedEntrySpent`),
  `credsAgentServer.ts` (in place, at most 797 of its 800 lines), `useActions.ts` (`UsedEntry`, `uses`,
  `OverSshCall.ownAgentOnly`); `mcpEntries.ts`, `oneUseLane.ts`, `burnOnUse.ts` are used, not changed; the
  tests and worlds named in the E3 stories document (new `test/agentSshOneUse.test.ts`); the five help files, `README.md`, `src_vs_code/CHANGELOG.md`,
  `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`, `research/README.md`; the plan and its
  stories and spec documents (the `git mv` last).
- **Depends on.** Epoch 4 open (no new E3 code before it; S1 and S2 were built in epoch 3, before the stop of entry
  3.2). E1 (`secretsStdin`, trust line, scan, seam) and E2 (so the
  closing text describes every road as it exists). E3's branch starts from E2's commit, rebased onto `main`, and lands
  as one commit. Its plan round (`review_plan`, `epic: "3/3"`) passed in round 2 (`proceed`, 2026-11-10); the
  revision of epoch 4 goes to the interim path of `plan-change-control.md` (this branch's plan round has passed). S1 and
  S2 are each complete alone; their fix forward of epoch 4 is part of E3's one unit (§5): E3 does not merge without it.
  S3 closes what the earlier stories left.
- **Done when.** §6 rows "secrets" (all), "masking end to end", "snapshot" (the masked-run half), "agent", "agent gate"
  (both), "agent masking", "the WHOLE child environment", "`-T` on E3's two roads", "agent socket", "one-use",
  "release", "compare", "`uses`", "no local sink" and "help tests (5 languages)" are green, and every cell of the
  acceptance matrix of §6 has its test: no value in argv or anywhere in the child's environment, no host
  `SSH_AUTH_SOCK` and no `CREDS_REF_` name there, `-T` first on both roads, the exports and the `{ … } </dev/null` group on stdin, `"${SHELL:-sh}" -s`, `-T` first and no `-t`, output
  masked, the run bounded, Windows and a non-local window refused; no `-A` without the extension's agent on the two
  roads; a one-use SSH entry spent once by a linked run, through the real broker; every pre-gate outcome gives `linkedRunRefused(T)` with code
  `denied` and names no SSH entry, the usable one gives argv via `buildSshExecArgv`, the consent names the SSH entry, the
  mask table holds its values; each no-local-sink test was watched RED by its bypass; the `research/` pages and the
  README name the field, the trust line and the refusals; `helpEn.ts` no longer tells a person to write the ssh line by
  hand; the plan and its stories documents are promoted together with the deviations recorded; hand check 3 of §10, with its three lines of epoch 4, is
  handed to the owner.
- **Cornerstone areas.** None within the quota: this is consultant area (3), ranked below (1) and (2). The agent gate
  (the SSH entry's own `exec` eligibility, no confused deputy, no leak in the refusal text) and, since epoch 4, the
  one-use promise of the used entry, the two-part compare and the ssh words of D16 and D17 are authorisation or security
  judgements, so they are a Fable security judgement outside the quota (the spec's third amendment), not a marked story.
  Stdin ownership, EOF, the group's `/dev/null`, secret-free argv and masking are an Opus judge's, with the fake-spawn
  test as the proof.

Cornerstones: 2 of 2 — E1.S2, E1.S3
