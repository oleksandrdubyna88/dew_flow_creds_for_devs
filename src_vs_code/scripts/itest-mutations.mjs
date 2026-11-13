// The itest halves of the §S6.6 mutations of the E1.6 spec (CI only: they need `sshd` and the mysql clients).
//
//   node scripts/itest-mutations.mjs            run every mutation (after an unmutated baseline run)
//   node scripts/itest-mutations.mjs --dry      only check that every edit applies to the source
//   node scripts/itest-mutations.mjs T1 T13     named mutations only
//
// The loop for each mutation: apply ONE edit to ONE source file, compile as the itest step does (`npm run compile`), run only the legs the row
// names (`BRIDGED_ITEST_LEGS`), record whether a check that names the leg FAILED, and restore the file with `git checkout`. The table is printed at
// the end. A check that already fails in the unmutated baseline is left out of the count (marked `baseline`).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'src/';
const SSH = 'scripts/bridged-ssh-itest.cjs';
const MYSQL = 'scripts/bridged-mysql-itest.cjs';

/** One mutation: the file, the edits (text to text), the harness, the legs it runs, and the check-name tags a failing line must carry. */
const M = (id, what, file, edits, legs, tags, harness = SSH) => ({ id, what, file: SRC + file, edits, legs, tags, harness });

const mutations = [
  M('T1', 'drop IdentityAgent none from BRIDGED_LOCKDOWN', 'bridgedSshConfig.ts', [["  ['IdentityAgent', 'none'],\n", '']], 'd', ['(d): production with SSH_AUTH_SOCK put back']),
  M('T2', 'drop BatchMode, PasswordAuthentication, KbdInteractiveAuthentication together', 'bridgedSshConfig.ts',
    [["  ['BatchMode', 'yes'],\n  ['PasswordAuthentication', 'no'],\n  ['KbdInteractiveAuthentication', 'no'],\n", '']], 'a', ['(a) 6:', '(a) 0:']),
  M('T2b', 'drop BatchMode yes alone', 'bridgedSshConfig.ts', [["  ['BatchMode', 'yes'],\n", '']], 'a', ['(a) 0:']),
  M('T2c', 'drop PasswordAuthentication no alone', 'bridgedSshConfig.ts', [["  ['PasswordAuthentication', 'no'],\n", '']], 'a', ['(a) 0:']),
  M('T2d', 'drop KbdInteractiveAuthentication no alone', 'bridgedSshConfig.ts', [["  ['KbdInteractiveAuthentication', 'no'],\n", '']], 'a', ['(a) 0:']),
  M('T3', 'write the Host * block first', 'bridgedSshConfig.ts', [["    ...input.hops.flatMap((hop, at) => hopBlock(hopWords[at] as string, hop, input)),\n    ...destinationBlock(words[words.length - 1] as string, input.destination.pinnedFile),\n    ...lockdownBlock(input),\n", "    ...lockdownBlock(input),\n    ...input.hops.flatMap((hop, at) => hopBlock(hopWords[at] as string, hop, input)),\n    ...destinationBlock(words[words.length - 1] as string, input.destination.pinnedFile),\n"]], 'f,h', ['(f):', '(h):']),
  M('T6', 'make the Host word lower case', 'bridgedSshConfig.ts', [["  return /[:[\\]]/.test(host) ? ipv6Word(host, leg) : host;", "  return /[:[\\]]/.test(host) ? ipv6Word(host, leg) : host.toLowerCase();"]], 'k', ['(k):']),
  M('T7', 'spread the source into the answer of bridgedSshEnv', 'bridgedSshEnv.ts', [["  return { ...Object.fromEntries(taken), ...extra };", "  return { ...source, ...Object.fromEntries(taken), ...extra };"]], 'b', ['(b): and the environment']),
  M('T9', 'let a password hop pass', 'bridgedSshRefusals.ts', [["  return input.hops.map(hopKeyOf).find(isRefusal);", "  return undefined;"]], 'e', ['(e):']),
  M('T10', 'let an unpinned password destination pass', 'bridgedSshRefusals.ts', [["  return input.auth === 'askpass' && pinLineOf(input.destination, word) === undefined ? noCredential(sentences.passwordNoPin(input.destination.name)) : undefined;", "  return undefined;"]], 'f', ['(f): an unpinned password destination']),
  M('T12', 'put -o UserKnownHostsFile= back on a bridge', 'sshExecCommand.ts', [["    return ['-o', `StrictHostKeyChecking=${options.pinned === true ? 'yes' : 'accept-new'}`];", "    return ['-o', `StrictHostKeyChecking=${options.pinned === true ? 'yes' : 'accept-new'}`, '-o', 'UserKnownHostsFile=/dev/null'];"]], 'h', ['(h):']),
  M('T13', 'drop -F from the bridged argv', 'sshExecCommand.ts', [["'-F', configFile];", "];"]], 'a,e,i', ['(a) 6:', '(e):', '(i)']),
  M('T15', 'put the first-contact file in the keys folder', 'bridgedSshRefusals.ts', [["export const firstContactPath = (base: BridgedBase): string => path.join(base.storageDir, 'bridges', 'known_hosts');", "export const firstContactPath = (base: BridgedBase): string => materializedKeyPath(base.storageDir, 'known_hosts');"]], 'f', ['(f):']),
  M('T16', 'bridgedSpawn answers the keys folder as cwd', 'bridgedSshCall.ts', [["cwd: input.files.cwd };", "cwd: path.dirname(input.files.cwd) };"]], 'e,k', ['(e): production: the call logs in', '(k): a pinned hop typed LocalHost']),
  M('T18a', 'drop --no-defaults', 'dbCliLauncher.ts', [["...(bridged ? ['--no-defaults'] : []), ", ""]], '', ['(m)'], MYSQL),
  M('T18b', 'move --no-defaults to the end', 'dbCliLauncher.ts', [["const args = [...(bridged ? ['--no-defaults'] : []), '-h', parts.host ?? 'localhost'];", "const args = ['-h', parts.host ?? 'localhost'];"], ["      args.push('--skip-named-commands', '--delimiter=;', '--local-infile=0', '-e', query);", "      args.push('--skip-named-commands', '--delimiter=;', '--local-infile=0', '-e', query, ...(bridged ? ['--no-defaults'] : []));"]], '', ['(m)'], MYSQL),
  M('T21', 'write a hop IdentityFile under Host *, not in its block', 'bridgedSshConfig.ts', [["keyword('IdentityFile', hop.typedKeyPath ? typedPath(hop.identityFile) : ownPath(hop.identityFile)), ", ''], ["      ? [keyword('IdentityFile', ownPath(input.noDefaultIdentity))]", "      ? [keyword('IdentityFile', ownPath(input.noDefaultIdentity)), ...input.hops.map((hop) => keyword('IdentityFile', hop.typedKeyPath ? typedPath(hop.identityFile) : ownPath(hop.identityFile)))]"]], 'e', ['(e):']),
  M('T24a', 'skip the user rule in the writer', 'bridgedSshRefusals.ts', [["  return userRefusal(input) ?? hostRefusal(input) ?? sameHostRefusal(input);", "  return hostRefusal(input) ?? sameHostRefusal(input);"]], 'j', ['(j):']),
  M('T24b', 'skip the user rule in buildSshExecArgv too', 'sshExecCommand.ts', [["const userTaken = (entity: EntityMetadata): boolean => entity.user === undefined || entity.user.length === 0 || !unsafeBridgedUser(entity.user);", "const userTaken = (_entity: EntityMetadata): boolean => true;"]], 'j', []),
  M('T26', 'drop the sentinel IdentityFile line from Host *', 'bridgedSshConfig.ts', [["      ? [keyword('IdentityFile', ownPath(input.noDefaultIdentity))]", "      ? []"]], 'n', ['(n)']),
  M('T28', 'skip the open for append of the first-contact file', 'bridgedSshCall.ts', [["    fs.closeSync(fs.openSync(firstContactPath(base), 'a', 0o600));\n", ""]], 'f', ['(f): bridges/known_hosts made read-only']),
  M('T30', 'write the pin line with the host as typed', 'bridgedSshRefusals.ts', [["knownHostsLine(word.toLowerCase(), entity.port, key)", "knownHostsLine(word, entity.port, key)"]], 'k', ['(k):']),
];

const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024 });
const failLines = (out) => out.split('\n').filter((l) => l.startsWith('FAIL ')).map((l) => l.slice(5).trim());
const harnessRun = (m) => run('node', [m.harness], m.legs === '' ? {} : { BRIDGED_ITEST_LEGS: m.legs });

function applied(m) {
  const original = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  let text = original;
  for (const [from, to] of m.edits) {
    if (!text.includes(from)) {
      return undefined;
    }
    text = text.replace(from, () => to);
  }
  return text;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const chosen = mutations.filter((m) => only.length === 0 || only.includes(m.id));
if (process.argv.includes('--dry')) {
  for (const m of chosen) {
    console.log(`${m.id.padEnd(5)} ${applied(m) === undefined ? 'DOES NOT APPLY' : 'applies'}  ${m.what}`);
  }
  process.exit(0);
}

console.log('== baseline (no mutation), both harnesses, every leg');
const baseline = new Set([...failLines(run('node', [SSH]).stdout), ...failLines(run('node', [MYSQL]).stdout)]);
console.log(baseline.size === 0 ? 'baseline: green' : `baseline: ${baseline.size} check(s) already FAIL, left out of the count:\n  ${[...baseline].join('\n  ')}`);

const rows = [];
for (const m of chosen) {
  const text = applied(m);
  if (text === undefined) {
    rows.push({ m, verdict: 'NOT APPLIED', lines: ['the edit does not apply to this source'] });
    continue;
  }
  let compiled;
  try {
    fs.writeFileSync(path.join(ROOT, m.file), text);
    compiled = run('npm', ['run', 'compile']);
    // `tsc` emits despite type errors (a mutation may leave an unused import): the harness runs on what was emitted, and the row says so.
    const out = harnessRun(m);
    const fails = out === undefined ? [] : failLines(out.stdout + out.stderr).filter((l) => !baseline.has(l));
    const named = fails.filter((l) => m.tags.length === 0 || m.tags.some((tag) => l.includes(tag)));
    rows.push({ m, verdict: (named.length > 0 ? 'yes' : 'NO (SURVIVED)') + (compiled.status === 0 ? '' : ' [tsc errors]'), lines: named.length > 0 ? named : fails.map((l) => `(other) ${l}`) });
    if (fails.length === 0 && out.status !== 0) {
      rows.at(-1).lines.push(`exit ${out.status}: ${(out.stdout + out.stderr).split('\n').slice(-6).join(' | ')}`);
    }
  } finally {
    run('git', ['checkout', '--', m.file]);
  }
  console.log(`${m.id}: ${rows.at(-1).verdict}`);
}
run('npm', ['run', 'compile']);

console.log('\n==== MUTATION TABLE (itest halves of §S6.6) ====');
console.log('mutation | legs | failed | the failing check');
for (const { m, verdict, lines } of rows) {
  console.log(`${m.id} | ${m.harness === MYSQL ? '(m)' : m.legs} | ${verdict} | ${lines.slice(0, 3).join(' ;; ') || '-'}`);
}
const survived = rows.filter((r) => !r.verdict.startsWith('yes')).map((r) => r.m.id);
console.log(survived.length === 0 ? '\nevery mutation failed its leg' : `\nNOT failed (survived, not applied or compile error): ${survived.join(', ')}`);
