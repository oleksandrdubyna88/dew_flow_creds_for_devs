/**
 * Everything the entity form's page can say to its host.
 *
 * <p>Its own module because `entityFormPanel.ts` sits at the repository's 800-line ceiling: a form
 * that learns to send one more message could not otherwise have said so anywhere. A pure type with
 * no imports is the cheapest thing that file can shed, and the one with the fewest consequences —
 * `entityFormPanel` re-exports it, so every existing importer is untouched.</p>
 *
 * <p>Fields are optional and documented by the message that uses them: this is ONE shape crossing
 * `postMessage` for a dozen different questions, and a union per question would be a dozen guards
 * at a boundary that already checks `type`.</p>
 */
export interface FormMessage {
  type:
    | 'save'
    | 'cancel'
    | 'zoom'
    | 'command'
    | 'splitCommand'
    | 'highlight'
    | 'generate'
    | 'configFields'
    | 'configFieldEdit'
    | 'qrImage'
    | 'cardValues'
    | 'cardTyped'
    | 'paymentFormChanged'
    | 'weaveExample'
    | 'splitAddress'
    | 'addressChanged';
  /** `paymentFormChanged` only: the form now chosen, so the host can say what it would delete. */
  form?: string;
  /** `weaveExample` only: which weavable field, and under which of the twelve methods. */
  field?: string;
  code?: string;
  /** `cardTyped` only: the number as typed so far, for the mark and the checksum hint. */
  number?: string;
  /** `cardTyped` only: how many DIGITS stand before the caret, so grouping can put it back. */
  caretDigits?: number;
  /** `qrImage` only: the pasted picture as grey pixels, base64, and its size. */
  gray?: string;
  width?: number;
  height?: number;
  /** `configFieldEdit` only: which row was changed, and to what. */
  path?: string;
  value?: string;
  /** `highlight` only (T17): which overlay asked, echoed back with the answer. */
  hlTarget?: string;
  /** `command` only (T24b): a footer link asking the host to run a command on this entry. */
  command?: string;
  /** `zoom` only (T28): which way the press went. */
  zoomDelta?: number;
  /** `generate` only: which kind of secret to draw. */
  kind?: 'password' | 'passphrase' | 'key';
  /** `generate` only: the options the page's controls chose (T14). Absent = the defaults. */
  genLength?: number; genLower?: boolean; genUpper?: boolean; genDigits?: boolean;
  genSymbols?: boolean; genKeyType?: string; genWords?: number;
  data?: Record<string, unknown>;
  text?: string;
  lang?: string;
}