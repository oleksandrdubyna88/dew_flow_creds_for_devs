# PLAN — the extension's security tail

> Status: **items 3, 4 and 5 shipped; item 1 is half shipped; item 2 remains.** Re-checked against
> the code 2026-08-27 ([PLAN_tails.md](PLAN_tails.md), which owns the two tails this re-check found).
>
> **Item 5 (the `chmod 0600` comment) shipped, and went past what was asked.** The item wanted a
> comment corrected. What exists is `lockToOwner` (`materializedKeys.ts:28`) over
> `restrictToOwnerArgv` in `fileAcl.ts`, with `fileAcl.test.ts`: on Windows the inherited NTFS ACL —
> which grants SYSTEM and local Administrators full control — is **broken** and the owner alone is
> granted, best-effort, at all three sites that write secret material (`keyInstaller.ts:90,133,160`).
> The askpass script is deliberately excluded and says why: it holds no secret.
>
> **Item 3 (PIN policy) shipped its refusals.** `pinPolicy.ts` now rejects all-digit under twelve,
> a single repeated character and a normalised blocklist that undoes leetspeak before matching, and
> `estimateBits` is deliberately pessimistic about word-shaped runs. What did **not** ship is the
> advisory half the item called *"the decision needed first"*: `describePinStrength` exists, its own
> doc says it is *"shown live in the input box"*, and it is called by nothing but its own test. That
> is **T1 of [PLAN_tails.md](PLAN_tails.md)**, not a reopening of this item.
>
> **Item 4 (idle auto-lock) is done and this line lagged it** — noticed 2026-08-24 while documenting
> the listing, not by anyone re-reading this plan. `credSshManager.autoLockMinutes` (default 60, `0`
> disables) went further than the fix described below: `lockState.ts` is the pure decision the plan
> asked for (`lockState.test.ts`), and a lock is not merely "forget the cached key" but "refuse the
> stored PIN until a person says otherwise" — the weaker version would have let the next background
> sync silently re-open the vault five minutes later. The plan's own instruction to reset the timer
> on vault access rather than editor activity survived contact: a sync cycle deliberately records
> nothing, because counting it as presence meant the window never elapsed.
>
> **Item 1 is half shipped, and its other half is now contested.** `userVerification` is `'required'`
> at both call sites (`webauthnPrf.ts:286,320`), with the reasoning recorded in `webauthnHint.ts`.
> The RP ID is still the bare `localhost` — and `webauthnHint.ts:17-20` asserts it *"has to be"*,
> which directly contradicts the `.localhost` route this plan proposes below. Neither claim has been
> measured. **T2 of [PLAN_tails.md](PLAN_tails.md)** runs that probe; until it reports, the migration
> below should not be started **or** declined.
>
> Scope: `src_vs_code/src/` — the medium and low findings from the 2026-08-23 review that were not
> fixed in that task. Source:
> [../research/SECURITY_REVIEW_2026-08-23.md](../research/SECURITY_REVIEW_2026-08-23.md), findings 6,
> 7, 8, 10 and 14. The five HIGH findings are already fixed; nothing here is urgent, and item 1 is
> the only one that changes a security property rather than tightening one.

## Why these were separated

Each of these needs either a **migration** (existing registrations or vaults stop working), a
**product decision** (how strict a PIN policy should be before it drives people to write PINs down),
or both. None can be a quiet edit, which is why they are a plan rather than part of the review's
same-day fixes.

---

## 1. WebAuthn RP ID is the bare `localhost` (MEDIUM)

**Symptom.** `webauthnPrf.ts:20` sets `RP_ID = 'localhost'`. WebAuthn scopes a credential by RP ID
*string*, not by origin and port — so any local page whose host is `localhost`, on any port, can ask
for the same credential. The `credentialId` and `prfSalt` needed to do so are stored in **plaintext**
in the vault envelope's `wraps` array (`keyWrap.ts:23-32`), and that envelope lives on shared storage
by design.

A malicious or compromised local page can therefore call:

```js
navigator.credentials.get({ publicKey: {
  rpId: 'localhost',
  allowCredentials: [<leaked id>],
  extensions: { prf: { eval: { first: <leaked prfSalt> } } },
}})
```

and, if the user touches their key in response to what looks like a routine prompt, recover the
identical 32-byte PRF secret this extension uses to unwrap the master key.

**Not** remote and **not** silent: it needs a local page the browser will load plus a physical touch,
and the prompt does disclose the requesting origin. But the hardware second factor is not actually
scoped to this extension, which is what it is sold as.

**Fix.** Bind the loopback listener to a distinguishing host under the `.localhost` TLD —
`creds-for-devs.localhost`, which browsers resolve to loopback per RFC 6761 with no DNS setup — and
use that as the RP ID. Also raise `userVerification` from `'preferred'` to `'required'`
(`webauthnPrf.ts:282,300`) so the key demands a PIN or biometric rather than a bare touch.

**The migration is the work.** Changing the RP ID **invalidates every existing registration**: the
old credential cannot produce the new RP's PRF secret. Existing PIN wraps still open the vault, so
nobody is locked out — but every security key must be re-registered, and a user who registered a key
and then forgot their PIN would be. So:

1. Detect wraps carrying the old RP ID (add an `rpId` field to `KeyWrap`, absent = `localhost`).
2. On unlock, if a legacy WebAuthn wrap is present, unlock through it as today, then prompt:
   *"Re-register this security key to complete a security improvement"*, and add a new wrap beside
   the old one.
3. Remove the legacy wrap only once at least one new-style wrap or a PIN wrap exists.
4. Never remove the last remaining unlock method. That is the one hard invariant.

**Tests.** `keyWrap.test.ts`: a legacy wrap still opens; a re-registered key produces a working new
wrap; removing the legacy wrap is refused when it is the only one left.

---

## 2. Share metadata is unauthenticated (MEDIUM)

**Symptom.** `shareFormat.ts:26-43` seals the `SharePayload` with GCM, but `fromEmail`, `from`,
`entityName`, `entityKind` and `createdAt` sit **beside** the ciphertext, unauthenticated
(`types.ts:149-167`). `extension.ts:1025-1051` shows *"Accept `<entityName>` from `<fromEmail>`"*
**before** anything is decrypted.

Anyone who can write to a shared NAS folder can therefore author a share, encrypt it under a PIN only
they know, and label it as coming from a colleague. And since there is no id-uniqueness or freshness
check beyond the recipient's own dedup (`folderTransport.ts:118-119`), a previously declined share
can be silently re-added.

**This does not affect the server transport**, where `fromEmail` is stamped from a verified token —
which remains the project's answer for teams.

**Fix.** Bind the metadata as GCM **additional authenticated data**:

```ts
cipher.setAAD(Buffer.from(JSON.stringify({ fromEmail, entityName, entityKind, createdAt })));
```

Tampering with the label then breaks decryption instead of silently changing what the user is shown.
It needs no shared secret between sender and recipient, so it does not fight the "anyone may append"
design the folder transport depends on.

**Compatibility.** Old shares carry no AAD. Bump the share `format` version, try AAD-verified open
first and fall back to the legacy path for the old version, and mark legacy items in the UI as
*"sender not verified"* — which is the truth for every share ever created before this change.

**Tests.** `shareFormat.test.ts`: a sealed share opens; a share whose `fromEmail` was edited after
sealing **fails to open**; a legacy share still opens and is flagged unverified.

---

## 3. ~~PIN policy is length-only~~ (MEDIUM) — **SHIPPED, bar the advisory (T1)**

**Symptom.** `pinPolicy.ts:7` requires 8 characters and nothing else. The file's own comment says
this PIN is *"the sole barrier protecting vault ciphertext that deliberately lives in shared/offline
locations"* — and it accepts `password` and `12345678`.

scrypt at `N=2^17` costs an attacker ~100 ms per guess, which is real but does not save an
eight-character all-digit PIN against someone who already holds the ciphertext.

**Fix.** Estimate entropy rather than counting characters. Reject digit-only under 12 characters,
reject the obvious top-N list, and show the estimated offline crack time live in the input box —
`pinPolicy.ts:15` already explains *why* the PIN matters, so the box is the right place.

**The decision needed first:** a floor high enough to matter is high enough that people write PINs
down. Recommendation: make the *estimate* visible and advisory above the current floor, and raise the
hard floor only for the demonstrably weak cases (digit-only, single repeated character, top-1000).

Do not add `zxcvbn`. It is 800 KB for a job a small character-class heuristic does adequately here,
and this extension currently has **zero runtime dependencies** — a property worth more than the
last few percent of estimator accuracy.

**Tests.** `pinPolicy.test.ts`: `12345678` rejected; `hunter2!` accepted; a 12-digit PIN accepted;
the existing 8-character floor still holds for mixed-class input.

---

## 4. ~~No idle auto-lock~~ (LOW) — **SHIPPED**

**Symptom.** `vaultKeys.ts:43` caches the master key for the window's lifetime. The only eviction is
the manual `CredsForDevs: Lock Vaults` command (`extension.ts:766-771`). A laptop left open with VS Code
running holds an unwrapped master key in the extension host's heap indefinitely.

JS offers no reliable secure-wipe, so this is a soft limit — but the exposure *window* is entirely
within our control and is currently unbounded.

**Fix.** A configurable idle timer (`credSshManager.autoLockMinutes`, default 60, `0` disables)
calling the same `clearCache()` path the manual command uses. Reset the timer on any vault access,
not on arbitrary editor activity.

**Tests.** Extract the timer decision into a pure function (`shouldLock(lastAccess, now, timeout)`)
and unit-test it; the wiring itself is thin.

---

## 5. ~~`chmod 0600` is a no-op on Windows~~ (LOW) — **SHIPPED as a real ACL, not a comment**

**Symptom.** `keyInstaller.ts:68-73,91-102` sets POSIX mode bits and the comments read as though a
guarantee is being enforced. On NTFS they do not translate; the actual protection is that the file
sits under the user's own profile directory.

Not exploitable — same-user isolation still holds via default NTFS ACLs — but a future reviewer will
read the comment and assume parity that is not there.

**Fix.** Correct the comment to say what is true: *best-effort POSIX permissions; on Windows,
protection comes from the profile-scoped storage path*. No behaviour change, and therefore no test —
the review rule's "no observable behaviour to assert" case.

---

## Build order

1. **5** — a comment, zero risk, do it with anything else.
2. **4** — self-contained, no migration.
3. **3** — needs the product decision above, then one file.
4. **2** — needs a format version and a fallback path.
5. **1** — the largest, because of the re-registration migration. Do it last and alone.

## Definition of Done

- [ ] Each item above either shipped with its tests, or explicitly deferred with a reason recorded here.
- [ ] No migration leaves a user unable to open a vault they could open before — the "never remove
      the last unlock method" invariant holds in every path.
- [ ] `npm test` green; new tests named after the guarantee, not the bug number.
- [ ] `../research/SECURITY_REVIEW_2026-08-23.md`'s open-findings table updated as items close.
- [ ] This plan promoted to `research/` when the list is empty, with deviations recorded.
