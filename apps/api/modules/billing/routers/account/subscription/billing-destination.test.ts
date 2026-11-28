import { expect, mock, test } from 'bun:test'

const mainUrl = 'https://billing.test'

mock.module('~/env', () => ({ env: { MAIN_URL: mainUrl } }))

const { billingDestination } = await import('./billing-destination')

test.each([
  '/account?type=desktop&plan=team&subscription=success',
  '/account?type=cli&subscription=cancel',
  '/account/billing',
])('preserves the supported billing destination %s', (path) => {
  expect(billingDestination['~standard'].validate(mainUrl + path)).toEqual({
    value: mainUrl + path,
  })
})

test.each([
  'https://other.test/account',
  'https://billing.test/home',
  '/account',
])('rejects a destination outside the account billing policy: %s', (url) => {
  expect(billingDestination['~standard'].validate(url)).toHaveProperty('issues')
})
