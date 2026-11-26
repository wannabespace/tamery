import { afterAll, beforeEach, expect, it, spyOn } from 'bun:test'

import { APICallError, RetryError } from 'ai'

import { logProviderError } from './provider-error'

const consoleError = spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => consoleError.mockClear())
afterAll(() => consoleError.mockRestore())

const callError = new APICallError({
  message: 'hunter2 in the message',
  requestBodyValues: { prompt: 'hunter2 in the request' },
  responseBody: 'hunter2 in the response',
  statusCode: 429,
  url: 'https://provider.test/hunter2',
})

it.each([
  ['a call', callError],
  [
    'a retried call',
    new RetryError({
      errors: [callError],
      message: 'hunter2 in the retry',
      reason: 'maxRetriesExceeded',
    }),
  ],
])('logs the status of %s and none of its content', (_, error) => {
  logProviderError('chat stream', error)

  expect(consoleError.mock.calls).toEqual([
    ['chat stream failed', { status: 429, type: 'AI_APICallError' }],
  ])
})

it("tells our own bug from a provider's refusal", () => {
  logProviderError('chat stream', new TypeError('hunter2'))

  expect(consoleError.mock.calls).toEqual([
    ['chat stream failed', { status: null, type: 'TypeError' }],
  ])
})
