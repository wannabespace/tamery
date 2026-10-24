import { SyncType } from '@tamery/shared/enums/sync-type'
import type { ShareView } from '@tamery/shared/share'
import { useQuery } from '@tanstack/react-query'

import { useConnectionContext } from '~/core/connection/route'

import { sharesQueryOptions } from './shares-query'

type ComparedView = Pick<ShareView, 'columns' | 'filters' | 'orderBy'>

// Built from named fields, so a stored view whose JSON keys came back in another order still compares equal.
const viewKey = ({ columns, filters, orderBy }: ComparedView) =>
  JSON.stringify([
    columns.map(({ id }) => id),
    filters.map(({ column, ref, values, via }) => [
      column,
      ref.operator,
      values,
      via && [via.schema, via.table, via.key, via.target],
    ]),
    Object.entries(orderBy),
  ])

export const sameShareView = (left: ComparedView, right: ComparedView) =>
  viewKey(left) === viewKey(right)

export const useTableShare = (schema: string, table: string) => {
  const { connection, connectionResource } = useConnectionContext()
  const { data: shares = [], isSuccess } = useQuery(sharesQueryOptions)

  return {
    loaded: isSuccess,
    shares: shares.filter(
      (entry) =>
        entry.connectionResourceId === connectionResource.id &&
        entry.schema === schema &&
        entry.table === table
    ),
    synced: connection.syncType === SyncType.Cloud,
  }
}
