import { BackupPageMessage, renderBackupPage } from './backupPage';
import { describeError } from './describeError';
import { BackupStatus, MintedBackupKey, OrgBackupClient, settingsProblem } from './orgBackupClient';
import { StoredAccount } from './types';

/**
 * One Server backup tab's state machine — the half with no `vscode` in it.
 *
 * <p>Separated from `orgBackupPanel.ts` by CLAUDE.md rule 3: everything worth being wrong about here
 * — what is asked for, what a late answer does, what a failure draws, and above all when the key's
 * words are handed over — is in this file, so all of it is a unit test. The panel next door is the
 * lines that wire a webview, a save dialog and a modal to it.</p>
 */

/** What this tab asks of a client, and nothing more, so a test hands it a small object. */
export type BackupReader = Pick<
  OrgBackupClient,
  'readStatus' | 'saveSettings' | 'mintKey' | 'runNow' | 'downloadArchive'
>;

/**
 * What the tab needs from the editor. Every one of these is a thing only `vscode` can do, which is
 * exactly why they are parameters rather than imports.
 */
export interface BackupTabHost {
  readonly draw: (html: string) => void;
  /**
   * Show the words, once, and answer whether the person confirmed writing them down.
   *
   * <p>It returns a promise so the tab can wait: the key must not be able to scroll away behind a
   * status refresh while somebody is still copying it. And it returns a BOOLEAN because a person can
   * discard them — the dialog cannot be made un-dismissable, and reporting that as success is what
   * this signature exists to prevent.</p>
   */
  readonly showKey: (minted: MintedBackupKey) => Promise<boolean>;
  /** Stream the archive somewhere the person chose, or do nothing if they cancelled. */
  readonly saveArchive: () => Promise<void>;
}

/**
 * What an administrator is told when they discard the words.
 *
 * <p>The remedy is real and it is deliberately not a button: rotation answers `501` because a new
 * key orphans every archive the old one opens, and that is a decision. Removing the two files makes
 * the server mint afresh — losing whatever was taken under the discarded key, which is nothing yet
 * if this is dealt with before the next scheduled run.</p>
 */
const DISCARDED = 'The key was minted and its words were discarded. The server has already accepted '
  + 'it, so every archive taken from now on is sealed under words nobody has — and nothing on this '
  + 'screen can undo that. To start again, remove org/backup/key.sealed and org/backup/key.shown '
  + 'from the server\'s data directory and mint a new key here; any archive taken under the '
  + 'discarded one is unopenable for ever.';

/** What one action came to: a sentence to show, or one to apologise with. Never both. */
interface Settled {
  readonly said?: string;
  readonly failure?: string;
}

/**
 * Run the work and turn either ending into an answer, so the caller has one path rather than three.
 *
 * <p>A `finally` that redraws is where a stale generation gets drawn anyway: it runs on the success
 * path, the failure path and the cancelled one, and the check has to be repeated in each. One
 * outcome, one place that decides whether to draw it.</p>
 */
async function settled(work: () => Promise<string | undefined>): Promise<Settled> {
  try {
    return { said: await work() };
  } catch (failure) {
    return { failure: describeError(failure) };
  }
}

/**
 * The tab.
 *
 * <p><b>Every request carries a generation.</b> Two clicks race — a refresh while a run is being
 * started, a save while a status is out — and the answer that arrives late must not draw a status
 * from a question nobody is looking at any more.</p>
 */
export class BackupTab {
  private status: BackupStatus | undefined;

  private busy = false;

  private notice: string | undefined;

  private error: string | undefined;

  private generation = 0;

  constructor(
    private readonly client: BackupReader,
    private readonly account: StoredAccount,
    private readonly host: BackupTabHost,
  ) {}

  start(): Promise<void> {
    return this.refresh();
  }

  redraw(): void {
    this.host.draw(renderBackupPage({
      status: this.status,
      busy: this.busy,
      notice: this.notice,
      error: this.error,
      account: this.account.email,
    }));
  }

  /** Route one message from the page. Unknown types cannot arrive — the guard is at the door. */
  handle(message: BackupPageMessage): Promise<void> {
    const routes: Readonly<Record<string, () => Promise<void>>> = {
      refresh: () => this.refresh(),
      mint: () => this.mint(),
      run: () => this.run(),
      download: () => this.download(),
    };
    return (routes[message.type] ?? (() => this.save(message)))();
  }

  /**
   * Read the status again.
   *
   * <p>Its own button as well as its own automatic call, because a person who has just configured a
   * destination wants to know NOW whether it took — waiting for a scheduled poll to come round is
   * how somebody concludes their change was ignored and does it twice.</p>
   */
  private async refresh(): Promise<void> {
    await this.attempt(async () => {
      this.status = await this.client.readStatus(this.account);
      return undefined;
    });
  }

  /**
   * Mint, then show the words, then read the status back.
   *
   * <p><b>The order is the whole thing.</b> The words are handed to the host and awaited before
   * anything else happens, because a status refresh redrawing the page underneath a dialog somebody
   * is copying from is how a key is lost. And the status is re-read afterwards so the page stops
   * offering a button that would now be refused.</p>
   */
  private async mint(): Promise<void> {
    await this.attempt(async () => {
      const minted = await this.client.mintKey(this.account);
      const saved = await this.host.showKey(minted);
      this.status = await this.client.readStatus(this.account);
      if (!saved) {
        // NOT a cheerful notice. Delivering the response is what acknowledges the key on the server,
        // so by now it is Ready whatever the person did with the dialog — and if they discarded the
        // words, every archive from here on is sealed under something nobody has. Saying "the backup
        // key is in place" there would be true and useless; what they need is the state they are in
        // and the only way out of it, which is on the host rather than on this screen.
        throw new Error(DISCARDED);
      }
      return 'The backup key is in place. Its words will not be shown again.';
    });
  }

  private async run(): Promise<void> {
    await this.attempt(async () => {
      await this.client.runNow(this.account);
      // Read it straight back: the server writes "in progress" INSIDE the request, so by the time
      // 202 arrives the state a reload would find is already on disk and the page can show it.
      this.status = await this.client.readStatus(this.account);
      return 'A backup has started. This page shows what it does as it goes.';
    });
  }

  private async download(): Promise<void> {
    await this.attempt(async () => {
      await this.host.saveArchive();
      return undefined;
    });
  }

  private async save(message: BackupPageMessage): Promise<void> {
    const settings = {
      scheduleHourUtc: message.scheduleHourUtc ?? 3,
      retentionDays: message.retentionDays ?? 30,
    };
    const problem = settingsProblem(settings);
    if (problem.length > 0) {
      // Refused here rather than sent: the save also probes every destination over the network, so a
      // typo would cost a round trip and a wait to be told what this knows already.
      this.error = problem;
      this.notice = undefined;
      this.redraw();
      return;
    }
    await this.attempt(async () => {
      // The targets are deliberately NOT sent: omitted means unchanged, and this form edits only the
      // schedule. Sending an empty array here would remove every configured destination.
      await this.client.saveSettings(this.account, settings);
      this.status = await this.client.readStatus(this.account);
      return 'Saved.';
    });
  }

  /**
   * One action: busy, draw, do it, draw whatever came of it.
   *
   * <p>The generation check is what makes two clicks safe. A stale answer still finishes its work —
   * a started run is a started run — but it does not draw, because the page has moved on.</p>
   */
  private async attempt(work: () => Promise<string | undefined>): Promise<void> {
    if (this.busy) {
      return;
    }
    this.generation += 1;
    const mine = this.generation;
    this.busy = true;
    this.error = undefined;
    this.notice = undefined;
    this.redraw();
    const outcome = await settled(work);
    this.settle(mine, outcome);
  }

  /** Draw an answer, unless the page has moved on to a newer question. */
  private settle(generation: number, outcome: Settled): void {
    if (generation !== this.generation) {
      return;
    }
    this.notice = outcome.said;
    this.error = outcome.failure;
    this.busy = false;
    this.redraw();
  }
}
