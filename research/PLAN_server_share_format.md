# PLAN — a share sealed for the vault server survives the trip through it

> Status: **IMPLEMENTED, 2026-08-31** (extension 0.88.0, server contract 2). A share takes its
> binding form from the transport: `format: 2` over a folder, a new `format: 3` over a vault server
> binding only `entityName` + `entityKind`, and unbound against a server below contract 2. The
> server carries `format` through `/api/shares`; the server form is honoured only for an item that
> came off a server, and a server item is never subject to the legacy refusal.
>
> **Deviation 1 — the fix found a second, worse defect on the way, and the integration test is what
> caught it.** Adding a nullable `Format` made the server write `"format": null` for a client that
> sends none — and `isShareItem` accepted the field only as a number or as ABSENT, so it dropped the
> whole item. Every released extension is such a client, so deploying contract 2 would have emptied
> their inboxes rather than merely failing to open them: a silent regression strictly worse than the
> one being fixed. The server now omits the property (`JsonIgnoreCondition.WhenWritingNull`) so the
> wire shape for an old client is byte-identical to contract 1, and the guard reads a null as absent.
> Nothing predicted this; `scripts/server-transport-itest.cjs` failed at *"recipient sees exactly one
> share"* against a live server and named it.
>
> **Deviation 2 — one line of the plan's step 6 was a defect, not a change.** The tree's *label not
> bound* marker had never rendered on any row: it was assigned and then overwritten by the same
> `description` two lines below. Folded into the surviving description rather than left as it was.
>
> **Deviation 3 — the plan's own step 1 listed `shareLabelAad(item)` as taking a form; it also had to
> gain `ShareLabel` as a named type**, because `openShare` passes a whole `ShareItem` where the seal
> path passes a freshly built label, and the two had only agreed by inference.
>
> **Deviation 4 — the plan named the wrong source of truth for "did a server stamp this".** It said
> to reuse `senderIsVerified(location)`, the existing predicate behind the *unverified sender* row.
> That predicate is `isServerLocation`, a test for `http(s)://` — and a git remote is routinely
> `https://host/team/vault.git`, which the factory routes to `GitTransport` while the predicate calls
> it a server. Reusing it would have honoured `format: 3` and skipped the legacy refusal for a git
> share, i.e. handed the one transport anybody with push access can write the trust the whole form
> depends on. `SharingManager.serverStamped` asks the FACTORY instead, which resolves git first.
> `gitRemote.test.ts` pins the trap. **Still open, not fixed here:** `senderIsVerified` has the same
> flaw in its original job — the tree's *unverified sender* row and the accept dialog call an https
> git remote verified, and say "stamped by the vault server from a verified sign-in" about a file
> anyone on that repository can write. That is a pre-existing wording defect on a different surface;
> it is named rather than changed uninvited.
>
> Verified end to end against a running Cred Vault Server, not only in unit tests: `npm run
> itest:server` drives the real transport over real HTTP through `POST`/`GET /api/shares`. Both new
> server tests were watched failing first with the fix temporarily reverted.
>
> Scope: `src_vs_code/src/shareFormat.ts`, `serverTransport.ts`, `shareInbox.ts`, `sharingManager.ts`,
> `contractVersion.ts`, `treeDataProvider.ts`, `types.ts`; server-side `Models.cs`, `Program.cs`,
> `ContractVersion.cs`.
>
> Related docs: [PLAN_share_metadata_aad.md](PLAN_share_metadata_aad.md) (whose compatibility claim
> this plan corrects), [module_server.md](module_server.md), [module_extension.md](module_extension.md).

## Symptom

A recipient on 0.87.0 is shown

> This share was sent by an extension older than 0.82 and can no longer be opened — ask the sender
> to update CredsForDevs and share again.

for a share sent **minutes earlier by a sender also on 0.87.0**, over the vault server. The sentence
is false in every part: the sender is current, updating changes nothing, and re-sharing produces the
same refusal.

## Cause — three places, one broken invariant

0.82.1 made `sealShare` bind the label as GCM additional authenticated data and stamp `format: 2`
(`src_vs_code/src/shareFormat.ts:104`). The AAD is
`{fromEmail, entityName, entityKind, createdAt}` (`shareFormat.ts:67`). **The AAD must be
recomputable byte-for-byte by the recipient**, and on the server transport it is not:

1. `ServerTransport.appendShares` builds the POST body field by field and `format` is not among
   them — `src_vs_code/src/serverTransport.ts:293`.
2. The server has no such field to carry: neither `ShareRequest` nor `ShareItem` declares one —
   `src_minimalapi_server/src/Models.cs:13` and `:33`.
3. The server **rewrites two of the four AAD fields**: `CreatedAt = DateTimeOffset.UtcNow` and
   `FromEmail` from the verified token, lower-cased — `src_minimalapi_server/src/Program.cs:1184`,
   `TokenIdentity.cs:33`.

So the item arrives with `format` absent. `shareLabelBound()` is false, and from
`LEGACY_SHARES_UNTIL = '0.85.0'` `refuseStaleLegacy` prints the sentence above
(`shareFormat.ts:161`).

**Sharing over the server has been broken since 0.82.1 (2026-08-28), not since 0.85.0.** Before the
cutoff the same item failed one line later, in GCM, as *"Decryption failed: wrong master
PIN/password or the data was modified."* — a wrong-PIN message for a right PIN. 0.85.0 only changed
the wording of a failure that was already total.

Reproduced with both sides' code, no server needed (seal as 0.87 seals, rebuild the item as
`MapPost` rebuilds it):

```
sealed by 0.87 -> format = 2 , bound = true
as delivered   -> format = undefined , bound = false
recipient on 0.84.9: Decryption failed: wrong master PIN/password or the data was modified.
recipient on 0.85.0: This share was sent by an extension older than 0.82 …
recipient on 0.87.0: This share was sent by an extension older than 0.82 …
```

The folder and git transports write the `ShareItem` verbatim (`folderTransport.ts:107`,
`gitTransport.ts:295`) and are unaffected.

**Why no test caught it.** The only check that drives a real round trip —
`scripts/server-transport-itest.cjs:86` — needs a running server, is not in CI, and is run by hand.
It has been red since 0.82.1 and nobody looked.

**What the earlier plan got wrong.** `PLAN_share_metadata_aad.md` says *"This does not affect the
server transport"*. That was true of the THREAT and false of the CODE: the server transport needed
no AAD, and was given one anyway, sealed over fields it destroys.

## Fix — a second binding form, carried by the server

The server stamps `fromEmail` and `createdAt` itself, from a verified token. Those two fields are
therefore already authenticated, by something stronger than a GCM tag the sender computes — and
repo rule 2 forbids accepting them from the body to make the AAD reconstructible. So the server
form binds only what the sender controls **and** the server copies verbatim:

| form | `format` | AAD | transport |
|---|---|---|---|
| bound | `2` | `{fromEmail, entityName, entityKind, createdAt}` | folder, git |
| server | `3` | `{entityName, entityKind}` | vault server |
| legacy | absent | none | pre-0.82 senders, and a server older than contract 2 |

`format: 3` is accepted **only from a vault server**. A folder item claiming it would re-open
security-review finding 7 — the AAD would not cover `fromEmail`, which is exactly the field a folder
writer can forge. The recipient already has the pure predicate for this: `senderIsVerified(location)`
(`src_vs_code/src/shareSender.ts:31`).

A **legacy item from a vault server is not refused**, whatever the recipient's version. The refusal
exists to stop an unverifiable folder label; a server label is token-stamped and never was one. This
is also what lets an updated extension talk to a server that has not been deployed yet.

Which form to seal in is the transport's business, decided from the contract handshake that already
exists (`X-Creds-Contract`, `contractVersion.ts:22`, cached on every response as
`ServerTransport.serverContract`, `serverTransport.ts:97`): contract ≥ 2 → `server`, otherwise
`legacy`.

### The rollout matrix

| sender | server | result |
|---|---|---|
| updated | updated | `format: 3`, opens, label bound |
| updated | old | `legacy`, opens, label unbound (as before 0.82) |
| **0.82.1–0.87** | either | still broken — the sender seals over fields the server destroys |

The last row cannot be fixed from the recipient's side: the AAD bytes include a `createdAt` that no
longer exists anywhere. Shares already sitting in inboxes must be re-sent by an updated sender. The
owner chose this over a `createdAt` search window (2026-08-31).

## Build order

1. `shareFormat.ts` — `ShareForm` (`'bound' | 'server' | 'legacy'`), `SHARE_FORMAT_SERVER = 3`,
   `sealShare` takes a `SealOptions` object, `shareLabelAad` takes the form, `openShare` /
   `resolveShares` take whether the item is server-stamped, `refuseStaleLegacy` learns the two new
   rules, `shareLabelTrusted` for the UI.
2. Server — `Format` on `ShareRequest` and `ShareItem`, copied in `MapPost`;
   `ContractVersion.Current = 2`.
3. `contractVersion.ts` — `CLIENT_CONTRACT_VERSION = 2`, `SHARE_FORMAT_CONTRACT = 2`.
4. `serverTransport.ts` — send `format` in the POST body; `carriesShareFormat`.
5. `sharingManager.ts` — `shareFormFor(sender)`; `shareInbox.deliverBatch` seals in that form.
6. `shareInbox.ts` / `treeDataProvider.ts` — open with the server-stamped flag; stop calling a
   server share "label not bound".
7. `scripts/server-transport-itest.cjs` — the check that would have caught this.
8. Docs: `research/module_server.md` (the POST body), `research/module_extension.md` (the forms),
   CHANGELOG, extension 0.88.0.

## Test plan

TypeScript (`src/test/shareFormat.test.ts`), each red before step 1:

- a share sealed in the `server` form and passed through what `MapPost` actually does — identity and
  time restamped, only the named fields carried — **opens**;
- the same item delivered as the server carries it **today** (`format` dropped) is the failure the
  user reported, and names it;
- a folder item claiming `format: 3` is **refused**;
- a legacy item from a vault server opens on 0.87.0; the same item from a folder is still refused.

C# (`src_minimalapi_server/tests/SharingTests.cs`): a POST carrying `format` returns it on the
recipient's `GET /api/shares`; a POST without one returns an item with no `format`.

Integration (`scripts/server-transport-itest.cjs`): the existing round trip, now sealing in the
server form and opening as the inbox does.

## Definition of Done

- [x] A share sent through the vault server by an updated sender opens on an updated recipient.
- [x] An updated extension against an un-updated server still shares, unbound, with no refusal.
- [x] A folder item claiming the server form is refused.
- [x] `npm test` (2585 pass, 0 fail) and `CredVaultServer.Tests.exe` (162/162) green; `npm run
      itest:server` passes against a real server, 18/18 checks.
- [x] `research/module_server.md` documents `format` on both directions of `/api/shares`.
- [x] CHANGELOG entry says plainly that server sharing was broken from 0.82.1 to 0.87.
- [x] An old client's inbox is unaffected by contract 2 — the `null` regression above, closed with a
      test on each side.

## The tail

Nothing is owed for the fix itself. Two things it exposed and did not change:

1. **`scripts/server-transport-itest.cjs` is in no CI.** It is the only check that drives a real
   round trip, it had been red since 0.82.1, and it found the second defect the moment it was run.
   Six days of total breakage is what a hand-run integration test costs. It needs a server to run
   against, which is why it was left out — and why leaving it out was the expensive decision.
2. **Shares posted between 0.82.1 and 0.87 stay unopenable.** Their AAD covers a `createdAt` that
   exists nowhere; a search window over the server's stamp was considered and declined by the owner
   (2026-08-31) in favour of asking senders to share again.
