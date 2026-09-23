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

/**
 * A scheme at the start — but not `host:3000`, whose colon introduces a PORT. Without that
 * exception `localhost:3000` would be read as a `localhost:` scheme and refused.
 */
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i;

export function siteUrlToOpen(raw: string | undefined): SiteUrl {
  const text = (raw ?? '').trim();
  if (text === '') {
    return { ok: false, reason: 'This entry has no URL.' };
  }
  const parsed = parse(withScheme(text));
  return parsed === undefined ? { ok: false, reason: `"${text}" is not a web address.` } : judge(parsed);
}

function withScheme(text: string): string {
  if (text.startsWith('//')) {
    return `https:${text}`;
  }
  return SCHEME.test(text) ? text : `https://${text}`;
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
