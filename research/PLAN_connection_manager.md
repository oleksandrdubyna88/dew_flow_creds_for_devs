# PLAN — the connection-manager fields an SSH entity is missing

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/` — SSH entities, both
> command builders, the Connect path, the agent broker's exec, the form and the viewer.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (items D7 and B10),
> [PLAN_ssh_agent.md](PLAN_ssh_agent.md) (agent forwarding meets the per-use confirmation).
>
> **Deviations from the plan, and what they cost.**
>
> - **The human path now ASKS where it used to assume, and the first attempt got this backwards.**
>   The plan said to replace a silent `accept-new`. The first implementation replaced it with
>   `accept-new` on BOTH paths — weaker than ssh's own default for a terminal somebody is watching,
>   and the opposite of what B10 wanted. An existing test caught it. What shipped: a human terminal
>   is left ssh's default (`ask`, which prompts); an agent exec — which has nobody to ask — keeps
>   `accept-new`; and a PINNED host is `StrictHostKeyChecking=yes` against a known_hosts file
>   holding exactly that key, on both paths.
> - **First contact is deliberately not negotiated for an agent.** An unattended call has nobody to
>   compare a fingerprint against, so it does not pin; the fingerprint is offered when a human
>   connects. An agent still gets the enforcement of a pin that already exists.
> - **Tags shipped; colours did not.** The tree already spends colour on history and on sync
>   readiness, and a third axis would collide with both. Tags render as `#label` in the row
>   description and are matched by the existing filter — which is also why they are validated:
>   a tag arrives by sync like every other field.
> - **An ambiguous `ProxyJump` is left unlinked.** Two imported entities with the same name mean
>   the reference cannot be resolved, and a guess would route a connection through a machine
>   nobody chose — the same rule `creds://` references already follow.
>
> **Open tail:** the pin is per ENTITY, so two entities naming one host pin it twice; and the
> user's own `~/.ssh/known_hosts` is deliberately not consulted, which keeps this answer
> independent of whatever is in that file but means a host already trusted in a plain terminal is
> still a first contact here.

## Symptom

An SSH entity here holds host, user, port and a key. Every dedicated connection manager — Termius,
Royal TS, MobaXterm, even a hand-written `~/.ssh/config` — holds four more things people need daily:

1. **A jump host.** The bastion is the normal shape of a production network. Today the only way to
   reach a host behind one is to type `-J` by hand into a terminal the extension opened, which
   throws away the credential handling that is the point of the product.
2. **Port forwarding.** `-L 5432:db.internal:5432` is how a developer reaches a database that is
   not exposed. It is retyped from memory every time, and mistyped.
3. **Agent forwarding.** `-A`, needed to `git clone` from the remote host.
4. **A known host key.** `sshConnect.ts:67` and `sshExecCommand.ts:87` pass
   `StrictHostKeyChecking=accept-new` **silently** (audit item B10). First contact with an
   impostor is accepted without a word, and the fingerprint nobody was shown is the only thing
   that would have said so.

And `~/.ssh/config` import (shipped in D4) already **reads** `ProxyJump` — and then drops it,
because there is no field to put it in.

## Goal

- `jumpHostEntityId` — a jump host as a **reference to another entity**, exactly as
  `sshKeyEntityId` already references a key. Never a free-text `-o ProxyCommand=`.
- `portForwards` — typed `-L` / `-R` rules, each a row that can be kept but switched off, the way
  command arguments already work.
- `agentForward` — a flag, with the honest warning that it lets the remote host use the agent.
- `hostKey` — the pinned host key, shown as a **fingerprint** on first contact with a Trust button,
  and enforced afterwards. This closes B10.
- `tags` — free labels, shown in the tree row and matched by the existing filter.

Every one of them must survive sync, share, backup, external export and revision history, and none
may become a channel for a string that ssh's own argv parser would read as a flag.

## The rule that shapes all of it

`sshCommand.ts`'s header states it: `host` and `user` are **untrusted** — they arrive by sync and by
Accept Share. Every field added here is untrusted in exactly the same way, and each is a new way to
reach ssh's parser. So each is validated at composition and refused rather than escaped:

| Field | Refused unless |
|---|---|
| jump host | it resolves to an entity whose own `isSafeSshTarget` passes; the chain has no cycle and is at most 4 deep |
| forward | both ports are 1–65535 and the host is `isSafeSshHost`; a bind address is a host or `*` |
| host key | the algorithm is a known key type and the body is base64 |
| tag | letters, digits, and `-_. `; at most 24 characters |

## Design

1. **`sshOptions.ts` (pure, `vscode`-free).** `PortForward` and its validator, `renderForward`
   (`-L`/`-R` argument text), `resolveJumpChain(entity, byId)` returning the `-J` value or a named
   refusal, and `sshOptionArgv(entity, chain)` producing the shared option array both builders use.
2. **`hostKeyPin.ts` (pure).** `parseKeyscan(text)` → `{ algorithm, base64 }[]`;
   `hostKeyFingerprint(base64)` (reusing `keyFingerprintOf` from `sshKeyParse.ts` — the same
   `SHA256:…` a person compares against what the server prints); `knownHostsLine(host, port, key)`
   with the `[host]:port` form a non-default port requires; `pinVerdict(pinned, scanned)` →
   `first-contact | match | mismatch`.
3. **`hostKeyScan.ts` (impure, thin).** Runs `ssh-keyscan` through the existing `runBounded`, so the
   ceilings and the abort signal are the ones already in production.
4. **Both builders take the options.** `buildSshCommand` (string, human terminal) and
   `buildSshExecArgv` (argv, agent) each render the same decisions; the pure module is shared so the
   two cannot drift — the reason `sshCredential.ts` exists.
5. **Enforcement.** With a pin, a materialized known_hosts file in the per-window `keys/<pid>/`
   directory plus `StrictHostKeyChecking=yes`; without one, today's `accept-new` and an offer to pin.

## Build order

1. `sshOptions.ts` + `hostKeyPin.ts` with their tests (RED first).
2. `types.ts` fields + validation + every enumeration site (share, backup, external, revision).
3. Both builders, then `sshConnect.ts` and the broker exec.
4. The form section, the viewer rows, the tree tag description.
5. `~/.ssh/config` import: stop dropping `ProxyJump`, and read `LocalForward`/`RemoteForward`.
6. Docs, CHANGELOG, an integration test that a pinned mismatch actually refuses.

## Test plan

- Forwards: valid `-L`/`-R`, both port bounds, a hostile host, a disabled row omitted, round-trip
  of the compact `8080:localhost:80` form.
- Jump chain: one hop, two hops, a **cycle** refused by name, a missing entity refused, a jump host
  whose own target is unsafe refused, depth cap.
- Host key: keyscan parsed, fingerprint matches `ssh-keygen -lf` for a real key, `[host]:port` form
  for a non-default port, mismatch detected, first contact distinguished from mismatch.
- Both builders render the same options for the same entity (one test asserting agreement).
- **The first test of the feature**: no field added here can put a leading `-` or a shell
  metacharacter into either the command line or the argv.

## Definition of Done

- [ ] Jump host, forwards, agent forwarding, host-key pin and tags on an SSH entity, all synced.
- [ ] B10 closed: a fingerprint is shown before a first connection is trusted, and a changed key
      refuses rather than warns.
- [ ] `~/.ssh/config` import no longer drops `ProxyJump`.
- [ ] Tests above green; `npm test`, `npm run lint` and the itests green on Windows and WSL.
- [ ] README, `module_extension.md`, CHANGELOG updated; this plan promoted.
