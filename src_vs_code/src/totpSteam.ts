/**
 * The Steam Guard marker, which a seed cannot carry by itself.
 *
 * <p>Its own module because `entityFormPanel.ts` sits against the 800-line ceiling, and because
 * this is a self-contained rule about one wire format rather than anything to do with a form.</p>
 */

/**
 * Steam Guard seeds are exported as plain base32 with nothing marking them as Steam's; the
 * checkbox supplies that marker as the `encoder=steam` parameter the URI form already knows.
 */
function needsSteamMarker(trimmed: string, steam: boolean): boolean {
  return steam && trimmed.length > 0 && !/encoder=steam/i.test(trimmed);
}

export function withSteamEncoder(text: string, steam: boolean): string {
  const trimmed = text.trim();
  if (!needsSteamMarker(trimmed, steam)) {
    return trimmed;
  }
  return /^otpauth:/i.test(trimmed) ? appendSteam(trimmed) : steamUriFor(trimmed);
}

function appendSteam(uri: string): string {
  return `${uri}${uri.includes('?') ? '&' : '?'}encoder=steam`;
}

function steamUriFor(secret: string): string {
  return `otpauth://totp/Steam?secret=${encodeURIComponent(secret.replace(/[\s-]+/g, ''))}&encoder=steam`;
}
