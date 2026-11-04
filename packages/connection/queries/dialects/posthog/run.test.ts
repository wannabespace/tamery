import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { runQuery } from './run'

const CONNECTION_STRING = 'posthog://:phx_key@eu.posthog.com/12345'

const answerWith = (body: unknown, status = 200) =>
  spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }))

afterEach(() => mock.restore())

describe('runQuery', () => {
  test('sends HogQL to the project with the key, fresh and with no redirects', async () => {
    const fetched = answerWith({ columns: ['one'], results: [[1]] })

    await runQuery({
      connectionString: CONNECTION_STRING,
      query: 'SELECT 1',
      queryId: 'q1',
    })

    const [url, init] = fetched.mock.calls[0] ?? []
    expect(url).toBe('https://eu.posthog.com/api/projects/12345/query/')
    expect(init?.redirect).toBe('error')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer phx_key'
    )
    expect(JSON.parse(String(init?.body))).toMatchObject({
      client_query_id: 'q1',
      query: { kind: 'HogQLQuery', query: 'SELECT 1' },
      refresh: 'force_blocking',
    })
  })

  test.each([
    ['PostHog cut the rows off', true, 2, true],
    ['the rows pass maxRows', false, 1, true],
    ['every row fits', false, 2, false],
  ])('truncated when %s', async (_name, hasMore, maxRows, truncated) => {
    answerWith({ columns: ['n'], hasMore, results: [[1], [2]] })

    const { result } = await runQuery({
      connectionString: CONNECTION_STRING,
      maxRows,
      query: 'SELECT n',
    })

    expect(result[0]?.truncated).toBe(truncated)
  })

  test("shows PostHog's own reason when it refuses", async () => {
    answerWith({ detail: 'Unable to resolve field: nope' }, 400)

    await expect(
      runQuery({ connectionString: CONNECTION_STRING, query: 'SELECT nope' })
    ).rejects.toThrow('Unable to resolve field: nope')
  })

  test('refuses an SSH tunnel it cannot open', async () => {
    const fetched = answerWith({ columns: [], results: [] })

    await expect(
      runQuery({
        connectionString: `${CONNECTION_STRING}?ssh_host=bastion`,
        query: 'SELECT 1',
      })
    ).rejects.toThrow('SSH tunnel')
    expect(fetched).not.toHaveBeenCalled()
  })
})
