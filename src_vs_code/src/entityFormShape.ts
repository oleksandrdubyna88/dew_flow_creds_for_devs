import { EntityKind, EntityMetadata } from './types';
import { SecondValues } from './secondValues';
import { EntityFields } from './entityFields';
import { PaymentFields } from './paymentFields';
import { AgentDoors } from './agentDoors';
import { DependencyFolderCandidate } from './depGraph';

/**
 * What the entity form is GIVEN and what it answers with — two interfaces and nothing else.
 *
 * <p>Out of `entityFormPanel.ts` for the reason `secretKeys.ts` and `stateKeys.ts` came out of
 * `storageManager.ts`: that file was at the 800-line ceiling, so a feature could not add a field to
 * a shape it declares. These are the obvious tenants — pure type declarations that read nothing, run
 * nothing and are imported by the page, the script and half the tests.</p>
 *
 * <p>`entityFormPanel.ts` re-exports them, so every existing import keeps working and there is one
 * place to import from rather than two answers to "where does EntityFormOptions live".</p>
 *
 * <p>Pure: no `vscode`.</p>
 */

export interface KeyCandidate {
  id: string;
  name: string;
}

export interface EntityFormOptions {
  mode: 'create' | 'edit';
  /** The text-zoom offset (T28), from `credSshManager.uiScale`. */
  uiScale?: number;
  /** The stored image as a data: URI (T27) — shown as a preview beside its metadata. */
  imageDataUri?: string;
  /** The other ways an agent can reach this entry, for the MCP section's footer (T24b). */
  agentDoors?: AgentDoors;
  /** The tree element the footer's commands act on — the same argument the context menu passes. */
  entityTarget?: unknown;
  entityId: string;
  initial?: EntityMetadata;
  hasStoredPassword: boolean;
  /**
   * Whether a SECOND password is stored (#52) — the fact, never the value.
   *
   * <p>It decides one thing: whether the form offers to CLEAR it. An empty box means keep what is
   * stored, so deleting has to be something a person says, and there is nothing to say it about
   * when nothing is held.</p>
   */
  hasStoredSecondPassword?: boolean;
  /**
   * The second values the entry holds NOW, so an untouched box can keep them.
   *
   * <p>The one place a stored secret reaches this shape, and it never reaches the PAGE: the save
   * needs to know what is held in order to leave it alone, and the markup is emitted without it.
   * `secondRecordFor` is what reads this.</p>
   */
  storedSecond?: SecondValues;
  hasStoredPrivateKey: boolean;
  hasStoredAttachment: boolean;
  hasStoredImage: boolean;
  /** Shown read-only, so an editor can see how old the thing they are changing is. */
  createdAt?: number;
  updatedAt?: number;
  hasStoredVpnConfig: boolean;
  hasStoredDbConnection: boolean;
  initialDbConnection?: string;
  /** Prefilled note (its own secret now, not plaintext metadata). */
  initialNotes?: string;
  /** A credential's login and URL, prefilled like the notes. */
  initialFields?: EntityFields;
  /**
   * Prefilled config body — a secret, and one of the two the form deliberately sends INTO the
   * webview.
   *
   * <p>The empty-means-keep rule the password and the private key follow cannot apply here: a
   * config is a document somebody opens Edit to change one line of, and a form that showed it
   * blank would make every edit a retype from memory. The DB connection string is prefilled for
   * exactly this reason and is the precedent. Deleting the text and saving therefore CLEARS the
   * body, which is what an empty document should mean.</p>
   */
  initialConfigBody?: string;
  /**
   * The stored payment record, handed to the WEBVIEW by message — never rendered into the page.
   *
   * <p>Every other kind's stored value is written into the markup (a db connection string, a config
   * body). For a CVV and a PIN that is one place too many: the HTML is a string that gets built,
   * concatenated and — the moment anything goes wrong — logged. The webview asks for these once it is
   * listening, and they go straight into the inputs.</p>
   */
  initialPayment?: PaymentFields;
  /** A TOTP seed is stored. The seed is never sent to the form — only this fact and… */
  hasStoredTotp: boolean;
  /** …how it is configured (`GitHub · 6 digits · SHA1 · every 30 s`), so it can be compared with the app. */
  storedTotpDescription?: string;
  /** Set when the parent folder dictates the entity kind (selector locked). */
  lockedKind?: EntityKind;
  /** The kind the form OPENS on when no folder locks it (issue #57) — a suggestion: selector alive, no folder hint; `lockedKind` outranks it. Why: `dialogs.pickEntityKind`. */
  initialKind?: EntityKind;
  /** Other entities of the same account usable as a key source. */
  keyCandidates: KeyCandidate[];
  /** Other SSH entities of the same account usable as a jump host (audit D7). */
  jumpCandidates: KeyCandidate[];
  /** A host key is pinned for this entity, and this is its fingerprint (audit B10). */
  hasStoredHostKey: boolean;
  hostKeyFingerprint?: string;
  /**
   * This account's folders with the entities they hold, self excluded — the "pick a folder,
   * then an entity" cascade behind the Depends-on rows.
   *
   * <p>Empty when authoring an entity for somebody else, the same call `jumpCandidates` already
   * makes and for the same reason: an id addressing THIS vault means nothing in theirs.</p>
   */
  dependencyFolders: DependencyFolderCandidate[];
  /**
   * Target entity id -> the colour it already wears, for targets something currently depends
   * on. Two jobs at once: pre-select the swatch when the person picks a target that is already
   * in a relationship, and tell the auto-pick which colours are taken.
   */
  dependencyColors: Record<string, string>;
}

export interface EntityFormValues {
  details: EntityMetadata;
  newPassword?: string;
  clearPassword: boolean;
  /** The second-values record to store (#52). An empty record DELETES the key. */
  newSecond?: SecondValues;
  /** Why a password the form was told to weave was stored plain instead, or `''`. */
  wovenRefusal?: string;
  newPrivateKey?: string;
  clearPrivateKey: boolean;
  newVpnConfig?: string;
  clearVpnConfig: boolean;
  newDbConnection?: string;
  clearDbConnection: boolean;
  newNotes?: string;
  /** A credential's login/URL; `undefined` for every other kind, which DELETES — the same scrubbing a config gets. */
  newFields?: EntityFields;
  /**
   * The config body as the form last held it — sent whole, not as a delta.
   *
   * <p>Unlike `newPassword`, an empty string here is a REAL value meaning "the document is now
   * empty", because the form was prefilled with whatever was stored. `undefined` is what says
   * this entity is not a config at all.</p>
   */
  newConfigBody?: string;
  /**
   * The whole payment record, or `undefined` for a kind that is not one.
   *
   * <p>One field for all three forms, because storage holds one JSON record under one key — the
   * decision `entityFields.ts` already made for a credential's login and URL, and the reason a
   * payment did not have to go through all nine secret seams a tenth time.</p>
   */
  newPayment?: PaymentFields;
  newAttachment?: string;
  clearAttachment: boolean;
  newImage?: string;
  clearImage: boolean;
  /** The CANONICAL `otpauth://` URI — already parsed and normalised, ready to store. */
  newTotp?: string;
  clearTotp: boolean;
  /** True when the person asked to forget the pinned host key (audit B10). */
  clearHostKey: boolean;
  /**
   * Colour picks for the entities this one now depends ON — a SECOND entity's field in each
   * case, which is why they are a sibling of `details` rather than something inside it.
   *
   * <p>The colour belongs to the target, and that is the whole mechanism behind "change it once
   * and every dependent follows": there is no copy on this record to keep in step. The caller
   * applies these onto those other entities.</p>
   */
  dependsOnColors: { targetId: string; color: string }[];
}
