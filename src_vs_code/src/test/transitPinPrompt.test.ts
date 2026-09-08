import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharePin } from '../sharePin';
import { loadWithVscode } from './vscodeStub';

/**
 * The share-PIN box, driven the way a person drives it.
 *
 * <p>This is the first `createInputBox` in the extension, and it buys a button at the price of
 * every convenience `showInputBox` gave away for free: the widget's validation message is
 * decoration, the field stays editable after the extension writes into it, and nothing resolves
 * anything unless this module does it. Each of those is a defect waiting to be shipped, so each
 * one is a test here.</p>
 */

interface Button { readonly tooltip?: string }

/** The `InputBox` VS Code would have given us, with the handles a test needs to press. */
class FakeInputBox {
  password = false;
  title: string | undefined;
  prompt: string | undefined;
  ignoreFocusOut = false;
  buttons: readonly Button[] = [];
  validationMessage: unknown = undefined;
  shown = 0;
  disposed = 0;

  private readonly accepts: (() => void)[] = [];
  private readonly hides: (() => void)[] = [];
  private readonly changes: ((value: string) => void)[] = [];
  private readonly presses: ((button: Button) => void)[] = [];
  private current = '';

  /**
   * A setter, because VS Code raises `onDidChangeValue` for a PROGRAMMATIC assignment too, not
   * only for a keystroke. A fake that stayed silent there would hide the interaction between the
   * generator writing into the box and the box's own change handler.
   */
  get value(): string {
    return this.current;
  }

  set value(next: string) {
    this.current = next;
    this.changes.forEach((cb) => cb(next));
  }

  onDidAccept(cb: () => void): { dispose(): void } {
    this.accepts.push(cb);
    return { dispose(): void {} };
  }

  onDidHide(cb: () => void): { dispose(): void } {
    this.hides.push(cb);
    return { dispose(): void {} };
  }

  onDidChangeValue(cb: (value: string) => void): { dispose(): void } {
    this.changes.push(cb);
    return { dispose(): void {} };
  }

  onDidTriggerButton(cb: (button: Button) => void): { dispose(): void } {
    this.presses.push(cb);
    return { dispose(): void {} };
  }

  show(): void {
    this.shown += 1;
  }

  hide(): void {
    this.hides.forEach((cb) => cb());
  }

  dispose(): void {
    this.disposed += 1;
  }

  // --- what a person does ---

  /** Type, replacing what is there. */
  type(value: string): void {
    this.value = value;
  }

  press(tooltipFragment: string): void {
    const button = this.buttons.find((b) => (b.tooltip ?? '').includes(tooltipFragment));
    assert.ok(button !== undefined, `no button whose tooltip mentions "${tooltipFragment}"`);
    this.presses.forEach((cb) => cb(button));
  }

  accept(): void {
    this.accepts.forEach((cb) => cb());
  }

  escape(): void {
    this.hide();
  }
}

/**
 * The clipboard VS Code would have given us, with the two handles the race tests need: `gate` holds
 * a write open so a cancellation can happen WHILE the OS is taking the copy, and `failNextWrite`
 * fails exactly one write, which is how a redraw can fail without disabling the wipe that has to
 * clean up after it.
 */
interface FakeClipboard {
  text: string;
  failWith?: string;
  gate?: Promise<void>;
  failNextWrite?: boolean;
}

interface World {
  chooseSharePin(): Promise<SharePin | undefined>;
  box(): FakeInputBox;
  clipboard: FakeClipboard;
  /** Answers handed to the repeat box, in order. */
  repeats: (string | undefined)[];
  /** Every `showInputBox` raised — the repeat prompts. */
  repeatsAsked: number;
  errors: string[];
}

function world(): World {
  const boxes: FakeInputBox[] = [];
  const clipboard: FakeClipboard = { text: '' };
  const state = {
    repeats: [] as (string | undefined)[],
    repeatsAsked: 0,
    errors: [] as string[],
  };
  const stub = {
    window: {
      createInputBox: (): FakeInputBox => {
        const box = new FakeInputBox();
        boxes.push(box);
        return box;
      },
      showInputBox: (): Promise<string | undefined> => {
        state.repeatsAsked += 1;
        return Promise.resolve(state.repeats.shift());
      },
      showErrorMessage: (message: string): Promise<undefined> => {
        state.errors.push(message);
        return Promise.resolve(undefined);
      },
    },
    env: {
      clipboard: {
        readText: (): Promise<string> => Promise.resolve(clipboard.text),
        writeText: async (value: string): Promise<void> => {
          if (clipboard.gate !== undefined) {
            await clipboard.gate;
          }
          if (clipboard.failNextWrite === true) {
            clipboard.failNextWrite = false;
            throw new Error('this one write fails');
          }
          if (clipboard.failWith !== undefined) {
            throw new Error(clipboard.failWith);
          }
          clipboard.text = value;
        },
      },
    },
    ThemeIcon: class {
      constructor(public readonly id: string) {}
    },
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
  };
  const mod = loadWithVscode<typeof import('../transitPinPrompt')>('../transitPinPrompt', stub);
  return {
    chooseSharePin: mod.chooseSharePin,
    box: (): FakeInputBox => {
      assert.ok(boxes.length > 0, 'no input box was created');
      return boxes[boxes.length - 1];
    },
    clipboard,
    get repeats(): (string | undefined)[] {
      return state.repeats;
    },
    set repeats(values: (string | undefined)[]) {
      state.repeats = values;
    },
    get repeatsAsked(): number {
      return state.repeatsAsked;
    },
    get errors(): string[] {
      return state.errors;
    },
  } as World;
}

/** Let the module's own awaits run. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Several turns, for the paths that chain a copy, a read and a wipe behind one another. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await settle();
  }
}

const GOOD = 'a-good-share-pin';

test('the box says what it always said, and is masked', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  assert.equal(box.title, 'One-time share PIN');
  assert.ok((box.prompt ?? '').includes('out-of-band'), box.prompt);
  assert.equal(box.password, true, 'a PIN box is masked');
  assert.equal(box.ignoreFocusOut, true);
  assert.equal(box.shown, 1);

  box.escape();
  assert.equal(await done, undefined);
});

test('pressing generate copies the PIN, and the value it resolves IS the value it copied', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  box.press('Generate');
  await settle();

  assert.notEqual(w.clipboard.text, '', 'nothing reached the clipboard');
  assert.equal(box.value, w.clipboard.text, 'the box and the clipboard must not diverge');

  box.accept();
  const pin = await done;
  assert.equal(pin?.generated, true);
  assert.equal(
    pin?.value,
    w.clipboard.text,
    'the recipient pastes the clipboard — sealing anything else cannot be opened',
  );
});

test('a generated PIN is not asked for twice', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  box.press('Generate');
  await settle();
  box.accept();

  await done;
  assert.equal(w.repeatsAsked, 0, 'there is nothing to mistype in a value nobody typed');
});

test('a typed PIN is still asked for twice, and a mismatch cancels the share', async () => {
  const w = world();
  w.repeats = ['a-different-pin'];
  const done = w.chooseSharePin();
  const box = w.box();

  box.type(GOOD);
  box.accept();

  assert.equal(await done, undefined, 'a mismatch must seal nothing');
  assert.equal(w.repeatsAsked, 1);
  assert.equal(w.errors.length, 1, 'the person is told why nothing was shared');
});

test('a typed PIN typed twice is what gets sealed', async () => {
  const w = world();
  w.repeats = [GOOD];
  const done = w.chooseSharePin();
  const box = w.box();

  box.type(GOOD);
  box.accept();

  const pin = await done;
  assert.equal(pin?.value, GOOD);
  assert.equal(pin?.generated, false);
});

/**
 * RED FIRST. `showInputBox`'s `validateInput` blocks Enter for free; `InputBox.validationMessage`
 * promises nothing of the kind, so a straight port silently removes the PIN strength floor from
 * the one box where `pinPolicy` says the PIN is the entire secret.
 */
test('Enter on a PIN the policy refuses seals nothing and leaves the box open', async () => {
  const w = world();
  let settled: SharePin | undefined | 'pending' = 'pending';
  const done = w.chooseSharePin().then((r) => {
    settled = r;
    return r;
  });
  const box = w.box();

  box.type('1234');
  box.accept();
  await settle();

  assert.equal(settled, 'pending', 'a refused PIN must not seal a share');
  assert.equal(box.disposed, 0, 'the person keeps the box to fix the PIN in');
  assert.ok(box.validationMessage !== undefined, 'and is told why');

  box.escape();
  assert.equal(await done, undefined);
});

/**
 * RED FIRST, and the defect three reviewers found in the plan independently: the box stays
 * editable after generate, and it is MASKED, so a value that drifts from the copied one drifts
 * invisibly. Sealing PIN B while the clipboard holds PIN A fails at the recipient, silently.
 */
test('generating and then editing yields a TYPED pin, confirmation and all', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  box.press('Generate');
  await settle();
  const copied = w.clipboard.text;

  // Seeded only now: the drawn value is random, so what the repeat box must be answered with is
  // not knowable until the draw has happened.
  const edited = `${copied}-x`;
  w.repeats = [edited];
  box.type(edited);
  box.accept();

  const pin = await done;
  assert.equal(pin?.generated, false, 'an edited value is a typed value, whatever drew it first');
  assert.equal(w.repeatsAsked, 1, 'and a typed value is confirmed');
  assert.equal(pin?.value, edited);
  assert.notEqual(pin?.value, copied, 'what is sealed is what is in the box, not what was drawn');
});

test('a clipboard that rejects is reported, not hidden', async () => {
  const w = world();
  w.clipboard.failWith = 'no clipboard provider';
  const done = w.chooseSharePin();
  const box = w.box();

  box.press('Generate');
  await settle();

  assert.notEqual(box.value, '', 'the drawn PIN is not thrown away because copying failed');
  const said = JSON.stringify(w.box().validationMessage ?? '');
  assert.ok(/copy/i.test(said), `the failure must be said out loud, got: ${said}`);
  assert.ok(!said.includes(box.value), 'and saying it must not print the PIN');

  box.escape();
  assert.equal(await done, undefined);
});

test('the eye button unmasks and re-masks without touching the value', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  box.press('Generate');
  await settle();
  const drawn = box.value;

  box.press('Show');
  assert.equal(box.password, false, 'the person must be able to read what they are about to send');
  assert.equal(box.value, drawn);

  box.press('Show');
  assert.equal(box.password, true, 'and put it back');
  assert.equal(box.value, drawn);

  box.escape();
  assert.equal(await done, undefined);
});

test('escape resolves nothing and disposes the box', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();

  box.escape();

  assert.equal(await done, undefined);
  assert.equal(box.disposed, 1, 'a box nobody disposes is a leak per prompt');
});

/**
 * RED FIRST — the reported symptom. The generator shipped behind a button VS Code renders as a
 * dimmed glyph in the box's TITLE row, and the sentence under the field never mentioned it. The
 * operator opened the released build, photographed the box with both buttons in frame, and asked
 * where the feature was. So the draw stops being something to find.
 */
test('the box opens with a PIN already drawn and already copied', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();

  assert.notEqual(box.value, '', 'the box must not open empty any more');
  assert.equal(box.value, w.clipboard.text, 'drawn and copied are one act, or the promise is half-made');

  const said = JSON.stringify(box.validationMessage ?? '');
  assert.ok(/copied/i.test(said), `the person must be told it is on the clipboard, got: ${said}`);
  assert.ok(
    /type over it/i.test(said),
    `and that it is theirs to replace — that sentence IS the discoverability fix, got: ${said}`,
  );
  assert.ok(!said.includes(box.value), 'saying it must not print the PIN');

  box.escape();
  assert.equal(await done, undefined);
});

// A timeout, because the RED shape of this one is a HANG: with no pre-fill, Enter on an empty box
// is refused by the policy and the box simply stays open, so the promise never settles.
test('Enter on the drawn value seals the drawn value, and asks nothing twice', { timeout: 5_000 }, async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();

  const drawn = box.value;
  box.accept();

  const pin = await done;
  assert.equal(pin?.generated, true, 'an untouched draw is a generated PIN');
  assert.equal(pin?.value, drawn);
  assert.equal(w.repeatsAsked, 0, 'there is nothing to mistype in a value nobody typed');
});

/**
 * RED FIRST, and the silent one. Raised by the gate's codex reviewer against the plan: with a
 * pre-fill the extension copies on its OWN behalf, so a person who types over the drawn PIN and
 * accepts leaves the DRAWN value on the clipboard while the item is sealed with the TYPED one.
 * They paste A into the chat, the recipient is sent A, the item opens only with B, and nothing
 * anywhere reports an error. Every other failure in this box announces itself; this one does not.
 */
test('typing over the drawn PIN takes the typed path and takes the drawn value off the clipboard', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();

  const drawn = box.value;
  assert.equal(w.clipboard.text, drawn, 'precondition: the draw reached the clipboard');

  w.repeats = [GOOD];
  box.type(GOOD);
  box.accept();
  const pin = await done;
  await settle();

  assert.equal(pin?.generated, false, 'an edited value is a typed value, whatever drew it first');
  assert.equal(pin?.value, GOOD);
  assert.equal(w.repeatsAsked, 1, 'and a typed value is confirmed');
  assert.notEqual(
    w.clipboard.text,
    drawn,
    'the clipboard must not keep a PIN that seals nothing — the recipient would be sent it',
  );
});

test('escape takes back the copy nobody asked for', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();
  const drawn = box.value;

  box.escape();
  assert.equal(await done, undefined);
  await settle();

  assert.notEqual(w.clipboard.text, drawn, 'a share that never happened leaves no live secret behind');
});

/**
 * The other half of the wipe, and the reason it goes through `clearIfUnchanged` rather than a bare
 * write: what is on the clipboard at cancel time may be the person's own work, copied while the box
 * was open. Wiping that would destroy something this extension never created.
 */
test('a clipboard the person has since used for their own work is left alone', async () => {
  const w = world();
  const done = w.chooseSharePin();
  w.box();
  await settle();

  w.clipboard.text = 'something of their own';
  w.box().escape();
  assert.equal(await done, undefined);
  await settle();

  assert.equal(w.clipboard.text, 'something of their own', 'only what we wrote is ever wiped');
});

test('a cancelled repeat box takes the drawn value with it', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();
  const drawn = box.value;

  w.repeats = [undefined]; // the person escapes the confirmation
  box.type(GOOD);
  box.accept();

  assert.equal(await done, undefined, 'backing out of the repeat cancels the whole ask');
  await settle();
  assert.notEqual(w.clipboard.text, drawn, 'and cancelling by that route leaves no secret either');
});

/**
 * RED FIRST — the defect all three vendors found in story 1's code, from three different angles.
 * The draw is started with `void` and the box is shown immediately, so the clipboard write is in
 * flight while the box is already interactive. Escape during that window and the wipe runs BEFORE
 * the copy: `clearIfUnchanged` reads a clipboard that does not hold the PIN yet, declines to touch
 * it, and the copy then lands — a transit secret for a share that was cancelled, written by a box
 * that no longer exists.
 */
test('a draw still in flight when the box closes leaves nothing behind', async () => {
  const w = world();
  let takeTheCopy!: () => void;
  w.clipboard.gate = new Promise<void>((r) => {
    takeTheCopy = r;
  });

  const done = w.chooseSharePin();
  const box = w.box();
  assert.notEqual(box.value, '', 'the value is drawn synchronously — only the COPY is not');

  box.escape();
  assert.equal(await done, undefined);
  takeTheCopy(); // the OS finally accepts the write, for a box that is gone
  await flush();

  assert.equal(w.clipboard.text, '', 'a cancelled share may not leave its PIN on the clipboard');
});

/**
 * RED FIRST. A redraw replaces the value in the box before it knows whether the new one can be
 * copied. When that copy fails, the PREVIOUS drawn PIN is still sitting on the clipboard while the
 * box holds — and would seal with — the new one. Same silent shape as typing over the draw.
 */
test('a redraw whose copy fails takes the PIN it replaced off the clipboard', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();
  const first = w.clipboard.text;
  assert.notEqual(first, '', 'precondition: the opening draw reached the clipboard');

  w.clipboard.failNextWrite = true;
  box.press('Generate');
  await flush();

  assert.notEqual(box.value, first, 'precondition: a redraw actually happened');
  assert.equal(w.clipboard.text, '', 'the replaced PIN seals nothing now and must not be pasteable');

  box.escape();
  assert.equal(await done, undefined);
});

/**
 * RED FIRST. The wipe used to wait for the box to close, and a person does not: they type their own
 * PIN, alt-tab to the chat to tell the recipient, and come back to press Enter. Between those two
 * acts the clipboard still held the DRAWN value, so what they pasted was a PIN that opens nothing.
 */
test('typing over the draw takes it off the clipboard at once, not at Enter', async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();
  assert.notEqual(w.clipboard.text, '', 'precondition: the opening draw reached the clipboard');

  box.type(GOOD); // no accept yet — the person is still standing in the box
  await flush();

  assert.equal(w.clipboard.text, '', 'they may go and paste before they press Enter');

  w.repeats = [GOOD];
  box.accept();
  const pin = await done;
  assert.equal(pin?.value, GOOD);
  assert.equal(pin?.generated, false);
});

/** The trap on the other side: `accepted` hides the box, so "hidden" alone cannot mean "cancelled". */
test('accepting a generated PIN leaves the clipboard alone', { timeout: 5_000 }, async () => {
  const w = world();
  const done = w.chooseSharePin();
  const box = w.box();
  await settle();
  const drawn = box.value;

  box.accept();
  await done;
  await settle();

  assert.equal(
    w.clipboard.text,
    drawn,
    'this is the value the person is about to paste — wiping it breaks the feature',
  );
});
