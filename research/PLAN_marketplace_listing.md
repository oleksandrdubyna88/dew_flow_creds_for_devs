# PLAN — make the Marketplace listing worth finding

> Status: **IMPLEMENTED, 2026-08-24** — items 2 and 3, the listing text and metadata. Item 1, the
> screenshots, is a human task with its own file,
> [../todo/ЗАДАЧА_скриншоты_для_маркетплейса.md](../todo/ЗАДАЧА_скриншоты_для_маркетплейса.md), and the
> plan's own verdict on it stands: it is the item that matters. Scope: `src_vs_code/README.md`,
> `media/`, and the `package.json` listing metadata. Everything *mechanically* required to publish
> is already done — see
> [../research/PLAN_monorepo_consolidation.md](PLAN_monorepo_consolidation.md) §6 and
> `src_vs_code/docs/PUBLISHING.md`. This plan is about the listing being persuasive, not valid.
>
> **Done:** the README's first screen is now *Everything it does* — a table of every feature, before
> any rationale — and a second problem surfaced while writing it that this plan had not predicted:
> the listing was not merely badly *ordered*, it was **incomplete**. Terminal-command entries,
> environment-variable bindings, dated snapshots, VPN start/stop, attachments, auto-lock and
> `Clone…` had shipped without ever reaching it; the settings table held 6 of 13 settings and the
> command list 29 of 47. All of it is documented now. `qna` points at GitHub issues; `keywords`
> gained the features people search for.
>
> **Deliberately not done:** `categories` stays `["Other"]`. The plan floated `"Snippets"` as a
> second entry; it is wrong, and so is `"AI"` for a credential manager with one agent-facing
> feature. This plan's own rule — *pick a category a human actually browses, or leave it at "Other"
> rather than mis-filing* — decides it. No `badges` either: a CI badge on a listing whose reader
> cannot act on a red build is decoration.
>
> **Still owed:** the four screenshots and the GIF (§1), all with fabricated data, and the
> verification pass in a clean profile (§4). Neither can be produced without a person driving the
> UI, which is why they are still here.

## The problem

The extension can be published today: MIT licence, a 128×128 PNG icon, `repository`, `categories`,
`keywords`, a `CHANGELOG.md`, and `vsce package` clean with no warnings.

What it does not have is a listing anyone would install from.

1. **No screenshots and no GIF.** The Marketplace page is the README, rendered — and this README is
   24 KB of prose with not one image. For a UI extension that is the single largest gap: nobody
   installs a credential manager they have not seen.
2. **The README opens for the wrong reader.** It is written for someone who already found the
   repository and wants the design rationale. A Marketplace visitor has about two sentences of
   patience and one question: *what does this do for me?*
3. **`categories` is `["Other"]`.** Accurate and useless. `"SCM Providers"` is wrong, but
   `"Other"` alone means the extension appears in no browsable category anyone visits.
4. **No `badges`, no `sponsor`, no `qna` setting.** Minor, but `qna` defaults to the Marketplace's
   own Q&A, which nobody watches — pointing it at GitHub issues avoids a channel that silently
   collects unanswered questions.

## The work

### 1. Screenshots (the item that matters)

Four images, `media/docs/`, referenced from the README with absolute raw-GitHub URLs — the
Marketplace does **not** render relative image paths, and this is the most common way a listing ships
with broken images:

| Image | Shows |
|---|---|
| `tree.png` | The sidebar with a realistic tree: two accounts, folders, an SSH host, a key, a DB |
| `connect.gif` | Click an SSH entry → a terminal opens connected. The whole value proposition in four seconds |
| `share.png` | The "Share with…" flow and a recipient's inbox |
| `unlock.png` | The YubiKey unlock prompt |

**Every screenshot must use fabricated data.** Not "a test account" — invented hosts
(`db-01.example.internal`), invented emails (`@example.com`), invented names. A screenshot of a
credential manager is a screenshot of someone's infrastructure, and once it is on the Marketplace it
is indexed forever.

Keep the GIF under ~2 MB and under ~15 seconds.

### 2. Restructure the README's first screen

Keep everything below the fold; rewrite the top:

1. One sentence on what it is.
2. The `tree.png` screenshot.
3. Three bullets on what it does — SSH in one click, secrets in the OS keychain, optional team
   sharing that is end-to-end encrypted.
4. `connect.gif`.
5. *Then* the current content: security model, server, sync, the comparison table.

The security model is the extension's strongest argument and should stay prominent — just not
*first*, before the reader knows what the thing is.

### 3. Listing metadata

```json
"categories": ["Other", "Snippets"],
"qna": "https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues",
"badges": [ /* the ci workflow badge */ ]
```

Check the current category list before choosing — the set has changed over time and `"Snippets"` may
not be the best second choice. The rule is: pick a category a human actually browses, or leave it at
`"Other"` rather than mis-filing.

### 4. A verification pass before the first publish

- `npx vsce ls --tree` — confirm `media/docs/**` ships (or is deliberately excluded and served from
  raw GitHub instead; excluding it keeps the `.vsix` small and is the better default).
- Install the built `.vsix` into a clean profile (`code --profile clean`) and walk the README's own
  quickstart as a new user, with no existing SecretStorage.
- Preview the README at the Marketplace's width; tables in it are wide and wrap badly.

## Not in scope

**Do not add telemetry.** Its absence is a feature for this category, and a credential manager that
phones home starts an argument it cannot win.

## Definition of Done

- [ ] Four images in `media/docs/`, all with fabricated data, referenced by absolute URL.
- [ ] The README's first screen answers "what is this and what does it look like" before anything else.
- [ ] `categories` and `qna` set deliberately.
- [ ] `vsce ls --tree` reviewed; the `.vsix` carries no image it does not need.
- [ ] The listing previewed at Marketplace width, and the quickstart walked in a clean profile.
- [ ] Promoted to `research/` once published, recording what the listing actually shipped as.
