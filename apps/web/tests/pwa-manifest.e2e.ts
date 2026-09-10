import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'DeepSeek Harness',
    short_name: 'DSH',
    start_url: '/',
    scope: '/',
    // `standalone`, not `fullscreen`: the app keeps the system status bar (a
    // fullscreen Android window hides the clock and battery and offers no
    // browser chrome to escape a wedged page with).
    display: 'standalone',
    background_color: '#151517',
    theme_color: '#151517',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable art keeps the mark inside the 80% safe zone so a launcher that
      // crops the tile to a circle cannot clip it.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
})

it('ships every manifest icon as a real file in the built application', async () => {
  const manifest = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8')) as {
    icons: { src: string; sizes: string; type: string }[]
  }
  // Android refuses to install a manifest whose named icons are missing or are
  // served as the SPA fallback page, so the bytes are checked, not the path.
  const expected: Record<string, string> = {
    '/icon-192.png': '192x192',
    '/icon-512.png': '512x512',
    '/icon-maskable-512.png': '512x512',
  }
  const declared = new Map(manifest.icons.map(icon => [icon.src, icon]))
  for (const [src, sizes] of Object.entries(expected)) {
    const icon = declared.get(src)
    expect(icon?.sizes).toBe(sizes)
    const bytes = await readFile(join(DIST_ROOT, src.slice(1)))
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(bytes.length).toBeGreaterThan(1024)
  }
})

it('ships a favicon that switches to a light mark under dark color scheme', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The light fill must live inside the dark-scheme media query, so the icon
  // stays black in light mode and only turns white under a dark scheme.
  expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*path\s*{[^}]*fill:\s*#fff/i)
  expect(favicon).toContain('fill="#000"')
})
