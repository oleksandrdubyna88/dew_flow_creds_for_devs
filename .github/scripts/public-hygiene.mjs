#!/usr/bin/env node
// Public-repo hygiene: this repository is PUBLIC, so no tracked file may carry a real person's
// e-mail address, a real home path, a private network address, or a private project name.
//
//   node .github/scripts/public-hygiene.mjs              scan every tracked file (exit 1 on a finding)
//   node .github/scripts/public-hygiene.mjs --selftest   prove each rule fires, against fixtures
//   node .github/scripts/public-hygiene.mjs --hash "x"   print the digest of a name to add below
//
// Every rule is an ALLOWLIST or a DIGEST, never a list of the forbidden strings: a check that spelled
// out what must not be published would itself publish it.
//
//   e-mail      the domain must be a placeholder (RFC 2606 / RFC 6761, `.internal`) or one of the
//               fictional domains the fixtures already use; at a public mail service (gmail.com, …)
//               the WHOLE address must be a known generic one. A colleague's work address fails.
//   private-ip  an RFC 1918 address must be one of the exact neutral addresses fixtures use.
//   home-path   the user folder of C:\Users\<x>, /mnt/<d>/Users/<x>, /home/<x>, /Users/<x> must be a
//               placeholder (`<you>`, `…`, `me`, `dev`, …).
//   name        no word, and no two words joined by one `-`, `_`, `.`, space or slash, may hash to a
//               digest in PRIVATE_NAME_DIGESTS (SHA-256 of the lower-cased letters and digits).
//               A digest of a short name can be brute-forced: this keeps the list from READING as a
//               list of names, it does not make the names secret. The names were already public in
//               history; the point is that they do not come back.
//
// Not covered, on purpose: a fragment of a real secret (no pattern tells one from a fixture), and
// the deploy workflow's own name, which is functional (its GitHub environment holds the secrets).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER_DOMAINS = [
  // RFC 2606 / RFC 6761 — reserved for documentation, and the one right answer for a new fixture.
  'example.com', 'example.org', 'example.net', 'example', 'test', 'invalid', 'localhost',
  // ICANN's private-use TLD (2024): it never resolves on the public internet.
  'internal',
  // Fictional domains the existing fixtures use. No address at them names a real person.
  'corp', 'corp.com', 'corp.dev', 'corp.io', 'company.com', 'x.com', 'x.dev', 'x.io', 'b.com',
  'home.io', 'personal.io', 'db.host',
];

// Public services hold real people's mailboxes, so an address there passes only with a local part
// that names nobody. `jane.doe@gmail.com` fails.
const PUBLIC_SERVICE_ADDRESSES = new Map([
  ['gmail.com', ['me', 'user', 'user1', 'user2', 'friend', 'personal']],
  ['g-mail.com', ['user.two+dev']],
  ['outlook.com', ['me', 'user1', 'user2']],
  ['github.com', ['git']],
  ['gitlab.com', ['git']],
]);

// Not domains at all, but text the e-mail pattern reads as one: `alice@corp.comadmin` (teamSearch.ts
// shows what concatenating two fields would match) and `vault_me@corp.com.enc` (a vault file name).
const PLACEHOLDER_DOMAIN_LITERALS = ['corp.comadmin', 'corp.comgoogle', 'corp.com.enc'];

const PLACEHOLDER_USERS = [
  'you', '<you>', 'me', 'dev', 'ada', 'a', 'u', 'o', 'someone', 'user', 'alice', 'bob', '...', '…',
];

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

const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const RFC1918 = /(?<![\d.])(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?![\d.]*\d)/g;
const HOME = /(?:\b[A-Za-z]:(?:\\\\|\\|\/)Users|\/mnt\/[a-z]\/Users|(?<![\w.])\/home|(?<![\w.~])\/Users)(?:\\\\|\\|\/)([^\\/\s"'`)\]}<>,;:=*]+|<[^>\s]*>)/g;
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
  if (PLACEHOLDER_DOMAIN_LITERALS.includes(d)) return true;
  // The domain itself or a subdomain of it — never a domain that merely STARTS with a placeholder:
  // `example.com.attacker.org` is a real domain someone else can own.
  return PLACEHOLDER_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`));
}

// Exact addresses, not ranges: `10.0.0.42` could be a real host as easily as `10.120.x.x`.
// A new fixture uses RFC 5737 (192.0.2.x, 198.51.100.x, 203.0.113.x), which this rule never sees;
// one that must be private-range adds its address here.
const NEUTRAL_PRIVATE_IPS = new Set([
  '10.0.0.0', '10.0.0.1', '10.0.0.4', '10.0.0.5', '10.0.0.7', '10.0.0.12', '10.0.0.21', '10.0.0.22',
  '10.255.255.1', // the conventional black hole: a connection that never completes
  '172.16.0.0', '192.168.0.0', '192.168.1.10',
]);

function ipAllowed(ip) {
  return NEUTRAL_PRIVATE_IPS.has(ip);
}

function userAllowed(user) {
  const u = user.toLowerCase();
  return PLACEHOLDER_USERS.includes(u) || u.startsWith('<') || u.startsWith('$') || u.startsWith('%');
}

function nameHits(text, digests) {
  const lower = text.toLowerCase();
  const hits = [];
  // Streamed, holding only the previous word: one minified 8 MiB line is millions of matches, and
  // materialising them all at once cost 427 MB of heap (measured).
  let prev = null;
  let prevEnd = -2;
  for (const m of lower.matchAll(WORD)) {
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

/** Every finding in one line of text: [{ rule, match }]. */
export function scanLine(line, digests = PRIVATE_NAME_DIGESTS) {
  const out = [];
  for (const m of line.matchAll(EMAIL)) if (!addressAllowed(m[1], m[2])) out.push({ rule: 'e-mail', match: m[0] });
  for (const m of line.matchAll(RFC1918)) if (!ipAllowed(m[1])) out.push({ rule: 'private-ip', match: m[1] });
  for (const m of line.matchAll(HOME)) if (!userAllowed(m[1])) out.push({ rule: 'home-path', match: m[0] });
  for (const n of nameHits(line, digests)) out.push({ rule: 'name', match: '(a private name; see the digest list)', word: n });
  return out;
}

// This file is the one exemption: its selftest fixtures are made-up violations by design, and it
// holds no real name — only digests.
const SELF = '.github/scripts/public-hygiene.mjs';

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter((f) => f && f !== SELF);
}

function scanTree() {
  const findings = [];
  for (const file of trackedFiles()) {
    for (const f of scanLine(file)) findings.push({ file, line: 0, ...f });
    let buf;
    try {
      buf = readFileSync(file);
    } catch {
      continue; // a gitlink (the shared-rules submodule) or a file deleted in the working tree
    }
    if (buf.length > 8 * 1024 * 1024 || buf.includes(0)) continue;
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((text, i) => {
      for (const f of scanLine(text)) findings.push({ file, line: i + 1, ...f });
    });
  }
  return findings;
}

function selftest() {
  const secretWord = 'zebraquokka';
  const digests = new Set([digest(secretWord)]);
  const cases = [
    // [line, expected rules]
    ['mail jane.doe@acme-widgets.co about it', ['e-mail']],
    ['from: someone@unknown-org.net', ['e-mail']],
    ['alice@example.com, bob@corp.com, git@github.com:me/vault.git', []],
    ['ops@bastion.example.internal and a@b.test', []],
    ['vault_me@corp.com.enc', []],
    ['me@gmail.com, user1@outlook.com, ssh://git@gitlab.com/me/vault', []],
    ['jane.doe@gmail.com', ['e-mail']],
    ['jane@github.com', ['e-mail']],
    ['person@example.com.attacker.org', ['e-mail']],
    ['ops@corp.company-real.org', ['e-mail']],
    ['react@18.3.1 and actions/checkout@v4', []],
    ['ssh ubuntu@10.44.3.2', ['private-ip']],
    ['host 172.20.1.9', ['private-ip']],
    ['192.168.7.20 is home', ['private-ip']],
    ['10.0.0.5, 192.168.1.10, 10.255.255.1, 172.16.0.0/12', []],
    ['10.0.0.42 sits in a neutral-looking range', ['private-ip']],
    ['203.0.113.10 and 192.0.2.1 are documentation addresses', []],
    ['version 110.20.30.40 and 8.8.8.8', []],
    ['C:\\Users\\jdoe\\AppData', ['home-path']],
    ['/mnt/c/Users/jdoe/x and /home/jdoe/.ssh', ['home-path', 'home-path']],
    ['/Users/jdoe/Library', ['home-path']],
    ['C:\\Users\\<you>\\AppData, /home/dev/x, /mnt/c/Users/me, c:\\Users\\…\\keys', []],
    ['C:\\\\Users\\\\jdoe\\\\x', ['home-path']],
    ['/mnt/c/Users/…<rest> and HOME=/home/a=b', []],
    [`the ${secretWord} project`, ['name']],
    ['the Zebra-Quokka project', ['name']],
    ['zebra_quokka.ovpn', ['name']],
    ['a zebra. Quokka', []],
    ['zebras and quokkas', []],
  ];
  let failed = 0;
  for (const [line, expected] of cases) {
    const got = scanLine(line, digests).map((f) => f.rule);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(line)} -> [${got.join(', ')}]${ok ? '' : ` expected [${expected.join(', ')}]`}`);
  }
  console.log(failed === 0 ? `selftest: ${cases.length} cases, all ok` : `selftest: ${failed} of ${cases.length} cases FAILED`);
  return failed === 0 ? 0 : 1;
}

function main(argv) {
  if (argv[0] === '--selftest') return selftest();
  if (argv[0] === '--hash') {
    console.log(digest(argv[1] ?? ''));
    return 0;
  }
  const findings = scanTree();
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : `${f.file} (path)`;
    console.log(`${where}  ${f.rule}  ${f.match}`);
  }
  const byRule = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  if (findings.length === 0) {
    console.log('public hygiene: clean');
    return 0;
  }
  console.log(`public hygiene: ${findings.length} finding(s) — ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(', ')}`);
  console.log('Use a placeholder: name@example.com, 192.0.2.x / 203.0.113.x, C:\\Users\\<you>, a neutral project name.');
  return 1;
}

// Run only as a script, so a measurement can import scanLine without scanning the tree.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
