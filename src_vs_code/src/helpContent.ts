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
    id: 'getting-started',
    mediaSlots: [],
    en: {
      title: 'Start here: an account, and where its vault lives',
      whatItIs: 'An account is one vault: its own tree, its own encryption, its own place to live. Adding one is the first thing you do — folders, entries and everything else hang off it.\n\nA vault works completely with no place at all. What a location adds is a second machine and other people.',
      why: 'Everything is encrypted on your machine before it leaves, so the location only ever holds ciphertext — but it is still worth choosing at the start rather than later, when several machines already hold copies of the old one.',
      setup: 'Account row -> **Add Account**, and sign in. Then on that account -> **Set Sync Location…**, and pick one of two:\n\n- a **folder** — any path this machine can write: `Z:\\\\Backups`, `\\\\\\\\NAS\\\\Vault`, `/mnt/nas/vault`, or a folder something else already syncs;\n- a **server** — the URL of a Cred Vault Server, `https://vault.company.com`.\n\nLeave it empty and the vault stays on this machine: everything works, nothing syncs. A git repository is a third option and has its own article.',
      usage: '**Which of the two, and it is not a matter of taste:**\n\n- A **folder** when it is you, or a few people who already share storage. Nothing to run and nothing to maintain. The sender of a shared entry is trust-on-first-use — you read the fingerprint aloud once and remember it.\n- A **server** when more than one person is involved. It stamps the sender of a share from a verified sign-in, so a sender cannot be forged; it scopes reads to your own token; and joining and leaving follow the identity provider you already have.\n\nNeither can read anything. What travels and what is stored is ciphertext either way, and the server has no key and no code path that would let it acquire one.',
      whatCanGoWrong: 'With no location nothing is broken — the vault is local and complete. What you do not have is a second machine or sharing.\n\nChanging the location later does not move the old file. Point the new one at the same folder, or sync once from the machine that still holds the data.\n\n**Sign Out / Remove Account** takes the account off THIS machine — the tree, its vault file and its keys here. It is not a delete on the server or in the sync folder: sign in again, or add the account on another machine, and the tree comes back. **Reset Google OAuth** is the smaller hammer for a sign-in that has gone wrong — it forgets the stored client secret and every Google session, leaving the vaults alone, so the next sign-in starts clean.\n\nOn a server account, **Server Metrics…** reads the one JSON document the server publishes about itself. Whoever is not on the officers’ roster gets the server’s own refusal, in words.\n\nA location that looks like a git address — `git@…`, `ssh://…`, or a `.git` suffix — becomes a git vault rather than a folder. That is deliberate, and it is why a plain `https://github.com/me/vault` is NOT guessed at: it could as easily be a server URL.',
    },
    ru: {
      title: 'Начните отсюда: аккаунт и место, где живёт его сейф',
      whatItIs: 'Аккаунт — это один сейф: своё дерево, своё шифрование, своё место жительства. Добавить его — первое, что вы делаете: папки, записи и всё остальное висят на нём.\n\nСейф полностью работает вообще без места. Место добавляет вторую машину и других людей.',
      why: 'Всё шифруется на вашей машине до того, как что-либо уедет, поэтому место хранит только шифротекст. Но выбрать его лучше в начале, а не потом, когда копии старого уже лежат на нескольких машинах.',
      setup: 'Строка аккаунта -> **Add Account**, войти. Затем на этом аккаунте -> **Set Sync Location…** и одно из двух:\n\n- **папка** — любой путь, куда эта машина может писать: `Z:\\\\Backups`, `\\\\\\\\NAS\\\\Vault`, `/mnt/nas/vault` или папка, которую уже синхронизирует что-то другое;\n- **сервер** — адрес Cred Vault Server, `https://vault.company.com`.\n\nОставьте пустым — сейф останется на этой машине: всё работает, ничего не синхронизируется. Git-репозиторий — третий вариант, у него своя статья.',
      usage: '**Что из двух выбрать — и это не вопрос вкуса:**\n\n- **Папка**, когда это вы или несколько человек, у которых уже есть общее хранилище. Нечего запускать и нечего поддерживать. Отправитель присланной записи подтверждается по первому разу — отпечаток читают вслух один раз и запоминают.\n- **Сервер**, когда людей больше одного. Он ставит подпись отправителя из проверенного входа, поэтому её нельзя подделать; ограничивает чтение вашим токеном; а вход и выход людей идут через тот провайдер, который у вас и так есть.\n\nПрочитать не может ни то, ни другое. И по проводу, и на диске лежит шифротекст, а у сервера нет ключа и нет пути, которым он мог бы его получить.',
      whatCanGoWrong: 'Без места ничего не сломано — сейф локальный и полный. Нет второй машины и обмена.\n\nСмена места позже не переносит старый файл. Укажите новое на ту же папку или синхронизируйтесь один раз с машины, где данные ещё есть.\n\n**Sign Out / Remove Account** убирает аккаунт с ЭТОЙ машины — дерево, локальный файл сейфа и ключи здесь. Это не удаление на сервере или в папке синхронизации: войдите снова или добавьте аккаунт на другой машине — дерево вернётся. **Reset Google OAuth** — молоток поменьше для сломавшегося входа: забывает сохранённый client secret и все Google-сессии, не трогая сейфы, чтобы следующий вход начался с чистого листа.\n\nУ серверного аккаунта **Server Metrics…** читает единственный JSON-документ, который сервер публикует о себе. Тот, кого нет в списке офицеров, получит собственный отказ сервера словами.\n\nМесто, похожее на git-адрес — `git@…`, `ssh://…` или окончание `.git`, — становится git-сейфом, а не папкой. Это намеренно, и поэтому обычный `https://github.com/me/vault` НЕ угадывается: он с тем же успехом может быть адресом сервера.',
    },
  },
  {
    id: 'protection',
    mediaSlots: [],
    en: {
      title: 'Locking the vault: the PIN, a security key, auto-lock',
      whatItIs: 'Three independent ways in, and a timer that decides how long an unlocked vault stays open: a **sync PIN**, one or more **security keys** (YubiKey / FIDO2), and a printed **recovery code**.',
      why: 'A vault encrypts its payload with a random master key, and that master key is wrapped once per unlock method — one wrap for the PIN, one per registered key. Any wrap opens the vault, which is why adding or removing a key never re-encrypts your data and never invalidates the others.',
      setup: '- **Set Sync PIN** — the same PIN on every machine that syncs this account. Without it another machine downloads a file it cannot open.\n- **Add Security Key (YubiKey)…** on the account row. The OS shows its own security-key prompt, and the key\'s WebAuthn PRF secret becomes a wrapping key. Register as many as you like.\n- **Set Auto-Lock…** — minutes of your inactivity. 60 by default; `0` never locks.\n- **Set Up Recovery Code…** — the third way in, on paper. Its own article, and worth doing before you need it.',
      usage: 'Unlocking with a key is a touch, in the style of a Microsoft sign-in — no typed password. The master key is then held for the window, so background sync never asks again. **Lock Vaults** drops it; **Unlock Vault (Security Key)…** asks on demand.\n\nAuto-lock counts YOUR actions — opening or copying a credential, connecting, installing a key, editing, unlocking. Not mouse movement, and deliberately not background sync: a five-minute sync timer counted as activity would mean the idle window never elapses and the setting silently does nothing.\n\nLocking forgets the master key. Local credentials keep working, because they live in the OS keychain and are not protected by the vault key.',
      whatCanGoWrong: 'No PIN makes the vault local in practice: another machine can download the file and not open it.\n\nRemoving your last security key when you have forgotten the PIN leaves the recovery code and nothing else — which is the argument for printing it early.\n\n`autoLockMinutes: 0` never locks. That is an option somebody may want, not a default.',
    },
    ru: {
      title: 'Защита сейфа: PIN, ключ безопасности, автоблокировка',
      whatItIs: 'Три независимых способа войти и таймер, решающий, сколько разблокированный сейф остаётся открытым: **синхро-PIN**, один или несколько **ключей безопасности** (YubiKey / FIDO2) и напечатанный **код восстановления**.',
      why: 'Сейф шифрует содержимое случайным мастер-ключом, а сам мастер-ключ заворачивается по одному разу на каждый способ входа: одна обёртка под PIN, по одной на каждый зарегистрированный ключ. Открывает сейф любая обёртка — поэтому добавление или удаление ключа никогда не перешифровывает данные и не отменяет остальные.',
      setup: '- **Set Sync PIN** — одинаковый PIN на каждой машине, которая синхронизирует этот аккаунт. Без него другая машина скачает файл, который не сможет открыть.\n- **Add Security Key (YubiKey)…** на строке аккаунта. ОС покажет свой собственный запрос к ключу, а PRF-секрет ключа станет обёрточным. Регистрировать можно сколько угодно.\n- **Set Auto-Lock…** — минуты вашего бездействия. По умолчанию 60; `0` — не блокировать никогда.\n- **Set Up Recovery Code…** — третий вход, на бумаге. У него своя статья, и сделать это стоит до того, как понадобится.',
      usage: 'Разблокировка ключом — это касание, в стиле входа Microsoft, без набора пароля. Дальше мастер-ключ живёт в памяти окна, поэтому фоновая синхронизация больше не спрашивает. **Lock Vaults** его забывает; **Unlock Vault (Security Key)…** спросит по требованию.\n\nАвтоблокировка считает ВАШИ действия — открыть или скопировать учётку, подключиться, поставить ключ, отредактировать, разблокировать. Не движение мыши и намеренно не фоновую синхронизацию: пятиминутный таймер синка, засчитанный как активность, означал бы, что окно бездействия не наступает никогда и настройка тихо ничего не делает.\n\nБлокировка забывает мастер-ключ. Локальные учётки продолжают работать: они лежат в связке ключей ОС и ключом сейфа не защищены.',
      whatCanGoWrong: 'Без PIN сейф фактически локальный: другая машина скачает файл и не откроет его.\n\nУдаление последнего ключа безопасности при забытом PIN оставляет только код восстановления — это и есть довод напечатать его заранее.\n\n`autoLockMinutes: 0` не блокирует никогда. Это вариант для тех, кому он нужен, а не значение по умолчанию.',
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
    id: 'backup',
    mediaSlots: [],
    en: {
      title: 'Snapshots: dated copies that never merge',
      whatItIs: 'Dated copies of the vault, written to storage of their own on a schedule you choose. Not the same thing as sync, and deliberately so.',
      why: 'Sync keeps one live vault and MERGES — which means a deletion propagates. Delete a credential on the laptop and the desktop\'s next sync agrees it is gone. That is correct for a live vault and useless as a safety net, so snapshots are a second, independent path that never merges and never deletes on anyone\'s behalf.',
      setup: '- **Where** — `backupLocation`, or per account -> **Set Backup Location…**. A NAS folder, an external drive, **a Google Drive or OneDrive sync folder** — anything this machine can write. Empty disables snapshots.\n- **When** — `backupIntervalHours`: 24 daily, 168 weekly, `0` off. Per account -> **Set Backup Schedule…**. **Snapshot Vault Now** takes one immediately.\n- **How long** — `backupRetainDays`, 30 by default; `0` keeps everything.',
      usage: '**Snapshots work even when the vault lives on a server**, and the two are separate settings pointing at separate storage on purpose: a server is somebody\'s service, and a snapshot is your own copy of your own data.\n\nPointing snapshots at a cloud-synced folder gives you off-machine history without giving anyone the plaintext — a snapshot is the same encrypted format as everything else and opens with the account and the PIN.\n\nA snapshot identical to the previous one is not written, so a quiet vault does not fill a metered folder with copies of itself. The newest is never deleted whatever its age: a laptop closed for a year must not come back to an empty backup folder.',
      whatCanGoWrong: 'Pointing snapshots at the SAME place as the vault defeats them — the safety net and the thing it is meant to catch would share one failure.\n\nSnapshots carry attachments, images and VPN configs as well as passwords, so the folder grows with them. Retention is what keeps it bounded.',
    },
    ru: {
      title: 'Снимки: датированные копии, которые не сливаются',
      whatItIs: 'Датированные копии сейфа, которые пишутся в собственное хранилище по расписанию, которое вы задаёте. Это не синхронизация, и намеренно.',
      why: 'Синхронизация держит один живой сейф и СЛИВАЕТ — значит удаление распространяется. Удалили учётку на ноутбуке — следующий синк на десктопе согласится, что её нет. Для живого сейфа это правильно, а как страховка бесполезно, поэтому снимки — второй, независимый путь: они не сливаются и ничего не удаляют за кого-то.',
      setup: '- **Куда** — `backupLocation` или на аккаунте -> **Set Backup Location…**. Папка на NAS, внешний диск, **папка синхронизации Google Drive или OneDrive** — что угодно, куда эта машина может писать. Пусто — снимки выключены.\n- **Когда** — `backupIntervalHours`: 24 ежедневно, 168 еженедельно, `0` выключено. На аккаунте -> **Set Backup Schedule…**. **Snapshot Vault Now** снимает прямо сейчас.\n- **Сколько хранить** — `backupRetainDays`, по умолчанию 30; `0` хранит всё.',
      usage: '**Снимки работают, даже когда сейф живёт на сервере** — это две отдельные настройки, указывающие на разные хранилища, и это сделано намеренно: сервер — чей-то сервис, а снимок — ваша собственная копия ваших данных.\n\nНаправив снимки в облачную папку, вы получаете историю вне машины, никому не отдавая открытый текст: снимок — тот же зашифрованный формат, что и всё остальное, и открывается аккаунтом и PIN.\n\nСнимок, побайтово совпавший с предыдущим, не пишется — тихий сейф не забьёт платную папку своими копиями. Самый свежий не удаляется никогда, каким бы старым ни был: ноутбук, закрытый на год, не должен вернуться к пустой папке бэкапов.',
      whatCanGoWrong: 'Направить снимки ТУДА ЖЕ, где живёт сейф, значит их обесценить: страховка и то, что она страхует, разделят один отказ.\n\nСнимки несут вложения, картинки и VPN-конфиги, а не только пароли, поэтому папка растёт вместе с ними. Ограничивает её срок хранения.',
    },
  },
  {
    id: 'restore',
    mediaSlots: [],
    en: {
      title: 'Restoring from a snapshot',
      whatItIs: 'Reading a dated copy back into its account, from the tree\'s ⋯ menu -> **Import / Restore**.',
      why: 'The other half of the safety net. A snapshot nobody can restore is a folder of files, and the moment to find out that it does not open is not the moment you need it.',
      setup: '⋯ -> **Import / Restore**, choose the `.enc` file, and answer whatever it asks for. WHICH question you get is a property of the file, not of the command:\n\n- a snapshot with key slots opens through the vault\'s own door — a security-key touch or the PIN, the same door sync uses;\n- a standalone backup with only a PIN slot asks for the **backup PIN that was set when it was made**, and a key touch cannot open it. The prompt says so, because otherwise silence reads as the key being ignored.',
      usage: '**Restoring REPLACES that account\'s tree with the snapshot\'s.** It is not a merge: entries the snapshot does not contain are removed, along with their secrets. That is what makes it a restore rather than an import — and it is why the safe rehearsal is a throwaway account rather than the one you use.\n\nA snapshot carries everything: attachments, images, VPN configs, notes and version history, not only passwords.',
      whatCanGoWrong: 'A snapshot written by a newer build refuses to open in an older one — *Unsupported backup version*. Update the extension, then restore.\n\nIf the account is on a sync location, restoring an old snapshot and then syncing propagates that old state to your other machines. Decide which copy is the truth before the next sync runs.',
    },
    ru: {
      title: 'Восстановление из снимка',
      whatItIs: 'Прочитать датированную копию обратно в её аккаунт: меню ⋯ дерева -> **Import / Restore**.',
      why: 'Вторая половина страховки. Снимок, который никто не умеет восстановить, — это папка с файлами, и момент, когда выясняется, что он не открывается, — не тот, когда он нужен.',
      setup: '⋯ -> **Import / Restore**, выбрать файл `.enc` и ответить на то, что спросят. КАКОЙ вопрос вы получите — свойство файла, а не команды:\n\n- снимок с ключевыми слотами открывается собственной дверью сейфа: касание ключа безопасности или PIN, той же дверью, что и синхронизация;\n- самостоятельный бэкап только с PIN-слотом просит **тот PIN, который был задан при его создании**, и касанием ключа он не открывается. Окно так и говорит — иначе молчание читается как «ключ проигнорировали».',
      usage: '**Восстановление ЗАМЕНЯЕТ дерево аккаунта содержимым снимка.** Это не слияние: записи, которых в снимке нет, удаляются вместе с их секретами. Именно это делает его восстановлением, а не импортом, — и поэтому безопасная репетиция делается на одноразовом аккаунте, а не на рабочем.\n\nСнимок несёт всё: вложения, картинки, VPN-конфиги, заметки и историю версий, а не только пароли.',
      whatCanGoWrong: 'Снимок, записанный более новой сборкой, не откроется в старой — *Unsupported backup version*. Сначала обновите расширение, потом восстанавливайте.\n\nЕсли у аккаунта задано место синхронизации, восстановление старого снимка с последующим синком разнесёт это старое состояние по остальным машинам. Решите, какая копия истинная, до того как отработает следующая синхронизация.',
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
    id: 'install-menu',
    mediaSlots: [],
    en: {
      title: 'Install… — what it installs, and where',
      whatItIs: 'One submenu, three installers: the `creds` terminal CLI on this machine, the same CLI on another machine (a one-line command for your clipboard), and the `creds-mcp` server for AI agents.',
      why: 'The extension is the vault; these are its doors for terminals and agents. None of them can hold or obtain a secret — they relay requests to the VS Code window that owns the entry.',
      setup: 'Tree “…” menu → Install…. Each item says what it writes and where; the MCP item also writes the client configuration block for you.\n\n**Copy install command for another machine…** asks two questions — which binary (`creds` or `creds-mcp`) and which machine — and puts one bash or PowerShell line on your clipboard. That line finds the newest release itself and checks the download before installing, so nothing here has to know the version.',
      usage: 'After installing the CLI, open an entry and run “Enable CLI Access…” to mint a name — then `creds ssh <name>` from any terminal. After installing the MCP server, restart your MCP client and open entries to it via the Agent access section.',
      whatCanGoWrong: '“No open window” from `creds` means no VS Code window with the extension is running, or the entry’s access was not enabled. Inside WSL the call crosses to Windows automatically; if it does not, the Windows binary is missing — reinstall from the same menu.',
    },
    ru: {
      title: 'Install… — что это ставит и куда',
      whatItIs: 'Одно подменю, три установщика: терминальный CLI `creds` на эту машину, тот же CLI на другую машину (однострочная команда в буфер) и сервер `creds-mcp` для ИИ-агентов.',
      why: 'Расширение — это сейф; а это его двери для терминалов и агентов. Ни одна из них не может хранить или получить секрет — они передают запрос окну VS Code, владеющему записью.',
      setup: 'Меню «…» дерева → Install…. Каждый пункт говорит, что и куда пишет; пункт MCP также пишет конфигурацию клиента за вас.\n\n**Copy install command for another machine…** задаёт два вопроса — какой бинарь (`creds` или `creds-mcp`) и какая машина — и кладёт в буфер одну строку для bash или PowerShell. Эта строка сама находит свежий релиз и проверяет загрузку перед установкой, так что здесь не нужно знать версию.',
      usage: 'Поставив CLI, откройте запись и выполните «Enable CLI Access…», чтобы выпустить имя — затем `creds ssh <имя>` из любого терминала. Поставив MCP-сервер, перезапустите MCP-клиент и открывайте записи через секцию Agent access.',
      whatCanGoWrong: '«No open window» от `creds` значит: нет запущенного окна VS Code с расширением, либо доступ записи не включён. Внутри WSL вызов сам уходит в Windows; если нет — не хватает Windows-бинаря, переустановите из того же меню.',
    },
  },
  {
    id: 'git-storage',
    mediaSlots: [],
    en: {
      title: 'Keeping the vault in a git repository',
      whatItIs: 'A third kind of location, beside a folder and a server: a private git remote. The encrypted vault is a file in a repository, and every sync is a pull and a push.',
      why: 'You may already have somewhere private, versioned, backed up and reachable from everywhere — and it costs nothing to run. What you get on top of a folder is history: every version of the vault is a commit, so a bad merge or a bad day is recoverable by the tool your team already knows.',
      setup: '- Create a **private** repository. Empty is fine; nothing else goes in it.\n- On the account -> **Set Sync Location…**, and give an address that is unmistakably git: `git@github.com:me/vault.git`, `ssh://…`, or any address ending `.git`. A plain `https://github.com/me/vault` is NOT treated as git, deliberately — it looks exactly like a server URL.\n- **Authentication is one of two.** Over SSH, point `gitDeployKeys` at an SSH key entry already in your vault — `{ "git@github.com:me/vault.git": "<entry id>" }` — and it is written to a private file only for the length of the call. Over HTTPS a token is supplied through a credential helper on stdin, never in the URL, where it would end up in the reflog and in every remote\'s logs.',
      usage: 'After that it is the same as any other location and you do not touch git again: a sync pulls, merges, commits and pushes on its own.\n\n- Everything lives on a branch of its own, `creds-vault`, so a repository you also use for something else is not disturbed.\n- A `.gitattributes` marks `*.enc` as binary with no diff and no merge. Git must never try to reconcile two ciphertexts line by line — the merging is done by the extension, on the decrypted tree, and only then re-encrypted.\n- The remote sees commits of ciphertext. GitHub, your colleagues and anyone who clones it see the same thing you would see: bytes.',
      whatCanGoWrong: 'A **public** repository is still ciphertext, and still a bad idea: it publishes your topology — how many entries, how often you work, when you changed something.\n\nIf the key or the token cannot authenticate, sync stops and says so. Nothing is lost; the vault is local and complete until the remote answers again.\n\nDo not commit to `creds-vault` by hand. It is written by a program that expects to be the only writer, and a hand-made commit there is a merge nobody designed for.',
    },
    ru: {
      title: 'Хранение сейфа в git-репозитории',
      whatItIs: 'Третий вид места, рядом с папкой и сервером: приватный git-remote. Зашифрованный сейф — файл в репозитории, а каждая синхронизация — это pull и push.',
      why: 'У вас, возможно, уже есть место приватное, версионируемое, забэкапленное и доступное отовсюду, — и запускать для него ничего не надо. Сверх папки вы получаете историю: каждая версия сейфа — коммит, поэтому неудачное слияние или неудачный день чинятся инструментом, который команда и так знает.',
      setup: '- Создайте **приватный** репозиторий. Пустой годится; больше туда ничего не кладут.\n- На аккаунте -> **Set Sync Location…** и адрес, который однозначно git: `git@github.com:me/vault.git`, `ssh://…` или любой адрес, оканчивающийся на `.git`. Обычный `https://github.com/me/vault` git-адресом НЕ считается, и намеренно: он выглядит ровно как адрес сервера.\n- **Аутентификация — одна из двух.** По SSH укажите в `gitDeployKeys` запись SSH-ключа, которая уже лежит в вашем сейфе — `{ "git@github.com:me/vault.git": "<id записи>" }`, — и она пишется в приватный файл только на время вызова. По HTTPS токен передаётся через credential helper на stdin и никогда не попадает в URL, где осел бы в reflog и в логах каждого remote.',
      usage: 'Дальше это такое же место, как любое другое, и git вы больше не трогаете: синхронизация сама делает pull, слияние, commit и push.\n\n- Всё живёт на собственной ветке `creds-vault`, поэтому репозиторий, который вы используете ещё для чего-то, не задет.\n- `.gitattributes` помечает `*.enc` как бинарный, без diff и без merge. Git не должен пытаться примирить два шифротекста построчно: слияние делает расширение, на расшифрованном дереве, и только потом шифрует обратно.\n- Remote видит коммиты шифротекста. GitHub, коллеги и любой, кто склонирует, увидят то же, что увидели бы вы: байты.',
      whatCanGoWrong: '**Публичный** репозиторий — это по-прежнему шифротекст и по-прежнему плохая идея: он публикует вашу топологию — сколько записей, как часто вы работаете, когда что-то меняли.\n\nЕсли ключ или токен не проходят, синхронизация останавливается и говорит об этом. Ничего не теряется: сейф локальный и полный, пока remote снова не ответит.\n\nНе коммитьте в `creds-vault` руками. Туда пишет программа, рассчитывающая быть единственным писателем, и коммит от руки — это слияние, которого никто не проектировал.',
    },
  },
  {
    id: 'basics',
    mediaSlots: [],
    en: {
      title: 'Entries: the eight kinds, and what each one does',
      whatItIs: 'Accounts hold folders; folders hold entries. An entry is one thing you use — a host, a database, a key — and its kind decides what the Connect button on it actually does.',
      why: 'A password manager stores; this stores and then ACTS. That is why the kind matters: it is not a label for sorting, it is which action the entry carries.',
      setup: 'Right-click a folder -> **Add Entry**, pick the kind, fill in what you have. A typed folder decides the kind for you. Right-click -> **Edit** changes anything later, and every entry keeps its **last 3 versions**, so an edit is not a one-way door.\n\nTwo things you never have to invent yourself: a **password or passphrase**, generated by one button in the form, and an **SSH key**, generated the same way in six types (Ed25519 first and recommended, three ECDSA curves, RSA 3072 and 4096).',
      usage: '**The eight kinds:**\n\n- **credential** — a login, a URL and a password. The plain one, for everything that is just an account somewhere.\n- **ssh** — a host: user, port, and either a stored key or a password. Connect opens a terminal on it.\n- **sshkey** — a private key, generated here or pasted in. Install it on a host, or load it into the agent so `ssh` and `git` use it with no file on disk.\n- **vpn** — an OpenVPN or WireGuard config. Start and stop the tunnel from the tree.\n- **db** — a connection: type, host, port, user, password. Open it in your database client, or run a query without the password ever reaching the command line.\n- **terminal** — a command you saved, with its arguments as rows and a note on each. Run it with one click instead of remembering it.\n- **script** — a script edited with highlighting, its `${NAME}` variables pulled out as rows and delivered through the environment rather than pasted into the body.\n- **config** — a whole configuration file the vault keeps out of git. Its own article.\n\nAny entry can also carry notes, one encrypted file, one image, a one-time-code seed, and a **lifetime** — an hour, a day, until VS Code closes — after which it is really deleted rather than flagged as spent.\n\n**On the row itself:** *View Details* opens the entry read-only, so you can look without an edit form; *Move to Folder…* re-files it (and *Move Up* / *Move Down* order it by hand); *Toggle SSH (on/off)* flips the per-entry SSH switch, which is off on a new entry; *Save VPN Config As…* writes a vpn entry’s config out to a file for a client that insists on one.',
      whatCanGoWrong: 'A typed folder refuses a kind it does not hold; move the entry or use a folder of type *any*.\n\nGenerating a key is not installing it: the public half still has to reach the host, which is what **Install SSH Key** is for.',
    },
    ru: {
      title: 'Записи: восемь видов и что каждый умеет',
      whatItIs: 'Аккаунты держат папки, папки держат записи. Запись — это одна вещь, которой вы пользуетесь: хост, база, ключ, — и её вид решает, что на самом деле делает кнопка подключения.',
      why: 'Менеджер паролей хранит; этот хранит и ДЕЙСТВУЕТ. Поэтому вид важен: это не ярлык для сортировки, а то, какое действие несёт запись.',
      setup: 'Правый клик по папке -> **Add Entry**, выбрать вид, заполнить то, что есть. Типизированная папка выбирает вид за вас. Правый клик -> **Edit** меняет что угодно потом, и у каждой записи хранятся **последние 3 версии** — правка не дверь в одну сторону.\n\nДве вещи придумывать самому не нужно: **пароль или фразу** генерирует одна кнопка в форме, и **SSH-ключ** — так же, шести типов (Ed25519 первым и рекомендуемым, три кривые ECDSA, RSA 3072 и 4096).',
      usage: '**Восемь видов:**\n\n- **credential** — логин, URL и пароль. Обычная запись для всего, что просто аккаунт где-то.\n- **ssh** — хост: пользователь, порт и либо сохранённый ключ, либо пароль. Подключение открывает на нём терминал.\n- **sshkey** — приватный ключ, сгенерированный здесь или вставленный. Установить на хост или загрузить в агент, чтобы `ssh` и `git` пользовались им без файла на диске.\n- **vpn** — конфиг OpenVPN или WireGuard. Поднять и опустить туннель прямо из дерева.\n- **db** — подключение: тип, хост, порт, пользователь, пароль. Открыть в вашем клиенте или выполнить запрос так, что пароль ни разу не попадёт в командную строку.\n- **terminal** — сохранённая команда, аргументы строками, у каждого своя заметка. Запуск одним кликом вместо припоминания.\n- **script** — скрипт в редакторе с подсветкой, его переменные `${NAME}` вынесены строками и передаются через окружение, а не вставляются в тело.\n- **config** — целый файл конфигурации, который сейф держит вне git. У него своя статья.\n\nЛюбая запись может нести заметки, один зашифрованный файл, одну картинку, сид одноразовых кодов и **срок жизни** — час, день, до закрытия VS Code, — после которого она действительно удаляется, а не помечается использованной.\n\n**Прямо на строке:** *View Details* открывает запись только на чтение — посмотреть, не открывая форму правки; *Move to Folder…* переносит её (а *Move Up* / *Move Down* задают порядок руками); *Toggle SSH (on/off)* переключает пер-записевый SSH-флажок, у новой записи выключенный; *Save VPN Config As…* выгружает конфиг vpn-записи в файл для клиента, который требует именно файл.',
      whatCanGoWrong: 'Типизированная папка не примет вид, которого не держит: перенесите запись или используйте папку типа *any*.\n\nСгенерировать ключ — не то же, что установить его: публичная половина всё ещё должна попасть на хост, для чего и есть **Install SSH Key**.',
    },
  },
  {
    id: 'import-existing',
    mediaSlots: [],
    en: {
      title: 'Bringing in what you already have',
      whatItIs: 'Reading your existing hosts and logins in from `~/.ssh/config` or from another password manager, instead of retyping them.',
      why: 'A vault you have to fill by hand is a vault that stays empty, and half-filled is worse than either — the moment two places hold your credentials, neither is trusted.',
      setup: 'Right-click an account -> **Import from ~/.ssh/config or another manager…**, and pick the file. What comes across:\n\n- **`~/.ssh/config`** — Host, HostName, User, Port, IdentityFile, as connectable SSH entries.\n- **Bitwarden, KeePass, LastPass, Termius (CSV)** — name, username, password, address, notes, one-time-code seed, folder.\n- **Bitwarden, 1Password (JSON)** — the same, from login items.\n\n**Import from External…** is the other direction of *Export / Share Externally* — a sealed file somebody sent you.',
      usage: 'The file\'s CONTENT decides how it is read, so a misnamed export still imports.\n\nNothing lands before you have seen the count and what will be skipped — and skipped rows are listed with the reason rather than dropped in silence. Everything gets a fresh id, so an import can never overwrite what you already had.',
      whatCanGoWrong: '**KDBX — KeePass\'s own database — is not read**, deliberately: it is Argon2-encrypted, Argon2 is not in Node, and a half-right implementation of that would be worse than none. KeePass exports CSV, which imports fine.\n\nAn import adds; it never merges into what is there. Two imports of the same file give you two copies, because a fresh id is exactly what stops the first one being overwritten.',
    },
    ru: {
      title: 'Перенести то, что уже есть',
      whatItIs: 'Прочитать ваши существующие хосты и логины из `~/.ssh/config` или из другого менеджера паролей вместо того, чтобы вводить их заново.',
      why: 'Сейф, который надо наполнять руками, остаётся пустым, а наполовину наполненный хуже обоих вариантов: как только учётки лежат в двух местах, доверия нет ни одному.',
      setup: 'Правый клик по аккаунту -> **Import from ~/.ssh/config or another manager…**, выбрать файл. Что переезжает:\n\n- **`~/.ssh/config`** — Host, HostName, User, Port, IdentityFile, как готовые к подключению SSH-записи.\n- **Bitwarden, KeePass, LastPass, Termius (CSV)** — имя, пользователь, пароль, адрес, заметки, сид одноразовых кодов, папка.\n- **Bitwarden, 1Password (JSON)** — то же самое, из login-элементов.\n\n**Import from External…** — обратная сторона *Export / Share Externally*: запечатанный файл, который вам прислали.',
      usage: 'Как читать файл, решает его СОДЕРЖИМОЕ, поэтому переименованный экспорт всё равно импортируется.\n\nНичего не ложится, пока вы не увидели количество и то, что будет пропущено, — а пропущенные строки перечисляются с причиной, а не отбрасываются молча. Всё получает новые идентификаторы, поэтому импорт не может затереть то, что у вас уже было.',
      whatCanGoWrong: '**KDBX — собственная база KeePass — не читается**, намеренно: она зашифрована Argon2, Argon2 в Node нет, и наполовину правильная реализация была бы хуже её отсутствия. KeePass экспортирует CSV, и он импортируется нормально.\n\nИмпорт добавляет, а не сливает с тем, что есть. Два импорта одного файла дадут две копии — ровно потому, что новые идентификаторы и не дают затереть первую.',
    },
  },
  {
    id: 'trash',
    mediaSlots: [],
    en: {
      title: 'The Trash: deleting, and getting it back',
      whatItIs: 'Deleting an entry or a folder moves it to the Trash — a folder like any other, which you can open, look inside and drag out of. It is gone when the Trash empties, and not before.',
      why: 'A deletion SYNCS. Delete on the laptop and the desktop\'s next sync agrees it is gone, everywhere, along with its history. The Trash is the window in which that mistake is still yours to undo.',
      setup: 'Right-click -> **Delete**. To decide how long things sit there: ⋯ -> **Empty the Trash Automatically…**. To clear it at once: **Empty the Trash Now**.',
      usage: '- **Restore** puts an entry back where it was deleted FROM, not at the root — and **Go to the Original Folder** shows you where that is before you commit.\n- Folders restore too, and the tree shows what came back.\n- **Nothing in the Trash answers an agent**, whatever its switches say. A deleted thing that still worked would make the word meaningless.\n\nAn entry that carries a lifetime is the exception: **Burn Now…** on it is a real delete rather than a move — the secret, its kept versions and, by tombstone, every synced copy. The modal says so before you agree.',
      whatCanGoWrong: 'Emptying is permanent and it syncs: there is no second Trash behind the first.\n\nAn entry restored after its original folder was itself deleted lands at the root — the place it came from no longer exists.',
    },
    ru: {
      title: 'Корзина: удаление и как вернуть',
      whatItIs: 'Удаление записи или папки переносит её в Корзину — такую же папку, которую можно открыть, посмотреть и вытащить обратно. Исчезает она, когда Корзину очистят, и не раньше.',
      why: 'Удаление СИНХРОНИЗИРУЕТСЯ. Удалили на ноутбуке — следующий синк на десктопе согласится, что этого нет, везде и вместе с историей. Корзина — то окно, в котором ошибка ещё ваша.',
      setup: 'Правый клик -> **Delete**. Сколько там лежит: ⋯ -> **Empty the Trash Automatically…**. Очистить сразу: **Empty the Trash Now**.',
      usage: '- **Restore** возвращает запись ТУДА, откуда её удалили, а не в корень, — а **Go to the Original Folder** покажет это место заранее.\n- Папки восстанавливаются тоже, и дерево показывает, что вернулось.\n- **Ничто в Корзине не отвечает агенту**, что бы ни говорили переключатели. Удалённое, но работающее лишало бы слово смысла.\n\nИсключение — запись со сроком жизни: **Burn Now…** на ней это настоящее удаление, а не перенос: секрет, хранимые версии и, через надгробие, каждая синхронизированная копия. Модал об этом говорит до вашего согласия.',
      whatCanGoWrong: 'Очистка необратима и синхронизируется: второй Корзины за первой нет.\n\nЗапись, восстановленная после того, как удалили саму её папку, ляжет в корень — места, откуда она пришла, больше нет.',
    },
  },
  {
    id: 'project-folders',
    mediaSlots: [],
    en: {
      title: 'Project folders: the whole set in one click',
      whatItIs: 'A folder of type **project** is a container for one piece of work, and creating it scaffolds the typed set inside itself at once: databases, VPNs, SSH keys, SSH connections, passwords, terminal commands and scripts.',
      why: 'Everything one project needs is rarely one kind. Making seven folders by hand every time is the sort of chore people skip, and a vault where similar things live in different shapes is a vault nobody can search.',
      setup: 'Right-click an account or a folder -> **Add Folder**, and set its type to **project**. The set appears inside it immediately. **Change Folder Type…** converts an existing folder.',
      usage: 'The type is what makes the tree predictable: a typed child folder decides the kind of the entries you add to it, so *Add Entry* in `db` gives you a database and not a question.\n\n`project` itself dictates nothing about entries — it is a folder-only type, and forcing its own entries to a kind called "project" would invent an entity kind that does not exist. It is the shape of what it scaffolds that carries the meaning.\n\nAgent access set on a project folder is inherited by everything under it, which makes it the natural unit to open to an agent: one switch, one project.',
      whatCanGoWrong: 'The scaffolded folders are ordinary folders. Delete the ones you do not need — nothing depends on all seven existing.',
    },
    ru: {
      title: 'Папки-проекты: весь набор одним кликом',
      whatItIs: 'Папка типа **project** — контейнер для одной работы, и при создании она сразу разворачивает внутри себя типизированный набор: базы, VPN, SSH-ключи, SSH-подключения, пароли, команды терминала и скрипты.',
      why: 'Всё, что нужно одному проекту, редко бывает одного вида. Создавать семь папок руками каждый раз — та рутина, которую пропускают, а сейф, где похожие вещи лежат по-разному, — сейф, в котором никто ничего не найдёт.',
      setup: 'Правый клик по аккаунту или папке -> **Add Folder**, тип — **project**. Набор появится внутри сразу. **Change Folder Type…** превращает уже существующую папку.',
      usage: 'Тип и делает дерево предсказуемым: типизированная вложенная папка решает вид добавляемых в неё записей, поэтому *Add Entry* в `db` даёт базу, а не вопрос.\n\nСам `project` про записи не диктует ничего — это тип только для папок, и принуждать его записи к виду «project» значило бы выдумать вид сущности, которого нет. Смысл несёт форма того, что он разворачивает.\n\nАгентский доступ, выставленный на папке-проекте, наследуется всем, что внутри, — поэтому это естественная единица, которую открывают агенту: один переключатель, один проект.',
      whatCanGoWrong: 'Развёрнутые папки — обычные папки. Лишние удаляйте: ничто не зависит от того, что все семь существуют.',
    },
  },
  {
    id: 'share-with-agent',
    mediaSlots: [],
    en: {
      title: 'Share with Claude Code',
      whatItIs: 'Give an AI agent the USE of one credential without giving it the credential. Right-click an entry -> **Share with Claude Code…**: a capability token is minted and a paste-ready snippet lands on your clipboard.',
      why: 'Pasting a password into a chat puts the plaintext in a transcript and in every log downstream of it; exporting it to a file is no better. The agent asks the window to act, the window acts, and only the output comes back — there is no field in the protocol a secret could travel in.',
      setup: 'Right-click any entry an agent can DO something with — SSH hosts, scripts, terminal commands, databases, VPN tunnels, plain credentials -> **Share with Claude Code…**, then give the agent what is on your clipboard.\n\nThe token names one entry and dies with the VS Code window that minted it. The first use asks you for a click.\n\nTwo limits shorten that life further, and both are settings you can change: `agentGrantIdleMinutes` expires a token that goes unused — a token an agent is actively working with keeps renewing — and `agentGrantMaxCalls` caps how many calls one token may make at all, which is the ceiling to set when you hand out a token for one specific job.',
      usage: 'What the agent can then ask for, one verb each: run a command on the host, open the interactive terminal **for you**, run a query, run your stored script or command, export the secret into new terminals, bring a VPN up.\n\n**Two of them deliberately ignore whatever the agent sends.** `script` and `run` execute exactly what you saved, so no agent-authored text ever reaches a shell or an interpreter. They also require that you have run the entry yourself once on this machine — an Allow covers a token, not a body, and a body can be replaced by a sync after you clicked it.\n\nThis is not the same thing as MCP. A share is one entry, one token, this window; MCP is a standing surface with per-entry switches. Both raise the same consent prompt, and both are in **MCP logs**.',
      whatCanGoWrong: 'The token is bound to the window that minted it: reload, and the agent is told to ask for a new one. That is the intended lifetime, not a fault.\n\nThe agent must be able to reach this machine\'s loopback. One running inside a container cannot, so run it on the client for this feature.\n\nMongoDB is refused on purpose: `mongosh` has no password environment variable, and its `--eval` runs in the same interpreter that can read the environment — a "query" could print the credential back.',
    },
    ru: {
      title: 'Share with Claude Code',
      whatItIs: 'Дать ИИ-агенту ПОЛЬЗОВАТЬСЯ учёткой, не отдавая саму учётку. Правый клик по записи -> **Share with Claude Code…**: выпускается токен-возможность, а в буфер ложится готовый к вставке фрагмент.',
      why: 'Пароль, вставленный в чат, оказывается открытым текстом в переписке и во всех логах ниже по течению; выгрузить его в файл не лучше. Агент просит окно сделать, окно делает, и назад приходит только вывод — в протоколе нет поля, в котором секрет мог бы приехать.',
      setup: 'Правый клик по любой записи, с которой агент может что-то СДЕЛАТЬ — SSH-хосты, скрипты, команды терминала, базы, VPN-туннели, обычные учётки -> **Share with Claude Code…**, и отдайте агенту то, что в буфере.\n\nТокен называет одну запись и умирает вместе с окном VS Code, которое его выпустило. Первое использование спросит у вас клик.\n\nДва ограничения укорачивают эту жизнь ещё сильнее, и оба — настройки: `agentGrantIdleMinutes` гасит токен, которым не пользуются (токен, с которым агент активно работает, продлевается сам), а `agentGrantMaxCalls` ограничивает само число вызовов одного токена — это тот потолок, который стоит выставить, когда токен выдаётся под одну конкретную задачу.',
      usage: 'Что агент сможет попросить, по глаголу на каждое: выполнить команду на хосте, открыть интерактивный терминал **вам**, выполнить запрос, запустить ваш сохранённый скрипт или команду, выгрузить секрет в новые терминалы, поднять VPN.\n\n**Два из них намеренно игнорируют то, что прислал агент.** `script` и `run` выполняют ровно то, что вы сохранили, поэтому написанный агентом текст никогда не доходит до оболочки или интерпретатора. Они же требуют, чтобы вы сами хоть раз запустили эту запись на этой машине: разрешение покрывает токен, а не тело, а тело может смениться синхронизацией после вашего клика.\n\nЭто не то же самое, что MCP. Шара — одна запись, один токен, это окно; MCP — постоянная поверхность с переключателями на каждой записи. Оба поднимают один и тот же модал согласия, и оба видны в **MCP logs**.',
      whatCanGoWrong: 'Токен привязан к выпустившему окну: после перезагрузки агенту скажут попросить новый. Это задуманный срок жизни, а не сбой.\n\nАгент должен дотягиваться до loopback этой машины. Агент внутри контейнера не дотягивается — для этой функции запускайте его на клиенте.\n\nMongoDB отклоняется намеренно: у `mongosh` нет переменной окружения для пароля, а его `--eval` исполняется в том же интерпретаторе, который читает окружение, — «запрос» мог бы напечатать учётку обратно.',
    },
  },
  {
    id: 'agents-mcp',
    mediaSlots: [],
    en: {
      title: 'Agents over MCP — the two ladders',
      whatItIs: 'Two ladders, ten switches. Over ENTRIES: see it, use it, replace its secret, create entries, delete what it created, delete anything. Over FOLDERS: create, rename and move, delete what it created, delete any. All off by default, and inherited by everything below the folder you set them on.',
      why: 'An agent should reach exactly what you opened, nothing more — and “opened” should be visible on the entry itself, not buried in a config file.',
      setup: 'Edit an entry → Agent access (MCP) section, or set the switches on a folder and let entries inherit. Install the server via Install… → Install the MCP Server.',
      usage: 'The tree marks an opened entry with a pentagon — each lit edge one switch of the entry ladder. Rotation happens through a `{{creds:new}}` placeholder, so no value ever enters the agent’s context. An agent may also say what a generated secret should LOOK like — length, which character sets, how many words — which matters when the far side caps the length or forbids symbols; the prompt shows you what it asked for. An agent sees folders through `creds_folders` and changes them with `creds_create_folder` / `creds_edit_folder` / `creds_delete_folder`. Every action still raises the consent modal.\n\nWhatever the agent runs, the answer is masked on its way out: one choke point replaces that entry’s own stored values in the response body before it leaves the window, and the audit line reports how many it caught. A command that echoes its password back therefore hands the agent a mask, not the password.',
      whatCanGoWrong: 'The switch is permission to ASK, not consent — if the modal surprises you, that is it working. Nothing in the Trash answers agents, whatever its switches say. An agent seeing an empty list means no switches are on. **An agent can never change a switch**: no request it can make carries the field, so folder editing means the name, the place and the type and nothing else. A move needs the grant at both ends, because a folder passes its answers to everything inside it.',
    },
    ru: {
      title: 'Агенты через MCP — две лестницы',
      whatItIs: 'Две лестницы, десять переключателей. По ЗАПИСЯМ: видеть, использовать, заменять секрет, создавать, удалять созданное собой, удалять всё. По ПАПКАМ: создавать, переименовывать и перемещать, удалять созданные собой, удалять любые. Всё выключено по умолчанию и наследуется всем, что лежит ниже папки, на которой вы это включили.',
      why: 'Агент должен дотягиваться ровно до того, что вы открыли, и «открыто» должно быть видно на самой записи, а не спрятано в конфиге.',
      setup: 'Edit записи → секция Agent access (MCP), или переключатели на папке — записи унаследуют. Сервер ставится через Install… → Install the MCP Server.',
      usage: 'Открытая запись помечена в дереве пятиугольником — каждая горящая грань один переключатель записевой лестницы. Ротация идёт через плейсхолдер `{{creds:new}}`: значение никогда не попадает в контекст агента. Агент может ещё и сказать, КАКИМ должен быть сгенерированный секрет — длина, какие наборы символов, сколько слов; это важно, когда дальняя сторона ограничивает длину или запрещает символы, и в модале видно, что именно он попросил. Папки агент видит через `creds_folders`, а меняет через `creds_create_folder` / `creds_edit_folder` / `creds_delete_folder`. Каждое действие всё равно поднимает модал согласия.\n\nЧто бы агент ни запустил, ответ маскируется на выходе: одна точка перехвата заменяет собственные хранимые значения этой записи в теле ответа до того, как оно покинет окно, а строка аудита сообщает, сколько совпадений поймано. Команда, которая эхом печатает свой пароль, отдаёт агенту маску, а не пароль.',
      whatCanGoWrong: 'Переключатель — это право СПРОСИТЬ, не согласие: если модал удивил — он работает. Корзина агентам не отвечает, что бы ни говорили переключатели. Пустой список у агента = переключатели выключены. **Переключатель агент изменить не может никогда**: в его запросах нет такого поля, поэтому правка папки — это имя, место и тип, и ничего больше. Перемещение требует права с обеих сторон, потому что папка отдаёт свои ответы всему, что внутри.',
    },
  },
  {
    id: 'agent-surface',
    mediaSlots: [],
    en: {
      title: 'What an agent can and cannot do',
      whatItIs: 'The map of this vault\'s agent surface, taken from the code rather than from memory: 8 kinds of entry, 16 MCP tools, 10 access switches, ~200 commands in the extension.\n\nThree states are worth telling apart. **Explicit** — there is a tool for it. **Implicit** — an agent gets it as a consequence of another call, with no tool of its own. **None** — not reachable at all.',
      why: '**The asymmetry worth knowing first:** an agent can CREATE an entry and DELETE it, and can replace its secret — but cannot EDIT any ordinary field of it: not the name, not the host, not the user, not the port. Folders have the full set since 0.85.0: create, rename, move, delete.\n\nSo an agent that provisions infrastructure can build a folder tree and fill it, and cannot correct a typo it made itself — only delete and recreate, losing the version history.',
      setup: 'Nothing to set up for the map itself. What an agent actually reaches is decided by the switches on an entry or a folder — see the article on agents over MCP, which explains the two ladders and how they are inherited.',
      usage: '**Explicit — a tool of its own:**\n\n- creds_list — entries: name, kind, folder, host, port, user, database type, a connection string with the password removed, dependencies. hasPassword, hasPrivateKey, hasNotes and hasTotp say that something exists, never what it is.\n- creds_folders — folders: id, name, parent, type, and what may be done to each.\n- creds_exec, creds_query, creds_run, creds_open_terminal, creds_vpn_up, creds_vpn_down — using a credential without ever receiving it.\n- creds_rotate — replacing a secret through a {{creds:new}} placeholder. **Only for db and ssh entries**; credential, vpn, terminal, script, config and sshkey cannot be rotated.\n- creds_create, creds_delete — and since 0.86.0 the shape of a generated secret: length, character sets, word count.\n- creds_create_folder, creds_edit_folder, creds_delete_folder — folders, since 0.85.0.\n- creds_config_snippet — how code reads a config entry. Public text; the config\'s own content is never returned.\n\n**Implicit — what a call grants beyond its name:**\n\n- creds_exec is a full shell on that host with that user\'s rights: installing packages, reading files, outbound network. It is the widest permission in the set.\n- creds_query is arbitrary SQL: any table, DDL, and privileges inside the database itself.\n- creds_run executes code somebody else wrote — the person saved it, the agent chooses when.\n- creds_rotate writes into the version history: the old value is kept there, the new one in the vault.\n- creds_create with an explicit secret is the one path by which a secret flows INTO the vault from an agent. The journal counts those lines separately.\n- Creating in a typed folder: the folder dictates the kind, not the agent.\n- Moving a folder changes the permissions of everything inside it, which is why the grant is required at both ends.\n- Deleting starts the Trash timer. Reversible holds until it empties; for an entry with a lifetime, deletion is final at once.\n- creds_export_env changes what the person\'s next terminal will see.',
      whatCanGoWrong: '**What an agent will run into and cannot do:**\n\n- Edit an entry\'s fields — name, host, user, port, notes. Only delete and recreate.\n- Rotate anything but a db or ssh entry.\n- Read a secret, a note, a VPN config or a one-time-code seed — structurally, there is no field they could travel in.\n- Use a one-time code. creds_list says hasTotp is true and there is no tool, so an agent finishing a login stops exactly here.\n- Restore from the Trash. It can delete and cannot undo.\n- Set a lifetime on what it creates.\n- Generate an SSH key pair. The extension makes six types in the entry form; an agent is refused, with a reason written about ROTATION — installing the public half on the far side.\n- Change an access switch. No request it can compose has a field for them.\n\nSharing, sync, backups, recovery, accounts, security keys, the health report, import and export, and the MCP journal are all the person\'s alone, by design.',
    },
    ru: {
      title: 'Что агент может, а чего не может',
      whatItIs: 'Карта агентской поверхности этого сейфа, снятая с кода, а не по памяти: 8 видов записей, 16 инструментов MCP, 10 переключателей доступа, ~200 команд в расширении.\n\nСтоит различать три состояния. **Явно** — есть свой инструмент. **Неявно** — агент получает это как следствие другого вызова, отдельного инструмента нет. **Нет** — недоступно совсем.',
      why: '**Главная асимметрия:** агент может СОЗДАТЬ запись и УДАЛИТЬ её, может заменить её секрет — но не может ОТРЕДАКТИРОВАТЬ ни одно обычное поле: ни имя, ни хост, ни пользователя, ни порт. У папок с версии 0.85.0 полный набор: создать, переименовать, переместить, удалить.\n\nТо есть агент, заводящий инфраструктуру, способен построить дерево папок и разложить по нему записи, но не способен исправить собственную опечатку — только удалить и завести заново, потеряв историю версий.',
      setup: 'Для самой карты настраивать нечего. До чего агент реально дотягивается, решают переключатели на записи или папке — см. статью про агентов через MCP, где описаны обе лестницы и наследование.',
      usage: '**Явно — есть свой инструмент:**\n\n- creds_list — записи: имя, вид, папка, хост, порт, пользователь, тип БД, строка подключения без пароля, зависимости. Флаги hasPassword, hasPrivateKey, hasNotes и hasTotp говорят, что нечто существует, но не что это.\n- creds_folders — папки: id, имя, родитель, тип и что с каждой можно делать.\n- creds_exec, creds_query, creds_run, creds_open_terminal, creds_vpn_up, creds_vpn_down — использование учётных данных без их получения.\n- creds_rotate — замена секрета через плейсхолдер {{creds:new}}. **Только для записей db и ssh**; credential, vpn, terminal, script, config и sshkey ротации не имеют.\n- creds_create, creds_delete — и с 0.86.0 вид генерируемого секрета: длина, наборы символов, число слов.\n- creds_create_folder, creds_edit_folder, creds_delete_folder — папки, с 0.85.0.\n- creds_config_snippet — как код читает config-запись. Публичный текст; содержимое конфига не отдаётся никогда.\n\n**Неявно — что вызов даёт сверх названного:**\n\n- creds_exec — полноценная оболочка на хосте с правами того пользователя: установка пакетов, чтение файлов, исходящая сеть. Самое широкое право в наборе.\n- creds_query — произвольный SQL: любые таблицы, DDL, права внутри самой СУБД.\n- creds_run запускает чужой код: писал его человек, момент выбирает агент.\n- creds_rotate пишет в историю версий: прежнее значение остаётся там, новое — в хранилище.\n- creds_create с явным секретом — единственный путь, которым секрет втекает в хранилище ОТ агента. Журнал считает такие строки отдельно.\n- Создание в типизированной папке: вид записи диктует папка, а не агент.\n- Перемещение папки меняет права всего, что внутри, — поэтому право требуется с обеих сторон.\n- Удаление запускает таймер Корзины. «Обратимо» верно до автоочистки; для записи со сроком жизни удаление окончательно сразу.\n- creds_export_env меняет то, что увидит следующий терминал человека.',
      whatCanGoWrong: '**Во что агент упрётся и чего не сможет:**\n\n- Отредактировать поля записи — имя, хост, пользователя, порт, заметки. Только удалить и создать заново.\n- Ротировать что-либо, кроме записей db и ssh.\n- Прочитать секрет, заметку, VPN-конфиг или сид одноразового кода — структурно: в протоколе нет поля, в котором они могли бы приехать.\n- Применить одноразовый код. creds_list сообщает hasTotp: true, а инструмента нет, и агент, доводящий вход до конца, останавливается ровно здесь.\n- Восстановить из Корзины. Удалять умеет, отменять — нет.\n- Задать срок жизни тому, что создаёт.\n- Сгенерировать SSH-ключ. Расширение делает шесть типов в форме записи; агенту отказано, и обоснование написано про РОТАЦИЮ — установку публичной половины на дальней стороне.\n- Изменить переключатель доступа. Ни один его запрос не имеет такого поля.\n\nШаринг, синхронизация, бэкапы, восстановление, аккаунты, ключи безопасности, отчёт здоровья, импорт и экспорт, а также журнал MCP — только человек, по замыслу.',
    },
  },
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
    id: 'mcp-in-wsl',
    mediaSlots: [],
    en: {
      title: 'Running the MCP server from inside WSL',
      whatItIs: 'The Linux `creds-mcp` inside your distribution does not talk to the vault itself: it re-launches `creds-mcp.exe` on Windows through WSL interop and carries its stdio, so an agent living in WSL reaches the window living on Windows.',
      why: 'Your editor and every secret are on Windows, and `127.0.0.1` inside WSL2 is the virtual machine’s own loopback — nothing of ours listens there, and the window’s announcement files are on a Windows disk. Without this an agent is told “no CredsForDevs window answered” while the window is open on the same computer. Nothing new listens anywhere: the bridge is a process, not a socket.',
      setup: 'Install… → **Install the MCP Server…** does both halves. When this machine has WSL it asks *where the agent runs*: pick “Inside WSL — <your distribution>” and it installs the Windows binary here, installs the Linux one there (the same published one-liner, which verifies the download and lands in `~/.local/bin`), asks the distribution itself for the Windows path — `wslpath`, never a guessed `/mnt/c` — and puts a config block on your clipboard naming the LINUX binary with the Windows one in `env`. Paste it into the client running INSIDE that distribution. Pick “This machine (Windows)” for an agent in a Windows terminal, which is the old behaviour unchanged. Keep a VS Code window open with the vault unlocked; that is what either half is talking to. By hand instead: Install… → *Copy install command for another machine…* → `creds-mcp` → “Linux, WSL or a container”, then `claude mcp add -s user creds -e CREDS_MCP_WINDOWS_BINARY=/mnt/... -- ~/.local/bin/creds-mcp`.',
      usage: '`claude mcp list` inside WSL should say “creds ✔ Connected”. Then use it exactly as on Windows — the entries, the switches, the consent modal and the journal are the same ones, because the call simply arrives through a second process. The modal still appears on Windows, which is the point.',
      whatCanGoWrong: '**The commonest one is a published release older than the bridge.** The install warns you when it happens, because the symptom does not: such a binary cannot reach Windows at all and reports “No CredsForDevs window answered”, word for word what a closed window says. Measured against the real `mcp-v0.1.0`. “creds-mcp.exe could not be started” means the Windows binary is not where the bridge looked — set `CREDS_MCP_WINDOWS_BINARY` to its full `/mnt/...` path. “No CredsForDevs window answered” now really means what it says: no window is open, or the vault is locked. Each distribution needs its own copy of the Linux binary and its own registration. If your VS Code lives somewhere unusual and you set `CREDS_ENDPOINT_DIR`, name it in `WSLENV` (`export WSLENV=CREDS_ENDPOINT_DIR/p`) — environment variables do not cross into a Windows child on their own.',
    },
    ru: {
      title: 'Как запускать MCP-сервер из WSL',
      whatItIs: 'Linux-бинарь `creds-mcp` внутри дистрибутива не разговаривает с сейфом сам: он перезапускает `creds-mcp.exe` на Windows через WSL-interop и работает его stdio — так агент, живущий в WSL, дотягивается до окна, живущего на Windows.',
      why: 'Редактор и все секреты — на Windows, а `127.0.0.1` внутри WSL2 — это loopback виртуальной машины: там ничего нашего не слушает, и файлы-объявления окна лежат на виндовом диске. Без моста агент говорит «нет открытого окна CredsForDevs», хотя окно открыто на том же компьютере. Ничего нового нигде не начинает слушать: мост — это процесс, а не сокет.',
      setup: 'Install… → **Install the MCP Server…** ставит обе половины. Если на машине есть WSL, кнопка спрашивает, *где живёт агент*: выберите «Inside WSL — <ваш дистрибутив>» — она поставит виндовый бинарь здесь, линуксовый там (тем же опубликованным однострочником: он проверяет контрольную сумму и кладёт в `~/.local/bin`), спросит у самого дистрибутива путь к виндовому бинарю (`wslpath`, а не выдуманный `/mnt/c`) и положит в буфер конфиг с ЛИНУКСОВЫМ бинарём и виндовым в `env`. Вставьте его в клиент, работающий ВНУТРИ этого дистрибутива. «This machine (Windows)» — для агента в виндовом терминале, это прежнее поведение без изменений. Держите открытым окно VS Code с разблокированным сейфом: именно с ним разговаривает любая из половин. Руками: Install… → *Copy install command for another machine…* → `creds-mcp` → «Linux, WSL or a container», затем `claude mcp add -s user creds -e CREDS_MCP_WINDOWS_BINARY=/mnt/... -- ~/.local/bin/creds-mcp`.',
      usage: '`claude mcp list` внутри WSL должен показать «creds ✔ Connected». Дальше всё как на Windows — те же записи, те же переключатели, тот же модал согласия и тот же журнал: вызов просто приходит через второй процесс. Модал по-прежнему всплывает на Windows, в этом и смысл.',
      whatCanGoWrong: '**Самое частое — опубликованный релиз старше моста.** Установка про это предупреждает, потому что сам симптом не предупреждает: такой бинарь до Windows не дотягивается вообще и отвечает «No CredsForDevs window answered» — дословно то же, что говорит закрытое окно. Проверено на настоящем `mcp-v0.1.0`. «creds-mcp.exe could not be started» — виндового бинаря нет там, где мост его искал: пропишите полный `/mnt/...` путь в `CREDS_MCP_WINDOWS_BINARY`. «No CredsForDevs window answered» теперь значит ровно то, что написано: окно закрыто или сейф заблокирован. Каждому дистрибутиву нужен свой Linux-бинарь и своя регистрация. Если VS Code стоит нестандартно и вы задали `CREDS_ENDPOINT_DIR`, назовите его в `WSLENV` (`export WSLENV=CREDS_ENDPOINT_DIR/p`) — переменные окружения сами в виндовый дочерний процесс не переходят.',
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
      usage: 'Fields edits one value without touching your formatting. “Write Config File Here…” materialises to disk, refusing a git-tracked path. “Enable Code Access…” mints a key (shown once) so the app reads the config at startup — the viewer shows the exact code in twenty languages and names the file it goes into.\n\n**Show What Changed** diffs the entry against the file on disk, which is the question you actually have after somebody edited one of the two. **Revoke Code Access…** is the undo of the key: the app stops reading the config at startup until a new key is minted and pasted in.',
      whatCanGoWrong: 'The key is shown once and only its hash is kept: lose it and you mint a new one. Writing into a tracked path is refused on purpose — the whole point is that git never sees this file.',
    },
    ru: {
      title: 'Записи-конфиги',
      whatItIs: 'Запись, тело которой — целый конфигурационный файл: appsettings.Development.json, .env — вне git, синхронизируется внутри сейфа как любой секрет.',
      why: 'В этих файлах строки подключения с паролями, и их передавали между разработчиками руками — и теряли.',
      setup: 'Создайте запись в папке config (или выберите тип Config), вставьте файл в Raw. Сохраняется даже пока не парсится — строка помечена, пока не начнёт.',
      usage: 'Fields правит одно значение, не трогая форматирование. «Write Config File Here…» пишет на диск, отказывая пути под git. «Enable Code Access…» выпускает ключ (показывается один раз), чтобы приложение читало конфиг на старте — вьюер показывает точный код на двадцати языках и называет файл, куда его вставить.\n\n**Show What Changed** показывает разницу между записью и файлом на диске — ровно тот вопрос, который возникает после того, как кто-то поправил одно из двух. **Revoke Code Access…** — отмена ключа: приложение перестаёт читать конфиг на старте, пока не выпущен и не вставлен новый ключ.',
      whatCanGoWrong: 'Ключ показывается один раз, хранится только его хеш: потеряли — выпускайте новый. Запись в отслеживаемый git-ом путь запрещена намеренно: смысл в том, что git этот файл не видит.',
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
      usage: 'The tree shows the remaining time on the row. Copying a value yourself does not count as the agent’s one use.\n\n**Burn Now…** ends it early. It appears only on an entry that carries a lifetime, and it is NOT the Trash — the modal says so in those words: the secret, its kept versions and, by tombstone, every synced copy are gone for good.',
      whatCanGoWrong: 'Deletion is real: history goes too, and no snapshot taken AFTER the expiry can bring it back. A snapshot from before still can — that is what snapshots are for.',
    },
    ru: {
      title: 'Короткоживущие записи',
      whatItIs: 'Запись со сроком: час, день, до закрытия окна или до одного использования агентом. Когда срок выходит, запись УДАЛЯЕТСЯ по-настоящему — секрет, история, tombstone — на каждой синхронизируемой машине.',
      why: 'Временная учётка, пережившая свою задачу, — это постоянный риск, за которым никто не следит.',
      setup: 'Секция Lifetime в форме записи. «До закрытия окна» — это аренда, чтобы упавшее окно не оставило обещание неисполненным.',
      usage: 'Дерево показывает остаток на строке. Ваше собственное копирование значения не считается использованием агентом.\n\n**Burn Now…** завершает срок досрочно. Пункт есть только у записи со сроком жизни, и это НЕ Корзина — модал так и говорит: секрет, его хранимые версии и, через надгробие, каждая синхронизированная копия уходят навсегда.',
      whatCanGoWrong: 'Удаление настоящее: уходит и история, и снапшот, снятый ПОСЛЕ истечения, не вернёт запись. Снятый до — вернёт: для этого снапшоты и есть.',
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
      usage: '`ssh` and `git` just find it. Copy Git Signing Config sets up commit signing with a key that lives only in the vault. In WSL, see the relay article.\n\nWhen a tool cannot be talked out of wanting a key FILE, **Install SSH Key to System (~/.ssh)** writes one: the private half at 0600, the public half at 0644, under a name derived from the entry. That copy is permanent and outside everything the extension cleans up, which is why the dialog says so and why **Remove Installed Key…** exists — it deletes exactly those two files and leaves the entry in the vault untouched.',
      whatCanGoWrong: 'A dialog per signature is the feature — git operations that sign several times will ask several times. If nothing asks and nothing signs, the window that served the agent is gone.',
    },
    ru: {
      title: 'SSH-агент, который каждый раз спрашивает',
      whatItIs: 'Add to SSH Agent отдаёт хранимый ключ из памяти через собственный сокет окна — файла ключа на диске нет вообще — и каждое использование открывает диалог с именем ключа и тем, что подписывается.',
      why: 'Агент, подписывающий молча, — это ключ без присутствия владельца; файл ключа на диске — ключ, который можно скопировать.',
      setup: 'На записи-ключе: Add to SSH Agent (confirm every use). Новые терминалы получают SSH_AUTH_SOCK автоматически.',
      usage: '`ssh` и `git` просто находят его. Copy Git Signing Config настраивает подпись коммитов ключом, живущим только в сейфе. В WSL — см. статью о релее.\n\nКогда инструмент невозможно отговорить от файла ключа, **Install SSH Key to System (~/.ssh)** его пишет: приватная половина с 0600, публичная с 0644, имя выводится из записи. Эта копия постоянна и лежит вне всего, что расширение убирает за собой, — поэтому диалог об этом предупреждает, и поэтому есть **Remove Installed Key…**: он удаляет ровно эти два файла и не трогает запись в сейфе.',
      whatCanGoWrong: 'Диалог на каждую подпись — это и есть фича: git-операция с несколькими подписями спросит несколько раз. Если никто не спрашивает и ничего не подписывается — окно-агент закрыто.',
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
    id: 'sharing',
    mediaSlots: [],
    en: {
      title: 'Sharing — team, external, and taking it back',
      whatItIs: 'Send one entity or a folder, sealed, to a colleague on the same vault location — or export a sealed file for someone outside. A share nobody accepted yet can be withdrawn.',
      why: 'Reading a password over a call puts it in two notebooks; a sealed share puts it in one vault.',
      setup: 'On the server transport the sender is stamped from a verified sign-in; on a NAS folder the sender line is trust-on-first-use — the fingerprint is there to read aloud.',
      usage: 'Share with… / Create Entity for… / Accept…. A one-time PIN travels out of band. Whether a one-time code travels with the entry is asked, not assumed. Withdraw a Share You Sent… while it is still pending.\n\n**Show Signing Fingerprint…** is the other half of trust-on-first-use: it prints the short fingerprint of your own signing key, so a colleague can compare it with the sender line they see and know the share came from you. When several arrive at once, **Accept All from Sender…** takes everything from one person and **Accept All Shared…** takes the lot — each still lands as a normal entry you can inspect.',
      whatCanGoWrong: '“Already accepted” on withdraw means beyond recall — rotate the secret, that is the only move left. A declined share can reappear on a NAS folder (no server to dedup) — the sender line and fingerprint are what to check.',
    },
    ru: {
      title: 'Шаринг — команде, наружу, и как забрать назад',
      whatItIs: 'Отправить запись или папку, запечатанной, коллеге на той же локации сейфа — или экспортировать запечатанный файл наружу. Шару, которую ещё не приняли, можно отозвать.',
      why: 'Пароль, прочитанный по звонку, оказывается в двух блокнотах; запечатанная шара — в одном сейфе.',
      setup: 'На серверном транспорте отправитель штампуется из проверенного входа; на NAS-папке строка отправителя — trust-on-first-use, отпечаток дан, чтобы прочитать вслух.',
      usage: 'Share with… / Create Entity for… / Accept…. Одноразовый PIN передаётся вне канала. Едет ли одноразовый код вместе с записью — спрашивается, не подразумевается. Withdraw a Share You Sent… — пока шара ждёт.\n\n**Show Signing Fingerprint…** — вторая половина доверия при первой встрече: печатает короткий отпечаток вашего ключа подписи, чтобы коллега сверил его со строкой отправителя и убедился, что шара от вас. Когда их приходит сразу много, **Accept All from Sender…** примет всё от одного человека, а **Accept All Shared…** — всё сразу; каждая всё равно ложится обычной записью, которую можно осмотреть.',
      whatCanGoWrong: '«Уже принято» при отзыве значит — не вернуть: ротируйте секрет, это единственный ход. На NAS-папке отклонённая шара может появиться снова (нет сервера для дедупа) — проверяйте строку отправителя и отпечаток.',
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
    id: 'filters',
    mediaSlots: [],
    en: {
      title: 'The filter, and capability filters',
      whatItIs: 'The search row filters the tree live by what a row shows — name, host, user, command — and, with `has:` / `mcp:` predicates, by what an entry CAN DO.',
      why: '“Which entries can agents rotate?” and “what has a one-time code?” are questions a name search cannot answer.',
      setup: 'Nothing. Click the search row or run Filter Credentials….',
      usage: '`aws has:totp mcp:usable` — free text and predicates AND together. Available: has:totp, has:cli, has:env, has:code-access, has:deps, has:attachment, has:image, is:ephemeral, mcp:visible/usable/rotate/create/delete-own/delete-any. Click a result and keep working — closing the filter reveals and briefly tints the row you had selected.\n\nThe filter narrows what is DISPLAYED; **Go to Credential…** (Ctrl+Alt+P) answers the other question — I know its name, open it — as one list across every account. It matches exactly what the filter matches, and for the same reason: neither one ever searches a secret.',
      whatCanGoWrong: 'Secrets are never searched — a filter over passwords would confirm one keystroke at a time. An unknown predicate is named on the row rather than silently matched as text.',
    },
    ru: {
      title: 'Фильтр и фильтры-возможности',
      whatItIs: 'Строка поиска фильтрует дерево на лету по тому, что видно на строке — имя, хост, пользователь, команда — а с предикатами `has:` / `mcp:` — по тому, что запись МОЖЕТ.',
      why: '«Что агенты могут ротировать?» и «у чего есть одноразовый код?» — вопросы, на которые поиск по имени не отвечает.',
      setup: 'Ничего. Клик по строке поиска или Filter Credentials….',
      usage: '`aws has:totp mcp:usable` — текст и предикаты работают через И. Доступно: has:totp, has:cli, has:env, has:code-access, has:deps, has:attachment, has:image, is:ephemeral, mcp:visible/usable/rotate/create/delete-own/delete-any. Кликайте по результату и работайте — закрытие фильтра покажет и коротко подсветит выбранную строку.\n\nФильтр сужает то, что ПОКАЗАНО; **Go to Credential…** (Ctrl+Alt+P) отвечает на другой вопрос — я знаю имя, открой это — одним списком по всем аккаунтам. Ищет он ровно то же, что и фильтр, и по той же причине: ни один из них никогда не ищет по секрету.',
      whatCanGoWrong: 'Секреты не ищутся никогда — фильтр по паролям подтверждал бы их по букве. Незнакомый предикат называется на строке, а не молча ищется как текст.',
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
    id: 'secret-scan',
    mediaSlots: [],
    en: {
      title: 'Checking whether a secret escaped',
      whatItIs: 'Two scans that look for YOUR OWN stored values where they should not be: **Check Clipboard for Vault Secrets** and **Scan This File for Vault Secrets**.',
      why: 'The way a credential leaks is rarely dramatic. It is pasted into a config to test something, committed with everything else, and forgotten. A scan answers the one question a grep cannot: is this string one of MINE?',
      setup: '⋯ menu -> **Check Clipboard for Vault Secrets**, or, with a file open, **Scan This File for Vault Secrets** from its editor.',
      usage: 'You get the label of the entry whose value was found, the line it was first seen on, and how many times — never the value itself printed back at you, which would be the same leak in a different window.\n\nIt compares against the vault you have unlocked, so a locked account contributes nothing: unlock first, then scan.',
      whatCanGoWrong: 'A clean result is not a promise that nothing leaked — only that nothing this vault holds appears in that text. A secret you never stored here cannot be found by definition.\n\nVery short values are not searched: a six-character secret would match ordinary prose and the report would be noise nobody reads.',
    },
    ru: {
      title: 'Проверить, не утёк ли секрет',
      whatItIs: 'Две проверки, ищущие ВАШИ СОБСТВЕННЫЕ хранимые значения там, где их быть не должно: **Check Clipboard for Vault Secrets** и **Scan This File for Vault Secrets**.',
      why: 'Утечка учётки редко бывает драматичной. Её вставили в конфиг, чтобы что-то проверить, закоммитили вместе со всем остальным и забыли. Сканирование отвечает на вопрос, на который grep ответить не может: эта строка — моя?',
      setup: 'Меню ⋯ -> **Check Clipboard for Vault Secrets**, либо, с открытым файлом, **Scan This File for Vault Secrets** из редактора.',
      usage: 'Вы получаете имя записи, чьё значение нашлось, строку, где оно встретилось впервые, и сколько раз, — но никогда само значение обратно на экран: это была бы та же утечка в другом окне.\n\nСравнение идёт с тем сейфом, который разблокирован, поэтому запертый аккаунт не даёт ничего: сначала разблокировать, потом сканировать.',
      whatCanGoWrong: 'Чистый результат — не обещание, что ничего не утекло, а только то, что в этом тексте нет ничего из этого сейфа. Секрет, который вы здесь не хранили, не может быть найден по определению.\n\nСовсем короткие значения не ищутся: секрет из шести символов совпал бы с обычным текстом, и отчёт стал бы шумом, который никто не читает.',
    },
  },
  {
    id: 'clipboard',
    mediaSlots: [],
    en: {
      title: 'Copying a secret, and the clipboard clearing itself',
      whatItIs: '**Copy Password** and its relatives put a value on the clipboard and then take it off again after a while — 45 seconds by default (`secretClipboardTtlSeconds`).',
      why: 'A clipboard is read by more things than people expect: clipboard managers, sync tools, remote-desktop bridges, screenshot pipelines. A password that sits there until the next copy is a password in all of them.',
      setup: 'Nothing to switch on. Change the window with `credSshManager.secretClipboardTtlSeconds`; the notice that appears when you copy tells you what it is set to.',
      usage: 'The clear is careful rather than eager: it wipes the clipboard only if what is there is still exactly what was copied. Copy something else in the meantime and your own work is left alone.\n\nFor a database there are two copies deliberately — **Copy Connection String** and **Copy Connection String (no password)** — because the second is the one you paste into a ticket.',
      whatCanGoWrong: 'A clipboard manager that already captured the value keeps it: this clears the clipboard, not everything that read it.\n\nIf you need the value for longer than the window, copy it again rather than raising the setting for everything.',
    },
    ru: {
      title: 'Копирование секрета и самоочистка буфера',
      whatItIs: '**Copy Password** и его родственники кладут значение в буфер и через некоторое время убирают его оттуда — по умолчанию через 45 секунд (`secretClipboardTtlSeconds`).',
      why: 'Буфер обмена читают больше вещей, чем принято думать: менеджеры буфера, синхронизаторы, мосты удалённого рабочего стола, конвейеры скриншотов. Пароль, лежащий там до следующего копирования, лежит во всех них.',
      setup: 'Включать нечего. Окно меняется настройкой `credSshManager.secretClipboardTtlSeconds`; уведомление при копировании говорит, сколько оно сейчас.',
      usage: 'Очистка аккуратная, а не рьяная: буфер стирается, только если в нём всё ещё ровно то, что было скопировано. Скопировали за это время что-то своё — ваша работа не пострадает.\n\nУ базы намеренно два копирования — **Copy Connection String** и **Copy Connection String (no password)**, — потому что второе и есть то, что вставляют в тикет.',
      whatCanGoWrong: 'Менеджер буфера, уже захвативший значение, его сохранит: очищается буфер, а не всё, что успело его прочитать.\n\nЕсли значение нужно дольше окна, скопируйте его ещё раз, а не поднимайте настройку для всего сразу.',
    },
  },
  {
    id: 'payment-instruments',
    mediaSlots: [],
    en: {
      title: 'Cards, bank details and seed phrases — and what weaving them does not buy',
      whatItIs: 'A payment instrument is one entry in three forms: a **card**, a set of **bank details**, or a **phrase** you must not lose. All three are stored the same way — one encrypted record under one key in the OS keychain — and the form decides which fields you are asked for.\n\n**Two of the three work in this build.** The card and the bank details are complete, and either can be stored **woven with a decoy**. The **phrase** form is not built yet: its wordlists, decoys and two-column arithmetic exist, but nothing fills them in, so the selector\'s third option has no fields behind it. Everything below marked *(not yet)* is that form.\n\nSwitching an entry to a different form DELETES what the old form held. You are asked first, by field name, and only when something is actually stored.',
      why: 'Until now a card or a seed phrase had nowhere to go but the **notes** of some other entry, where it is encrypted but not masked, reaches search, and travels into a share as ordinary text. The data was already in the vault — just with nothing handling it as what it is.',
      setup: 'Add an entry in a folder typed to **payment**, or pick the kind on the form. Choose the form, fill in what you have. A card number names its payment system as you type it, and says when the digits do not add up — worth checking, and it saves either way, because people hold cards this build has never heard of.\n\nAny of the number, CVV, PIN, IBAN or account number can be marked **woven with a decoy**. The entry viewer then shows a method picker for that field and rebuilds it into two rows. *(Not yet: a phrase woven against a generated decoy or against a second real key — that is the form which is still missing.)*',
      usage: '**What weaving is for, exactly.** A woven field is stored as your value and a decoy shuffled together under one of twelve methods, and **the method is kept nowhere** — not in this vault, not in a backup, not in the sync. Nobody can unweave it but you, from memory.\n\nIt protects against somebody **reading** an open vault: a shoulder, a screen share, a backup file opened on a laptop. It does **not** protect against somebody who can try every possibility — a CVV is a thousand values, and weaving costs them nothing. An odd-length phrase has twelve methods and an even-length one twenty-four; neither is a defence, it is just arithmetic you should not meet for the first time at save time.\n\n**The CVV, the PIN and an assembled phrase ask a second time before they appear.** They are the only fields in this vault that do — everything else is yours the moment the vault is open. That is a deliberate exception, not an oversight. You are asked once per card and again for the next entry, and **copying asks the same question**, because copying is showing, to the clipboard.\n\n**The viewer tells you nothing about which row is yours.** Pick a method, and two rows come back. A wrong method answers in exactly the same shape as a right one — there is no tick, no "looks valid", no ordering that puts a likelier answer first. That is not an omission: anything that could tell them apart would do the guessing for whoever is reading over your shoulder.\n\n**A share never carries a CVV or a PIN. An export does.** The export says so out loud, with counts and never values, before it writes the file.',
      whatCanGoWrong: '**A forgotten method is a lost value.** There is no recovery: not by us, not from a backup, not from the sync, because the original is in none of them.\n\n**An entry with a woven field cannot be edited.** The form would have nothing to put where the original belongs, and saving would weave the woven value a second time — doubling its length under two unknown methods, then four. Delete the entry and make it again, or view it and unweave the field first.\n\n**A typo in a field you are about to weave can never be found later.** That is why a failing checksum on a marked field asks for confirmation rather than only hinting — it is the last moment anybody can catch it.\n\n**Memory, honestly.** An assembled phrase is held as bytes we allocated and zero when the view closes, and the view closes itself. What that does NOT mean is one copy: a JavaScript string cannot be zeroed, and rendering words into a window makes copies the runtime owns and we cannot reach. A memory dump — from swap, from hibernation, from a crash file — can still contain what was on screen. Fewer copies we control is what this buys, and it is all it buys.\n\n**With a second real key in the second column, a leak of the assembled view reveals TWO keys rather than one.** Both halves must be the same length; the form says so rather than failing at the end.',
    },
    ru: {
      title: 'Карты, банковские реквизиты и seed-фразы — и чего перемешивание НЕ даёт',
      whatItIs: 'Платёжный инструмент — одна запись в трёх формах: **карта**, **банковские реквизиты** или **фраза**, которую нельзя потерять. Все три хранятся одинаково — одна зашифрованная запись под одним ключом в хранилище ОС, — а форма решает, какие поля у вас спросят.\n\n**В этой сборке работают две формы из трёх.** Карта и реквизиты готовы полностью, и любое их поле можно хранить **перемешанным с приманкой**. Форма **фразы** пока не построена: словари, приманки и арифметика двух колонок есть, но заполнять их нечем, поэтому у третьего пункта в списке форм нет полей. Всё, помеченное ниже как *(пока нет)*, — это она.\n\nПереключение записи на другую форму УДАЛЯЕТ то, что хранила прежняя. Спрашивают заранее, по именам полей и только если там действительно что-то есть.',
      why: 'До сих пор карте или seed-фразе некуда было деться, кроме **заметок** другой записи: там они зашифрованы, но не замаскированы, попадают в поиск и уезжают в шаринг обычным текстом. Данные и так лежали в сейфе — просто с ними ничего не обращалось как с тем, чем они являются.',
      setup: 'Добавьте запись в папке с типом **payment** или выберите вид в форме. Выберите форму и заполните то, что есть. Номер карты сам называет платёжную систему по мере ввода и говорит, если цифры не сходятся, — стоит проверить, но сохранится в любом случае: у людей есть карты, о которых эта сборка не знает.\n\nЛюбое из полей — номер, CVV, PIN, IBAN, номер счёта — можно пометить **перемешать с приманкой**. В просмотре записи у такого поля появляется выбор метода, и оно собирается обратно в две строки. *(Пока нет: фраза, перемешанная со сгенерированной приманкой или со вторым настоящим ключом, — это как раз недостающая форма.)*',
      usage: '**Для чего именно перемешивание.** Перемешанное поле хранится как ваше значение и приманка, вплетённые друг в друга одним из двенадцати методов, и **метод не хранится нигде** — ни в сейфе, ни в резервной копии, ни в синхронизации. Расплести это не может никто, кроме вас, по памяти.\n\nЭто защищает от того, кто **читает** открытый сейф: взгляд через плечо, демонстрация экрана, файл резервной копии на ноутбуке. Это **не** защищает от того, кто может перебрать все варианты: CVV — тысяча значений, и перемешивание ему ничего не стоит. У фразы нечётной длины двенадцать методов, у чётной — двадцать четыре; ни то ни другое не защита, это просто арифметика, с которой не стоит впервые встречаться при сохранении.\n\n**CVV, PIN и собранная фраза спрашивают второй раз, прежде чем появиться.** Это единственные поля в сейфе, которые так делают, — всё остальное ваше с момента, когда сейф открыт. Это осознанное исключение, а не недосмотр. Спрашивают один раз на карточку и снова на следующей записи, и **копирование спрашивает то же самое**: скопировать — значит показать, только в буфер обмена.\n\n**Просмотр не говорит, какая из строк ваша.** Выбираете метод — приходят две строки. Неверный метод отвечает ровно в той же форме, что и верный: ни галочки, ни «похоже на настоящую», ни порядка, в котором вероятное идёт первым. Это не упущение: всё, что позволило бы их различить, сделало бы перебор за того, кто смотрит вам через плечо.\n\n**Шаринг никогда не несёт CVV и PIN. Экспорт — несёт.** Экспорт говорит об этом прямо, числами и никогда значениями, до того как напишет файл.',
      whatCanGoWrong: '**Забытый метод — потерянное значение.** Восстановления нет: ни у нас, ни из копии, ни из синхронизации, потому что оригинала нет ни в одной из них.\n\n**Запись с перемешанным полем нельзя редактировать.** Форме нечего положить туда, где был оригинал, а сохранение вплело бы перемешанное значение второй раз — удвоив длину под двумя неизвестными методами, потом вчетверо. Удалите запись и создайте заново или откройте просмотр и сначала расплетите поле.\n\n**Опечатку в поле, которое вы собираетесь перемешать, потом найти невозможно.** Поэтому непрошедшая контрольная сумма у помеченного поля просит подтверждение, а не просто намекает: это последний момент, когда её вообще можно поймать.\n\n**О памяти, честно.** Собранная фраза лежит байтами, которые мы выделили и обнуляем при закрытии, и окно закрывается само. Это НЕ означает одну копию: строку в JavaScript обнулить нельзя, а отрисовка слов в окне создаёт копии, которыми владеет среда и до которых нам не дотянуться. Дамп памяти — из swap, из гибернации, из файла аварии — всё ещё может содержать то, что было на экране. Меньше копий, которыми управляем мы, — вот что это даёт, и это всё, что это даёт.\n\n**Со вторым настоящим ключом во второй колонке утечка собранного вида раскрывает ДВА ключа, а не один.** Обе половины должны быть одной длины; форма говорит об этом сразу, а не падает в конце.',
    },
  },
];

/** Ids must be unique and the order IS the index page. */
export function helpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}
