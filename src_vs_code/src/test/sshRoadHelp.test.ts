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
  "*Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* runs it there too, from a local window. An agent's run goes there as well, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs. If that SSH entry is set to last until an agent uses it once, the agent's run is that use, and the SSH entry is deleted after it. A share and an export leave the choice out.";

const EN_ADVICE =
  "To run a line on a server, choose its **ssh** entry under *Runs over SSH* instead of writing `ssh` into the line. The arrow then connects with that entry — its key or password, its pinned host key, its jump host — and the line runs in your login shell there, which stays open after the line ends; a line that fails says its exit code first. Your login shell reads `/etc/profile` and your `~/.profile` (bash: `~/.bash_profile` first; zsh: `~/.zprofile` and `~/.zlogin`) before the line, as at a login, so the `PATH` you get when you connect is the `PATH` of the line. The shell of the line is not interactive: a tool that only the interactive part of `~/.bashrc` sets up, such as nvm or conda, is not found — set its `PATH` in `~/.profile` instead. What your profile prints is part of the output. Your profile must not end or replace the shell, or the line does not run. On the arrow, a folder run and a VPN's *Started by*, your profile is read twice: for the line, and for the shell that stays open. Put what must run once per login, such as `ssh-agent` or `keychain`, inside `case $- in *i*) … ;; esac`. On bash, a line that calls `exit` also runs your `~/.bash_logout`, and an `exit` in that file replaces the exit code of the line. Write the line for the server, such as `tmux new -A -s {name}` with *Runs on* set to Linux or macOS; a Windows server is refused. The login shell must be sh, bash, zsh, ksh or dash; fish and csh are not supported. The approval names the host, so a changed host, user, port, jump host, agent forwarding or port forward asks again. If the SSH entry signs in with a password, every run opens a new terminal beside any open one. Windows PowerShell 5.1 cannot pass a double quote to ssh, so such a line is refused there; install PowerShell 7 (`pwsh`). After a run, the arrow asks before it types into that terminal again, because the login shell is still open. A VPN's *Started by* runs over SSH the same way, but a launcher line with `{config}` is refused, because the config is a file on this machine, and an agent's VPN start with such a launcher is refused. *Copy Command* copies `ssh … -- user@host '<line>'`: it uses your own ssh setup (agent, `~/.ssh/config`), the vault's key and password are not in it, and on the server it does not start your login shell.";

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
  en: "*Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* runs it there too, from a local window. An agent's run goes there as well, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.",
  de: 'Ist einer gewählt, führen *Run in Terminal*, *Started by* eines VPN, *Run All in Folder* und eine Abhängigkeitskette die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. *Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster. Der Lauf eines Agenten geht ebenfalls dorthin, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.',
  es: 'Con una elegida, *Run in Terminal*, el *Started by* de una VPN, *Run All in Folder* y una cadena de dependencias ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. *Run with Secrets* también la ejecuta allí, desde una ventana local. La ejecución de un agente también va allí, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.',
  ru: 'Если запись выбрана, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* и цепочка зависимостей выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. *Run with Secrets* тоже выполняет её там, из локального окна. Запуск агентом тоже идёт туда, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.',
  uk: 'Якщо запис вибрано, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* і ланцюжок залежностей виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. *Run with Secrets* теж виконує його там, із локального вікна. Запуск агентом теж іде туди, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.',
};

const CHAIN_SENTENCES: Record<HelpLanguage, string> = {
  en: ' A step set to run over SSH runs there, in your login shell, and ends there, so the chain sees its exit code; its connection is made, and its PIN or host key asked, after you approve the chain and before any step runs. A step whose SSH entry signs in with a password is refused, because the chain\'s one terminal has one environment.',
  de: ' Ein Schritt, der über SSH laufen soll, läuft dort in Ihrer Login-Shell und endet dort, die Kette sieht also seinen Exit-Code; seine Verbindung wird vorbereitet und seine PIN oder sein Host-Schlüssel erfragt, nachdem Sie die Kette bestätigt haben und bevor ein Schritt läuft. Ein Schritt, dessen SSH-Eintrag sich mit einem Passwort anmeldet, wird abgelehnt, denn das eine Terminal der Kette hat eine Umgebung.',
  es: ' Un paso que se ejecuta por SSH se ejecuta allí en su shell de inicio de sesión y termina allí, así que la cadena ve su código de salida; su conexión se prepara, y se pregunta su PIN o su clave de host, después de que usted apruebe la cadena y antes de que se ejecute cualquier paso. Un paso cuya entrada SSH inicia sesión con una contraseña se rechaza, porque el único terminal de la cadena tiene un único entorno.',
  ru: ' Шаг, который выполняется через SSH, выполняется там в вашей оболочке входа и там же завершается, поэтому цепочка видит его код выхода; его подключение готовится, а PIN или ключ хоста спрашиваются после того, как вы одобрите цепочку, и до запуска любого шага. Шаг, чья запись SSH входит по паролю, отклоняется, потому что у единственного терминала цепочки одно окружение.',
  uk: " Крок, що виконується через SSH, виконується там у вашій оболонці входу і там же завершується, тож ланцюжок бачить його код виходу; його з'єднання готується, а PIN або ключ хоста запитуються після того, як ви схвалите ланцюжок, і до запуску будь-якого кроку. Крок, чий запис SSH входить за паролем, відхиляється, бо єдиний термінал ланцюжка має одне оточення.",
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
  for (const needle of ['runs there, in your login shell, and ends there', 'its PIN or host key asked, after you approve the chain and before any step runs', 'signs in with a password is refused']) {
    assert.ok(body.includes(needle), needle);
  }
});

// Hp6 (E3.S1): Run with Secrets runs over SSH from a local window — the terminal bullet, and the `secret-references` article, in every language.
// RUNS_BULLET_SENTENCE is the ONE table of the bullet's sentence about Run with Secrets and the agent's run: Hp6, Hp8 and Hp10 read it.
const RUNS_BULLET_SENTENCE: Record<HelpLanguage, string> = {
  en: "*Run with Secrets* runs it there too, from a local window. An agent's run goes there as well, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.",
  de: "*Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster. Der Lauf eines Agenten geht ebenfalls dorthin, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.",
  es: "*Run with Secrets* también la ejecuta allí, desde una ventana local. La ejecución de un agente también va allí, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.",
  ru: "*Run with Secrets* тоже выполняет её там, из локального окна. Запуск агентом тоже идёт туда, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.",
  uk: "*Run with Secrets* теж виконує його там, із локального вікна. Запуск агентом теж іде туди, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.",
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
  en: " For an entry set to run over SSH, the values go to the server’s login shell on its standard input as export lines — never on a command line or in the shell history; on the server they are in the environment of the command, where the same user and root can read them (for example with `ps e` or `/proc/<pid>/environ`), as for a run on this machine. The output is masked the same way. That run is not interactive: the command’s input is empty, so a command that asks a question usually stops; use *Run in Terminal* for such a command (the values are then not injected). Closing its terminal stops ssh on this machine; the command on the server has no terminal, so it can keep running there until it ends. It works only in a local VS Code window. Your profile is read first, and it reads an empty input: ssh sends the script with the values on its standard input, and your login shell takes it only after the profile has run, so the profile cannot take a value by accident. If a startup file on the server reads the input before your login shell starts (a `read` in `~/.bashrc`, for example), the run stops, says so and runs nothing: put that read behind the file's check for an interactive shell. Your `~/.bash_logout` does not run here, and a trace that your profile turns on (`set -x`) is off for this run, because it would print the values.",
  de: " Für einen Eintrag, der über SSH laufen soll, gehen die Werte als export-Zeilen über die Standardeingabe an die Login-Shell des Servers — nie auf eine Befehlszeile und nie in den Verlauf der Shell; auf dem Server stehen sie in der Umgebung des Befehls, wo derselbe Benutzer und root sie lesen können (zum Beispiel mit `ps e` oder `/proc/<pid>/environ`), wie bei einem Lauf auf diesem Rechner. Die Ausgabe wird genauso maskiert. Dieser Lauf ist nicht interaktiv: Die Eingabe des Befehls ist leer, darum hält ein Befehl, der eine Frage stellt, meist an; nutzen Sie für einen solchen Befehl *Run in Terminal* (die Werte werden dann nicht eingesetzt). Das Schließen seines Terminals beendet ssh auf diesem Rechner; der Befehl auf dem Server hat kein Terminal und kann dort weiterlaufen, bis er endet. Das geht nur in einem lokalen VS-Code-Fenster. Ihr Profil wird zuerst gelesen und liest eine leere Eingabe: ssh sendet das Skript mit den Werten über seine Standardeingabe, und Ihre Login-Shell nimmt es erst, nachdem das Profil gelaufen ist, darum kann das Profil keinen Wert aus Versehen nehmen. Liest eine Startdatei auf dem Server die Eingabe, bevor Ihre Login-Shell startet (zum Beispiel ein `read` in `~/.bashrc`), hält der Lauf an, sagt das und führt nichts aus: Setzen Sie dieses Lesen hinter die Prüfung der Datei auf eine interaktive Shell. Ihr `~/.bash_logout` läuft hier nicht, und eine Ablaufverfolgung, die Ihr Profil einschaltet (`set -x`), ist für diesen Lauf aus, weil sie die Werte ausgeben würde.",
  es: " En una entrada que se ejecuta por SSH, los valores van a la shell de inicio de sesión del servidor por su entrada estándar como líneas export — nunca en una línea de comandos ni en el historial de la shell; en el servidor están en el entorno del comando, donde el mismo usuario y root pueden leerlos (por ejemplo con `ps e` o `/proc/<pid>/environ`), igual que en una ejecución en esta máquina. La salida se enmascara igual. Esa ejecución no es interactiva: la entrada del comando está vacía, así que un comando que hace una pregunta suele detenerse; use *Run in Terminal* para ese comando (los valores no se inyectan entonces). Cerrar su terminal detiene ssh en esta máquina; el comando en el servidor no tiene terminal y puede seguir ejecutándose allí hasta que termine. Solo funciona en una ventana local de VS Code. Su perfil se lee primero y lee una entrada vacía: ssh envía el script con los valores por su entrada estándar, y su shell de inicio de sesión lo toma solo después de ejecutar el perfil, así que el perfil no puede tomar un valor por accidente. Si un archivo de inicio del servidor lee la entrada antes de que arranque su shell de inicio de sesión (por ejemplo un `read` en `~/.bashrc`), la ejecución se detiene, lo dice y no ejecuta nada: ponga esa lectura detrás de la comprobación de shell interactiva del archivo. Su `~/.bash_logout` no se ejecuta aquí, y un seguimiento que su perfil active (`set -x`) está desactivado en esta ejecución, porque imprimiría los valores.",
  ru: " Для записи, которая выполняется через SSH, значения идут в оболочку входа сервера через её стандартный ввод строками export — никогда не в командную строку и не в историю оболочки; на сервере они находятся в окружении команды, где их может прочитать тот же пользователь и root (например, через `ps e` или `/proc/<pid>/environ`), как и при запуске на этой машине. Вывод маскируется так же. Такой запуск не интерактивен: ввод команды пуст, поэтому команда, которая задаёт вопрос, обычно останавливается; для такой команды используйте *Run in Terminal* (значения тогда не подставляются). Закрытие его терминала останавливает ssh на этой машине; у команды на сервере нет терминала, и она может продолжать работать там, пока не завершится. Это работает только в локальном окне VS Code. Ваш профиль читается первым и читает пустой ввод: ssh отправляет скрипт со значениями через свой стандартный ввод, а ваша оболочка входа берёт его только после выполнения профиля, поэтому профиль не может случайно взять значение. Если стартовый файл на сервере читает ввод до запуска вашей оболочки входа (например, `read` в `~/.bashrc`), запуск останавливается, сообщает об этом и ничего не выполняет: поместите это чтение за проверку файла на интерактивную оболочку. Ваш `~/.bash_logout` здесь не запускается, а трассировка, которую включает ваш профиль (`set -x`), для этого запуска выключена, потому что она напечатала бы значения.",
  uk: " Для запису, що виконується через SSH, значення йдуть до оболонки входу сервера через її стандартне введення рядками export — ніколи не в командний рядок і не в історію оболонки; на сервері вони є в середовищі команди, де їх може прочитати той самий користувач і root (наприклад, через `ps e` або `/proc/<pid>/environ`), як і під час запуску на цій машині. Виведення маскується так само. Такий запуск не інтерактивний: введення команди порожнє, тож команда, що ставить запитання, зазвичай зупиняється; для такої команди використовуйте *Run in Terminal* (значення тоді не підставляються). Закриття його терміналу зупиняє ssh на цій машині; команда на сервері не має терміналу й може працювати там далі, доки не завершиться. Це працює лише в локальному вікні VS Code. Ваш профіль читається першим і читає порожнє введення: ssh надсилає скрипт зі значеннями через своє стандартне введення, а ваша оболонка входу бере його лише після виконання профілю, тож профіль не може випадково взяти значення. Якщо стартовий файл на сервері читає введення до запуску вашої оболонки входу (наприклад, `read` у `~/.bashrc`), запуск зупиняється, повідомляє про це й нічого не виконує: помістіть це читання за перевірку файла на інтерактивну оболонку. Ваш `~/.bash_logout` тут не запускається, а трасування, яке вмикає ваш профіль (`set -x`), для цього запуску вимкнене, бо воно надрукувало б значення.",
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

// Hp11 (PLAN_ssh_line_runs_in_login_shell.md): the line runs in the login shell, and every language says what that means and where it stops.
const LOGIN_SHELL_NEEDLES = ['/etc/profile', '~/.profile', '~/.bash_profile', '~/.zprofile', 'case $- in *i*) … ;; esac', 'ssh-agent', '~/.bash_logout', '~/.bashrc'];
const NO_BACKSLASH_CLAUSE: Record<HelpLanguage, string> = {
  en: 'final backslash',
  de: 'Backslash am Ende',
  es: 'barra invertida final',
  ru: 'обратную косую черту',
  uk: 'зворотну скісну риску',
};

test('every_language_says_the_line_runs_in_the_login_shell_and_names_only_the_double_quote_for_powershell_5_1', () => {
  for (const language of HELP_LANGUAGES) {
    const body = whole(language);
    for (const needle of LOGIN_SHELL_NEEDLES) {
      assert.ok(body.includes(needle), `${language} lacks ${needle}`);
    }
    assert.ok(!body.includes(NO_BACKSLASH_CLAUSE[language]), `${language} still names a trailing backslash for PowerShell 5.1`);
    const secrets = secretReferences(language);
    for (const needle of ['~/.bash_logout', '~/.bashrc', 'set -x']) {
      assert.ok(secrets.includes(needle), `${language}: Run with Secrets lacks ${needle}`);
    }
  }
});

// Hp8 (E3.S2): the agent's run over SSH, in every language. Only when the SSH entry itself is *Usable by agents* — the SSH entry's own ask policy is not consulted.
// It reads RUNS_BULLET_SENTENCE (Hp6's table): the bullet's one sentence is written down once.
test('every_language_says_the_agents_run_needs_the_ssh_entry_usable_by_agents', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(whole(language).includes(RUNS_BULLET_SENTENCE[language]), `${language}: the terminal bullet does not say that an agent's run needs the SSH entry to be Usable by agents`);
    assert.ok(whole(language).includes('*Usable by agents*'), `${language}: the label stays English`);
  }
  assert.ok(!whole('en').includes('an agent\'s run still refuses'), 'the E1 sentence is gone');
});

// Hp10 (E3.4 F-S2): a linked run spends a one-use SSH entry, said right after the sentence that says the agent's run needs the SSH entry *Usable by agents*.
const ONE_USE_SENTENCE: Record<HelpLanguage, string> = {
  en: "If that SSH entry is set to last until an agent uses it once, the agent's run is that use, and the SSH entry is deleted after it.",
  de: 'Ist dieser SSH-Eintrag so eingestellt, dass er nur bis zur einmaligen Benutzung durch einen Agenten besteht, ist der Lauf des Agenten diese Benutzung, und der SSH-Eintrag wird danach gelöscht.',
  es: 'Si esa entrada SSH está configurada para durar hasta que un agente la use una vez, la ejecución del agente es ese uso, y la entrada SSH se borra después.',
  ru: 'Если срок жизни этой записи SSH — до одного использования агентом, запуск агентом и есть это использование, и после него запись SSH удаляется.',
  uk: 'Якщо час життя цього запису SSH — до одного використання агентом, запуск агентом і є цим використанням, і після нього запис SSH видаляється.',
};

test('every_language_says_a_linked_run_spends_a_one_use_ssh_entry', () => {
  for (const language of HELP_LANGUAGES) {
    assert.ok(whole(language).includes(`${RUNS_BULLET_SENTENCE[language]} ${ONE_USE_SENTENCE[language]}`), `${language}: the terminal bullet does not say, after the Usable by agents sentence, that a linked run spends a one-use SSH entry`);
  }
});

// Hp9 (E3.S3.1, risk 1): the paragraph that advises choosing an ssh entry ends with the older-version note, in every language.
const OLDER_VERSION_NOTE: Record<HelpLanguage, string> = {
  en: ' An older version of CredsForDevs does not know *Runs over SSH*: it runs such an entry on its own machine, and a save there removes the choice for every machine. Update CredsForDevs on all your machines before you choose an SSH entry.',
  de: ' Eine ältere Version von CredsForDevs kennt *Runs over SSH* nicht: Sie führt einen solchen Eintrag auf ihrem eigenen Rechner aus, und ein Speichern dort entfernt die Wahl für alle Rechner. Aktualisieren Sie CredsForDevs auf allen Ihren Rechnern, bevor Sie einen SSH-Eintrag wählen.',
  es: ' Una versión anterior de CredsForDevs no conoce *Runs over SSH*: ejecuta esa entrada en su propia máquina, y guardarla allí quita la elección en todas las máquinas. Actualice CredsForDevs en todas sus máquinas antes de elegir una entrada SSH.',
  ru: ' Старая версия CredsForDevs не знает *Runs over SSH*: она выполняет такую запись на своей машине, а сохранение записи там убирает выбор на всех машинах. Обновите CredsForDevs на всех своих машинах, прежде чем выбирать запись SSH.',
  uk: ' Старша версія CredsForDevs не знає *Runs over SSH*: вона виконує такий запис на своїй машині, а збереження запису там прибирає вибір на всіх машинах. Оновіть CredsForDevs на всіх своїх машинах, перш ніж обирати запис SSH.',
};

test('every_language_warns_that_an_older_version_runs_a_linked_entry_locally', () => {
  for (const language of HELP_LANGUAGES) {
    const note = OLDER_VERSION_NOTE[language];
    const body = whole(language);
    assert.ok(body.includes(note), `${language}: the older-version note is absent`);
    const paragraph = body.split('\n\n').find((p) => p.includes(note));
    assert.ok(paragraph !== undefined && paragraph.includes('~/.ssh/config'), `${language}: the note is not at the end of the paragraph that advises choosing an ssh entry`);
    assert.ok(paragraph.endsWith(note), `${language}: the note is not the last sentence of that paragraph`);
  }
});
