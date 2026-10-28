import type { AppUIMessage } from '@tamery/ai/message'
import type { ChatTools } from '@tamery/ai/tools'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { downloadFile, toCSV } from '@tamery/shared/files'
import { FILTERS_LIST } from '@tamery/shared/filters'
import { valueToText } from '@tamery/shared/value-text'
import { isToolUIPart } from 'ai'

import { resolveResource } from '~/core/agent/target'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'
import { openRunnerTab } from '~/modules/runner/lib/new-query'
import { runnerPageStore, setQuery } from '~/modules/runner/lib/store'
import {
  getShareRequestKey,
  shareRequests,
} from '~/modules/share/share-requests'
import { tablePageStore } from '~/modules/table/lib/store'

import { agentModeValue } from './stores'

type Input<K extends keyof ChatTools> = ChatTools[K]['input']

const show = (resourceId: string, tabId: string) => {
  openTab(resourceId, tabId)
  agentModeValue.set(false)
  history.push(`/connection/${resourceId}/${encodeURIComponent(tabId)}`)
}

/** What the agent does in the app rather than in a database. Each opens or exports something for the user; none saves or changes data. */
export const appActions = {
  createShare: ({ schema, table, ...target }: Input<'create_share'>) => {
    const { resource } = resolveResource(target)
    show(resource.id, tableTabId(schema, table))
    shareRequests.set(getShareRequestKey(resource.id, schema, table))
    posthog.capture('ai_chat_app_action', { action: 'create_share' })
    return { opened: true }
  },
  exportResult: (
    messages: AppUIMessage[],
    { format, toolCallId }: Input<'export_result'>
  ) => {
    const part = messages
      .flatMap(({ parts }) => parts)
      .find(
        (candidate) =>
          isToolUIPart(candidate) && candidate.toolCallId === toolCallId
      )
    if (
      !(
        part &&
        (part.type === 'tool-query' || part.type === 'tool-execute') &&
        part.state === 'output-available'
      )
    ) {
      throw new Error(
        `No query result "${toolCallId}" in this chat. Run the query again and export that one.`
      )
    }
    const [set] = part.output
    const records = (set?.rows ?? []).map((row) =>
      Object.fromEntries(
        (set?.columns ?? []).map((column, index) => [column, row[index]])
      )
    )
    if (format === 'csv') {
      downloadFile(
        toCSV(
          (set?.columns ?? []).map((key) => ({ key })),
          records
        ),
        'result.csv',
        'text/csv;charset=utf-8;'
      )
    } else {
      downloadFile(valueToText(records, 2), 'result.json', 'application/json')
    }
    posthog.capture('ai_chat_app_action', { action: 'export_result', format })
    return { exported: records.length }
  },
  openQuery: ({ sql, ...target }: Input<'open_query'>) => {
    const { connection, resource } = resolveResource(target)
    const tabId = openRunnerTab(resource.id)
    setQuery(
      runnerPageStore({
        dialect: getDialect(connection.type),
        resourceId: resource.id,
        tabId,
      }),
      sql
    )
    show(resource.id, tabId)
    posthog.capture('ai_chat_app_action', { action: 'open_query' })
    return { opened: true }
  },
  openTable: ({
    filters,
    orderBy,
    schema,
    table,
    ...target
  }: Input<'open_table'>) => {
    const { resource } = resolveResource(target)
    tablePageStore({ id: resource.id, schema, table }).set((state) => ({
      ...state,
      filters: filters.flatMap(({ column, operator, values }) => {
        const ref = FILTERS_LIST.find((filter) => filter.operator === operator)
        return ref ? [{ column, ref, values }] : []
      }),
      orderBy: Object.fromEntries(
        orderBy.map(({ column, direction }) => [column, direction])
      ),
    }))
    show(resource.id, tableTabId(schema, table))
    posthog.capture('ai_chat_app_action', {
      action: 'open_table',
      filters: filters.length,
    })
    return { opened: true }
  },
}
