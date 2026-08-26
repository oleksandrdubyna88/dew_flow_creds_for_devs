# PLAN — An SSH agent that confirms every use, and Git commit signing through it

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/` — SSH key entities, a new
> agent-protocol server, the terminal environment, the Connect path, and one clipboard helper for Git.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (item **D1**, owner decision §7.5).
>
> **Deviations from the plan, and what they cost.**
>
> - **"Allow for 10 minutes" was added to the dialog**, which the plan did not have. A `git push` signs
>   and authenticates in one breath, so a strictly-per-use modal would have taught people to click
>   through it — the failure mode the feature exists to avoid. It is per key, in memory only, and the
>   dialog says so.
> - **The signing config sets `gpg.ssh.program` on Windows**, which the plan did not foresee. Measured
>   2026-08-25: Git-for-Windows ships an MSYS `ssh-keygen` that cannot reach a named pipe
>   (`Bad file descriptor`), while the built-in OpenSSH one can. Without that line Git reports a signing
>   error with nothing naming the cause.
> - **Encrypted keys are refused with the fix, not just a refusal.** `bcrypt_pbkdf` is not in Node; the
>   message names the `ssh-keygen -p -N ""` invocation rather than saying "unsupported key".
> - **Verified on both platforms with the real tools**, which is what the plan asked for and what several
>   of these findings came from: `ssh-add -l` and `ssh-keygen -Y sign`/`-Y verify` (the exact mechanism
>   `git` uses) against the running agent — Windows OpenSSH 9.5 and WSL Ubuntu OpenSSH 9.6.
> - **A test-only bug worth recording**, because it looked like a product bug for a minute: the P-521
>   case failed until the test's own DER re-packing used a long-form length. The module was right; the
>   check was wrong.
>
> **What a post-implementation review caught, and what it cost to fix** (2026-08-25, three
> reviewers over the finished branch — security, resource lifetime, architecture):
>
> - **A command injection, and the worst kind: one the user runs themselves.** An entity name
>   became the SSH key comment, the comment went into `user.signingkey "key::…"`, and
>   *Copy Git Signing Config* put that on the clipboard for a person to paste into a shell. An
>   entity name arrives from somebody else's CSV or JSON export (**D4**, same branch), so
>   `srv" ; curl … | sh #` would have run when the user did exactly what the feature told them to.
>   Closed at both ends: `sanitizeKeyComment` reduces a comment to what a comment may contain, and
>   the signing config uses the key WITHOUT its comment, validated against a strict pattern —
>   an unreadable key now produces no commands rather than a command that is not what it looks
>   like. Two tests in `gitSigningConfig.test.ts` carry the exploit strings.
> - **The consent rule was stranded in the one `vscode` file.** `applyChoice` decided whether a
>   private key signs, and no `node:test` could reach it — the exact mistake this repository has
>   already paid for twice (`entityText.ts`, `sshCommand.ts`). It is now `agentConsent.ts`, pure
>   and tested, including the asymmetry that matters: a dismissed dialog refuses AND counts as
>   nobody being present, while only "Allow for 10 minutes" remembers anything.
> - **The tree tokens had no test.** Which of Add/Remove the menu shows, and whether *Copy
>   One-Time Code* appears, now has one — in the same harness the `:pwd` cache regression uses.
>
> **Open tail (deliberate, per the owner decision in §7.5):**
>
> - **"Load into a running agent with a lifetime" is NOT built.** Per-use confirmation with a description
>   of what is being signed is only possible in an agent we run.
> - **The MSYS/Git-Bash `ssh` cannot use the Windows agent** — it wants a cygwin socket, which is a
>   different transport. The extension says so rather than looking broken. A cygwin-socket emulation is
>   the obvious next step if anyone asks for it.
> - **`Connect SSH` prefers the agent only for a key the agent serves**; a key path on disk and a
>   password are unchanged.

## Symptom

A private key kept in the vault is written to disk (`0600`, owner-only ACL) every time `ssh -i` needs a
path (`keyInstaller.ts:115-127`; the broker re-materialises and deletes it on every call,
`sshUseActions.ts:105-109,183-185`). Every major password manager now serves keys through an SSH agent
that asks before each use and never writes the key out; it is the first line users compare. And a key
that only exists as a file cannot sign Git commits without `~/.ssh` — `gpg.format ssh` wants either a
file or an agent.

## Goal

- The extension runs **its own SSH agent** (a Unix socket, or a named pipe on Windows), serving the keys
  the user marked *Add to SSH Agent*. Key material is read from SecretStorage into memory; **nothing is
  written to disk**.
- Every signature request opens a modal naming the key and what is being signed — an SSH login as
  `user`, or a Git signature — with *Allow*, *Allow for 10 minutes*, *Deny*. Every request is written to
  an output channel.
- `SSH_AUTH_SOCK` is injected into new integrated terminals through the environment variable collection,
  so `ssh` and `git` find the agent without configuration.
- **Copy Git Signing Config** puts the `gpg.format ssh` / `user.signingkey "key::…"` / `commit.gpgsign`
  lines on the clipboard for the key.
- *Connect SSH* on an entity whose key is served by the agent opens the terminal with `SSH_AUTH_SOCK` and
  no `-i` — the key stays off disk for the human path too (POSIX; see the Windows note).

## Owner decision taken here (§7.5 of the roadmap): own socket, not "load into a running agent"

Per-use confirmation with a description of what is being signed is only possible in an agent we run:
`ssh-add -c` delegates the confirmation to an askpass program the Windows service agent has no way to
show. Loading into an existing agent is not built; it is recorded as the open tail.

## Measured on 2026-08-25 before designing

A Node `net` server on `\\.\pipe\…` answered `C:\Windows\System32\OpenSSH\ssh-add.exe -l` correctly
("The agent has no identities."). The Git-for-Windows (MSYS) `ssh-add` **cannot** connect to a named pipe
(`Bad file descriptor`) — so on Windows the agent works with the built-in OpenSSH client, and the
signing config sets `gpg.ssh.program` to the built-in `ssh-keygen.exe`. The status command says so.

## Where it plugs in (verified 2026-08-25)

| Concern | File | Today |
|---|---|---|
| Credential resolution | `sshCredential.ts:22-56` | stored key → path → password; both human and broker |
| Human Connect | `sshConnect.ts:18-85` | materialises the key, deletes on terminal close |
| Key material on disk | `keyInstaller.ts:115-127`, `materializedKeys.ts` | per-window `keys/<pid>/` |
| Env collection | `envApply.ts`, `extension.ts:129` | `envCollection.replace(name, value)` |
| Consent modal precedent | `credsAgentServer.ts:269-319` | per-grant; the agent needs per-use |
| Tree token | `treeDataProvider.ts:442-484` | `:key` on `isSshKey` |
| Commands | `extension.ts:1189-1207`, `package.json` | `installSshKey` / `removeInstalledKey` |

## Design

1. **`sshAgentProtocol.ts` (pure).** Frame reader; message numbers (11/12/13/14/5/6); encoders for the
   identities answer and the sign response; a decoder for the sign request; `describeSignRequest(data)`
   — recognises the SSH userauth blob (session id, `50`, user, service, `publickey`) and the `SSHSIG`
   preamble (namespace, e.g. `git`), so the modal can say what is being signed.
2. **`sshKeyParse.ts` (pure).** OpenSSH `openssh-key-v1` (unencrypted) and PEM private keys → a Node
   `KeyObject` + the SSH public key blob (Ed25519, RSA, ECDSA P-256/384/521), the `ssh-… AAAA… comment`
   line and the `SHA256:` fingerprint. A passphrase-protected OpenSSH key is refused with a message —
   the vault already encrypts it at rest, and bcrypt_pbkdf is not in Node.
3. **`sshAgentSign.ts` (pure).** The SSH signature blob per key type and flags (`rsa-sha2-256/512`,
   `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp*` with mpint `r`,`s`).
4. **`sshAgentServer.ts` (vscode-free).** `net.createServer` on `agentSocketPath(storageDir, platform,
   pid)`; identities `{ entityId, name, publicBlob, sign }`; a `confirm(identity, purpose)` callback
   decides each sign request; unknown messages → `SSH_AGENT_FAILURE`. Frames capped at 256 KB.
5. **`sshAgentManager.ts` (vscode).** Owns the server, loads flagged keys from SecretStorage, shows the
   modal, remembers *Allow for 10 minutes* per key, writes the output channel, sets/clears
   `SSH_AUTH_SOCK` in the env collection, exposes `socketFor(keyEntityId)` for Connect.
6. **`gitSigningConfig.ts` (pure).** The `git config --global` lines for a public key line and platform.
7. **Metadata.** `EntityMetadata.sshAgent?: boolean` — the flag syncs (a preference, not a secret);
   `:agent-on` / `:agent-off` tokens on `:key` entities drive *Add to* / *Remove from SSH Agent*.

## Build order

1. `sshAgentProtocol.ts`, `sshKeyParse.ts`, `sshAgentSign.ts` + tests (RED: fixtures generated with
   Node's `generateKeyPairSync`, signatures verified with `crypto.verify`).
2. `sshAgentServer.ts` + a test that drives it over a real socket with hand-built frames.
3. `sshAgentManager.ts`, commands, manifest, `sshConnect.ts` integration, `gitSigningConfig.ts`.
4. `scripts/ssh-agent-itest.cjs`: the real `ssh-add -l` against the running server (built-in OpenSSH on
   Windows).
5. Docs + CHANGELOG.

## Test plan

- Protocol: frame splitting across chunks, identities answer layout, sign request decode, purpose
  description for a userauth blob and an SSHSIG blob.
- Keys: Ed25519/RSA/EC round-trip (PEM → blob → public line matches `ssh-keygen`-style encoding);
  encrypted OpenSSH key refused with the stated message.
- Signing: each type verifies under `crypto.verify` with the matching digest; RSA flags choose the digest.
- Server: REQUEST_IDENTITIES lists loaded keys; SIGN with confirm=false → FAILURE; confirm=true → a
  verifying signature; unknown key → FAILURE; oversize frame → connection closed.
- Git config: the four lines, plus `gpg.ssh.program` on Windows only.
- **First test of the feature**: with a key loaded and a signature produced, no file under `keys/`
  contains the key material and the private key string appears in no output-channel line.

## Definition of Done

- [ ] Add/Remove from SSH Agent on key entities; agent serves them; every use confirmed; channel logs.
- [ ] `SSH_AUTH_SOCK` injected into new terminals; Connect uses the agent for served keys (POSIX).
- [ ] Copy Git Signing Config.
- [ ] Tests above green; the itest passes against the real `ssh-add`; `npm test` green.
- [ ] README, `module_extension.md`, CHANGELOG updated; this plan promoted with the "load into a running
      agent" tail recorded.
