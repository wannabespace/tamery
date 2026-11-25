import { describe, expect, mock, test } from 'bun:test'

mock.module('@tamery/db', () => ({ db: {} }))
mock.module('~/lib/redis', () => ({ redis: {}, redisSubscriber: {} }))
mock.module('~/orpc', () => ({ authMiddleware: {}, orpc: {} }))

const { syncDiff } = await import('./sync')

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms)
const uuid = (n: number) => `0190a000-0000-7000-8000-00000000000${n}`

const diff = async (
  server: { id: string; updatedAt: Date }[],
  client: { id: string; updatedAt: Date }[]
) => {
  const requested: string[][] = []
  const result = await syncDiff({
    input: client,
    queries: {
      rows: (ids) => {
        requested.push(ids)
        return Promise.resolve(server.filter((row) => ids.includes(row.id)))
      },
      versions: () => Promise.resolve(server),
    },
  })
  return {
    missingIds: result.missingIds,
    newIds: result.newItems.map((row) => row.id),
    requested,
    updatedIds: result.updatedItems.map((row) => row.id),
  }
}

describe('syncDiff', () => {
  test('sends only what the client lacks, fetching rows for changed ids alone', async () => {
    const server = [
      { id: uuid(1), updatedAt: at(0) },
      { id: uuid(2), updatedAt: at(1) },
      { id: uuid(3), updatedAt: at(0) },
    ]
    const client = [
      { id: uuid(1), updatedAt: at(0) },
      { id: uuid(2), updatedAt: at(0) },
      { id: uuid(4), updatedAt: at(0) },
    ]

    expect(await diff(server, client)).toEqual({
      missingIds: [uuid(4)],
      newIds: [uuid(3)],
      requested: [[uuid(2), uuid(3)]],
      updatedIds: [uuid(2)],
    })
  })

  test('a client version newer than the server is not an update', async () => {
    expect(
      await diff(
        [{ id: uuid(1), updatedAt: at(0) }],
        [{ id: uuid(1), updatedAt: at(5) }]
      )
    ).toEqual({ missingIds: [], newIds: [], requested: [], updatedIds: [] })
  })

  test('a cold client gets every row as an insert', async () => {
    const server = [
      { id: uuid(1), updatedAt: at(0) },
      { id: uuid(2), updatedAt: at(0) },
    ]

    expect(await diff(server, [])).toEqual({
      missingIds: [],
      newIds: [uuid(1), uuid(2)],
      requested: [[uuid(1), uuid(2)]],
      updatedIds: [],
    })
  })
})
