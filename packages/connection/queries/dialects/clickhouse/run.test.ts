import { expect, spyOn, test } from 'bun:test'

import { getClient } from './client'
import { runQuery } from './run'

const jsonRow = (values: unknown[]) => ({
  json: <T>() => values as T,
  text: JSON.stringify(values),
})

test('a non-finite float reads apart from NULL', async () => {
  const connectionString = 'http://u:p@run.example.com/'
  const client = await getClient(connectionString)
  const query = spyOn(client, 'query').mockImplementation(((params: {
    clickhouse_settings: Record<string, unknown>
  }) => {
    const infinity = params.clickhouse_settings
      .output_format_json_quote_denormals
      ? 'inf'
      : null
    return Promise.resolve({
      async *stream() {
        yield [
          jsonRow(['ratio']),
          jsonRow(['Nullable(Float32)']),
          jsonRow([infinity]),
          jsonRow([null]),
        ]
      },
    })
  }) as unknown as typeof client.query)
  try {
    const { result } = await runQuery({
      connectionString,
      query: 'SELECT ratio FROM events',
    })
    expect(result[0]?.rows).toEqual([['inf'], [null]])
  } finally {
    query.mockRestore()
  }
})
