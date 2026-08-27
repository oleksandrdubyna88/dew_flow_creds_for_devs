# PLAN — a shared config arrives with its contents

> Status: **plan only, nothing implemented yet.** Scope: the share payload, the accept path, and
> the one line in `isShareable` that must go LAST.
>
> Extracted from [PLAN_config_entities.md](../research/PLAN_config_entities.md), which shipped
> everything else on 2026-08-27.

## The symptom

**A config cannot be shared at all.** Right-click one and there is no *Share* item — not a broken
share, not a half-delivered one. Nothing.

That was not a decision. `isShareable` in `treeRowText.ts:126` asks whether an entry has a host, or
is a database, a startable VPN, a terminal command or a script, or has a stored password. A config
is none of those and has no password: its BODY is the secret, and the password slot is hidden on its
form. So the `:shareable` token is never added and the menu never appears.

Verified rather than reasoned: `entityContextValue` gives a config row `entity:config:codeoff`,
while a script gets `entity:script:shareable` and a credential `entity:pwd:shareable`.

## Why this is the SECOND thing to fix, not the first

Making the row shareable is one line in `isShareable`. Doing only that is the actual danger: the
share payload carries `password`, `privateKey`, `vpnConfig`, `dbConnection`, `notes` and `totp` —
**not** `config`. A config that became shareable without its body would deliver an entry that knows
its name, its format and its file name and holds nothing, discovered on the far side by somebody
with no way to tell whether the sender forgot to fill it in or the product dropped it.

So the order matters, and it is the opposite of the obvious one: the body travels first, the row
becomes shareable second. An earlier note in `extension.ts` recorded the payload half of this and is
what stopped a one-line change from shipping the empty entry.

Until then, **"Write config file here…"** is the way across: the sender writes the file and hands it
over by whatever means they already trust.

## Build order

1. **The payload.** `config` joins the sealed secrets beside `notes` and `totp`. Sealing is
   unchanged — it is opaque bytes to the server either way, which is the property that must not
   move. FIRST, so that step 6 cannot ship an empty entry.
2. **The accept path.** `shareInbox` writes the body to the recipient's SecretStorage under the
   fresh local id, exactly as it does for the other secrets.
3. **The metadata that travels with it.** `configFormat` and `configFileName` already ride in
   `EntityMetadata`; confirm they survive the round trip rather than assuming it.
4. **`configKeyHash` must NOT travel.** A key is minted by one window for one vault; a hash that
   arrived with a share would name a key the recipient cannot have and can never revoke. The
   recipient enables code access themselves, and gets their own key.
5. **The sender is told what is being handed over.** A config body is the whole secret, not a field
   of one — the consent text for sharing one should say so.
6. **`isShareable` learns about the kind.** LAST. One line, and it is the line that must not go
   first: a shareable row without a travelling body is the empty delivery this plan exists to
   avoid.

## Test plan

- A shared config arrives with its body intact — the test that would have caught the half-share.
- A shared config does NOT arrive with the sender's `configKeyHash`.
- A config shared and accepted twice does not collide: the fresh local id is what keeps two copies
  apart, and the body follows the id.
- The server still sees only ciphertext. Asserted, not assumed — it is the product's central claim.

## Definition of Done

- [ ] A config row offers *Share* at all — `entityContextValue` gives it `:shareable`.
- [ ] A shared config arrives with its contents, and a test proves it.
- [ ] `configKeyHash` does not travel, and a test proves that.
- [ ] The comment in `extension.ts` explaining why the body was left out is removed, because it
      no longer describes the code.
- [ ] `research/module_extension.md` records what a shared config carries.
