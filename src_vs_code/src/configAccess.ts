import * as vscode from 'vscode';
import { CONFIG_KEY_PREFIX, configKeyHash, describeConfigKey, newConfigKey } from './configKey';

/**
 * Opening a config to code, and closing it again.
 *
 * <p>Thin, like `configWrite.ts`: the key, its hash and its label are `configKey.ts`, which
 * imports no `vscode` and is a unit test. What is here is the dialog, the clipboard, and the one
 * sentence that has to be right — that this is the only time the key will be shown.</p>
 */

/** The environment variable the .NET provider reads when it is given no key explicitly. */
export const CONFIG_KEY_ENV = 'CREDSFORDEVS_KEY';

export interface ConfigAccessDeps {
  readonly entityName: string;
  /** Stores the hash on the entity. The key itself is never handed back to the vault. */
  readonly store: (hash: string) => Promise<void>;
}

/**
 * Mint a key, put it on the clipboard, and say plainly that it will not be shown again.
 *
 * <p>Clipboard first and unconditionally, before the dialog: a modal that offers a Copy button is
 * a modal somebody can dismiss with Escape and lose the only copy of a secret to. The clipboard is
 * the deliverable; the dialog is the explanation.</p>
 *
 * <p>Written with the plain clipboard rather than `copySecret`, which expires what it writes after
 * forty-five seconds. That TTL is right for a password somebody is about to paste into a login
 * prompt and wrong for a key whose destination is a file they may still be creating.</p>
 */
export async function enableConfigAccess(deps: ConfigAccessDeps): Promise<void> {
  const key = newConfigKey();
  await vscode.env.clipboard.writeText(key);
  await deps.store(configKeyHash(key));
  await vscode.window.showInformationMessage(mintedMessage(deps.entityName), {
    modal: true,
    detail: mintedDetail(key),
  });
}

export async function revokeConfigAccess(deps: ConfigAccessDeps): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    `Revoke code access to "${deps.entityName}"?`,
    {
      modal: true,
      detail:
        'Any application still holding the key stops being able to read this config at its next start. Nothing else changes, and you can open it to code again — with a new key.',
    },
    'Revoke',
  );
  return answer === 'Revoke';
}

function mintedMessage(entityName: string): string {
  return `A key for "${entityName}" is on your clipboard.`;
}

/**
 * Everything a person needs before the dialog closes.
 *
 * <p>The key is shown as well as copied, because a clipboard is one accident from being the wrong
 * thing — and the sentence about it not being shown again has to appear beside the thing it is
 * about, not in a notification that has already scrolled away.</p>
 */
function mintedDetail(key: string): string {
  return [
    key,
    '',
    'This is the only time it is shown. The vault keeps a hash, not the key, so it cannot be read back — losing it means minting a new one.',
    '',
    `Put it in ${CONFIG_KEY_ENV}, or pass it to AddCredsForDevs() directly. Keep it out of git, like any other secret.`,
    `Anything starting with ${CONFIG_KEY_PREFIX} is one of these — ${describeConfigKey(key)} is how this one appears in the audit log.`,
  ].join('\n');
}
