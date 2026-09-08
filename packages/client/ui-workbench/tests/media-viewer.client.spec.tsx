// @vitest-environment jsdom
/**
 * Built-in media viewers: each chain entry's selector elects exactly its own
 * media family and its component renders the matching element against the byte
 * URL.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createMediaViewer, mediaTypeSelector } from '../src/client/MediaViewer.tsx'
import type { MediaViewerProps } from '../src/client/MediaViewer.tsx'
import type { WorkbenchViewerOwnerProps } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(zh)

/**
 * Build the owner share the selectors route on.
 * @param mediaType - the media type the host reported.
 * @returns the owner props.
 */
function owner(mediaType: string): WorkbenchViewerOwnerProps {
  return { name: 'clip', path: '/w/clip', url: '/workbench/file?sessionId=s&path=%2Fw%2Fclip', mediaType }
}

describe('mediaTypeSelector', () => {
  it('elects only its own family and reports the media type as the match', () => {
    const image = mediaTypeSelector('image')
    expect(image(owner('image/png'))).toBe('image/png')
    expect(image(owner('audio/mpeg'))).toBeNull()
    const audio = mediaTypeSelector('audio')
    expect(audio(owner('audio/mpeg'))).toBe('audio/mpeg')
    expect(audio(owner('video/mp4'))).toBeNull()
    const video = mediaTypeSelector('video')
    expect(video(owner('video/mp4'))).toBe('video/mp4')
    expect(video(owner('application/octet-stream'))).toBeNull()
  })
})

describe('createMediaViewer', () => {
  /**
   * Render one family's component over the composed props.
   * @param family - the family to render.
   * @param mediaType - the media type the selector elected.
   * @returns the rendered container.
   */
  function renderViewer(family: 'image' | 'audio' | 'video', mediaType: string): HTMLElement {
    const Viewer = createMediaViewer(family)
    const props: MediaViewerProps = {
      ...owner(mediaType),
      matched: mediaType,
      t,
    } as unknown as MediaViewerProps
    return render(<Viewer {...props} />).container
  }

  it('renders an image against the byte URL', () => {
    const container = renderViewer('image', 'image/png')
    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe(owner('image/png').url)
    expect(image?.getAttribute('alt')).toBe('clip')
    expect(image?.getAttribute('data-media-type')).toBe('image/png')
  })

  it('renders an audio player labelled with the file name', () => {
    const container = renderViewer('audio', 'audio/mpeg')
    expect(container.querySelector('audio')?.getAttribute('src')).toBe(owner('audio/mpeg').url)
    expect(screen.getByLabelText(zh['viewer.media'].replace('{name}', 'clip'))).toBeTruthy()
  })

  it('renders a video player labelled with the file name', () => {
    const container = renderViewer('video', 'video/mp4')
    expect(container.querySelector('video')?.getAttribute('src')).toBe(owner('video/mp4').url)
    expect(screen.getByLabelText(zh['viewer.media'].replace('{name}', 'clip'))).toBeTruthy()
  })
})
