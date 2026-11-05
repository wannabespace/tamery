import { CLIENT_IP_HEADER } from '@tamery/shared/constants'
import { hasErrorCode } from '@tamery/shared/orpc-error'
import {
  SHARE_PAGE_SIZE,
  shareAccessErrors,
  shareCheckInput,
  sharePage,
  shareToken,
  shareUnlockErrors,
} from '@tamery/shared/share'
import { silently, toError } from '@tamery/shared/utils'
import { type } from 'arktype'
import { Result } from 'better-result'

import { createApiClient } from '~/api-client'
import { authMiddleware, orpc } from '~/orpc'
import { PRIVATE_HOST_MESSAGE } from '~/public-host'
import { readCachedShareRows, readShareRows } from '~/share-rows'

const proxyApi = createApiClient({})

const shareAccess = type({
  id: 'string.uuid',
  token: shareToken.or('null'),
})

export const shares = {
  check: orpc
    .use(authMiddleware)
    .input(shareCheckInput)
    .errors({
      PRIVATE_HOST: {
        message:
          'Shared tables are read from Tamery’s servers, which reach only databases on the internet. This connection’s host is local or on a private network.',
      },
      UNREACHABLE: { message: 'Tamery’s servers could not read this table.' },
    })
    .handler(async ({ context, errors, input }) => {
      const { dialect, resourceId, ...view } = input
      const connectionString = await createApiClient({
        authorization: context.headers.get('authorization'),
        cookie: context.headers.get('cookie'),
      }).internal.proxy.resolveConnectionString({ resourceId })

      const read = await Result.tryPromise(() =>
        readShareRows({
          connectionString,
          dialect,
          limit: 1,
          offset: 0,
          view,
        })
      )

      if (read.isErr()) {
        const { message } = toError(read.error.cause)
        throw message === PRIVATE_HOST_MESSAGE
          ? errors.PRIVATE_HOST()
          : errors.UNREACHABLE({
              message: `Tamery’s servers could not read this table: ${message}`,
            })
      }
    }),
  info: orpc
    .input(shareAccess)
    .errors(shareAccessErrors)
    .handler(async ({ input }) => {
      const share = await proxyApi.internal.shares.resolve({
        ...input,
        unlock: null,
      })
      return {
        description: share.description,
        filters: share.view.filters,
        name: share.name,
      }
    }),
  rows: orpc
    .input(shareAccess.merge({ page: sharePage }))
    .errors({
      ...shareAccessErrors,
      UNAVAILABLE: {
        message: 'This table cannot be loaded right now. Try again later.',
      },
    })
    .handler(async ({ errors, input: { page, ...access } }) => {
      const share = await proxyApi.internal.shares.resolve({
        ...access,
        unlock: null,
      })
      const view = { ...share.view, schema: share.schema, table: share.table }
      const isShown = (column: string) =>
        view.columns.some((shown) => shown.id === column)
      const base = {
        columns: view.columns,
        orderBy: Object.fromEntries(
          Object.entries(view.orderBy).filter(([column]) => isShown(column))
        ),
        refresh: share.refresh,
      }

      const offset = (page - 1) * SHARE_PAGE_SIZE
      const remaining = share.maxRows - offset
      if (remaining <= 0) {
        return { ...base, fetchedAt: new Date(), hasMore: false, rows: [] }
      }
      const pageLimit = Math.min(SHARE_PAGE_SIZE, remaining)
      const read = await Result.tryPromise(() =>
        readCachedShareRows(share, {
          connectionString: share.connectionString,
          dialect: share.dialect,
          limit: pageLimit + 1,
          offset,
          view,
        })
      )

      if (read.isErr() && hasErrorCode(read.error.cause, 'TOO_MANY_REQUESTS')) {
        throw read.error.cause
      }

      const failing = read.isErr()

      // Only the owner's own first page reports, so no viewer's deeper page can mark the share failing.
      if (page === 1 && failing !== (share.failingSince !== null)) {
        await silently(() =>
          proxyApi.internal.shares.report({ failing, id: access.id })
        )
      }

      if (read.isErr()) {
        throw errors.UNAVAILABLE({ cause: read.error.cause })
      }

      return {
        ...base,
        fetchedAt: read.value.fetchedAt,
        hasMore:
          remaining > SHARE_PAGE_SIZE && read.value.rows.length > pageLimit,
        rows: read.value.rows.slice(0, pageLimit),
      }
    }),
  unlock: orpc
    .input(type({ id: 'string.uuid', password: 'string > 0' }))
    .errors(shareUnlockErrors)
    .handler(async ({ context, input: { id, password } }) => {
      const { token } = await proxyApi.internal.shares.resolve({
        id,
        token: null,
        unlock: {
          client: context.headers.get(CLIENT_IP_HEADER) ?? 'unknown',
          password,
        },
      })
      return { token }
    }),
}
