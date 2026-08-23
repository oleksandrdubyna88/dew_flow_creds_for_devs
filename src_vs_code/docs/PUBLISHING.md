# Publishing CredsForDevs to the VS Code Marketplace

Everything that can be prepared in advance is prepared. What remains needs an account only you can
create, so this document is the handover.

## What is already done

| Requirement | State |
|---|---|
| `license` | `MIT`, with `LICENSE` beside `package.json` so it ships inside the `.vsix` |
| `icon` | `media/icon.png`, 128×128 — regenerate with `npm run icon` |
| `repository` / `bugs` / `homepage` | set, pointing at this monorepo with `directory: src_vs_code` |
| `categories` / `keywords` | set |
| `galleryBanner` | set to the extension's own blue |
| `CHANGELOG.md` | present; the Marketplace renders it on the version tab |
| `private: true` | **removed** — it was left over from the internal build |
| `.vscodeignore` | trimmed so the `.vsix` carries only `out/`, `media/`, and the three docs |
| CI | `npm run typecheck`, `npm test`, and `vsce package` run on every push |

`vsce package` currently succeeds with no warnings. The only blocker left is the publisher id.

## The one thing left: a publisher

`package.json` carries a deliberate placeholder:

```json
"publisher": "set-your-publisher-id"
```

The release workflow **refuses to publish while that value is there**, so this cannot be shipped by
accident.

### 1. Create the publisher

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft account.
2. *Create publisher*. The **ID** is permanent and appears in the extension's URL and in
   `code --install-extension <publisher>.creds-for-devs`. Lowercase letters, digits and hyphens.
3. Put that id in `package.json`, replacing the placeholder, and delete the `"//publisher"` note.

### 2. Get a Personal Access Token

The Marketplace authenticates through Azure DevOps, which is not obvious the first time:

1. Go to <https://dev.azure.com>, same Microsoft account.
2. User settings → **Personal access tokens** → *New Token*.
3. **Organization: “All accessible organizations”.** A token scoped to one organization fails with a
   403 that does not explain itself — this is the single most common publishing problem.
4. **Scopes: Custom defined → Marketplace → Manage.**
5. Copy the token. It is shown once.

### 3. Publish

Either from your machine:

```bash
cd src_vs_code
npx vsce login <your-publisher-id>    # paste the PAT
npm run publish
```

Or through CI, which is the better habit — it publishes only what passed its tests:

1. Add the PAT as the repository secret **`VSCE_PAT`**
   (*Settings → Secrets and variables → Actions*).
2. Tag and push:

```bash
git tag extension-v0.24.0
git push origin extension-v0.24.0
```

`.github/workflows/release.yml` then typechecks, tests, verifies the publisher is not a placeholder,
publishes, and uploads the `.vsix` as a build artifact.

> Tags are prefixed per product: `extension-v*` publishes the extension, `server-v*` publishes the
> container image. A tag never ships both.

## Version discipline

`vsce` refuses to publish a version that already exists. Bump `package.json`'s `version` and add a
`CHANGELOG.md` entry in the same commit as the tag — the Marketplace shows that changelog to
everyone deciding whether to update.

Semantic versioning, with one product-specific rule: **anything that changes the vault format or the
server contract is at least a minor bump**, and the changelog entry says what an existing user has to
do about it.

## Before the first publish, read this once

The Marketplace listing is the README, rendered. It is currently written for developers who found the
repository, which is the right audience — but check that:

- the first screen explains what the extension does before it explains how it is built;
- every relative link resolves (the Marketplace rewrites them against the `repository` +
  `directory` fields, which is why both are set);
- there is at least one screenshot or GIF. There is none today, and it is the biggest gap in the
  listing — see [todo/PLAN_marketplace_listing.md](../../todo/PLAN_marketplace_listing.md).

## Verifying what you are about to ship

```bash
npx vsce ls --tree      # exactly which files go into the .vsix
npm run package         # build it without publishing
code --install-extension creds-for-devs-<version>.vsix   # install it as a user would
```

Install the built `.vsix` into a clean VS Code profile (`code --profile clean`) before publishing.
It is the only way to notice that something the extension needs was excluded by `.vscodeignore`.
