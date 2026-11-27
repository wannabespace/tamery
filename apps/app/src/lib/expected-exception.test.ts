import { expect, test } from 'bun:test'

import { PROXY_ERROR_MESSAGE } from '@tamery/shared/constants'

import { isExpectedException } from './expected-exception'

const PROXY_FAILURE = [PROXY_ERROR_MESSAGE, 'Failed to fetch']

test('keeps a cloud proxy failure while the device is online', () => {
  expect(isExpectedException(PROXY_FAILURE, true)).toBe(false)
})

test('drops a cloud proxy failure while the device is offline', () => {
  expect(isExpectedException(PROXY_FAILURE, false)).toBe(true)
})

test('drops a database refusing the connection', () => {
  expect(
    isExpectedException(['connect ECONNREFUSED 127.0.0.1:5432'], true)
  ).toBe(true)
})

test('keeps an unexpected error', () => {
  expect(isExpectedException(['x is not a function'], true)).toBe(false)
})
