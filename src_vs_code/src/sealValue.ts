import { lockSecret, readSecret } from './secretEnvelope';
import { StoredSecret, carried, stored } from './storedSecret';

/**
 * One value about to be WRITTEN into a protected entry, sealed under its PIN.
 *
 * <p>Extracted from `lockOne` so that every writer into a protected entry — Edit, a restore, a share
 * update, the history rewrite — seals exactly the way Protect does, in memory and BEFORE its raw
 * setter runs (entry-PIN plan, rule R3). One place for the woven mark, one place for idempotence:</p>
 *
 * <ul>
 *   <li>a plain string, and a plain envelope carrying the woven mark, both come out locked with
 *       the mark kept;</li>
 *   <li>a value that is already locked is returned untouched — a second wrap under the same PIN
 *       would need the first opened, and re-running being the resume is what `protectEntity`
 *       promises;</li>
 *   <li>envelope-shaped text that does not parse is sealed as the text it is. `readSecret` calls
 *       that `corrupt` when it is STORED, because a stored one is a damaged write; here it is what
 *       somebody typed, and a save must not refuse a note for looking like a wrap.</li>
 * </ul>
 *
 * <p>Its own module since the entry-PIN plan's P7: `historyPin` seals kept values with it, and
 * `entityPin` opens the kept versions on *Remove PIN Protection…* — one module importing the other
 * both ways would be a cycle. `entityPin` re-exports it, so no caller moved.</p>
 */
export async function sealValue(value: StoredSecret, accountId: string, pin: string): Promise<StoredSecret> {
  return stored(await sealText(carried(value), accountId, pin));
}

/**
 * The same rule over TEXT a writer is about to store (`entryWriter`'s sealing writer, which mints the
 * answer at the one road): sealed text back. Two functions rather than one overloaded over
 * `StoredSecret | string` (E3 code round, finding 0): a StoredSecret IS a string at run time, so one body
 * could not tell the shapes apart and had to claim `string` for text while handing back a minted form.
 */
export async function sealText(text: string, accountId: string, pin: string): Promise<string> {
  const read = readSecret(stored(text));
  if (read.kind === 'locked') {
    return text;
  }
  return read.kind === 'value' ? lockSecret(read.value, accountId, pin, read.woven) : lockSecret(text, accountId, pin, false);
}
