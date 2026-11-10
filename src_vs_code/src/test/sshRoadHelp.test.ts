import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';

/**
 * The arrow and the launcher over SSH in the help, in every language (E2.S1 of `PLAN_terminal_command_over_ssh.md`). UI
 * labels stay English in all five (`CLAUDE.md` rule 7); the hand-written `ssh -t <host>` advice is gone.
 */

function whole(language: HelpLanguage): string {
  const article = helpArticle('basics');
  assert.ok(article !== undefined, 'no article basics');
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${language} falls back to English`);
  return Object.values(shown.body).join('\n\n');
}

// Hp1
test('the_hand_written_ssh_advice_is_gone_in_every_language', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(!whole(language).includes('ssh -t <host>'), `${language} still tells the reader to write ssh -t <host>`);
  }
});

// Hp2
test('every_language_explains_the_arrow_over_ssh_with_english_labels', () => {
  for (const language of HELP_LANGUAGES) {
    const body = whole(language);
    for (const needle of ['*Runs over SSH*', '*Started by*', '~/.ssh/config', 'PowerShell 7', 'ssh … -- user@host']) {
      assert.ok(body.includes(needle), `${language} lacks ${needle}`);
    }
  }
});

const EN_BULLET =
  "*Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal* and a VPN's *Started by* run the line on that host, and *Runs on* then names the host's system. *Run All in Folder*, a dependency chain, *Run with Secrets* and an agent's run still refuse such an entry and say why. A share and an export leave the choice out.";

const EN_ADVICE =
  "To run a line on a server, choose its **ssh** entry under *Runs over SSH* instead of writing `ssh` into the line. The arrow then connects with that entry — its key or password, its pinned host key, its jump host — and the line runs in your login shell there, which stays open after the line ends; a line that fails says its exit code first. Write the line for the server, such as `tmux new -A -s {name}` with *Runs on* set to Linux or macOS; a Windows server is refused. The login shell must be sh, bash, zsh, ksh or dash; fish and csh are not supported. The approval names the host, so a changed host, user, port, jump host, agent forwarding or port forward asks again. If the SSH entry signs in with a password, every run opens a new terminal beside any open one. Windows PowerShell 5.1 cannot pass a double quote or a final backslash to ssh, so such a line is refused there; install PowerShell 7 (`pwsh`). After a run, the arrow asks before it types into that terminal again, because the login shell is still open. A VPN's *Started by* runs over SSH the same way, but a launcher line with `{config}` is refused, because the config is a file on this machine, and an agent's VPN start with such a launcher is refused. *Copy Command* copies `ssh … -- user@host '<line>'`: it uses your own ssh setup (agent, `~/.ssh/config`), and the vault's key and password are not in it.";

// Hp3
test('the_english_text_is_exact', () => {
  const body = whole('en');
  assert.ok(body.includes(EN_BULLET), 'the terminal bullet of paragraph 8');
  assert.ok(body.includes(EN_ADVICE), 'paragraph 25');
});
