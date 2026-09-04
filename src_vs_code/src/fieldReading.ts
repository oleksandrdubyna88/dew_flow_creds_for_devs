/**
 * What reading one field of an entry ANSWERS — three outcomes, not two.
 *
 * <p>A reviewer named the defect this exists for: every automatic path returned `string |
 * undefined`, so "there is nothing here" and "there is something here and you may not have it"
 * arrived as the same answer. Each caller then made up its own sentence, and the one that had not
 * been taught about woven passwords made up the wrong one — a `creds://` reference to a woven
 * password failed with <i>"X has no password stored — creds://… resolves to nothing"</i>, which is
 * false in both halves: it is stored, and the reference resolves to a value nobody may use.</p>
 *
 * <p>So the distinction lives in the TYPE, and a new consumer cannot fail to see it: reading a
 * withheld field hands you the reason it was withheld, and the compiler will not let you spend it
 * as a value. `absent` stays a separate case rather than a `withheld` with an empty reason, because
 * an entry with nothing in a field is not a refusal and must not read as one.</p>
 *
 * <p>Pure and `vscode`-free, so `secretRef.ts` — which is deliberately both — can speak it.</p>
 */
export type FieldReading =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'withheld'; readonly reason: string }
  | { readonly kind: 'absent' };

/** A stored value, or `absent` — an empty string is nothing, exactly as every caller already read it. */
export function readingOf(value: string | undefined): FieldReading {
  return value === undefined || value.length === 0 ? { kind: 'absent' } : { kind: 'value', value };
}

/** Withheld, with the sentence that says why. A reason is required: a silent refusal is the defect. */
export function withheld(reason: string): FieldReading {
  return { kind: 'withheld', reason };
}

/** The value, or nothing — for the callers that genuinely cannot act on the difference. */
export function valueOf(reading: FieldReading): string | undefined {
  return reading.kind === 'value' ? reading.value : undefined;
}
