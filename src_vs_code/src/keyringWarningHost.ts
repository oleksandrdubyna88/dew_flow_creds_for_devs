import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
  KeyringProbe,
  SECRET_SERVICE_CLIENTS,
  keyringDoubts,
  keyringWarningMessage,
} from './keyringWarning';

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
  const doubts = keyringDoubts(readProbe());
  if (doubts.length === 0) {
    return;
  }
  void context.globalState.update(KEY, true);
  void vscode.window
    .showWarningMessage(keyringWarningMessage(doubts), 'How to fix this')
    .then((choice) => {
      if (choice === 'How to fix this') {
        void vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs#readme'),
        );
      }
    });
}

/**
 * The machine, read once.
 *
 * <p>Every field is about the EXTENSION HOST's process, which is the computer running
 * the window: `extensionKind: ["ui"]` keeps it there whatever the window is attached to.
 * `vscode.env.remoteName` used to be read into the probe and was never consulted — with
 * that pin it can only ever name the wrong machine, so it is gone rather than left to
 * look like a fact the decision uses.</p>
 *
 * <p>Six `existsSync` calls at most, once per machine ever, on a path that already
 * short-circuits on the "you have been told" flag.</p>
 */
function readProbe(): KeyringProbe {
  return {
    platform: process.platform,
    dbusAddress: process.env.DBUS_SESSION_BUS_ADDRESS,
    desktop: process.env.XDG_CURRENT_DESKTOP,
    desktopSession: process.env.DESKTOP_SESSION,
    secretServiceClientInstalled: SECRET_SERVICE_CLIENTS.some((candidate) =>
      fs.existsSync(candidate),
    ),
  };
}
