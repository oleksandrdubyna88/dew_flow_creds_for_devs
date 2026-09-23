# PLAN — an entry with a URL opens its site in the browser (issue #104)

> Status: **plan only, nothing implemented yet, 2026-09-23.** Scope: `src_vs_code` — the View Details
> page and panel, the tree's context menu and its flag cache, one new command. No server, CLI or MCP
> change.
>
> Related docs: [module_extension.md](../research/module_extension.md) §Login and URL, §the per-entity
> flag caches; [architecture.md](../research/architecture.md).

## 1. The goal

Issue #104: *"wherever an entity has a URL, show a button 'open the site in the browser' — both in the
right-click menu and in the view. Keep Copy; Open in browser is additional."* The screenshot is a
credential (`godaddy`) whose viewer shows Name / Login / URL / Password / One-time code, each with a
copy button, and whose context menu offers *Copy Password*, *Copy One-Time Code*, and so on.

Decided with the owner on 2026-09-23: **only the URL field** of an entry opens — not the `host` an
import stored, not an SSH/DB/VPN host.

Facts the design rests on:

- The URL is a **secret-store value**, not metadata: `EntityFields {login?, url?}` under the keychain
  key `:fields` (`entityFields.ts:12-20`, `storageManager.ts:812-821`), deliberately never in plain
  metadata. The viewer reads it through the PIN gate (`entityViewerCommands.ts:58-73`,
  `openedText(getFieldsRaw…)`).
- The viewer page is pure markup (`entityViewPage.ts`, **800 of 800 lines**): `row()` draws one input
  and one button (`:334-373`), the URL row is `:451`, and every button posts `{type: data-action,
  field}`. The page's CSP forbids navigation, so opening must go through the host.
- The panel's message loop (`entityViewPanel.ts:160-265`) returns on any type that is not `copy` at
  `:227`; it reads values from `state.options`, never from the message.
- The context menu is driven by `entityContextValue` tokens (`treeRowText.ts:99`); a secret-derived
  token comes from a cache the flag walk fills (`entityFlags.ts`, `passwordIds` → `:pwd`), because a
  tree row cannot read the keychain synchronously.

## 2. What must be true when done

1. **The viewer's URL row has an Open button** beside Copy (Copy stays first, so the "copied" tick
   still finds it). Pressing it opens the site in the default browser through `vscode.env.openExternal`.
2. **The context menu offers *Open Site in Browser*** on an entry that has a URL — and on a
   PIN-protected credential, whose URL cannot be known without the PIN (the handler asks for it the
   way the viewer does). It is not offered on an entry without one.
3. **Only web addresses open.** A URL is untrusted input — it arrives by sync, share and import — so
   `siteUrl.ts` (pure) allows `http:` and `https:` only and refuses `file:`, `vscode:`, `command:`,
   `javascript:`, `data:` and everything else, naming what it refused. A bare host (`grafana.internal`,
   `www.godaddy.com/login`) gets `https://`. An address with credentials in it (`https://u:p@host`) is
   refused — a browser would send them, and a vault that stores the password separately has no reason
   to put it in a URL.
4. **The value opened is the stored one**, read on the host (panel: `state.options.fields.url`;
   command: through the PIN gate), never a value the webview posts.
5. Help, `module_extension.md`, the Marketplace README and the CHANGELOG say so.

## 3. Design

- `src_vs_code/src/siteUrl.ts` — pure: `siteUrlToOpen(raw): { ok: true; url: string } | { ok: false;
  reason: string }`.
- `src_vs_code/src/siteUrlView.ts` — pure markup: `urlRow(url)` draws the URL row with Copy and Open
  (`data-action="open"`). `entityViewPage.ts:451` calls it instead of `row('URL', …)`; the line budget
  is paid by moving one self-contained helper out of `entityViewPage.ts` (reuse-first: an extraction,
  not a trimmed comment).
- `entityViewPanel.ts`: an `open` branch before `:227` → `openSite(state.options.fields?.url)`.
- `src_vs_code/src/openSite.ts` — the `vscode` half: validate, `openExternal`, warn on refusal. Shared
  by the panel and the command.
- Tree: `EntityFlagSource` gains `getFieldsRaw`; the walk records `urlIds` (a parsable, openable URL,
  or a PIN-protected credential); `treeDataProvider` exposes `hasUrl`; `entityContextValue` adds
  `:url`. Refreshed by the same triggers as `:pwd` (edit, sync, share accept, another window's write).
- Command `credSshManager.openSiteInBrowser` ("Open Site in Browser") in `package.json`, menu
  `view/item/context` with `viewItem =~ /:url/` in the `2_actions` group after *Copy Password*, hidden
  from the command palette (it needs a row); handler in `commands/entityCommands.ts` reads the fields
  through `entryPinGate` / `admit` / `openedText`.

## 4. Build order

1. `siteUrl.ts` + tests (red first on the refusals).
2. The viewer: `siteUrlView.ts`, the extraction for line budget, the panel branch, `openSite.ts`.
3. The tree: the flag walk, `hasUrl`, `:url`, the command, `package.json`, help coverage.
4. Docs.

## 5. Test plan

- `siteUrl.test.ts`: http/https pass unchanged; bare host and host/path gain https; `file:`,
  `vscode:`, `command:`, `javascript:`, `data:`, `ftp:` refused by name; credentials in the URL
  refused; whitespace trimmed; empty refused.
- `entityViewPage.test.ts`: the URL row has Copy then Open; no URL → no row; the page script posts
  `open` for the button.
- A panel test under the vscode stub: an `open` message opens the STORED url (not a posted one) and a
  refused scheme warns and opens nothing.
- `entityFlags` test: `:url` for an entry with a URL, not for one without, yes for a PIN-protected
  credential; `treeRowText` exact-token tests updated.
- `commandsRegistered.test.ts`, `helpCoverage.test.ts`, `manifestIcons.test.ts` pass with the new
  command.

## 6. Risks

- `vscode.Uri.parse` + `openExternal` re-encodes some `%`-sequences; the URL is passed through
  `Uri.parse(url, true)` and a test pins a query string with `%20` and `&`.
- One more keychain read per entity per flag walk. The walk already reads the password and history
  per entity; this is the same order of cost, and only the credential kind carries fields.

## 7. Definition of Done

- [ ] Open works from the viewer and the context menu; only http/https open.
- [ ] Tests above, red first where a refusal is asserted; `npm test`, lint, typecheck, package green.
- [ ] Docs updated; this plan promoted.
- [ ] The `coai` gate: plan round and one code round; own review in parallel.
- [ ] PR merged, CodeRabbit threads resolved.
