import { expect, mock, test } from 'bun:test'

const jsonRow = (values: unknown[]) => ({
  json: <T>() => values as T,
  text: JSON.stringify(values),
})

mock.module('./client', () => ({
  getClient: () =>
    Promise.resolve({
      query: ({
        clickhouse_settings: settings,
      }: {
        clickhouse_settings: Record<string, unknown>
      }) => ({
        async *stream() {
          const infinity = settings.output_format_json_quote_denormals
            ? 'inf'
            : null
          yield [
            jsonRow(['ratio']),
            jsonRow(['Nullable(Float32)']),
            jsonRow([infinity]),
            jsonRow([null]),
          ]
        },
      }),
    }),
  parseError: (text: string) => new Error(text),
}))

const { runQuery } = await import('./run')

test('a non-finite float reads apart from NULL', async () => {
  const { result } = await runQuery({
    connectionString: 'http://u:p@ch.example.com/',
    query: 'SELECT ratio FROM events',
  })
  expect(result[0]?.rows).toEqual([['inf'], [null]])
})
