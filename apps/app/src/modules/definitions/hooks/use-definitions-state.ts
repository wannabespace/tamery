import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getSectionCapabilities } from '~/core/catalog/section-capabilities'
import type { DefinitionsSection } from '~/core/catalog/sections'
import { useConnectionContext, useTabSearch } from '~/core/connection/route'
import type { RelationKind } from '~/core/queries/tables/list'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import type { QueryParams } from '~/core/runtime/query'
import { connectionResourceToQueryParams } from '~/core/runtime/query'

const noTables: string[] = []

export type RunQuery = <T>(query: {
  run: (params: QueryParams) => Promise<T>
}) => Promise<T>

export const useDefinitionsState = ({
  section,
}: {
  section: DefinitionsSection
}) => {
  const { connectionResource, defaultSchema, dialect } = useConnectionContext()
  const { data, isPending: structurePending } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const schemas = data?.schemas.map(({ name }) => name) ?? []
  const linkedSchema = useTabSearch({ select: (search) => search.schema })
  const [pickedSchema, setPickedSchema] = useState<string>()
  const [search, setSearch] = useState('')
  const selectedSchema =
    [linkedSchema, pickedSchema, defaultSchema].find(
      (schema) => schema && schemas.includes(schema)
    ) ?? schemas[0]
  const getRelationNames = (schema: string, kind: RelationKind) =>
    data?.schemas
      .find(({ name }) => name === schema)
      ?.tables.filter((table) => table.type === kind)
      .map((table) => table.name)
      .toSorted() ?? noTables

  const run: RunQuery = async (query) =>
    query.run(await connectionResourceToQueryParams(connectionResource))

  return {
    can: getSectionCapabilities(section, dialect),
    connectionResource,
    dialect,
    getRelationNames,
    run,
    schemas,
    search,
    section,
    selectedSchema,
    setSearch,
    setSelectedSchema: setPickedSchema,
    structurePending,
  }
}

export type DefinitionsState = ReturnType<typeof useDefinitionsState>
