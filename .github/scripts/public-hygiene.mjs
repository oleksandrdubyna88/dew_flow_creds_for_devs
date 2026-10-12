#!/usr/bin/env node
// Public-repo hygiene: this repository is PUBLIC, so no tracked file may carry a real person's
// e-mail address, a real home path, a private network address, or a private project name.
//
//   node .github/scripts/public-hygiene.mjs              scan every tracked file (exit 1 on a finding)
//   node .github/scripts/public-hygiene.mjs --selftest   prove each rule fires, against fixtures
//   node .github/scripts/public-hygiene.mjs --hash "x"   print the digest of a name to add below
//
// Every rule is an ALLOWLIST or a DIGEST, never a list of the forbidden strings: a check that spelled
// out what must not be published would itself publish it. The output reaches a PUBLIC CI log, so it
// never prints a name the digest list matched — not as a match, not inside an address or a home
// path, and not as the path of the file that holds it.
//
//   e-mail      the domain must be reserved (RFC 2606 / RFC 6761, `.internal`; any subdomain) or one
//               of the fictional domains the fixtures already use (exactly); at a public mail service
//               the WHOLE address must be a known generic one. A colleague's work address fails.
//   private-ip  an RFC 1918 address must be one of the exact neutral addresses fixtures use.
//   home-path   the user folder of C:\Users\<x>, /c/Users/<x>, /cygdrive/c/Users/<x>,
//               /mnt/<d>/Users/<x>, \\wsl$\<distro>\home\<x>, /home/<x>, /Users/<x> must be a
//               placeholder (`<you>`, `…`, `me`, `dev`, …).
//   name        no word, and no two words joined by one `-`, `_`, `.`, space or slash, may hash to a
//               digest in PRIVATE_NAME_DIGESTS (SHA-256 of the lower-cased letters and digits).
//               A digest of a short name can be brute-forced: this keeps the list from READING as a
//               list of names, it does not make the names secret. The names were already public in
//               history; the point is that they do not come back.
//
// Not covered, on purpose: a fragment of a real secret (no pattern tells one from a fixture); a name
// inside a longer identifier, a name of three or more words, a non-ASCII name; binary files (any NUL
// byte — counted in the output); and the deploy workflow's own name, which is functional (its GitHub
// environment holds the secrets). This file is scanned like any other, so its own fixtures are built
// from fragments at run time.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// RFC 2606 / RFC 6761 and ICANN's private-use `.internal` (2024): nobody can own a name under them,
// so the domain and every subdomain pass. The one right answer for a new fixture.
const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net', 'example', 'test', 'invalid', 'localhost', 'internal'];

// Fictional domains the existing fixtures use. They are registrable, so they pass EXACTLY — a
// subdomain of one is someone's real host — and only the hosts the fixtures name are listed.
const FICTIONAL_DOMAINS = new Set([
  'corp', 'corp.com', 'corp.dev', 'corp.io', 'company.com', 'x.com', 'x.dev', 'x.io', 'b.com',
  'home.io', 'personal.io', 'db.host', 'db.corp', 'db.corp.com',
  // Not domains at all, but text the pattern reads as one: two fields concatenated (teamSearch.ts
  // shows what that would match) and a vault file name.
  'corp.comadmin', 'corp.comgoogle', 'corp.com.enc',
]);

// Public services hold real people's mailboxes, so an address there passes only with a local part
// that names nobody — a first and last name at one of them fails.
const PUBLIC_SERVICE_ADDRESSES = new Map([
  ['gmail.com', ['me', 'user', 'user1', 'user2', 'friend', 'personal']],
  ['g-mail.com', ['user.two+dev']],
  ['outlook.com', ['me', 'user1', 'user2']],
  ['github.com', ['git']],
  ['gitlab.com', ['git']],
  ['bitbucket.org', ['git']],
  ['ssh.dev.azure.com', ['git']],
]);

const PLACEHOLDER_USERS = [
  'you', '<you>', 'me', 'dev', 'ada', 'a', 'u', 'o', 'someone', 'user', 'alice', 'bob', 'runner', '...', '…',
  "o'brien", "o''brien", // the quote-escaping fixtures in vpnLauncher.test.ts
];

// Exact addresses, not ranges: a neighbour of an allowed address could be a real host as easily as
// any other. A new fixture uses RFC 5737 (192.0.2.x, 198.51.100.x, 203.0.113.x), which this rule
// never sees; one that must be private-range adds its address here.
const NEUTRAL_PRIVATE_IPS = new Set([
  '10.0.0.0', '10.0.0.1', '10.0.0.4', '10.0.0.5', '10.0.0.7', '10.0.0.12', '10.0.0.21', '10.0.0.22',
  '10.255.255.1', // the conventional black hole: a connection that never completes
  '172.16.0.0', '192.168.0.0', '192.168.1.10',
]);

const PRIVATE_NAME_DIGESTS = new Set([
  'bb2db1046f5e37f5d88bf0e9752fa3c301afd7c51bd82b96af20f9a572760117',
  '298d180f7545465cd6b6518d629806a67b4598fb2c69c99be13f27daaadb98e8',
  '501135ae646f2d9643787890f1c505e52ef18b39e917e3d5ea41aec8049ca0a4',
  '6b8a90d3bd82e6d9ed9b2e2aac5fb93b63a6999fdad81f9c3cb7dcd051d71618',
  '766da7a7a9eb8c2b73675feff41472887245a1f9481ed5e455b242c80ad02bf8',
  '1e6b5eaa25f4daef30612c273129babeb08f15ea3bbf7cdc8c3a4c7e822aaf8d',
  '61339d15811a8561bba242e31d67e3eb70164f8eec747533e773c05851357dad',
  'a7ba0b236260c1bbfe9cdfa62462fb1019f3efe8542cf0ea537f193835d86765',
]);

// At most this many findings per line and per rule: a generated line repeating one match a million
// times must not hold a million objects. The first ones are enough to find and fix it.
const MAX_PER_LINE = 50;

const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const RFC1918 = /(?<![\d.])(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?![\d.]*\d)/g;
const SEP = String.raw`(?:\\\\|\\|/)`;
const HOME_ROOTS = [
  String.raw`\b[A-Za-z]:${SEP}Users`, // C:\Users, also JSON-escaped
  String.raw`/mnt/[a-z]/Users`, // WSL
  String.raw`(?<![\w.])/[a-z]/Users`, // Git Bash, MSYS
  String.raw`/cygdrive/[a-z]/Users`, // Cygwin
  String.raw`(?:\\{2,4}|//)wsl(?:\$|\.localhost)${SEP}[^\\/\s"'\x60]+${SEP}home`, // \\wsl$\<distro>\home
  String.raw`(?<![\w.])/home`,
  String.raw`(?<![\w.~])/Users`,
];
// The user folder may hold a quote (o'brien); a quote that ENDS it closes a string literal instead.
const HOME = new RegExp(String.raw`(?:${HOME_ROOTS.join('|')})${SEP}([^\\/\s"\x60)\]}<>,;:=*]+|<[^>\s]*>)`, 'g');
const WORD = /[a-z0-9]+/g;

const digestCache = new Map();

export function digest(name) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let d = digestCache.get(key);
  if (d === undefined) {
    d = createHash('sha256').update(key).digest('hex');
    if (digestCache.size >= 200_000) digestCache.clear(); // a bound, not an eviction policy
    digestCache.set(key, d);
  }
  return d;
}

function addressAllowed(local, domain) {
  const d = domain.toLowerCase();
  const service = PUBLIC_SERVICE_ADDRESSES.get(d);
  if (service) return service.includes(local.toLowerCase());
  if (FICTIONAL_DOMAINS.has(d)) return true;
  // The domain itself or a subdomain of it — never a domain that merely STARTS with a reserved one:
  // `example.com.attacker.org` is a real domain someone else can own.
  return RESERVED_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`));
}

function ipAllowed(ip) {
  return NEUTRAL_PRIVATE_IPS.has(ip);
}

function userAllowed(user) {
  const u = user.replace(/'+$/, '').toLowerCase();
  return PLACEHOLDER_USERS.includes(u) || u.startsWith('<') || u.startsWith('$') || u.startsWith('%');
}

/** Words and joined pairs whose digest is listed, at most `limit` of them. */
function nameHits(text, digests, limit = MAX_PER_LINE) {
  const lower = text.toLowerCase();
  const hits = [];
  // Streamed, holding only the previous word: one minified 8 MiB line is millions of matches, and
  // materialising them all at once cost 427 MB of heap (measured).
  let prev = null;
  let prevEnd = -2;
  for (const m of lower.matchAll(WORD)) {
    if (hits.length >= limit) break;
    const word = m[0];
    if (digests.has(digest(word))) hits.push(word);
    const joiner = lower[prevEnd];
    if (prev !== null && m.index === prevEnd + 1 && /[-_. /\\]/.test(joiner) && digests.has(digest(prev + word))) {
      hits.push(`${prev}${joiner}${word}`);
    }
    prev = word;
    prevEnd = m.index + word.length;
  }
  return hits;
}

function holdsName(text, digests) {
  return nameHits(text, digests, 1).length > 0;
}

const MASKED_PATH = '(a tracked path holding a private name';

/** What a finding prints as its match: the text itself, unless that text holds a listed name. */
function shown(text, digests) {
  return holdsName(text, digests) ? '(a match holding a private name)' : text;
}

function* capped(iterable, limit = MAX_PER_LINE) {
  let n = 0;
  for (const item of iterable) {
    if (n++ >= limit) return;
    yield item;
  }
}

/** Every finding in one line of text: [{ rule, match }]. */
export function scanLine(line, digests = PRIVATE_NAME_DIGESTS) {
  const out = [];
  // No `@`, no address: and the e-mail pattern backtracks on a long line that holds none.
  const emails = line.includes('@') ? line.matchAll(EMAIL) : [];
  for (const m of capped(emails)) if (!addressAllowed(m[1], m[2])) out.push({ rule: 'e-mail', match: shown(m[0], digests) });
  for (const m of capped(line.matchAll(RFC1918))) if (!ipAllowed(m[1])) out.push({ rule: 'private-ip', match: m[1] });
  for (const m of capped(line.matchAll(HOME))) if (!userAllowed(m[1])) out.push({ rule: 'home-path', match: shown(m[0], digests) });
  for (const n of nameHits(line, digests)) out.push({ rule: 'name', match: '(a private name; see the digest list)', word: n });
  return out;
}

/** Findings on a tracked file's PATH itself (line 0). */
export function pathFindings(file, digests = PRIVATE_NAME_DIGESTS) {
  return scanLine(file, digests).map((f) => ({ file, line: 0, ...f }));
}

/** The output lines for a list of findings. Every one of them reaches a PUBLIC CI log. */
export function formatFindings(findings, digests = PRIVATE_NAME_DIGESTS) {
  // A path that itself holds a private name is never printed — not for its own finding, and not for
  // the findings on its lines. It is numbered instead; `git ls-files` plus `--hash` finds it locally.
  // Decided from the path itself, never from whether its own finding was kept.
  const masked = new Map();
  const shownPath = (file) => {
    if (!holdsName(file, digests)) return file;
    if (!masked.has(file)) masked.set(file, masked.size + 1);
    return `${MASKED_PATH}, #${masked.get(file)})`;
  };
  return findings.map((f) => {
    const file = shownPath(f.file);
    const where = f.line ? `${file}:${f.line}` : `${file} (path)`;
    return `${where}  ${f.rule}  ${f.match}`;
  });
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

/** The file's bytes; null for the two expected non-files, and any other error is raised. */
export function readTracked(file, digests = PRIVATE_NAME_DIGESTS, read = readFileSync) {
  try {
    return read(file);
  } catch (e) {
    // EISDIR: a gitlink (the shared-rules submodule). ENOENT: deleted in the working tree.
    if (e.code === 'EISDIR' || e.code === 'ENOENT') return null;
    // The code only: a system message can carry the path, and the path may hold a name.
    const where = holdsName(file, digests) ? `${MASKED_PATH})` : file;
    throw new Error(`public hygiene: cannot read tracked file ${where}: ${e.code ?? 'unknown error'}`);
  }
}

/** Collects findings: counts every one, keeps the first `keep` for printing. */
export function createReport(keep = Infinity) {
  const report = { findings: [], total: 0, byRule: {}, binary: 0 };
  report.add = (f) => {
    report.total++;
    report.byRule[f.rule] = (report.byRule[f.rule] ?? 0) + 1;
    if (report.findings.length < keep) report.findings.push(f);
  };
  return report;
}

// What is printed is the start of the list; the summary counts all of it.
const MAX_PRINTED = 500;

function scanTree() {
  const report = createReport(MAX_PRINTED);
  for (const file of trackedFiles()) {
    for (const f of pathFindings(file)) report.add(f);
    const buf = readTracked(file);
    if (buf === null) continue;
    if (buf.includes(0)) {
      report.binary++; // images, archives, UTF-16: not text this check can read
      continue;
    }
    buf.toString('utf8').split('\n').forEach((text, i) => {
      for (const f of scanLine(text)) report.add({ file, line: i + 1, ...f });
    });
  }
  return report;
}

// ---- selftest -------------------------------------------------------------------------------------
// This file is scanned too, so no fixture below spells a whole violation: each is assembled here.

const mail = (local, domain) => `${local}${'@'}${domain}`;
const ip = (...octets) => octets.join('.');
const win = (...parts) => parts.join('\\');
const nix = (...parts) => parts.join('/');

function lineCases(secretWord) {
  return [
    // [line, expected rules]
    [`write to ${mail('jane.doe', 'acme-widgets.co')} about it`, ['e-mail']],
    [`from: ${mail('someone', 'unknown-org.net')}`, ['e-mail']],
    [`${mail('alice', 'example.com')}, ${mail('bob', 'corp.com')}, ${mail('git', 'github.com')}:me/vault.git`, []],
    [`${mail('ops', 'bastion.example.internal')} and ${mail('a', 'b.test')}`, []],
    [`vault_${mail('me', 'corp.com.enc')}`, []],
    [`${mail('me', 'gmail.com')}, ${mail('user1', 'outlook.com')}, ssh://${mail('git', 'gitlab.com')}/me/vault`, []],
    [mail('jane.doe', 'gmail.com'), ['e-mail']],
    [mail('jane', 'github.com'), ['e-mail']],
    [mail('person', 'example.com.attacker.org'), ['e-mail']],
    [mail('ops', 'corp.company-real.org'), ['e-mail']],
    [mail('ops', 'vpn.corp.com.attacker.org'), ['e-mail']],
    [mail('ops', 'mail.x.com'), ['e-mail']],
    [`${mail('git', 'bitbucket.org')}:me/v.git, ${mail('git', 'ssh.dev.azure.com')}:v3/o/p/r, ${nix('', 'home', 'runner', 'work')}`, []],
    [`react${'@'}18.3.1 and actions/checkout${'@'}v4`, []],
    [`ssh ubuntu${'@'}${ip(10, 44, 3, 2)}`, ['private-ip']],
    [`host ${ip(172, 20, 1, 9)}`, ['private-ip']],
    [`${ip(192, 168, 7, 20)} is home`, ['private-ip']],
    [`${ip(10, 0, 0, 5)}, ${ip(192, 168, 1, 10)}, ${ip(10, 255, 255, 1)}, ${ip(172, 16, 0, 0)}/12`, []],
    [`${ip(10, 0, 0, 42)} sits next to an allowed one`, ['private-ip']],
    [`${ip(203, 0, 113, 10)} and ${ip(192, 0, 2, 1)} are documentation addresses`, []],
    [`version ${ip(110, 20, 30, 40)} and ${ip(8, 8, 8, 8)}`, []],
    [win('C:', 'Users', 'jdoe', 'AppData'), ['home-path']],
    [`${nix('', 'mnt', 'c', 'Users', 'jdoe', 'x')} and ${nix('', 'home', 'jdoe', '.ssh')}`, ['home-path', 'home-path']],
    [nix('', 'Users', 'jdoe', 'Library'), ['home-path']],
    [nix('', 'c', 'Users', 'jdoe', 'bin'), ['home-path']],
    [nix('', 'cygdrive', 'c', 'Users', 'jdoe'), ['home-path']],
    [win('', '', 'wsl$', 'Ubuntu', 'home', 'jdoe', 'x'), ['home-path']],
    [nix('', '', 'wsl.localhost', 'Ubuntu', 'home', 'jdoe'), ['home-path']],
    [`'${win('C:', 'Users', "o'neil", 'x')}'`, ['home-path']],
    [`${win('C:', 'Users', '<you>', 'AppData')}, ${nix('', 'home', 'dev', 'x')}, ${nix('', 'mnt', 'c', 'Users', 'me')}, ${win('c:', 'Users', '…', 'keys')}`, []],
    [`'${nix('', 'home', 'dev')}', '${win('C:', 'Users', "o'brien", 'k')}', ${nix('', 'c', 'Users', 'me')}`, []],
    [win('C:', '', 'Users', '', 'jdoe', '', 'x'), ['home-path']],
    [`${nix('', 'mnt', 'c', 'Users', '…<rest>')} and HOME=${nix('', 'home', 'a=b')}`, []],
    [`the ${secretWord} project`, ['name']],
    ['the Zebra-Quokka project', ['name']],
    ['zebra_quokka.ovpn', ['name']],
    ['the zebra quokka project', ['name']],
    ['docs/zebra/quokka.md', ['name']],
    ['a zebra. Quokka', []],
    ['zebras and quokkas', []],
  ];
}

function runLineCases(digests, check) {
  for (const [line, expected] of lineCases('zebraquokka')) {
    const got = scanLine(line, digests).map((f) => f.rule);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    check(ok, `${JSON.stringify(line)} -> [${got.join(', ')}]${ok ? '' : ` expected [${expected.join(', ')}]`}`);
  }
}

// The output reaches a PUBLIC CI log, so it must never carry the name it found — not as the match,
// not inside an address or a home path, and not inside the path of the file that holds it.
function checkNoLeak(digests, check) {
  const planted = 'docs/Zebra-Quokka/notes.md';
  const findingsOn = (file, line, text) => scanLine(text, digests).map((f) => ({ file, line, ...f }));
  const output = formatFindings([
    ...pathFindings(planted, digests),
    ...findingsOn(planted, 3, `write to ${mail('jane', 'acme-widgets.co')}`),
    ...findingsOn('docs/plain.md', 7, 'the zebra quokka project'),
    ...findingsOn('docs/plain.md', 8, `ask ${mail('zebraquokka', 'acme-widgets.co')}`),
    ...findingsOn('docs/plain.md', 9, win('C:', 'Users', 'zebraquokka', 'x')),
    ...findingsOn('docs/plain.md', 10, nix('', 'home', 'zebra-quokka', '.ssh')),
  ], digests).join('\n');
  const findings = output.split('\n').length;
  check(findings === 9 && !/zebra|quokka/i.test(output), `${findings} printed findings, none of them carrying the planted name:\n${output}`);
}

// A read error stops the scan, and its message reaches the same public log.
function checkReadErrorMasked(digests, check) {
  const failing = () => {
    const e = new Error('i/o');
    e.code = 'EIO';
    throw e;
  };
  let message = '';
  try {
    readTracked('docs/Zebra-Quokka/notes.md', digests, failing);
  } catch (e) {
    message = e.message;
  }
  check(message.includes('EIO') && !/zebra|quokka/i.test(message), `a read error names the code, not the planted path: ${message}`);
}

// The report keeps a bounded number of findings and counts all of them — and masking a path must
// not depend on its own finding being among the kept ones.
function checkReportCap(digests, check) {
  const planted = 'docs/Zebra-Quokka/notes.md';
  const report = createReport(3);
  for (let line = 1; line <= 10; line++) report.add({ file: planted, line, rule: 'e-mail', match: '(an address)' });
  for (const f of pathFindings(planted, digests)) report.add(f);
  const output = formatFindings(report.findings, digests).join('\n');
  const ok = report.findings.length === 3 && report.total === 11 && !/zebra|quokka/i.test(output);
  check(ok, `keeps ${report.findings.length} of ${report.total} findings, and prints no planted name:\n${output}`);
}

// A typo in a digest is a name that silently never matches.
function checkDigestShape(check) {
  const bad = [...PRIVATE_NAME_DIGESTS].filter((d) => !/^[0-9a-f]{64}$/.test(d));
  check(PRIVATE_NAME_DIGESTS.size > 0 && bad.length === 0, `the digest list is non-empty and every entry is 64 hex characters (${bad.length} malformed)`);
}

function selftest() {
  const digests = new Set([digest('zebraquokka')]);
  let failed = 0;
  let total = 0;
  const check = (ok, label) => {
    total++;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  };
  runLineCases(digests, check);
  checkNoLeak(digests, check);
  checkReadErrorMasked(digests, check);
  checkReportCap(digests, check);
  checkDigestShape(check);
  console.log(failed === 0 ? `selftest: ${total} cases, all ok` : `selftest: ${failed} of ${total} cases FAILED`);
  return failed === 0 ? 0 : 1;
}

// ---- entry ----------------------------------------------------------------------------------------

function main(argv) {
  if (argv[0] === '--selftest') return selftest();
  if (argv[0] === '--hash') {
    console.log(digest(argv[1] ?? ''));
    return 0;
  }
  const report = scanTree();
  for (const line of formatFindings(report.findings)) console.log(line);
  const skipped = `${report.binary} binary file(s) not read`;
  if (report.total === 0) {
    console.log(`public hygiene: clean (${skipped})`);
    return 0;
  }
  const hidden = report.total - report.findings.length;
  if (hidden > 0) console.log(`… and ${hidden} more finding(s), not printed`);
  const counts = Object.entries(report.byRule).map(([r, n]) => `${r} ${n}`).join(', ');
  console.log(`public hygiene: ${report.total} finding(s) — ${counts} (${skipped})`);
  console.log('Use a placeholder: name@example.com, 192.0.2.x / 203.0.113.x, C:\\Users\\<you>, a neutral project name.');
  return 1;
}

// Run only as a script, so a measurement can import scanLine without scanning the tree.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
