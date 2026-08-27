import { EntityMetadata } from './types';

/**
 * What is KNOWN about a stored file or image, and how both pages say it (tails T27).
 *
 * <p>The owner's report: a stored file rendered as a password-masked input — the shape built for
 * secrets, worn by a JSON export — and neither page said anything ABOUT the file. The data model
 * had nothing to say: the name travelled, and size, when and by whom did not. These fields are
 * stamped at WRITE time (the entity's own `updatedAt` moves on every edit, so showing it for the
 * file would lie); for every entry stored before the stamps existed the pages say
 * <b>"not recorded"</b> — never a guess.</p>
 *
 * <p>One formatter, two pages, so the viewer and the form cannot describe one file two ways.</p>
 */

/** Bytes for a human: `3.2 KB`, `1.8 MB`. */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** The stored blob's byte size, from its base64 length — no decode needed. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Width × height out of the header bytes — PNG, JPEG and GIF, dependency-free.
 *
 * <p>Undefined for anything else (WebP/BMP/SVG show without dimensions): a wrong number under a
 * picture is worse than none. A truncated header is undefined too, never a throw — this runs on
 * whatever an import brought in.</p>
 */
export function imageDimensions(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    // PNG: IHDR is always first; width/height at offsets 16 and 20, big-endian.
    return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    // GIF: logical screen size at 6, little-endian u16s.
    return { width: bytes[6] + (bytes[7] << 8), height: bytes[8] + (bytes[9] << 8) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpegDimensions(bytes);
  }
  return undefined;
}

/** Walk JPEG segments to the first SOF frame, which carries the size. */
function jpegDimensions(bytes: Uint8Array): ImageSize | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined; // lost sync — a truncated or lying file
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/** The write-time stamps for one attachment slot, spread into the details on save. */
export interface AttachmentStamp {
  readonly size?: number;
  readonly changedAt?: number;
  readonly changedBy?: string;
  readonly width?: number;
  readonly height?: number;
}

/** Stamp a slot from the new base64, or clear every stamp when the slot is cleared. */
export function stampFor(
  base64: string | undefined,
  cleared: boolean,
  byEmail: string | undefined,
  nowMs: number,
  withDimensions: boolean,
): AttachmentStamp | undefined {
  if (cleared) {
    return {}; // every field undefined — the stamps go with the file
  }
  if (base64 === undefined) {
    return undefined; // untouched: keep whatever is stamped
  }
  const size = base64Bytes(base64);
  const dims = withDimensions ? imageDimensions(Buffer.from(base64, 'base64')) : undefined;
  return { size, changedAt: nowMs, changedBy: byEmail, width: dims?.width, height: dims?.height };
}

/**
 * The metadata line both pages render: `3.2 KB · 1920×1080 · changed 8/27/2026 by a@b.c`,
 * with "not recorded" standing in wherever a legacy entry has no stamp.
 */
export function describeAttachment(
  details: EntityMetadata,
  slot: 'attachment' | 'image',
): string {
  const size = slot === 'attachment' ? details.attachmentSize : details.imageSize;
  const at = slot === 'attachment' ? details.attachmentChangedAt : details.imageChangedAt;
  const by = slot === 'attachment' ? details.attachmentChangedBy : details.imageChangedBy;
  const parts: string[] = [size === undefined ? 'size not recorded' : humanBytes(size)];
  if (slot === 'image') {
    parts.push(
      details.imageWidth !== undefined && details.imageHeight !== undefined
        ? `${details.imageWidth}×${details.imageHeight}`
        : 'dimensions not recorded',
    );
  }
  parts.push(
    at === undefined
      ? 'last change not recorded'
      : `changed ${new Date(at).toLocaleString()}${by === undefined ? '' : ` by ${by}`}`,
  );
  return parts.join(' · ');
}

/** The slice of the form's result this seam needs — the panel's full type imports vscode. */
export interface AttachmentResultSlice {
  readonly details: EntityMetadata;
  readonly newAttachment?: string;
  readonly clearAttachment?: boolean;
  readonly newImage?: string;
  readonly clearImage?: boolean;
}

/**
 * The details as they must be WRITTEN: the form's answer plus everything an edit must not lose.
 *
 * <p>The form rebuilds `details` from its inputs, so fields it does not know about die on every
 * ordinary Save. Building this seam surfaced that <b>`configKeyHash` was already dying that
 * way</b>: edit a config's name and its code access silently turned off — the hash gone, every
 * `creds config` call refused, nothing said why. It is carried here now (while the entry IS
 * still a config — a kind change retires the key deliberately, the same scrub sharing does),
 * and the attachment stamps ride the same rule: stamped when the slot changed, carried when it
 * did not, dropped when it was cleared.</p>
 */
export function carryThroughDetails(
  result: AttachmentResultSlice,
  oldDetails: EntityMetadata | undefined,
  byEmail: string | undefined,
  nowMs: number,
): EntityMetadata {
  const details: EntityMetadata = { ...result.details };
  if (details.isConfig === true && details.configKeyHash === undefined) {
    details.configKeyHash = oldDetails?.configKeyHash;
  }
  applySlot(details, 'attachment', stampFor(result.newAttachment, result.clearAttachment === true, byEmail, nowMs, false), oldDetails);
  applySlot(details, 'image', stampFor(result.newImage, result.clearImage === true, byEmail, nowMs, true), oldDetails);
  return details;
}

function applySlot(
  details: EntityMetadata,
  slot: 'attachment' | 'image',
  stamp: AttachmentStamp | undefined,
  oldDetails: EntityMetadata | undefined,
): void {
  const source = stamp ?? {
    size: slot === 'attachment' ? oldDetails?.attachmentSize : oldDetails?.imageSize,
    changedAt: slot === 'attachment' ? oldDetails?.attachmentChangedAt : oldDetails?.imageChangedAt,
    changedBy: slot === 'attachment' ? oldDetails?.attachmentChangedBy : oldDetails?.imageChangedBy,
    width: slot === 'attachment' ? undefined : oldDetails?.imageWidth,
    height: slot === 'attachment' ? undefined : oldDetails?.imageHeight,
  };
  if (slot === 'attachment') {
    details.attachmentSize = source.size;
    details.attachmentChangedAt = source.changedAt;
    details.attachmentChangedBy = source.changedBy;
  } else {
    details.imageSize = source.size;
    details.imageWidth = source.width;
    details.imageHeight = source.height;
    details.imageChangedAt = source.changedAt;
    details.imageChangedBy = source.changedBy;
  }
}
