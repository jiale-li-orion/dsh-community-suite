/**
 * Content type for one workspace file. The map is the workbench's single
 * source of truth for "what is this file": the directory listing tags each
 * file entry with it (so a panel and the viewer chain route on the same
 * value) and the byte route serves it as `Content-Type`. It covers the types
 * the built-in viewers render plus the plain-text and PDF cases a browser can
 * show on its own; everything else is `application/octet-stream`, which
 * downloads instead of executing.
 * @module @deepseek-ai/dsh-workbench/content-type
 */

/** Media type per lowercase file extension, without the leading dot. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  // Images
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'avif': 'image/avif',
  'bmp': 'image/bmp',
  'svg': 'image/svg+xml',
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'oga': 'audio/ogg',
  'm4a': 'audio/mp4',
  'flac': 'audio/flac',
  'aac': 'audio/aac',
  // Video
  'mp4': 'video/mp4',
  'm4v': 'video/mp4',
  'webm': 'video/webm',
  'ogv': 'video/ogg',
  'mov': 'video/quicktime',
  // Documents and text a browser renders or displays as-is
  'pdf': 'application/pdf',
  'txt': 'text/plain; charset=utf-8',
  'md': 'text/plain; charset=utf-8',
  'json': 'application/json; charset=utf-8',
  'csv': 'text/csv; charset=utf-8',
}

/** The type served when the extension is unknown or absent. */
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

/**
 * Media type for one path, chosen by its extension.
 * @param path - file path or name; only the extension is read.
 * @returns the media type, or {@link DEFAULT_CONTENT_TYPE} when unknown.
 */
export function contentTypeForPath(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return DEFAULT_CONTENT_TYPE
  const extension = path.slice(dot + 1).toLowerCase()
  return CONTENT_TYPES[extension] ?? DEFAULT_CONTENT_TYPE
}
