import { BackupPageMessage, BackupPageMessageType, TargetDraft, renderBackupPage } from './backupPage';
import {
  describeTarget,
  identityOf,
  isTargetKind,
  normalizeTarget,
  targetProblem,
  toInputs,
  withTarget,
  withoutTarget,
} from './backupTargets';
import { describeError } from './describeError';
import {
  BackupStatus,
  BackupTargetInput,
  BackupTargetSummary,
  MintedBackupKey,
  OrgBackupClient,
  SEALED,
  settingsProblem,
} from './orgBackupClient';
import { StoredAccount } from './types';

/**
 * One Server backup tab's state machine — the half with no `vscode` in it.
 *
 * <p>Separated from `orgBackupPanel.ts` by CLAUDE.md rule 3: everything worth being wrong about here
 * — what is asked for, what a late answer does, what a failure draws, and above all when the key's
 * words are handed over — is in this file, so all of it is a unit test. The panel next door is the
 * lines that wire a webview, a save dialog and a modal to it.</p>
 *
 * <p><b>A credential lives for the length of ONE message.</b> The form posts `saveTarget` with what
 * was typed; the tab builds the request from it and hands it to the client; nothing of it is
 * assigned to a field, drawn into the page, put in a notice or logged. The draft the tab keeps for a
 * failed save is the non-secret half, and the test asserts the HTML after a failed save carries none
 * of the four credential strings.</p>
 */

/** What this tab asks of a client, and nothing more, so a test hands it a small object. */
export type BackupReader = Pick<
  OrgBackupClient,
  'readStatus' | 'readTargets' | 'saveSettings' | 'mintKey' | 'runNow' | 'downloadArchive'
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
  /**
   * Ask before a destination is removed. `what` is the destination in the page's own words.
   *
   * <p>A modal, because the archives already at that destination stay there and only this server
   * stops sending new ones — a fact worth a sentence before a button that cannot be undone from here.</p>
   */
  readonly confirmRemove: (what: string) => Promise<boolean>;
  /**
   * Where a status the tab just read should also go — the tree's Backup row, in practice.
   *
   * <p>Optional, so a test host is three functions. Every status handed here came from
   * `readStatus`, never from a guess: the tab re-reads after each action, and the row then agrees
   * with the tab without waiting for the next readiness tick (#134).</p>
   */
  readonly record?: (status: BackupStatus) => void;
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

/** A new destination starts as S3 with nothing filled in. */
const EMPTY_DRAFT: TargetDraft = { kind: 's3', endpoint: '', region: '', bucket: '', prefix: '' };

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

  /** The configured destinations; `undefined` until read. `olderServer` is the third answer. */
  private targets: readonly BackupTargetSummary[] | undefined;

  private olderServer = false;

  private draft: TargetDraft | undefined;

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
      targets: this.targets,
      olderServer: this.olderServer,
      draft: this.draft,
      busy: this.busy,
      notice: this.notice,
      error: this.error,
      account: this.account.email,
    }));
  }

  /**
   * Route one message from the page. Unknown types cannot arrive — the guard is at the door — and a
   * type without a route cannot be written: the table is over the whole union, so adding a message
   * kind without a handler is a compile error rather than a click that does nothing.
   */
  handle(message: BackupPageMessage): Promise<void> {
    const routes: Readonly<Record<BackupPageMessageType, () => Promise<void>>> = {
      refresh: () => this.refresh(),
      mint: () => this.mint(),
      run: () => this.run(),
      download: () => this.download(),
      save: () => this.save(message),
      addTarget: () => this.addTarget(),
      editTarget: () => this.editTarget(message.index),
      cancelTarget: () => this.cancelTarget(),
      saveTarget: () => this.saveTarget(message),
      removeTarget: () => this.removeTarget(message.index),
    };
    return routes[message.type]();
  }

  /**
   * Read the status and the destinations again.
   *
   * <p>Its own button as well as its own automatic call, because a person who has just configured a
   * destination wants to know NOW whether it took — waiting for a scheduled poll to come round is
   * how somebody concludes their change was ignored and does it twice.</p>
   */
  private async refresh(): Promise<void> {
    await this.attempt(async () => {
      await this.reread();
      return undefined;
    });
  }

  /** Both reads, together; the status is recorded for whoever draws it elsewhere. */
  private async reread(): Promise<void> {
    const [status, targets] = await Promise.all([
      this.client.readStatus(this.account),
      this.client.readTargets(this.account),
    ]);
    this.setStatus(status);
    this.setTargets(targets);
  }

  /** The ONE place a status is assigned — so the one place it is also handed to the tree. */
  private setStatus(status: BackupStatus): void {
    this.status = status;
    this.host.record?.(status);
  }

  /** `undefined` from the client is a server with no route, and the form is then never offered. */
  private setTargets(targets: readonly BackupTargetSummary[] | undefined): void {
    this.olderServer = targets === undefined;
    this.targets = targets ?? [];
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
      if (!saved) {
        // BEFORE the status is re-read, and that ordering is a test. Delivering the response is what
        // acknowledges the key on the server, so by now it is Ready whatever the person did with the
        // dialog — and if they discarded the words, every archive from here on is sealed under
        // something nobody has. A status read that then failed would replace this sentence with
        // "the server is unreachable": true, secondary, and not the thing they have to be told. The
        // page's status is stale until the next refresh, which is the smaller cost by a distance.
        throw new Error(DISCARDED);
      }
      this.setStatus(await this.client.readStatus(this.account));
      return 'The backup key is in place. Its words will not be shown again.';
    });
  }

  private async run(): Promise<void> {
    await this.attempt(async () => {
      await this.client.runNow(this.account);
      // Read it straight back: the server writes "in progress" INSIDE the request, so by the time
      // 202 arrives the state a reload would find is already on disk and the page can show it.
      this.setStatus(await this.client.readStatus(this.account));
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
      // Refused here rather than sent: the save also probes every changed destination over the
      // network, so a typo would cost a round trip and a wait to be told what this knows already.
      this.refuse(problem);
      return;
    }
    await this.attempt(async () => {
      // The targets are deliberately NOT sent: omitted means unchanged, and this form edits only the
      // schedule. Sending an empty array here would remove every configured destination.
      await this.client.saveSettings(this.account, settings);
      this.setStatus(await this.client.readStatus(this.account));
      return 'Saved.';
    });
  }

  /** A refusal decided here: drawn without a request, and without touching the busy state. */
  private refuse(problem: string): void {
    this.error = problem;
    this.notice = undefined;
    this.redraw();
  }

  private addTarget(): Promise<void> {
    this.draft = EMPTY_DRAFT;
    this.error = undefined;
    this.redraw();
    return Promise.resolve();
  }

  /**
   * Open the form on a row — for a kind the form can represent.
   *
   * <p>A newer server may list a destination of a kind this build does not know (the drives plan).
   * The form's kind picker has two entries and its fields are a bucket's, so opening it would draw
   * that destination as something it is not; the refusal names the way out instead. Remove still
   * works — the list is sent whole with that row left out.</p>
   */
  private editTarget(index: number | undefined): Promise<void> {
    const row = this.row(index);
    if (row === undefined) {
      return Promise.resolve();
    }
    if (!isTargetKind(row.kind)) {
      this.refuse(
        `This build does not know '${row.kind}' destinations, so it cannot edit ${describeTarget(row)}. `
        + 'Update the extension to edit it; it can still be removed here.',
      );
      return Promise.resolve();
    }
    this.draft = { index, kind: row.kind, endpoint: row.endpoint, region: row.region, bucket: row.bucket, prefix: row.prefix };
    this.error = undefined;
    this.redraw();
    return Promise.resolve();
  }

  private cancelTarget(): Promise<void> {
    this.draft = undefined;
    this.redraw();
    return Promise.resolve();
  }

  /**
   * Save the destination being added or edited: the whole list, with this one in its place.
   *
   * <p>The message's credential fields go into the request and nowhere else. What the tab keeps for
   * a failed attempt is the non-secret draft, so the person does not retype the endpoint — and what
   * it never keeps is what they typed into the two fields below it.</p>
   */
  private async saveTarget(message: BackupPageMessage): Promise<void> {
    const draft = this.draft ?? EMPTY_DRAFT;
    const edited = normalizeTarget(inputOf(draft, message));
    this.draft = { ...draft, kind: edited.kind, endpoint: edited.endpoint, region: edited.region, bucket: edited.bucket, prefix: edited.prefix };
    const problem = this.unopenableRefusal(edited, draft.index) || targetProblem(edited, this.keepsSealed(edited, draft.index));
    if (problem.length > 0) {
      this.refuse(`${describeTarget(edited)}: ${problem}`);
      return;
    }
    await this.saveList(withTarget(this.inputs(), edited, draft.index), 'Destination saved.');
  }

  /**
   * Whether leaving the credentials out means "keep the sealed ones": only an edit whose identity
   * is still the server's AND whose sealed credentials the server can open. A prefix changed during
   * the edit is a NEW destination to the server, and a new destination needs both halves the first
   * time; a row the server cannot open has nothing to keep.
   */
  private keepsSealed(edited: BackupTargetInput, index: number | undefined): boolean {
    return this.editedRow(edited, index)?.credentials === SEALED;
  }

  /**
   * The refusal for editing a destination whose credentials the server cannot open, with both
   * credential fields left empty — or nothing.
   *
   * <p>Found by CodeRabbit on PR #142: "keep the sealed ones" was granted by identity alone, so the
   * list saved, the tab said "Destination saved.", and the nightly run went on failing for want of
   * credentials nobody had been asked for. Saving ANOTHER row still carries this one key-less — the
   * server keeps an unopenable sibling as it is — which is why the rule is the EDITED row's only.</p>
   */
  private unopenableRefusal(edited: BackupTargetInput, index: number | undefined): string {
    const row = this.editedRow(edited, index);
    return row === undefined || row.credentials === SEALED ? '' : keysForUnopenable(edited);
  }

  /** The row being edited, while the edit keeps its identity — else nothing. */
  private editedRow(edited: BackupTargetInput, index: number | undefined): BackupTargetSummary | undefined {
    const row = this.row(index);
    return row !== undefined && identityOf(row) === identityOf(edited) ? row : undefined;
  }

  private async removeTarget(index: number | undefined): Promise<void> {
    if (index === undefined) {
      return;
    }
    const row = this.row(index);
    if (row === undefined) {
      return;
    }
    if (!(await this.host.confirmRemove(describeTarget(row)))) {
      return;
    }
    await this.saveList(
      withoutTarget(this.inputs(), index),
      'Destination removed. Archives already there stay there; only this server stops sending new ones.',
    );
  }

  /** The destinations the server holds, as the key-less requests a save re-sends them as. */
  private inputs(): BackupTargetInput[] {
    return toInputs(this.targets ?? []);
  }

  /**
   * Send the whole destinations list with the schedule as it is, then read everything back.
   *
   * <p>On failure the list is re-read too — so the page shows what the server holds rather than what
   * the person hoped — and the draft stays for the retry. The re-read is best effort: the failure
   * that matters is the save's own sentence.</p>
   */
  private async saveList(targets: readonly BackupTargetInput[], said: string): Promise<void> {
    await this.attempt(async () => {
      try {
        await this.client.saveSettings(this.account, { ...this.schedule(), targets });
      } catch (error) {
        await this.rereadTargetsQuietly();
        throw error;
      }
      this.draft = undefined;
      await this.reread();
      return said;
    });
  }

  /** The schedule as the page last read it — a destinations save changes the destinations, not the hour. */
  private schedule(): { scheduleHourUtc: number; retentionDays: number } {
    const status = this.status;
    if (status === undefined) {
      return { scheduleHourUtc: 3, retentionDays: 30 };
    }
    return { scheduleHourUtc: status.scheduleHourUtc, retentionDays: status.retentionDays };
  }

  private async rereadTargetsQuietly(): Promise<void> {
    const targets = await this.client.readTargets(this.account).catch(() => this.targets);
    this.setTargets(targets);
  }

  private row(index: number | undefined): BackupTargetSummary | undefined {
    return index === undefined ? undefined : this.targets?.[index];
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

type LocationField = 'kind' | 'endpoint' | 'region' | 'bucket' | 'prefix';

/** The destination a `saveTarget` message describes, over the draft it started from. */
function inputOf(draft: TargetDraft, message: BackupPageMessage): BackupTargetInput {
  const said = (field: LocationField): string => message[field] ?? draft[field];
  return {
    kind: said('kind'),
    endpoint: said('endpoint'),
    region: said('region'),
    bucket: said('bucket'),
    prefix: said('prefix'),
    accessKeyId: message.accessKeyId,
    secretAccessKey: message.secretAccessKey,
    accountName: message.accountName,
    accountKey: message.accountKey,
  };
}

/**
 * The refusal for an edit of a destination the server cannot open, or nothing when both halves were
 * typed. A single half typed keeps its own "is missing" sentence; both left empty is what this is for.
 */
function keysForUnopenable(edited: BackupTargetInput): string {
  if (targetProblem(edited, false) === '') {
    return '';
  }
  return targetProblem(edited, true) || cannotOpen(edited.kind);
}

/** Why an unopenable destination's edit needs both halves again, in the kind's own words. */
function cannotOpen(kind: string): string {
  const halves = kind === 's3' ? 'the access key id and the secret access key' : 'the account name and the account key';
  return 'This server cannot open the credentials saved for this destination — they were sealed under a key '
    + `it no longer has — so leaving the fields empty would keep nothing. Enter ${halves} again.`;
}
