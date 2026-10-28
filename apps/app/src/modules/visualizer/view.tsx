import { useQuery } from '@tanstack/react-query'
import { ReactFlowProvider } from '@xyflow/react'
import { useSubscription } from 'seitu/react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { diagramDraftsStore } from '~/core/drafts/diagram'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import { resourceColumnsQueryOptions } from '~/core/queries/tables/columns'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { TableError } from '~/core/table/table-error'

import { Visualizer } from './components/visualizer'
import { VisualizerRefresh } from './visualizer-refresh'
import { VisualizerSkeleton } from './visualizer-skeleton'

const VisualizerTab = () => {
  const { connection, connectionResource, dialect } = useConnectionContext()
  const { data: tables, error: tablesError } = useQuery({
    ...resourceTablesAndSchemasQueryOptions({ connectionResource }),
    select: (data) =>
      data.schemas.flatMap(({ name, tables: entries }) =>
        entries.map((table) => ({
          schema: name,
          table: table.name,
          type: table.type,
        }))
      ),
  })
  const { data: columns, error: columnsError } = useQuery(
    resourceColumnsQueryOptions({ connectionResource })
  )
  const { data: constraints, error: constraintsError } = useQuery(
    resourceConstraintsQueryOptions({ connectionResource })
  )

  const hasDrafts = useSubscription(diagramDraftsStore(connectionResource.id), {
    selector: (state) => state.drafts.length > 0,
  })

  if (!tables || !constraints || !columns) {
    const error = tablesError ?? columnsError ?? constraintsError
    if (error) {
      return <TableError error={error} />
    }
    return (
      <VisualizerSkeleton
        drafts={hasDrafts}
        schemaPicker={
          getCapabilities(dialect).flags.includes('schemas') &&
          (!tables || new Set(tables.map(({ schema }) => schema)).size > 1)
        }
      />
    )
  }

  return (
    <ReactFlowProvider key={connection.id}>
      <Visualizer tables={tables} columns={columns} constraints={constraints} />
    </ReactFlowProvider>
  )
}

export const visualizerView = {
  Content: VisualizerTab,
  Refresh: VisualizerRefresh,
}
