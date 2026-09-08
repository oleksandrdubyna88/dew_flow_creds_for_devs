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

interface World {
  chooseSharePin(): Promise<SharePin | undefined>;
  box(): FakeInputBox;
  clipboard: { text: string; failWith?: string };
  /** Answers handed to the repeat box, in order. */
  repeats: (string | undefined)[];
  /** Every `showInputBox` raised — the repeat prompts. */
  repeatsAsked: number;
  errors: string[];
}

function world(): World {
  const boxes: FakeInputBox[] = [];
  const clipboard: { text: string; failWith?: string } = { text: '' };
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
        writeText: (value: string): Promise<void> => {
          if (clipboard.failWith !== undefined) {
            return Promise.reject(new Error(clipboard.failWith));
          }
          clipboard.text = value;
          return Promise.resolve();
        },
      },
    },
    ThemeIcon: class {
      constructor(public readonly id: string) {}
    },
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
  };
  const mod = loadWithVscode<typeof import('../sharePinPrompt')>('../sharePinPrompt', stub);
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
