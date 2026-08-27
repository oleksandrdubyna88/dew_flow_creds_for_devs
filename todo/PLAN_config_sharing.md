# PLAN — a shared config arrives with its contents

> Status: **plan only, nothing implemented yet.** Scope: the share payload, the accept path, and
> the two tests that would have caught the half-share.
>
> Extracted from [PLAN_config_entities.md](../research/PLAN_config_entities.md), which shipped
> everything else on 2026-08-27.

## The symptom

Sharing a config entity today delivers its NAME, its format and its file name — and an empty body.
The colleague receives an entry that knows what it is called and holds nothing.

That is worse than not offering it. A share that arrives incomplete is discovered on the far side,
by somebody who has no way to tell whether the sender forgot to fill it in or the product dropped
it; and the sender is told nothing at all. It is the failure mode the feature exists to end,
reproduced by the feature.

## Why it was left out rather than half-built

`applySecrets` writes the body, and adding `config` to the share payload there is one line. The far
end is not one line: the payload has its own sealed shape (`ShareItem.Data`, client-sealed), its own
accept path, and its own import that writes the accepted entry with a fresh local id. A body added
to the sending end without the receiving end delivers exactly the empty entry described above.

So the line was deliberately not written, and the reason is recorded where somebody would otherwise
add it — `extension.ts`, beside the share payload:

> NOT the config body, yet. […] a body added here without the far end would deliver an entry that
> arrives EMPTY — a silent partial share, which is worse than a share that does not offer it.

Until this ships, **"Write config file here…"** is the way across: the sender writes the file and
hands it over by whatever means they already trust.

## Build order

1. **The payload.** `config` joins the sealed secrets beside `notes` and `totp`. Sealing is
   unchanged — it is opaque bytes to the server either way, which is the property that must not
   move.
2. **The accept path.** `shareInbox` writes the body to the recipient's SecretStorage under the
   fresh local id, exactly as it does for the other secrets.
3. **The metadata that travels with it.** `configFormat` and `configFileName` already ride in
   `EntityMetadata`; confirm they survive the round trip rather than assuming it.
4. **`configKeyHash` must NOT travel.** A key is minted by one window for one vault; a hash that
   arrived with a share would name a key the recipient cannot have and can never revoke. The
   recipient enables code access themselves, and gets their own key.
5. **The sender is told what is being handed over.** A config body is the whole secret, not a field
   of one — the consent text for sharing one should say so.

## Test plan

- A shared config arrives with its body intact — the test that would have caught the half-share.
- A shared config does NOT arrive with the sender's `configKeyHash`.
- A config shared and accepted twice does not collide: the fresh local id is what keeps two copies
  apart, and the body follows the id.
- The server still sees only ciphertext. Asserted, not assumed — it is the product's central claim.

## Definition of Done

- [ ] A shared config arrives with its contents, and a test proves it.
- [ ] `configKeyHash` does not travel, and a test proves that.
- [ ] The comment in `extension.ts` explaining why the body was left out is removed, because it
      no longer describes the code.
- [ ] `research/module_extension.md` records what a shared config carries.
