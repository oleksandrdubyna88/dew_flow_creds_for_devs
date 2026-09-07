// Emits contract/printable-key-v1.json — the vectors both languages assert.
//
//   node contract/emit-printable-key-vectors.mjs
//
// Why a generator rather than hand-written numbers. `RC1-` shipped in TypeScript first
// (src_vs_code/src/recoveryCode.ts), so the vectors are taken FROM the implementation that already
// exists and then checked against it: every RC1 case is fed back through the shipped
// `parseRecoveryCode` and must come out as the same core. A vector that is merely typed in pins
// nothing — it can be wrong in both files at once.
//
// The file it writes is the one thing standing between two implementations of one construction. A
// finite list of cases is not enough on its own, which is why it also carries the DERIVED 32 bytes
// for the backup form: a checksum can agree while an HKDF call disagrees about its salt, and the
// failure would be an archive nobody can open. Both suites additionally run the round trip over many
// random cores; the file pins the construction, the property tests pin the rest.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The two forms. `checksumInfo` is a PREFIX of the digest input, not a template. */
const FORMS = {
  RC1: {
    prefix: 'RC1',
    // Verbatim from recoveryCode.ts. It carries the product's old name and must not be "tidied":
    // changing it changes every recovery code ever issued.
    checksumInfo: 'cred-ssh-manager/recovery-checksum:',
    coreSymbols: 30,
    group: 5,
    checksumSymbols: 4,
    derive: undefined,
  },
  BK1: {
    prefix: 'BK1',
    checksumInfo: 'credvault/backup-key-checksum:',
    coreSymbols: 30,
    group: 5,
    checksumSymbols: 4,
    // HKDF-SHA256, salt EMPTY (zero-length, not null and not a zero-filled block), ikm = the UTF-8
    // bytes of the core, L = 32. Spelled out because "omitted salt" and "empty salt" are the same
    // in RFC 5869 and different in some libraries, and the cost of being wrong is a key that
    // derives differently in the other language.
    derive: { hash: 'sha256', info: 'credvault-backup-key-v1', salt: '', lengthBytes: 32 },
  },
};

function checksum(form, core) {
  const digest = crypto.createHash('sha256').update(`${form.checksumInfo}${core}`).digest();
  let out = '';
  for (let i = 0; i < form.checksumSymbols; i++) out += ALPHABET[digest[i] % ALPHABET.length];
  return out;
}

function formatted(form, core) {
  const groups = [];
  for (let i = 0; i < core.length; i += form.group) groups.push(core.slice(i, i + form.group));
  return [form.prefix, ...groups, checksum(form, core)].join('-');
}

function derived(form, core) {
  if (!form.derive) return undefined;
  const { hash, info, salt, lengthBytes } = form.derive;
  return Buffer.from(
    crypto.hkdfSync(hash, Buffer.from(core, 'utf8'), Buffer.from(salt, 'utf8'), Buffer.from(info, 'utf8'), lengthBytes),
  ).toString('hex');
}

// Fixed cores, chosen rather than random: one all-zeroes, one all-Z (the alphabet's ends), one
// holding every symbol the alphabet has, and two ordinary ones. A vectors file that changes on every
// run pins nothing.
const CORES = [
  '000000000000000000000000000000',
  'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
  '0123456789ABCDEFGHJKMNPQRSTVWX',
  'YZ0123456789ABCDEFGHJKMNPQRSTV',
  '7QK3M9XZ2VBN5PR8TWCD4FGH6JY10S',
];

const vectors = [];
for (const form of Object.values(FORMS)) {
  for (const core of CORES) {
    vectors.push({
      prefix: form.prefix,
      core,
      checksum: checksum(form, core),
      formatted: formatted(form, core),
      ...(derived(form, core) === undefined ? {} : { derivedKeyHex: derived(form, core) }),
    });
  }
}

const document = {
  version: 1,
  what: 'The printable-key construction, pinned across languages. See contract/README.md.',
  alphabet: ALPHABET,
  confusables: { O: '0', I: '1', L: '1' },
  forms: FORMS,
  vectors,
};

const out = path.join(HERE, 'printable-key-v1.json');
const rendered = `${JSON.stringify(document, null, 2)}\n`;

// `--check` is the CI mode: write nothing, and fail if the committed file is not what this generator
// produces. Without it the file is a snapshot somebody could quietly hand-edit, and the whole point
// of it is that it is DERIVED — from this construction, and from the shipped parser below.
const CHECK = process.argv.includes('--check');
// Line endings are normalised on both sides. Git checks this file out with CRLF on Windows and LF on
// Linux, so a byte comparison would make the check pass in CI and fail on a developer's machine —
// which is the worst of both, because the failure nobody sees is the one that matters.
const unified = (text) => text.split('\r\n').join('\n');
const same = (a, b) => unified(a) === unified(b);
if (CHECK && !same(fs.readFileSync(out, 'utf8'), rendered)) {
  console.log(`FAIL ${out} is not what this generator produces.`);
  console.log('      Run `node contract/emit-printable-key-vectors.mjs` and commit the result.');
  process.exitCode = 1;
} else if (CHECK) {
  console.log(`${out} is exactly what this generator produces (${vectors.length} vectors)`);
} else {
  fs.writeFileSync(out, rendered);
  console.log(`wrote ${out} with ${vectors.length} vectors`);
}

// ---- the check that makes this a generator and not a guess -------------------------------------
// Every RC1 vector goes back through the SHIPPED parser. If the checksum formula above has drifted
// from recoveryCode.ts, this fails here rather than pinning the drift into the contract.
const parserPath = path.join(HERE, '..', 'src_vs_code', 'out', 'recoveryCode.js');
if (!fs.existsSync(parserPath)) {
  console.log('note: src_vs_code/out/recoveryCode.js is not built, so the RC1 vectors were NOT');
  console.log('      checked against the shipped parser. Run `npm run compile` in src_vs_code and');
  console.log('      run this again before trusting them.');
  process.exitCode = 3;
} else {
  // pathToFileURL, not string concatenation: a checkout under a directory containing `#` or `%`
  // makes `file://` + path a different URL than the file it names — `#` truncates the rest as a
  // fragment and `%` can throw URIError — so the import would load the wrong module or fail, and the
  // vectors would be "checked" against nothing.
  const { parseRecoveryCode } = await import(pathToFileURL(parserPath).href);
  let bad = 0;
  for (const vector of vectors.filter((v) => v.prefix === 'RC1')) {
    const parsed = parseRecoveryCode(vector.formatted);
    const core = typeof parsed === 'object' && parsed.secret ? parsed.secret.toString('utf8') : String(parsed);
    if (core !== vector.core) {
      console.log(`FAIL ${vector.formatted}: the shipped parser answered ${core}`);
      bad += 1;
    }
  }
  console.log(bad === 0
    ? 'every RC1 vector round-trips through the shipped parser'
    : `${bad} RC1 vector(s) do not match the shipped parser`);
  // Never lower an exit code the file comparison already raised.
  process.exitCode = bad === 0 ? (process.exitCode ?? 0) : 1;
}
