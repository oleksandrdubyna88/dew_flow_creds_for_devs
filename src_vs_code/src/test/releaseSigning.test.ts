import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The Windows binaries of `creds` and `creds-mcp` are signed before a release publishes them
 * (todo/PLAN_windows_code_signing.md, §6 T1–T5).
 *
 * <p>This reads `release.yml` as text, like `credsInstall.test.ts` does: `src_vs_code` has no YAML
 * parser and this adds none. A job is the lines under `  <name>:`, a step is the lines under
 * `      - `, and a comment line is dropped first, so a sentence that explains a rule can never
 * satisfy it or break it.</p>
 *
 * <p>The signing itself cannot run without Azure. What a test CAN pin is the wiring that makes it
 * impossible to skip: the release jobs wait for the signing jobs, nothing else may ask for an
 * identity token, and the signing workflow is called by a commit, not by a name that moves.</p>
 */

const WORKFLOW = path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release.yml');
const SIGN_WORKFLOW = 'oleksandrdubyna88/dew_flow_release_signing/.github/workflows/sign-windows.yml';

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

/** `needs:` as a list, whether written `a`, `[a, b]` or a block. */
function needsOf(jobText: string): string[] {
  const inline = jobKey(jobText, 'needs');
  if (inline !== undefined) {
    return inline.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const lines = jobText.split('\n');
  const at = lines.findIndex((l) => l === '    needs:');
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
    assert.match(
      uses,
      new RegExp(`^${SIGN_WORKFLOW.replace(/[.]/g, '\\.')}@[0-9a-f]{40}( +# +v\\d+\\.\\d+\\.\\d+)?$`),
      `${sign} must pin the signing workflow to a 40-hex commit`,
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

    assert.equal(jobBlock(body, 'with')['required'], '${{ startsWith(github.ref, \'refs/tags/\') }}');
    assert.deepEqual(
      Object.keys(jobBlock(body, 'with')).sort(),
      ['artifacts', 'own-files', 'required'],
      `${sign} passes the three inputs it needs; extra-files and environment keep their defaults`,
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

test('T4 no job but cli-sign and mcp-sign asks for an identity token', () => {
  assert.doesNotMatch(header(text), /id-token/, 'the workflow-level permissions must not grant id-token');
  const holders = [...jobs]
    .filter(([name, body]) => name !== 'cli-sign' && name !== 'mcp-sign' && /id-token/.test(body))
    .map(([name]) => name);
  assert.deepEqual(holders, [], 'only cli-sign and mcp-sign may hold id-token (T2 asserts they do)');
  // One positive, so a parser that lost the jobs cannot make this green.
  assert.ok(jobs.size >= 8, `the parser found ${jobs.size} jobs`);
});
