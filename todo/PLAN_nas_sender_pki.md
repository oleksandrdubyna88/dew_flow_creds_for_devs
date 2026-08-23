# PLAN — NAS sender authenticity: Ed25519 signatures + key pinning + fingerprint check

> Status: **plan only, nothing implemented — OPTIONAL / backlog.** Build this
> **only** for organizations that are strictly forbidden from running the
> Cred Vault Server and are allowed to use a shared NAS exclusively. For every
> other deployment the decision is settled: **teams use the server transport**
> (see below), and no code here is needed.
>
> Scope: the **folder transport only** — `src/folderTransport.ts`,
> `src/shareFormat.ts`, `src/cryptoUtils.ts` (envelope), `src/types.ts`
> (`ShareItem`), plus a small key-management + fingerprint UI surface.
>
> Related: [research/PLAN_audit_followups.md](../research/PLAN_audit_followups.md)
> §3 (the accepted residual this would harden), and the "Which transport for
> what" boundary in [README.md](../README.md).

## The architectural decision this plan lives under (settled 2026-08-21)

- **NAS folder transport → personal / solo sync.** A share's `fromEmail` is a
  self-asserted claim written into the file ([shareFormat.ts:36](../src/shareFormat.ts#L36));
  the envelope MAC deliberately excludes the cross-user `shares` array
  ([cryptoUtils.ts:239](../src/cryptoUtils.ts#L239)). The folder transport
  therefore provides **no cryptographic sender authenticity** for team sharing.
- **Server transport → the single recommended standard for teams.** The server
  stamps a share's sender from the verified OAuth token, so `fromEmail` is
  unforgeable — no key distribution problem, strictly stronger than anything
  below.

This plan is the *fallback* for the narrow NAS-only-mandated case, not a
competitor to the server.

## The symptom (why this exists)

On a shared NAS, anyone with write access to the folder can append a share to a
victim's `vault_<email>.enc` envelope with **any** `fromEmail`, and the
recipient's UI shows it as genuinely from that person
([treeDataProvider.ts:139](../src/treeDataProvider.ts#L139),
[extension.ts:1032](../src/extension.ts#L1032)). There is no `shareId` and no
signature on a `ShareItem` today ([types.ts:149](../src/types.ts#L149)).

## The honest security ceiling: TOFU, not "fully eliminated"

An Ed25519 signature proves "signed by the holder of private key K". The
recipient still needs an authentic **email → public-key** binding. If public
keys are published on the *same* NAS, the same attacker who can forge `fromEmail`
can replace a peer's published key with their own and sign with the matching
private key. So on a medium the attacker can also write, this reduces to
**Trust-On-First-Use + key continuity**:

- **Strong** against a *later* tamperer — pin a peer's key on first contact and
  reject/flag any subsequent key change.
- **Weak** against a *first-contact* MITM already on the NAS before the first
  exchange — only an out-of-band **fingerprint comparison** closes that.

Ship it framed as "forgery-resistant with key pinning + fingerprint check",
never as "spoofing fully eliminated".

## Design

### 1. Per-profile signing keypair
- Generate an **Ed25519** keypair with Node's `crypto`
  (`generateKeyPairSync('ed25519')`) — **zero new dependency**, matching the
  codebase's zero-dep crypto ethos (see [cryptoUtils.ts](../src/cryptoUtils.ts)).
- Store the **private key** in SecretStorage and wrap it into the account's
  vault payload so it syncs across the owner's own machines (reuse the existing
  wrap/sync path; treat it like any other per-account secret).
- The **public key** is published so peers can discover it (see §3).

### 2. Sign a transcript, not just the ciphertext
Signing the ciphertext alone is replayable and unbound. Add a `signature` and a
`shareId` to `ShareItem` ([types.ts:149](../src/types.ts#L149)) and sign a
canonical transcript binding, at minimum:

```
sign(Ed25519_priv, canonical({
  shareId, fromEmail, toEmail, createdAt,
  senderPubKey,            // so the pinned key is inside the signed data
  kdfN, kdfR, kdfP,        // the share's own KDF params
  ciphertext + gcmTag,     // the encrypted secret payload
}))
```

- `toEmail` in the transcript stops a captured share being re-targeted.
- `shareId` + recipient-side **seen-id tracking** stops replay / re-append.
- Verify at accept time ([extension.ts:1032](../src/extension.ts#L1032)); a bad
  or missing signature (for a peer whose key is pinned) blocks accept and warns.

### 3. Key pinning (TOFU) + fingerprint UI
- On first receipt of a share from `alice@corp.com`, **pin** her `senderPubKey`
  (persistent, per-account map `email → pubKey`). Subsequent shares must match
  the pinned key; a mismatch is a hard, loud warning (possible impersonation),
  never a silent accept.
- Expose a **fingerprint** (e.g. SHA-256 of the pubkey, grouped hex / emoji) in
  the UI for both parties to compare out-of-band (call, in person). This is the
  only thing that closes the first-contact MITM gap — it is a required part of
  the feature, not an afterthought.
- Provide an explicit "re-pin / trust new key" action for legitimate key
  rotation, gated behind a confirmation that names the fingerprint.

### 4. Backward compatibility
- Unsigned legacy shares still parse; show them as **unverified** (a distinct,
  lower-trust badge), never as verified. Do not silently drop them.
- A peer with no published key yet → shares are unverified until a key is seen
  and pinned.

## Build order
1. Keypair generation + SecretStorage/vault-wrap storage + public-key
   publication and discovery (no UI trust yet).
2. `ShareItem.shareId` + `ShareItem.signature`; sign on **Share with… /
   Create for…**; verify on **Accept**; replay-id tracking.
3. Pinning store + mismatch warnings + the unverified/verified/mismatch badges.
4. Fingerprint display + compare flow + explicit re-pin action.
5. Docs: flip the README boundary note from "backlog" to "available (NAS-only,
   opt-in)"; record deviations here and promote this plan to `research/`.

## Test plan (all vscode-free where possible, per the repo's node:test setup)
- **Pure crypto module** (new, no `vscode`): sign→verify round-trip; a tampered
  transcript fails; a captured share re-targeted to another `toEmail` fails; a
  replayed `shareId` is rejected; a wrong-key signature fails. (Mirror the
  structure of [src/test/shareFormat.test.ts](../src/test/shareFormat.test.ts).)
- Pinning decision as a **pure function** (first-seen pins; match passes;
  mismatch flags; legacy/no-signature → unverified) — unit-tested like
  [src/test/defaultFolders.test.ts](../src/test/defaultFolders.test.ts).
- Fingerprint formatting is deterministic and stable for a given key.
- Extend `scripts/server-transport-itest.cjs`? No — this is folder-only; add a
  folder-transport signature integration check instead if one is warranted.

## Definition of Done
- [ ] Only built if the NAS-only-mandated case is confirmed; otherwise this plan stays parked and teams use the server.
- [ ] `ShareItem` carries `shareId` + `signature`; the transcript binds sender pubkey, `toEmail`, `shareId`, `createdAt`, KDF params and ciphertext.
- [ ] Sender keys are pinned on first contact; mismatches warn loudly; a fingerprint compare + explicit re-pin exist.
- [ ] Legacy/unsigned shares render as **unverified**, never verified; nothing is silently dropped.
- [ ] Pure crypto + pinning logic unit-tested (`npm test` green); no new npm dependency.
- [ ] Docs updated and the feature framed as TOFU-based, server-still-preferred; this plan promoted to `research/` with deviations recorded.
