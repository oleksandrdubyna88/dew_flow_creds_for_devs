#!/usr/bin/env node
/**
 * The protection this branch is supposed to have, as a file — and the drift from it, as an exit code.
 *
 * <p>Branch protection is the one part of a repository's CI that is NOT in the repository. There is
 * no file GitHub reads for it: it is settings, changed through the API or the web page, by whoever
 * happened to be looking. So nobody reviews a change to it, nothing goes red when it drifts, and
 * "why can this merge?" has no answer in the tree. Measured 2026-09-18 across this family:
 * `dew_flow_rag_qln` had <b>no branch protection at all</b>, and `dew_flow_creds_for_devs` required
 * 3 of the 11 checks that run on every pull request. Neither was a decision anybody took; they were
 * the absence of one.</p>
 *
 * <p>This file does not make GitHub read the JSON — nothing can. It makes the JSON the reviewed
 * statement of intent, and the difference between it and reality something a command can print.</p>
 *
 * <pre>
 *   node .github/scripts/branch-protection.mjs --selftest   # the comparison logic, no token
 *   node .github/scripts/branch-protection.mjs              # compare to reality (needs a token)
 *   node .github/scripts/branch-protection.mjs --apply      # write the file's state to GitHub
 * </pre>
 *
 * <p><b>Exit codes are the interface</b>, because a caller in CI reads them and not prose:
 * <b>0</b> they match · <b>1</b> they drift, and the differences are printed · <b>2</b> called
 * wrongly, or the file is not readable · <b>3</b> GitHub could not be asked — no token, no
 * permission, no network. THREE IS NOT ONE: "the protection is wrong" and "I could not look" are
 * different answers, and a check that conflates them teaches people to ignore it.</p>
 *
 * <p><b>One branch or several.</b> A file with no `branches` key IS the body, and it speaks for
 * `main` — which is every repository here but one. A file that names `branches` maps each branch to
 * its OWN body, every one of them is checked, and the exit code is the worst of them, because
 * answering 0 on the strength of the branch that happened to be fine is the lie these codes exist to
 * prevent. `dew_flow_conventions` is why: its `release` ref is moved by a workflow pushing directly,
 * so it cannot carry `main`'s pull-request requirement and needs a body of its own.</p>
 *
 * <p>The JSON is exactly the PUT body the API takes, so `--apply` sends the file and nothing
 * translates it on the way. What DOES need translating is the answer: a GET comes back with URLs,
 * `{enabled: true}` wrappers and a `checks` array beside `contexts`. That normalisation is the only
 * real logic here, and `--selftest` is what holds it.</p>
 */
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(HERE, '..', 'branch-protection.json');

/** The fields this tool speaks for. Anything GitHub returns outside this list is not compared. */
export const FIELDS = [
  'required_status_checks',
  'enforce_admins',
  'required_pull_request_reviews',
  'required_linear_history',
  'allow_force_pushes',
  'allow_deletions',
  'block_creations',
  'required_conversation_resolution',
  'lock_branch',
  'allow_fork_syncing',
];

/**
 * A GET answer, reduced to the shape a PUT takes.
 *
 * <p>The asymmetry is GitHub's: `enforce_admins` comes back as `{url, enabled}` and goes out as a
 * boolean; `required_status_checks` comes back carrying `url`, `contexts_url` and a `checks` array
 * that repeats `contexts` with app ids. Comparing the raw answer to the file would report drift on
 * every field, every time — which is the same as reporting nothing.</p>
 */
export function normalise(got) {
  if (got === null || typeof got !== 'object') {
    return {};
  }

  // The same reducer runs over BOTH sides, so it has to take a GET's `{enabled: true}` and a PUT
  // body's bare `true` and answer the same thing. Missing one of those was the first bug the
  // selftest caught, and it was silent in the direction that matters: the file said
  // `required_linear_history: true`, the reducer answered `false`, and the tool reported drift on a
  // branch that was configured correctly.
  const enabled = (value, fallback) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value && typeof value === 'object' && 'enabled' in value) {
      return value.enabled;
    }
    return fallback;
  };

  const out = {};

  if (got.required_status_checks) {
    out.required_status_checks = {
      strict: got.required_status_checks.strict === true,
      // Sorted by CODE POINT, explicitly. Both sides go through this same function, so any
      // consistent order would do for the comparison — but `.sort()` with no comparator is
      // documented as implementation-defined for non-strings, and `localeCompare` would make the
      // result depend on the machine's locale. Neither is a property this should have.
      contexts: [...(got.required_status_checks.contexts ?? [])]
        .sort((a, b) => (a < b ? -1 : Number(a > b))),
    };
  }

  const reviews = got.required_pull_request_reviews;
  if (reviews) {
    out.required_pull_request_reviews = {
      dismiss_stale_reviews: reviews.dismiss_stale_reviews === true,
      require_code_owner_reviews: reviews.require_code_owner_reviews === true,
      require_last_push_approval: reviews.require_last_push_approval === true,
      required_approving_review_count: reviews.required_approving_review_count ?? 0,
    };
  }

  out.enforce_admins = enabled(got.enforce_admins, false);
  out.required_linear_history = enabled(got.required_linear_history, false);
  out.allow_force_pushes = enabled(got.allow_force_pushes, false);
  out.allow_deletions = enabled(got.allow_deletions, false);
  out.block_creations = enabled(got.block_creations, false);
  out.required_conversation_resolution = enabled(got.required_conversation_resolution, false);
  out.lock_branch = enabled(got.lock_branch, false);
  out.allow_fork_syncing = enabled(got.allow_fork_syncing, false);

  return out;
}

/**
 * The file, reduced the same way, so the two are compared on equal terms — and reduced to the
 * fields the file ACTUALLY names.
 *
 * <p>The second half is not a detail. `normalise` fills in a default for every field it knows, so
 * running it over the file alone makes the file appear to demand `lock_branch: false` it never
 * mentioned — and the tool then reports drift on a setting nobody has an opinion about. Silence in
 * the file has to mean silence.</p>
 */
export function wanted(file) {
  const full = normalise(file);
  const out = {};
  for (const field of FIELDS) {
    if (file && Object.hasOwn(file, field)) {
      out[field] = full[field];
    }
  }
  return out;
}

/**
 * The branches this file speaks about, each with the body that applies to it.
 *
 * <p>A repository with one protected branch says nothing and gets `main` — which is every file in
 * this family but one, so the common shape stays a plain PUT body with no wrapper. A repository
 * with more says so under `branches`, a map from branch name to its own body.</p>
 *
 * <p><b>A map rather than a list of names sharing one body</b>, and measuring `dew_flow_conventions`
 * is what settled that. Its `release` ref cannot carry `main`'s protection: `main` requires a pull
 * request, and `release` is moved by `promote-release.yml` pushing `&lt;sha&gt;:refs/heads/release`
 * directly — a pull-request requirement there would break the only supported way to move it. The two
 * branches need DIFFERENT protection for a reason, so a shape that could only express "the same"
 * would have been wrong the first time it was used.</p>
 *
 * <p>A `branches` that is empty, or an array, is refused rather than quietly read as "just main":
 * both are plausible ways to write this by mistake, and the failure would be a branch nobody
 * noticed was unprotected — the exact thing this tool exists to make impossible.</p>
 */
export function branchesOf(file) {
  if (!file || !Object.hasOwn(file, 'branches')) {
    return [{ branch: 'main', body: file }];
  }
  const named = file.branches;
  if (!named || typeof named !== 'object' || Array.isArray(named) || Object.keys(named).length === 0) {
    throw new Error('`branches` must be an object mapping branch names to protection bodies, naming at least one');
  }
  return Object.entries(named).map(([branch, body]) => ({ branch, body }));
}

/** Every field where the two disagree, named, with both values. Empty means they agree. */
export function differences(want, have) {
  const said = (value) => JSON.stringify(value);
  const out = [];
  for (const field of FIELDS) {
    if (!(field in want)) {
      continue;
    }
    if (said(want[field]) !== said(have[field])) {
      out.push({ field, wanted: want[field], actual: have[field] });
    }
  }
  return out;
}

/**
 * Where a program actually is, resolved once, rather than a bare name handed to the spawner.
 *
 * <p>Spawning `gh` by name delegates the choice of what runs to whatever `PATH` happens to say —
 * SonarCloud calls it out (S4036) and it is right that the decision should be visible. Resolving it
 * here does not make PATH trustworthy; what it buys is that the lookup is one explicit step with an
 * error somebody can act on, instead of an opaque spawn failure at the moment the tool was supposed
 * to answer a question.</p>
 *
 * <p>Done in JavaScript rather than by shelling out to `which`, because `which` would be the same
 * problem one level down.</p>
 */
function resolved(name) {
  // ONLY what `execFileSync` can start directly, which is narrower than PATHEXT. Node refuses
  // `.cmd` and `.bat` without `shell: true` — the 2024 argument-injection fix — and `.ps1`/`.vbs`
  // are not executables at all. The first version walked PATHEXT and would have returned such a
  // file happily, SHADOWING a working `gh.exe` further along PATH and failing at the spawn with a
  // message about neither. Refusing here says the true thing. (CodeRabbit, creds_for_devs #116.)
  const suffixes = process.platform === 'win32' ? ['.exe', '.com'] : [''];

  // `filter(Boolean)` DROPS EMPTY ENTRIES, and on POSIX an empty entry — `PATH=:/usr/bin`, a
  // trailing colon, `::` — means the CURRENT DIRECTORY. That is a deliberate divergence from
  // `execvp`, not an oversight, and it is kept for the reason the legacy is deprecated: the current
  // directory here is a REPOSITORY CHECKOUT, and this tool spawns `gh` holding a token that can
  // rewrite branch protection. Honouring an empty entry would let a file named `git` committed to a
  // pull request be the `git` that runs. The cost is a machine where the program exists ONLY in the
  // working directory and nowhere on PATH, which refuses with a message naming the program instead
  // of running something from the tree. That trade is not close. (CodeRabbit, creds_for_devs #117 —
  // correct about POSIX, and the selftest below pins the refusal so this is not re-litigated.)
  for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    // A RELATIVE PATH entry is legal and common enough (`tools`, `.`), and joining onto it yields a
    // relative answer — which the caller then spawns relative to ITS working directory rather than
    // the one PATH meant. It also made the selftest's `isAbsolute` assertion fail in an environment
    // that was perfectly correct.
    const dir = path.resolve(entry);

    for (const suffix of suffixes) {
      const candidate = path.join(dir, name + suffix);
      if (!existsSync(candidate) || !statSync(candidate).isFile()) {
        continue;
      }
      // On POSIX a readable file without the execute bit is not a program, and returning it only
      // moves the failure to the spawn. Windows has no equivalent bit; the extension list above is
      // what stands in for it there.
      if (process.platform !== 'win32') {
        try {
          accessSync(candidate, constants.X_OK);
        } catch {
          continue;
        }
      }
      return candidate;
    }
  }
  throw new Error(`${name} is not on PATH, and this tool cannot ask GitHub anything without it`);
}

function repository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }
  const url = execFileSync(resolved('git'), ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();

  // Split rather than match. The regex this replaces — `/[:/]([^/]+\/[^/]+?)(?:\.git)?$/` — has
  // two adjacent variable-length groups and a lazy one, which is super-linear on input that nearly
  // matches: a pathological remote URL could hang the tool. Splitting on the separators and taking
  // the last two segments is the same answer in linear time, and it reads as what it does.
  const segments = url.replace(/\.git$/, '').split(/[:/]/).filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`cannot read owner/name out of the origin remote: ${url}`);
  }
  return segments.slice(-2).join('/');
}

function ask(repo, branch) {
  return JSON.parse(execFileSync(
    resolved('gh'), ['api', `repos/${repo}/branches/${branch}/protection`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function put(repo, branch, body) {
  return JSON.parse(execFileSync(
    resolved('gh'),
    ['api', '--method', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
    { encoding: 'utf8', input: JSON.stringify(body), stdio: ['pipe', 'pipe', 'pipe'] }));
}

/* ------------------------------------------------------------------------------------------- */

const CASES = [
  {
    name: 'a GET answer and the PUT body that produced it agree',
    file: {
      required_status_checks: { strict: true, contexts: ['build', 'test'] },
      enforce_admins: true,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: false,
    },
    got: {
      required_status_checks: {
        url: 'https://api.github.com/…', contexts_url: 'https://api.github.com/…',
        strict: true, contexts: ['test', 'build'],
        checks: [{ context: 'test', app_id: 15368 }, { context: 'build', app_id: 15368 }],
      },
      enforce_admins: { url: 'https://api.github.com/…', enabled: true },
      required_linear_history: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      block_creations: { enabled: false },
      required_conversation_resolution: { enabled: true },
      lock_branch: { enabled: false },
      allow_fork_syncing: { enabled: false },
    },
    expect: [],
  },
  {
    name: 'a check that is required in the file and not on the branch is named',
    file: { required_status_checks: { strict: true, contexts: ['build', 'lint'] } },
    got: { required_status_checks: { strict: true, contexts: ['build'] } },
    expect: ['required_status_checks'],
  },
  {
    name: 'a check required on the branch and absent from the file is ALSO drift',
    file: { required_status_checks: { strict: true, contexts: ['build'] } },
    got: { required_status_checks: { strict: true, contexts: ['build', 'something-nobody-wrote-down'] } },
    expect: ['required_status_checks'],
  },
  {
    name: 'order is not drift',
    file: { required_status_checks: { strict: true, contexts: ['b', 'a'] } },
    got: { required_status_checks: { strict: true, contexts: ['a', 'b'] } },
    expect: [],
  },
  {
    name: 'a flag turned off behind the file is named',
    file: { enforce_admins: true },
    got: { enforce_admins: { enabled: false } },
    expect: ['enforce_admins'],
  },
  {
    name: 'no protection at all is drift on every field the file states',
    file: { enforce_admins: true, required_linear_history: true },
    got: {},
    expect: ['enforce_admins', 'required_linear_history'],
  },
  {
    name: 'a field the file does not mention is not compared',
    file: { enforce_admins: true },
    got: { enforce_admins: { enabled: true }, lock_branch: { enabled: true } },
    expect: [],
  },
  {
    name: 'review settings compare field by field, not as an object with urls in it',
    file: {
      required_pull_request_reviews: {
        dismiss_stale_reviews: false, require_code_owner_reviews: false,
        require_last_push_approval: false, required_approving_review_count: 0,
      },
    },
    got: {
      required_pull_request_reviews: {
        url: 'https://api.github.com/…', dismiss_stale_reviews: false,
        require_code_owner_reviews: false, require_last_push_approval: false,
        required_approving_review_count: 0,
      },
    },
    expect: [],
  },
  {
    name: 'one more approval than the file says is drift',
    file: { required_pull_request_reviews: { required_approving_review_count: 0 } },
    got: { required_pull_request_reviews: { required_approving_review_count: 1 } },
    expect: ['required_pull_request_reviews'],
  },
];

/**
 * The program lookup, checked both ways.
 *
 * <p>It runs on every real invocation, so a break would be loud — but "loud" here means the tool
 * stops answering the question it exists for, and the REFUSAL is the half that would otherwise
 * never be exercised until somebody's machine was already misconfigured.</p>
 */
function lookupCases() {
  const out = [];

  // RUNNABLE, not merely present. `existsSync` on the answer was the first version of this, and it
  // proves the weaker half of what the caller needs: every use of `resolved()` in this file hands
  // its answer straight to `execFileSync`, so a path that exists and cannot be started is a pass
  // here and a crash there. The assertion is therefore what the program PRINTS.
  try {
    const found = resolved('git');
    const shown = execFileSync(found, ['--version'], { encoding: 'utf8' }).trim();
    out.push({
      name: 'a program that is installed resolves to a path that RUNS',
      ok: path.isAbsolute(found) && shown.startsWith('git version'),
      detail: `${found} -> ${shown}`,
    });
  } catch (error) {
    out.push({ name: 'git resolves and runs', ok: false, detail: error.message });
  }

  // A relative PATH entry must still resolve to an absolute answer, because the caller spawns it
  // from ITS working directory and not from wherever PATH was written.
  //
  // The fixture is the RUNNING INTERPRETER, and two rejected versions are why.
  //
  // The first borrowed the real `git`, made a relative path to it with `path.relative(cwd, dir)` and
  // set PATH to that — and on Windows, where cwd and git sit on different DRIVES, `path.relative`
  // cannot express a relative path at all and hands back an absolute one. The case then tested the
  // thing it was written to catch not happening: it stayed green with the fix deliberately removed.
  //
  // The second BUILT a fixture — an empty `probe-4f2b9c[.exe]`, chmod 0755 — which fixed the drive
  // problem and introduced a quieter one: an empty file passes `existsSync` and passes `X_OK`, and
  // is not a program on any platform. It could only ever prove the path, never the spawn.
  //
  // `process.execPath` is both: a real executable, on every platform, whose own directory can be
  // reached by a RELATIVE entry from its parent without `path.relative` and without a copy. What it
  // prints is checkable against `process.version` — so this case proves the resolved path is not
  // merely absolute and present, but IS the runnable program that was looked up.
  const realPath = process.env.PATH;
  const realCwd = process.cwd();
  try {
    const dir = path.dirname(process.execPath);
    const parent = path.dirname(dir);
    const entry = path.basename(dir);
    const programme = path.basename(process.execPath, path.extname(process.execPath));

    process.chdir(parent);
    process.env.PATH = entry;
    const found = resolved(programme);
    const shown = execFileSync(found, ['--version'], { encoding: 'utf8' }).trim();
    out.push({
      name: 'a RELATIVE entry on PATH resolves to an absolute path that RUNS',
      ok: path.isAbsolute(found) && shown === process.version,
      detail: `PATH=${entry} -> ${found} -> ${shown}`,
    });
  } catch (error) {
    out.push({
      name: 'a RELATIVE entry on PATH resolves to an absolute path that RUNS',
      ok: false,
      detail: error.message,
    });
  } finally {
    process.chdir(realCwd);
    process.env.PATH = realPath;
  }

  // The EMPTY entry, refused on purpose — see the note in `resolved()`. The fixture makes the
  // difference visible rather than arguable: the working directory IS the interpreter's own
  // directory, so the program being looked for is unquestionably there, and an implementation that
  // honoured the empty entry the way `execvp` does would find it. This case asserts it does not.
  let refusedCwd = '';
  try {
    process.chdir(path.dirname(process.execPath));
    process.env.PATH = '';
    resolved(path.basename(process.execPath, path.extname(process.execPath)));
    refusedCwd = 'it searched the current directory, which an empty PATH entry must not mean here';
  } catch (error) {
    refusedCwd = error.message;
  } finally {
    process.chdir(realCwd);
    process.env.PATH = realPath;
  }
  out.push({
    name: 'an EMPTY entry on PATH does not mean the current directory, even when the program is in it',
    ok: refusedCwd.includes('not on PATH'),
    detail: refusedCwd,
  });

  let refused = '';
  try {
    resolved('no-such-program-4f2b9c');
    refused = 'it returned instead of throwing';
  } catch (error) {
    refused = error.message;
  }
  out.push({
    name: 'a program that is NOT installed is refused, by name, rather than spawned',
    ok: refused.includes('no-such-program-4f2b9c') && refused.includes('not on PATH'),
    detail: refused,
  });

  return out;
}

/** Which branches a file speaks for — including the two shapes that must be REFUSED. */
function branchCases() {
  const refused = (file) => {
    try {
      branchesOf(file);
      return '';
    } catch (error) {
      return error.message;
    }
  };
  const shape = (file) => JSON.stringify(branchesOf(file).map((one) => [one.branch, one.body]));

  return [
    {
      name: 'a file with no `branches` key is the body for main, exactly as before',
      ok: shape({ enforce_admins: true }) === JSON.stringify([['main', { enforce_admins: true }]]),
      detail: shape({ enforce_admins: true }),
    },
    {
      name: 'each named branch gets its OWN body, not a shared one',
      ok: shape({ branches: { main: { lock_branch: false }, release: { lock_branch: true } } })
        === JSON.stringify([['main', { lock_branch: false }], ['release', { lock_branch: true }]]),
      detail: shape({ branches: { main: { lock_branch: false }, release: { lock_branch: true } } }),
    },
    {
      name: 'an EMPTY `branches` is refused, not read as "just main"',
      ok: refused({ branches: {} }).includes('naming at least one'),
      detail: refused({ branches: {} }) || 'it returned instead of throwing',
    },
    {
      name: 'a `branches` written as an ARRAY is refused, not read as "just main"',
      ok: refused({ branches: ['main', 'release'] }).includes('mapping branch names'),
      detail: refused({ branches: ['main', 'release'] }) || 'it returned instead of throwing',
    },
  ];
}

function selftest() {
  let failed = 0;
  for (const one of CASES) {
    const got = differences(wanted(one.file), normalise(one.got)).map((d) => d.field);
    const ok = JSON.stringify(got) === JSON.stringify(one.expect);
    if (!ok) {
      failed += 1;
      console.error(`  FAIL  ${one.name}\n        wanted ${JSON.stringify(one.expect)}, got ${JSON.stringify(got)}`);
    }
  }

  const others = [...branchCases(), ...lookupCases()];
  for (const one of others) {
    if (!one.ok) {
      failed += 1;
      console.error(`  FAIL  ${one.name}\n        ${one.detail}`);
    }
  }

  const total = CASES.length + others.length;
  console.log(`branch-protection selftest: ${total - failed}/${total} passed`);
  return failed === 0 ? 0 : 1;
}

/**
 * The 403 a PRIVATE repository on a plan without GitHub Pro gets, said in words.
 *
 * <p>MEASURED, and it is the answer this tool was written to stop somebody guessing at. That
 * repository cannot have branch protection AT ALL — it is not drift and it is not a broken token,
 * it is the feature being unavailable. Saying so is the difference between "somebody forgot" and
 * "this costs money or publicity to fix". Shared by both commands, because it was copied into one
 * and missing from the other, and a tool that explains a state in one command and not the other
 * teaches people the explanation was luck.</p>
 */
function unavailable(error) {
  const said = `${error.stderr ?? ''}${error.stdout ?? ''}${error.message ?? ''}`;
  if (!/Upgrade to GitHub Pro|make this repository public/i.test(said)) {
    return false;
  }
  console.error('branch-protection: this repository cannot have branch protection.');
  console.error('  GitHub answers 403: it is PRIVATE and the plan does not include the feature.');
  console.error('  Nothing in this file can be applied until the repository is public or the');
  console.error('  plan includes it. That is a decision, not a task.');
  return true;
}

function applyTo(file, repo, branch) {
  try {
    // JSON has no comments and this file has things to say, so it carries them under `$` keys.
    // They are for the reader; the API would reject them.
    const sent = Object.fromEntries(
      Object.entries(file).filter(([key]) => !key.startsWith('$')));
    // PUT refuses the call without these two keys even when they are null.
    sent.restrictions = sent.restrictions ?? null;
    sent.required_pull_request_reviews = sent.required_pull_request_reviews ?? null;
    put(repo, branch, sent);
    console.log(`branch-protection: applied to ${repo}@${branch}`);
    return 0;
  } catch (error) {
    if (!unavailable(error)) {
      console.error(`branch-protection: could not write — ${error.message.split('\n')[0]}`);
    }
    return 3;
  }
}

/** What GitHub says the branch has, or `null` when the answer is "stop here". */
function current(repo, branch) {
  try {
    return ask(repo, branch);
  } catch (error) {
    if (unavailable(error)) {
      return null;
    }
    const said = `${error.stderr ?? ''}${error.stdout ?? ''}${error.message ?? ''}`;
    // A 404 is the interesting case and it is NOT "could not look": GitHub answers 404 for a branch
    // with no protection at all, which is the loudest possible drift. The 404 is in the child's
    // STDERR, not in the Error's message, which reads only "Command failed: gh api …" — testing the
    // message alone made this tool answer "could not ask GitHub" for the repository it most needed
    // to speak about.
    if (/HTTP 404|Not Found|Branch not protected/i.test(said)) {
      return {};
    }
    console.error(`branch-protection: could not ask GitHub — ${error.message.split('\n')[0]}`);
    console.error('  this is exit 3, not 1: nothing is known about the branch, which is not the');
    console.error('  same as knowing it is wrong.');
    return null;
  }
}

function checkAgainst(file, repo, branch) {
  const got = current(repo, branch);
  if (got === null) {
    return 3;
  }

  const drift = differences(wanted(file), normalise(got));
  if (drift.length === 0) {
    console.log(`branch-protection: ${repo}@${branch} matches ${path.basename(DEFAULT_FILE)}`);
    return 0;
  }

  console.error(`branch-protection: ${repo}@${branch} DRIFTS from ${path.basename(DEFAULT_FILE)}`);
  for (const one of drift) {
    console.error(`  ${one.field}`);
    console.error(`    file:   ${JSON.stringify(one.wanted)}`);
    console.error(`    github: ${JSON.stringify(one.actual)}`);
  }
  console.error('  `--apply` writes the file to GitHub; it needs a token with repository admin.');
  return 1;
}

function main(argv) {
  if (argv.includes('--selftest')) {
    return selftest();
  }

  let targets;
  let repo;
  try {
    targets = branchesOf(JSON.parse(readFileSync(DEFAULT_FILE, 'utf8')));
    repo = repository();
  } catch (error) {
    console.error(`branch-protection: ${error.message}`);
    return 2;
  }

  const apply = argv.includes('--apply');
  let worst = 0;
  for (const { branch, body } of targets) {
    // The codes are ordered by how little is known, which is why the worst is the largest: 0 both
    // branches match, 1 one of them drifts, 3 one of them could not be looked at. Reporting 0
    // because the OTHER branch was fine would be the lie this tool's exit codes exist to prevent,
    // and stopping at the first bad one would hide the second.
    worst = Math.max(worst, apply ? applyTo(body, repo, branch) : checkAgainst(body, repo, branch));
  }
  return worst;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  process.exit(main(process.argv.slice(2)));
}
