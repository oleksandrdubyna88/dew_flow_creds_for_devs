/**
 * One encrypted file and one encrypted image per entity — the rules.
 *
 * <p>Free of `vscode`: which names are allowed, how large a file may be, and what mime a
 * preview needs are exactly the things that must not be discovered by uploading.</p>
 *
 * <p>Both attachments are stored as base64 in SecretStorage and travel only inside the
 * encrypted vault, like every other secret. The FILE NAME sits in plaintext metadata
 * (as `vpnConfigFileName` already does) so the tree can label the row without opening
 * the vault.</p>
 */

/** Documents people actually attach: pdf, office, text, data, archives. Never binaries. */
const FILE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.rtf', '.txt', '.md', '.csv',
  '.json', '.xml', '.yaml', '.yml', '.log', '.zip', '.7z', '.gz', '.tar',
] as const;

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'] as const;

/** The executable family, refused even as the TAIL of a double extension. */
const FORBIDDEN = [
  '.exe', '.msi', '.bat', '.cmd', '.ps1', '.sh', '.dll', '.scr', '.com', '.vbs',
  '.js', '.jar', '.app', '.apk', '.deb', '.rpm',
];

/** 4 MiB. The vault file carries every attachment; a cap keeps sync and backups sane. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isAllowedFileName(name: string): boolean {
  const ext = extensionOf(name);
  if (ext === '' || FORBIDDEN.includes(ext)) {
    return false;
  }
  return (FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isAllowedImageName(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** What the preview's data: URI needs. Undefined = extension the viewer cannot render. */
// eslint-disable-next-line complexity
export function imageMime(name: string): string | undefined {
  switch (extensionOf(name)) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    case '.svg': return 'image/svg+xml';
    default: return undefined;
  }
}

/** `accept` attribute values — derived from the same lists the reader enforces. */
export const fileAccept = FILE_EXTENSIONS.join(',');
export const imageAccept = IMAGE_EXTENSIONS.join(',');

/** The same allowlists as regexes, for the webview's inline validation. */
export const fileNameRegex = new RegExp(
  '\\.(' + FILE_EXTENSIONS.map((e) => e.slice(1)).join('|') + ')$',
  'i',
);
export const imageNameRegex = new RegExp(
  '\\.(' + IMAGE_EXTENSIONS.map((e) => e.slice(1)).join('|') + ')$',
  'i',
);
