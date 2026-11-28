import { expect, test } from 'bun:test'

import { releaseAnnouncement } from './release-announcement'

const IMAGE = {
  browser_download_url:
    'https://github.com/wannabespace/tamery/releases/download/v1.0.0/whats-new.png',
  content_type: 'image/png',
}
const ARCHIVE = {
  browser_download_url:
    'https://github.com/wannabespace/tamery/releases/download/v1.0.0/tamery.zip',
  content_type: 'application/zip',
}

test.each([
  ['no assets', []],
  ['only non-image assets', [ARCHIVE]],
  [
    'an image hosted elsewhere',
    [{ ...IMAGE, browser_download_url: 'https://example.com/whats-new.png' }],
  ],
])('no announcement with %s', (_, assets) => {
  expect(releaseAnnouncement({ assets, body: 'Summary.' })).toBeNull()
})

test('the image asset is the picture', () => {
  expect(releaseAnnouncement({ assets: [ARCHIVE, IMAGE], body: null })).toEqual(
    { image: IMAGE.browser_download_url, summary: null }
  )
})

test.each([
  [
    'the first paragraph of AI notes',
    'Adds DuckDB.\r\nAnd a CLI.\r\n\r\n### New & improved\r\n\r\n- Connect to DuckDB.',
    'Adds DuckDB. And a CLI.',
  ],
  ['prose after a heading', '## 1.0\n\nFaster grid.', 'Faster grid.'],
  [
    'inline markup stripped',
    '**New:** see [docs](https://x.dev) and `tamery`.',
    'New: see docs and tamery.',
  ],
  ['numbered list skipped', '1. First\n2. Second\n\nSummary.', 'Summary.'],
  [
    'an image line skipped',
    '![shot](https://x.dev/a.png)\n\nSummary.',
    'Summary.',
  ],
  [
    'comments and code skipped',
    '<!-- draft -->\n\n```sql\nselect 1\n```\n\nSummary.',
    'Summary.',
  ],
  ['no prose', '### Fixes\n\n- Fixed a bug.', null],
])('summary: %s', (_, body, summary) => {
  expect(releaseAnnouncement({ assets: [IMAGE], body })?.summary).toBe(summary)
})
