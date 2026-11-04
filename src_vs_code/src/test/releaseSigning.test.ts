import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The release pipeline is wired to sign the Windows binaries of `creds` and `creds-mcp`
 * (todo/PLAN_windows_code_signing.md, §6 T1–T5 and T7). Releases stay unsigned, with a warning,
 * until the owner activates a signing provider.
 *
 * <p>This reads `release.yml` as text, like `credsInstall.test.ts` does: `src_vs_code` has no YAML
 * parser and this adds none. A job is the lines under `  <name>:`, a step is the lines under
 * `      - `, and a comment line is dropped first, so a sentence that explains a rule can never
 * satisfy it or break it.</p>
 *
 * <p>The signing itself cannot run without Azure. What a test CAN pin is the wiring through which
 * signing runs once a provider is active: the release jobs wait for the signing jobs, nothing else
 * may ask for an identity token, the signing workflow is called by a commit, not by a name that
 * moves, and the switch that lets a tag ship unsigned is read from a repository variable and
 * compared with `'true'`.</p>
 */

const WORKFLOW = path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release.yml');
const SIGN_WORKFLOW = 'oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml';
/** The commit the tag `v1.1.0` of the signing repository points at (its squash commit on `main`). */
const SIGN_WORKFLOW_SHA = 'a9a7eccdf76306d8fdbc67fc917cf8d5a362d851';
/** A tag forces the signing decision; so does a dispatch that sets the `required` input. */
const REQUIRED_EXPRESSION = "${{ startsWith(github.ref, 'refs/tags/') || inputs.required }}";
/** The switch is read from a REPOSITORY variable and compared, so only the exact string `true` turns it on. */
const SWITCH_EXPRESSION = "${{ vars.ALLOW_UNSIGNED_RELEASES == 'true' }}";

/** The file with LF endings and no comment lines. A Windows checkout may hold CRLF. */
function readWorkflow(): string {
  const text = fs.readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

/** Everything before `jobs:` — the workflow-level keys. */
function header(text: string): string {
  const at = text.search(/^jobs:\s*$/m);
  assert.ok(at >= 0, 'release.yml has no `jobs:` key');
  return text.slice(0, at);
}

/** The jobs of the file: name → its text (the lines after its `  <name>:` line). */
function jobsOf(text: string): Map<string, string> {
  const at = text.search(/^jobs:\s*$/m);
  assert.ok(at >= 0, 'release.yml has no `jobs:` key');
  const lines = text.slice(at).split('\n').slice(1);
  const jobs = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of lines) {
    const head = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (head) {
      current = [];
      jobs.set(head[1]!, current);
    } else if (current) {
      current.push(line);
    }
  }
  return new Map([...jobs].map(([name, body]) => [name, body.join('\n')]));
}

function job(jobs: Map<string, string>, name: string): string {
  const body = jobs.get(name);
  assert.ok(body !== undefined, `release.yml has no job named ${name}; it has ${[...jobs.keys()].join(', ')}`);
  return body;
}

interface Step {
  /** The step's lines, its keys re-indented to 8 spaces (the dash line included). */
  readonly text: string;
  readonly name: string | undefined;
  readonly uses: string | undefined;
}

/** The step-level key's value, or undefined. A `with:` key is 10 spaces deep and never matches. */
function stepKey(step: string, key: string): string | undefined {
  return new RegExp(`^ {8}${key}:[ \\t]*(\\S.*)$`, 'm').exec(step)?.[1]?.trim();
}

function stepsOf(jobText: string): Step[] {
  const at = jobText.search(/^ {4}steps:\s*$/m);
  assert.ok(at >= 0, 'the job has no steps');
  const parts = jobText
    .slice(at)
    .split('\n')
    .slice(1)
    .reduce<string[][]>((all, line) => {
      if (/^ {6}- /.test(line)) {
        all.push([line.replace(/^ {6}- /, '        ')]);
      } else if (all.length > 0) {
        all[all.length - 1]!.push(line);
      }
      return all;
    }, []);
  return parts.map((lines) => {
    const text = lines.join('\n');
    return { text, name: stepKey(text, 'name'), uses: stepKey(text, 'uses') };
  });
}

function stepNamed(steps: Step[], name: string): Step {
  const found = steps.filter((s) => s.name === name);
  assert.equal(found.length, 1, `expected exactly one step named "${name}", found ${found.length}`);
  return found[0]!;
}

function uploadsOf(steps: Step[]): Step[] {
  return steps.filter((s) => s.uses?.startsWith('actions/upload-artifact@'));
}

/** A key of the step's `with:` block (10 spaces deep). */
function withKey(step: Step, key: string): string | undefined {
  return new RegExp(`^ {10}${key}:[ \\t]*(\\S.*)$`, 'm').exec(step.text)?.[1]?.trim();
}

/** A job-level scalar (4 spaces deep). */
function jobKey(jobText: string, key: string): string | undefined {
  return new RegExp(`^ {4}${key}:[ \\t]*(\\S.*)$`, 'm').exec(jobText)?.[1]?.trim();
}

/** The job-level block under `key:` (children 6 spaces deep) as key → value. */
function jobBlock(jobText: string, key: string): Record<string, string> {
  const lines = jobText.split('\n');
  const at = lines.findIndex((l) => l === `    ${key}:`);
  const out: Record<string, string> = {};
  if (at < 0) {
    return out;
  }
  for (const line of lines.slice(at + 1)) {
    const m = /^ {6}([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!m) {
      break;
    }
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** The `- item` lines under a job-level `key:` with no inline value (items 6 spaces deep). */
function blockListOf(jobText: string, key: string): string[] {
  const lines = jobText.split('\n');
  const at = lines.findIndex((l) => l === `    ${key}:`);
  if (at < 0) {
    return [];
  }
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const m = /^ {6}- (\S+)\s*$/.exec(line);
    if (!m) {
      break;
    }
    out.push(m[1]!);
  }
  return out;
}

/** `needs:` as a list, whether written `a`, `[a, b]` or a block. */
function needsOf(jobText: string): string[] {
  const inline = jobKey(jobText, 'needs');
  if (inline === undefined) {
    return blockListOf(jobText, 'needs');
  }
  return inline.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** The RIDs of the job's matrix that run on Windows. */
function windowsRidsOf(jobText: string): string[] {
  return [...jobText.matchAll(/^\s+- rid:\s*(\S+)\s*$/gm)].map((m) => m[1]!).filter((r) => r.startsWith('win-'));
}

const NOT_WINDOWS = '${{ !startsWith(matrix.rid, \'win-\') }}';
const IS_WINDOWS = 'startsWith(matrix.rid, \'win-\')';

interface Product {
  readonly id: 'cli' | 'mcp';
  readonly exe: string;
}
const PRODUCTS: readonly Product[] = [
  { id: 'cli', exe: 'creds.exe' },
  { id: 'mcp', exe: 'creds-mcp.exe' },
];

const text = readWorkflow();
const jobs = jobsOf(text);

test('the parser sees the jobs it is asked about', () => {
  // A parser that finds nothing would let every assertion below pass over an empty list.
  for (const name of ['cli-binaries', 'cli-release', 'mcp-binaries', 'mcp-release']) {
    job(jobs, name);
  }
  assert.deepEqual(windowsRidsOf(job(jobs, 'cli-binaries')), ['win-x64', 'win-arm64']);
  assert.deepEqual(windowsRidsOf(job(jobs, 'mcp-binaries')), ['win-x64', 'win-arm64']);
  assert.ok(stepsOf(job(jobs, 'cli-binaries')).length > 8, 'the cli build job has steps');
});

for (const p of PRODUCTS) {
  const binaries = `${p.id}-binaries`;

  test(`T1 ${binaries}: a Windows leg uploads an unsigned package, and zips and checksums nothing`, () => {
    const steps = stepsOf(job(jobs, binaries));
    const uploads = uploadsOf(steps);
    assert.equal(uploads.length, 2, `${binaries} has two uploads: the unsigned Windows one and the packaged one`);

    const unsigned = uploads.filter((u) => withKey(u, 'name') === `unsigned-${p.id}-\${{ matrix.rid }}`);
    assert.equal(unsigned.length, 1, `${binaries} must upload unsigned-${p.id}-\${{ matrix.rid }} once`);
    assert.equal(stepKey(unsigned[0]!.text, 'if'), IS_WINDOWS, 'the unsigned upload runs on Windows legs only');
    assert.equal(withKey(unsigned[0]!, 'path'), 'pkg', 'the unsigned upload takes the PARENT directory `pkg`');
    assert.equal(withKey(unsigned[0]!, 'if-no-files-found'), 'error');

    const packaged = uploads.filter((u) => withKey(u, 'name') === `${p.id}-\${{ matrix.rid }}`);
    assert.equal(packaged.length, 1, `${binaries} must upload ${p.id}-\${{ matrix.rid }} once`);
    assert.equal(stepKey(packaged[0]!.text, 'if'), NOT_WINDOWS, 'the packaged upload is for non-Windows legs only');

    assert.equal(
      stepKey(stepNamed(steps, 'Checksum').text, 'if'),
      NOT_WINDOWS,
      'Checksum is for non-Windows legs only: the signed zip is made, and summed, by the signing workflow',
    );
  });

  test(`T1 ${binaries}: the Windows branch of Package builds pkg/$NAME and zips nothing`, () => {
    const run = stepNamed(stepsOf(job(jobs, binaries)), 'Package').text;
    const branch = /if \[\[ "\$RID" == win-\* \]\]; then\n([\s\S]*?)\n\s+else\n/.exec(run)?.[1];
    assert.ok(branch !== undefined, 'Package has no `if [[ "$RID" == win-* ]]` branch');
    assert.doesNotMatch(branch, /7z|zip/, 'the Windows branch must not zip: the signing workflow zips');
    assert.match(branch, /mkdir -p "pkg\/\$NAME"/);
    assert.ok(branch.includes(`cp out/${p.exe} "pkg/$NAME/"`), `the Windows branch must copy ${p.exe} into pkg/$NAME/`);
    assert.doesNotMatch(branch, /ASSET=/, 'a Windows leg has no ASSET: nothing else reads it');
  });

  test(`T5 ${binaries}: Package uses the Version step's $VERSION, and every upload keeps 7 days`, () => {
    const steps = stepsOf(job(jobs, binaries));
    const pack = stepNamed(steps, 'Package').text;
    assert.doesNotMatch(pack, /GITHUB_REF_NAME/, 'on a dispatch from a branch GITHUB_REF_NAME holds the branch name');
    assert.ok(pack.includes('$VERSION'), 'Package must use $VERSION');
    for (const upload of uploadsOf(steps)) {
      assert.equal(
        withKey(upload, 'retention-days'),
        '7',
        `the upload ${withKey(upload, 'name')} in ${binaries} must keep 7 days: a re-run after a signing outage needs it`,
      );
    }
  });
}

for (const p of PRODUCTS) {
  const binaries = `${p.id}-binaries`;
  const sign = `${p.id}-sign`;

  test(`T2 ${sign}: calls the shared signing workflow at a commit, for the Windows legs of ${binaries}, and nothing else`, () => {
    const body = job(jobs, sign);
    const uses = jobKey(body, 'uses');
    assert.ok(uses !== undefined, `${sign} has no job-level uses`);
    assert.equal(
      uses,
      `${SIGN_WORKFLOW}@${SIGN_WORKFLOW_SHA} # v1.1.0`,
      `${sign} must pin the signing workflow to the commit of v1.1.0, never to the tag name`,
    );
    assert.equal(/^ {4}steps:/m.test(body), false, `${sign} is a caller job: it has no steps`);

    const given = JSON.parse((jobBlock(body, 'with')['artifacts'] ?? '').replace(/^'|'$/g, '') || 'null') as unknown;
    assert.ok(Array.isArray(given), `${sign} must pass artifacts as a JSON list`);
    const wanted = windowsRidsOf(job(jobs, binaries)).map((r) => `${p.id}-${r}`);
    const have = given as string[];
    assert.deepEqual(
      {
        missing: wanted.filter((n) => !have.includes(n)),
        extra: have.filter((n) => !wanted.includes(n)),
      },
      { missing: [], extra: [] },
      `artifacts of ${sign} must be exactly the win-* legs of ${binaries}`,
    );

    assert.equal(
      jobBlock(body, 'with')['required'],
      REQUIRED_EXPRESSION,
      `${sign} must force the decision on a tag and on a dispatch with required: true`,
    );
    assert.equal(
      jobBlock(body, 'with')['allow-unsigned-release'],
      SWITCH_EXPRESSION,
      `${sign} must pass the switch as ${SWITCH_EXPRESSION}: a bare variable is a string GitHub never compares with 'true', and a literal cannot be switched off by deleting the variable`,
    );
    assert.deepEqual(
      Object.keys(jobBlock(body, 'with')).sort(),
      ['allow-unsigned-release', 'artifacts', 'own-files', 'required'],
      `${sign} passes the four inputs it needs; extra-files and environment keep their defaults`,
    );
    assert.deepEqual(jobBlock(body, 'permissions'), { contents: 'read', 'id-token': 'write' });
    assert.equal(
      jobKey(body, 'if'),
      jobKey(job(jobs, binaries), 'if'),
      `${sign} runs exactly when ${binaries} does`,
    );
    assert.deepEqual(needsOf(body), [binaries]);
  });

  test(`T5 ${sign}: own-files names this product's own binary`, () => {
    const raw = jobBlock(job(jobs, sign), 'with')['own-files'];
    assert.equal(raw, `'["${p.exe}"]'`);
  });
}

test('T3 each release job waits for its signing job', () => {
  assert.ok(needsOf(job(jobs, 'cli-release')).includes('cli-sign'), 'cli-release must need cli-sign');
  assert.ok(needsOf(job(jobs, 'cli-release')).includes('cli-binaries'), 'cli-release must still need cli-binaries');
  assert.ok(needsOf(job(jobs, 'mcp-release')).includes('mcp-sign'), 'mcp-release must need mcp-sign');
  assert.ok(needsOf(job(jobs, 'mcp-release')).includes('mcp-binaries'), 'mcp-release must still need mcp-binaries');
});

/** What lets a job mint an OIDC token: the named permission, or `write-all`, which includes it. */
const GRANTS_TOKEN = /id-token|write-all/;

test('T4 no job but cli-sign and mcp-sign asks for an identity token, by name or by write-all', () => {
  assert.doesNotMatch(header(text), GRANTS_TOKEN, 'the workflow-level permissions must not grant an identity token');
  const holders = [...jobs]
    .filter(([name, body]) => name !== 'cli-sign' && name !== 'mcp-sign' && GRANTS_TOKEN.test(body))
    .map(([name]) => name);
  assert.deepEqual(holders, [], 'only cli-sign and mcp-sign may grant an identity token (T2 asserts they do)');
  // One positive, so a parser that lost the jobs cannot make this green.
  assert.ok(jobs.size >= 8, `the parser found ${jobs.size} jobs`);
});

test('T7 no job that calls the signing workflow passes `environment`', () => {
  // The permission to sign trusts the environment NAME, so no caller may pass one: the shared
  // workflow's default, `release-signing`, is the only name the owner's trust is written for.
  // Callers are found by their job-level `uses`, not by a name list, so a third caller is covered.
  const callers = [...jobs]
    .filter(([, body]) => jobKey(body, 'uses')?.startsWith(`${SIGN_WORKFLOW}@`) === true)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(callers, ['cli-sign', 'mcp-sign'], 'the callers of the signing workflow');
  for (const name of callers) {
    const body = job(jobs, name);
    assert.equal(
      Object.keys(jobBlock(body, 'with')).includes('environment'),
      false,
      `${name} must not pass \`environment\` in with:`,
    );
    assert.equal(jobKey(body, 'environment'), undefined, `${name} must not have a job-level environment`);
    assert.equal(/^ {4}environment:/m.test(body), false, `${name} must not have a job-level environment block`);
  }
});

/** The lines under `on.workflow_dispatch.inputs:` (6 spaces deep and more), up to the next key of the header. */
function dispatchInputLines(head: string): string[] {
  const at = head.search(/^ {2}workflow_dispatch:\s*$/m);
  assert.ok(at >= 0, 'release.yml has no `workflow_dispatch:` trigger');
  const lines = head.slice(at).split('\n').slice(1);
  const inputsAt = lines.findIndex((l) => /^ {4}inputs:\s*$/.test(l));
  assert.ok(inputsAt >= 0, 'workflow_dispatch has no `inputs:`');
  const block = lines.slice(inputsAt + 1);
  const end = block.findIndex((l) => l.trim() !== '' && !/^ {6}/.test(l));
  return end < 0 ? block : block.slice(0, end);
}

/** The keys (8 spaces deep) of one input block as key → value. */
function inputKeys(lines: string[]): Record<string, string> {
  const pairs = lines
    .map((l) => /^ {8}([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m): [string, string] => [m[1]!, m[2]!.trim()]);
  return Object.fromEntries(pairs);
}

/** The input blocks of the dispatch: input name → its keys. */
function dispatchInputs(head: string): Map<string, Record<string, string>> {
  const parts = dispatchInputLines(head)
    .join('\n')
    .split(/^(?= {6}[A-Za-z0-9_-]+:\s*$)/m)
    .filter((part) => part.trim() !== '');
  return new Map(
    parts.map((part): [string, Record<string, string>] => {
      const [first = '', ...rest] = part.split('\n');
      return [first.trim().replace(/:$/, ''), inputKeys(rest)];
    }),
  );
}

test('T8 the dispatch input `required` is a boolean that defaults to false', () => {
  // A trial is a dispatch that is NOT forced. `default: true`, or a string type (whose value is
  // always truthy in an expression), would turn every trial into a forced run.
  const inputs = dispatchInputs(header(text));
  assert.ok(inputs.has('target'), 'the parser must find the existing `target` input');
  const required = inputs.get('required');
  assert.ok(required !== undefined, 'workflow_dispatch has no input named `required`');
  assert.equal(required['type'], 'boolean', 'the input `required` must be a boolean');
  assert.equal(required['default'], 'false', 'the input `required` must default to false: a trial is not forced');
  assert.equal(required['description'], "'force the signing decision as on a release tag'");
});
