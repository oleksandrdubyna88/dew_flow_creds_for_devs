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
  const kb = bytes / 1024;
  const scales: ReadonlyArray<[boolean, () => string]> = [
    [bytes < 1024, () => `${bytes} B`],
    [kb < 1024, () => `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`],
  ];
  const hit = scales.find(([applies]) => applies);
  return hit === undefined ? `${(kb / 1024).toFixed(1)} MB` : hit[1]();
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
  const sniffer = SNIFFERS.find(({ minLength, magic }) => bytes.length > minLength && startsWith(bytes, magic));
  return sniffer?.read(bytes);
}

interface Sniffer {
  readonly magic: readonly number[];
  readonly minLength: number;
  readonly read: (bytes: Uint8Array) => ImageSize | undefined;
}

/** One entry per format, tried in order; the magic bytes decide, never the file name. */
const SNIFFERS: readonly Sniffer[] = [
  // PNG: IHDR is always first; width/height at offsets 16 and 20, big-endian.
  { magic: [0x89, 0x50], minLength: 24, read: (b) => ({ width: readU32(b, 16), height: readU32(b, 20) }) },
  // GIF: logical screen size at 6, little-endian u16s.
  { magic: [0x47, 0x49, 0x46], minLength: 10, read: (b) => ({ width: b[6] + (b[7] << 8), height: b[8] + (b[9] << 8) }) },
  { magic: [0xff, 0xd8], minLength: 4, read: jpegDimensions },
];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

/** SOF0–SOF15 minus the three markers in that range that are not frames (DHT, JPG, DAC). */
function isFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

/** Walk JPEG segments to the first SOF frame, which carries the size. */
function jpegDimensions(bytes: Uint8Array): ImageSize | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
    if (isFrameMarker(bytes[offset + 1])) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + (bytes[offset + 2] << 8) + bytes[offset + 3];
  }
  return undefined; // lost sync, or no frame before the data ran out — a truncated or lying file
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
  const dims = withDimensions ? imageDimensions(Buffer.from(base64, 'base64')) : undefined;
  return { size: base64Bytes(base64), changedAt: nowMs, changedBy: byEmail, ...dims };
}

/** Which record fields hold each slot's stamps — one table, read and written through it. */
const SLOT_FIELDS: Readonly<Record<'attachment' | 'image', Readonly<Record<keyof AttachmentStamp, keyof EntityMetadata | undefined>>>> = {
  attachment: {
    size: 'attachmentSize', changedAt: 'attachmentChangedAt', changedBy: 'attachmentChangedBy',
    width: undefined, height: undefined,
  },
  image: {
    size: 'imageSize', changedAt: 'imageChangedAt', changedBy: 'imageChangedBy',
    width: 'imageWidth', height: 'imageHeight',
  },
};

/** One slot's stamps, read off the record — the same fields whichever page asks. */
function slotStamps(details: EntityMetadata | undefined, slot: 'attachment' | 'image'): AttachmentStamp {
  const fields = SLOT_FIELDS[slot];
  const read = (key: keyof AttachmentStamp): unknown =>
    fields[key] === undefined || details === undefined ? undefined : details[fields[key] as keyof EntityMetadata];
  return {
    size: read('size') as number | undefined,
    changedAt: read('changedAt') as number | undefined,
    changedBy: read('changedBy') as string | undefined,
    width: read('width') as number | undefined,
    height: read('height') as number | undefined,
  };
}

/**
 * The metadata line both pages render: `3.2 KB · 1920×1080 · changed 8/27/2026 by a@b.c`,
 * with "not recorded" standing in wherever a legacy entry has no stamp.
 */
export function describeAttachment(
  details: EntityMetadata,
  slot: 'attachment' | 'image',
): string {
  const stamp = slotStamps(details, slot);
  const parts: string[] = [stamp.size === undefined ? 'size not recorded' : humanBytes(stamp.size)];
  if (slot === 'image') {
    parts.push(describeDimensions(stamp));
  }
  parts.push(describeChange(stamp));
  return parts.join(' · ');
}

function describeDimensions(stamp: AttachmentStamp): string {
  return stamp.width !== undefined && stamp.height !== undefined
    ? `${stamp.width}×${stamp.height}`
    : 'dimensions not recorded';
}

function describeChange(stamp: AttachmentStamp): string {
  if (stamp.changedAt === undefined) {
    return 'last change not recorded';
  }
  const by = stamp.changedBy === undefined ? '' : ` by ${stamp.changedBy}`;
  return `changed ${new Date(stamp.changedAt).toLocaleString()}${by}`;
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
  const source = stamp ?? slotStamps(oldDetails, slot);
  const target = details as unknown as Record<string, unknown>;
  for (const [stampKey, field] of Object.entries(SLOT_FIELDS[slot])) {
    if (field !== undefined) {
      target[field] = source[stampKey as keyof AttachmentStamp];
    }
  }
}
