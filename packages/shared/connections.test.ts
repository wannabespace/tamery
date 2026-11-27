import { describe, expect, it } from 'bun:test'

import { isConnectionError } from './connections'
import { PROXY_ERROR_MESSAGE } from './constants'

describe('isConnectionError', () => {
  it('detects a connection error wrapped in a friendly message', () => {
    const error = new Error(PROXY_ERROR_MESSAGE, {
      cause: new TypeError('Failed to fetch'),
    })

    expect(isConnectionError(error)).toBe(true)
  })

  it('detects the bare fetch failure a D1 or libSQL request reports', () => {
    expect(isConnectionError(new Error('fetch failed'))).toBe(true)
  })

  it('ignores query errors', () => {
    expect(
      isConnectionError(new Error('syntax error', { cause: 'at line 1' }))
    ).toBe(false)
  })
})
