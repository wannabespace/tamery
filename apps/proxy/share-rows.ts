import { MemoryRateLimiter } from '@orpc/ratelimit/memory'
import { ORPCError } from '@orpc/server'
import { executors } from '@tamery/connection/queries/executors'
import { coldDialect, toQueryPayload } from '@tamery/connection/queries/kysely'
import { selectPage } from '@tamery/connection/queries/select-page'
import { filterValueBindings } from '@tamery/connection/queries/value-binding'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import type { ShareRefresh } from '@tamery/shared/enums/share-refresh'
import { SHARE_REFRESH_MS } from '@tamery/shared/enums/share-refresh'
import type { ShareView } from '@tamery/shared/share'
import { unsupported } from '@tamery/shared/unsupported'
import { LRUCache } from 'lru-cache'

import { assertReachable } from '~/public-host'

const MAX_CACHED_BYTES = 64 * 1024 * 1024
const DATABASE_READS_PER_MINUTE = 60

interface ShareRead {
  connectionString: string
  dialect: Dialect
  limit: number
  offset: number
  view: ShareView
}

export const readShareRows = async (read: ShareRead) => {
  const { dialect, view } = read
  if (!isSqlDialect(dialect)) {
    return unsupported('Sharing')()
  }
  await assertReachable(read.connectionString)
  const compiled = selectPage(
    coldDialect(dialect),
    {
      filters: view.filters,
      limit: read.limit,
      offset: read.offset,
      orderBy: view.orderBy,
      schema: view.schema,
      select: view.columns.map(({ id }) => id),
      table: view.table,
    },
    filterValueBindings[dialect]?.(view.columnTypes)
  ).compile()
  const { result } = await executors[dialect].execute({
    connectionString: read.connectionString,
    ...toQueryPayload(dialect, compiled),
  })

  return { fetchedAt: new Date(), rows: result[0]?.rows ?? [] }
}

const databaseReads = new MemoryRateLimiter({
  maxRequests: DATABASE_READS_PER_MINUTE,
  window: 60 * 1000,
})

const pages = new LRUCache<
  string,
  Awaited<ReturnType<typeof readShareRows>>,
  { read: ShareRead; shareId: string }
>({
  fetchMethod: async (_key, stale, { context: { read, shareId } }) => {
    const { success } = await databaseReads.limit(shareId)
    if (!success) {
      if (stale) {
        return stale
      }
      throw new ORPCError('TOO_MANY_REQUESTS')
    }
    return readShareRows(read)
  },
  maxSize: MAX_CACHED_BYTES,
  sizeCalculation: ({ rows }) => JSON.stringify(rows).length,
})

export const readCachedShareRows = (
  share: { id: string; refresh: ShareRefresh; updatedAt: Date },
  read: ShareRead
) =>
  pages.forceFetch(
    JSON.stringify([share.id, share.updatedAt, read.limit, read.offset]),
    {
      context: { read, shareId: share.id },
      ttl: SHARE_REFRESH_MS[share.refresh],
    }
  )
