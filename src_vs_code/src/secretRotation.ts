import { DbType } from './types';
import { buildDbConnectionString, parseDbConnectionString } from './dbConnString';

/**
 * Level 3: replacing a secret without the agent ever seeing one — old or new.
 *
 * <p>The problem is real and looks unsolvable at first: to run
 * <c>ALTER USER app IDENTIFIED BY '…'</c> somebody has to know the new password, and if the
 * agent composes that statement then the agent knows it. The answer is that the agent writes a
 * PLACEHOLDER and never the value:</p>
 *
 * <pre>
 * agent      ALTER USER app IDENTIFIED BY '{{creds:new}}'
 * window     generates a new secret, substitutes it, runs the statement,
 *            snapshots the old value into history, stores the new one
 * agent      "done" — with the new value masked out of the output
 * </pre>
 *
 * <p><b>The placeholder is deliberately NOT `creds://…`.</b> The plan wrote it that way, and
 * that syntax already means something else in this product: `secretRef.ts` resolves
 * `creds://account/entity/password` to the value stored TODAY, and script bodies and command
 * arguments are full of them. One spelling meaning "the current secret" in one place and "the
 * secret that does not exist yet" in another is the kind of ambiguity that is discovered by
 * somebody rotating the wrong thing. `{{creds:new}}` names one entry — the one the request
 * already names — and cannot be confused with a reference to anything.</p>
 *
 * <p>Pure and `vscode`-free: what a rotation DOES is decided here and tested here; the
 * generating, running and storing happen in the action that uses it.</p>
 */

/** What an agent writes where the new secret goes. */
export const NEW_SECRET_PLACEHOLDER = '{{creds:new}}';

/** Every occurrence, because a statement may name it twice (set, then verify). */
export function countPlaceholders(text: string): number {
  return text.split(NEW_SECRET_PLACEHOLDER).length - 1;
}

/**
 * Put the new secret where the placeholder was.
 *
 * <p>A plain split/join rather than a regular expression: the value is generated and may contain
 * anything the alphabet allows, and `String.replace` reads `$&` and friends inside a replacement
 * as instructions. A password containing `$&` would then be substituted as something else — a
 * defect that would surface as an authentication failure days later, with nothing to point at.</p>
 */
export function substituteNewSecret(text: string, value: string): string {
  return text.split(NEW_SECRET_PLACEHOLDER).join(value);
}

/**
 * Where a kind's password actually lives.
 *
 * <p>Two different places, and the difference is not cosmetic. An SSH or credential entry keeps
 * a password of its own; a database entry keeps a connection string with the password inside it,
 * which is why the list route reports `hasPassword: false` for one of those while a password
 * plainly exists. A rotation that wrote the new value into the field a database does not use
 * would report success and change nothing.</p>
 */
export type RotationSlot = 'password' | 'dbConnection';

export function slotFor(kind: string): RotationSlot | undefined {
  if (kind === 'db') {
    return 'dbConnection';
  }
  return kind === 'ssh' || kind === 'credential' ? 'password' : undefined;
}

/**
 * The stored value that carries the new secret.
 *
 * <p>For a password that is the secret itself. For a database it is the connection string with
 * its password replaced and everything else — host, port, user, database, options — left exactly
 * as it was: a rotation must not quietly re-normalise the string somebody wrote by hand.</p>
 */
export function storedValueFor(
  slot: RotationSlot,
  current: string | undefined,
  newSecret: string,
  dbType: DbType | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  if (slot === 'password') {
    return { ok: true, value: newSecret };
  }
  const missing = whatIsMissing(current, dbType);
  if (missing !== undefined) {
    return { ok: false, error: missing };
  }
  const parts = parseDbConnectionString(current as string);
  return { ok: true, value: buildDbConnectionString(dbType as DbType, { ...parts, password: newSecret }) };
}

/** What a database entry lacks for its connection string to be rebuilt, if anything. */
function whatIsMissing(current: string | undefined, dbType: DbType | undefined): string | undefined {
  if (current === undefined || current.trim().length === 0) {
    return 'This entry has no connection string, so there is nothing to put the new password into.';
  }
  return dbType === undefined
    ? 'This entry has no database type, so its connection string cannot be rebuilt.'
    : undefined;
}

/**
 * Whether a rotation request is one this window will act on at all.
 *
 * <p>Refused before anything is generated, because generating a secret and then discovering the
 * request was malformed would leave a value nobody asked for in a history nobody expected.</p>
 */
export function checkRotation(
  statement: string,
  kind: string,
): { ok: true; slot: RotationSlot } | { ok: false; message: string } {
  const slot = slotFor(kind);
  if (slot === undefined) {
    return { ok: false, message: `A "${kind}" entry has no secret this can rotate.` };
  }
  if (statement.trim().length === 0) {
    return { ok: false, message: 'Nothing to run — give the statement that changes the secret on the far side.' };
  }
  const count = countPlaceholders(statement);
  if (count === 0) {
    return {
      ok: false,
      message: `The statement must contain ${NEW_SECRET_PLACEHOLDER} where the new secret goes. Without it nothing would be rotated on the far side.`,
    };
  }
  return { ok: true, slot };
}

/**
 * What the person is shown before approving — the statement with the placeholder INTACT.
 *
 * <p>The one thing the consent prompt must not do is display the new secret. Showing it would
 * put it on a screen, in a screenshot, and in the window's own audit line, which is the opposite
 * of a rotation nobody sees. The person is being asked about the SHAPE of the statement — what
 * it will change and where — and the placeholder says exactly that.</p>
 */
export function summarizeRotation(statement: string): string {
  return statement;
}
