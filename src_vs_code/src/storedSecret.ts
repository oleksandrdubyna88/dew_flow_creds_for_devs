/**
 * A secret as the keychain holds it, as a type of its own (research/PLAN_typed_stored_secrets.md §2.2).
 *
 * <p>A stored value is a plain value, a woven-plain envelope, a sealed envelope or a damaged one —
 * and while every getter returned `string`, those four and "text a person may read" were one type, so
 * a caller that forgot the PIN door type-checked. `StoredSecret` is a `string` at run time and an
 * OBJECT type to the compiler: assignable neither to nor from `string`, so `s.length`, `s === ''`,
 * `s.trim()`, `f(s)` for `f(x: string)` and `const t: string = s` all fail to compile. A branded
 * `string & {…}` was rejected because it stays assignable to `string`; a runtime wrapper class
 * because it changes every stored byte's handling for no extra safety.</p>
 *
 * <p>What the phantom does NOT catch — a template literal, `+`, `String(s)`, `JSON.stringify(s)`, a
 * truthiness test, and any cast — is the plan's §3, and the funnel test's to refuse. Since T5 every slot
 * getter returns one (`storedRead`) and every raw setter takes one, and a `StoredSecret` reaches text only
 * through a door, an owner-less read or a raw carrier (`carried`). `src/test/fixtures/typed/` is where
 * what must and must not compile is proven (`typedFixtures.test.ts`).</p>
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
