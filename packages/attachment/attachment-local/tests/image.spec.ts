import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { detectImage, fitImageEdge, probeImage } from '../src/image.ts'

async function raster(format: 'png' | 'jpeg' | 'webp' | 'gif'): Promise<Uint8Array> {
  const image = sharp({
    create: { width: 3, height: 2, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
  })
  return new Uint8Array(await image.toFormat(format).toBuffer())
}

describe('raster decoding', () => {
  it('decodes every supported format and its intrinsic dimensions', async () => {
    for (const [format, mediaType] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
      ['gif', 'image/gif'],
    ] as const) {
      await expect(detectImage(await raster(format)))
        .resolves.toEqual({ mediaType, width: 3, height: 2 })
    }
  })

  it('rejects excess decoded pixels before decoding', async () => {
    await expect(detectImage(await raster('png'), 5))
      .rejects.toMatchObject({ code: 'IMAGE_TOO_MANY_PIXELS' })
  })

  it('rejects malformed bytes and truncated payloads with readable headers', async () => {
    await expect(detectImage(Uint8Array.of(1, 2, 3)))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const unsupported = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).tiff().toBuffer()
    await expect(detectImage(unsupported)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const complete = await raster('png')
    const truncated = complete.subarray(0, 62)
    await expect(sharp(truncated).metadata()).resolves.toMatchObject({ width: 3, height: 2 })
    await expect(detectImage(truncated)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })

  it('probes malformed bytes and unsupported formats into the same stable error', async () => {
    await expect(probeImage(Uint8Array.of(1, 2, 3)))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const unsupported = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).tiff().toBuffer()
    await expect(probeImage(unsupported)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })
})

describe('admission downscaling', () => {
  it('returns the original bytes when the longest side already fits', async () => {
    const png = await raster('png')
    await expect(fitImageEdge(png, 'image/png', 16)).resolves.toEqual(png)
  })

  it('downscales to the edge cap in the declared format and keeps the ratio', async () => {
    const wide = new Uint8Array(await sharp({
      create: { width: 100, height: 40, channels: 3, background: { r: 9, g: 8, b: 7 } },
    }).png().toBuffer())
    const fitted = await fitImageEdge(wide, 'image/png', 10)
    await expect(detectImage(fitted)).resolves.toEqual({ mediaType: 'image/png', width: 10, height: 4 })
    // The fitted bytes are a new encoding, not the original payload.
    expect(fitted.byteLength).not.toBe(wide.byteLength)
  })

  it('keeps an animated format resizable and refuses a mismatched declaration', async () => {
    const gif = new Uint8Array(await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    }).gif().toBuffer())
    const fitted = await fitImageEdge(gif, 'image/gif', 8)
    await expect(detectImage(fitted)).resolves.toEqual({ mediaType: 'image/gif', width: 8, height: 4 })
    await expect(fitImageEdge(gif, 'image/png', 8)).rejects.toMatchObject({ code: 'IMAGE_TYPE_MISMATCH' })
  })

  it('still refuses an image beyond the decoded-pixel cap', async () => {
    const png = await raster('png')
    await expect(fitImageEdge(png, 'image/png', 4096, 5)).rejects.toMatchObject({ code: 'IMAGE_TOO_MANY_PIXELS' })
  })
})
