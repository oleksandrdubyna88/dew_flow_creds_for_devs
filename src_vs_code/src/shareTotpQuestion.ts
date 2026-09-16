import * as vscode from 'vscode';

/**
 * The one-time-code question, asked once per share and only when there is one to ask about.
 *
 * <p>A checkbox rather than a confirmation, because the honest default is <b>off</b>: not sending a
 * seed leaves the recipient asking for it, while sending one they did not need hands over a second
 * factor that keeps working. Cancelling the list cancels the share, like every other step of that
 * conversation — which is why the answer is three-valued and not a boolean.</p>
 *
 * <p>Its own module because `shareInbox.ts` sits at the 800-line ceiling and this is a prompt with
 * no tie to the inbox at all: it takes a count and returns an answer. The same move
 * `sharePayloadBuild.ts` was, for the same reason.</p>
 */
export async function askIncludeTotp(count: number): Promise<boolean | undefined> {
  if (count === 0) {
    return false;
  }
  const chosen = await vscode.window.showQuickPick(
    [
      {
        label: 'Include the one-time code (TOTP) seed',
        detail:
          `${count === 1 ? 'One selected entry carries' : `${count} selected entries carry`} one. ` +
          'The recipient will be able to produce codes for that login until the seed is changed.',
        picked: false,
      },
    ],
    {
      canPickMany: true,
      ignoreFocusOut: true,
      title: 'What travels with this share?',
      placeHolder: 'Leave it unticked to share everything else and keep the second factor here',
    },
  );
  return chosen === undefined ? undefined : chosen.length > 0;
}
