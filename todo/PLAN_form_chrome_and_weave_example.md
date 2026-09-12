# PLAN — the entity form follows the text-size setting, the folder form shares the entity form's chrome, a button never touches a field, and the woven-password example is painted

> Status: **plan only, nothing implemented yet, 2026-09-12.** Scope: `src_vs_code/src` —
> `zoomControl.ts`, `entityFormScript.ts`, `formMessage.ts`, `entityFormPanel.ts`, a new
> `pageChrome.ts`, `entityFormStyles.ts`, `entityFormPage.ts`, `folderFormPage.ts`, `folderFormPanel.ts`,
> `wovenFormScript.ts`, `cardFormScript.ts`, a new `weaveExampleScript.ts`, `paymentFormMarkup.ts`,
> `phraseFormMarkup.ts`, `weaveExample.ts`, and their tests. Extension only; no HTTP contract touched.
>
> Issues: [#2](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/2),
> [#53](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/53),
> [#54](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/54),
> [#51](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/51).
> Related docs: [module_extension.md](../research/module_extension.md) §The entity form's chrome,
> §Two groups, two columns; [PLAN_tails.md](../research/PLAN_tails.md) T28 (the ± text zoom);
> [PLAN_woven_passwords_and_entity_pin.md](../research/PLAN_woven_passwords_and_entity_pin.md) §1;
> [PLAN_payment_polish_and_entity_pin.md](../research/PLAN_payment_polish_and_entity_pin.md) §1.1
> (the Form dropdown that never switched the fieldset — the same class of defect as §1.4 below).

## 1. Symptoms — four issues, one form

### 1.1 (#2) The text-size buttons do nothing on an already-open entity form

T28's contract is: the page posts the press, the host writes `credSshManager.uiScale`, the host
pushes `{type:'uiScale', px, label}` to every open page, and each page repaints itself from that
message (`zoomControl.ts:4-15`; `uiScaleHost.ts:8-12` — *"every open page is pushed the new value, so
two pages never show two sizes"*). The entity form does half of it:

- `entityFormPage.ts:6` imports `zoomControlHtml` only — not `zoomScript`.
- `entityFormScript.ts:735-739` posts its own `{ type: 'zoom', zoomDelta }` — a second spelling of the
  wire (`zoomScript()` posts `delta`, `zoomControl.ts:65`; `entityViewPanel.ts:158` and `helpPanel.ts:25`
  read `delta`; `formMessage.ts:53` and `entityFormPanel.ts:299` read `zoomDelta`).
- `entityFormHost.ts:40` does hook `pushUiScaleTo(panel.webview)`, so the push reaches the form —
  and **nothing in the form's script listens for `uiScale`**: its three `message` handlers
  (`entityFormScript.ts:275`, `:757`, `:766`) cover `splitResult`/`argNotes`, `paymentSwitchNotice`
  and `generated`.
- The page is rendered exactly once (`entityFormHost.ts:38`, called from `showEntityForm` at
  `entityFormPanel.ts:284-285`), so the size is frozen at `zoomStyle(uiScale)` render time
  (`entityFormStyles.ts:18`). Press ± on an open form: the setting changes, the viewer and the help
  page follow, the form does not. Open a new form: it renders with the new value and "works".

**The reporter's "existing entity page" that works is the read-only viewer** (`entityViewPage.ts:715`
inlines `zoomScript()`). Create and Edit forms share `renderHtml`, so both are frozen — the fix is
not "new entity"-specific.

### 1.2 (#53) The folder form is a second, hand-rolled page

`folderFormPage.ts:59-84` carries a private stylesheet and `:88-92` a private header. Against the
entity form (`entityFormPage.ts:437-461`, `entityFormStyles.ts:16-25`, `:140-163`):

| aspect | entity form | folder form |
|---|---|---|
| page width | `PAGE_MAX_WIDTH_PX` = 1280 (`webviewHtml.ts:39`) | hard-coded `760px` (`folderFormPage.ts:60`) |
| root font size | `zoomStyle(uiScale)` | absent — inherits the webview default |
| bar | `.topBar`, sticky, **border-bottom + margin-bottom** (`entityFormStyles.ts:150-152`) | `.bar`, sticky, no border, no bottom margin (`:74-75`) |
| text-size control | `zoomControlHtml` (`entityFormPage.ts:442`) | absent; `ZOOM_CSS` not imported |
| buttons | `padding: 6px 18px; border-radius: 3px`, Cancel bordered (`:154-163`) | `4px 12px`, no radius, no border (`:76-79`) |
| heading | `Edit: name` + `.kindChip` | `Edit folder: name` |
| host | `mountForm` renders with `currentUiScale()` and hooks `pushUiScaleTo` (`entityFormHost.ts:36-43`) | `folderFormPanel.ts:43` — `renderFolderHtml(options)`, no scale, no hook |

`formPanels.ts:20-34` already argues that *"the two forms drifting apart is precisely the failure"*
— for lock behaviour. The chrome drifted anyway, because nothing shared it.

### 1.3 (#54) A button after a field has no gap, because the form has no row primitive

The viewer has one — `entityViewStyles.ts:92-93`: `.line { display:flex; gap:8px; align-items:flex-start }`
and `input, textarea { flex:1 }`. Every viewer field+button pair uses it and gets 8 px. The form has
`input:not(…), textarea, select { width:100% }` (`entityFormStyles.ts:128-132`), `button` with **no
margin** (`:154`), `.genRow { margin: 6px 0 0 }` (`:43`) and **no `.line` rule at all** — `grep '\.line'`
over the `*Styles.ts` files hits the viewer once. Consequences, all visible in the issue's screenshot:

- a bare `<button>` after a field touches it — `entityFormPage.ts:506-512` (Type select → **Generate
  key pair**, the screenshot), `:586-587`, `:683`, `:327`, `:340`, `paymentFormMarkup.ts:111`
  (`#addressPaste` textarea → *Split pasted address*, colliding with the resize grip), `:244`;
- `class="line"` in a form page is dead markup — `phraseFormMarkup.ts:37-40` puts a 100 %-wide select
  and *Generate phrase* in a `.line` that is a plain block, so the button drops under the select and
  sits flush against it; `entityFormPage.ts:319` is the harmless proof of the same missing rule.

"Наезжает" is *touching*, not overlapping: `position: absolute` appears once in the extension
(`entityFormStyles.ts:100`, the syntax-highlight overlay) and no rule can put a button on top of an
input. The dynamically built rows in `entityFormScript.ts:149-205` use `.argTop` (`entityFormStyles.ts:135-137`)
and are spaced correctly — the in-repo proof that the fix is a class, not eleven patches.

### 1.4 (#51) The woven-password example is drawn without the class the colours hang on

The machinery is field-agnostic and shared: `weaveExample.ts:91-108` answers `{first, second, woven}`
for any field with a shape (`:66-76` has `password`), wired once host-side at `entityFormPanel.ts:354`.
The card form paints it in colour because `cardFormScript.ts:248-257` creates a block with
`className = 'weaveEx'` inside `#mixExample` (`paymentFormMarkup.ts:247`), and **every colour rule is
scoped under `.weaveEx`** (`entityFormStyles.ts:176-187`: `.weaveEx .exTok.first` green,
`.weaveEx .exTok.second` orange).

The password form appends the same three columns into `<div id="weaveExampleHost">` with no class
(`entityFormPage.ts:179`, `wovenFormScript.ts:40-45`); `:69` sets the right `exTok first|second` classes
on the cells, and no selector reaches them. The screenshot is exactly that: three uncoloured, unboxed
lines under the controls. `wovenFormScript.ts:57-79` is a near-verbatim copy of `cardFormScript.ts:247-276`
— two painters, one of them inside the box and one outside.

Found while verifying, same family: **the bank form's weaving controls are unreachable.** `mixMarkup`
— `#mixControls`, `#mixMethod`, `#mixWarning`, `#mixPerField`, `#mixExample` — is emitted inside
`cardMarkup` (`paymentFormMarkup.ts:82`), which `formSections.ts:210` hides whenever the form is not
`card`. The bank weave boxes live in `bankSection` (`:174-177`). Tick *Store the IBAN woven with a
decoy*: no method picker, no warning, no example appear — and the save still weaves, because
`entityFormScript.ts:707` reads `#mixMethod` off the hidden select and `paymentSaveGate.ts:139-149`
accepts it. The IBAN is woven under a method the person never saw, and the method is stored nowhere
(`shuffle.ts:4-10`). The phrase form has no example at all (`phraseFormMarkup.ts:88-104`) and its picker
is in fixed order with index labels (`:114-116`), against `shuffle.ts:27` and the decision table in
`todo/ЗАДАЧА_варианты_перемешивания_сид_фразы.md` — the payment and password pickers use
`methodOrder` + `methodLabel` (`paymentFormMarkup.ts:216-220`, `entityFormPage.ts:184-188`).

## 2. Design

### 2.1 One zoom script, in two halves

`zoomControl.ts`: split `zoomScript()` into `zoomButtonsScript()` (the click → `postMessage({type:'zoom',
delta})`) and `zoomApplyScript()` (the `uiScale` listener). `zoomScript()` returns both, so the viewer
and the help page change nothing. The entity form replaces its private click wiring
(`entityFormScript.ts:735-739`) with `zoomButtonsScript()` and adds `zoomApplyScript()`; the folder
form gets both. The wire is unified on **`delta`**: `formMessage.ts:53` and `entityFormPanel.ts:299`
read `delta`, and `zoomDelta` disappears. Not "inline `zoomScript()` into the form": that would bind
`button[data-zoom]` twice and post two messages per press.

What the apply half DOES is part of the contract, not an implementation detail (plan round, codex):
`zoomApplyScript()` sets `document.body.style.fontSize = event.data.px + 'px'` and the `#zoomOffset`
label from `event.data.label` — the test asserts that DOM update text, so a listener that merely
exists cannot pass it.

### 2.2 The chrome is one module, `pageChrome.ts`

Reuse-first move 2 (extract the shared half). New `src_vs_code/src/pageChrome.ts`, pure, exporting:

- `pageChromeCss(uiScale: number): string` — `body` (font, colours, `padding: 16px 24px`,
  `max-width: PAGE_MAX_WIDTH_PX`, `zoomStyle(uiScale)`), `h2`, `.kindChip`, `fieldset`/`legend`,
  `input[type=checkbox]`, `label`, `.check`, `.hint`, the `input:not(…), textarea, select` rule and
  `textarea { resize: vertical }`, `button`/`button.secondary`, `.topBar`/`.buttons`/`.error`
  (with the `.topBar .error` exception), `ZOOM_CSS`, and the row primitives of §2.3.
- `formHeaderHtml(h: { heading: string; chip?: string; uiScale: number })` — the sticky `.topBar`
  with Save/Cancel, the zoom control, the `#error` line, then the `<h2>` with the optional chip.
  Escapes its inputs. **The element ids are a contract** (plan round, codex + gemini): it emits
  `id="save"`, `id="cancel"` and `id="error"` — the ids both pages bind today (`entityFormPage.ts:440-448`,
  `folderFormPage.ts:113-116`, and the form script's error writes) — and the tests assert all three on
  both rendered pages, so a header that renders well but posts nothing on Save is a red test.

`entityFormStyles.ts` drops its copies (`:16-25`, `:40-44`, `:128-133`, `:140-163`, `:26`) and starts
with `${pageChromeCss(uiScale)}`; `entityFormPage.ts:437-461` becomes one `formHeaderHtml(...)` call.
`folderFormPage.ts` drops `:59-84` except the MCP rules (`.mcpWhy`, `.mcpBar`, `.mcpSeg`, `.mcpSegOn`,
`.sec`, `mcpSwitchStyles()`), takes `uiScale` in `FolderFormOptions`, renders `formHeaderHtml({heading:
\`Edit: ${name}\`, chip: 'folder', …})`, and includes `zoomButtonsScript()` + `zoomApplyScript()`.
`folderFormPanel.ts` renders with `currentUiScale()`, hooks `pushUiScaleTo` (disposed with the panel),
and its message handler gains a `zoom` branch → `applyZoomDelta(delta)` (`FolderFormMessage.type`
widens to `'save' | 'cancel' | 'zoom'`). The panel title stays `Folder: name`. The MCP switch styles
remain where they are — this plan does not touch `mcpSwitches.ts`. Spelled out because a reviewer
asked (plan round, local): `folderFormPage.ts` imports `zoomButtonsScript` and `zoomApplyScript` from
`zoomControl.ts` and passes `options.uiScale` into `formHeaderHtml`; the folder-page test asserts the
`data-zoom` buttons, the `uiScale` listener text and the `zoomStyle` px on `body`, so a forgotten
import or an unpassed scale is a red test rather than a visual regression.

The entity form's rendered markup is asserted by `entityFormPage.test.ts` (`:234`, `:253`, `:260`,
`:263` heading and chip; `:167-195` CSP and nonce): the header builder must render the same heading
text, the same `kindChip`, and no inline script — the tests stay green as the proof.

### 2.3 The row primitives live in the chrome

In `pageChromeCss`: `.line { display:flex; gap:8px; align-items:center }` and
`.line > input:not([type=checkbox]):not([type=radio]), .line > select, .line > textarea { flex:1; width:auto }`,
plus `.genRow { display:flex; gap:8px; margin:8px 0 0; flex-wrap:wrap }` (moved from `entityFormStyles.ts:43`,
top margin raised 6 → 8) and `.actions { margin-top: 8px }` for a lone button under a field. The
viewer keeps its own `.line` rule for now (its stylesheet is a separate page with different
`align-items`); hoisting the whole viewer chrome is a later, wider change — named, not done here.

Markup: wrap every bare pair. `entityFormPage.ts:506-512` — `#genKey` into the `.genRow` that already
holds the Type select; the global `width: 100%` would let the select take the whole row and push the
button under it (plan round, codex), so the chrome carries `.genRow > select { flex: 1 1 12em; width:
auto; min-width: 0 }` and the test asserts that rule. `:586-587`, `:683`, `:327`, `:340`,
`paymentFormMarkup.ts:111`, `:244` — `<div class="actions">…</div>`. `phraseFormMarkup.ts:37-40` needs
nothing once `.line` exists. The lint of step 3 runs over the folder page too (plan round, local) —
it has no field/button pair today, and the test is what keeps that true.

### 2.4 One example painter, and the password example inside the box

New `src_vs_code/src/weaveExampleScript.ts` exporting `weaveExamplePainterScript(): string` — the
page-script fragment defining `exampleBlock(field, title)` and `exampleColumn(name, tokens)` exactly as
`cardFormScript.ts:247-276` has them (a `.weaveEx[data-field]` block with `.exTitle`, three `.exCol`s of
`.exRow`/`.exTok first|second`). **Inlined ONCE**, in the composite page script
(`entityFormScript.ts:753-755` is where `cardFormScript()`, `wovenFormScript()` and `phraseFormScript()`
are concatenated — the painter goes in front of them), so the three sub-scripts call `exampleBlock` /
`exampleColumn` and define nothing; `cardFormScript.ts:247-276` and `wovenFormScript.ts:57-79` delete
their copies. The password form's host becomes `<div id="weaveExampleHost"></div>` filled by
`exampleBlock('password', 'Password — ' + methodLabel)`, so it is `.weaveEx` by construction. The
test asserts the fragment appears exactly once in the composite script and that all three sub-scripts
reference `exampleBlock(` (plan round, local: a sub-script that forgets the painter would throw at the
first method pick).

### 2.5 The phrase form gets the example and the shuffled picker

`weaveExample.ts`: `SHAPES` gains `mixed` — a WORD shape: `first` and `second` are six fixed
made-up words each (`apple river stone cloud maple frost` / `tiger candle orbit meadow silver pine`,
never drawn from the person's own words), `woven` from `shuffleLayout` over word tokens, exactly
as the save weaves them. `phraseFormMarkup.ts` adds `<div id="phraseExample">` under the method select and
the picker is built from `methodOrder(random)` with `methodLabel` like the other two; `phraseFormScript.ts`
posts `weaveExample` for field `mixed` on method change and paints with the shared painter of §2.4
(which is defined once in the composite script, so the phrase script calls it and defines nothing).
`shuffleLayout(length, code)` is index-based (`shuffle.ts:163`) and `weaveExample` maps slots to
`halves[side][index]` (`weaveExample.ts:103-106`), so a token can be a word as easily as a character.

### 2.6 The weaving controls are visible for the bank form

`paymentFormMarkup.ts`: `mixMarkup(random)` moves out of `cardMarkup` (`:82`) to after both the card and
the bank fieldsets, inside the payment section, so `formSections.ts:210` no longer hides it with the
card. Its visibility stays driven by "any weave box ticked" (`cardFormScript.ts:162-163`,
`controls.style.display = picked.length > 0 ? '' : 'none'`) — `cardFormScript()` is part of the one
page script every kind gets (`entityFormScript.ts:753`), so it runs for a bank form too. Two tests
(plan round, codex): the collector that builds `picked` names the bank boxes' ids as well as the
card's, and with `form: 'bank'` the rendered `#mixMethod` sits outside `#cardSection`. The example
painter keys on `data-field`, and `weaveExample.ts:79-81` already lists `iban` and `accountNumber`.

## 2.7 Three stories, each reviewed and committed before the next (the gate's order)

| story | sections | who | what proves it |
|---|---|---|---|
| S1 — the form follows the zoom | §2.1 | Opus | steps 1 |
| S2 — one chrome, the folder form joins, a row primitive | §2.2, §2.3 | Opus | steps 2–3 |
| S3 — one painter, the phrase example, the bank controls | §2.4–2.6 | Fable (payments) | steps 4–6 |

After each story: `npm run typecheck && npm test && npm run lint`, a `review_code` round on that
story's diff (`baseRef` = the previous story's last commit), every finding resolved, fixes committed,
`research/module_extension.md` and `CHANGELOG.md` updated for what the story changed.

## 3. Build order

1. **RED** `zoomControl.test.ts`: `zoomScript()` equals `zoomButtonsScript() + zoomApplyScript()`;
   `zoomApplyScript()` contains the `uiScale` listener AND the DOM update
   (`document.body.style.fontSize = event.data.px`). **RED** `entityFormScript.test.ts`: the form's
   script contains that same apply fragment and posts `delta`, not `zoomDelta`. Then §2.1. Run both suites.
2. **RED** new `pageChrome.test.ts`: `pageChromeCss(0)` carries `.line{display:flex`, the flex-child
   rule, `.genRow > select`, `.topBar`, `ZOOM_CSS`; `formHeaderHtml` escapes the heading, renders
   `data-zoom` buttons and `id="save"`, `id="cancel"`, `id="error"`. **RED** `folderFormPage.test.ts`:
   the page carries `data-zoom="1"`, the `uiScale` apply fragment, `.topBar`, `max-width: 1280px`,
   `font-size: …px` from `zoomStyle`, heading `Edit: ` + a `kindChip`, and the three ids. Then §2.2;
   `entityFormPage.test.ts` green unchanged, plus one case that the entity page's header has the three ids.
3. **RED** `entityFormPage.test.ts` (new case): a structural lint over the rendered create-form HTML for
   each kind AND over the folder page — no `<button` may immediately follow (whitespace only between)
   a `</select>`, `</textarea>` or an `<input …>` tag unless the two are children of a `.line`,
   `.genRow`, `.actions` or `.buttons` wrapper. Fails today on the SSH key form (Generate key pair).
   Then §2.3.
4. **RED** `wovenPasswordForm.test.ts`: the password example lands in a `.weaveEx` block — assert the
   woven script calls `exampleBlock('password'`, that the painter fragment appears exactly once in the
   composite `formPageScript` output, and that neither `cardFormScript()` nor `wovenFormScript()`
   defines `function exampleBlock` itself (one source). Then §2.4.
5. **RED** `phraseForm.test.ts`: the picker's option order is `methodOrder(random)` (inject a fixed
   random, assert the sequence), labels are `methodLabel`, `#phraseExample` present, the phrase script
   calls `exampleBlock('mixed'`; `weaveExample.test.ts`: `weaveExample('mixed', code, random)` returns
   six-word columns and a `woven` row that `shuffleLayout` reproduces. Then §2.5.
6. **RED** `paymentForm.test.ts`: with `form: 'bank'`, `#mixMethod` is NOT inside `#cardSection`
   (a child of the payment section, after both fieldsets); `cardFormScript()`'s `picked` collector
   names the bank weave boxes' ids. Then §2.6.
7. `npm run typecheck && npm test && npm run lint` (800-line ceiling: `entityFormPage.ts` is at 700+,
   watch it); `npm run package` and open the `.vsix`'s form, folder form and viewer by hand: press ±
   on an open Edit form and see it follow; open the folder form beside an entity form and compare the
   headers; the SSH key form's Generate button has a gap; the woven-password example is boxed and
   coloured; the bank form shows the method picker.
8. Docs: `research/module_extension.md` — §The entity form's chrome gains the `pageChrome.ts` paragraph
   and the folder form joins T28; §Payment instruments notes the `mixMarkup` move and the phrase
   example; `CHANGELOG.md` `[Unreleased]` → the next minor.

## 4. Test plan

Every assertion is a string assertion over generated markup, stylesheet or script — there is no DOM
harness (`research/PLAN_scenario_harness_catalogue.md`: *nothing drives the editor at all*), so the
tests pin the contract the browser consumes, and step 7 is the one look at the real thing.

- Unit: `zoomControl.test.ts` (+2), `pageChrome.test.ts` (new, ~6), `folderFormPage.test.ts` (+3),
  `entityFormPage.test.ts` (+1 lint, +1 header-through-builder), `entityFormScript.test.ts` (+1),
  `wovenPasswordForm.test.ts` (+2), `phraseForm.test.ts` (+3), `weaveExample.test.ts` (+2),
  `paymentForm.test.ts` (+1). Each RED first, watched failing with the real symptom.
- Regression: the whole `npm test` suite; `entityFormPage.test.ts:167-195` proves the shared header
  breaks neither CSP nor the nonce rule.

## 5. Definition of Done

- [ ] Pressing ± on an open Create or Edit form resizes it live; the folder form has the control and
      follows the setting; one `zoomScript` source, one `delta` wire.
- [ ] `folderFormPage.ts` has no private stylesheet beyond its MCP rules; header and chrome come from
      `pageChrome.ts` on both forms.
- [ ] No button in any create form immediately follows a field outside a spacing wrapper (the lint);
      the `.line` and `.actions` rules are in the shared chrome.
- [ ] The woven-password example is a `.weaveEx` block painted by the one shared painter; the phrase
      form shows an example and a shuffled picker; the bank form shows its weaving controls.
- [ ] Every RED test above was watched failing with its real symptom, then green; `npm run typecheck`,
      `npm test`, `npm run lint` clean; `.vsix` opened and the five checks of step 7 done by hand.
- [ ] `research/module_extension.md` and `CHANGELOG.md` updated; this plan promoted with its deviations.
- [ ] The `coai` gate: a plan round resolved, a code round on the finished branch resolved; verdicts
      and reviewer counts in the summary.
