/**
 * A secret as the keychain holds it, as a type of its own (todo/PLAN_typed_stored_secrets.md §2.2).
 *
 * <p>A stored value is a plain value, a woven-plain envelope, a sealed envelope or a damaged one —
 * and while every getter returns `string`, those four and "text a person may read" are one type, so
 * a caller that forgets the PIN door type-checks. `StoredSecret` is a `string` at run time and an
 * OBJECT type to the compiler: assignable neither to nor from `string`, so `s.length`, `s === ''`,
 * `s.trim()`, `f(s)` for `f(x: string)` and `const t: string = s` all fail to compile. A branded
 * `string & {…}` was rejected because it stays assignable to `string`; a runtime wrapper class
 * because it changes every stored byte's handling for no extra safety.</p>
 *
 * <p>What the phantom does NOT catch — a template literal, `+`, `String(s)`, `JSON.stringify(s)`, a
 * truthiness test, and any cast — is the plan's §3, and the funnel test's to refuse. Nothing returns
 * a `StoredSecret` yet: the getters flip slot by slot later (§4, T5). `src/test/fixtures/typed/` is
 * where what must and must not compile is proven (`typedFixtures.test.ts`).</p>
 */

declare const STORED: unique symbol;

/** A string as the keychain holds it — plain, a woven-plain envelope, a sealed envelope, or damaged. */
export type StoredSecret = { readonly [STORED]: true };

/** The mint — at the keychain and parse boundaries only. Identity at run time. */
export function stored(raw: string): StoredSecret;
export function stored(raw: string | undefined): StoredSecret | undefined;
export function stored(raw: string | undefined): StoredSecret | undefined {
  return raw as unknown as StoredSecret | undefined;
}

/** The mint over a keychain read — `stored` for a value still on its way, one per getter. Identity at run time. */
export function storedRead(read: PromiseLike<string | undefined>): PromiseLike<StoredSecret | undefined> {
  return read as unknown as PromiseLike<StoredSecret | undefined>;
}

/** The raw bytes again, for the raw carriers only (export, an unprotected share, the bundles). Identity at run time. */
export function carried(secret: StoredSecret): string;
export function carried(secret: StoredSecret | undefined): string | undefined;
export function carried(secret: StoredSecret | undefined): string | undefined {
  return secret as unknown as string | undefined;
}

/**
 * TRANSITIONAL — T5's window only, deleted by its eleventh commit. While some getters still return
 * `string`, the seams (`readSecret`, `openStored`, `openedText`, the openers, `SecretSlot.read`) accept
 * `StoredSecret | string`; this is the one place that union becomes the bytes again. The commit that
 * takes the `| string` off the seams deletes it, and the compiler names every caller.
 */
export function seamText(secret: StoredSecret | string): string;
export function seamText(secret: StoredSecret | string | undefined): string | undefined;
export function seamText(secret: StoredSecret | string | undefined): string | undefined {
  return secret as unknown as string | undefined;
}

/**
 * TRANSITIONAL — T5's window only, deleted by its tenth commit: a stored form handed to a storage
 * setter that does not take `StoredSecret` YET (a slot not flipped). Each flip removes its slot's
 * calls; the last flip removes the function.
 */
export function unflipped(secret: StoredSecret): string;
export function unflipped(secret: StoredSecret | undefined): string | undefined;
export function unflipped(secret: StoredSecret | undefined): string | undefined {
  return secret as unknown as string | undefined;
}
