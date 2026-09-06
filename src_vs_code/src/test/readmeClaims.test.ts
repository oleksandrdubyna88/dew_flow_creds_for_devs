import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ENTITY_KINDS } from '../types';
import { MCP_SWITCHES } from '../mcpSwitches';

/**
 * The README's claims, checked by machine.
 *
 * <p>A marketing claim rots faster than the code under it, and it rots silently: nothing fails, a
 * number simply stops being true. The current text proved that before this file existed — it said
 * *"Seven kinds of entry"* when there were nine, *"Six switches"* when there were ten, and
 * *"install.sh is 120 lines"* when it was 130. Three wrong numbers in one document nobody had
 * reason to re-read.</p>
 *
 * <p>So the claims that CAN be checked mechanically are. Everything here reads the real constant —
 * `ENTITY_KINDS`, `MCP_SWITCHES`, the file on disk — never a copy of it, because a test that
 * compares two hand-written numbers only tells you they were typed by the same person.</p>
 *
 * <p>Paths resolve from `__dirname`, not from the working directory: this suite runs from
 * `src_vs_code` and the files it checks live one level above it. A reviewer named exactly this —
 * a relative path from the cwd would find them locally and `ENOENT` in CI, or the other way
 * round.</p>
 */

const REPO = path.resolve(__dirname, '..', '..', '..');
const ROOT_README = path.join(REPO, 'README.md');
const LISTING = path.join(REPO, 'src_vs_code', 'README.md');

const read = (file: string): string => fs.readFileSync(file, 'utf8');

/**
 * The text with every run of whitespace collapsed to one space.
 *
 * <p>Every phrase check goes through this, and it is not a nicety: these documents are hard-wrapped
 * at about a hundred columns, so any phrase longer than a few words can straddle a line break. The
 * first run of this suite proved it — the trust-on-first-use caveat was present, correctly worded,
 * and reported missing because the sentence broke after "first". A phrase test that reads the raw
 * text is a test that lies in both directions.</p>
 */
const flat = (file: string): string => read(file).replace(/\s+/g, ' ');

/**
 * Claims the code says are false, and the phrasing that would smuggle each one back in.
 *
 * <p>Each was verified against the source on 2026-09-06 and belongs to the plan's FALSE list. The
 * second entry is the one with real teeth: `shareSignature.ts:25` tells its own readers the
 * mechanism **"must never be described as eliminating spoofing"**, so a README that said so would
 * contradict a rule the product states about itself.</p>
 */
const BANNED: readonly (readonly [RegExp, string])[] = [
  [/master password/i, 'there is no master-password unlock — keyWrap.ts:38 has pin, webauthn, recovery, org-escrow'],
  [/tenant isolation/i, 'there is no tenancy model; it is per-verified-email vault scoping'],
  [/stamped by the (verified )?identity provider/i, 'the SERVER stamps the sender from a verified token; the provider stamps nothing'],
  [/eliminat\w* spoofing/i, 'shareSignature.ts:25 forbids exactly this description'],
  [/seven kinds of entry/i, 'there are nine'],
  [/six switches/i, 'there are ten — six over entries, four over folders'],
  [/completely standalone offline/i, 'creating an account profile signs in with Microsoft or Google'],
];

test('neither README makes a claim the code says is false', () => {
  for (const file of [ROOT_README, LISTING]) {
    const text = flat(file);
    for (const [pattern, why] of BANNED) {
      assert.equal(pattern.test(text), false, `${path.basename(path.dirname(file))}/README.md: ${why}`);
    }
  }
});

test('the counts in the README are the counts in the code', () => {
  const text = flat(ROOT_README);
  const kinds = ENTITY_KINDS.length;
  const switches = MCP_SWITCHES.length;

  assert.equal(kinds, 9, 'if this changed, the README sentence changes with it');
  assert.equal(switches, 10, 'six over entries, four over folders');
  assert.match(text, /\*\*Nine kinds of entry\*\*/, `ENTITY_KINDS has ${kinds}`);
  assert.match(text, /\*\*Ten switches on two ladders\*\*/, `MCP_SWITCHES has ${switches}`);
  assert.equal(
    (read(ROOT_README).match(/^\| \*\*/gm) ?? []).length >= switches,
    true,
    'the switch table lists every switch, not a summarised subset',
  );
});

/**
 * The number that was wrong is now absent rather than asserted.
 *
 * <p>A reviewer was right that pinning a script's exact line count in prose makes every comment
 * added to `install.sh` a failing build in an unrelated pull request. The README says the script is
 * short enough to read; this asserts it stays that way, which is the claim actually being made.</p>
 */
test('install.sh stays short enough for the claim the README makes about it', () => {
  const lines = read(path.join(REPO, 'install.sh')).split('\n').length;

  assert.equal(lines < 200, true, `install.sh is ${lines} lines — "reads in a minute" stops being true`);
  assert.equal(
    /install\.sh\]\(install\.sh\) is \d+ lines/.test(flat(ROOT_README)),
    false,
    'an exact line count in prose is a build break waiting for an unrelated commit',
  );
});

/**
 * Every caveat that was there before is still there.
 *
 * <p>A reviewer's finding, and the sharpest of its round: the Definition of Done promised the
 * caveats would survive the rewrite, and nothing checked it. A shortened README that drops the
 * Linux keychain fallback or the trust-on-first-use limit reads as an endorsement of what those
 * caveats forbade — and every other test here would still pass.</p>
 */
const REQUIRED_CAVEATS: readonly (readonly [RegExp, string])[] = [
  [/Secret Service/i, 'Linux without a Secret Service falls back to an obfuscated store'],
  [/trust on first use|trust-on-first-use/i, 'folder/NAS sharing is TOFU plus key continuity, not proof against a spoofer already in place'],
  [/fails open/i, 'the output masker is a second line and lets the answer through rather than failing the call'],
  [/container/i, 'an agent inside a container cannot reach the broker'],
  [/Microsoft or Google/i, 'the first run is not offline — a profile signs in'],
  [/database and SSH entries/i, 'rotation does not cover every kind'],
];

test('every caveat the product owes its reader is still in the README', () => {
  const text = flat(ROOT_README);
  for (const [pattern, caveat] of REQUIRED_CAVEATS) {
    assert.match(text, pattern, `a caveat went missing in a rewrite: ${caveat}`);
  }
});

/**
 * The promise and the picture, together or not at all.
 *
 * <p>The listing told every Marketplace visitor to see screenshots "on the repository page", and the
 * repository page had none — a live false promise on a published listing. This makes the pair
 * inseparable in both directions: no promise without an image, and no image reference that does not
 * resolve to a real image file.</p>
 */
/** One image reference, checked for the surface it will render on. */
function assertUsableImage(src: string, file: string): void {
  if (src.startsWith('http')) {
    // A badge is an image the reader never thinks of as one: shields.io and GitHub's own workflow
    // badges are generated SVG with no extension in the path. They are still required to be https,
    // because a plain-http image is blocked on both surfaces and renders broken.
    assert.match(src, /^https:/, `${src} must be https or it renders as a broken image`);
    const badge = /img\.shields\.io|\/badge\.svg/.test(src);
    assert.equal(
      badge || /\.(png|gif|jpg|jpeg|svg|webp)(\?|$)/i.test(src),
      true,
      `${src} is named as an image but is neither a badge nor an image file`,
    );
    return;
  }
  const onDisk = path.resolve(path.dirname(file), src);
  assert.equal(fs.existsSync(onDisk), true, `${file} references ${src}, which is not on disk`);
  assert.match(src, /\.(png|gif|jpg|jpeg|svg|webp)$/i, `${src} is named as an image but is not one`);
}

test('a README that promises pictures has them, and every picture it names exists', () => {
  for (const file of [ROOT_README, LISTING]) {
    const text = read(file);
    const images = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    // A PROMISE, not a mention. The listing's caveat about clipboards names "screenshot
    // pipelines" and promises nothing; the broken promise it actually carried was
    // "Screenshots: see the tree…". So this matches the shapes that send a reader looking — a
    // heading-style label, or an invitation to see or watch one — and leaves the word alone
    // everywhere else.
    const promises = /(screenshots?|gif)\s*:|(see|watch|below)[^.]{0,60}(screenshots?|gif)/i.test(
      text,
    );

    assert.equal(
      promises && images.length === 0,
      false,
      `${file} promises pictures and references none — the promise the listing already broke`,
    );
    for (const src of images) {
      assertUsableImage(src, file);
    }
  }
});

test('every relative link in the root README points at something that exists', () => {
  const text = read(ROOT_README);
  const links = [...text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]);
  const broken = links
    .filter((l) => !l.startsWith('http') && !l.startsWith('mailto:'))
    .filter((l) => !fs.existsSync(path.resolve(REPO, l)));

  assert.deepEqual(broken, [], 'a front door with a dead link is worse than one with fewer links');
});

/**
 * The Marketplace renders neither mermaid nor GitHub's alert syntax, and both fail SILENTLY —
 * the reader gets raw text where a diagram or a callout was meant to be.
 */
test('neither README uses markup only GitHub renders', () => {
  for (const file of [ROOT_README, LISTING]) {
    const text = read(file);
    assert.equal(/```mermaid/.test(text), false, `${file}: the Marketplace shows this as raw text`);
    assert.equal(/^> \[!/m.test(text), false, `${file}: the Marketplace shows this as a plain quote`);
  }
});

/**
 * The structural half of "act on it, never receive it", checked rather than trusted.
 *
 * <p>A reviewer's finding, and it defends the README's headline: the guarantee rests on there being
 * no field in a response a secret could travel in, and nothing stopped a future response type from
 * growing one. This reads the protocol's own response bodies and refuses a secret-shaped field.</p>
 */
test('no broker response type grows a field a secret could travel in', () => {
  const protocol = read(path.join(REPO, 'src_vs_code', 'src', 'brokerProtocol.ts'));
  const bodies = [...protocol.matchAll(/export interface \w*ResponseBody \{([^}]*)\}/g)].map((m) => m[1]);

  assert.equal(bodies.length >= 3, true, 'the response bodies moved — this test must follow them');
  for (const body of bodies) {
    assert.equal(
      /\b(password|privateKey|secret|passphrase|seed|apiKey|token)\s*[?:]/i.test(body),
      false,
      `a response body declares a secret-shaped field:\n${body}`,
    );
  }
});

/**
 * The storefront card is one string, and it is the only copy that appears in in-editor search.
 */
test('the manifest carries the description and the keywords the plan settled on', () => {
  const manifest = JSON.parse(read(path.join(REPO, 'src_vs_code', 'package.json'))) as {
    description: string;
    keywords: readonly string[];
  };

  assert.match(manifest.description, /never be handed the password/i, 'the differentiator leads');
  assert.equal(manifest.description.length <= 220, true, 'a storefront card truncates a long one');
  for (const required of ['mcp', 'model context protocol', 'claude code', 'ai agent', 'ssh', 'credentials']) {
    assert.equal(
      manifest.keywords.includes(required),
      true,
      `"${required}" is how a reader searching for this product spells it`,
    );
  }
});
