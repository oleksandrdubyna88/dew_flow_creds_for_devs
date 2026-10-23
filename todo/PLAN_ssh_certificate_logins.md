# PLAN — an SSH login with an OpenSSH certificate is named as a login, and a login window can cover it

> Status: **plan only, nothing implemented yet, 2026-10-23.** Scope: `src_vs_code/src/sshAgentProtocol.ts` (the
> userauth classifier), its tests, one live leg of the SSH agent itest, `research/module_extension.md` and
> `research/module_tests.md`. Extension only; no format, contract or server change.
>
> Issue: [#279](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/279). Extracted from the open tail of
> [PLAN_ssh_allow_longer_windows.md](../research/PLAN_ssh_allow_longer_windows.md) §18 (#197, implemented 2026-10-22).
> A first draft: no gate has read it yet.

## 1. The symptom

A person logs in to a server with an OpenSSH **user certificate**, and the private key is in this extension's SSH
agent. The client puts the certificate blob, not the plain public key, into the userauth request it asks the agent to
sign. The classifier compares that blob byte for byte with the signing key, finds a difference, and calls the request
`unknown`. So, today:

- the prompt says *"a signature whose purpose this build does not recognise"*, not *an SSH login as "user"* with the
  server's host key;
- `longWindowClaim` makes it `not-login`, so the prompt offers no *Allow longer…*, and an open login window
  **never covers it** — every certificate login asks again, or needs the 10-minute window, which covers every purpose.

This is the safe direction, chosen on purpose in #197 E1.1 and pinned by a test. It is still a defect for every person
whose servers use certificates: they get the vague prompt that #197's own screenshot complained about.

## 2. What the code does today (verified 2026-10-23 on `origin/main` 957e4d44)

| Fact | Where |
|---|---|
| The classifier's entry point; anything that is not SSHSIG goes to the userauth reader | `src_vs_code/src/sshAgentProtocol.ts:418-422` (`describeSignRequest`) |
| Its written contract says a certificate login is reported as unrecognised, because the agent holds plain keys | `sshAgentProtocol.ts:372-375` |
| A userauth is a login only when its key blob **equals** the signing key's blob and its algorithm fits that key | `namesThisKey` `sshAgentProtocol.ts:296-301`; `algorithmFits` `:291-293`; `algorithmMatches` `:286-288` (the key's own type, or `rsa-sha2-256/512` for `ssh-rsa`) |
| The tail (nothing, or the host key) is read only after `namesThisKey` passes; a failure is `unknown` | `readKeyTail` `:343-346`; `describeUserauth` `:352-359` |
| Why a certificate BODY handed over as data is never read as a login: a 32-byte cert type reads as a session id, and the next byte is the top byte of the nonce's length, bounded by `MAX_FRAME_BYTES` | `:390-395`; `MAX_FRAME_BYTES` `:43` |
| `unknown` becomes `not-login` — no long window, no *Allow longer…* | `src_vs_code/src/agentConsent.ts:198-203` (`longWindowClaim`) |
| The server classifies against the request's own key blob | `src_vs_code/src/sshAgentServer.ts:236` |
| **The test that pins "certificates are unknown"**: *a userauth that names an OpenSSH certificate is unrecognised when the agent signs with the plain key* (with a positive control for the plain key) | `src_vs_code/src/test/sshAgentProtocol.test.ts:382-392` |
| The certificate-BODY test, which must stay as it is | `src_vs_code/src/test/sshAgentProtocol.test.ts:394-402` |
| The shared userauth builder the fixtures use | `src_vs_code/src/test/sshUserauth.ts:64` (`userauth`) |
| The live sshd helpers (an `extraConfig` argument exists); the itest is 760 lines of the 800 limit | `src_vs_code/scripts/itestSshd.cjs:68` (`startSshd`); `scripts/ssh-agent-itest.cjs` `liveLoginWindow` `:591` |

## 3. Not verified yet — measure before any code

- **What OpenSSH really sends** when the certificate is a file (`CertificateFile`) and the key is in this agent: the
  `SIGN_REQUEST`'s key blob (plain key or certificate?), the userauth's blob and its algorithm name. The existing
  fixture assumes *plain key in the request, certificate in the userauth, algorithm = the cert type*
  (`sshAgentProtocol.test.ts:383-387`). That fixture is hand-built, not measured.
- **The RSA algorithm names** a client sends with an RSA certificate (OpenSSH `PROTOCOL.certkeys`: the
  `-cert-v01` names, with the `openssh.com` domain suffix, of `rsa-sha2-256`, `rsa-sha2-512` and `ssh-rsa`) — confirm
  them in the live login, not from the document alone. (The full names are not written here: the public-hygiene
  check reads `name@domain` as an e-mail address; the code builds them by `join`, as `sshAgentProtocol.test.ts:385`
  does.)
- A certificate **added to the agent** itself is out of scope: this agent serves plain keys only.

## 4. Design sketch (the plan gate decides)

- A userauth's key blob is a login for the signing key when it is **either** that key's blob (today) **or** an OpenSSH
  certificate of a type in a closed set whose **embedded public-key fields equal the signing key's fields**, parsed to
  its exact end (nothing after the last field). Only the key fields are compared. The agent does not check the CA's
  signature, the principals or the validity dates — the server does — and nothing else in the certificate may make a
  request a login.
- The algorithm must fit: the certificate algorithm of the signing key's type, from a closed set compared with
  `Set.has` (CodeQL: no lookup keyed by the requester's text).
- `signsWithSha1` does not change: it reads the signing key's type and the request's flags, so an RSA certificate login
  that would be signed with SHA-1 stays `sha1-login` — never a long window.
- What the prompt shows stays the login text it shows for a plain key. Whether it also names the certificate (key id,
  principals — the requester's text) is a question for the plan gate, not assumed.
- The certificate-body rule (`:390-395`) and its test stay unchanged.
- The classifier is an authorisation boundary: Fable's security judgement at review.

## 5. Build order

1. **Measure** (§3) with a live `sshd` that trusts a throwaway CA (`TrustedUserCAKeys`) and a user certificate signed
   by it, for an Ed25519 and an RSA key. Record the bytes' shape in this plan. The itest is at 760 lines: the
   certificate leg goes into its own script or section file, not into the itest body.
2. **RED.** Rewrite the guarantee at `sshAgentProtocol.test.ts:382-392` — a certificate login for THIS key is a login —
   and watch it fail on `main`.
3. **Parser** in `sshAgentProtocol.ts` (complexity ≤ 4 per function; closed sets).
4. **Manager test:** a login window covers a certificate login of the same key; an RSA certificate login with flags 0
   is not covered.
5. **Live leg** in CI (POSIX), a missing `sshd` fails under `CI=true` as the other live sections do.
6. **Docs:** `research/module_extension.md` (the classifier row, which says a certificate login is unrecognised),
   `research/module_tests.md`, `CHANGELOG.md`.

## 6. Test plan

- Unit, each with a break-it: a certificate for this key is a login (Ed25519, ECDSA, RSA with SHA-2); a certificate
  for ANOTHER key is `unknown`; a certificate with bytes after its last field is `unknown`; a truncated certificate is
  `unknown`; a certificate type that does not match the algorithm is `unknown`; an unknown certificate type is
  `unknown`; the certificate BODY test (`:394-402`) stays green unchanged.
- Manager: covered by a login window; the RSA SHA-1 leg is not covered.
- Live: one certificate login with *Allow longer…* → 1 hour, then a second login with no dialog.

## 7. Growth budget

None. A pure parser change; nothing is stored, cached or spawned beyond the itest's existing one-connection `sshd -d`
runs, which end with their test.

## 8. Definition of Done

- [ ] §3 measured and recorded here, before any parser code.
- [ ] Every RED observed on unfixed code and quoted beside its GREEN in the PR.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run ratchet` green in `src_vs_code`; files ≤ 800 lines.
- [ ] The live certificate leg RUNS in CI (not skipped).
- [ ] Fable's security judgement on the classifier change; coai `review_plan` → `proceed` before code, `review_code`
      after; every finding resolved.
- [ ] Docs per §5 step 6; `plan-lifecycle.mjs` clean; on release, this plan is promoted with its deviations.
