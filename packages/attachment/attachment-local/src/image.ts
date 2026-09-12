/** Raster inspection: full decode at admission, header-only probe on verified reads. */

import sharp, { type FormatEnum, type Sharp } from 'sharp'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Decoded metadata from a supported image. */
export interface DetectedImage {
  mediaType: ImageMediaType
  width: number
  height: number
}

/** Encoder to keep when an image has to be downscaled. */
const ENCODERS: Readonly<Record<ImageMediaType, keyof FormatEnum>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MEDIA_TYPES: Readonly<Record<string, ImageMediaType>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

async function imageMetadata(image: Sharp): Promise<DetectedImage> {
  const metadata = await image.metadata()
  const mediaType = MEDIA_TYPES[metadata.format as string]
  if (mediaType === undefined) {
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE')
  }
  return { mediaType, width: metadata.width, height: metadata.height }
}

/**
 * Parse a supported raster's header and return its intrinsic metadata without
 * decoding pixels. Digest-verified reads use this: admission already proved
 * that these exact bytes decode completely, so the read path only re-derives
 * the reference fields instead of paying the full-raster decode again.
 * @param data - complete encoded image bytes.
 * @returns verified format and dimensions.
 */
export async function probeImage(data: Uint8Array): Promise<DetectedImage> {
  try {
    return await imageMetadata(sharp(data, { failOn: 'error', limitInputPixels: false }))
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

/**
 * Downscale one image whose longest side exceeds the deployment's edge cap.
 * Vision routes refuse an image wider or taller than their decoder's limit
 * (DeepSeek reports `invalid_request_error` above 8192 pixels per side), and
 * refusing it here would leave long screenshots unreadable, so the bytes are
 * re-encoded at the cap in their own format — animation included — before they
 * become durable.
 * @param data - complete encoded image bytes.
 * @param mediaType - media type the caller declared for those bytes.
 * @param maxEdge - longest side to keep; a smaller image is returned unchanged.
 * @param maxPixels - decoded-pixel admission limit.
 * @returns the bytes to store, unchanged when they already fit.
 */
export async function fitImageEdge(
  data: Uint8Array,
  mediaType: ImageMediaType,
  maxEdge: number,
  maxPixels?: number,
): Promise<Uint8Array> {
  const detected = await detectImage(data, maxPixels)
  if (detected.mediaType !== mediaType) {
    throw new AttachmentError('Declared image type does not match its bytes.', 'IMAGE_TYPE_MISMATCH')
  }
  if (Math.max(detected.width, detected.height) <= maxEdge) return data
  const scale = maxEdge / Math.max(detected.width, detected.height)
  const width = Math.max(1, Math.round(detected.width * scale))
  const height = Math.max(1, Math.round(detected.height * scale))
  const resized = sharp(data, {
    failOn: 'error',
    limitInputPixels: false,
    animated: mediaType === 'image/gif' || mediaType === 'image/webp',
  }).resize({ width, height, fit: 'inside', withoutEnlargement: true })
  return new Uint8Array(await resized.toFormat(ENCODERS[mediaType]).toBuffer())
}

/**
 * Fully decode a supported raster and return its intrinsic metadata.
 * @param data - complete encoded image bytes.
 * @param maxPixels - decoded-pixel admission limit.
 * @returns verified format and dimensions.
 */
export async function detectImage(data: Uint8Array, maxPixels?: number): Promise<DetectedImage> {
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    const detected = await imageMetadata(image)
    if (maxPixels !== undefined && detected.width * detected.height > maxPixels) {
      throw new AttachmentError('Image exceeds the configured decoded-pixel limit.', 'IMAGE_TOO_MANY_PIXELS')
    }
    await image.raw().toBuffer()
    return detected
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}
