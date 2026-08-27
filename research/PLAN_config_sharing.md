# PLAN — a shared config arrives with its contents

> Status: **IMPLEMENTED, 2026-08-27.** Shipped the same day it was extracted, because the owner
> tried sharing a config and found the JSON did not survive.
>
> Extracted from [PLAN_config_entities.md](PLAN_config_entities.md), which shipped everything else.

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

## What shipped differently

**The build order held, and it mattered.** The plan said the body travels FIRST and `isShareable`
learns about the kind LAST, and both landed in one change — but written in that order, so at no
point did a shareable row exist without a travelling body.

**A hole was found on the way that the plan had not predicted.** `setPassword(undefined)` means
"keep whatever is stored", so an entity converted from a credential into a config KEPT its
password: invisible, because the form hides the slot, and uneditable. And `isShareable` returned
true for anything with a stored password — so such a config was *already* shareable, before any of
this, and sharing it would have delivered the password with the document left behind. Exactly the
half-delivery this plan existed to avoid, reached by a route nobody would look down.

Fixed by the rule TOTP already follows: `keepsPassword(kind)` in `entityKind.ts`, applied on write,
so switching an entity to a config scrubs a stored password as switching away from a login scrubs a
seed. And `isShareable` now names the kind explicitly rather than letting it follow from having a
password, so the two can never disagree again.

**Found and NOT fixed, because it belongs to another feature:** `buildSharePayload` never reads the
TOTP seed, while the accept path writes `payload.secrets.totp`. So sharing an existing entity loses
its second factor, while `hasTotp` travels in the metadata and claims otherwise — the same
half-delivery shape, in TOTP. Reported to the owner rather than changed here.
