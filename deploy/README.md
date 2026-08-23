# Deploying the Cred Vault Server

One command, once you have decided two things: **who may sign in**, and **how TLS is terminated**.

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d
```

That brings up three containers:

| Container | Job |
|---|---|
| `vault` | the API. Publishes no port — the only way in is nginx |
| `nginx` | TLS termination, security headers, per-IP rate limiting, the ACME challenge webroot |
| `certbot` | obtains the certificate, then renews it forever |

## Decision 1 — who may sign in

`ALLOWED_DOMAINS` is your company boundary. A perfectly valid Microsoft or Google token from outside
those domains gets a 403. The server refuses to start if you leave it blank without explicitly
setting `ALLOW_ANY_DOMAIN=true`, because a credential server that accepts the entire internet by
accident is not a failure mode worth having.

Then pick at least one identity provider — `MS_TENANT`, `GOOGLE_ENABLED`, or `LOCAL_SIGNING_KEY`.
The server also refuses to start with none configured, since it would 401 every request and look
exactly like a network fault.

> **On `MS_AUDIENCES`:** leave it empty until the extension has its own app registration. An access
> token minted for Microsoft Graph carries *Graph's* audience, so switching audience validation on
> too early rejects every real token. Issuer trust, the domain boundary, and per-email scoping all
> still apply meanwhile.

> **On `LOCAL_SIGNING_KEY`:** anyone holding that string can mint a token for any email in
> `ALLOWED_DOMAINS`. It exists for offline and air-gapped deployments and for the test suite. If you
> have a real identity provider, leave it empty.

## Decision 2 — how TLS is terminated

| `TLS_MODE` | Use when | What you need | Certificate lifetime |
|---|---|---|---|
| `domain` | The normal case | Public DNS for `DOMAIN` pointing here, port 80 reachable from the internet | 90 days, auto-renewed |
| `ip` | You have a public IP and no domain | A **public** `PUBLIC_IP`, port 80 reachable | **~6 days**, auto-renewed |
| `custom` | Internal network, internal CA, or a wildcard you already own | `fullchain.pem` + `privkey.pem` in `${CERT_DIR}/conf/live/custom/` | yours |
| `none` | Something else already terminates TLS in front of this | — | — |

### Two things about `ip` mode that will bite you if you skip them

1. **Let's Encrypt only issues IP certificates under the `shortlived` profile** — about 160 hours,
   just over six days. That is policy, not a setting. The renewal loop in this stack is therefore
   load-bearing: an `ip` deployment where renewal is broken goes dark within a week. Do not raise
   `RENEW_INTERVAL_SECONDS` above ~12 hours in this mode.
2. **It must be a public address.** Let's Encrypt validates by connecting to it from the internet, so
   `10.x`, `172.16–31.x` and `192.168.x` can never be certified. For those, use `custom`.

### If you are deploying inside a company network

This is the case that most often goes wrong, so it is worth being blunt:

**A bare self-signed certificate will not work.** The VS Code extension talks to the server with
`fetch()` and no certificate override — it has no "trust this anyway" switch, by design. A
self-signed certificate is rejected outright and the user sees a connection error.

The two arrangements that *do* work:

- **A real domain, certified elsewhere.** Get a certificate for `vault.company.com` by DNS-01 (which
  needs no inbound connectivity at all), point the internal DNS record at the private IP, and drop
  the files in with `TLS_MODE=custom`. This is the recommended internal setup.
- **An internal CA that workstations already trust.** If your organisation distributes a root CA to
  every machine's OS trust store, issue from it and use `TLS_MODE=custom`.

`TLS_MODE=none` is the third option, and only honest behind another TLS terminator. Set
`REQUIRE_HTTPS=false` with it or the app rejects every request.

### What "not ready yet" looks like

Before a certificate exists, port 443 does not listen and port 80 answers:

```
503  TLS is not ready: no certificate has been issued yet. Check: docker compose logs certbot
```

That is deliberate. There is no self-signed placeholder, because a placeholder turns a clear "not
ready" into a confusing "your certificate is untrusted", and the extension would reject it anyway.
nginx picks up the real certificate within a minute of issuance and opens 443 by itself.

## Persistence — what survives an update

Three host directories, all bind mounts, all outside every container:

| Setting | Default | Holds |
|---|---|---|
| `DATA_DIR` | `./data` | vault blobs and share inboxes — **the irreplaceable part** |
| `CERT_DIR` | `./certbot-data` | certificates and the ACME account key |
| `LOG_DIR` | `./logs` | application logs |

Nothing in `update.sh` touches them, and the stack uses no anonymous volumes. Point them at storage
you actually back up.

## Where the image comes from

CI publishes to the **GitHub Container Registry** (`ghcr.io`) — GitHub's own registry, so there is
no second account and no second credential to manage.

| Tag | Published by | Moves |
|---|---|---|
| `:edge` | every push to `main` | constantly |
| `:sha-<commit>` | every push to `main` | never — immutable |
| `:1.4.0` | a `server-v1.4.0` tag | never |
| `:latest` | a `server-v*` tag only | on releases only |

`:latest` deliberately does **not** follow `main`, so pinning it never picks up an untagged commit.
For production, pin an explicit version anyway.

Images are built for `linux/amd64` and `linux/arm64`, and what is published is the same build that
passed the smoke test in CI.

> **A ghcr package is private until its owner makes it public.** If `docker compose up -d` fails
> with `denied` or `manifest unknown`, either change the package visibility on GitHub
> (*Packages → cred-vault-server → Package settings → Change visibility*), or authenticate:
>
> ```bash
> echo <PAT with read:packages> | docker login ghcr.io -u <username> --password-stdin
> ```

You can also skip the registry entirely and build locally — the compose file carries a `build:`
section for exactly that:

```bash
docker compose build vault && docker compose up -d
```

## Proving the certificate pipeline before you point DNS at it

`deploy/acme-test/` runs the whole issuance flow against **Pebble** — Let's Encrypt's own test
ACME server — in about a minute, on your machine, without a public domain and without spending
Let's Encrypt's rate limits to discover that a flag is wrong.

```bash
cd deploy/acme-test && ./run.sh
```

It uses the **production** `certbot` and `nginx` entrypoints unchanged, and asserts the four things
that actually break:

1. before issuance, port 443 is closed and port 80 answers 503 — no deadlock, no confusing
   "untrusted certificate";
2. certbot obtains a certificate through a **real HTTP-01 challenge** served from the shared
   webroot by the nginx config that ships;
3. nginx notices the new certificate on its own and opens 443 with it;
4. the API is then reachable over TLS and the forwarded-proto guard is satisfied.

What it cannot prove is the half that belongs to your network: that a public name resolves to your
host and that port 80 is reachable from the internet. Nothing local can assert those.

## Updating

```bash
./update.sh              # pull the tag in .env, recreate, wait for healthy
./update.sh 1.4.0        # move to a specific version
./update.sh --rollback   # return to the version the last run replaced
```

The script pulls first and only then recreates, records the previous tag before switching, and
**exits non-zero if the new container does not become healthy** — printing its logs and the rollback
command. nginx and certbot keep running throughout, so TLS never blinks.

Automatic updates were considered and deliberately not shipped: Watchtower needs the Docker socket,
which is root on the host, and a credential server that pulls and runs new images unattended has
turned a registry compromise into a full compromise. Pin a version tag in `.env` and run `update.sh`
when you mean to.

## Backups — pick a path, pick how often

The stack backs itself up on a schedule. You choose **one directory**; that is the entire
configuration:

```ini
BACKUP_DIR=./backups          # or /mnt/nas/vault, or ~/OneDrive/vault, or an rclone mount
BACKUP_INTERVAL_HOURS=24      # 24 daily, 168 weekly, 1 hourly
BACKUP_RETAIN_DAYS=30         # 0 keeps everything
BACKUP_ON_START=true          # take one immediately, so a wrong path is found now
BACKUP_SKIP_IF_UNCHANGED=true # do not re-upload identical bytes to a metered folder
```

The destination is all the backup service knows, which is why it works with a NAS mount, a
Google Drive or OneDrive sync folder, an rclone mount or a second disk **without any cloud
credentials or provider-specific code**. Whatever puts that path on the filesystem is the host's
job; the server just writes a file into it.

Each run writes one verified `cred-vault-<UTC>.tar.gz` containing the vault data and the
certificates. Four properties are worth knowing because each exists for a reason:

| Property | Why |
|---|---|
| Written to a `.tmp` name and renamed only after it verifies | A sync client uploads whatever appears the moment it appears. A half-written file under the real name would be replicated as a "backup" |
| Skips when nothing changed | A daily backup of a quiet vault would otherwise re-upload the same bytes forever |
| **Refuses to archive an empty source when archives already exist** | Found by rehearsing a restore: after data loss + a restart, the scheduled run archived the *empty* directory, and since archives sort by timestamp that empty one became "newest" — shadowing the good restore point at the worst possible moment |
| Retention never deletes the last remaining archive | A clock skew or a destination that was unreachable for a month must not turn "prune old backups" into "delete every backup" |

It does **not** include `.env`. That file holds `LOCAL_SIGNING_KEY`, and this destination is often
a cloud folder — copying a signing key there should be your decision, not a side effect of turning
backups on. Keep `.env` wherever you keep secrets. The vault blobs themselves are ciphertext the
server cannot read.

Take one by hand at any time with `./backup.sh` (same code, same guarantees).

## Restoring

```bash
./restore.sh --list                    # what is available
./restore.sh                           # the newest archive
./restore.sh /mnt/nas/cred-vault-….tar.gz
```

It verifies the archive **before** touching anything, refuses an archive containing no vault
blobs, stops the stack, moves the current data aside as `data.before-restore-<ts>` rather than
deleting it, unpacks, fixes ownership, starts up, and waits for the healthcheck. If anything fails
after the point of no return it **rolls back** — the original data goes back and the stack is
started again.

This path has been rehearsed end to end, not just written: data directory destroyed, server
returning 404, restore run, vault readable again with its exact contents. An unrehearsed restore
is a rumour.

## Security posture of the stack

- The app container runs as **uid 10001**, with a **read-only root filesystem**, `no-new-privileges`,
  and **all capabilities dropped**. It can write to `/data` and `/logs` and nowhere else.
- The app **publishes no port**. Only nginx is reachable, and only on 80/443.
- `REQUIRE_HTTPS=true` makes the app reject anything that did not arrive through the proxy. This is
  safe here precisely because the app's port is unreachable directly — the header is trusted, and
  anything that could set it could already talk to the app.
- Rate limiting runs at two levels: nginx per source address (catching unauthenticated floods before
  they reach the app), and the app per authenticated caller (so one noisy account cannot throttle
  anyone else).
- Container logs are capped at 10 MB × 5 files each, so a log loop cannot fill the disk that holds
  the vaults.

## Health and monitoring

`GET /api/health` returns 200 with `"storage":"writable"` — it probes the data directory rather than
reporting a constant, so it fails when the volume is gone or full, which is the failure that actually
strands this service.

```bash
docker compose ps                    # all three should be Up, vault healthy
docker compose logs -f vault
docker compose logs -f certbot       # where a TLS problem announces itself
curl -sf https://vault.example.com/api/health
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| Everything 503s on port 80, 443 refuses | No certificate yet. `docker compose logs certbot` |
| `vault` container restarts on boot | Startup config guard tripped: no auth scheme, or `ALLOWED_DOMAINS` empty. The log names which |
| Extension says "refused (403)" | The signed-in email's domain is not in `ALLOWED_DOMAINS` |
| Extension says "rejected the token (401)" | Wrong tenant, or `MS_AUDIENCES` set before the app registration exists |
| Extension says "did not answer within 60s" | The server accepted the connection and stopped responding — check `vault` health and disk |
| certbot: "unauthorized" / challenge failed | Port 80 not reachable from the internet, or DNS not pointing here yet |
| certbot on `ip` mode: refuses to issue | `PUBLIC_IP` is a private address, or certbot predates 5.4 |
