import * as crypto from 'node:crypto';
import { estimateBits } from './pinPolicy';

/**
 * The health report: what is weak, what is reused, and what is lying around in plaintext.
 *
 * <p>The niche the audit named is "Developer Watchtower" — the same idea every password manager
 * ships, applied to the things a developer actually has: keys in `~/.ssh`, `.env` files in a
 * workspace, and a database password that is also the staging one.</p>
 *
 * <p><b>Local by default, and that is a design property rather than a setting's default
 * value.</b> Everything below runs on this machine with no network at all. The one check that
 * cannot — whether a password appears in a public breach corpus — is opt-in, and even then it
 * sends five hexadecimal characters. See `hibpPrefix`.</p>
 *
 * <p><b>Nothing here stores or returns a secret.</b> A finding names the ENTITY and the problem;
 * the value that caused it is never part of the report, because a hygiene report is a document
 * people paste into chat. `hygiene.test.ts` asserts that.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  severity: FindingSeverity;
  /** What is wrong, in one line, naming the entity or the file — never the value. */
  title: string;
  /** What to do about it. A finding without an action is just an accusation. */
  advice: string;
  /** Where it was found — an entity name, or a path. */
  where: string;
}

/** One password to weigh: the entity it belongs to, and the value (which never leaves here). */
export interface PasswordEntry {
  entityName: string;
  accountEmail: string;
  field: string;
  value: string;
}

/**
 * Below this a password is called weak.
 *
 * <p>60 bits is the line where an offline attacker with commodity hardware moves from "years"
 * to "a weekend" against a fast hash — and a stored password is exactly the thing that ends up
 * behind somebody else's fast hash. It is a threshold with a reason, not a round number.</p>
 */
export const WEAK_BITS = 60;

/** Compare values without keeping them: equal passwords have equal digests. */
function digestOf(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Entities sharing one password — the finding that matters most and is never visible by eye. */
function groupByValue(entries: readonly PasswordEntry[]): Map<string, PasswordEntry[]> {
  const byDigest = new Map<string, PasswordEntry[]>();
  for (const entry of entries.filter((e) => e.value.length > 0)) {
    const key = digestOf(entry.value);
    byDigest.set(key, [...(byDigest.get(key) ?? []), entry]);
  }
  return byDigest;
}

function reuseFinding(group: readonly PasswordEntry[]): Finding {
  return {
    severity: 'high',
    title: `${group.length} entries share one password: ${group.map((e) => `"${e.entityName}"`).join(', ')}`,
    advice:
      'One breach of any of them is a breach of all of them. Give each its own — the form ' +
      'generates one, and nothing here needs you to remember it.',
    where: group.map((e) => e.entityName).join(', '),
  };
}

export function findReusedPasswords(entries: readonly PasswordEntry[]): Finding[] {
  return [...groupByValue(entries).values()]
    .filter((group) => group.length >= 2)
    .map(reuseFinding);
}

/** Passwords weak enough that the KDF in front of them is the only thing saving them. */
export function findWeakPasswords(entries: readonly PasswordEntry[], minBits = WEAK_BITS): Finding[] {
  return entries
    .filter((entry) => entry.value.length > 0 && estimateBits(entry.value) < minBits)
    .map((entry) => ({
      severity: estimateBits(entry.value) < minBits / 2 ? ('high' as const) : ('medium' as const),
      title: `"${entry.entityName}" has a weak ${entry.field} (about ${Math.round(estimateBits(entry.value))} bits)`,
      advice: `Replace it with a generated one — ${minBits} bits or better is the line this report draws.`,
      where: `${entry.accountEmail} · ${entry.entityName}`,
    }));
}

// ---- what is lying around on disk ------------------------------------------

export interface KeyFile {
  path: string;
  content: string;
}

/**
 * Private keys in `~/.ssh` that carry no passphrase of their own.
 *
 * <p>Deliberately reported as MEDIUM, not high, and the wording matters: an unencrypted key is
 * the normal state of an SSH key on a machine only its owner uses, and calling it a
 * catastrophe teaches people to ignore the report. What it actually means is that anyone who
 * gets one read of that file has the key — a backup, a synced folder, a stolen laptop that was
 * not encrypted at rest.</p>
 */
export function findUnencryptedKeyFiles(files: readonly KeyFile[]): Finding[] {
  return files
    .filter((file) => isPrivateKeyText(file.content) && !looksEncrypted(file.content))
    .map((file) => ({
      severity: 'medium' as const,
      title: `${file.path} is a private key with no passphrase`,
      advice:
        'Anyone who reads that file once has the key. Either set a passphrase ' +
        '(ssh-keygen -p -f <file>), or keep the key in this vault and serve it through the SSH ' +
        'agent, where it is not a file at all.',
      where: file.path,
    }));
}

export function isPrivateKeyText(content: string): boolean {
  return /-----BEGIN (OPENSSH|RSA|EC|DSA|ENCRYPTED)? ?PRIVATE KEY-----/.test(content);
}

/**
 * Whether a private key file is protected by its own passphrase.
 *
 * <p>Two shapes: the PEM header `Proc-Type: 4,ENCRYPTED` (and the `ENCRYPTED PRIVATE KEY`
 * label), and `openssh-key-v1`, where the cipher name in the header is `none` when it is not
 * encrypted.</p>
 */
export function looksEncrypted(content: string): boolean {
  if (/Proc-Type:\s*4,ENCRYPTED/.test(content) || /BEGIN ENCRYPTED PRIVATE KEY/.test(content)) {
    return true;
  }
  return content.includes('OPENSSH PRIVATE KEY') && !opensshCipherIsNone(content);
}

function opensshCipherIsNone(content: string): boolean {
  const body = content.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  try {
    const raw = Buffer.from(body, 'base64');
    // openssh-key-v1\0 then a length-prefixed cipher name.
    const after = raw.subarray('openssh-key-v1\0'.length);
    const length = after.readUInt32BE(0);
    return after.subarray(4, 4 + length).toString('utf8') === 'none';
  } catch {
    // A file we cannot read is not a file we get to accuse. This is a REPORT: a false
    // "your key has no passphrase" costs the reader's trust in every other line of it, so an
    // unparseable key counts as encrypted and produces no finding.
    //
    // Deliberately the opposite direction from `sshKeyParse.isEncryptedOpenSsh`, which answers
    // a different question — there, a parse failure should fall through to `createPrivateKey`
    // so the user gets the real reason the key would not load.
    return false;
  }
}

/** A `.env` line that assigns something that looks like a credential. */
const SECRET_NAME = /(PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)/i;

export interface EnvFile {
  path: string;
  content: string;
}

/**
 * Plaintext credentials in a workspace `.env`.
 *
 * <p>Only names that say what they are, and only lines with a non-empty value that is not
 * already a `creds://` reference — the point of the reference is that this finding stops being
 * true. A placeholder (`PASSWORD=`) or a commented line is not a finding, because a report that
 * cries about those is one nobody reads twice.</p>
 */
export function findEnvSecrets(files: readonly EnvFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const names = secretAssignments(file.content);
    if (names.length === 0) {
      continue;
    }
    findings.push({
      severity: 'high',
      title: `${file.path} holds ${names.length} plaintext credential(s): ${names.join(', ')}`,
      advice:
        'Put the value in this vault and reference it — creds://<account>/<entity>/<field> — ' +
        'then run with "Run with Secrets", which resolves it into the child process only. ' +
        'Check that the file is in .gitignore either way.',
      where: file.path,
    });
  }
  return findings;
}

/** The NAMES of the assignments that look like secrets. Values are never collected. */
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** The name a line assigns to, when the line is an assignment of a plaintext secret. */
function secretNameOf(rawLine: string): string | undefined {
  const line = rawLine.trim();
  const match = line.startsWith('#') ? null : ASSIGNMENT.exec(line);
  return match !== null && isPlaintextSecret(match[1], match[2]) ? match[1] : undefined;
}

export function secretAssignments(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map(secretNameOf)
    .filter((name): name is string => name !== undefined);
}

function isPlaintextSecret(name: string, rawValue: string): boolean {
  const value = rawValue.trim().replace(/^["']|["']$/g, '');
  return SECRET_NAME.test(name) && value.length > 0 && !value.toLowerCase().startsWith('creds://');
}

// ---- the one check that leaves the machine ---------------------------------

/**
 * The k-anonymity split for Have I Been Pwned.
 *
 * <p>What travels is the first FIVE hexadecimal characters of the SHA-1 — one bucket out of
 * 2^20, shared by hundreds of thousands of passwords — and the answer is the whole bucket,
 * which is matched locally. The service therefore cannot know which password was asked about,
 * and it never sees the password or a complete hash of it.</p>
 *
 * <p>SHA-1 because that is the corpus's index, not because it is a good hash. It is used here
 * as a lookup key and nothing else.</p>
 */
export function hibpPrefix(password: string): { prefix: string; suffix: string } {
  const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

/**
 * How many times this password appears in the corpus, read out of the bucket the API returned.
 *
 * <p>Zero means "not in this bucket", which is the honest answer — not "safe".</p>
 */
export function countInHibpRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  const hit = body
    .split(/\r?\n/)
    .map((line) => line.trim().split(':'))
    .find((parts) => (parts[0] ?? '').toUpperCase() === wanted);
  return hit === undefined ? 0 : Number.parseInt(hit[1] ?? '0', 10) || 0;
}

export function breachFinding(entry: PasswordEntry, count: number): Finding {
  return {
    severity: 'high',
    title: `"${entry.entityName}" uses a password seen ${count.toLocaleString('en-US')} times in public breaches`,
    advice:
      'It is in the wordlists attackers try first, whatever its length. Replace it — the form ' +
      'generates one.',
    where: `${entry.accountEmail} · ${entry.entityName}`,
  };
}

/** Highest severity first, then alphabetically, so a report reads top-down. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const rank: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };
  return [...findings].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title),
  );
}

/** The report, as markdown. Deliberately a document: it is meant to be read, then acted on. */
export function renderReport(findings: readonly Finding[], scanned: { entities: number; files: number }, checkedBreaches: boolean): string {
  const lines = [
    '# CredsForDevs — health report',
    '',
    `${scanned.entities} stored secret(s) and ${scanned.files} file(s) examined on this machine.`,
    checkedBreaches
      ? 'Breach check: ON — five characters of each password\'s SHA-1 were sent; the password was not.'
      : 'Breach check: off. Nothing left this machine.',
    '',
  ];
  if (findings.length === 0) {
    lines.push('Nothing to report. Every stored password is distinct and above the strength line,');
    lines.push('no unencrypted private key was found, and no workspace `.env` holds a plaintext credential.');
    return `${lines.join('\n')}\n`;
  }
  lines.push(`## ${findings.length} finding(s)`, '');
  for (const finding of sortFindings(findings)) {
    lines.push(`### ${finding.severity.toUpperCase()} — ${finding.title}`, '', finding.advice, '');
  }
  return `${lines.join('\n')}\n`;
}
