/**
 * Which stored URL may be handed to the browser (issue #104) — pure, and the only judge of it.
 *
 * <p>An entry's URL is untrusted input: it arrives by sync, by an accepted share and by import, and
 * `vscode.env.openExternal` will open far more than web pages — `file:` on the local disk,
 * `vscode:` and `command:` inside the editor. So only `http:` and `https:` open, and everything
 * else is refused by name. What a person types is usually a bare host (`www.godaddy.com`), which
 * is taken to be `https`; a protocol-relative `//host` is the same thing spelled differently.</p>
 *
 * <p>An address carrying a user name or password is refused rather than opened: a browser sends
 * them, and a vault that keeps the password in its own field has no reason to keep a second copy in
 * a link.</p>
 */

export type SiteUrl = { ok: true; url: string } | { ok: false; reason: string };

const WEB_SCHEMES: readonly string[] = ['http:', 'https:'];

/** What an entry with nothing stored in its URL field is told. */
export const NO_URL = 'has no URL.';

/** Anything that starts like a scheme: `word:` — judged by that scheme unless it is a host and port. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * `localhost:3000` or `grafana.internal:3000/d` — a HOST and a port, not a scheme. Only a word that
 * looks like a host (`localhost`, or one with a dot) qualifies, so `tel:911` and `javascript:1` stay
 * schemes and are refused by name rather than opened as `https://tel:911/` (gate code round, #8).
 */
const HOST_AND_PORT = /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+(?:[/?#]|$)/i;

export function siteUrlToOpen(raw: string | undefined): SiteUrl {
  const text = (raw ?? '').trim();
  return text === '' ? { ok: false, reason: NO_URL } : judgeText(text);
}

function judgeText(text: string): SiteUrl {
  const parsed = parse(withScheme(text));
  if (parsed === undefined) {
    return { ok: false, reason: `"${text}" is not a web address.` };
  }
  const judged = judge(parsed);
  return !judged.ok && looksLikeHostAndPort(text) ? { ok: false, reason: hostAndPortHint(text) } : judged;
}

/**
 * `grafana:3000` reads as a `grafana:` scheme (a one-word host is indistinguishable from one), and
 * being told `"grafana:" addresses are not opened` blames a scheme nobody typed. Say what to store —
 * unless the word IS a scheme people write with digits after it (`tel:911`), which is refused by name.
 */
const ONE_WORD_AND_PORT = /^([a-z0-9-]+):\d+(?:[/?#]|$)/i;

const DIGIT_SCHEMES: readonly string[] = ['tel', 'sms', 'fax', 'callto', 'javascript', 'data', 'mailto', 'urn'];

function looksLikeHostAndPort(text: string): boolean {
  const word = ONE_WORD_AND_PORT.exec(text)?.[1].toLowerCase();
  return word !== undefined && !DIGIT_SCHEMES.includes(word);
}

function hostAndPortHint(text: string): string {
  return `"${text}" looks like a host and a port — store it with its scheme, e.g. https://${text}, to open it.`;
}

function withScheme(text: string): string {
  if (text.startsWith('//')) {
    return `https:${text}`;
  }
  return SCHEME.test(text) && !HOST_AND_PORT.test(text) ? text : `https://${text}`;
}

function parse(candidate: string): URL | undefined {
  try {
    const url = new URL(candidate);
    return isWeb(url) && url.hostname === '' ? undefined : url;
  } catch {
    return undefined;
  }
}

function isWeb(url: URL): boolean {
  return WEB_SCHEMES.includes(url.protocol);
}

function judge(url: URL): SiteUrl {
  if (!isWeb(url)) {
    return { ok: false, reason: `"${url.protocol}" addresses are not opened — only http and https.` };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'This URL contains a user name or password, so it is not opened. Keep the login in its own field.' };
  }
  // The WHATWG serialization — the one form every later step sees, so none of them re-encodes.
  return { ok: true, url: url.href };
}
