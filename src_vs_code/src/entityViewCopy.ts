import { EntityViewOptions, portableSshCommand } from './entityViewPage';
import { DEFAULT_SNIPPET_LANGUAGE, snippetFor } from './configSnippet';
import { CONFIG_KEY_ENV } from './configKey';
import { configFileNameFor } from './configFile';
import { buildCommandLine, normalizeArgs } from './commandLine';
import { normalizeForwards, normalizeTags, renderForward } from './sshOptions';
import { resolveScriptEnv } from './scriptRender';

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
// eslint-disable-next-line complexity, max-lines-per-function
export async function copyValueFor(
  options: EntityViewOptions,
  field: string,
): Promise<string | undefined> {
  const d = options.details;
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
