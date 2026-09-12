# PLAN — the entry PIN gets its own floor, "Create Entity for…" asks the kind first, and an env binding says what it did

> Status: **IMPLEMENTED, 2026-09-12.** Five commits; both gate rounds run (plan: good_enough, 3 of 3
> reviewers, 15 findings resolved — code: good_enough, 12 of 12 reviewers, 37 findings resolved, 6
> accepted).
>
> **Deviations, and the first one reverses this plan's own Definition of Done.** §2.3 asked for the
> create to apply its bindings BEFORE the PIN seal, from the form's plaintext, so that an entry with
> a PIN and a binding would get its variable written. The code round read that as a PIN bypass and
> it was one: the secret went into the environment collection, where every terminal opened
> afterwards reads it without the PIN, against the promise the form's *"PIN — on"* banner and the
> `entity-pin` help both make. **A PIN-protected entry writes no environment variable.** The seal
> runs first again and `automaticFieldRefusal` is the one function every road asks, so a held value
> can never outrank the policy. What issue #48 called a defect was the SILENCE, and that is what
> stays fixed — the person is told the PIN won, with the same sentence the viewer's `ENV` button
> uses. Then: `showEnvNotice` lives in `envCollectionRef.ts`, not `envApply.ts`, because that module
> must stay runtime-pure (a real `vscode.window` call there fails an unrelated test file at load);
> the kind is passed as a new `initialKind`, not `lockedKind`, so the selector stays editable and no
> false folder hint appears; `newPin` gained a scope that defaults to the VAULT, so forgetting it
> costs a refused PIN rather than an accepted one; and the code round found four more ways a binding
> lied — an empty box carried as a held value blanked the variable, an unknown field key threw
> mid-save, an unusable variable name was written, and each is now said with its reason.
>
> **The open tail**, recorded rather than fixed: a FIFTH consumer of `applyEnvBindings` exists that
> the plan did not list — the agent's `exportEnv` verb — and it still answers `written: []` with no
> reason for a withheld binding, because carrying `withheld` to the agent is a broker-contract change
> across three codebases and the adapter would have to live in `extension.ts`, which the size ratchet
> freezes. Scope: `src_vs_code/src` —
> `pinPolicy.ts`, `pinInput.ts`, `pinPrompt.ts`, `pinCommands.ts`, `pinOnCreate.ts`, `dialogs.ts`,
> `commands/shareCommands.ts`, `envApply.ts`, a new `envApplyNotice.ts`, `commands/treeMutationCommands.ts`,
> `entityEditCommands.ts`, `entityFormPage.ts`, `helpEn.ts` (+ ru/uk/de/es), `README.md`, and tests.
> Extension only; no HTTP contract touched.
>
> Issues: [#55](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/55),
> [#57](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/57),
> [#48](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/48).
> Related docs: [PLAN_woven_passwords_and_entity_pin.md](PLAN_woven_passwords_and_entity_pin.md)
> §2 (the per-entry PIN), [SECURITY_REVIEW_2026-08-24.md](SECURITY_REVIEW_2026-08-24.md) M-1
> (why the vault PIN floor is eight), [module_extension.md](module_extension.md)
> §Env bindings: names travel, values never do.

## 1. Symptoms

### 1.1 (#55) The entry PIN is judged by the vault PIN's rules

`pinPolicy.ts` is written for one threat: *"the PIN is the sole barrier protecting vault ciphertext
that deliberately lives in shared/offline locations"* (`:1-4`), hence `MIN_PIN_LENGTH = 8` (`:28`),
`MIN_DIGITS_ONLY_LENGTH = 12` (`:31`), the repeated-character and blocklist refusals (`:76-93`). Its
one consumer shape is `pinFeedback(value, mode)` (`:176-186`), whose only axis is
`'choosing' | 'entering'`; `pinInput.ts:13-17` adapts it for `showInputBox`.

The entry PIN — the SECOND lock, asked after the vault is open, wrapping one entry's secrets
(`PLAN_woven_passwords_and_entity_pin.md` §2) — reaches the same validator in every box:
`pinPrompt.ts:27` (enter), `:49` (choose), `pinCommands.ts:216` (a folder's PIN checked against
siblings), `pinOnCreate.ts:115` (a new entry in a `folderAsksForPin` folder). `shareRecipientPin.ts:44`
goes through `newPin` and is covered by `:49`. So the screenshot: `1234` is refused with *"All digits
gives an attacker only ten options per character…"*, and any short PIN with *"Use at least 8
characters — this PIN guards data stored off your machine"* — a sentence about the vault, shown for
an entry.

**The trade-off, stated so it is a decision and not an oversight.** The entry wrap uses the vault's
scrypt primitive (`secretEnvelope.ts:191-208` → `wrapWithPinAsync`), and the wrapped envelope does
leave the machine — it is what backups and sync carry (`helpEn.ts:292`, `README.md:373`). A
four-character entry PIN is therefore offline-attackable by someone who holds the file **and** has
the vault open. That is a weaker position than the vault PIN's, by design: the vault PIN is the
first lock and keeps its floor; the entry PIN is a second lock against a shoulder, a screen share, an
agent, a colleague at an unlocked desk — and a lock nobody sets because the box refuses `1234` is
weaker than one that is set. The owner chose this (issue #55: *"мин 4 символа любых"*).

### 1.2 (#57) "Create Entity for…" opens on `credential` without asking

`credSshManager.createForUser` (`commands/shareCommands.ts:42-114`, contributed on `viewItem =~ /^teamMember/`
at `package.json:1468-1477`) picks the sender account, picks recipients, then calls `showEntityForm({
mode: 'create', … })` **with no `lockedKind`** (`:57-77`). The form is not limited to passwords — the
Type selector is rendered enabled over all nine kinds (`entityFormPage.ts:471-477`, fed by
`ENTITY_KINDS` at `:239-244`) — but it *opens* on `credential`, because `entityFormPage.ts:210` is
`options.lockedKind ?? resolveKind(d)` and `resolveKind(undefined)` is `'credential'` (`entityKind.ts:71`).
The normal flow never shows that default because it creates inside a TYPED folder and locks the kind
(`treeMutationCommands.ts:269`, `commandTargets.ts:31-40`). From a Team row there is no folder, so the
kind is a silent default and the heading reads *New entity [credential]*. The issue's *"creates only a
password"* is that default, mis-read as a restriction.

There is no test for `createForUser` at all (`orgMembersWiring.test.ts:96` mentions it in a comment).

### 1.3 (#48) An env binding is applied in silence, and a withheld value is skipped in silence

Not a Linux defect. The mechanism is `vscode.GlobalEnvironmentVariableCollection` only
(`envCollectionRef.ts:9-20`, `envApply.ts:127-131`, `entityViewerCommands.ts:186-187`): the value goes
into every integrated terminal **opened afterwards, in this window**, never to a file, never to a
shell outside VS Code — stated in `README.md:243-256`, `module_extension.md:1212-1225`, and in the
agent consent text (`agentUseActions.ts:212-214`, `:227-228`). No platform branch exists on the path
(`process.platform` appears in none of the six files); `envProbe.ts:15` handles `/bin/bash` and is
pinned by `envProbe.test.ts:36-44`. The reporter's expectation (`.bashrc`) is out of design, and would
put a **private key** into a plaintext file — the product already refused that trade for everything
but `SSH_AUTH_SOCK` (`CHANGELOG.md:1868-1873`, `wslRelayCommands.ts:185-222`).

What IS defective, on every OS:

- **D1 — the save path says nothing.** The form's checkbox (`entityFormPage.ts:191-203`, label
  `:143-149` *"Expose the private key in terminals as env variable"* — no qualifier, no hint) writes
  on save through `applyEnvBindings` (`treeMutationCommands.ts:312`, `entityEditCommands.ts:132`), and
  both call sites **discard** its `written: string[]` (`envApply.ts:119-133`). Tick, save, look at the
  terminal that is already open: nothing. The viewer's `ENV` button does notify
  (`entityViewerCommands.ts:188-190`); the form does not.
- **D2 — a withheld value is skipped without a word.** `applyEnvBindings` reads through
  `bindableFieldValue` → `valueOf` (`envApply.ts:99-106`, `fieldReading.ts:34-36`), which collapses a
  `withheld` reading into `undefined`, and the loop skips it (`:128`). A PIN-protected entry
  (`pinGate.ts:123-128`) and a woven password (`envApply.ts:35-41`) both hit this. The create path makes
  it reachable in one sitting: `treeMutationCommands.ts:309` applies the create-PIN and `:312` then
  reads the values back — already locked. Entry created, binding saved, nothing written, nothing said.
  The manual `ENV` button handles the same case correctly (`entityViewerCommands.ts:180-185`).

## 2. Design

### 2.1 A PIN scope, not a second policy file

`pinPolicy.ts`: `export type PinScope = 'vault' | 'entry'`; `export const MIN_ENTRY_PIN_LENGTH = 4`;
`export function validateEntryPin(value: string): string | undefined` — empty → *"PIN must not be
empty."* (the same sentence), shorter than four → *"Use at least 4 characters."*, otherwise accepted:
any characters, digits included, repeats included, no blocklist. `pinFeedback(value, mode, scope =
'vault')`: the entry scope returns the refusal or nothing — no crack-time estimate, because the
estimate is computed for an attacker who holds the file and no PIN, which is not this lock's threat.
A doc-comment on `validateEntryPin` records §1.1's trade-off. `pinInput.ts`: `pinValidator(mode, scope
= 'vault')` — a caller that forgets the scope gets the STRICTER vault default, the safe direction. The
four entry boxes pass `'entry'`: `pinPrompt.ts:27`, `:49`, `pinCommands.ts:216`, `pinOnCreate.ts:115`.
`shareRecipientPin.ts:44` reaches `:49` and is an entry PIN by nature — the recipient wraps ONE imported
entry on their own machine — and is classified so deliberately (plan round, codex and gemini both
asked; the DoD below names the transit PIN, which is the share PIN that seals off-machine ciphertext).
`entityPin.ts:59-61` keeps its own empty-PIN guard. Every vault and transit box is untouched:
`vaultKeys.ts:268`, `syncManager.ts:239`, `backupManager.ts:50`, `recoveryCommands.ts:517`,
`transitPinPrompt.ts:129`, `:315` — and a regression test drives `1234` through the transit prompt's
validator and watches it refused. Two more call-site tests (plan round, codex): `pinCommands.ts:216`
and `pinOnCreate.ts:115` drive `1234` through their actual validators and assert acceptance.

Help: `helpEn.ts:287-294` (`entity-pin`, `setup`) says *"at least four characters, anything you like —
it is a second lock behind an open vault, not the vault's"*; the same sentence in `helpRu.ts`,
`helpUk.ts`, `helpDe.ts`, `helpEs.ts` in the SAME commit (a stale translation is invisible to the
coverage test — so a locale-specific test asserts that each of the five `entity-pin` texts states
the four-character floor, plan round, codex); `README.md:340-394` the one line that states the rule.

### 2.2 `pickEntityKind`, and the kind is asked first

`dialogs.ts`: extract `export async function pickEntityKind(current?: EntityKind): Promise<EntityKind |
undefined>` — the `ENTITY_KINDS.map(...)` items with the `(current)` mark, title *"Entity type"*.
`pickFolderType` becomes those items plus its two extra rows (`project`, `any`), so `dialogs.test.ts:96-129`
stays green. `shareCommands.ts:57-77`: the QuickPick is the FIRST thing the click does — before the
account and the recipients — and a dismissed pick creates nothing (the `pinForNewEntry` precedent at
`treeMutationCommands.ts:253-256`: ask before the form, so cancelling costs nothing). The picked kind
goes to `showEntityForm` as a NEW `initialKind` option, not as `lockedKind` (plan round, gemini):
`lockedKind` disables the selector and prints *"Type is fixed by the folder's type."*
(`entityFormPage.ts:473-477`), which is false here and would force a wrong pick back through account
and recipients. `EntityFormOptions.initialKind?: EntityKind`; `entityFormPage.ts:210` becomes
`options.lockedKind ?? options.initialKind ?? resolveKind(d)`, so the form opens on the picked kind
with the selector still editable and no folder hint. Not a second QuickPick: `dialogs.ts:34-36`
records what a hand-written kind list cost last time. The test records the prompt order in the stub
and asserts the kind pick is the FIRST prompt and that a dismissed pick prevents every later one
(plan round, codex).

### 2.3 The env save says what it wrote and what it could not

**As planned:** *the save applies the bindings BEFORE the seal, from the values it holds* (plan round,
gemini — the plan's first draft codified D2 as expected behaviour). On create,
`treeMutationCommands.ts:309` seals the new entry under its PIN and `:312` then reads it back — already
locked. The order inverts: the bindings are applied from the form's plaintext values first, the seal
follows; on edit (`entityEditCommands.ts:132`) the values the form just saved are used the same way.
`applyEnvBindings` takes an optional in-memory `values` source and reads storage only for what the form
did not carry; the storage path stays for the viewer's `ENV` button. A `withheld` is then what it should
be — a woven password nothing can expose, or a locked field the form did not touch — and is reported,
not dropped.

**As shipped — REVERSED by the code round (gemini, Architecture, 2026-09-12).** The inversion was a PIN
bypass: `boundReading` consulted only the woven refusal before using a held value, so a PIN-protected
entry's plaintext went into the environment collection, where every later terminal in the window read
it without the PIN — contradicting the form's *"PIN — on"* banner (`generalNotes.ts:31-34`, *"Nothing
automatic can use this entry while that is true"*) and the `entity-pin` help. So: **a PIN-protected
entry writes NO environment variable.** The seal runs first again (`applyCreatePin` before
`applyEnvBindings`, the pre-plan order), and `envApply.automaticFieldRefusal(details, field, stored)`
is the ONE function both roads ask — woven (from the entry) and PIN (from the value's own wrap,
`pinGate.automaticPinRefusal`); `boundReading` takes the stored reading first and lets a held value
stand in only when that reading is not a refusal. The binding is WITHHELD with the PIN sentence the
viewer's `ENV` button already says, and the notice prints it. This still closes D2 in full: the defect
was the SILENCE, not the absence — the person now learns the PIN won and why. The held `values` stay
(an edit writes what was just typed); on a create they equal what `applyAdditions` just wrote and are
refused with it once sealed. `envSaveNotice.test.ts` (create with a PIN → withheld, sealed, warned)
and `envApply.test.ts` (a held value over a locked slot → withheld) pin the reversal.

`envApply.ts`: `applyEnvBindings` returns `{ written: string[]; withheld: Array<{ name: string;
reason: string }> }` — `written` keeps its shape, so `envApply.test.ts:94-200` moves only on the type.
Inside, the loop reads through `FieldReading` rather than `valueOf`, so a `withheld(reason)` is
collected instead of dropped. New pure `envApplyNotice.ts`: `envAppliedNotice(result): { info?: string;
warning?: string }` — info: *"`$A`, `$B` set for NEW integrated terminals in this window. Already-open
terminals keep their old environment."* (the viewer's own sentence, `entityViewerCommands.ts:188-190`,
moved here so both surfaces say one thing); warning: *"`$X` was not written: <reason>"* per withheld
name. `treeMutationCommands.ts:312`, `entityEditCommands.ts:132` AND `entityViewerCommands.ts:186-190`
(plan round, gemini: the viewer was outside the scope and would have kept a second sentence) show
them; call-site tests for create and edit assert the information and warning calls for written,
withheld and mixed results (plan round, codex). The form label
(`entityFormPage.ts:143-149`) becomes *"Expose … in new integrated terminals as env variable"* with a
`.hint` under the env row: *"Written into every integrated terminal opened after saving, in this
window only. Never to a file, never to a shell outside VS Code."*

Reply on #48 (English, the reporter's language): the design, the two defects fixed, the version.

## 3. Build order

1. **RED** `pinPolicy.test.ts`: `validateEntryPin('1234')` → `undefined`; `'123'` → `/at least 4/`;
   `'aaaa'` and `'password'` accepted; `pinFeedback('1234','choosing','entry')` → `undefined`;
   `pinFeedback('1234','choosing')` still refused (the vault scope unchanged); `:81-87`'s "refusal in
   both modes" holds per scope. **RED** `pinPrompt.test.ts` (new, through `vscodeStub.ts` per
   `module_extension.md` §Testing a `vscode`-bound module): `entryPinGate(...).ask()` and `newPin()`
   hand `showInputBox` a `validateInput` that accepts `1234`. Then §2.1.
2. **RED** `dialogs.test.ts`: `pickEntityKind` offers every `ENTITY_KINDS` entry, marks the current,
   returns `undefined` on dismiss; `pickFolderType` still offers kinds + project + any. **RED** new
   `shareCommands.test.ts`: `createForUser` with the stub's QuickPick answering `db` calls
   `showEntityForm` with `initialKind: 'db'`; a dismissed pick opens no form. Then §2.2.
   (This line said `lockedKind` while §2.2 said `initialKind`: the two disagreed about whether the
   selector stays editable, and a test written from the build order would have pinned the wrong one.
   Caught by the automated reviewer on the pull request; what shipped is §2.2's `initialKind`.)
3. **RED** `envApply.test.ts`: a PIN-locked reading yields `withheld: [{name, reason}]` and nothing
   written; **RED** `envApplyNotice.test.ts` (new): the two sentences. **RED** `entityFormPage.test.ts`:
   the env row carries the hint. Then §2.3.
4. `npm run typecheck && npm test && npm run lint`; `npm run package`, install, and by hand: protect an
   entry with `1234`; create for a teammate and see the type pick; tick an env binding on a
   PIN-protected entry and read the warning.
5. Docs: `research/module_extension.md` — §Env bindings (the notice, the hint) and the entry-PIN
   paragraph under the woven-passwords section (the scope); `CHANGELOG.md` `[Unreleased]`.

## 4. Test plan

- Unit, RED first: `pinPolicy.test.ts` (+6), `pinPrompt.test.ts` (new, 2), `dialogs.test.ts` (+3),
  `shareCommands.test.ts` (new, 2), `envApply.test.ts` (+2), `envApplyNotice.test.ts` (new, 3),
  `entityFormPage.test.ts` (+1).
- Regression: the whole suite; `helpCoverage.test.ts` for the five help texts.

## 5. Definition of Done

- [ ] `1234` is accepted by every entry-PIN box (including the recipient's PIN for an imported entry)
      and refused by every vault box and by the transit (share) PIN; the scope has a recorded reason;
      help in five languages and the README say the rule.
- [ ] *Create Entity for…* asks the kind first, from the one kind list; the form opens on that kind
      with the selector still editable; dismissing creates nothing.
- [ ] ~~A create with a PIN and an env binding writes the binding (applied before the seal)~~ —
      **reversed by the code round (§2.3, 2026-09-12): a create with a PIN and an env binding writes
      NOTHING and is told why — the PIN outranks the binding, on every road in**; saving an env
      binding reports what was written and what was withheld, with the reason, on create, edit and
      the viewer's `ENV` button; the form's label and hint say "new integrated terminals, this window,
      never a file".
- [ ] Every RED test watched failing with its real symptom, then green; typecheck, test, lint clean;
      the `.vsix` checked by hand for the three behaviours.
- [ ] `research/module_extension.md`, `CHANGELOG.md` updated; #48 answered; this plan promoted with
      its deviations.
- [ ] The `coai` gate: a plan round and a code round resolved; verdicts and reviewer counts reported.
