import * as vscode from 'vscode';
import { keyringMayBeUnprotected, keyringWarningMessage } from './keyringWarning';

/**
 * Say so, once, when this machine may have no keychain behind SecretStorage.
 *
 * <p>Once per machine, not once per window: VS Code says nothing about the
 * fallback itself, so the person has to hear it — but a security warning that
 * arrives every morning is one people learn to dismiss, and then the one that
 * matters arrives after the habit is formed. The flag is deliberately in
 * `globalState` rather than a setting: it is a "you have been told", not a
 * preference anybody should have to find.</p>
 */
export function warnIfKeyringMissing(context: vscode.ExtensionContext): void {
  const KEY = 'credSshManager.keyringWarningShown';
  if (context.globalState.get<boolean>(KEY) === true) {
    return;
  }
  const unprotected = keyringMayBeUnprotected({
    platform: process.platform,
    dbusAddress: process.env.DBUS_SESSION_BUS_ADDRESS,
    remoteName: vscode.env.remoteName,
  });
  if (!unprotected) {
    return;
  }
  void context.globalState.update(KEY, true);
  void vscode.window
    .showWarningMessage(keyringWarningMessage(), 'How to fix this')
    .then((choice) => {
      if (choice === 'How to fix this') {
        void vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs#readme'),
        );
      }
    });
}
