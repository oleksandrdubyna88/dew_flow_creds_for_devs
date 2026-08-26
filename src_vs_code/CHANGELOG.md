# Changelog

All notable changes to **CredsForDevs** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **A crafted entity id could write a file outside the extension's key directory.** Four places
  build a file name out of vault data — the materialised private key, the VPN config, the
  per-entity `known_hosts`, and a script body — and an id such as `x/../../../../evil` resolved
  clean out of `keys/<pid>/`. The prefix some of them add (`script-`, `known_hosts-`) stops the
  obvious `../` and nothing more, because the prefixed segment is simply popped by the `..` that
  follows it.

  **Accepting a share was never a way in** — every accepted entry is given a fresh local id, on
  purpose — but **import and restore write an envelope's nodes with their own ids**, so a backup
  file someone is talked into importing, or a sync location an attacker can write to, puts an
  arbitrary id into the tree. Connecting to that entity then writes its private key wherever the
  id says.

  Every one of those names now goes through `safeFileComponent`, which cannot produce a
  separator and appends a digest of the original whenever it had to rewrite anything — so two
  different ids can never collapse onto one file, which would be the worse bug: two entities
  sharing a key file is a connection authenticating with the wrong credential. An ordinary uuid
  is passed through untouched. `vpnCommand.ts` had been sanitising its own name for this reason
  since it was written; the other four sites had not.


- **A caller with no token could make the window raise unbounded consent dialogs.** The CLI alias
  route (`creds ssh prod-db`) carries only a NAME, and names are not secret — so the consent modal
  is the whole of its authorization, which makes the RATE of modals a security property rather
  than a nicety. Twenty unauthenticated calls raised twenty dialogs: enough to make the editor
  unusable, and — the dangerous half — enough that the twentieth is the one somebody clicks
  through to make it stop. Now one prompt may be in flight at a time and at most five a minute,
  spent when **asked** rather than when answered, since a caller whose dialog is never answered
  has still consumed the window. Token calls are deliberately not throttled: a caller holding a
  real token was already consented by a human who chose to, and punishing them for a local
  process's behaviour would turn a defence into an outage.
- **A `creds` token never falls back to a discovered window.** The endpoint files that let a
  terminal find a window by name are readable — and forgeable — by anything with write access to
  the storage folder, and the health probe only proves the far end claims our service name, which
  a forger would. A token therefore always dials the port carried inside it, and an integration
  test now fails the moment somebody adds a helpful fallback that would deliver a bearer secret to
  whoever wrote the file.

### Added

- **A diagnostics channel you can actually attach to a bug report.** Until now the only output
  channel was the agent broker's, and every other failure — a sync that could not decrypt, a
  backup that could not be written, a transport that timed out — was a toast. A toast is right
  for interrupting you and useless afterwards: it is gone by the time anyone asks what it said.

  There is now a **CredsForDevs** output channel, and beside it a file per run at
  `logs/{date}/creds-{time}-{pid}.log` in the extension's storage folder. **CredsForDevs: Show
  Diagnostics** opens the channel and offers to copy the file path. Old runs are swept after
  two weeks, and a whole day folder goes at once so the folder never fills with empty ones.

  **No secret reaches it, and that is structural rather than a filter.** The log takes a source
  and a message; it holds no vault, no keychain handle and no way to obtain one, so a secret
  could only arrive if something formatted one in deliberately. A test drives the real failure
  messages against a vault whose every secret is a distinctive marker and greps the output for
  each of them.

### Security

- **The Depends-on picker had the same `</script>` break-out, in new code.** The picker's
  browser program interpolates the folder list, the entity names inside it, the colours in use
  and the saved rows into the entity form's one `<script>` element — with raw `JSON.stringify`,
  which leaves `<` untouched. A folder or entity named with that sequence closed the script
  early and the rest of the form's code was parsed as markup.

  Reachable exactly as the first one was: those names come from a **synced** vault, a colleague's
  shared entry, or a restored backup.

  Fixed the same way, and this time the cause is fixed too. `webauthnPrf.ts` also carried its
  own hand-rolled copy of the escape — correct, but a duplicate sitting one import away from the
  shared one — and now uses `jsonForScript` like everything else. A new test
  (`scriptInterpolation.test.ts`) scans the whole source tree and **fails, naming the file and
  line**, on any `${JSON.stringify(…)}` interpolated into a template literal that is not on a
  short list of named, justified exceptions. This defect had been written three times by three
  different hands; it is now a red test rather than something a reader has to notice.


- **A stored value containing `</script>` could break out of the entity form's page script.**
  The form embeds three lists — command arguments, script variables and port forwards — into
  its inline `<script>` as JSON. `JSON.stringify` escapes quotes and backslashes and leaves
  `<` alone, but an HTML parser ends a script element at `</script>` wherever it appears,
  string literal included. A value carrying that sequence therefore closed the script early
  and the rest of the form's own code was parsed as markup.

  These values arrive from a **synced** vault — a colleague's shared entity, or a restored
  backup — so this was never limited to text you typed yourself. The page's CSP
  (`script-src 'nonce-…'`) stopped an injected `onerror` from running, but `style-src` is
  `'unsafe-inline'`, so an injected element could still cover the form; and either way the
  form stopped working, because half its script had become text.

  Every `<` in those literals is now escaped as `\u003c` — still valid JSON, and it closes
  `<!--` at the same time. The escaper (`jsonForScript`) sits beside the shared HTML escaper,
  and all three places that interpolate into a page script now go through it: `webauthnPrf`
  was already doing this inline, and the entity viewer was safe only because the value it
  passes is a constant icon — safe by content rather than by construction. Found by a test
  written while covering the module, and the test fails against the unfixed code.

- **Vault format v4 — roll the extension out to every machine before any of them syncs.**
  A v4 file is written the next time a vault is saved, and a build older than this one
  cannot read it (*"Unsupported backup version: 4"*). Reading v3 and v2 keeps working
  forever, so no vault has to be converted by hand — but one updated laptop syncing to a
  shared folder locks out every colleague still on 0.58.x, exactly as the v3 step did.

  What v4 changes: **the envelope header is now bound to the encrypted payload itself.**
  The header (format, version, KDF and the owning account) is plaintext, and until now the
  only thing protecting it was a separate signature — a check the code had to *remember* to
  run. Forgetting it is not hypothetical: it is precisely the MAC-healing defect fixed on
  2026-08-25, where a tampered file was decrypted, merged and re-signed, and the fresh valid
  signature made the tampering look legitimate. Binding the header as AEAD associated data
  turns that from a branch into a property: on a shared folder, a file whose `account` has
  been rewritten to name someone else now fails to decrypt at all, in the cipher, whatever
  any caller remembered to check. The signature is still written, because it lets a reader
  spot tampering without unwrapping the master key.

  Two things are deliberately **not** bound, and both are load-bearing: the unlock **wraps**,
  because adding or removing a security key rewrites them around the same master key and must
  never re-encrypt the payload; and **shares**, because colleagues legitimately append those
  to a folder envelope. Binding either would turn an ordinary action into apparent tampering.

### Fixed

- **The context menu keeps up with the keychain.** Three ways the tree's cached per-entity
  flags could go stale, all found by an adversarial review of the 0.57 work and each now a
  test. A password saved in a **second window** of the same profile left this window's
  *Copy Password* missing until an unrelated edit — the extension now listens for the
  keychain change. Two flag refreshes running at once **raced**, and the walk that finished
  last won, so a slow one begun before an edit could put pre-edit flags back; refreshes are
  serialized and coalesced. And the revision cache was keyed by entity id alone while the
  password cache was keyed by account and id, so **two profiles holding the same entity id**
  (what a restore produces) showed one profile's versions under the other's row.
- **A share that fails to save no longer blames your PIN.** A storage failure part-way through
  importing an accepted share was reported as *"does not decrypt with that PIN"*, sending the
  reader back to retype a PIN that was correct while the real error was never shown.

### Internal

- **The size and complexity rules are now a linter, and the 3,100-line `activate()` began
  its diet** (audit A2 + A1). `npm run lint` enforces max-lines 800 / max-lines-per-function
  50 / complexity 4 / no-console in CI — pre-existing debt carries explicit
  `eslint-disable` markers, so a lint failure always means a NEW violation. Four subsystems
  moved out of `extension.ts` (3,106 → 2,594 lines), each with its own tests: the sharing
  conversation (`shareInbox.ts`), the security-key re-wrap/re-key arithmetic
  (`securityKeyOps.ts`), the viewers' shared secret ladder and db display
  (`viewerOptions.ts`) with the before-overwrite snapshot (`revisionSnapshot.ts`), and the
  error-to-sentence rule (`describeError.ts`) plus `StorageManager.exportSecretsFor`.
  No behaviour change intended anywhere; the suite grew from 635 to 659 tests and runs
  green on Windows and WSL.
### Added

- **Generate a secret instead of inventing one.** The form's Secret section makes
  passwords and passphrases; the SSH key section makes an Ed25519 pair. Strength is
  reported in **bits**, not as a coloured bar — a bar tells you how a designer felt.

  The passphrase list is exactly **256** words, which is what makes "eight bits per
  word" true rather than approximately true; the optional capital and trailing digit
  exist for sites that demand them and are deliberately not counted as strength.

  A generated key pair is drawn in the editor and saved straight to the keychain.
  `ssh-keygen` cannot do that — it writes a file by definition — and with *Add to SSH
  Agent* the key is then used without ever becoming one.

- **Import what you already have.** `~/.ssh/config`, and CSV or JSON exports from
  Bitwarden, 1Password, KeePass, LastPass and Termius. The file's content decides how
  it is read, so a misnamed export still imports; nothing lands before you have seen
  the count and what will be skipped; and every skipped row is listed with its reason
  rather than dropped in silence. Everything gets a fresh id, so an import can never
  overwrite what was already there.

  **KDBX is not read, on purpose.** KeePass's own database is Argon2-encrypted and
  Argon2 is not in Node, so a half-right implementation would be worse than none.
  KeePass exports CSV, which imports fine.

- **A health report.** Reused passwords (the finding nobody sees by eye, and the one
  that turns one breach into several), passwords under 60 bits, private keys in
  `~/.ssh` with no passphrase, and plaintext credentials in a workspace `.env` — with
  the `creds://` reference that fixes those.

  All of it runs on your machine. The one exception is opt-in and asks again each run:
  with `credSshManager.breachCheck` on, it can ask Have I Been Pwned whether a password
  appears in public breaches. What is sent is the **first five characters of its
  SHA-1** — one bucket out of a million — and the bucket is matched here, so the
  service cannot tell which password was asked about.

  No finding ever quotes the value that caused it: the report is meant to be pasted
  into a bug, and a report containing a password would be the leak.

- **The keyboard and the first five minutes.** `Ctrl+Alt+P` jumps to any credential by
  name across every account — matching exactly what the tree filter matches, so it can
  no more find a password by its value than the filter can. Plus bindings for filter,
  copy password, connect and lock; a welcome view and a four-step walkthrough for a
  clean install, which until now showed one "Search" row and nothing else; and a
  status-bar item for the lock, which is the state that decides whether background sync
  runs at all and could previously only be discovered by trying something.

- **An SSH agent that asks before every single use — and Git commit signing with it.**
  *Add to SSH Agent* on a stored key serves it from this window's memory over a socket
  of its own, and `SSH_AUTH_SOCK` is set in every terminal opened afterwards, so `ssh`
  and `git` find it with no configuration. The `0600` file the extension used to write
  for `ssh -i` stops existing: *Connect SSH* on an agent-served key passes no `-i` at
  all.

  Every use opens a dialog naming the key, its fingerprint and **what is being signed** —
  an SSH login as a named user, or a Git commit — because "a key is being used" is not
  a decision anybody can make. Allow once, allow that key for ten minutes (a push signs
  and authenticates in one breath), or deny. Every request is written down.

  *Copy Git Signing Config* gives you the `gpg.format ssh` lines with the public key
  inline, so Git signs commits with a key that exists in no file.

  Two things that were measured rather than assumed, and are why the feature works:
  the real `ssh-add -l` and the real `ssh-keygen -Y sign`/`-Y verify` — the exact
  mechanism `git` uses — are driven against the agent on Windows and on Linux/WSL in
  `npm run itest:ssh-agent`. And on Windows the signing config points `gpg.ssh.program`
  at the **built-in** OpenSSH: the `ssh-keygen` Git for Windows ships is an MSYS build
  that cannot reach a named pipe, and without that line Git fails to sign with nothing
  naming the cause.

  A key with its own passphrase is refused, with the `ssh-keygen -p -N ""` command that
  fixes it — OpenSSH uses bcrypt_pbkdf, Node has no implementation of it, and guessing
  at a KDF in a credential manager is the wrong kind of clever.

- **One-time codes (TOTP).** Paste an `otpauth://` URI or a base32 secret; the viewer
  shows the live code with a countdown, and the tree gains *Copy One-Time Code*. Steam
  Guard's five-character variant included. The seed is a secret like any other — OS
  keychain, synced inside the encrypted envelope — and **the webview never receives
  it**: what the panel is sent is the six digits, which expire on their own.

- **`creds://` secret references and *Run with Secrets*.** Write
  `creds://you@corp.com/prod-db/password` where a value would go in a command argument
  or a script variable. Running it resolves the reference into the child process's
  environment **only** — the command line carries `"$CREDS_REF_1"`, not the value, so it
  is not in the process list — and every appearance of that value in what the process
  prints is replaced with a `<CREDS_MASKED:NAME>` marker that names which secret it was, including one split across two writes.

  This is the half that was missing: a script's variables already avoided the script
  file, and the extension could only *warn* that a body might print them, because a
  normal terminal hands the child straight to the renderer and we never saw a byte.

  A reference that could mean two entities is refused, naming both, rather than quietly
  picking one — entity names are not unique, and a folder path disambiguates. The
  terminal it runs in has no PTY, so interactive prompts and progress bars behave as
  they do when piped; *Run in Terminal* is unchanged for those.

  The agent broker's `script` action masks what it returns too, which closes the same
  hole on that side. The broker's `env` verb stays, now documented as the weaker option
  rather than the only one.

### Changed

- **Vault format v3 — and every machine must be updated before any of them syncs.**
  A v3 file is written automatically the next time a vault is saved, and a build older
  than this one refuses it with *"Unsupported backup version: 3"*. That is a harder
  edge than the v1→v2 step, which only happened when somebody deliberately registered
  a security key: this one needs no action at all, so one updated laptop syncing to a
  shared folder can lock every colleague still on 0.43.x out of their own vault.
  **Roll the extension out to everyone first, then let anyone sync.** Reading v2 keeps
  working forever, so no vault has to be converted by hand.

  What v3 changes, and why it was worth a format bump:

  - **The payload key comes from HKDF instead of scrypt.** scrypt is deliberately slow
    because it guards a PIN a person chose; running it over a 256-bit master key buys
    nothing and cost a measured **240 ms of frozen editor** per vault read or write —
    on every sync cycle, on the single thread VS Code uses for typing. Reading a vault
    went from **256.3 ms to 0.21 ms**. PIN-bound derivations stay on scrypt, where the
    slowness is the whole point.
  - **The envelope MAC now signs the encrypted payload, not just the header.** v2
    signed `format`, `version`, `account` and `wraps` — everything except the
    secrets — so anyone who could write to a shared folder could splice an older
    legitimate payload back in, leave the header alone, and the integrity check still
    said it was fine while the vault silently reverted to pre-rotation passwords. No
    key, no PIN, no security key needed. Demonstrated before and after:
    v2 answered *ok* to a swapped payload; v3 answers *bad*.

### Changed

- **The listing describes the whole extension again.** It had drifted: terminal-command entries,
  environment-variable bindings, dated snapshots, starting and stopping a VPN, attachments,
  auto-lock and `Clone…` had all shipped without ever reaching the README, and the settings table
  listed 6 of 13 settings while the command list named 29 of 47. The first screen is now a table of
  everything the extension does — a Marketplace visitor has about two sentences of patience and one
  question — with the design rationale kept below it rather than in front of it. `qna` points at
  GitHub issues instead of the Marketplace's own channel, which nobody watches; `keywords` gained
  the features people actually search for. `categories` stays `["Other"]` deliberately: VS Code
  has no security or productivity category, and filing a credential manager under "Snippets" or
  "AI" to appear in a browsable list is mis-filing.

### Added

- **Share with Claude Code…** — an AI coding agent can now use an SSH credential without ever
  receiving it. Right-click an SSH entity, and the clipboard gets a paste-ready snippet: a grant
  token and the two commands an agent runs. It can execute a remote command (stdout, stderr and the
  exit code come back) or ask VS Code to open the interactive terminal for you.

  The agent never sees the password or the key. It has a token, and the token buys one thing: this
  window, which already holds the credential, runs `ssh` on its behalf — the password riding that
  child's environment through the same askpass mechanism Connect has used since 0.42.0. There is no
  endpoint that returns a secret, and no response shape with a field one could travel in.

  The token carries the broker's own loopback port, so the CLI reaches the exact window that minted
  it — no discovery file to go stale, no confusion with a second window. It lives in memory only:
  closing or reloading the window ends it. The first call asks you to Allow or Deny and shows the
  command about to run; after that calls are silent, but every one of them — allowed, refused or
  failed — is a line in the new **CredsForDevs: Agent Access** output panel. Only your Allow counts
  as you being present, so a long agent run never postpones auto-lock.

  Bounded on purpose: 256 KB of output per stream, 30 s per command (raisable to 120 s), 8 at a
  time, and every child killed when the window goes.

## [0.62.1] — 2026-08-26

### Fixed

- **A folder or entry name could break out of the entity form's script element.** The Depends-on
  picker interpolated the folder list, the entity names and the saved rows with `JSON.stringify`,
  which leaves `<` alone — and an HTML parser ends a `<script>` at `</script>` wherever it
  appears, inside a string literal included. A name carrying it closed the script early and the
  rest of the form was parsed as markup. Those names arrive from a **synced** vault, a shared
  entry or a restored backup, so it was never bounded by what the local user types.
  - Shipped in 0.62.0 and fixed within the hour. The fuller record, including the scan that now
    fails the build on any `${JSON.stringify(…)}` inside a template literal, is under Unreleased.

## [0.62.0] — 2026-08-26

### Added

- **Depends on — a relationship the vault can finally see.** An SSH host is unreachable without
  the VPN that opens its network; a password belongs to a database behind that same VPN. The
  vault held all three entries and nothing about the sentence joining them, so it was rebuilt
  from memory every time — usually while something was already broken. An entry now says what it
  depends on, in the edit form: a toggle, a folder, an entry, and a colour.
  - **Both ends are tinted with the same colour in the tree**, and the entry depended ON grows a
    second twisty — *Depended on by* — listing what needs it, grouped by folder and showing only
    the dependents, never the folder's other contents. Each of those folders carries a button
    that takes you to where it really lives.
  - **The colour belongs to the entry being depended on, not to the link.** Point a second entry
    at the same VPN and it inherits the colour with nothing to choose; change it once and every
    entry depending on that VPN follows. There is no propagation step and no copy to drift,
    because the dependents never store a colour at all.
  - The new twisty sits **beside** the version history rather than replacing it — an entry can
    have both open at once, and that is a test rather than a hope.
  - An entry shown under *Depended on by* is the entry, not a picture of it: Edit, Connect, Copy
    Password and the rest of its menu work there. Dragging is the one thing that does not.
  - A dependency whose target is deleted is **kept, not swept** — the row says the target is no
    longer in the vault, and a sync that brings it back restores the relationship. Sharing an
    entry strips its dependencies: they name entries in your vault, not the recipient's.
  - Ten colours, each contributed with dark, light and both high-contrast variants, so what is
    readable is the theme's arithmetic rather than a hex chosen once in a dark editor.

## [0.61.0] — 2026-08-26

### Added

- **A name a terminal can use.** *Enable CLI Access…* on an entry gives it an alias, so
  `creds ssh prod-db -- uname -a` works instead of pasting a token. **The registry stores only
  which entry a name points at — never a token, never a secret.** An alias says WHICH; the
  consent modal still says WHETHER, and the grant it mints still dies with the window.
  - Said plainly, because it is a real trade: before this, using a credential required a secret
    you had copied. It now requires knowing a name, and names are not secret. The modal becomes
    the load-bearing guard — backed on POSIX by the broker socket's `0600`, and on Windows by
    the modal alone. That is why an alias is opt-in per entry rather than automatic.
  - No token is ever returned by the alias route: the caller gets the ACTION, never a reusable
    capability it could pass on.
- **Windows announce themselves** in `<globalStorage>/endpoints/window-<pid>.json` so a terminal
  can find one without a token. The file holds a port, a pipe and a pid — nothing anyone on the
  machine could not enumerate anyway. A crashed window cannot delete its own note, so nothing
  trusts the file: the unauthenticated health probe decides, exactly as it does for a token.
- **The CLI works inside WSL with no configuration at all.** The Linux binary detects WSL and
  hands the whole call to the Windows binary through interop, relaying its streams and exit
  code. No mirrored networking, no firewall rule, no `npiperelay`+`socat` — and nothing starts
  listening anywhere new, which is the part that matters for a credential broker.

## [0.60.0] — 2026-08-26

### Added

- **The broker listens on a unix socket (POSIX) or a named pipe (Windows) as well as its
  loopback port.** The prerequisite for reaching it from WSL and for the `creds` CLI, and it
  pays for itself locally first: on POSIX the socket is `0600`, so the operating system refuses
  another user before a byte of ours runs. The loopback port never had that — any local process
  may connect to a port, and only the grant token stopped it. On Windows the named pipe carries
  the default DACL, which we neither set nor can set through Node, so there it is a convenience
  and not a permission boundary; the code says so rather than implying otherwise. **The grant
  token is still required on both** — this is defence in depth behind it, never a replacement.
- **The wire contract is now a generated file, `contract/broker-v1.json`.** Emitted from
  `brokerProtocol.ts` by `npm run contract`, with a test on each side asserting its own tables
  match it. This exists because a second implementation of the protocol now does too: a client
  sending `vpn-up` to a renamed route, or reporting exit 95 where the other reports 0, produces
  no error anywhere — just an agent drawing a wrong conclusion in somebody's terminal.

### Fixed

- **A successful `env`, `vpn-up` or `vpn-down` reported itself as broker failure 95 and printed
  nothing.** The CLI special-cased `terminal` and treated every other answer as a command
  result, ending in "use its `exitCode`, or fail" — but `credential:exportEnv` answers
  `{written}` and the VPN actions answer `{opened}`, and neither carries an `exitCode`. An agent
  reading the code would conclude the export or the tunnel had failed. No test covered those
  three verbs, and the logic was unreachable from one, being inline in `main`; it is now a pure
  table keyed by verb, so an unhandled verb is a visible gap instead of a silent failure.
  A refused VPN action (`opened: false` — the call worked, the person declined) now gets its own
  code rather than 0, since exiting 0 would tell an agent the tunnel is up when it is not.

## [0.59.0] — 2026-08-26

### Added

- **Short-lived entries.** Any entry can be given a lifetime — 1 hour, 1 day, until VS Code
  closes, or until an agent has used it once — for the staging tokens, temporary keys and
  debugging passwords that nobody ever goes back to delete. When the time comes the entry is
  **really deleted**: the secret, its revision history, and a causal tombstone that carries the
  deletion to every machine that syncs. A "spent" flag was rejected deliberately — it would
  leave the old secret readable from history, present in the next backup, and, with no tombstone,
  silently resurrected by the next machine to sync.
  - "Until VS Code closes" is a **lease**, not a close handler. A window that crashes or is
    killed never runs a handler, and the entry it promised to destroy would then live forever
    holding a working secret — the failure would land in the one direction the feature exists to
    prevent. With a lease nobody has to run any code for the entry to die. Every window on the
    machine renews, so the label says "until VS Code closes" rather than naming one window: that
    is what the mechanism actually delivers.
  - The lease is machine-local and never rides on the entity, because every write to a node bumps
    its causal version — a lease stored in the record would republish that entry to the sync
    location once a minute for as long as a window stayed open.
  - An entry arriving from another machine is **adopted**, never swept on sight; deleting the
    unleased would destroy the other laptop’s live entry the moment it synced in.
  - Only the agent broker spends a one-use entry. Copying the password yourself does not, which
    is why the label reads "until an agent uses it once" rather than "one-time".
  - "Until an agent uses it once" is not offered for SSH **keys** and is dropped on write if it
    somehow arrives: the broker never serves a key pair, so nothing could ever fire the burn and
    the entry would sit in the vault forever while the label promised otherwise. A temporary key
    for a customer’s instance is the first thing anyone reaches for here.
  - Editing an entry keeps its lifetime exactly as it was ("Keep as is"), so renaming a one-hour
    token does not quietly give it another hour.
  - A sweep runs once a minute and on every window start — the start is what finds entries
    orphaned by a window that crashed. It stops entirely on a metadata fault, the same
    fail-closed rule sync uses: when the node list cannot be trusted, "expired" and "unreadable"
    look identical and one of those two answers destroys data.

## [0.58.3] — 2026-08-25

### Fixed

- **A git-synced vault could lose a write with no error at all.** One `GitTransport` is cached
  per location and a dozen places use it independently — the sync cycle, *Share with team*,
  accepting a share, *Add/Remove Security Key*, the backup scheduler — while only the sync
  cycle guarded against itself. Every read hard-resets the shared clone onto the remote, so a
  read that began while a write sat between writing its file and committing it **discarded that
  write**; the write then found a clean `git status`, concluded there was nothing to commit and
  **reported success**. Two first-time syncs could likewise both start a `git clone` into the
  same directory. Every operation that touches the clone now runs through a per-instance serial
  queue. The rejected-push contract was never wrong — it sees collisions *between* clones and
  was blind to collisions *inside* one.
- **An MSSQL password is masked out of agent output.** The masker extracted the password
  embedded in a connection string only when the string was a URL, so for MSSQL — stored as
  `Server=…;Password=…`, which is what the entity form builds and what people paste from Azure
  and SSMS — the bare password never entered the mask table. The whole connection string was
  still masked, which hid the gap until the password appeared on its own: a client error
  message, or `SQLCMDPASSWORD`, which is exactly what the query launcher puts in the
  environment of the process whose output is being masked. Both dialects now go through the
  one parser the launcher already uses, so the two cannot disagree about what the credential
  is.

## [0.58.2] — 2026-08-25

### Security

- **An entry's name could carry instructions into an AI agent's context.** *Share with Claude
  Code* builds a block of text you paste into an agent, and every line of it reads to the model
  as instruction. The entry's name was interpolated into that text — and a name is not always
  your own writing: it arrives with an accepted share (anyone who can write to a shared folder
  chooses it) or from an imported file, and any string is accepted, newlines included. A name
  ending the quoted phrase and opening a new line could therefore appear in the middle of the
  instructions, in the same imperative voice as the rest, telling the agent to fetch and run
  something. Nothing was ever executed by the extension; the target was the model reading the
  snippet.

  Names and targets in that snippet are now flattened to one line, their quotes neutralised so
  they cannot close the phrase they sit in, and bounded — none of which a display name has any
  legitimate need for. The vault still shows you the name exactly as it was sent, however odd:
  only this one destination treats text as instruction, so only this one sanitises. Both
  payloads are tests.

  Credit where due: a parallel session found the same *shape* of defect in its own work — an
  entity name reaching a shell command a person is told to paste — and flagged the pattern
  rather than only fixing its own instance. This is that pattern, in a different place.

### Added

- **Check Clipboard for Vault Secrets** and **Scan This File for Vault Secrets** — ask, and get
  an exact answer about what is in the clipboard, the open file, or the selection: which vault
  secrets are in it and on which line, never the value itself. There is no background watcher
  and the listing says why: VS Code offers no clipboard-change event, and Windows captures the
  clipboard at the moment of the copy, so anything continuous would be a promise the platform
  cannot keep.

## [0.58.1] — 2026-08-25

### Added

- The engine for **short-lived entries** — a lifetime of one hour, one day, this window, or one
  agent use. Not reachable from the UI in this build: the form, the sweep and the burn hook come
  next. What is settled here is the part that has to be right first — an expiry is a real delete,
  through the one path that also removes the entry's stored secrets and its version history, so it
  travels to your other machines like any deletion you make by hand.

### Security

- **Sync now refuses to run when this machine cannot read its own vault cache** — the most
  serious defect this release fixes, and one introduced by 0.57.0's own metadata sealing. If the
  device key stopped opening the sealed slot (a reset or restored OS keychain), the tree read
  back as empty while the tombstone and horizon records — which are not sealed — survived. The
  merge then did exactly what it is designed to do with that input: treated every entry on the
  sync location as an old deletion already collected, produced an empty result, and pushed it.
  That would have destroyed the copy at the sync location, and the pushed horizon would then
  have emptied every other machine on its next cycle. A keychain reset would have taken the
  whole vault with it, everywhere.

  A cycle now stops before the merge when the local cache is unreadable, says so once, and
  leaves the remote untouched — which is also the copy the data comes back from. The sealed
  slots are probed at activation rather than on first read, so the warning fires when it is
  true instead of never.

- **A refusal no longer expires into "unknown".** 0.57.0 gave tokens an idle lifetime and 0.57.2
  made a denial keep answering; together they undid each other. Nothing ever uses a denied
  token, so nothing resets its idle clock, and about an hour after someone pressed **Deny** the
  refusal was swept — after which the broker answered "unknown token" and any reasonable agent
  asked for a fresh one, reopening the dialog that was just refused. Status now outranks the
  clock in the single function every lookup goes through: a denial is terminal, an allowed grant
  still expires as intended.

## [0.58.0] — 2026-08-25

### Added

- **Sync through a private git repository.** A third place a vault can live, beside a shared
  folder and the Cred Vault Server: point an account at `git@github.com:me/vault.git` (GitHub,
  GitLab, Gitea, anything git speaks) and the encrypted file is committed and pushed on every
  change, pulled on every cycle. For a developer who already has a private repo and two
  machines, that is the whole setup — no service to run, no folder to share.

  The merge engine is untouched. Version vectors, tombstones and the causal merge already knew
  nothing about where bytes come from, so a git remote reuses all of it: the clone is a **cache**,
  every read fetches and hard-resets onto the remote, and a stale local copy can never win. A
  rejected push is this transport's `412` — reported, never forced, never retried in place; the
  next cycle re-reads, merges causally and writes then.

  Deliberate choices worth knowing before you turn it on:
  - **`git` must be on PATH.** The extension has no runtime dependencies, so there is no
    embedded git library — the system binary is the only option, and its absence is reported as
    itself rather than as a mysterious sync failure.
  - **Commit messages say nothing about your vault.** Only an account-hash prefix and a
    timestamp. A repository's log is readable by anyone who can read the repository, and
    "renamed prod-db" in a subject line is metadata the encryption was supposed to cover. What a
    reader can still infer is *activity*: when a vault changed, and how often.
  - **Deleting a vault removes the file, not the history.** Git keeps every commit; a deletion
    means "no longer current", not "never existed".
  - Authentication uses an SSH key you already store in the vault
    (`credSshManager.gitDeployKeys`), materialized into the same private `keys/` folder the SSH
    features already purge — or, if you configure nothing, whatever your machine's git is
    already set up to do. A token is never placed in a URL or in a child's environment.

### Fixed

- **Git would have corrupted every vault it stored on Windows.** Found the first time the new
  transport ran against a real repository rather than a mock: git's default is to rewrite line
  endings on checkout, so a vault written on one machine came back with different bytes on
  another — the file plainly present, the comparison plainly failing. Every invocation now
  forces `core.autocrlf=false`, and a `.gitattributes` marking `*.enc` binary is committed with
  the branch so *other* clients — a colleague's clone, a web UI, a CI job — cannot reintroduce
  it. This is the defect that justifies the integration test existing at all.

## [0.57.3] — 2026-08-25

### Security

- **Secrets are masked out of the output the agent broker returns.** The broker's promise is
  that an agent can *use* a credential without receiving it, and no response shape has a field
  a secret could travel in — true of the shapes, and not of what `stdout` carries. An agent
  that composes a command can make it print the very value the broker supplied to run it, and
  the bytes went back verbatim. Every response now passes through one masking point on its way
  out, so the value is replaced by `<CREDS_MASKED:DB_PASSWORD>` — the name from the entry's own
  environment binding where it has one. It covers every action, including any added later,
  because it sits below all of them.

  Exact, never a guess: only values actually stored in the entry the grant points at, in the
  forms output really carries them (plain, percent-encoded inside a URL, base64, and a private
  key by its body so reformatting cannot hide it). No entropy heuristics and no
  "looks like a token" patterns — a false positive would corrupt a diff or a JSON payload the
  agent then acts on, which is worse than the leak, because it is silent and wrong rather than
  absent. Values shorter than eight characters are left alone; masking `1234` would replace
  every line number in the output.

  Scoped to that one entry rather than the whole vault, deliberately: a table over every
  unlocked secret would mean a keychain read per secret on every agent call, the cost class
  removed from the tree and the sync cycle in 0.57.0. Turn it off with
  `credSshManager.maskAgentOutput`. The audit line records how many values were masked, never
  which.

  **What it does not cover, stated plainly:** a file the agent reads with its own tools,
  anything you paste yourself, or a secret already in the model's context. It owns one channel
  — commands run through CredsForDevs — and claims no more.

### Added

- A test that fails when a command is contributed in the manifest with no handler behind it.
  VS Code does not check this: such a command appears in the palette like any other and fails
  with "command not found" when someone runs it. It scans the whole source tree rather than one
  file, so it keeps working while handlers move out of `extension.ts` into their own modules.

## [0.57.2] — 2026-08-25

### Fixed

- **A refused agent token said "unknown token" instead of "denied".** Pressing **Deny** settled the
  grant correctly — and then the next *Share with Claude Code* swept it away, because the registry
  deleted every refusal whenever it minted anything, reasoning that an unknown token is refused just
  as well. It is not the same answer: denied means a person said no and retrying is pointless;
  unknown means the token is not recognised, so an agent's obvious next move is to ask for a fresh
  one — reopening the very dialog that was just refused. Refusals are now kept as bounded tombstones
  (64 of them, oldest dropped first), so a Deny keeps meaning Deny for the life of the window.

### Fixed (tests)

- **Three assertions about decrypted key material were not testing anything.** The broker's
  integration test looked for `*.key` in `keys/` without recursing, but materialized keys have lived
  in `keys/<pid>/` since each window got its own directory — so the helper always returned an empty
  list. One check could therefore never pass, and the two around it — *leaves no decrypted key on
  disk* and *no key material is left* — could never fail. The production code was correct
  throughout; the test was blind. It now walks the tree.

- **The integration test runs in CI.** It drives the real broker over real HTTP and spawns the real
  CLI, and it ran nowhere automatic — which is how both defects above reached released builds and
  stayed. `npm run itest:server` stays manual on purpose: it needs a Cred Vault Server started by
  hand, and a step that fails for a missing server teaches people to ignore red.

## [0.57.1] — 2026-08-25

### Performance

- **The extension ships as one bundled file.** `vsce package` now bundles the compiled output
  with esbuild (`dist/extension.js` plus `dist/agentCli.js` for the agent CLI) instead of
  shipping 98 separate compiled modules. Cold module load — the file walk VS Code performs
  before it can call `activate()` — drops from a median **49 ms to 23 ms** (15 fresh Node
  processes each way), and the shipped code shrinks from 892 KB in 98 files to 584 KB in one.
  The bundle is built **from the same `out/` tree the tests run against**, so what ships is a
  concatenation of exactly what was tested; `npm test` and both itests keep using `out/`
  unchanged. Development note: `main` now points at `dist/`, so an Extension Development Host
  (F5) run needs `npm run bundle` first.

## [0.57.0] — 2026-08-25

### Fixed

- **Unlocking no longer freezes the editor.** scrypt at N=2¹⁷ ran on the extension-host
  thread — about a second with no typing, no IntelliSense, no other extension's callbacks —
  every time a PIN opened a vault or a PIN wrap was written (set PIN, add/remove a security
  key, a v1→v3 upgrade, a backup restore). Those paths now derive the key on Node's worker
  pool. Same bytes, same format: a vault sealed one way opens the other, and a test proves it
  in both directions.
- **The account icon updates after Add / Remove Security Key.** Both handlers cleared the key
  cache and triggered a sync, but the sync cycle repaints the tree from the *stale* readiness
  map; the icon and its reason stayed wrong until Sync Now, Lock or Unlock. Both now refresh
  readiness themselves.
- **View Details opens the real viewer.** The old QuickPick knew only the SSH fields, so a VPN,
  database, script or command entity opened as `Host —` / `Password — (not set)` and read as
  broken while double-click showed everything. One surface now; the QuickPick is gone.
- **The form is usable from the keyboard.** Name has focus when the form opens (the sticky
  Save/Cancel bar had put Save first in the Tab order), Esc cancels, Ctrl/Cmd+S saves, and the
  validation line is announced to a screen reader (`role=alert`). Esc closes the viewer.
- **Dragging a mixed-profile selection says what it dropped.** The bulk actions already
  reported skips; a drag that silently kept only the first profile's rows was the exception.
- `Reset Google OAuth` has a menu entry on the account row (it was palette-only). The README no
  longer hard-codes a command count that had drifted.

### Security

- **The local metadata cache is encrypted at rest.** Every secret *value* has always lived in
  the OS keychain — but the tree itself (hosts, users, ports, every CLI argument and its note,
  the names of bound env variables) sat in `globalState`, a plain SQLite file in the VS Code
  profile: a complete topology map for anyone holding a stolen disk or a profile backup, no
  keychain required. The node slots are now sealed with AES-256-GCM under a per-device key kept
  in the keychain, with the storage slot bound as AAD so one account's blob cannot be presented
  as another's. Existing plaintext slots are sealed on the first activation; the tree stays
  visible whenever the OS session is unlocked, exactly as before. If the keychain is ever reset,
  the cache reads as empty with one explanatory message — and repopulates from the next sync;
  nothing is lost but the local copy.

### Performance

- **The tree stopped talking to the OS keychain.** Expanding a folder used to make one
  SecretStorage read *per row* just to decide whether "Copy Password" belongs in the
  context menu — **300 keychain reads for a 300-entry folder, measured; now 0**. The flag is
  cached on the provider and refreshed with the history flags, in one walk.
- **The filter got a debounce and a memory.** Keystrokes repaint after a 50 ms debounce — the
  term itself applies immediately, so Escape cannot be overtaken by a late keystroke — and
  **five keystrokes now repaint once, not five times**. The filter walk memoizes per-term
  verdicts until the tree changes, and `getNodes`/`getChildren` validate and sort once per
  actual change instead of on every call: **a hundred repeated reads went from 13.9 ms to
  0.08 ms**, a filter render pass over 1,000 entities from **4.3 ms to 1.6 ms**.
- **An idle sync cycle costs nothing.** It used to rebuild the full local snapshot — seven
  keychain reads per entity, **7,000 for a 1,000-entry vault** — and canonical-serialize it
  three ways, every five minutes, to discover nothing had changed. The cycle now skips the
  snapshot **and the merge** whenever a local change token and the remote bytes both still
  match the last cycle that found the two sides identical; any local edit, another window's
  write, or a changed remote file misses the check and merges in full.

  All numbers: `scripts/tree-perf-bench.cjs`, run against the previous build and this one on
  the same vault shape (1,000 entities, 300 in one folder).

### Changed

- **Share with Claude Code tokens expire.** A token used to live exactly as long as the window
  — so one pasted into an agent transcript that outlived the task kept buying unattended access
  for days. Two settings now bound it: `credSshManager.agentGrantIdleMinutes` (default **60**;
  a token an agent is using stays live, one it forgot about goes dead) and
  `credSshManager.agentGrantMaxCalls` (default 0 = no cap). An expired token is refused with a
  message that says so and why, instead of "unknown token". Closing the window still ends every
  token.
- **The consent dialog says what an Allow covers.** Consent is per grant, so one Allow given for
  "open a terminal" also authorised every future command on that host — and the dialog only
  ever named the triggering action. It now lists every action of the kind, and the lifetime
  limits in force.

## [0.56.1] — 2026-08-25

### Security

- **The agent broker refuses database client meta-commands.** The broker's promise is that an
  agent can *use* a database credential without ever receiving it: the password rides the child
  process's environment (`PGPASSWORD`, `MYSQL_PWD`, `SQLCMDPASSWORD`), never the response. But
  every SQL client has a client-side command language that runs *local* programs — psql's `\!`,
  mysql's `\!` / `system`, sqlcmd's `:!!` — and a shell started that way inherits that
  environment. So `\! echo $PGPASSWORD` was a syntactically valid "query" whose stdout *was* the
  password, returned to the agent verbatim, with no further consent after the first Allow.
  MongoDB had been refused outright for exactly this reason (`mongosh --eval` can read
  `process.env`); the other three were not checked against it.

  Now: postgres refuses any line starting with a backslash; mysql refuses any backslash at all
  (its client executes `\!` wherever it appears outside quotes) and the long-form client words
  (`system`, `source`, `tee`, `pager`, `edit`…) at a statement start; sqlcmd refuses lines
  starting with `:` or `!!` and is run with `-x`, because it resolves `$(NAME)` from its
  scripting variables *and then from the environment* — `select '$(SQLCMDPASSWORD)'` would have
  printed the password as plain SQL. Each refusal tells the agent the rule, so it sends SQL
  instead of retrying variants. Shape rules, not sanitizing, as with `isSafePostgresUri`.

  Found by the security pass that compared the broker against its own stated invariant.

## [0.56.0] — 2026-08-25

### Added

- **History is in the tree.** An entry with previous versions now has a twisty: open it and
  its kept versions are rows underneath, newest first, each labelled with when it was replaced
  and what it was called then. A single click on a version opens the read-only viewer **on
  that version** — every field and every copy button reads the old value, never the current
  one. Run in Terminal, Copy Command and Show Command work on an old version of a command
  exactly as on the current one, and **Clone** from a version brings it back as a new entry.
  Nothing else is offered on a version — no Edit, no Share, no Copy Password, and no writing
  its secret into a terminal variable (an old password in a live variable is a trap with a
  plausible name): a version is something to look at, run, or clone from, never something to
  change.

  The tree keeps only the *heads* of the history in memory — date, name, metadata. The old
  secret is read from the keychain at the moment you act on a version, and not before.

- **Save and Cancel moved to the top of the entity form**, above the heading, and stay there
  while you scroll. A terminal command with a dozen argument rows, or a script with its
  variables, put them below the fold; saving meant scrolling to the bottom to find out where
  they had gone. The validation message travels with them for the same reason — "I pressed
  Save and nothing happened" is exactly what it exists to answer.

### Fixed

- **The Created / Last changed fields were white boxes in a dark theme.** They were the only
  inputs without a `type` attribute, and the form's styling selected inputs by type — so those
  two got the browser's default. Inputs are now themed by exclusion (everything but checkbox,
  radio and file), and a read-only field looks read-only: same box, dimmer text, no caret.

### Also true, and now pinned by tests

- **A clone has no history.** A clone is a new id and history is keyed by id, so the copy starts
  with an empty past — exactly as it starts with no secrets.
- **Accepting an update of something already accepted from the same sender** (choosing *Update
  it*) records the current version into history first and makes the incoming one current, under
  the same id and in the same folder.

## [0.55.0] — 2026-08-25

### Added

- **A filter at the top of the tree.** The first row of the sidebar, above your first
  account, is a search row: click it and type, and the tree narrows as you type. Folders
  that contain a hit stay (and open themselves, so the hit is visible rather than behind a
  twisty); a folder matched by its own name shows everything inside it; accounts with
  nothing matching drop out entirely. The row itself says what it is filtering by and how
  many entries survived — `nothing matches` instead of an empty panel that looks broken.
  The **×** on the right clears it, and the row never disappears, even when the filter hides
  everything else: a clear button you cannot reach is worse than no filter at all.

  Several words are an AND, in any order: `prod api` finds the row that is both. Matching is
  against what the row already shows you — name, user, host, port, database or VPN type, the
  saved command and its note, a key path. **Never against a secret.** Not the password, the
  private key, the connection string, the VPN config, the notes or a script variable's
  value: a filter that matched those would confirm a password's contents one keystroke at a
  time to anyone sitting at an unlocked window, without opening an entry and without leaving
  a trace anywhere a revealed secret is recorded. If the row does not say it out loud,
  typing it will not find it.

  A tree in VS Code cannot hold a real text field — the API takes rows, not widgets — so the
  row *is* the field: clicking it opens an input that filters live, Enter keeps the filter,
  Escape puts back whatever was filtered before.

### Changed

- **One notification for locked vaults instead of one per account.** With three accounts
  auto-sync raised three popups, stacked in the corner, each covering the previous one's
  buttons — and with four the last was off-screen. It is now a single message that *names*
  every locked vault rather than counting them away, with one **Unlock…** button that asks
  which one and then offers that vault the same choice as before (Set Sync PIN / Unlock with
  Security Key). A single locked vault reads and behaves exactly as it always did.

## [0.54.0] — 2026-08-25

### Changed

- **Every vault is v3 now — the slow v1 format is retired, PIN-only included.** A PIN-only
  vault used to stay on v1, whose payload key is `scrypt(accountId + PIN)` with a fresh salt
  per file — so the derived key could never be cached and scrypt (~1 s, ~128 MiB) ran on
  **every read and every write**, freezing the editor on each auto-sync cycle. v3 seals the
  payload under a random master key (cheap HKDF) and stores that key once in a **pin-wrap**;
  unlock runs scrypt a single time and everything after is fast. Until now v3 appeared only
  when you registered a security key.

  There is no v1 write path any more:

  - a **legacy PIN-only vault migrates to v3 on its next sync** — the same PIN still opens it
    and every secret is preserved (the migration only runs after a good decrypt, so a wrong
    PIN can never overwrite an unreadable file);
  - a **brand-new PIN-only vault is v3 from its first write**;
  - **backups convert too**, on their next run — a backup keeps its own standalone backup PIN
    as a self-contained pin-wrap, and dated snapshots (which copy the vault's ciphertext) are
    v3 the moment the vault is. Changing a PIN also upgrades the format.

  Reading a legacy v1/v2 file keeps working forever — the upgrade is lazy, never a forced
  rewrite of a file you might not be able to reach. As with any format bump, **update every
  machine before anyone syncs**: an older build refuses a v3 file outright.

### Fixed

- Ten security, performance and resilience findings from a post-merge review of the agent
  broker / signatures / scripts / scope work — see `research/SECURITY_REVIEW_2026-08-25.md`.
  Highlights: a psql option-injection on the agent DB path is refused; an auto-lock/sync race
  that could seal an undecryptable vault, and a non-atomic backup that could truncate the live
  file, are both closed; the accept-all and idle-sync scrypt storms no longer freeze the
  editor; a server-advertised OAuth scope is validated before a token is minted for it; a
  detected vault tamper now pauses sync instead of healing itself into a valid file.

## [0.53.2] — 2026-08-25

### Fixed

- **The entity form showed every kind's fields at once, and the Type it opened with was
  wrong.** One broken string literal in the form's page script — an escaped newline that
  collapsed to a real one while the file was being edited — stopped the whole script from
  parsing. Nothing in the UI said so: what you saw was General, Connection, SSH key, VPN,
  Database, Terminal, Script and Secret all stacked in one window, because the code that
  hides the irrelevant ones never ran. The same dead script is why the folder's type was
  not applied, why the script editor had no highlighting, and why pasting into the script
  box left text you could only see by selecting it.

- **`Script` was missing from the Type selector entirely.** The list of kinds was written
  out by hand next to the table that already holds them, and it stopped at six. With no
  option carrying the `script` value, the browser fell back to showing the first one — so
  `+` inside a script folder opened a form calling itself *Credential — name + secret
  value*, and a script entity could not be created from the selector at all. The selector
  is now generated from the kind table, so an absent kind is impossible and an absent
  label is a compile error.

- **The script editor no longer hides your text when highlighting is unavailable.** The
  editor draws highlighted code on a layer under a transparent textarea; the textarea now
  only turns transparent once that layer has actually painted, and reverts if it stops
  answering. Highlighting also refreshes a frame after a keystroke instead of an eighth of
  a second, so what you type is never briefly invisible.

- **A database entity offered two identical rows reading "Expose in terminals as env
  variable".** Each row now names what it exports — the connection string, or the database
  password — and the password's row sits beside the password field instead of twenty lines
  above it, where it also split the connection string from its own hint.

### Added

- Tests that render both webviews for real and parse their page scripts, for every entity
  kind. A webview script has no compiler between the template string and the browser, so a
  syntax error in one has always been able to reach a user silently; that is now a red
  test. They also assert that the Type selector offers every kind and pre-selects a locked
  one, and that no two binding rows carry the same label.

## [0.53.1] — 2026-08-25

### Changed

- Documentation caught up with four releases of work: the listing now describes
  multi-select, dates and history, what happens when somebody re-shares the same item, the
  broker's five new kinds (and why MongoDB is refused), and the clipboard TTL setting. The
  security notes section states each finding of the plaintext audit and what closed it —
  including the one that had been introduced two releases earlier by the same hand that
  found it. No code changed.

## [0.53.0] — 2026-08-25

### Added

- **A re-shared credential offers to UPDATE the one you already have.** Accepting a share
  always minted a fresh local entry, so a colleague who re-sent the same credential six
  months later handed you a second copy beside the first with nothing saying which was
  current. Now the second one asks: **Update it** — in place, keeping its folder, its id
  and its history — or **Keep both**.

  **Dismissing that dialog leaves the share in "Shared with me."** Deciding needs a look
  at what you already have, and consuming the item to ask the question would destroy the
  only copy of the decision.

  How it knows, and why a sender cannot abuse it: the map is **local to this machine** and
  keyed by *(who sent it, what they called it)*. A sender can never address an entry they
  never sent you, which is exactly what the original always-a-fresh-id rule protected
  against — that protection is intact.

- **Created and last-changed dates on every entry**, shown in both the viewer and the edit
  form. `createdAt` is stamped once and never moved again, so "when was this made" survives
  every later edit. Entries that predate this release honestly say the creation date is
  unknown rather than inventing one.

- **The last 3 versions of an entry are kept**, and the tree says so: an entry with history
  wears a **blue-tinted icon**. The viewer lists each kept version with when it was
  replaced, what it was called then, and a button to copy that version's secret — through
  the extension host, like every other secret.

  Two limits, stated rather than discovered: a revision does **not** include attachments
  (three copies of a 4 MB file per entry would cost more than the history is worth), and
  history is **local to this machine** — it is not in the sync bundle, so another machine
  keeps its own. And one fact worth knowing before relying on it: history means a replaced
  password stays retrievable. That is the point, and it is why revisions live in the same
  encrypted store as the current secrets and nowhere looser.

## [0.52.0] — 2026-08-25

### Added

- **"Share with Claude Code" now covers every kind that has something an agent can
  usefully do** — scripts, terminal commands, credentials, VPN tunnels and databases —
  not just SSH. The consent model is unchanged: the first call asks, Allow covers that
  token for the life of the window, every call is audited.

  Per kind, and the reason each is shaped the way it is:

  - **`script run` / `terminal run`** — the request body is **ignored**. What executes is
    exactly what a human saved, so no agent text ever reaches an interpreter or a shell.
    Both also require the content to have been vouched for on this machine already: the
    broker's consent is per *token*, so it would not re-ask after a sync replaced the body.
  - **`db query`** — the agent sends SQL; the extension spawns `psql` / `mysql` / `sqlcmd`
    with the password in the environment variable that tool's own documentation names, and
    only host, port and database ever reach a command line. **MongoDB is refused**, and
    that is the interesting one: `mongosh` has no password environment variable and its
    `--eval` runs in the same JavaScript interpreter that can read `process.env` — so a
    "query" could print the password straight back. A capability that leaks by design is
    worse than an absent one.
  - **`credential env`** — writes the entity's bound variables into this window's terminal
    environment and answers with the **names**. Honest about its narrowness in the consent
    text: a shell living outside VS Code gets nothing from it.
  - **`vpn up` / `vpn down`** — deliberately not a captured child. The tunnel needs
    administrator rights, and no headless process can answer a UAC dialog; it opens the
    same terminal the human Start button opens, and the agent learns only that.
  - **SSH keys are excluded on purpose** — a key means nothing except attached to a host,
    and the host entity already has `exec`.

  The share menu is now gated by one computed `:shareable` flag rather than a regex trying
  to express five inclusions and one exclusion. The bounded spawn (byte caps, timeout,
  SIGTERM→SIGKILL, abort on window close) was extracted so every kind shares one child
  launcher; the SSH path is byte-for-byte unchanged and its integration suite still passes.

## [0.51.0] — 2026-08-25

### Added

- **Ctrl / Shift multi-select in the tree**, with three actions that work on the whole
  selection: **Delete**, **Export / Share Externally…** and **Share with…**. One
  confirmation, one recipient pick, one PIN, one file — for however many rows are
  selected. Everything else still acts on the row you clicked.

  Three rules the selection goes through first, none of which a menu could enforce —
  VS Code evaluates a `when` clause against the clicked row only, never the selection:

  - rows that are not folders or entries (an account, a team member, an inbox item) are
    left out and counted;
  - the clicked row decides the profile; rows from another profile are left out and
    counted, because ctrl-clicking across two account roots is an ordinary gesture rather
    than an error;
  - a folder swallows anything of its own you also selected, at any depth. That one is
    silent: selecting a folder together with something inside it is a normal shift-click,
    and a warning about it would fire on every second use.

  Deletion runs sequentially, deliberately: every storage write is an unlocked
  read-modify-write of one array per profile, so two in flight would race and the later
  write would silently drop the earlier deletion.

## [0.50.0] — 2026-08-25

### Added

- **The server tells the extension which scope to ask for, so a developer configures
  nothing.** Microsoft sign-in only works against a vault server if the extension asks
  Entra for that organisation's own API scope; ask for `user.read` and what comes back is
  a **Graph** token, which Microsoft deliberately makes unverifiable by third parties, so
  every server refuses it with 401. Until now the value had to be pasted into each
  developer's `settings.json` by hand, and the symptom when somebody did not was an empty
  Team with no error at all.

  A server running **0.2.3 or newer** now publishes the value on `GET /api/client-config`,
  and the extension reads it and configures itself. Sign in, point at the server, done.
  `credSshManager.microsoftApiScope` still exists and still **wins** when set — the escape
  hatch for a server advertising the wrong value, and the rule that a person who typed
  something is never silently overridden by a machine. Discovery is best-effort with a 5 s
  deadline and its answer is cached per location, negative answers included: an older or
  unreachable server leaves sign-in exactly where it was.

### Security

Every plaintext-leak point found in a full audit, closed or honestly bounded.

- **Script variables never enter the script text again.** They were substituted into the
  body, and that body was written to disk and rendered in the viewer — so a script whose
  variable held a token put the token in both places on every run. The values now travel
  in the **process environment** and the body reads them by name in its own language's
  syntax: bash needs no change at all (`${NAME}` already is that), PowerShell gets
  `$env:NAME`, Python `os.environ.get(...)` with its import added only when something was
  actually translated, JavaScript `process.env.NAME`. The file, the viewer row and
  *Copy All* now carry names where they used to carry values.

  A consequence, deliberate: a script runs in a **fresh terminal** each time, because
  VS Code can only set a terminal's environment when it is created — a reused one would
  run with the previous entry's values. Same reasoning the SSH password path already had.

- **A script can still print its own variables — so it says so.** Env injection cannot
  stop `echo "$TOKEN"`; that is your code. A narrow heuristic notices a direct print of a
  variable that carries a value and asks once per exact script body. Passing a variable to
  a tool — the normal case — is not flagged.

- **Scripts got the same content-trust gate saved commands have had.** A script arriving
  through sync or a shared item is one click from running; the first run of an exact body
  now shows it and asks. Editing it asks again; re-running the approved one does not.

- **The env-variable check button no longer prints the value.** It echoed `NAME=value`
  into the terminal — a bound private key went into scrollback in full, visible on a
  shared screen. It now reports `NAME: SET (len=1876)` or `NOT SET`, which answers the
  question it was built for. A name that is not a valid environment name is refused
  outright rather than interpolated into a shell line.

- **Windows file permissions are now real.** `chmod 0600` is nearly a no-op there — the
  inherited NTFS ACL still grants SYSTEM and the local Administrators group full control
  of everything written under the user profile. On a machine where you are not the
  administrator that is exactly the wrong audience. Every file the extension writes a
  secret into — installed keys, materialized keys, VPN configs, scripts — now has its
  inheritance broken and is granted to its owner alone. The code comments claiming `0600`
  protected these files were describing a protection that was not there.

- **Installing a key to `~/.ssh` says what it really does** — that this copy is permanent
  and outside the extension's housekeeping — and **`Remove Installed Key…`** now exists to
  take it back out.

- **Copy Connection String (no password)** joins the DB menu, and the full copy now says
  plainly that the password is included. The clipboard TTL is configurable
  (`credSshManager.secretClipboardTtlSeconds`), and its description states the part this
  extension cannot control: Windows Clipboard History and cross-device sync can capture a
  value the moment it is copied, and clearing the clipboard afterwards does not reach it.

## [0.49.1] — 2026-08-25

### Security

- **A script's secret variable values were rendered into the viewer, unmasked.** Shipped
  in 0.48.0 and fixed here. The "Script with variables filled in" row and every variable
  row wrote the real values into the webview's HTML on open, with no click — breaking the
  viewer's own documented invariant that secret values never enter it and that copy
  actions round-trip through the extension host. Every sibling row (password, connection
  string, DB password, VPN config) had always done it correctly; these two did not.

  Both are masked now and copy on demand through the host, like the rest.

### Fixed

- **The copy button on a script variable never worked.** It resolved against the terminal
  arguments array, which is empty for a script, so it reported "nothing to copy" on a
  variable that plainly had a value.

## [0.49.0] — 2026-08-25

### Added

- **Export for people outside the organisation.** Right-click a folder or an entity →
  *Export / Share Externally…*: a folder takes its whole subtree, secrets included —
  passwords, keys, VPN configs, connection strings, notes, attachments. Two forms:

  - **Password-protected file** (default): the vault's own scrypt + AES-256-GCM envelope
    under a password you pass to the recipient out-of-band.
  - **Plain JSON — deliberately unprotected**: for feeding other tools. Chosen through
    its own warning that says exactly what will be readable by anyone.

  *Import from External…* on an account takes either form back — password prompt for
  sealed files — and gives **every imported node a new id**: the sender's ids belong to
  the sender's tree, and colliding with your own nodes would corrupt the next sync
  merge. Round-tripped in tests and by drill: sealed, wrong-password refusal, plain.

## [0.48.0] — 2026-08-25

### Added

- **Scripts.** A new entity kind and a `scripts` folder in the default set (new accounts
  and Project folders pick it up automatically). The body is a **big editor with syntax
  highlighting** — language picked from a list (Bash, PowerShell, Python,
  JavaScript/TypeScript, SQL, YAML, JSON, Dockerfile), highlighted live while you type,
  by a small dependency-free highlighter whose one hard rule is that it escapes before
  it marks: a script containing markup can never become markup in the webview.

  **The changeable parts live in variables**: write `${NAME}` in the body and define the
  rows below — name, value, an explanation, and a tick to keep one without using it.
  The body stays generic; the viewer shows the raw script, every variable with its note,
  and the script **with variables filled in**, each with its own copy button.

  **Run Script** — the green triangle — substitutes the variables, writes the result
  into the extension's private storage (the same purged-on-exit directory materialized
  SSH keys use) and executes it in a terminal with the right interpreter for the OS:
  bash, powershell/pwsh, python, node. SQL and the data formats are refused with a
  reason — piping YAML into a shell is not a Run button.

## [0.47.0] — 2026-08-25

### Added

- **Unlocking asks HOW, when there is a real choice.** A vault holding both a security
  key and a PIN, at the moment a person is about to be prompted anyway, now asks:
  *Touch the security key* or *Enter the PIN*. One way in goes straight there — a picker
  with one option is noise — and background sync is untouched: the stored PIN still
  opens silently, and a locked vault still refuses it.

  The whole unlock cascade moved into a pure, tested module (`unlockPlan`) — it had
  broken three times while it lived inline, and the question "who decides" turned out to
  be the part worth testing.

### Fixed

- **The v3 audit** (after 0.46.2's restore fix): *Remove Security Key…* judged the vault
  by `version !== 2` and would tell the owner of a current key-wrapped vault that no
  keys are registered. Now judged by the key slots in the file, same rule as restore and
  backup. Every other version comparison in the codebase was audited: the remaining ones
  are the in-memory key shape and the deliberate v1 branch, both correct for v3.

## [0.46.2] — 2026-08-25

### Fixed

- **Restoring a current backup asked for a PIN that could not open it.** Restore routed
  by `version === 2`; the wrapped format moved to version 3, and every key-wrapped vault
  fell into the "old PIN-only" branch — a PIN prompt on a file a PIN alone cannot open.
  Found by an operator's restore drill on a vault with a YubiKey registered the day
  before.

  Restore now routes by what actually decides the question — the presence of key slots
  in the file (`backupWriteMode`, the same rule Backup already uses) — so it keeps
  working when the version moves again. A genuine v1 file still gets the PIN prompt with
  its explanation from 0.46.1.

## [0.46.1] — 2026-08-25

### Fixed

- **Restoring an old backup explained nothing about why it asks for a PIN.** Restore of a
  v1 (pre-security-key) file asked for a "Master PIN/password" with no context — which
  reads as the YubiKey being ignored. The key slots live inside v2 files; a v1 file has
  none, so a touch cannot open it. The prompt now says exactly that, and that the PIN it
  wants is the one that was set when the backup was made. v2 backups keep asking through
  the vault's own slots — stored PIN, key touch, or typed PIN — as since 0.37.0.

## [0.46.0] — 2026-08-25

### Added

- **Project folders.** A new folder type in the picker: creating a *Project* folder seeds
  the account's whole default structure inside it — `db`, `vpn`, `ssh keys`,
  `ssh connections`, `passwords`, `terminal`, each with its type — so a client or an
  environment gets its own complete miniature of the vault in one step.

  A project dictates nothing to entities placed directly in it (it behaves like *Any
  type* there — `project` is a folder type, not an entity kind), and its subfolders
  enforce their types exactly as the top-level ones do. Renaming or deleting the seeded
  subfolders is yours to do; they are ordinary folders once created.

  Worth knowing: machines still on an older extension version will not recognise the new
  folder type until they update — update everywhere before creating project folders in a
  synced vault.

## [0.45.0] — 2026-08-25

### Added

- **A reminder when a vault has quietly stopped syncing.** An account with a sync
  location that has not had a successful sync for **3 days** gets a warning with a
  *Sync Now* button, repeated every **4 hours** until a sync goes through. The point is
  the quiet failure — a lock left on, a cleared PIN, an unmounted NAS, a server that
  stopped answering — where the off-machine copy stops moving and nothing else says so.

  The details that keep it honest: a successful sync silences it immediately (the repeat
  gate cannot outlive the thing it nags about); an account that never synced is measured
  from when this machine first saw it, so a just-added account is not nagged at minute
  one; accounts with no sync location are never nagged — nothing was supposed to move;
  and when the row knows *why* sync is failing, the reminder says the reason too.

## [0.44.0] — 2026-08-25

### Fixed

- **Selecting an account made it look signed out.** The green came from a themed icon,
  and VS Code repaints themed icons in the selection colour the moment the row is
  selected — so the state indicator vanished exactly while you were looking at it. The
  icon is an SVG file now (green signed-in / grey not), which selection does not touch.
- **The grey icon's reason never showed.** It was composed onto the row and then
  overwritten by the provider name one line later; the row now shows both.

### Changed

- **Sign Out / Remove Account left the row.** Two inline buttons sat a few pixels apart
  and one of them deletes the account — it now lives only in the right-click menu, under
  its own divider. The `+` stays.
- **Set Auto-Lock… in the account menu**: 1 / 3 / 5 / 8 / 12 / 24 hours, or *Only when
  the window closes* — with the honest note that the cached key is memory-only, so
  closing VS Code always locks regardless; the choice governs only the idle timer.

## [0.43.0] — 2026-08-25

### Fixed

- **Microsoft sign-in against a vault server always got 401 — by design of Graph
  tokens, not by any bug in the server.** The extension asked for `user.read`, which
  yields a Microsoft **Graph** access token, and Microsoft deliberately makes Graph
  tokens unverifiable by third parties. No server configuration could ever accept one.

  New setting `credSshManager.microsoftApiScope`: the API scope of your organisation's
  own Entra app registration (`api://<client-id>/vault.access`). With it set, the
  extension requests a token minted for **your** API — an ordinary validatable JWT the
  server pins with `MS_AUDIENCES`. The setting's description carries the one-time Entra
  setup, including authorising VS Code's client id for the scope.

## [0.42.1] — 2026-08-24

### Changed

- **The listing's server section reflects what actually ships now**: a ~50 MB Native-AOT
  image for amd64 and arm64 with no shell and no .NET inside; data, logs and certificates
  in host folders the operator chooses; and standalone binaries for Linux and Windows,
  x64 and ARM64, for machines where Docker is unwelcome. No extension code changed.

## [0.42.0] — 2026-08-24

### Added

- **Password SSH logins no longer make you retype the stored password.** ssh refuses a
  password on stdin — it asks the TTY, or, pointed at a program via `SSH_ASKPASS`, it
  asks the program. Connect now supplies ours: a static two-line script that echoes an
  environment variable, running in a terminal dedicated to that connection. The password
  itself is **never in a file, never on a command line, never in scrollback** — it
  travels only in that terminal's environment.

  Two details that took deliberate care: `SSH_ASKPASS_REQUIRE=force`, because inside a
  terminal ssh has a TTY and would silently ignore askpass without it (needs OpenSSH
  8.4+ — Windows 11 ships 10.x); and `-o StrictHostKeyChecking=accept-new`, because
  under `force` even the host-key *yes/no* question would be answered by the askpass
  program — with the password. A changed host key still refuses loudly, as it should.

  The terminal is fresh per connect: its environment carries *this* entity's password,
  and reusing one would start the new session with the previous entity's credentials.
  Key-based connections are untouched and still win when a key exists.

## [0.41.0] — 2026-08-24

### Fixed

- **A shared item said who sent it but not which of YOUR accounts received it.** With
  several accounts that is the half that matters: it decides which vault — and which
  sync PIN — accepting will involve. The row now reads `kind → your@account`, the
  tooltip names both directions, and the accept dialog says *from sender — into
  account* before asking for the PIN.

## [0.40.1] — 2026-08-24

### Fixed

- **The env-variable toggle floated between fields, belonging to neither.** Between
  *Private key* and *Public key* sat an "Expose in terminals…" row that could plausibly
  belong to either. Each row is now visually attached to ITS field — indented under it
  with an accent rule on the left — and a divider closes the group before the next field
  begins.

## [0.40.0] — 2026-08-24

### Added

- **Every entity, whatever its kind, can carry one encrypted file and one encrypted
  image.** *Additional file* takes the formats people actually attach — PDF, Office,
  text, data, archives — and refuses the executable family outright, including as the
  tail of a double extension (`invoice.pdf.exe`). *Additional image* takes the popular
  image formats. Both are capped at 4 MB, checked before anything is stored, and both
  live where every other secret lives: the OS keychain locally, the sealed vault in
  transit — sync, backups and snapshots carry them like passwords.

  In the viewer, only what is set appears: a stored file shows as a row with a save
  button; a stored image shows as a **200×200 preview** — click to zoom ×2, twice, a
  third click resets — with its own save button. The file name travels in plaintext
  metadata (like the VPN config's name already did) so the row can be labelled without
  opening the vault; the content never does.

## [0.39.0] — 2026-08-24

### Added

- **A `✓?` button next to each env variable opens a terminal and echoes it** — so the
  variable is *seen*, not trusted from a notification. The probe's spelling follows the
  actual default shell, not the OS: PowerShell gets `$env:NAME`, cmd gets `%NAME%`, and
  bash — git-bash on Windows included — gets `$NAME`; the wrong guess would print a
  literal `$env:NAME`, which reads as "not set" about a variable that is there. The
  terminal is always a fresh one, because the collection applies only to terminals
  created after the write — probing in an old one would "prove" the variable missing.

  Fair warning it carries: echoing prints the secret into the terminal scrollback.

## [0.38.0] — 2026-08-24

### Added

- **Secret fields can be exposed as terminal environment variables.** In Edit, each
  secret field — password, private key, public key, connection string, DB password —
  gains a toggle (off by default). Switching it on mints a name from the entity:
  entity *git key*, private key → `ENV_GITKEY_PRIVATEKEY`; edit it if you want another.
  Saving writes the value into every **new** integrated terminal, persistently.

  The viewer shows the variable's **name** with a copy button — only for fields whose
  binding is on; a field with the toggle off shows nothing about env at all — plus a
  **Set** button that re-writes the value on demand. That button is the recovery the
  feature was asked with: the collection can be lost, and re-setting by hand must not
  require re-saving the entity.

  What syncs is the **name** — it is not a secret. The value is written only on the
  machine pressing the button or saving, from that machine's own OS keychain, so a
  binding arriving via sync is a name waiting for a value, never a secret in transit.
  Renaming or disabling a binding deletes the old variable on save rather than leaving
  it set forever.

- **VPN entities now carry host / gateway, login, port, and a key or certificate.** The
  key goes to the OS keychain like an SSH private key; host, login and port live in the
  entity and travel only inside the encrypted vault. The viewer shows exactly the fields
  that are filled — an empty one adds no row.

## [0.37.0] — 2026-08-24

### Fixed

- **Import / Restore could not open any backup taken since a security key was
  registered.** It decrypted every file with the v1 recipe — scrypt of account + PIN.
  A vault with a key is a v2 envelope: its payload is sealed with the master key, and
  the PIN opens only the wrap holding that key, so the v1 recipe fails whatever PIN is
  typed. Signing in first was never the problem; it was just the gate before the real
  failure. Restore now reads the file's own version and opens v2 through the vault's key
  slots — stored PIN, a security-key touch, or the PIN typed — the same door sync uses.
  Old v1 backups keep restoring exactly as before.

- **`Start VPN` assumed `openvpn.exe` is on PATH. On Windows it never is.** The
  community edition installs into `Program Files\OpenVPN\bin` without touching PATH —
  so the composed command died with *"cannot find the file"*. The binary is now resolved
  first: PATH, then the known install folders, with the full path quoted into the
  command. When nothing is found, the message names every location that was tried.

- **OpenVPN Connect is recognised as what it is** — a different product, not a missing
  CLI. It does not take `--config`, and it may already be holding the tunnel up (which is
  exactly the machine this was reported from). Start now offers to *import the profile*
  into it and says plainly that connecting — and disconnecting — happens in its window.

- **Restore's sign-in offer no longer vanishes on machines without a Google client id.**
  The silent session probe throws there, and the exception skipped the "Sign in now?"
  dialog — the command told you to sign in and retry when it could have signed you in.

## [0.36.0] — 2026-08-24

### Fixed

- **Unlocking with a security key looped forever on a vault holding several key wraps.**
  Each registration mints its own PRF salt, but the unlock ceremony sent the FIRST wrap's
  salt for every credential. Whichever key the authenticator picked, unless it happened
  to be the first wrap's, the PRF came back computed over a foreign salt, the unwrap
  failed, and the dialog said "try again" — forever. A vault with exactly one wrap never
  shows it, which is why one account worked and the other did not: the second account's
  vault had collected several wraps from the repeated registration attempts of the
  pre-0.34.0 slot bug.

  Authentication now uses WebAuthn's `evalByCredential`, so every credential is offered
  its **own** salt and any registered key unlocks the vault regardless of which wrap is
  its.

- **An unknown credential now fails with an explanation instead of a wrong guess.** When
  the key answered with a credential the vault does not hold, the code silently fell back
  to the first wrap — which can only fail to decrypt. It now says what is wrong and how
  to clean the key up (`ykman fido credentials list` / `delete`).

  Housekeeping for the affected account: open *Remove Security Key…* — if it lists
  several entries for one physical key, the extras are the stale registrations; remove
  them, keep the newest.

## [0.35.0] — 2026-08-24

### Changed

- **The listing says what this is: a zero-trust credential manager.** Not a slogan — the
  page now states the property and why it holds. Secrets live in the OS keychain, anything
  that leaves the machine is encrypted in the editor under a PIN or a security key, and
  the folder or server holding the vault holds ciphertext. Whoever runs that storage,
  including its owner, cannot read it.
- **The README no longer recites internal planning documents.** It named `todo/PLAN_*.md`
  files that are not in the package and that a reader cannot open, to describe work that
  does not exist. The one thing worth keeping from that passage — that share metadata on a
  shared folder is protected by *using the server*, not by cryptography — is now said in
  its own right.
- Dropped the module map and the build instructions from the extension page: they describe
  the source tree to somebody reading a product description. The repository link at the
  bottom is how to reach them.
- **Added the part that was missing entirely: the server, and how to raise it.** Three
  commands with Docker, TLS by domain or by bare IP, and a prebuilt image so nothing is
  compiled on the box — plus links to the repository, the issue tracker and the deployment
  guide.

## [0.34.0] — 2026-08-24

### Fixed

- **Registering a security key claimed a NEW slot on it every time.** A discoverable
  credential is keyed by `(RP ID, user.id)`, and `user.id` was 16 fresh random bytes at
  each registration — so re-registering the same account never replaced its own
  credential, it added another. A YubiKey 5 holds roughly 25 of them, cannot be told to
  drop one from here, and a **full authenticator refuses `create()` outright**, which is
  what "it just keeps asking" was.

  The handle is now derived from the account's email, so registering the same account
  again — from this machine or another — overwrites its own slot.

  **Slots already spent are not reclaimed by this release.** List them with
  `ykman fido credentials list` and delete the extras with
  `ykman fido credentials delete <id>`.

- **A second account came up with two of every default folder.** Sign-in pulls the remote
  vault first and swallows failures — which on a fresh machine is the *normal* outcome,
  because the sync PIN is not stored yet. The local tree was then empty, which is
  indistinguishable from "brand new", so the defaults were created. The next successful
  sync pulled the account's real folders, whose ids differ, and the merge kept both sets.

  Seeding now needs positive evidence that nothing is waiting: no sync location at all,
  or a location that demonstrably holds no vault. **The existence of a vault file is
  enough to refuse** — whether it can be decrypted yet is a different question, and on a
  machine that has just signed in the answer is usually "not yet".

  Duplicates already created are ordinary folders: delete the empty one of each pair and
  the deletion syncs like any other.

- Closed a re-entrancy window in the same place: the seeded flag is now claimed **before**
  the first `await`, so two sign-in flows cannot both get past the guard and each write a
  full set — the same duplication by a different route.

## [0.33.0] — 2026-08-24

### Changed

- **Publisher id is `remsoftdev`.** The manifest carried a placeholder and every local
  build had one swapped in by hand; the extension now identifies as
  `remsoftdev.creds-for-devs`, which is what `vsce publish` and the Marketplace URL use.

  **This changes the extension ID, and VS Code keys `SecretStorage` and `globalState` by
  it.** Installing this build does not upgrade the local one — it installs a *different*
  extension that starts empty, and the previous one keeps its secrets until it is removed.
  Before switching: sync or take a snapshot from the old build, install this one, sign in,
  set the sync location and PIN, and let it pull. Then remove the old extension.

## [0.32.0] — 2026-08-24

### Changed

- **A subfolder of a typed folder is of that type, and is no longer asked about.** Adding
  a folder inside `passwords` opened the type picker with every kind offered — including
  the ones that folder already refuses. An entity created there has its type fixed by the
  parent; a subfolder is where some of those entities live, so it was the one child the
  rule did not reach.

  One rule now serves both: `inheritedFolderType` in `defaultFolders.ts`, with the
  entity-side lookup delegating to it rather than repeating it. An untyped (`Any type`)
  parent still asks, because there the question is a real one — and *Change Folder Type…*
  remains in the folder's own menu when you want something the parent did not dictate.

## [0.31.1] — 2026-08-24

### Fixed

- **Three commands shouted the product name inside the context menu.** *Set Backup
  Schedule…*, *Start VPN* and *Stop VPN* carried `CredsForDevs:` in their `title` instead
  of using `category`. VS Code shows `category: title` in the palette and only the *title*
  in a menu — so the palette looked identical either way, and the menu grew one item
  introducing itself to somebody already inside it. Now tested, both directions: no title
  may contain the product name, and every command must carry the category.

## [0.31.0] — 2026-08-24

### Security

- **`Backup to NAS` destroyed a registered security key.** It asked for a master PIN and
  wrote the old PIN-only envelope — over **the same file the sync location uses**, since
  both sides get the name from `planBackupFileNames`. A vault with a YubiKey registered
  therefore came back as one without: the key wraps were not migrated, they were
  overwritten. Nothing failed and nothing warned; the key simply stopped opening the
  vault, and the only way back was a snapshot from before the backup.

  The command now looks at what is already in that file. A wrapped vault is unlocked
  through its own key slots — the security key is touched, or a stored PIN is used — and
  written back with its wraps intact. The PIN is asked for only when there is genuinely
  no other key: a vault that does not exist yet, or an old PIN-only one. Content that
  cannot be parsed counts as a vault to protect, not as a blank slate.

  If you took a backup between registering a key and this release, re-register the key.

### Added

- **`Set Backup Schedule…` on the account menu** — hourly, every 6 hours, daily, weekly,
  off, or a custom number of hours. The interval was only ever reachable by editing
  `settings.json`, which is not "choose a folder and how often", and the menu offered the
  folder while quietly keeping the other half to itself.

  Per account, like the folder, because the menu item sits on an account: a schedule set
  there that silently changed every other account would be a worse surprise than no menu
  item at all. Accounts without one keep using `backupIntervalHours`.

### Fixed

- **Two menu items shared one slot and neither could say which came first.** The account
  menu had the new schedule item colliding with *Set Sync PIN*, and *Clone…* had been
  sitting on *Move to Folder*'s slot since 0.26.0. VS Code picks an order and renders
  something — which is why this went unnoticed. There is now a test for it, next to the
  one for `3_manage@0b`; it was written first and failed on both.

## [0.30.0] — 2026-08-24

### Fixed

- **A terminal entry showed its name and nothing else.** Double-clicking one gave a Name
  field and a *Copy All* that copied exactly that — no command, no argument notes, no
  assembled line. Both the details viewer and the text block simply had no branch for the
  kind; `describeCommand` had produced all three for the tooltip all along and was never
  reached from either.

  The viewer now shows the command, what it is for, **every argument on its own row with
  its explanation underneath** — the same shape as the form, because a value and its note
  read as a pair or not at all — and the full line that runs. A disabled argument is shown
  and labelled `(off)` rather than hidden: it was kept deliberately, and hiding it makes
  the entry look like it lost one.

- **The help lookup failed in silence.** With the tool not installed, the notes simply
  stayed empty and nothing said why — which reads as a broken feature rather than a fact
  about the machine. It now says which of the four things happened: the lookup is switched
  off, the command was not a plain tool name so nothing was run, the tool could not be
  found on PATH, or its help documents none of these arguments.

### Changed

- `formatEntityBlock` and the `ssh` command builder moved into `entityText.ts` and
  `sshCommand.ts`, free of `vscode`. Not tidying: the details block could not be tested
  where it was, which is why a whole entity kind could go missing from it unnoticed. The
  regression test for the bug above now exists because of the move.

## [0.29.0] — 2026-08-24

### Security

- **Unlock asked for nothing.** It announced `Vault of … unlocked.` without a key touch or a
  PIN — because the Sync PIN stored in the OS keychain opened the vault two steps before
  the security-key branch was ever reached. *Unlock Vault* could have asked, so it counted
  as deliberate; it simply never did. Anyone at an unattended machine clicked Unlock and
  was in, which is the single situation Lock exists for.

  While the lock stands, the cached master key and the stored PIN are both skipped — on
  old v1 vaults as well as v2 — so opening the vault costs a touch, or the PIN typed.
  Locking is unchanged and was already correct.

  Only the **lock** demands this. Reading a password from an unlocked vault does not, and
  no credential-read path is affected at all: credentials live in the OS keychain and are
  not protected by the vault key.

### Fixed

- **The account icon stayed grey after unlocking.** Readiness is recomputed when it can
  change — and unlocking was missing from that list, so the colour went on saying "locked"
  after the vault was open. It now repaints immediately, and again once the sync that
  follows has finished, because whether a security key is registered is something only a
  completed cycle knows.

## [0.28.0] — 2026-08-24

### Added

- **Start / Stop on WireGuard and OpenVPN entries** — a green triangle in the row, same as
  SSH and terminal commands. The stored config is written into the extension's private
  storage under the file name the tool insists on (`wg-quick` takes the interface name
  from the *file* name, so `a1b2c3.key` would simply not come up), and the command runs in
  a terminal.

  **Elevation is the operating system's, never ours.** Both tools create a network
  interface, which no editor extension can be granted. So Windows gets a UAC prompt via
  `Start-Process -Verb RunAs` and POSIX gets `sudo` in the terminal you are looking at —
  the line that will run is on screen before it runs, and nothing is elevated quietly.

  IKEv2 and L2TP entries deliberately get **no** button: they are profiles in the OS
  network settings, not a file a binary can be pointed at, and a button that could only
  ever explain itself is worse than none. Use *Save Config* and import it where your OS
  expects it.

  Stop exists because start without it is half a feature — on Windows `/installtunnelservice`
  makes the tunnel a *service* that outlives VS Code, deliberately, and there has to be a
  way back. OpenVPN has no Stop and says why: it runs in the foreground, and killing every
  `openvpn` on the machine is not a Stop button.

- **Paste a whole command and it splits itself into rows.** `aws sso login --sso-session
  OD-org` becomes a verb and one argument row, quotes and all — what was pasted is exactly
  what will run, which is asserted by a round-trip test, because a parse that silently
  changes a command is worse than no parse.

- **The notes are read from the tool's own `--help`.** The alternative was a table of flags
  for the tools we happened to think of, which would be wrong for every private tool and
  stale for every public one. Empty notes only — what you wrote is never overwritten by a
  guess — and a private tool with no help still gets its rows split, with the notes yours
  to write, which is what you were doing anyway.

  Only a plain tool name is ever run: every word must be letters, digits and the few marks
  that appear in real tool names, so nothing containing a shell metacharacter is executed
  at all. That matters because a *shared* entry is exactly where such a string would come
  from. Turn the lookup off entirely with `credSshManager.readCliHelp`.

### Fixed

Both of these were found by running the lookup against real tools on a real machine after
the invented test cases had all passed:

- **A usage synopsis was being served as a description.** `git commit -m` came back as
  `[--allow-empty-message] [--no-verify] [-e] [--author=<author>]` — confident, attached to
  the row, and nonsense. A flag inside a `[...]` group is a synopsis mention, not a
  definition, and the search now keeps looking for the real one.
- **Wrapped descriptions were truncated at the first line break.** `docker run --rm` read
  "Automatically remove the", which is not a shortened meaning but a different one.
- `-it` and other bundled short flags are explained letter by letter — and only when
  *every* letter is found, because half an answer presented as the answer is the same
  failure as the first item.

## [0.27.0] — 2026-08-24

### Fixed

- **The `Terminal` folder type could not be chosen.** The folder-type picker was a second,
  hand-written copy of the kind list and it was never extended, so the type shipped in
  0.26.0 was reachable only by brand-new accounts — which seed the default folders once,
  at creation. Every existing account was offered five types and could not create the
  sixth. The picker now derives from the kind list itself, and a test fails if the two
  ever drift apart again.

### Changed

- **`Run in Terminal` runs it.** 0.26.0 put the line on the prompt and left Enter to you;
  the operator asked for the button to do the whole job, which is theirs to decide — these
  are commands you wrote and saved yourself, not something arriving from elsewhere.
  *Copy Command* is still there for the times you want to edit before running.
- The run button is the same **green triangle** as *Connect via SSH*, in the row and in the
  context menu. Two buttons that both mean "start this" should not look like two different
  ideas.

## [0.26.0] — 2026-08-23

### Added

- **Terminal commands as entries**, with a `terminal` folder in the default set. The case:
  `aws sso login --sso-session OD-org` is unfindable in shell history a week later, and the
  part you have forgotten is never the verb — it is which value belongs to which
  environment, and why.

  So an argument is a **row**, not a word inside a string: each has its own value, its own
  explanation underneath it, and a tick to keep a flag without using it (`--debug` is what
  you want back next week; deleting it means retyping it from memory). Rows can be added,
  removed and reordered, and a live preview shows exactly what will run.

  *Run in Terminal* puts the command on the prompt **without pressing Enter** — a
  credential-adjacent command that executes the instant you click a tree item is a way to
  lose an afternoon. Also *Copy Command* and *Show Command and Notes*.

- **Clone…** on every folder and entity. Copies the settings, deliberately **not** the
  secrets: duplicating passwords would double them on disk and in every backup, and the
  usual reason to clone is a near-identical entry that needs its own credential anyway.

- **The account icon is green when that account can actually sync**, grey otherwise — and
  the row says why. A security key with no Sync PIN is deliberately *not* green: a timer
  cannot touch a key, so background sync would keep stopping to ask, and calling that
  "ready" would make the colour mean "you configured something" rather than "this works".

- **Sync now reports what it could not do.** If nothing can sync it says which account and
  what is missing, and offers the fix. If some can, it syncs those and names the rest
  instead of reporting success and quietly leaving accounts behind.

  Worth knowing: the setup is **per account**, not per location. The Sync PIN is stored
  under the account id and the security-key wraps live inside that account's own vault, so
  two accounts pointing at the same folder still have two vaults and two separate ways in.

## [0.25.0] — 2026-08-23

### Security

- **`Lock Vaults` now actually locks.** It used to clear the cached master key and nothing
  else — so the next automatic sync, five minutes later by default, silently reopened the
  vault using the Sync PIN saved in the OS keychain. The command told you the next sync
  "will ask for the PIN or a key touch". It did not ask; it just used the saved one.

  Locking now also **refuses that stored PIN** until somebody unlocks deliberately.
  Background sync cannot prompt, so while locked it pauses and says so instead of quietly
  undoing what you just did. Anything you trigger yourself — *Sync Now*, *Unlock Vault* —
  counts as unlocking.

- **Auto-lock after idle** (`autoLockMinutes`, 60 by default, `0` disables). The master key
  previously stayed in the extension host's memory for the whole window's life, with the
  manual command as its only eviction.

  **Idle means *you* have been idle** — an action of yours that touches a stored secret:
  opening or copying a credential, connecting, installing a key, editing an entry,
  unlocking. Not mouse movement, and explicitly **not background sync**: a cycle running
  on a timer is not you being present. That distinction is the whole feature — measuring
  "time since the key was last used" made the setting do nothing at all once `autoSync`
  was on, because sync touches the key every five minutes.

  What locking does **not** do, stated plainly because the previous message implied
  otherwise: your credentials keep working locally. Passwords, SSH keys, VPN configs and
  DB connection strings live in the OS keychain and are not protected by the vault key —
  the vault key only opens the encrypted copy that leaves the machine.

## [0.24.0] — 2026-08-23

Renamed to **CredsForDevs**, and the first release that talks to a Cred Vault Server
with a precondition rather than hoping two machines never write at once.

### Added

- **Scheduled vault snapshots.** Right-click an account → *Set Backup Location…*, and the
  extension writes a dated, encrypted snapshot into that folder on a timer
  (`backupIntervalHours`, 24 by default). Any folder works — a NAS mount, an rclone
  mount, a Google Drive or OneDrive sync folder — because the folder is all it knows.

  A snapshot is a **copy of ciphertext**: the same encrypted envelope the sync location
  already holds, so no PIN is needed to take one and it runs unattended. Restore one with
  the existing *Import / Restore*.

  This is deliberately separate from the sync location, and the difference is the point:
  **sync merges, so a deletion travels to every machine.** Snapshots are what you go back
  to when the deletion was the mistake. Choosing a folder inside the sync location asks
  for confirmation, because on one disk they die together.

  Four rules it inherits from the server's backup, each of which came from an actual
  failure rather than from taste: identical bytes are not re-written; retention never
  deletes the newest snapshot whatever its age; an empty vault is never snapshotted over
  a good history; and each file is written under a temporary name and renamed only once
  complete, because a sync client uploads whatever appears the moment it appears.

### Fixed

- **`Set Backup Location…` did not appear in the menu at all.** It was contributed with the
  group `3_manage@0b`; VS Code expects an integer after the `@`, so the item was silently
  dropped. Nothing errored — the feature was simply invisible.
- **`Lock Vaults` was reachable only from the command palette**, while `Unlock Vault` sat in
  the account menu. They are a pair: testing a security key means locking and then
  unlocking, and half of that could not be found. Lock now sits directly under Unlock.
- **You no longer appear in your own Team list.** Neither the server's `/api/team` nor the
  folder scan excludes the caller — they cannot, since neither knows which of your
  accounts is being looked at — so the account you were viewing offered to share a
  credential with itself. Your *other* accounts stay, because moving a credential from a
  work vault to a personal one is a real thing people do.

### Security

- **Copied secrets now expire.** Every clipboard copy of a password, private key, DB
  connection string or "all fields" block is cleared after 45 seconds — but only if the
  clipboard still holds exactly what was copied, so a later copy of your own is never
  destroyed. Previously a copied password stayed on the clipboard indefinitely, where
  OS clipboard history and cross-device sync could retain it.

### Fixed

- **A wedged vault server no longer hangs sync forever.** Requests to the Cred Vault
  Server had no timeout: a server that accepted the connection and then stopped answering
  left the request pending for the life of the window, and auto-sync's single-cycle guard
  meant nothing synced again. Every request now fails after 60 seconds with a message that
  distinguishes "did not answer" from "unreachable".
- `npm test` ran no tests. `node --test out/test/` resolves the directory as a module on
  Node 22+ and exited with `MODULE_NOT_FOUND`; the script now passes a glob.

### Changed

- **Renamed to CredsForDevs.** The display name, the activity-bar container, the settings
  section and all 37 command titles now read *CredsForDevs*, and the package identifier is
  `creds-for-devs`.

  Two things deliberately did **not** change, because renaming them would break data rather
  than branding:

  - the **vault format identifiers** (`cred-ssh-manager-backup`, and the HKDF context strings
    `cred-ssh-manager/webauthn` and `cred-ssh-manager/envelope-mac`). They are on-disk format
    contracts; renaming them would make every existing vault and every security-key wrap
    unreadable, including ones already sitting on a NAS or a server.
  - the **command and settings namespace** (`credSshManager.*`). Renaming settings keys would
    silently discard every user's configuration. The namespace is internal; nothing shows it
    to a user except `settings.json`.

  Because the package identifier is half the extension ID, and VS Code keys `SecretStorage`
  by that ID, **upgrading from `cred-ssh-manager` does not carry secrets across**. Export
  first (*Backup to NAS* / *Export Secrets*), install, then import.

- The extension moved into the `dew_flow_creds_for_devs` monorepo alongside the server it
  talks to (`src_vs_code/` and `src_minimalapi_server/`). The server was previously an
  undiscoverable sibling checkout.
- Licensed under MIT (was `UNLICENSED`), and prepared for Marketplace publication.

## [0.23.0] and earlier

Developed as a private extension; see `research/PLAN_sharing.md` and
`research/PLAN_audit_followups.md` in the repository for the design records of the
sharing feature and the security audit follow-ups (KDF versioning, causal-merge sync,
envelope MAC, PIN re-key, remote vault deletion, notes moved to SecretStorage).
