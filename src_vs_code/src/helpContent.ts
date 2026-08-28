/**
 * The help catalog (tails T21): every article, in the one fixed shape the owner asked for —
 * what it is → why → how to set it up → how to use it → what can go wrong.
 *
 * <p>The TYPE enforces the style: an article that skips *why* does not compile. The index order
 * is explicit and deliberately not alphabetical — <b>the less guessable a feature is from its
 * menu entry, the earlier it goes</b> (the owner's own examples led: what are *MCP logs*? what
 * does *Install…* install?). Media slots exist and are empty, so the later picture pass is a
 * content edit, not a schema change.</p>
 *
 * <p><b>Languages.</b> English is required on every article; the other four are optional and
 * fall back VISIBLY ("not translated yet — showing English") — a missing translation must never
 * hide an article. Russian ships with the first build; Ukrainian, German and Spanish are
 * fallback until their content pass.</p>
 */

export const HELP_LANGUAGES = ['en', 'ru', 'uk', 'de', 'es'] as const;
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];

export const HELP_LANGUAGE_LABELS: Readonly<Record<HelpLanguage, string>> = {
  en: 'English',
  ru: 'Русский',
  uk: 'Українська',
  de: 'Deutsch',
  es: 'Español',
};

/** One article's text in one language. Every field required — the style IS the schema. */
export interface HelpBody {
  readonly title: string;
  readonly whatItIs: string;
  readonly why: string;
  readonly setup: string;
  readonly usage: string;
  readonly whatCanGoWrong: string;
}

export interface HelpArticle {
  readonly id: string;
  /** English is the floor; the rest appear as they are translated. */
  readonly en: HelpBody;
  readonly ru?: HelpBody;
  readonly uk?: HelpBody;
  readonly de?: HelpBody;
  readonly es?: HelpBody;
  /** Reserved for the picture pass — file names under media/help/, none shipped yet. */
  readonly mediaSlots: readonly string[];
}

/** The article as shown: the asked language, or English with a visible note. */
export function bodyFor(
  article: HelpArticle,
  language: HelpLanguage,
): { body: HelpBody; fallback: boolean } {
  const body = article[language];
  return body === undefined ? { body: article.en, fallback: language !== 'en' } : { body, fallback: false };
}

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'mcp-logs',
    mediaSlots: [],
    en: {
      title: 'MCP logs — the agent journal',
      whatItIs: 'A journal of everything AI agents did or asked through this extension: every list, every use, every refusal, and two counts worth watching — secrets that came FROM an agent, and requests we could not serve.',
      why: 'An agent acting on your credentials must leave a trail a person can read afterwards. The consent modal shows one action; the journal shows the pattern.',
      setup: 'Nothing to set up. The journal fills only when agent access is on for at least one entry (see “Agents over MCP”).',
      usage: 'The tree’s “…” menu → MCP logs. Each line names the entry, the action and the outcome; “Show Entry by id…” jumps from a line to the entry it names.',
      whatCanGoWrong: 'An empty journal with agents configured usually means no entry has its switches on — the ladder is off by default, including for entries that existed before the feature.',
    },
    ru: {
      title: 'MCP logs — журнал агентов',
      whatItIs: 'Журнал всего, что ИИ-агенты сделали или запросили через расширение: каждый список, каждое использование, каждый отказ, и два счётчика — секреты, пришедшие ОТ агента, и запросы, которые мы не смогли выполнить.',
      why: 'Агент, работающий с вашими учётными данными, обязан оставлять след, который человек может прочитать. Модал согласия показывает одно действие; журнал показывает картину.',
      setup: 'Настраивать нечего. Журнал наполняется, только когда агентский доступ включён хотя бы для одной записи (см. «Агенты через MCP»).',
      usage: 'Меню «…» дерева → MCP logs. Каждая строка называет запись, действие и результат; «Show Entry by id…» ведёт от строки к записи.',
      whatCanGoWrong: 'Пустой журнал при настроенных агентах обычно значит, что ни у одной записи не включены переключатели — лестница выключена по умолчанию, включая записи, существовавшие до фичи.',
    },
  },
  {
    id: 'install-menu',
    mediaSlots: [],
    en: {
      title: 'Install… — what it installs, and where',
      whatItIs: 'One submenu, three installers: the `creds` terminal CLI on this machine, the same CLI on another machine (a one-line command for your clipboard), and the `creds-mcp` server for AI agents.',
      why: 'The extension is the vault; these are its doors for terminals and agents. None of them can hold or obtain a secret — they relay requests to the VS Code window that owns the entry.',
      setup: 'Tree “…” menu → Install…. Each item says what it writes and where; the MCP item also writes the client configuration block for you.',
      usage: 'After installing the CLI, open an entry and run “Enable CLI Access…” to mint a name — then `creds ssh <name>` from any terminal. After installing the MCP server, restart your MCP client and open entries to it via the Agent access section.',
      whatCanGoWrong: '“No open window” from `creds` means no VS Code window with the extension is running, or the entry’s access was not enabled. Inside WSL the call crosses to Windows automatically; if it does not, the Windows binary is missing — reinstall from the same menu.',
    },
    ru: {
      title: 'Install… — что это ставит и куда',
      whatItIs: 'Одно подменю, три установщика: терминальный CLI `creds` на эту машину, тот же CLI на другую машину (однострочная команда в буфер) и сервер `creds-mcp` для ИИ-агентов.',
      why: 'Расширение — это сейф; а это его двери для терминалов и агентов. Ни одна из них не может хранить или получить секрет — они передают запрос окну VS Code, владеющему записью.',
      setup: 'Меню «…» дерева → Install…. Каждый пункт говорит, что и куда пишет; пункт MCP также пишет конфигурацию клиента за вас.',
      usage: 'Поставив CLI, откройте запись и выполните «Enable CLI Access…», чтобы выпустить имя — затем `creds ssh <имя>` из любого терминала. Поставив MCP-сервер, перезапустите MCP-клиент и открывайте записи через секцию Agent access.',
      whatCanGoWrong: '«No open window» от `creds` значит: нет запущенного окна VS Code с расширением, либо доступ записи не включён. Внутри WSL вызов сам уходит в Windows; если нет — не хватает Windows-бинаря, переустановите из того же меню.',
    },
  },
  {
    id: 'agents-mcp',
    mediaSlots: [],
    en: {
      title: 'Agents over MCP — the six switches',
      whatItIs: 'A per-entry ladder of six switches deciding what an AI agent may do: see the entry, use it, replace its secret, create entries, delete what it created, delete anything in the folder. All off by default, inherited from the folder.',
      why: 'An agent should reach exactly what you opened, nothing more — and “opened” should be visible on the entry itself, not buried in a config file.',
      setup: 'Edit an entry → Agent access (MCP) section, or set the switches on a folder and let entries inherit. Install the server via Install… → Install the MCP Server.',
      usage: 'The tree marks an opened entry with a pentagon — each lit edge one switch. Rotation happens through a `{{creds:new}}` placeholder, so no value ever enters the agent’s context. Every action still raises the consent modal.',
      whatCanGoWrong: 'The switch is permission to ASK, not consent — if the modal surprises you, that is it working. Nothing in the Trash answers agents, whatever its switches say. An agent seeing an empty list means no switches are on.',
    },
    ru: {
      title: 'Агенты через MCP — шесть переключателей',
      whatItIs: 'Лестница из шести переключателей на запись: видеть, использовать, заменять секрет, создавать записи, удалять созданное собой, удалять всё в папке. Все выключены по умолчанию, наследуются от папки.',
      why: 'Агент должен дотягиваться ровно до того, что вы открыли, и «открыто» должно быть видно на самой записи, а не спрятано в конфиге.',
      setup: 'Edit записи → секция Agent access (MCP), или переключатели на папке — записи унаследуют. Сервер ставится через Install… → Install the MCP Server.',
      usage: 'Открытая запись помечена в дереве пятиугольником — каждая горящая грань один переключатель. Ротация идёт через плейсхолдер `{{creds:new}}`: значение никогда не попадает в контекст агента. Каждое действие всё равно поднимает модал согласия.',
      whatCanGoWrong: 'Переключатель — это право СПРОСИТЬ, не согласие: если модал удивил — он работает. Корзина агентам не отвечает, что бы ни говорили переключатели. Пустой список у агента = переключатели выключены.',
    },
  },
  {
    id: 'config-entities',
    mediaSlots: [],
    en: {
      title: 'Config file entities',
      whatItIs: 'An entry whose body is a whole configuration file — appsettings.Development.json, a .env — kept out of git and synced inside the vault like any secret.',
      why: 'These files hold connection strings with passwords in them, and they were being passed between developers by hand and lost.',
      setup: 'Create an entry in a config folder (or pick the Config type), paste the file into Raw. It saves even while it does not parse — the row is marked until it does.',
      usage: 'Fields edits one value without touching your formatting. “Write Config File Here…” materialises to disk, refusing a git-tracked path. “Enable Code Access…” mints a key (shown once) so the app reads the config at startup — the viewer shows the exact code in twenty languages and names the file it goes into.',
      whatCanGoWrong: 'The key is shown once and only its hash is kept: lose it and you mint a new one. Writing into a tracked path is refused on purpose — the whole point is that git never sees this file.',
    },
    ru: {
      title: 'Записи-конфиги',
      whatItIs: 'Запись, тело которой — целый конфигурационный файл: appsettings.Development.json, .env — вне git, синхронизируется внутри сейфа как любой секрет.',
      why: 'В этих файлах строки подключения с паролями, и их передавали между разработчиками руками — и теряли.',
      setup: 'Создайте запись в папке config (или выберите тип Config), вставьте файл в Raw. Сохраняется даже пока не парсится — строка помечена, пока не начнёт.',
      usage: 'Fields правит одно значение, не трогая форматирование. «Write Config File Here…» пишет на диск, отказывая пути под git. «Enable Code Access…» выпускает ключ (показывается один раз), чтобы приложение читало конфиг на старте — вьюер показывает точный код на двадцати языках и называет файл, куда его вставить.',
      whatCanGoWrong: 'Ключ показывается один раз, хранится только его хеш: потеряли — выпускайте новый. Запись в отслеживаемый git-ом путь запрещена намеренно: смысл в том, что git этот файл не видит.',
    },
  },
  {
    id: 'cli',
    mediaSlots: [],
    en: {
      title: 'The creds terminal CLI',
      whatItIs: 'A native binary that uses a vault credential from any terminal — `creds ssh prod-db -- uname -a` — without ever receiving it. The window that owns the entry performs the action and returns only the output.',
      why: 'Not everything happens inside VS Code, and pasting tokens into shells is what this product exists to end.',
      setup: 'Install… → Install `creds`. On an entry: “Enable CLI Access…” mints the name you will type.',
      usage: 'Verbs: ssh, terminal, run, script, db, env, config, vpn-up, vpn-down, ls — and `creds relay` inside WSL for the SSH agent. The entry’s viewer lists its names with the exact command ready to copy.',
      whatCanGoWrong: 'The first call asks the human in VS Code — that is the design, not a hang. “No open window”: start VS Code, or check the entry’s CLI access. On a Remote-SSH host you also need the bridge (see Remote Bridge).',
    },
    ru: {
      title: 'Терминальный CLI creds',
      whatItIs: 'Нативный бинарь, использующий учётку из сейфа в любом терминале — `creds ssh prod-db -- uname -a` — никогда её не получая. Действие выполняет окно-владелец и возвращает только вывод.',
      why: 'Не всё происходит в VS Code, а вставка токенов в шелл — ровно то, что этот продукт должен прекратить.',
      setup: 'Install… → Install `creds`. На записи: «Enable CLI Access…» выпускает имя, которое вы будете печатать.',
      usage: 'Глаголы: ssh, terminal, run, script, db, env, config, vpn-up, vpn-down, ls — и `creds relay` внутри WSL для SSH-агента. Вьюер записи показывает её имена с готовой командой для копирования.',
      whatCanGoWrong: 'Первый вызов спрашивает человека в VS Code — это дизайн, не зависание. «No open window»: запустите VS Code или проверьте CLI-доступ записи. На Remote-SSH хосте нужен ещё и мост (см. Remote Bridge).',
    },
  },
  {
    id: 'remote-bridge',
    mediaSlots: [],
    en: {
      title: 'Remote Bridge — creds on a Remote-SSH host',
      whatItIs: 'An `ssh -R` tunnel this window holds open so that `creds` running ON the remote host can reach the vault window on your machine.',
      why: 'On a Remote-SSH host the local window is unreachable by definition — the terminal lives on the other machine.',
      setup: '“Install `creds` on the Host…” from the SSH entity’s menu, then “Open Remote Bridge…”. The menu item shows Close while a bridge runs.',
      usage: 'With the bridge open, `creds` on the host works exactly as it does locally — same consent modal on your side.',
      whatCanGoWrong: 'The bridge rides your SSH connection: if the connection drops, reopen it. A password-only SSH entity needs the vault to authenticate the tunnel — the extension resolves it; if it says the credential kind is unsupported, check the entity actually holds a password or key.',
    },
    ru: {
      title: 'Remote Bridge — creds на Remote-SSH хосте',
      whatItIs: 'Туннель `ssh -R`, который держит это окно, чтобы `creds` НА удалённом хосте дотягивался до окна с сейфом на вашей машине.',
      why: 'На Remote-SSH хосте локальное окно недостижимо по определению — терминал живёт на другой машине.',
      setup: '«Install `creds` on the Host…» из меню SSH-записи, затем «Open Remote Bridge…». Пункт меню показывает Close, пока мост открыт.',
      usage: 'С открытым мостом `creds` на хосте работает как локально — тот же модал согласия на вашей стороне.',
      whatCanGoWrong: 'Мост едет на вашем SSH-соединении: упало — переоткройте. Запись только с паролем аутентифицирует туннель через сейф; если пишет про неподдерживаемый вид учётки — проверьте, что в записи правда есть пароль или ключ.',
    },
  },
  {
    id: 'wsl-relay',
    mediaSlots: [],
    en: {
      title: 'The WSL agent relay',
      whatItIs: 'A unix socket inside your WSL distributions that serves the extension’s SSH agent, so `ssh` and `git` in WSL use vault keys — with a confirmation dialog per signature.',
      why: 'A Linux kernel cannot open a Windows named pipe; without the relay, WSL simply cannot see the agent.',
      setup: '“Set Up the WSL Agent Relay” — it turns the setting on, checks each distribution and says OK or what is missing. `wslRelayDistros` picks which distributions.',
      usage: 'Nothing to type: new WSL shells get SSH_AUTH_SOCK. Every signature asks you first, naming the key and what it signs.',
      whatCanGoWrong: 'The relay needs `creds` reachable inside the distribution (the setup says so if not). If signatures stop, the relay process died with its window — any new VS Code window restarts it.',
    },
    ru: {
      title: 'Релей агента в WSL',
      whatItIs: 'Unix-сокет внутри ваших WSL-дистрибутивов, отдающий SSH-агент расширения: `ssh` и `git` в WSL используют ключи из сейфа — с диалогом подтверждения на каждую подпись.',
      why: 'Linux-ядро не может открыть именованный канал Windows; без релея WSL агента просто не видит.',
      setup: '«Set Up the WSL Agent Relay» — включает настройку, проверяет каждый дистрибутив и говорит OK или чего не хватает. `wslRelayDistros` выбирает дистрибутивы.',
      usage: 'Печатать нечего: новые шеллы WSL получают SSH_AUTH_SOCK. Каждая подпись сперва спрашивает вас, называя ключ и что подписывается.',
      whatCanGoWrong: 'Релею нужен `creds`, достижимый внутри дистрибутива (настройка скажет, если нет). Подписи прекратились — процесс релея умер вместе с окном; любое новое окно VS Code поднимет его снова.',
    },
  },
  {
    id: 'corporate-recovery',
    mediaSlots: [],
    en: {
      title: 'Corporate recovery — the break-glass',
      whatItIs: 'For teams on a self-hosted server: named recovery officers, any quorum of whom (2-of-3 by default) can together open a vault whose owner has left. The server itself never can.',
      why: 'People leave; their vaults must not. And no server operator should be able to read a vault alone — the organisation key is split and destroyed at setup.',
      setup: 'Operator: “Corporate Recovery…” names the officers and quorum. Each officer: “Accept Recovery Share…” — on every machine they will use, because shares live in the machine’s keychain and do not sync.',
      usage: '“Recover a Colleague’s Vault…” starts it; officers run “Contribute to a Recovery…”; “Finish a Recovery…” re-keys the vault under a temporary PIN you tell the person out of band.',
      whatCanGoWrong: 'An officer’s share accepted on their laptop is NOT on their desktop — accept per machine. A roster that cannot reach quorum turns the feature off rather than pretending. Removing an officer needs a full re-ceremony: a Shamir share cannot be selectively revoked.',
    },
    ru: {
      title: 'Корпоративное восстановление',
      whatItIs: 'Для команд на своём сервере: названные офицеры восстановления, любой кворум которых (по умолчанию 2 из 3) вместе открывает сейф ушедшего коллеги. Сам сервер — никогда.',
      why: 'Люди уходят; их сейфы уходить не должны. И ни один оператор сервера не должен читать сейф в одиночку — ключ организации разделён и уничтожен при настройке.',
      setup: 'Оператор: «Corporate Recovery…» называет офицеров и кворум. Каждый офицер: «Accept Recovery Share…» — на каждой машине, где будет участвовать: доли живут в кейчейне машины и не синхронизируются.',
      usage: '«Recover a Colleague’s Vault…» начинает; офицеры выполняют «Contribute to a Recovery…»; «Finish a Recovery…» перекеивает сейф под временный PIN, который вы сообщаете человеку вне канала.',
      whatCanGoWrong: 'Доля, принятая на ноутбуке, НЕ появится на десктопе — принимайте на каждой машине. Ростер без кворума честно выключает фичу. Убрать офицера — только полная новая церемония: долю Шамира нельзя отозвать выборочно.',
    },
  },
  {
    id: 'recovery-code',
    mediaSlots: [],
    en: {
      title: 'The printed recovery code',
      whatItIs: 'A 150-bit code shown once, printed, kept on paper — the third way into the vault for the day the PIN is forgotten AND the security key is gone.',
      why: 'The two everyday factors can fail together — a forgotten PIN and a lost YubiKey is one bad week, not a paradox.',
      setup: '“Set Up Recovery Code…” shows it once, with Print and deliberately no Copy: clipboards are read by managers, sync tools and screenshot pipelines, and this factor must outlive the laptop.',
      usage: '“Unlock Vault (Recovery Code)…”, type it from paper — a typo is named locally by its checksum — then set a new PIN.',
      whatCanGoWrong: 'Generating a new code retires the old printout. Removing your last security key can retire the code too (re-wrapping needs the code, which is on paper) — the extension says so out loud now.',
    },
    ru: {
      title: 'Печатный код восстановления',
      whatItIs: 'Код на 150 бит: показан один раз, напечатан, лежит на бумаге — третий вход в сейф на день, когда PIN забыт И ключ безопасности потерян.',
      why: 'Два повседневных фактора могут отказать вместе: забытый PIN и потерянный YubiKey — это одна плохая неделя, а не парадокс.',
      setup: '«Set Up Recovery Code…» показывает его один раз, с Print и намеренно без Copy: буфер читают менеджеры буфера, синк и скриншот-пайплайны, а этот фактор должен пережить ноутбук.',
      usage: '«Unlock Vault (Recovery Code)…», ввести с бумаги — опечатку чексумма назовёт локально — затем задать новый PIN.',
      whatCanGoWrong: 'Новый код отзывает старую распечатку. Удаление последнего ключа безопасности может отозвать и код (перезавёртка требует код, а он на бумаге) — теперь расширение говорит это вслух.',
    },
  },
  {
    id: 'ephemeral',
    mediaSlots: [],
    en: {
      title: 'Short-lived entries',
      whatItIs: 'An entry with a lifetime: an hour, a day, until this window closes, or until an agent has used it once. When it ends, the entry is REALLY deleted — secret, history and tombstone — on every machine that syncs.',
      why: 'A temporary credential that outlives its task is a standing risk with nobody watching it.',
      setup: 'The Lifetime section of the entity form. “Until the window closes” is a lease, so a crashed window cannot leave its promise unkept.',
      usage: 'The tree shows the remaining time on the row. Copying a value yourself does not count as the agent’s one use.',
      whatCanGoWrong: 'Deletion is real: history goes too, and no snapshot taken AFTER the expiry can bring it back. A snapshot from before still can — that is what snapshots are for.',
    },
    ru: {
      title: 'Короткоживущие записи',
      whatItIs: 'Запись со сроком: час, день, до закрытия окна или до одного использования агентом. Когда срок выходит, запись УДАЛЯЕТСЯ по-настоящему — секрет, история, tombstone — на каждой синхронизируемой машине.',
      why: 'Временная учётка, пережившая свою задачу, — это постоянный риск, за которым никто не следит.',
      setup: 'Секция Lifetime в форме записи. «До закрытия окна» — это аренда, чтобы упавшее окно не оставило обещание неисполненным.',
      usage: 'Дерево показывает остаток на строке. Ваше собственное копирование значения не считается использованием агентом.',
      whatCanGoWrong: 'Удаление настоящее: уходит и история, и снапшот, снятый ПОСЛЕ истечения, не вернёт запись. Снятый до — вернёт: для этого снапшоты и есть.',
    },
  },
  {
    id: 'filters',
    mediaSlots: [],
    en: {
      title: 'The filter, and capability filters',
      whatItIs: 'The search row filters the tree live by what a row shows — name, host, user, command — and, with `has:` / `mcp:` predicates, by what an entry CAN DO.',
      why: '“Which entries can agents rotate?” and “what has a one-time code?” are questions a name search cannot answer.',
      setup: 'Nothing. Click the search row or run Filter Credentials….',
      usage: '`aws has:totp mcp:usable` — free text and predicates AND together. Available: has:totp, has:cli, has:env, has:code-access, has:deps, has:attachment, has:image, is:ephemeral, mcp:visible/usable/rotate/create/delete-own/delete-any. Click a result and keep working — closing the filter reveals and briefly tints the row you had selected.',
      whatCanGoWrong: 'Secrets are never searched — a filter over passwords would confirm one keystroke at a time. An unknown predicate is named on the row rather than silently matched as text.',
    },
    ru: {
      title: 'Фильтр и фильтры-возможности',
      whatItIs: 'Строка поиска фильтрует дерево на лету по тому, что видно на строке — имя, хост, пользователь, команда — а с предикатами `has:` / `mcp:` — по тому, что запись МОЖЕТ.',
      why: '«Что агенты могут ротировать?» и «у чего есть одноразовый код?» — вопросы, на которые поиск по имени не отвечает.',
      setup: 'Ничего. Клик по строке поиска или Filter Credentials….',
      usage: '`aws has:totp mcp:usable` — текст и предикаты работают через И. Доступно: has:totp, has:cli, has:env, has:code-access, has:deps, has:attachment, has:image, is:ephemeral, mcp:visible/usable/rotate/create/delete-own/delete-any. Кликайте по результату и работайте — закрытие фильтра покажет и коротко подсветит выбранную строку.',
      whatCanGoWrong: 'Секреты не ищутся никогда — фильтр по паролям подтверждал бы их по букве. Незнакомый предикат называется на строке, а не молча ищется как текст.',
    },
  },
  {
    id: 'secret-references',
    mediaSlots: [],
    en: {
      title: 'Secret references and masked runs',
      whatItIs: 'Write `creds://you@corp.com/prod-db/password` where a value would go, then Run with Secrets: the value reaches only the child process’s environment, and every appearance of it in the output is replaced with a named marker.',
      why: 'A secret on a command line is in shell history forever; a secret in output is in scrollback and logs.',
      setup: 'Nothing — the reference syntax works in terminal-command and script entries.',
      usage: 'argv carries the reference NAME; the value travels in the child’s environment only. The broker masks what it returns to agents the same way.',
      whatCanGoWrong: 'Masking replaces EXACT values only — never a guess about what looks like a token, because a wrong guess corrupts the JSON the agent then acts on. It covers commands run through CredsForDevs, and says so.',
    },
    ru: {
      title: 'Ссылки на секреты и маскированный запуск',
      whatItIs: 'Пишете `creds://you@corp.com/prod-db/password` вместо значения, затем Run with Secrets: значение попадает только в окружение дочернего процесса, а каждое его появление в выводе заменяется именованным маркером.',
      why: 'Секрет в командной строке — навсегда в истории шелла; секрет в выводе — в скроллбеке и логах.',
      setup: 'Ничего — синтаксис ссылок работает в записях-командах и скриптах.',
      usage: 'argv несёт ИМЯ ссылки; значение едет только в окружении потомка. Брокер так же маскирует то, что возвращает агентам.',
      whatCanGoWrong: 'Маскируются ТОЧНЫЕ значения — никаких догадок о «похожем на токен»: неверная догадка портит JSON, по которому агент действует. Покрывает команды, запущенные ЧЕРЕЗ CredsForDevs, и говорит это прямо.',
    },
  },
  {
    id: 'ssh-agent',
    mediaSlots: [],
    en: {
      title: 'The SSH agent that asks every time',
      whatItIs: 'Add to SSH Agent serves a stored key from memory over this window’s own socket — no key file exists on disk at all — and every single use opens a dialog naming the key and what it is signing.',
      why: 'An agent that signs silently is a key with no owner present; a key file on disk is a key an attacker can copy.',
      setup: 'On a key entity: Add to SSH Agent (confirm every use). New terminals get SSH_AUTH_SOCK automatically.',
      usage: '`ssh` and `git` just find it. Copy Git Signing Config sets up commit signing with a key that lives only in the vault. In WSL, see the relay article.',
      whatCanGoWrong: 'A dialog per signature is the feature — git operations that sign several times will ask several times. If nothing asks and nothing signs, the window that served the agent is gone.',
    },
    ru: {
      title: 'SSH-агент, который каждый раз спрашивает',
      whatItIs: 'Add to SSH Agent отдаёт хранимый ключ из памяти через собственный сокет окна — файла ключа на диске нет вообще — и каждое использование открывает диалог с именем ключа и тем, что подписывается.',
      why: 'Агент, подписывающий молча, — это ключ без присутствия владельца; файл ключа на диске — ключ, который можно скопировать.',
      setup: 'На записи-ключе: Add to SSH Agent (confirm every use). Новые терминалы получают SSH_AUTH_SOCK автоматически.',
      usage: '`ssh` и `git` просто находят его. Copy Git Signing Config настраивает подпись коммитов ключом, живущим только в сейфе. В WSL — см. статью о релее.',
      whatCanGoWrong: 'Диалог на каждую подпись — это и есть фича: git-операция с несколькими подписями спросит несколько раз. Если никто не спрашивает и ничего не подписывается — окно-агент закрыто.',
    },
  },
  {
    id: 'sharing',
    mediaSlots: [],
    en: {
      title: 'Sharing — team, external, and taking it back',
      whatItIs: 'Send one entity or a folder, sealed, to a colleague on the same vault location — or export a sealed file for someone outside. A share nobody accepted yet can be withdrawn.',
      why: 'Reading a password over a call puts it in two notebooks; a sealed share puts it in one vault.',
      setup: 'On the server transport the sender is stamped from a verified sign-in; on a NAS folder the sender line is trust-on-first-use — the fingerprint is there to read aloud.',
      usage: 'Share with… / Create Entity for… / Accept…. A one-time PIN travels out of band. Whether a one-time code travels with the entry is asked, not assumed. Withdraw a Share You Sent… while it is still pending.',
      whatCanGoWrong: '“Already accepted” on withdraw means beyond recall — rotate the secret, that is the only move left. A declined share can reappear on a NAS folder (no server to dedup) — the sender line and fingerprint are what to check.',
    },
    ru: {
      title: 'Шаринг — команде, наружу, и как забрать назад',
      whatItIs: 'Отправить запись или папку, запечатанной, коллеге на той же локации сейфа — или экспортировать запечатанный файл наружу. Шару, которую ещё не приняли, можно отозвать.',
      why: 'Пароль, прочитанный по звонку, оказывается в двух блокнотах; запечатанная шара — в одном сейфе.',
      setup: 'На серверном транспорте отправитель штампуется из проверенного входа; на NAS-папке строка отправителя — trust-on-first-use, отпечаток дан, чтобы прочитать вслух.',
      usage: 'Share with… / Create Entity for… / Accept…. Одноразовый PIN передаётся вне канала. Едет ли одноразовый код вместе с записью — спрашивается, не подразумевается. Withdraw a Share You Sent… — пока шара ждёт.',
      whatCanGoWrong: '«Уже принято» при отзыве значит — не вернуть: ротируйте секрет, это единственный ход. На NAS-папке отклонённая шара может появиться снова (нет сервера для дедупа) — проверяйте строку отправителя и отпечаток.',
    },
  },
  {
    id: 'sync-vs-snapshots',
    mediaSlots: [],
    en: {
      title: 'Sync and snapshots are different machines',
      whatItIs: 'Sync merges one encrypted file per profile across machines (causally — two machines editing at once converge). Snapshots are dated copies that never merge.',
      why: 'A merge propagates a deletion — that is its job. The snapshot is the copy that still has what you deleted.',
      setup: 'Set Sync Location… per account (folder, server URL, or a git repo). Point backupLocation at DIFFERENT storage. Same Sync PIN on every machine.',
      usage: 'Sync Now, or autoSync. Snapshot Vault Now for a manual point; Import / Restore to come back.',
      whatCanGoWrong: 'Sync and snapshots into the same folder defeats the reason there are two. A restore brings back a vault as of THEN — sync after restoring merges the newer edits back in.',
    },
    ru: {
      title: 'Синк и снапшоты — разные механизмы',
      whatItIs: 'Синк сливает один шифрованный файл на профиль между машинами (казуально — две машины, правящие одновременно, сходятся). Снапшоты — датированные копии, которые не сливаются никогда.',
      why: 'Слияние разносит удаление — это его работа. Снапшот — та копия, где удалённое ещё есть.',
      setup: 'Set Sync Location… на аккаунт (папка, URL сервера или git-репозиторий). backupLocation — на ДРУГОЕ хранилище. Один Sync PIN на всех машинах.',
      usage: 'Sync Now или autoSync. Snapshot Vault Now — ручная точка; Import / Restore — вернуться.',
      whatCanGoWrong: 'Синк и снапшоты в одну папку обесценивают то, зачем их два. Restore возвращает сейф на ТОТ момент — синк после restore вольёт свежие правки обратно.',
    },
  },
  {
    id: 'totp',
    mediaSlots: [],
    en: {
      title: 'One-time codes (TOTP)',
      whatItIs: 'The second-factor seed as a first-class secret: the viewer shows the live code with a countdown, the tree has Copy One-Time Code. Steam Guard included.',
      why: 'The seed on a phone dies with the phone; in the vault it syncs, snapshots and survives.',
      setup: 'Paste the otpauth:// URI, the base32 secret — or just a SCREENSHOT of the QR (Ctrl+V in the form): Google Authenticator exports only as a picture, and the form reads it.',
      usage: 'Copy One-Time Code from the tree; the seed itself never reaches the webview, only the code derived from it. Whether the seed travels with a share is asked explicitly.',
      whatCanGoWrong: 'A counter-based (HOTP) QR is refused by name — a second copy of one advances a counter and desyncs the first. An export picture holds every account at once; the form lists them by issuer so you pick the right one.',
    },
    ru: {
      title: 'Одноразовые коды (TOTP)',
      whatItIs: 'Сид второго фактора как полноценный секрет: вьюер показывает живой код с отсчётом, в дереве Copy One-Time Code. Steam Guard включён.',
      why: 'Сид на телефоне умирает вместе с телефоном; в сейфе он синкается, снапшотится и живёт.',
      setup: 'Вставьте otpauth:// URI, base32-секрет — или просто СКРИНШОТ QR (Ctrl+V в форме): Google Authenticator экспортирует только картинкой, и форма её читает.',
      usage: 'Copy One-Time Code из дерева; сам сид никогда не попадает в webview — только код из него. Едет ли сид с шарой — спрашивается явно.',
      whatCanGoWrong: 'Счётчиковый (HOTP) QR отклоняется по имени — вторая копия сдвигает счётчик и рассинхронизирует первую. Картинка экспорта держит все аккаунты сразу; форма перечисляет их по issuer, чтобы вы выбрали нужный.',
    },
  },
  {
    id: 'health',
    mediaSlots: [],
    en: {
      title: 'The health report and the scans',
      whatItIs: 'Health Report finds reused passwords, weak ones, unencrypted keys in ~/.ssh and plaintext credentials in a workspace .env. Two on-demand scans check the clipboard and a file for vault secrets. Show Diagnostics is the log you attach to a bug report.',
      why: 'Hygiene problems are invisible one at a time; a report is how they become a list with checkboxes.',
      setup: 'Nothing. The optional breach check is strictly opt-in and sends five characters of a hash, nothing else.',
      usage: 'Run Health Report from the palette; each finding names the entry. Check Clipboard / Scan This File before pasting into a public place.',
      whatCanGoWrong: 'The scans are on-demand because VS Code exposes no clipboard-change event — continuous watching is not possible and the report says so instead of implying it.',
    },
    ru: {
      title: 'Отчёт о гигиене и сканы',
      whatItIs: 'Health Report находит повторные и слабые пароли, незашифрованные ключи в ~/.ssh и плейнтекст-учётки в .env воркспейса. Два скана по требованию проверяют буфер и файл на секреты сейфа. Show Diagnostics — лог для баг-репорта.',
      why: 'Проблемы гигиены невидимы поодиночке; отчёт превращает их в список с галочками.',
      setup: 'Ничего. Опциональная проверка утечек строго opt-in и шлёт пять символов хеша, больше ничего.',
      usage: 'Health Report из палитры; каждая находка называет запись. Check Clipboard / Scan This File — перед вставкой в публичное место.',
      whatCanGoWrong: 'Сканы по требованию, потому что VS Code не даёт события изменения буфера — постоянное слежение невозможно, и отчёт говорит это прямо, а не подразумевает обратное.',
    },
  },
  {
    id: 'basics',
    mediaSlots: [],
    en: {
      title: 'Entries, folders and the tree',
      whatItIs: 'Accounts hold typed folders; folders hold entries — SSH hosts, keys, databases, VPNs, terminal commands, scripts, configs, plain credentials. The account row counts entries / Trash / shared.',
      why: 'A vault you cannot navigate is a vault you stop using; types are what keep a hundred entries readable.',
      setup: 'A new account seeds the typed folders. A project folder scaffolds the same set inside itself.',
      usage: 'A single click shows the entry in the read-only viewer, in one shared preview tab the next click reuses; a double click pins it into a tab of its own. Edit is on the right-click. New arrivals — created, imported or accepted — are revealed and briefly tinted green so “it worked” and “here it is” are one event. Deleted entries go to the Trash, which can empty itself on a timer.',
      whatCanGoWrong: 'The Trash is a delay, not a veto — a retention timer really deletes. An entry’s kind is fixed by its folder’s type; move it rather than fighting the form.',
    },
    ru: {
      title: 'Записи, папки и дерево',
      whatItIs: 'Аккаунты держат типизированные папки; папки — записи: SSH-хосты, ключи, базы, VPN, терминальные команды, скрипты, конфиги, простые учётки. Строка аккаунта считает записи / корзину / шары.',
      why: 'Сейф, по которому нельзя ориентироваться, перестают использовать; типы — то, что держит сотню записей читаемой.',
      setup: 'Новый аккаунт получает набор типизированных папок. Папка-проект разворачивает такой же набор внутри себя.',
      usage: 'Один клик показывает запись во вьюере — в одной общей вкладке-превью, которую следующий клик переиспользует; двойной клик закрепляет её в отдельную вкладку. Edit — по правому клику. Новые строки — созданные, импортированные, принятые — показываются и коротко подсвечиваются зелёным: «получилось» и «вот оно» — одно событие. Удалённое уходит в корзину, которая умеет чиститься по таймеру.',
      whatCanGoWrong: 'Корзина — отсрочка, не вето: таймер удаляет по-настоящему. Вид записи фиксирован типом папки; переносите запись, а не боритесь с формой.',
    },
  },
];

/** Ids must be unique and the order IS the index page. */
export function helpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}
