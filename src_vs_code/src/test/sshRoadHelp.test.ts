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
  "*Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* and an agent's run still refuse such an entry and say why. A share and an export leave the choice out.";

const EN_ADVICE =
  "To run a line on a server, choose its **ssh** entry under *Runs over SSH* instead of writing `ssh` into the line. The arrow then connects with that entry — its key or password, its pinned host key, its jump host — and the line runs in your login shell there, which stays open after the line ends; a line that fails says its exit code first. Write the line for the server, such as `tmux new -A -s {name}` with *Runs on* set to Linux or macOS; a Windows server is refused. The login shell must be sh, bash, zsh, ksh or dash; fish and csh are not supported. The approval names the host, so a changed host, user, port, jump host, agent forwarding or port forward asks again. If the SSH entry signs in with a password, every run opens a new terminal beside any open one. Windows PowerShell 5.1 cannot pass a double quote or a final backslash to ssh, so such a line is refused there; install PowerShell 7 (`pwsh`). After a run, the arrow asks before it types into that terminal again, because the login shell is still open. A VPN's *Started by* runs over SSH the same way, but a launcher line with `{config}` is refused, because the config is a file on this machine, and an agent's VPN start with such a launcher is refused. *Copy Command* copies `ssh … -- user@host '<line>'`: it uses your own ssh setup (agent, `~/.ssh/config`), and the vault's key and password are not in it.";

const EN_FOLDER =
  "A line set to run over SSH is shown as the `ssh … -- user@host '<line>'` it runs. After the question and the dependencies, each such entry connects in turn, in the folder's order, and only then is anything typed: cancelling one of its questions types nothing at all, and an entry whose SSH entry or jump host changed while the question was open is not typed — run the folder again.";

// Hp3
test('the_english_text_is_exact', () => {
  const body = whole('en');
  assert.ok(body.includes(EN_BULLET), 'the terminal bullet of paragraph 8');
  assert.ok(body.includes(EN_ADVICE), 'paragraph 25');
  assert.ok(body.includes(EN_FOLDER), 'the Run All in Folder paragraph');
});

// Hp4 (E2.S2)
test('every_language_explains_the_folder_run_over_ssh_in_its_own_paragraph', () => {
  for (const language of HELP_LANGUAGES) {
    const body = whole(language);
    const paragraph = body.split('\n\n').find((p) => p.startsWith('**Run All in Folder.**'));
    assert.ok(paragraph !== undefined, `${language} has no Run All in Folder paragraph`);
    assert.ok(paragraph.includes("`ssh … -- user@host '<line>'`"), `${language}: the folder paragraph does not show the ssh line`);
    assert.ok(!body.includes('*Run All in Folder*, '), `${language} still lists Run All in Folder among the roads that refuse an SSH entry`);
  }
});

// Hp5 (E2.S3): the bullet of the terminal kind, and the end of the Depends on paragraph, in every language.
const CHAIN_BULLET: Record<HelpLanguage, string> = {
  en: "*Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* and an agent's run still refuse such an entry and say why.",
  de: 'Ist einer gewählt, führen *Run in Terminal*, *Started by* eines VPN, *Run All in Folder* und eine Abhängigkeitskette die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. *Run with Secrets* und der Lauf eines Agenten lehnen einen solchen Eintrag weiterhin ab und sagen warum.',
  es: 'Con una elegida, *Run in Terminal*, el *Started by* de una VPN, *Run All in Folder* y una cadena de dependencias ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. *Run with Secrets* y la ejecución de un agente siguen rechazando esa entrada y dicen por qué.',
  ru: 'Если запись выбрана, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* и цепочка зависимостей выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. *Run with Secrets* и запуск агентом пока отказывают такой записи и объясняют почему.',
  uk: 'Якщо запис вибрано, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* і ланцюжок залежностей виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. *Run with Secrets* і запуск агентом поки відмовляють такому запису й пояснюють чому.',
};

const CHAIN_SENTENCES: Record<HelpLanguage, string> = {
  en: ' A step set to run over SSH runs there and ends there, so the chain sees its exit code; its connection is made, and its PIN or host key asked, before the chain is shown. A step whose SSH entry signs in with a password is refused, because the chain\'s one terminal has one environment.',
  de: ' Ein Schritt, der über SSH laufen soll, läuft dort und endet dort, die Kette sieht also seinen Exit-Code; seine Verbindung wird vorbereitet und seine PIN oder sein Host-Schlüssel erfragt, bevor die Kette gezeigt wird. Ein Schritt, dessen SSH-Eintrag sich mit einem Passwort anmeldet, wird abgelehnt, denn das eine Terminal der Kette hat eine Umgebung.',
  es: ' Un paso que se ejecuta por SSH se ejecuta allí y termina allí, así que la cadena ve su código de salida; su conexión se prepara, y se pregunta su PIN o su clave de host, antes de mostrar la cadena. Un paso cuya entrada SSH inicia sesión con una contraseña se rechaza, porque el único terminal de la cadena tiene un único entorno.',
  ru: ' Шаг, который выполняется через SSH, выполняется там и там же завершается, поэтому цепочка видит его код выхода; его подключение готовится, а PIN или ключ хоста спрашиваются до того, как цепочка показана. Шаг, чья запись SSH входит по паролю, отклоняется, потому что у единственного терминала цепочки одно окружение.',
  uk: " Крок, що виконується через SSH, виконується там і там же завершується, тож ланцюжок бачить його код виходу; його з'єднання готується, а PIN або ключ хоста запитуються до того, як ланцюжок показано. Крок, чий запис SSH входить за паролем, відхиляється, бо єдиний термінал ланцюжка має одне оточення.",
};

test('every_language_says_a_dependency_chain_runs_a_step_over_ssh', () => {
  for (const language of HELP_LANGUAGES) {
    const body = whole(language);
    assert.ok(body.includes(CHAIN_BULLET[language]), `${language}: the terminal bullet does not list the chain among the roads that run over SSH`);
    assert.ok(body.includes(`${CHAIN_SENTENCES[language]}\n\n`), `${language}: the Depends on paragraph does not end with the chain's SSH sentences`);
  }
});

test('the_english_chain_sentences_name_what_the_person_sees', () => {
  const body = whole('en');
  for (const needle of ['runs there and ends there', 'its PIN or host key asked, before the chain is shown', 'signs in with a password is refused']) {
    assert.ok(body.includes(needle), needle);
  }
});
