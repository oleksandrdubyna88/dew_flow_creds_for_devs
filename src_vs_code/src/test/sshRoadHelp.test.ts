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
  "*Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* runs it there too, from a local window, and so does an agent's run, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs. A share and an export leave the choice out.";

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
  en: "*Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* runs it there too, from a local window, and so does an agent's run, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.",
  de: 'Ist einer gewählt, führen *Run in Terminal*, *Started by* eines VPN, *Run All in Folder* und eine Abhängigkeitskette die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. *Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster, und der Lauf eines Agenten auch, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.',
  es: 'Con una elegida, *Run in Terminal*, el *Started by* de una VPN, *Run All in Folder* y una cadena de dependencias ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. *Run with Secrets* también la ejecuta allí, desde una ventana local, y la ejecución de un agente también, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.',
  ru: 'Если запись выбрана, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* и цепочка зависимостей выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. *Run with Secrets* тоже выполняет её там, из локального окна, и запуск агентом тоже, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.',
  uk: 'Якщо запис вибрано, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* і ланцюжок залежностей виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. *Run with Secrets* теж виконує його там, із локального вікна, і запуск агентом теж, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.',
};

const CHAIN_SENTENCES: Record<HelpLanguage, string> = {
  en: ' A step set to run over SSH runs there and ends there, so the chain sees its exit code; its connection is made, and its PIN or host key asked, after you approve the chain and before any step runs. A step whose SSH entry signs in with a password is refused, because the chain\'s one terminal has one environment.',
  de: ' Ein Schritt, der über SSH laufen soll, läuft dort und endet dort, die Kette sieht also seinen Exit-Code; seine Verbindung wird vorbereitet und seine PIN oder sein Host-Schlüssel erfragt, nachdem Sie die Kette bestätigt haben und bevor ein Schritt läuft. Ein Schritt, dessen SSH-Eintrag sich mit einem Passwort anmeldet, wird abgelehnt, denn das eine Terminal der Kette hat eine Umgebung.',
  es: ' Un paso que se ejecuta por SSH se ejecuta allí y termina allí, así que la cadena ve su código de salida; su conexión se prepara, y se pregunta su PIN o su clave de host, después de que usted apruebe la cadena y antes de que se ejecute cualquier paso. Un paso cuya entrada SSH inicia sesión con una contraseña se rechaza, porque el único terminal de la cadena tiene un único entorno.',
  ru: ' Шаг, который выполняется через SSH, выполняется там и там же завершается, поэтому цепочка видит его код выхода; его подключение готовится, а PIN или ключ хоста спрашиваются после того, как вы одобрите цепочку, и до запуска любого шага. Шаг, чья запись SSH входит по паролю, отклоняется, потому что у единственного терминала цепочки одно окружение.',
  uk: " Крок, що виконується через SSH, виконується там і там же завершується, тож ланцюжок бачить його код виходу; його з'єднання готується, а PIN або ключ хоста запитуються після того, як ви схвалите ланцюжок, і до запуску будь-якого кроку. Крок, чий запис SSH входить за паролем, відхиляється, бо єдиний термінал ланцюжка має одне оточення.",
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
  for (const needle of ['runs there and ends there', 'its PIN or host key asked, after you approve the chain and before any step runs', 'signs in with a password is refused']) {
    assert.ok(body.includes(needle), needle);
  }
});

// Hp6 (E3.S1): Run with Secrets runs over SSH from a local window — the terminal bullet, and the `secret-references` article, in every language.
const RUNS_BULLET_SENTENCE: Record<HelpLanguage, string> = {
  en: "*Run with Secrets* runs it there too, from a local window, and so does an agent's run, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.",
  de: "*Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster, und der Lauf eines Agenten auch, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.",
  es: "*Run with Secrets* también la ejecuta allí, desde una ventana local, y la ejecución de un agente también, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.",
  ru: "*Run with Secrets* тоже выполняет её там, из локального окна, и запуск агентом тоже, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.",
  uk: "*Run with Secrets* теж виконує його там, із локального вікна, і запуск агентом теж, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.",
};

const SECRETS_WHAT_IT_IS: Record<HelpLanguage, string> = {
  en: "Write `creds://you@corp.com/prod-db/password` where a value would go, then Run with Secrets: the value is never on a command line — on this machine it goes only into the child process’s environment, and over SSH it goes on standard input to the server’s login shell, which puts it into the command’s environment there. Every appearance of it in the output is replaced with a named marker.",
  de: "Schreiben Sie `creds://you@corp.com/prod-db/password` dorthin, wo ein Wert stünde, und dann Run with Secrets: der Wert steht nie auf einer Kommandozeile — auf diesem Rechner geht er nur in die Umgebung des Kindprozesses, und über SSH geht er über die Standardeingabe an die Login-Shell des Servers, die ihn dort in die Umgebung des Befehls setzt. Jedes Vorkommen davon in der Ausgabe wird durch einen benannten Marker ersetzt.",
  es: "Escriba `creds://you@corp.com/prod-db/password` donde iría un valor, y luego Run with Secrets: el valor nunca va en una línea de comandos — en esta máquina va sólo al entorno del proceso hijo, y por SSH va por la entrada estándar a la shell de inicio de sesión del servidor, que allí lo pone en el entorno del comando. Cada aparición suya en la salida se sustituye por un marcador con nombre.",
  ru: "Пишете `creds://you@corp.com/prod-db/password` вместо значения, затем Run with Secrets: значение никогда не попадает в командную строку — на этой машине оно идёт только в окружение дочернего процесса, а через SSH — через стандартный ввод в оболочку входа сервера, которая кладёт его там в окружение команды. Каждое его появление в выводе заменяется именованным маркером.",
  uk: "Напишіть `creds://you@corp.com/prod-db/password` там, де мало б стояти значення, і виконайте Run with Secrets: значення ніколи не потрапляє в командний рядок — на цій машині воно йде лише в середовище дочірнього процесу, а через SSH — через стандартне введення до оболонки входу сервера, яка кладе його там у середовище команди. Кожна його поява у виводі замінюється іменованим маркером.",
};

const SECRETS_USAGE_FIRST: Record<HelpLanguage, string> = {
  en: "argv carries the reference NAME; the value travels in an environment only — the local child’s or, over SSH, the remote command’s (it reaches the server on standard input, never in argv).",
  de: "argv trägt den NAMEN des Verweises; der Wert reist nur in einer Umgebung — der des lokalen Kindes oder, über SSH, der des Befehls auf dem Server (dorthin gelangt er über die Standardeingabe, nie in argv).",
  es: "argv lleva el NOMBRE de la referencia; el valor viaja sólo en un entorno — el del hijo local o, por SSH, el del comando en el servidor (llega allí por la entrada estándar, nunca en argv).",
  ru: "argv несёт ИМЯ ссылки; значение едет только в окружении — локального потомка или, через SSH, команды на сервере (туда оно попадает через стандартный ввод, никогда не через argv).",
  uk: "У argv їде НАЗВА посилання; значення подорожує лише середовищем — локального дочірнього процесу або, через SSH, команди на сервері (туди воно потрапляє через стандартне введення, ніколи не через argv).",
};

const SECRETS_USAGE_APPENDED: Record<HelpLanguage, string> = {
  en: " For an entry set to run over SSH, the values go to the server’s login shell on its standard input as export lines — never on a command line or in the shell history; on the server they are in the environment of the command, where the same user and root can read them (for example with `ps e` or `/proc/<pid>/environ`), as for a run on this machine. The output is masked the same way. That run is not interactive: the command’s input is empty, so a command that asks a question usually stops; use *Run in Terminal* for such a command (the values are then not injected). Closing its terminal stops ssh on this machine; the command on the server has no terminal, so it can keep running there until it ends. It works only in a local VS Code window.",
  de: " Für einen Eintrag, der über SSH laufen soll, gehen die Werte als export-Zeilen über die Standardeingabe an die Login-Shell des Servers — nie auf eine Befehlszeile und nie in den Verlauf der Shell; auf dem Server stehen sie in der Umgebung des Befehls, wo derselbe Benutzer und root sie lesen können (zum Beispiel mit `ps e` oder `/proc/<pid>/environ`), wie bei einem Lauf auf diesem Rechner. Die Ausgabe wird genauso maskiert. Dieser Lauf ist nicht interaktiv: Die Eingabe des Befehls ist leer, darum hält ein Befehl, der eine Frage stellt, meist an; nutzen Sie für einen solchen Befehl *Run in Terminal* (die Werte werden dann nicht eingesetzt). Das Schließen seines Terminals beendet ssh auf diesem Rechner; der Befehl auf dem Server hat kein Terminal und kann dort weiterlaufen, bis er endet. Das geht nur in einem lokalen VS-Code-Fenster.",
  es: " En una entrada que se ejecuta por SSH, los valores van a la shell de inicio de sesión del servidor por su entrada estándar como líneas export — nunca en una línea de comandos ni en el historial de la shell; en el servidor están en el entorno del comando, donde el mismo usuario y root pueden leerlos (por ejemplo con `ps e` o `/proc/<pid>/environ`), igual que en una ejecución en esta máquina. La salida se enmascara igual. Esa ejecución no es interactiva: la entrada del comando está vacía, así que un comando que hace una pregunta suele detenerse; use *Run in Terminal* para ese comando (los valores no se inyectan entonces). Cerrar su terminal detiene ssh en esta máquina; el comando en el servidor no tiene terminal y puede seguir ejecutándose allí hasta que termine. Solo funciona en una ventana local de VS Code.",
  ru: " Для записи, которая выполняется через SSH, значения идут в оболочку входа сервера через её стандартный ввод строками export — никогда не в командную строку и не в историю оболочки; на сервере они находятся в окружении команды, где их может прочитать тот же пользователь и root (например, через `ps e` или `/proc/<pid>/environ`), как и при запуске на этой машине. Вывод маскируется так же. Такой запуск не интерактивен: ввод команды пуст, поэтому команда, которая задаёт вопрос, обычно останавливается; для такой команды используйте *Run in Terminal* (значения тогда не подставляются). Закрытие его терминала останавливает ssh на этой машине; у команды на сервере нет терминала, и она может продолжать работать там, пока не завершится. Это работает только в локальном окне VS Code.",
  uk: " Для запису, що виконується через SSH, значення йдуть до оболонки входу сервера через її стандартне введення рядками export — ніколи не в командний рядок і не в історію оболонки; на сервері вони є в середовищі команди, де їх може прочитати той самий користувач і root (наприклад, через `ps e` або `/proc/<pid>/environ`), як і під час запуску на цій машині. Виведення маскується так само. Такий запуск не інтерактивний: введення команди порожнє, тож команда, що ставить запитання, зазвичай зупиняється; для такої команди використовуйте *Run in Terminal* (значення тоді не підставляються). Закриття його терміналу зупиняє ssh на цій машині; команда на сервері не має терміналу й може працювати там далі, доки не завершиться. Це працює лише в локальному вікні VS Code.",
};

function secretReferences(language: HelpLanguage): string {
  const article = helpArticle('secret-references');
  assert.ok(article !== undefined, 'no article secret-references');
  const shown = bodyFor(article, language);
  assert.equal(shown.fallback, false, `${language} falls back to English`);
  return Object.values(shown.body).join('\n\n');
}

test('every_language_says_run_with_secrets_runs_over_ssh_from_a_local_window', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(whole(language).includes(RUNS_BULLET_SENTENCE[language]), `${language}: the terminal bullet does not say Run with Secrets runs over SSH`);
    const body = secretReferences(language);
    assert.ok(body.includes(SECRETS_WHAT_IT_IS[language]), `${language}: whatItIs`);
    assert.ok(body.includes(SECRETS_USAGE_FIRST[language]), `${language}: the first sentence of usage`);
    assert.ok(body.includes(SECRETS_USAGE_APPENDED[language]), `${language}: the appended text of usage`);
  }
  assert.ok(!secretReferences('en').includes('the value reaches only the child process’s environment'), 'the old, false clause is gone');
});

// Hp7
test('the_english_secrets_text_is_exact', () => {
  const body = secretReferences('en');
  for (const [name, text] of Object.entries({ whatItIs: SECRETS_WHAT_IT_IS.en, usageFirst: SECRETS_USAGE_FIRST.en, usageAppended: SECRETS_USAGE_APPENDED.en })) {
    assert.ok(body.includes(text), name);
  }
  for (const needle of ['ps e', 'can keep running there']) {
    assert.ok(body.includes(needle), `the remote environment and the close are said: ${needle}`);
  }
  assert.ok(!body.includes('never in the server’s process list'), 'too strong: on the server the values are in the environment of the command');
});

// Hp8 (E3.S2): the agent's run over SSH, in every language. Only when the SSH entry itself is *Usable by agents* — the SSH entry's own ask policy is not consulted.
const AGENT_RUN_SENTENCE: Record<HelpLanguage, string> = {
  en: "*Run with Secrets* runs it there too, from a local window, and so does an agent's run, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.",
  de: "*Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster, und der Lauf eines Agenten auch, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.",
  es: "*Run with Secrets* también la ejecuta allí, desde una ventana local, y la ejecución de un agente también, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.",
  ru: "*Run with Secrets* тоже выполняет её там, из локального окна, и запуск агентом тоже, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.",
  uk: "*Run with Secrets* теж виконує його там, із локального вікна, і запуск агентом теж, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.",
};

test('every_language_says_the_agents_run_needs_the_ssh_entry_usable_by_agents', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(whole(language).includes(AGENT_RUN_SENTENCE[language]), `${language}: the terminal bullet does not say that an agent's run needs the SSH entry to be Usable by agents`);
    assert.ok(whole(language).includes('*Usable by agents*'), `${language}: the label stays English`);
  }
  assert.ok(!whole('en').includes('an agent\'s run still refuses'), 'the E1 sentence is gone');
});
