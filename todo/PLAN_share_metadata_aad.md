# PLAN — bind a share's label to its ciphertext

> Status: **plan only, nothing implemented yet.** Scope: `src_vs_code/src/shareFormat.ts` (seal /
> open), the share `format` version, the accept prompt in `extension.ts`, and the folder transport's
> inbox. Extracted from [../research/PLAN_extension_security_tail.md](../research/PLAN_extension_security_tail.md)
> item 2 when that plan was promoted on 2026-08-28 — the one finding of the 2026-08-23 security
> review ([../research/SECURITY_REVIEW_2026-08-23.md](../research/SECURITY_REVIEW_2026-08-23.md),
> finding 7) still open.
>
> Related docs: [../research/module_extension.md](../research/module_extension.md),
> [../research/PLAN_sharing.md](../research/PLAN_sharing.md).

## Symptom

`sealShare` (`src_vs_code/src/shareFormat.ts:51`) seals the `SharePayload` (`types.ts:444`) with
AES-GCM, but the `ShareItem` fields a recipient is shown — `fromEmail`, `entityName`, `entityKind`,
`createdAt` (`types.ts:410-419`) — travel **beside** the ciphertext, unauthenticated. The accept
command (`extension.ts:4592`, `credSshManager.acceptShare`) shows *"Accept `<entityName>` from
`<fromEmail>`"* **before** anything is decrypted.

Anyone who can write to a shared NAS folder can therefore author a share, encrypt it under a PIN only
they know, and label it as coming from a colleague. And with no id-uniqueness or freshness check
beyond the recipient's own dedup in the folder transport, a previously declined share can be
silently re-added.

**This does not affect the server transport**, where `fromEmail` is stamped from a verified token —
which remains the project's answer for teams.

## Fix

Bind the label as GCM **additional authenticated data**:

```ts
cipher.setAAD(Buffer.from(JSON.stringify({ fromEmail, entityName, entityKind, createdAt })));
```

Tampering with the label then breaks decryption instead of silently changing what the person is
shown. It needs no shared secret between sender and recipient, so it does not fight the "anyone may
append" design the folder transport depends on.

**Compatibility.** Old shares carry no AAD. Bump the share `format` version (`shareFormat.ts:111`
is where the version is read), try the AAD-verified open first and fall back to the legacy path for
the old version, and mark legacy items in the UI as *"sender not verified"* — which is the truth for
every share ever created before this change.

## Build order

1. `shareFormat.ts`: `sealShare` sets the AAD and writes the new `format`; `openShare` verifies
   under the new format and falls back under the old, returning which path opened it.
2. The accept prompt and the inbox rows show *sender not verified* for a legacy share.
3. The folder transport's inbox dedup: locate it, and add the freshness check the review named.

## Test plan

`shareFormat.test.ts`: a sealed share opens; a share whose `fromEmail` was edited after sealing
**fails to open**; a legacy share still opens and is reported unverified. One accept-prompt test
that the unverified mark is shown for a legacy item and absent for a new one.

## Definition of Done

- [ ] `sealShare` binds `fromEmail`, `entityName`, `entityKind`, `createdAt` as AAD under a bumped `format`.
- [ ] `openShare` refuses a share whose label was edited, and opens a legacy share with an *unverified* verdict.
- [ ] The accept prompt and the inbox say *sender not verified* on legacy shares.
- [ ] `shareFormat.test.ts` covers the three cases above.
- [ ] `research/module_extension.md` describes the share format's AAD and the legacy path.
