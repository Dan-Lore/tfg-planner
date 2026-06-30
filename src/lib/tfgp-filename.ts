const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Strip `.tfgp` and characters invalid in file names. */
export function schemeNameFromFilename(filename: string): string {
  const base = filename.replace(/\.tfgp$/i, '');
  const sanitized = base.replace(INVALID_FILENAME_CHARS, '_').trim();
  return sanitized || 'Untitled';
}

/** Build a safe `.tfgp` download name from scheme meta name. */
export function tfgpFilenameFromSchemeName(name: string): string {
  const sanitized = name.replace(INVALID_FILENAME_CHARS, '_').trim();
  const stem = sanitized || 'scheme';
  return `${stem}.tfgp`;
}
