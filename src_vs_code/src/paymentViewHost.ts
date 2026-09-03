import { PAYMENT_FIELD_LABELS, PaymentFieldKey, PaymentFields } from './paymentFields';
import { PHRASE_VISIBLE_MS, needsReveal, phraseRevealPrompt, revealPrompt } from './revealGate';
import { PaymentCardView, copyTextFor, plainValues, readingFor, revealValue } from './paymentViewMessages';
import { Reassembled } from './phraseReassembly';
import { PhraseBuffer } from './phraseBuffer';

/**
 * The payment card's host half: what a message from the card is answered with, and what is asked
 * before it is answered at all.
 *
 * <p>Its own module rather than four more branches in `entityViewPanel.ts`, whose message loop
 * already carries an `eslint-disable` for complexity — the rule there is extract, not suppress. And
 * because everything below is worth testing: the gate that must not be bypassed, the grant that must
 * not outlive the card, and the buffers that must be cleared on every path out.</p>
 *
 * <p>Pure: no `vscode`. The dialog, the clipboard and the webview arrive as functions, which is what
 * lets a test decline a confirmation and assert that nothing was posted.</p>
 *
 * <h3>The gate covers the method picker, not only the Show button</h3>
 *
 * <p>Found by the plan review, and it is the finding that earned the round: a woven PIN reached
 * through a method picker is the same value as a revealed PIN. Guarding `reveal` alone would have
 * left the second question guarding the door beside the open window.</p>
 *
 * <p>The grant is per FIELD and per CARD: asked once, remembered while this entry is on screen, and
 * dropped the moment the panel is re-rendered for another entry. Asking again for each of twelve
 * methods would be a control nobody uses, and asking once for ever would be a rung that quietly
 * stops being one.</p>
 */

/** Everything the host half needs from its surroundings, so that none of it is imported. */
export interface PaymentViewDeps {
  /** The CURRENT options — the preview tab re-renders for another entry, so this is read per call. */
  readonly view: () => PaymentCardView | undefined;
  readonly record: () => Thenable<PaymentFields> | undefined;
  readonly post: (message: unknown) => void;
  readonly confirm: (text: string, actionLabel: string) => Promise<boolean>;
  readonly copy: (text: string) => Promise<void>;
}

/** The messages this half owns. Anything else is not its business and is left to the panel. */
const HANDLED = ['payment', 'reveal', 'reassemble', 'copyReading', 'paymentClose'];

export function isPaymentMessage(type: string): boolean {
  return HANDLED.includes(type);
}

/**
 * A field that asks a second time: the two gated ones, and an assembled phrase.
 *
 * <p>`mixed` is here rather than in `GATED_FIELDS` because that list is about FIELDS of a card, and
 * this is about an assembled phrase — a different question with its own words. Keeping them apart is
 * what lets `revealGate` stay the pure statement of which card fields are exceptional.</p>
 */
function gated(key: string): boolean {
  return needsReveal(key) || key === 'mixed';
}

export class PaymentViewHost {
  /** Fields the person has already agreed to see, for the entry currently on the card. */
  private readonly grants = new Set<string>();

  /** Assembled phrases, held as bytes we can zero rather than as strings we cannot. */
  private readonly held = new Map<string, PhraseBuffer[]>();

  constructor(private readonly deps: PaymentViewDeps) {}

  /**
   * Answer one message, or say it was not ours.
   *
   * <p>Every payload is checked against the record that is actually loaded — the field against the
   * keys the card was drawn from, the method inside `readingFor` against `isShuffleCode`. The same
   * shape as this panel's existing `BINDABLE_FIELDS` check, and for the same reason: this is where
   * an untrusted message arrives.</p>
   */
  async handle(type: string, field: string): Promise<boolean> {
    const view = this.deps.view();
    const record = this.deps.record();
    if (view === undefined || record === undefined || !isPaymentMessage(type)) {
      return false;
    }
    await this.dispatchIfCurrent(type, field, view, await record);
    return true;
  }

  /**
   * The record read is an await, and this panel is the shared preview tab.
   *
   * <p>`show()` re-renders it for another entry, so by the time the keychain has answered, the card
   * asking may not be the card on screen. Acting on the record read for the previous entry is the
   * defect the code review found on the panel's own copy path — this is the same gap on the four
   * paths that never reach it, because a payment message is answered here and returns.</p>
   */
  private async dispatchIfCurrent(
    type: string,
    field: string,
    view: PaymentCardView,
    fields: PaymentFields,
  ): Promise<void> {
    if (!this.stillShowing(view)) {
      return;
    }
    await this.dispatch(type, field.split('|'), view, fields);
  }

  /**
   * Whether the card that asked is still the card on screen.
   *
   * <p>One predicate, checked at both of this class's await boundaries — the record read above and
   * the confirmation in `grant` below. Identity is enough and is the cheapest correct test: the panel
   * builds fresh options for every render, so a re-render can never produce the same object.</p>
   */
  private stillShowing(view: PaymentCardView): boolean {
    return this.deps.view() === view;
  }

  /**
   * One arm per message, as a table rather than a chain.
   *
   * <p>A five-branch `if` would need an `eslint-disable` for complexity, and the rule in this
   * repository is extract rather than suppress. The table also makes the set of messages this half
   * owns readable in one place, beside the list that decides whether a message is ours at all.</p>
   */
  private async dispatch(
    type: string,
    parts: readonly string[],
    view: PaymentCardView,
    fields: PaymentFields,
  ): Promise<void> {
    const key = parts[0] ?? '';
    const arms: Record<string, () => Promise<void> | void> = {
      payment: () => this.deps.post(this.valuesMessage(view, fields)),
      reveal: () => this.reveal(key, view, fields),
      reassemble: () => this.reassemble(key, parts[1] ?? '', view, fields),
      copyReading: () => this.copyReading(key, parts[1] ?? '', parts[2] ?? '', view, fields),
      paymentClose: () => this.release(key),
    };
    await arms[type]?.();
  }

  /** What the card is filled with on load — never a gated field, never a woven one. */
  private valuesMessage(view: PaymentCardView, fields: PaymentFields): unknown {
    return { type: 'paymentValues', entityId: view.entityId, values: plainValues(fields, view.form) };
  }

  /** One gated value, once. A declined question posts nothing at all — not an empty value, nothing. */
  private async reveal(key: string, view: PaymentCardView, fields: PaymentFields): Promise<void> {
    if (!view.present.includes(key as PaymentFieldKey) || !(await this.grant(key, view))) {
      return;
    }
    const value = revealValue(fields, view.form, key);
    if (value !== undefined) {
      this.deps.post({ type: 'paymentValues', entityId: view.entityId, values: { [key]: value } });
    }
  }

  /**
   * A woven field rebuilt — or an honest refusal.
   *
   * <p>A record can hold a woven value of an odd length (nothing this build writes, and exactly the
   * shape an interrupted or foreign write leaves). `readingFor` answers `undefined` rather than
   * throwing, and the card says so in the row's own note instead of sitting empty for ever.</p>
   */
  private async reassemble(
    key: string,
    code: string,
    view: PaymentCardView,
    fields: PaymentFields,
  ): Promise<void> {
    if (!view.woven.includes(key as PaymentFieldKey) || !(await this.grant(key, view))) {
      return;
    }
    const reading = readingFor(fields, view.form, key, code);
    if (reading === undefined) {
      this.deps.post({ type: 'paymentReading', entityId: view.entityId, key, ok: false, why: UNREADABLE });
      return;
    }
    this.postReading(key, this.readingMessage(key, code, view, reading));
  }

  /**
   * Post a reading, and hold nothing if it did not arrive.
   *
   * <p>The buffers are installed before the message goes out — they are what it is built from — so a
   * `postMessage` that throws (a webview disposed a moment ago is the ordinary way) would leave an
   * assembled phrase held with nothing on screen to close it. Found by the code review, and it is the
   * one path out of `readingMessage` that did not lead to the same place as the others.</p>
   */
  private postReading(key: string, message: unknown): void {
    try {
      this.deps.post(message);
    } catch (error) {
      this.release(key);
      throw error;
    }
  }

  /**
   * The answer, and the buffers it is read out of.
   *
   * <p>The words live in bytes we allocated and can zero rather than in strings we cannot — measure
   * 5.4, and it is worth being exact about what that buys: fewer copies WE control, not "one copy in
   * memory", which is false and unverifiable. The previous reading for this field is released first,
   * so trying twelve methods holds one pair of buffers rather than twelve.</p>
   */
  private readingMessage(
    key: string,
    code: string,
    view: PaymentCardView,
    reading: Reassembled,
  ): unknown {
    const words = key === 'mixed';
    const buffers = [PhraseBuffer.of(reading.real), PhraseBuffer.of(reading.decoy)];
    this.release(key);
    this.held.set(key, buffers);
    return {
      type: 'paymentReading',
      entityId: view.entityId,
      key,
      // The method this reading is FOR. Two clicks in quick succession are two record reads, and
      // their answers can arrive in the other order — the page would then show the first method's
      // rows under a picker naming the second, and a copy would recompute something else again. The
      // page drops an answer whose method is no longer the one on screen. (Code review.)
      code,
      ok: true,
      words,
      first: buffers[0].words(),
      second: buffers[1].words(),
      visibleMs: words ? PHRASE_VISIBLE_MS : 0,
    };
  }

  /**
   * Copy one of the two rows — rebuilt here, never taken from the page.
   *
   * <p>`pay_<key>` reads what is STORED, and for a woven field that is the value woven with its
   * decoy: copying it from a row showing rebuilt digits would hand somebody the one thing on screen
   * they did not ask for. So the row's button sends what it is showing and the host rebuilds it.</p>
   */
  private async copyReading(
    key: string,
    which: string,
    code: string,
    view: PaymentCardView,
    fields: PaymentFields,
  ): Promise<void> {
    if (!view.woven.includes(key as PaymentFieldKey) || !(await this.grant(key, view))) {
      return;
    }
    const reading = readingFor(fields, view.form, key, code);
    if (reading !== undefined) {
      await this.deps.copy(copyTextFor(reading, which, key));
      // The same acknowledgement every other Copy in this viewer gets. Without it the one button
      // whose value cannot be seen in a box is also the one that never says it worked.
      this.deps.post({ type: 'copied', entityId: view.entityId, field: `${key}|${which}` });
    }
  }

  /**
   * Whether a per-field Copy may proceed — the same question the Show button asks.
   *
   * <p>Copying is showing, to the clipboard. A CVV that asked before appearing and not before being
   * copied would be a rung with a door beside it.</p>
   */
  async allowCopy(field: string): Promise<boolean> {
    const view = this.deps.view();
    if (view === undefined || !field.startsWith('pay_')) {
      return true;
    }
    return this.grant(field.slice('pay_'.length), view);
  }

  /** Asked once per field while this card is on screen; never again, and never for ever. */
  private async grant(key: string, view: PaymentCardView): Promise<boolean> {
    if (!gated(key) || this.grants.has(key)) {
      return true;
    }
    return this.take(key, view, await this.deps.confirm(promptFor(key, view), 'Show'));
  }

  /**
   * The answer, and the second await boundary.
   *
   * <p>A modal is the longest pause this class has, and the panel is the shared preview tab: the card
   * can be re-rendered for another entry while the question stands. An answer given about the entry
   * that was on screen is not an answer about the one that is — so a grant that arrives late is
   * refused, and not remembered either.</p>
   */
  private take(key: string, view: PaymentCardView, granted: boolean): boolean {
    if (!granted || !this.stillShowing(view)) {
      return false;
    }
    this.grants.add(key);
    return true;
  }

  /**
   * How many fields are still held in buffers — what a test asserts after a close.
   *
   * <p>Here for the same reason `PhraseBuffer.cleared` is: a measure whose effect nothing can observe
   * is a measure nobody can prove still works, and this one has three ways out (a timer, a close, a
   * dispose) that must all lead to the same place.</p>
   */
  get holding(): number {
    return this.held.size;
  }

  /** Zero what we hold for one field. Idempotent, because a card can be closed twice. */
  private release(key: string): void {
    (this.held.get(key) ?? []).forEach((buffer) => buffer.clear());
    this.held.delete(key);
  }

  /**
   * The card is gone, or is about to show a different entry.
   *
   * <p>Both halves matter and for different reasons: the buffers because an assembled phrase must
   * not outlive the view it was assembled for, and the grants because a question answered about one
   * entry is not an answer about the next one the preview tab happens to show.</p>
   */
  reset(): void {
    [...this.held.keys()].forEach((key) => this.release(key));
    this.grants.clear();
  }
}

/** What a refusal says: what happened, and that nothing was lost by it. */
const UNREADABLE =
  'This value cannot be rebuilt: what is stored is not a whole woven pair. Nothing has been '
  + 'changed — the record is exactly as it was.';

/** The question, in the words `revealGate` chose for each of the two cases. */
function promptFor(key: string, view: PaymentCardView): string {
  return key === 'mixed'
    ? phraseRevealPrompt(view.wordCount)
    : revealPrompt(PAYMENT_FIELD_LABELS[key as PaymentFieldKey] ?? key);
}
