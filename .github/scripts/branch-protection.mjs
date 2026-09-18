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
 * <p>The JSON is exactly the PUT body the API takes, so `--apply` sends the file and nothing
 * translates it on the way. What DOES need translating is the answer: a GET comes back with URLs,
 * `{enabled: true}` wrappers and a `checks` array beside `contexts`. That normalisation is the only
 * real logic here, and `--selftest` is what holds it.</p>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
      contexts: [...(got.required_status_checks.contexts ?? [])].sort(),
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

function repository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const match = /[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) {
    throw new Error(`cannot read owner/name out of the origin remote: ${url}`);
  }
  return match[1];
}

function ask(repo, branch) {
  return JSON.parse(execFileSync(
    'gh', ['api', `repos/${repo}/branches/${branch}/protection`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function put(repo, branch, body) {
  return JSON.parse(execFileSync(
    'gh', ['api', '--method', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
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
  console.log(`branch-protection selftest: ${CASES.length - failed}/${CASES.length} passed`);
  return failed === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--selftest')) {
    return selftest();
  }

  const branch = 'main';
  let file;
  try {
    file = JSON.parse(readFileSync(DEFAULT_FILE, 'utf8'));
  } catch (error) {
    console.error(`branch-protection: cannot read ${DEFAULT_FILE} — ${error.message}`);
    return 2;
  }

  let repo;
  try {
    repo = repository();
  } catch (error) {
    console.error(`branch-protection: ${error.message}`);
    return 2;
  }

  if (argv.includes('--apply')) {
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
      console.error(`branch-protection: could not write — ${error.message.split('\n')[0]}`);
      return 3;
    }
  }

  let got;
  try {
    got = ask(repo, branch);
  } catch (error) {
    // A 404 here is the interesting case and it is NOT "could not look": GitHub answers 404 for a
    // branch with no protection at all, which is the loudest possible drift — and it is the state
    // `dew_flow_rag_qln` was actually in when this was written.
    //
    // The 404 is in the child's STDERR, not in the Error's message, which reads only "Command
    // failed: gh api …". Testing the message alone made this tool answer "could not ask GitHub" for
    // the one repository it most needed to speak about.
    const said = `${error.stderr ?? ''}${error.stdout ?? ''}${error.message ?? ''}`;

    // MEASURED, and it is the answer this tool was written to stop somebody guessing at. A PRIVATE
    // repository on a plan without GitHub Pro cannot have branch protection AT ALL: the API answers
    // 403 "Upgrade to GitHub Pro or make this repository public to enable this feature". That is not
    // drift and it is not a broken token — it is the feature being unavailable, and saying so is the
    // difference between "somebody forgot" and "this costs money or publicity to fix".
    if (/Upgrade to GitHub Pro|make this repository public/i.test(said)) {
      console.error('branch-protection: this repository cannot have branch protection.');
      console.error('  GitHub answers 403: it is PRIVATE and the plan does not include the feature.');
      console.error('  Nothing in this file can be applied until the repository is public or the');
      console.error('  plan includes it. That is a decision, not a task.');
      return 3;
    }

    if (/HTTP 404|Not Found|Branch not protected/i.test(said)) {
      got = {};
    } else {
      console.error(`branch-protection: could not ask GitHub — ${error.message.split('\n')[0]}`);
      console.error('  this is exit 3, not 1: nothing is known about the branch, which is not the');
      console.error('  same as knowing it is wrong.');
      return 3;
    }
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  process.exit(main(process.argv.slice(2)));
}
