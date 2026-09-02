/**
 * The assembled phrase, held as bytes we allocated and can zero — measure 5.4, stated honestly.
 *
 * <h3>What this buys, and what it does not</h3>
 *
 * <p><b>It is not "exactly one copy in memory".</b> That claim is false and, worse, unverifiable:
 * decoding a buffer and putting each word into a DOM text node creates JavaScript strings in addition
 * to the buffer, plus DOM and renderer copies the runtime owns and we cannot reach. No test in this
 * repository can count copies in a heap, so every test could pass while the claim was untrue.</p>
 *
 * <p>What it buys is <b>fewer copies we control, and the ones we own cleared on close</b> — a buffer
 * we allocated, zeroed when the view goes away, instead of a string that would sit in the heap until
 * a garbage collector we cannot ask happens to run. A JavaScript string cannot be zeroed; that is the
 * whole reason this type exists, and the help says so in plain words.</p>
 *
 * <p>Forcing collection is out of scope for the same reason it is not tried elsewhere: `global.gc`
 * needs `--expose-gc`, and VS Code does not start that way.</p>
 *
 * <p>Pure: no `vscode`.</p>
 */
export class PhraseBuffer {
  private bytes: Uint8Array;

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  /** The words as UTF-8 bytes, separated by a single space — never joined into a string first. */
  static of(words: readonly string[]): PhraseBuffer {
    const encoder = new TextEncoder();
    const parts = words.map((word) => encoder.encode(word));
    const size = parts.reduce((total, part) => total + part.length, 0) + Math.max(0, parts.length - 1);
    const bytes = new Uint8Array(size);
    let at = 0;
    parts.forEach((part, index) => {
      if (index > 0) {
        bytes[at++] = 0x20;
      }
      bytes.set(part, at);
      at += part.length;
    });
    return new PhraseBuffer(bytes);
  }

  /**
   * The words back out, as an ARRAY — never a joined string.
   *
   * <p>Measure 5.1: the phrase is not assembled into one string anywhere in a UI or render layer, so
   * every reader takes the words and puts them in separate nodes. The one honest exception is the
   * clipboard, which takes a string and only a string.</p>
   */
  words(): readonly string[] {
    return new TextDecoder().decode(this.bytes).split(' ').filter((word) => word.length > 0);
  }

  /** How many words are in here — answerable without decoding anything. */
  get length(): number {
    return this.bytes.length === 0 ? 0 : this.words().length;
  }

  /**
   * Zero the bytes we allocated. After this the buffer decodes to nothing.
   *
   * <p>Idempotent, because a view can be closed twice — by its own timer and by the person — and a
   * second close throwing would be a crash at the exact moment the value is meant to be going away.</p>
   */
  clear(): void {
    this.bytes.fill(0);
    this.bytes = new Uint8Array(0);
  }

  /** Whether anything is still held. What a test asserts after a close. */
  get cleared(): boolean {
    return this.bytes.length === 0;
  }
}
