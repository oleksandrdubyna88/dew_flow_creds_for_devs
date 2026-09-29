import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityFormOptions, EntityFormValues } from '../entityFormShape';
import type { EntityViewOptions } from '../entityViewPage';
import { PaymentFields, parsePaymentFields } from '../paymentFields';
import { parseSecondValues } from '../secondValues';
import { readSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { ACCOUNT, PIN, Sinks, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';
import { loadEachWithVscode } from './vscodeStub';

/**
 * The owner's flow, end to end (entry-PIN plan §11; catalogued in `research/module_tests.md`):
 * *protect a card → view → edit the name → view → Remove PIN → view*, over the REAL `StorageManager`
 * with real wraps, through the commands a person runs — asserting the whole card at every step.
 *
 * <p>Each defect this plan fixed was a cell of this one walk: View after Protect showed only the name
 * (D1), Edit deleted the card and took the mark off (D2, D3), and Remove PIN could lose a woven flag or
 * clear the mark over a value it could not open (D13, D14). A unit test per cell proved the cell; this
 * proves the walk the owner actually took, in the order he took it.</p>
 */

const CARD: PaymentFields = { number: '4111111111111111', cvv: '123', pin: '4321' };
const SECOND = { cvv2: '999' };
const ENTRY = 'p1';

interface World {
  readonly storage: StorageManager;
  readonly s: Sinks;
  readonly shown: EntityViewOptions[];
  readonly pin: typeof import('../pinCommands');
  readonly viewer: typeof import('../entityViewerCommands');
  readonly edit: typeof import('../entityEditCommands');
  rename: string;
  node(): TreeNode;
}

async function world(): Promise<World> {
  const s = sinks();
  // Every box answered with the PIN: Protect's two, and whatever door asks after them.
  const stub = clickVscode(Array.from({ length: 12 }, () => PIN), s);
  const storage = memoryStorage(stub);
  const details = { id: ENTRY, name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card' } as EntityMetadata;
  await seedEntry(storage, details, { 'payment details': JSON.stringify(CARD), 'second values': JSON.stringify(SECOND), notes: 'the card for the payouts' });
  const shown: EntityViewOptions[] = [];
  const self = { storage, s, shown, rename: '', node: () => storage.getNode(ACCOUNT, ENTRY) as TreeNode } as World;
  const [pin, viewer, edit] = loadEachWithVscode(['../pinCommands', '../entityViewerCommands', '../entityEditCommands'], stub, {
    './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
    './entityFormPanel': { showEntityForm: (options: EntityFormOptions) => Promise.resolve(renamed(options, self.rename)) },
  }) as never[];
  Object.assign(self, { pin, viewer, edit });
  (require('../pinSession') as typeof import('../pinSession')).forgetAllPins();
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  return self;
}

/** The form's answer for a person who changed only the name — everything else exactly as given. */
function renamed(options: EntityFormOptions, name: string): EntityFormValues {
  const { pinProtected: _dropped, ...rebuilt } = options.initial as EntityMetadata;
  return {
    details: { ...rebuilt, name, hasTotp: options.hasStoredTotp || undefined } as EntityMetadata,
    clearPassword: false,
    newSecond: options.storedSecond,
    newPayment: options.initialPayment,
    newNotes: options.initialNotes,
    clearPrivateKey: false,
    clearVpnConfig: false,
    clearDbConnection: false,
    clearAttachment: false,
    clearImage: false,
    clearTotp: false,
    clearHostKey: false,
    dependsOnColors: [],
  };
}

const deps = (w: World): { storage: StorageManager; accountId: string; refresh: () => void } => ({ storage: w.storage, accountId: ACCOUNT, refresh: () => undefined });

/** View the entry, and assert the WHOLE card is on the page — the frame, every field, the second value. */
async function viewShowsTheCard(w: World, step: string): Promise<void> {
  const before = w.shown.length;
  await w.viewer.openEntityViewer(ACCOUNT, w.node(), w.storage, { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false } as never);
  assert.equal(w.shown.length, before + 1, `${step}: the viewer did not open`);
  const page = w.shown[w.shown.length - 1];
  assert.ok(page.payment !== undefined, `${step}: the card frame was dropped — the page shows only the name and the dates`);
  assert.deepEqual([...page.payment.present].sort(), ['cvv', 'number', 'pin'], `${step}: not every card field is drawn`);
  assert.deepEqual(await page.resolvePayment?.(), CARD, `${step}: the card's values`);
  assert.deepEqual(await page.resolveSecond?.(), SECOND, `${step}: the second value`);
  assert.equal(page.notes, 'the card for the payouts', `${step}: the note`);
}

async function sealedState(w: World): Promise<boolean[]> {
  const raw = [await w.storage.getPaymentRaw(ACCOUNT, ENTRY), await w.storage.getSecondRaw(ACCOUNT, ENTRY), await w.storage.getNotes(ACCOUNT, ENTRY)];
  return raw.map((value) => readSecret(value).kind === 'locked');
}

test('protect a card → view → edit the name → view → Remove PIN → view: the whole card, at every step', async () => {
  const w = await world();
  await viewShowsTheCard(w, 'before any PIN');

  await w.pin.protectEntry(w.node(), deps(w));
  assert.deepEqual(await sealedState(w), [true, true, true], 'Protect sealed the card, its second values and its note');
  assert.equal(w.node().details?.pinProtected, true);
  await viewShowsTheCard(w, 'after Protect (the reported bug)');

  w.rename = 'orest payoneer (payouts)';
  await w.edit.editNode(ACCOUNT, w.node(), w.storage, () => undefined);
  assert.equal(w.node().name, 'orest payoneer (payouts)', 'the edit happened');
  assert.deepEqual(await sealedState(w), [true, true, true], 'the edit kept every value sealed (D2, D4)');
  assert.equal(w.node().details?.pinProtected, true, 'the edit kept the mark (D3)');
  assert.deepEqual(parsePaymentFields(await w.storage.getPaymentRaw(ACCOUNT, ENTRY)), {}, 'precondition: a sealed record parses as nothing without the door');
  await viewShowsTheCard(w, 'after editing the name');

  await w.pin.unprotectEntry(w.node(), deps(w));
  assert.deepEqual(await sealedState(w), [false, false, false], 'Remove PIN unwrapped every value');
  assert.equal(w.node().details?.pinProtected, undefined);
  assert.deepEqual(parsePaymentFields(await w.storage.getPaymentRaw(ACCOUNT, ENTRY)), CARD);
  assert.deepEqual(parseSecondValues(await w.storage.getSecondRaw(ACCOUNT, ENTRY)), SECOND);
  const boxes = w.s.boxes;
  await viewShowsTheCard(w, 'after Remove PIN');
  assert.equal(w.s.boxes, boxes, 'an unprotected card opens without a question');
  assert.deepEqual(w.s.errors, []);
});
