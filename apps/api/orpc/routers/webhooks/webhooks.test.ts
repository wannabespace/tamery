import { beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import process from 'node:process'

import { Stripe } from 'stripe'

const STRIPE_WEBHOOK_SECRET = 'whsec_test'
const TODESKTOP_WEBHOOK_SECRET = 'todesktop_test'

// Overrides a local `.env` too, so no test call reaches a real service with real keys.
Object.assign(process.env, {
  ALERTS_EMAIL: 'alerts@tamery.test',
  API_URL: 'https://api.tamery.test',
  BETTER_AUTH_SECRET: 'better-auth-secret-at-least-32-chars',
  CONTEXT7_API_KEY: 'test',
  DATABASE_URL: 'postgres://test@127.0.0.1:1/test',
  ENCRYPTION_SECRET: 'test',
  EXA_API_KEY: 'test',
  GITHUB_CLIENT_ID: 'test',
  GITHUB_CLIENT_SECRET: 'test',
  GITHUB_TOKEN: 'test',
  GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test',
  MAIN_URL: 'https://tamery.test',
  MIN_DESKTOP_VERSION: '0',
  MISTRAL_API_KEY: 'test',
  OPENROUTER_API_KEY: 'test',
  POSTHOG_TOKEN: '',
  PROXY_SHARED_SECRET: 'proxy-shared-secret-at-least-32-chars',
  REDIS_CA: '',
  REDIS_URL: 'redis://127.0.0.1:1',
  RESEND_API_KEY: 'test',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_annual',
  STRIPE_PRO_MONTH_PRICE_ID: 'price_pro_month',
  STRIPE_SECRET_KEY: 'sk_test',
  STRIPE_WEBHOOK_SECRET,
  TODESKTOP_WEBHOOK_SECRET,
  USER_KEY_SECRET: 'test',
})

const redisClient = {
  connect: () => Promise.resolve(),
  duplicate: () => redisClient,
  on: () => redisClient,
}
mock.module('redis', () => ({ createClient: () => redisClient }))
const sendEmail = mock()
mock.module('~/lib/resend', () => ({ resend: null, sendEmail }))

const createRelease = mock(() =>
  Promise.resolve({
    data: { body: null, html_url: '', id: 1, tag_name: 'v1.2.3' },
  })
)
mock.module('@octokit/rest', () => ({
  Octokit: class {
    rest = { repos: { createRelease, updateRelease: mock() } }
  },
}))

const { default: api } = await import('~/index')
const { db } = await import('@tamery/db')

beforeEach(() => {
  createRelease.mockClear()
  sendEmail.mockClear()
})

const post = (procedure: string, body: string, headers: HeadersInit) =>
  api.fetch(
    new Request(`https://api.tamery.test/rpc/webhooks/${procedure}`, {
      body,
      headers,
      method: 'POST',
    })
  )

const stripeEvent = JSON.stringify({
  data: {
    object: {
      id: 'sub_test',
      items: { data: [{ price: { id: 'price_other_product' } }] },
      object: 'subscription',
    },
  },
  id: 'evt_test',
  object: 'event',
  type: 'customer.subscription.updated',
})

const postStripe = async (secret: string) =>
  post('stripe', stripeEvent, {
    'content-type': 'application/json',
    'stripe-signature': await new Stripe(
      'sk_test'
    ).webhooks.generateTestHeaderStringAsync({
      payload: stripeEvent,
      secret,
    }),
  })

test('Stripe: a signed event reaches its handler through the HTTP API', async () => {
  spyOn(db, 'select').mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
  } as never)

  const response = await postStripe(STRIPE_WEBHOOK_SECRET)

  expect(response.status).toBe(200)
})

test('Stripe: an event signed with another secret is refused', async () => {
  const response = await postStripe('whsec_other')

  expect(response.status).toBe(401)
})

const todesktopBuild = JSON.stringify({
  appVersion: '1.2.3',
  buildId: 'build',
})

const postTodesktop = (secret: string) =>
  post('todesktop', todesktopBuild, {
    'content-type': 'application/json',
    'X-ToDesktop-HMAC-SHA256': createHmac('sha256', secret)
      .update(todesktopBuild)
      .digest('hex'),
  })

test('ToDesktop: a signed build drafts a GitHub release for its version', async () => {
  const response = await postTodesktop(TODESKTOP_WEBHOOK_SECRET)

  expect(response.status).toBe(200)
  expect(createRelease).toHaveBeenCalledWith(
    expect.objectContaining({ draft: true, tag_name: 'v1.2.3' })
  )
  expect(sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      template: 'ReleaseDrafted',
      to: 'alerts@tamery.test',
    })
  )
})

test('ToDesktop: a build signed with another secret is refused', async () => {
  const response = await postTodesktop('todesktop_other')

  expect(response.status).toBe(401)
  expect(createRelease).not.toHaveBeenCalled()
  expect(sendEmail).not.toHaveBeenCalled()
})
