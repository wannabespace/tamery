import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import https from 'node:https'
import { Readable, Writable } from 'node:stream'

import { runQuery } from './run'

const CONNECTION_STRING = 'posthog://:phx_key@eu.posthog.com/12345'

const answerWith = (body: unknown, status = 200) => {
  const sent: string[] = []
  const requested = spyOn(https, 'request').mockImplementation((() => {
    const request = new Writable({
      final: (done) => {
        request.emit(
          'response',
          Object.assign(
            Readable.from([
              typeof body === 'string' ? body : JSON.stringify(body),
            ]),
            { statusCode: status }
          )
        )
        done()
      },
      write: (chunk, _encoding, done) => {
        sent.push(String(chunk))
        done()
      },
    })
    return request
  }) as never)
  return { requested, sent }
}

afterEach(() => mock.restore())

describe('runQuery', () => {
  test('sends HogQL to the project with the key, fresh', async () => {
    const { requested, sent } = answerWith({ columns: ['one'], results: [[1]] })

    await runQuery({
      connectionString: CONNECTION_STRING,
      query: 'SELECT 1',
      queryId: 'q1',
    })

    const [url, options] = requested.mock.calls[0] as unknown as [
      string,
      https.RequestOptions,
    ]
    expect(url).toBe('https://eu.posthog.com/api/projects/12345/query/')
    expect(options.method).toBe('POST')
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer phx_key',
    })
    expect(JSON.parse(sent.join(''))).toMatchObject({
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

  test.each([
    ['an HTML page', '<!DOCTYPE html>', 403],
    ['a redirect', '', 301],
  ])('names only the status for %s', async (_name, body, status) => {
    answerWith(body, status)

    await expect(
      runQuery({ connectionString: CONNECTION_STRING, query: 'SELECT 1' })
    ).rejects.toThrow(`PostHog answered ${status}`)
  })

  test('names the host and the reason when PostHog cannot be reached', async () => {
    spyOn(https, 'request').mockImplementation((() => {
      const request = new Writable({
        final: (done) => done(new Error('getaddrinfo ENOTFOUND')),
        write: (_chunk, _encoding, done) => done(),
      })
      return request
    }) as never)

    await expect(
      runQuery({ connectionString: CONNECTION_STRING, query: 'SELECT 1' })
    ).rejects.toThrow(
      'Could not reach PostHog at eu.posthog.com: getaddrinfo ENOTFOUND'
    )
  })

  test('refuses an SSH tunnel it cannot open', async () => {
    const { requested } = answerWith({ columns: [], results: [] })

    await expect(
      runQuery({
        connectionString: `${CONNECTION_STRING}?ssh_host=bastion`,
        query: 'SELECT 1',
      })
    ).rejects.toThrow('SSH tunnel')
    expect(requested).not.toHaveBeenCalled()
  })
})
