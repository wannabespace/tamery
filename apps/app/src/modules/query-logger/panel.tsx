import { lazy, Suspense } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import type { Panel } from '~/lib/panels'
import { resourcePanelClassName } from '~/shell'

import { loggerOpen } from './logger-open'
import { QueryLoggerSkeleton } from './query-logger-skeleton'

const QueryLogger = lazy(async () => {
  const { QueryLogger: component } = await import('./query-logger')

  return { default: component }
})

const QueryLoggerPanel = () => {
  const { connectionResource, dialect } = useConnectionContext()

  return (
    <div className="flex h-full flex-col pt-1.5">
      <div className={resourcePanelClassName}>
        <Suspense fallback={<QueryLoggerSkeleton />}>
          <QueryLogger
            connectionResource={connectionResource}
            dialect={dialect}
          />
        </Suspense>
      </div>
    </div>
  )
}

export const queryLoggerPanel: Panel = {
  Component: QueryLoggerPanel,
  defaultSize: 240,
  id: 'query-logger',
  label: 'query logger',
  maxSize: '60%',
  minSize: 120,
  open: loggerOpen,
  region: 'bottom',
}
