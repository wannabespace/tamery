import { describe, expect, test } from 'bun:test'

import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { guessConnection } from '.'
import { guessPosthogServer } from './posthog'

const posthog = (parts: Record<string, string>) =>
  expect.objectContaining({
    parts: expect.objectContaining({ type: ConnectionType.PostHog, ...parts }),
  })

describe('PostHog in a paste', () => {
  test.each([
    ['https://eu.posthog.com/project/44940/activity/explore', 'eu.posthog.com'],
    ['https://eu.posthog.com/project/44940', 'eu.posthog.com'],
    ['eu.posthog.com/project/44940', 'eu.posthog.com'],
    ['https://posthog.acme.com/project/44940/insights', 'posthog.acme.com'],
  ])('a project page %s gives the host and the project', (text, host) => {
    expect(guessConnection(text)).toEqual(posthog({ database: '44940', host }))
  })

  test('the query host, not the ingestion one an app is configured with', () => {
    for (const [text, host] of [
      ['https://eu.i.posthog.com', 'eu.posthog.com'],
      ['https://us-assets.i.posthog.com', 'us.posthog.com'],
      ['https://app.posthog.com', 'us.posthog.com'],
      ['eu.i.posthog.com', 'eu.posthog.com'],
    ] as const) {
      expect(guessConnection(text, true)).toEqual(posthog({ host }))
    }
  })

  test('a bare cloud host, in the field or the paste', () => {
    expect(guessConnection('eu.posthog.com')).toEqual(
      posthog({ host: 'eu.posthog.com' })
    )
    expect(guessConnection('https://us.posthog.com', true)).toEqual(
      posthog({ host: 'us.posthog.com' })
    )
  })

  test("an app's env file", () => {
    expect(
      guessConnection(
        [
          'POSTHOG_HOST=https://eu.i.posthog.com',
          'POSTHOG_PERSONAL_API_KEY=phx_abc',
          'POSTHOG_PROJECT_ID=44940',
        ].join('\n')
      )
    ).toEqual(
      posthog({
        database: '44940',
        host: 'eu.posthog.com',
        password: 'phx_abc',
      })
    )
  })

  test('a personal API key on its own', () => {
    expect(guessConnection('phx_abc123')).toEqual(
      posthog({ password: 'phx_abc123' })
    )
  })

  test('never wins over a database in the same text', () => {
    expect(
      guessConnection(
        [
          'DATABASE_URL=postgres://u:p@db.example.com/app',
          'POSTHOG_HOST=https://eu.i.posthog.com',
        ].join('\n')
      )?.parts.type
    ).toBe(ConnectionType.Postgres)
  })

  test('leaves a marketing link and a self-hosted ClickHouse alone', () => {
    expect(guessConnection('https://posthog.com/docs')).toBeNull()
    expect(
      guessConnection('https://posthog-clickhouse.acme.com:8443', true)?.parts
        .type
    ).toBe(ConnectionType.ClickHouse)
  })
})

describe('guessPosthogServer', () => {
  test('reads a URL under any name as the server', () => {
    expect(
      guessPosthogServer('https://analytics.acme.com:8443/project/7')
    ).toEqual(
      posthog({
        database: '7',
        host: 'analytics.acme.com',
        port: '8443',
      })
    )
  })

  test('leaves a bare host to the shared guess', () => {
    expect(guessPosthogServer('analytics.acme.com')).toBeNull()
  })
})
