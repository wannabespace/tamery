import { expect, mock, spyOn, test } from 'bun:test'

const redirect =
  'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc'
mock.module('ai', () => ({
  generateText: () =>
    Promise.resolve({
      sources: [
        { sourceType: 'url', title: 'Release notes', url: redirect },
        { sourceType: 'url', title: '', url: 'https://example.com/docs' },
        { sourceType: 'url', title: 'Duplicate', url: redirect },
      ],
      text: ' Version 18 ',
    }),
}))
mock.module('../models/own-key', () => ({
  modelsFor: () => ({ search: {} }),
  ownKeyWebSearchTools: () => ({}),
}))

const { searchWeb } = await import('./web-search')

test('sources come from the provider and no page is opened', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch')

  const result = await searchWeb({ key: {} as never, query: 'latest version' })

  expect(fetchSpy).not.toHaveBeenCalled()
  expect(result).toEqual({
    answer: 'Version 18',
    sources: [
      { title: 'Duplicate', url: redirect },
      { title: 'example.com/docs', url: 'https://example.com/docs' },
    ],
  })
})
