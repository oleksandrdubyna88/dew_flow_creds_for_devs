/**
 * Replacing secret values in a child process's output as it streams.
 *
 * <p>The extension's script feature already keeps values out of the script FILE by handing
 * them to the child's environment (`resolveScriptEnv`). What it never could do is stop the
 * script from printing them — `detectSecretPrints` notices and warns, and the README says so
 * plainly. This is the other half: what the child writes passes through here first, and every
 * occurrence of a value it was given is replaced.</p>
 *
 * <p><b>The chunk boundary is the whole difficulty.</b> A stream arrives in arbitrary pieces,
 * so a secret can be split across two `data` events — `hunt` then `er2000`. A naive
 * per-chunk replace would emit both halves untouched. So the masker holds back the last
 * `longest − 1` characters of every chunk, emitting them only once the next chunk proves they
 * are not the start of a secret. `flush()` releases whatever is held at the end.</p>
 *
 * <p><b>What it cannot do</b>, stated rather than implied: a program that transforms a value
 * before printing it — base64, reversed, one character per line — defeats a textual mask, and
 * nothing short of not giving it the secret would help. This closes accidental echo, not
 * deliberate exfiltration by code the user chose to run.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

import { MaskEntry, MaskTable, buildMaskTable, maskText, placeholderFor } from './secretMasker';

/**
 * What a secret looks like in output, and how short is too short, are decided ONCE — in
 * `secretMasker.ts`, which the broker's response path already uses. This module adds the one
 * thing that module cannot do, because it masks a complete string: holding a stream's tail back
 * across chunk boundaries.
 *
 * <p>Reusing its table also means a value is recognised here in every form it recognises there —
 * plain, percent-encoded, base64, a PEM body — rather than only the literal one.</p>
 */
export { MIN_MASKABLE_LENGTH } from './secretMasker';

/** What a masked value is replaced with — the broker's own placeholder, so both surfaces agree. */
export const MASK = placeholderFor('secret');

export class SecretMasker {
  private readonly table: MaskTable;
  private readonly holdBack: number;
  private held = '';

  /**
   * `secrets` may be plain values or `{ value, label }` pairs. A label is worth passing: the
   * placeholder then says WHICH secret stood there — `<CREDS_MASKED:CREDS_REF_1>` rather than a
   * generic marker — so a person reading the output can tell two masked values apart.
   */
  constructor(secrets: Iterable<string | MaskEntry | undefined>) {
    const entries = [...secrets]
      .filter((s): s is string | MaskEntry => s !== undefined)
      .map((s) => (typeof s === 'string' ? { value: s.trim(), label: 'secret' } : { ...s, value: s.value.trim() }))
      .filter((e) => e.value.length > 0);
    const seen = new Set<string>();
    this.table = buildMaskTable(
      entries.filter((e) => (seen.has(e.value) ? false : seen.add(e.value) !== undefined)),
    );
    // Hold back one character less than the longest needle: that is the most a value could
    // have straddled two chunks by.
    const longest = this.table.entries.reduce((max, e) => Math.max(max, e.needle.length), 0);
    this.holdBack = longest === 0 ? 0 : longest - 1;
  }

  /** Whether anything is actually being hidden — lets a caller skip the plumbing entirely. */
  get active(): boolean {
    return this.table.entries.length > 0;
  }

  private replaceAll(text: string): string {
    return maskText(text, this.table).text;
  }

  /** Feed a chunk; returns what is safe to show now. */
  push(chunk: string): string {
    if (!this.active) {
      return chunk;
    }
    const combined = this.held + chunk;
    const masked = this.replaceAll(combined);
    // Hold back only from the tail that could still be the start of a secret. The mask
    // itself is never split, so measuring the tail on the MASKED text is safe.
    const keep = Math.min(this.holdBack, masked.length);
    this.held = masked.slice(masked.length - keep);
    return masked.slice(0, masked.length - keep);
  }

  /** Release the held tail. Call once, when the stream ends. */
  flush(): string {
    const rest = this.replaceAll(this.held);
    this.held = '';
    return rest;
  }

  /** Mask a complete string in one go (a buffered response rather than a stream). */
  static maskAll(text: string, secrets: Iterable<string | undefined>): string {
    const masker = new SecretMasker(secrets);
    return masker.push(text) + masker.flush();
  }
}
