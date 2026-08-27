/**
 * The seam between the page and the reader: a pasted picture in, authenticator accounts out.
 *
 * <p>The webview holds the only image decoder in the process — its canvas — so the page turns
 * whatever was on the clipboard into plain grey pixels and posts them here. The host does the
 * rest, because the page script is a template string that the compiler never checks and nothing
 * can unit-test, and because everything below is the part worth testing.</p>
 *
 * <p>Pixels arrive base64-encoded: a webview message is JSON, and a `Uint8Array` sent through it
 * arrives as an object with numeric keys — larger, slower and no longer an array.</p>
 */

import { OtpAccount, parseOtpQrText } from './otpMigration';
import { decodeQr } from './qrSample';

export interface PastedImage {
  /** One byte of brightness per pixel, row-major, base64. */
  readonly gray: string;
  readonly width: number;
  readonly height: number;
}

export interface PastedQrReading {
  readonly accounts: readonly OtpAccount[];
  /** What the picture held but could not be used, each line saying why. */
  readonly skipped: readonly string[];
  /** Set when nothing could be read at all; empty otherwise. */
  readonly error: string;
}

/** Anything larger is not a screenshot of a QR code, and decoding it would just be slow. */
const MAX_PIXELS = 40_000_000;

export function readPastedQr(image: PastedImage): PastedQrReading {
  const gray = pixelsOf(image);
  if (gray === undefined) {
    return { accounts: [], skipped: [], error: 'That paste did not arrive as a picture.' };
  }
  const decoded = decodeQr({ gray, width: image.width, height: image.height });
  if (!decoded.ok) {
    return { accounts: [], skipped: [], error: decoded.reason };
  }
  const reading = parseOtpQrText(decoded.text);
  return { accounts: reading.accounts, skipped: reading.skipped, error: emptinessOf(reading) };
}

/** A reading that found nothing at all needs a sentence of its own; one that skipped things does not. */
function emptinessOf(reading: { accounts: readonly unknown[]; skipped: readonly unknown[] }): string {
  if (reading.accounts.length > 0) {
    return '';
  }
  return reading.skipped.length > 0 ? '' : 'That QR code carried nothing usable.';
}

/** A size a picture could actually have. */
function isPlausibleSize(width: number, height: number): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return false;
  }
  const pixels = width * height;
  return pixels > 0 && pixels <= MAX_PIXELS;
}

function pixelsOf(image: PastedImage): Uint8Array | undefined {
  const pixels = image.width * image.height;
  if (!isPlausibleSize(image.width, image.height)) {
    return undefined;
  }
  const bytes = Buffer.from(image.gray, 'base64');
  // A length that does not match the stated size means the two disagree about the picture, and
  // sampling on the wrong stride would produce a plausible matrix out of nothing.
  return bytes.length === pixels ? new Uint8Array(bytes) : undefined;
}
