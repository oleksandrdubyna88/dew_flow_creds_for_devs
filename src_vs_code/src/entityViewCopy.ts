import { EntityViewOptions, cliCommandFor, portableSshCommand } from './entityViewPage';
import { DEFAULT_SNIPPET_LANGUAGE, snippetFor } from './configSnippet';
import { CONFIG_KEY_ENV } from './configKey';
import { configFileNameFor } from './configFile';
import { buildCommandLine, normalizeArgs } from './commandLine';
import { normalizeForwards, normalizeTags, renderForward } from './sshOptions';
import { resolveScriptEnv } from './scriptRender';
import { copyVariant, copyableValue } from './paymentViewMessages';

/**
 * The viewer's copy switch, in its own module for the oldest reason here: `entityViewPage.ts`
 * crossed the 800-line ceiling the moment T20's portable row landed, and the resolver is the
 * page's one self-contained third. Same guarantees, same tests (`entityViewPage.test.ts`).
 */
/**
 * What a copy button's `field` resolves to — the whole mapping, host-side and `vscode`-free.
 *
 * <p>Extracted from the panel's message handler for the oldest reason in this repo: the switch
 * could not be tested where it lived, and an untested switch is where the snippet button spent
 * its first release copying nothing. The button posted `field: "snippet"` like every other copy
 * button, no case answered to that name, and the fall-through produced "Nothing to copy — the
 * field is empty" on a field that was plainly not.</p>
 *
 * <p>The snippet case re-derives the text from the language and variant the page sends
 * (`snippet|<language>|<variant>`), exactly as `snippetAnswer` does for rendering — copying the
 * DEFAULT while the reader looks at another language would be a worse defect than the dead
 * button, because it would look fixed.</p>
 */

/**
 * A one-time code copied as one half of a PAIR, carrying the pair it belongs to.
 *
 * <p>Exported because the panel needs to tell the two empty answers apart: a bare field that is
 * genuinely empty, and a pair that has rolled over since it was copied. They deserve different
 * sentences — the second one is not an empty field, it is a race the person has to re-run.</p>
 */
export function isPairedCodeField(field: string): boolean {
  return /^totp(Next)?\|\d+\|[0-9a-f]+$/.test(field);
}

/** Either half of the pair, bound to one or answering the live one. */
function isCodeField(field: string): boolean {
  return field === 'totpNext' || isPairedCodeField(field);
}

// eslint-disable-next-line complexity, max-lines-per-function
export async function copyValueFor(
  options: EntityViewOptions,
  field: string,
): Promise<string | undefined> {
  const d = options.details;
  // The payment card's rows. Read through the host at the moment the button is pressed, exactly as a
  // password is — the page holds no stored payment value to hand back.
  if (field.startsWith('pay_')) {
    const view = options.payment;
    const fields = await options.resolvePayment?.();
    // `pay_<key>` or `pay_<key>|<variant>`. The variant decides the SHAPE of the answer, never
    // which field is read — that is still the key, and it is still checked against the record.
    const [key, variant = ''] = field.slice('pay_'.length).split('|');
    const value = view === undefined || fields === undefined
      ? undefined
      : copyableValue(fields, view.form, key);
    return value === undefined ? undefined : copyVariant(key, variant, value);
  }
  // A one-time code copied as part of a PAIR carries the pair it belongs to, as `totp|<validUntil>`
  // / `totpNext|<validUntil>` — the `field|variant` shape the two branches around this one already
  // use. Re-deriving the code from the clock instead would answer whichever pair is current at the
  // moment of the click, and two codes from two different pairs are precisely what an enrolment
  // refuses; a refusal here costs one more copy, answering costs a failed enrolment that looks like
  // a broken seed. A bare `totp` is untouched — an entry without the preference copies as it always did.
  if (isCodeField(field)) {
    // No binding means the person has copied neither half yet, so the live pair IS the pair they
    // are looking at; a bare `totp` never reaches here at all and keeps its old path.
    //
    // BOTH halves of the binding are checked. The period alone cannot tell two pairs apart when
    // the SEED is replaced while the viewer is open — the new seed's snapshot lands in the same
    // period — and answering that would hand back one code from each seed without a word.
    const [name, until = '', pairId = ''] = field.split('|');
    const snapshot = await options.totp?.();
    const bound = until !== '';
    if (snapshot === undefined) {
      return undefined;
    }
    if (bound && (String(snapshot.validUntil) !== until || snapshot.pairId !== pairId)) {
      return undefined;
    }
    return name === 'totpNext' ? snapshot.next : snapshot.code;
  }
  if (field === 'snippet' || field.startsWith('snippet|')) {
    const parts = field.split('|');
    return snippetFor(
      parts[1] ?? DEFAULT_SNIPPET_LANGUAGE,
      parts[2] ?? '',
      {
      envVar: CONFIG_KEY_ENV,
      fileName: configFileNameFor(d.configFileName, d.configFormat ?? 'json', d.name),
    },
    ).code;
  }
  let value: string | undefined;
  switch (field) {
    case 'password':
    case 'privateKey':
    case 'vpnConfig':
    case 'dbConnection':
    case 'dbPassword':
    case 'totp':
      value = await options.resolveSecret(field);
      break;
    case 'all':
      value = await options.copyAllText();
      break;
    case 'name': value = d.name; break;
    case 'host': value = d.host; break;
    case 'user': value = d.user; break;
    case 'port': value = d.port !== undefined ? String(d.port) : undefined; break;
    case 'sshKeyPath': value = d.sshKeyPath; break;
    case 'publicKey': value = d.publicKey; break;
    case 'notes': value = options.notes ?? d.notes; break;
    case 'login': value = options.fields?.login; break;
    case 'url': value = options.fields?.url; break;
    case 'config': value = options.config; break;
    case 'vpnType': value = d.vpnType; break;
    case 'dbType': value = d.dbType; break;
    case 'dbHost': value = options.dbParts?.host; break;
    case 'dbPort': value = options.dbParts?.port; break;
    case 'dbName': value = options.dbParts?.database; break;
    case 'dbUser': value = options.dbParts?.user; break;
    case 'ssh': value = options.sshCommand; break;
    case 'sshPortable': value = portableSshCommand(options.sshCommand); break;
    case 'agentForward': value = d.agentForward === true ? '-A' : undefined; break;
    case 'hostKey': value = options.hostKeyFingerprint; break;
    case 'tags': value = normalizeTags(d.tags).join(' '); break;
    case 'command': value = d.command; break;
    case 'commandNote': value = d.commandNote; break;
    case 'fullCommand': value = buildCommandLine(d.command ?? '', d.commandArgs); break;
    case 'createdAt':
      value = options.createdAt === undefined ? undefined : new Date(options.createdAt).toISOString();
      break;
    case 'updatedAt':
      value = options.updatedAt === undefined ? undefined : new Date(options.updatedAt).toISOString();
      break;
    case 'scriptLanguage': value = d.scriptLanguage; break;
    case 'script': value = d.script; break;
    case 'scriptFull':
      value =
        d.script !== undefined
          ? resolveScriptEnv(d.script, d.scriptVars, d.scriptLanguage ?? 'other').body
          : undefined;
      break;
    default: {
      const cli = /^cli(\d+)$/.exec(field);
      if (cli !== null) {
        const alias = (options.cliAliases ?? [])[Number(cli[1])];
        value = alias === undefined ? undefined : cliCommandFor(d, alias);
        break;
      }
      const env = /^envname_(.+)$/.exec(field);
      if (env !== null) {
        value = d.envBindings?.[env[1]];
        break;
      }
      const revision = /^rev(\d+)$/.exec(field);
      if (revision !== null) {
        // The old secret, on demand and through the host — a previous password is
        // still a password.
        const r = options.history[Number(revision[1])];
        value =
          r === undefined
            ? undefined
            : (r.secrets.password ??
              r.secrets.privateKey ??
              r.secrets.dbConnection ??
              r.secrets.vpnConfig ??
              r.secrets.notes);
        break;
      }
      const forward = /^forward(\d+)$/.exec(field);
      if (forward !== null) {
        const rule = normalizeForwards(d.portForwards)[Number(forward[1])];
        value = rule === undefined ? undefined : renderForward(rule).join(' ');
        break;
      }
      const svar = /^svar(\d+)$/.exec(field);
      if (svar !== null) {
        value = normalizeArgs(d.scriptVars)[Number(svar[1])]?.value;
        break;
      }
      // Argument rows are numbered rather than named — there can be any number of them.
      const arg = /^arg(\d+)$/.exec(field);
      if (arg === null) {
        return;
      }
      value = normalizeArgs(d.commandArgs)[Number(arg[1])]?.value;
      break;
    }
  }
  return value;
}
