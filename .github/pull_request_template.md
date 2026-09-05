<!-- The title is the changelog line: `type: what changed` — feat, fix, docs, test, chore, refactor, perf, ci, build. -->

## What changed, and why

<!-- The symptom or the ask first, then what shipped. This repository is public: nothing here may weaken the trust boundary — the server never holds a key that opens a vault. -->

## Evidence

- [ ] **Red-green:** every bug or problem spot here has a test that failed before the fix and passes after — name it.
- [ ] **All the tests ran** — server, extension, cli, mcp, broker — and this is what they printed:

```
<paste the runners' summary lines>
```

## Documentation

- [ ] `research/module_*.md`, README, CHANGELOG and the manifest (`package.json` / `.csproj`) updated where what they describe changed.
- [ ] If this finishes a plan in `todo/`, it is promoted to `research/` here.
- [ ] If a route changed: the `.http` contract suite has a request for it, and `POST_DEPLOY.md` still holds.

## The reviewer

<!-- Filled in about five minutes after opening: what CodeRabbit said, what was fixed, and what was NOT acted on — with the reason. -->

## Release / deploy

- [ ] No release needed / a tag will be cut on `main` after the merge: `<tag>`.
- [ ] If the deploy auto-triggers: verified against the environment and its logs read.
