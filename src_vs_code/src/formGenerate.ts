import {
  DEFAULT_PASSWORD,
  PASSWORD_LENGTH_CHOICES,
  SSH_KEY_TYPES,
  generateKeyPairOf,
  generatePassphrase,
  generatePassword,
  DEFAULT_PASSPHRASE,
} from './secretGenerator';
import { parseSshPrivateKey } from './sshKeyParse';

/**
 * What the form's Generate buttons produce, given the page's chosen options (T14).
 *
 * <p>Out of `entityFormPanel.ts` for the recurring pair of reasons: the panel crossed the
 * 800-line ceiling when the options landed, and the option handling — clamping an untrusted
 * length to the offered list, falling back from an unknown key-type id — is exactly the logic
 * that deserves a `vscode`-free test.</p>
 */

export interface GenerateRequest {
  kind?: 'password' | 'passphrase' | 'key';
  genLength?: number;
  genLower?: boolean;
  genUpper?: boolean;
  genDigits?: boolean;
  genSymbols?: boolean;
  genKeyType?: string;
}

/**
 * One generated secret, addressed at the field it belongs in.
 *
 * <p>This is the one direction a secret legitimately travels INTO a webview, and it is worth
 * saying why it does not break the rule the viewer keeps: the form is where a person types a
 * password, so its inputs already hold secret values by design. The read-only viewer is the
 * panel that must never receive one. A generated value goes into the same input the user would
 * otherwise have typed into, and leaves by the same Save.</p>
 */
export function draw(message: GenerateRequest): { target: string; value: string; note: string } {
  if (message.kind === 'passphrase') {
    const made = generatePassphrase(DEFAULT_PASSPHRASE);
    return { target: 'password', value: made.value, note: made.description };
  }
  return message.kind === 'key' ? drawKey(message) : drawPassword(message);
}

/** The page's select is untrusted input; an unknown id falls back rather than throwing. */
function drawKey(message: GenerateRequest): { target: string; value: string; note: string } {
  const type = SSH_KEY_TYPES.find((t) => t.id === message.genKeyType) ?? SSH_KEY_TYPES[0];
  const pair = generateKeyPairOf(type.id);
  const parsed = parseSshPrivateKey(pair.privateKey);
  return {
    target: 'privateKey',
    value: pair.privateKey,
    note: parsed.ok
      ? `New ${type.label.replace(' (recommended)', '')} key — ${parsed.key.fingerprint}. It has never been written to disk.`
      : `New ${type.label} key.`,
  };
}

/** An absent flag means "on" — the page's checkboxes start checked, and silence is not "off". */
function onByDefault(flag: boolean | undefined): boolean {
  return flag !== false;
}

/** Length is clamped to the offered list — the page cannot ask for 10,000 characters. */
function drawPassword(message: GenerateRequest): { target: string; value: string; note: string } {
  const length = PASSWORD_LENGTH_CHOICES.includes(message.genLength ?? -1)
    ? (message.genLength as number)
    : DEFAULT_PASSWORD.length;
  const made = generatePassword({
    ...DEFAULT_PASSWORD,
    length,
    lower: onByDefault(message.genLower),
    upper: onByDefault(message.genUpper),
    digits: onByDefault(message.genDigits),
    symbols: onByDefault(message.genSymbols),
  });
  return { target: 'password', value: made.value, note: made.description };
}
