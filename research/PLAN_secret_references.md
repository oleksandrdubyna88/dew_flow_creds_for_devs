# PLAN — `creds://` secret references and a masked `run` wrapper

> Status: **IMPLEMENTED, 2026-08-25.** Scope: `src_vs_code/src/` — script and terminal-command
> entities, the human Run path, and the broker's `script` action.
>
> Related docs: [module_extension.md](module_extension.md),
> [PLAN_audit_roadmap_2026_08_25.md](../todo/PLAN_audit_roadmap_2026_08_25.md) (item **D3**).
>
> **Deviations from the plan, and what they cost.**
>
> - **The `env` verb was NOT retired.** The plan proposed making it unnecessary; what shipped makes it
>   the *weaker* documented option instead. Removing it would break the one case it serves — an agent
>   whose shell is an integrated terminal and which never runs a stored entry — and a capability people
>   already use is not something to delete on an argument.
> - **A cross-platform defect was found by verifying rather than reasoning**, and it is the reason this
>   feature has an integration test: the pseudoterminal spawned through Node's default shell (cmd.exe on
>   Windows) while the references were rewritten for the user's *terminal* shell, so a PowerShell command
>   would have received a literal `$env:NAME`. Both now take `vscode.env.shell`.
> - **The masker holds back `longest − 1` characters** rather than masking per chunk. Measured on
>   Linux: a value split across two writes is caught. On Windows the same test asserts the weaker
>   property, because PowerShell emits each half on its own line and the value never reassembles.
> - **Ambiguity is refused, never guessed** — as planned, and it stayed the right call: entity names
>   carry no uniqueness rule anywhere in this codebase, so a folder path is the disambiguator.
>
> - **The masker was later folded into `secretMasker.ts`**, the module the broker's response path
>   uses, once that landed on main. `outputMask.ts` keeps only what that module cannot do — holding
>   a stream's tail back across chunk boundaries — and inherits its knowledge of the OTHER forms a
>   value takes (percent-encoded, base64, a PEM body). Two maskers in one product would have been
>   two definitions of what counts as a secret.
>
> **What the post-implementation review caught (2026-08-25):**
>
> - **Closing the terminal did not reliably kill what it started.** `close()` called `child.kill()`
>   once, with no escalation — and because the spawn goes through a SHELL, on Windows that child is
>   `cmd.exe`/PowerShell and the real program is a GRANDchild. Closing the panel left it running,
>   with the resolved secrets still in its environment and no UI left to notice. `childKill.ts` now
>   does the tree first (`taskkill /T` where that is a separate step) then SIGTERM→SIGKILL — the
>   pattern `sshExecRunner.ts` already had, extracted rather than copied.
> - **A keystroke arriving as the child exits could have taken the window down.** `stdin.write`
>   after the stream ends emits an error nothing was listening for, which in an extension host is
>   "Extension host terminated unexpectedly" rather than a dropped key. There is now a guard and a
>   listener — the guard for the ordinary case, the listener for the race the guard cannot win.
> - **The banner was making a promise the masker does not keep.** Values under
>   `MIN_MASKABLE_LENGTH` are deliberately not masked (replacing a six-digit string would turn
>   every line number in the output into a placeholder) — but **a one-time code is exactly six
>   digits**, so the promise was false precisely where somebody would be watching. The banner now
>   names the values it does not cover instead of claiming them.
>
> **Open tail:** the pseudoterminal has no PTY, so a program that needs a real terminal (an interactive
> password prompt, a progress bar, colour-by-isatty) behaves as it does when piped. *Run in Terminal* is
> unchanged and remains the door for those. A PTY would need a native dependency, which this extension
> does not have and should not acquire for this.

## Symptom

A script's variables travel in the child's environment (`resolveScriptEnv`, `scriptRender.ts:144-174`),
which keeps them out of the file and the viewer — and the README admits the rest: *"a script can still
print its own variables"*. `detectSecretPrints` (`scriptRender.ts:195-214`) warns once; nothing masks.
A terminal command has no variables at all, so a token it needs is either typed into an argument row
(plaintext metadata, synced) or exported into every future terminal through an env binding. The
broker's `env` verb (`agentUseActions.ts:202-230`) is the same weakness for an agent: the value lands
in the window's terminal environment, readable by any later `printenv`, with no further consent.

## Goal

- A script variable's or a command argument's **value** may be a reference:
  `creds://<account-email>/<entity-name-or-path>/<field>` (`password`, `privateKey`, `publicKey`,
  `dbConnection`, `dbPassword`, `notes`, `totp`).
- **Run with Secrets** resolves the references from the vault into the **child process's environment
  only**, runs the entry in a terminal the extension owns, and **masks** every resolved value (and every
  script variable's value) in what the child prints — the `op run` pattern, without the value ever
  sitting in an ambient environment.
- The broker's `script` and `run` actions resolve the same references and mask the same values in the
  `stdout`/`stderr` they return, so an agent gets the `op run` class of tooling and the `env` verb
  becomes the documented weaker pattern.

## Where it plugs in (verified 2026-08-25)

| Concern | File | Today |
|---|---|---|
| Script run | `extension.ts:1405-1481` | `createTerminal({ env })` + `sendText` — no output access |
| Command run | `extension.ts:533-575` | `sendText(line)` into the default shell |
| Bounded spawn | `sshExecRunner.ts:85-165` (`runBounded`) | the only streamed `data` handler; feeds HTTP, not a terminal |
| Broker actions | `agentUseActions.ts:74-146` (`scriptRunAction`), `:148-185` (`terminalRunAction`) | trust gate, `runBounded` |
| Addressing | `storageManager.ts:98-105,179-189` | by id only; entity names are not unique |
| Field values | `envApply.ts:19-39` (`bindableFieldValue`) | the field → value table to reuse |
| Trust gate | `commandTrust.ts` | fingerprint of the exact body — reused, not duplicated |

## Design

1. **`secretRef.ts` (pure).** `parseSecretRef(text)`; `resolveSecretRefs(refs, source)` where the source is
   a small interface (`accounts()`, `nodes(accountId)`, `fieldValue(accountId, entityId, field)`). The
   account is matched by email (case-insensitive); the entity by exact name, or by a `Folder/Sub/Name`
   path when names collide. **Ambiguity is an error, never a guess** — names carry no uniqueness rule.
2. **`outputMask.ts` (pure).** `SecretMasker`: replaces every occurrence of each secret in a text stream
   with a `<CREDS_MASKED:…>` marker, holding back a tail of `longest − 1` characters so a value split across two chunks
   is still caught. Values shorter than 4 characters are not masked (the replacement would shred normal
   output); the rule is stated, not hidden.
3. **`runWithSecrets.ts` (vscode).** A `vscode.Pseudoterminal` that spawns the child (`stdio: pipe`),
   pipes stdout/stderr through the masker, forwards typed input to the child's stdin, and keeps the
   terminal open after exit so the output can be read. No TTY: interactive programs that need one are
   told to use *Run in Terminal*.
4. **Commands.** `credSshManager.runWithSecrets` on `:cmd` and `:script`. Scripts: same trust gate, same
   `resolveScriptEnv`, references resolved into the env. Commands: each referencing argument becomes an
   environment variable and the argument is rewritten to the shell's own read (`"$NAME"` / `%NAME%`), so
   no secret ever reaches argv.
5. **Broker.** `scriptRunAction` / `terminalRunAction` take a `resolveRefs` dependency and mask the
   outcome; `EnvExportResponseBody` stays, documented as the weaker pattern.

## Build order

1. `secretRef.ts` + tests (RED first), `outputMask.ts` + tests (chunk-boundary case first).
2. `runWithSecrets.ts` + the command + manifest.
3. Broker actions + `agentUseActions.test.ts`.
4. Docs + CHANGELOG.

## Test plan

- Parse: valid refs, percent-decoding, refusals (unknown field, missing segment, not a URL).
- Resolve: by email + name; by path when two names collide; ambiguous → error naming both; missing
  account / entity / empty field → distinct errors; `totp` yields the current code.
- Masker: single chunk, secret split across two chunks, two secrets, a short secret left alone,
  `flush()` releases the held tail.
- Command rewrite: a `creds://` argument becomes `"$NAME"` on POSIX and `%NAME%` on Windows, and the
  literal never appears in the line.
- Broker: a script that echoes a referenced value returns a `<CREDS_MASKED:…>` marker in `stdout`.
- **First test of the feature**: the resolved value appears in the child env and nowhere in the command
  line, the terminal name, or the audit line.

## Definition of Done

- [ ] `Run with Secrets` on scripts and commands; references resolved into the child env only; output
      masked live.
- [ ] Broker `script`/`run` resolve references and return masked output.
- [ ] Tests above green; `npm test` green.
- [ ] README (scripts, commands, agent section: `env` is the weaker pattern), `module_extension.md`,
      CHANGELOG updated; this plan promoted.
