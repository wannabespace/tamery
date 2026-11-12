import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'

import { models } from '../models/list'
import { generateReleaseNotes } from './release-notes'

const generate = spyOn(models.structured, 'doGenerate')

afterEach(() => generate.mockReset())
afterAll(() => generate.mockRestore())

const notes = [
  "## What's Changed",
  '* feat(connection-form): save on Enter by @letstri in https://github.com/wannabespace/tamery/pull/558',
  '* fix(auth): keep sign-in stream open by @letstri in https://github.com/wannabespace/tamery/pull/555',
  '**Full Changelog**: https://github.com/wannabespace/tamery/compare/v0.99.0...v0.99.1',
].join('\n')

test.each([
  {
    fixes: ['Sign-in stays connected.'],
    improvements: ['Press Enter to save.'],
  },
  { fixes: [], improvements: [] },
])(
  'renders populated groups without the original changelog: %j',
  async (groups) => {
    generate.mockResolvedValueOnce({
      content: [
        {
          text: JSON.stringify({
            ...groups,
            summary: 'Easier connection setup.',
          }),
          type: 'text',
        },
      ],
      finishReason: { raw: undefined, unified: 'stop' },
      usage: {
        inputTokens: {
          cacheRead: undefined,
          cacheWrite: undefined,
          noCache: 1,
          total: 1,
        },
        outputTokens: { reasoning: undefined, text: 1, total: 1 },
      },
      warnings: [],
    })

    const body = await generateReleaseNotes({ notes })

    expect(body).toStartWith('Easier connection setup.')
    expect(body.includes('### New & improved')).toBe(
      groups.improvements.length > 0
    )
    expect(body.includes('### Fixes')).toBe(groups.fixes.length > 0)
    for (const item of [...groups.improvements, ...groups.fixes]) {
      expect(body).toContain(`- ${item}`)
    }
    expect(body).not.toContain('github.com/wannabespace/tamery')
  }
)

test('propagates provider failure so the release can fall back to GitHub notes', async () => {
  generate.mockRejectedValueOnce(new Error('Provider unavailable'))

  await expect(generateReleaseNotes({ notes })).rejects.toThrow(
    'Provider unavailable'
  )
})
